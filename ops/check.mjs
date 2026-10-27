import { readdir, readFile, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { performanceBudget } from './performance.mjs';
const exec=promisify(execFile);
async function walk(dir){const result=[];for(const item of await readdir(dir,{withFileTypes:true})){if(['.git','data','node_modules','prepared'].includes(item.name))continue;const path=`${dir}/${item.name}`;if(item.isDirectory())result.push(...await walk(path));else result.push(path);}return result;}
const files=await walk('.');
const js=files.filter(file=>/\.(mjs|js)$/.test(file));
await exec(process.execPath,['--experimental-vm-modules','ops/syntax.mjs',...js]);
let checked=0,total=0,gz=0;
for(const file of files){
  if(/\.(mjs|js)$/.test(file))checked++;
  if(file.startsWith('./public/')){const bytes=await readFile(file);total+=bytes.length;gz+=gzipSync(bytes).length;
    if(/\.(html|css|js)$/.test(file)&&/https?:\/\//.test(bytes.toString().replaceAll('http://www.w3.org/2000/svg',''))){if(!file.endsWith('app.js')||!file.includes('/memory/'))throw new Error(`Unexpected external resource in ${file}`);}
  }
  if(file.endsWith('.html')){
    const html=await readFile(file,'utf8');
    for(const match of html.matchAll(/(?:src|href)="(\/[^"?#]*)"/g)){
      let path=resolve('public',`.${match[1]}`);if(match[1].endsWith('/'))path=resolve(path,'index.html');
      try{await stat(path);}catch{throw new Error(`Broken local reference ${match[1]} in ${file}`);}
    }
  }
}
const shared=['ui.js','scenes.js','boot.js','style.css','project.js'];
const common=await Promise.all(shared.map(file=>readFile(`public/shared/${file}`)));
const base=common.reduce((n,b)=>n+gzipSync(b).length,0);
if(base>18000)throw new Error(`Shared assets exceed 18 KB gzip budget: ${base}`);
const report={javascriptFiles:checked,publicBytes:total,publicGzipBytes:gz,sharedGzipBytes:base,languages:await performanceBudget()};
console.log(JSON.stringify(report,null,2));
