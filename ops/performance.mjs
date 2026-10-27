import { readFile,readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
export async function performanceBudget(){
  const common=['preferences.js','preferences-model.js','settings.js','boot.js','style.css','themes.css'];
  let base=0;for(const file of common)base+=gzipSync(await readFile(`public/shared/${file}`)).length;
  const routes=['caption','majority','arena','memory','papers','decide','house','minute','finds','mischief'].filter(route=>true);
  const available=await readdir('public');const results={};
  for(const language of ['en','es','ru']){
    let shared=base;for(const file of ['main.js','ui.js','project.js','scenes.js'])shared+=gzipSync(await readFile(`public/locales/${language}/shared/${file}`)).length;
    let maximum=0;
    for(const route of routes.filter(route=>available.includes(route))){
      let bytes=shared+gzipSync(await readFile(`public/locales/${language}/${route}/app.js`)).length;
      if(!['memory','papers','mischief'].includes(route))bytes+=gzipSync(await readFile(`public/locales/${language}/shared/editorial.js`)).length;
      if(route==='mischief')bytes+=gzipSync(await readFile('public/mischief/style.css')).length;
      bytes+=gzipSync(await readFile(`public/${route}/index.html`)).length+gzipSync(await readFile(`public/locales/${language}/pages/${route}/index.html`)).length;
      maximum=Math.max(maximum,bytes);
    }
    if(maximum>34000)throw new Error(`${language} initial assets exceed 34 KB gzip budget: ${maximum}`);
    results[language]={maxInitialGzipBytes:maximum};
  }
  return results;
}
