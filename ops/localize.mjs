import { readFile, writeFile, readdir, mkdir, rm } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceRoot=fileURLToPath(new URL('../',import.meta.url));
const rows=(await readFile(resolve(sourceRoot,'i18n/catalog.tsv'),'utf8')).split('\n').filter(line=>line&&!line.startsWith('#')).map(line=>line.split('|'));
for(const row of rows)if(row.length!==3||row.some(value=>!value))throw new Error(`Invalid translation row: ${row[0]}`);
const unique=new Set();for(const [key] of rows){if(unique.has(key))throw new Error(`Duplicate translation: ${key}`);unique.add(key);}
const sorted=[...rows].sort((a,b)=>b[0].length-a[0].length);
const expression=new RegExp(sorted.map(([key])=>(/^[А-Яа-яЁё]/.test(key)?'(?<![А-Яа-яЁё])':'')+key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+(/[А-Яа-яЁё]$/.test(key)?'(?![А-Яа-яЁё])':'')).join('|'),'g');
const translations=new Map(rows.map(row=>[row[0],row]));
export function translate(source,locale,isJavaScript=false){
  if(locale==='ru')return source;
  return source.replace(expression,key=>{const result=translations.get(key)[locale==='es'?2:1];return isJavaScript?result.replaceAll("'",'\\u0027').replaceAll('`','\\u0060'):result;});
}
async function walk(root){const files=[];for(const entry of await readdir(root,{withFileTypes:true})){if(entry.name==='locales')continue;const path=resolve(root,entry.name);if(entry.isDirectory())files.push(...await walk(path));else files.push(path);}return files;}
export async function localize(root){
  const publicRoot=resolve(root,'public');
  const files=await walk(publicRoot);
  await rm(resolve(publicRoot,'locales'),{recursive:true,force:true});
  for(const locale of ['en','es','ru']){
    for(const file of files){
      const name=relative(publicRoot,file).replaceAll('\\','/');
      if(!name.endsWith('.js')||['shared/boot.js','shared/preferences.js','shared/preferences-model.js','shared/settings.js'].includes(name))continue;
      let source=await readFile(file,'utf8');
      // API/media URLs and links stay stable. Only native module imports use locale paths.
      source=source.replace(/(from\s*['"]|import\(\s*['"])(\/)(shared|admin|mischief|caption|majority|arena|memory|papers|decide|house|minute|finds)\//g,`$1/locales/${locale}/$3/`)
        .replace('import(`/${app}/app.js`)','import(`/locales/'+locale+'/${app}/app.js`)')
        .replaceAll(`/locales/${locale}/shared/settings.js`,'/shared/settings.js');
      source=translate(source,locale,true);
      if(locale!=='ru'&&/[А-Яа-яЁё]/u.test(source)){
        const leftovers=source.split('\n').filter(line=>/[А-Яа-яЁё]/u.test(line));
        throw new Error(`Missing ${locale} translations in ${name}:\n${leftovers.join('\n')}`);
      }
      const destination=resolve(publicRoot,'locales',locale,name);await mkdir(dirname(destination),{recursive:true});await writeFile(destination,source);
    }
    // The shell is localized once, before app code mounts. Never translate user DOM content.
    for(const file of files.filter(file=>file.endsWith('.html'))){
      const name=relative(publicRoot,file);let html=await readFile(file,'utf8');
      const translated=translate(html,locale).replace('<html lang="ru">',`<html lang="${locale}">`);
      if(locale!=='ru'&&/[А-Яа-яЁё]/u.test(translated))throw new Error(`Missing ${locale} translations in ${name}: ${translated.match(/[А-Яа-яЁё][^<>]*/gu)?.join('\n')}`);
      const destination=resolve(publicRoot,'locales',locale,'pages',name);await mkdir(dirname(destination),{recursive:true});await writeFile(destination,translated);
    }
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await localize(process.argv[2]??sourceRoot);
