import { resolveLanguage, resolveTheme } from '/shared/preferences-model.js';

export const locale=document.documentElement.lang;
const labels={en:{language:'Language',theme:'Color theme',system:'System',light:'Light',dark:'Dark'},es:{language:'Idioma',theme:'Tema de color',system:'Sistema',light:'Claro',dark:'Oscuro'},ru:{language:'Язык',theme:'Цветовая тема',system:'Системная',light:'Светлая',dark:'Тёмная'}};
function read(){try{return JSON.parse(localStorage.getItem('minute:preferences'))??{};}catch{return {};}}
function save(value){try{localStorage.setItem('minute:preferences',JSON.stringify(value));}catch{}}
function apply(theme){const actual=resolveTheme(theme,matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=actual;document.documentElement.style.colorScheme=actual;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',actual==='dark'?'#101b23':'#f6f3eb');}
const draftKey=()=>`minute:form:${location.pathname}`;
function saveForms(){
  const fields=[...document.querySelectorAll('input,textarea,select')].filter(el=>!el.closest('.preferences')&&!['password','file','hidden'].includes(el.type));
  const entries=fields.filter(el=>el.id||el.name).map(el=>({id:el.id,name:el.name,value:el.value,checked:el.checked}));
  try{sessionStorage.setItem(draftKey(),JSON.stringify(entries));}catch{}
}
export function restoreForms(){
  let fields;try{fields=JSON.parse(sessionStorage.getItem(draftKey()));sessionStorage.removeItem(draftKey());}catch{}
  if(!Array.isArray(fields))return;
  for(const entry of fields){const el=entry.id?document.getElementById(entry.id):[...document.querySelectorAll('[name]')].find(el=>el.name===entry.name);if(!el||el.closest('.preferences'))continue;el.value=entry.value;if(el.type==='checkbox')el.checked=entry.checked;el.dispatchEvent(new Event('input',{bubbles:true}));}
}
export function mountSettings(){
  const host=document.getElementById('preferences');if(!host)return;
  const copy=labels[locale]??labels.en,saved=read();
  host.innerHTML=`<label class="preference-field"><span>${copy.language}</span><select id="language-choice" aria-label="${copy.language}"><option value="en" lang="en">English</option><option value="es" lang="es">Español</option><option value="ru" lang="ru">Русский</option></select></label><label class="preference-field theme-field"><span>${copy.theme}</span><select id="theme-choice" aria-label="${copy.theme}"><option value="system">◐ ${copy.system}</option><option value="light">☀ ${copy.light}</option><option value="dark">☾ ${copy.dark}</option></select></label>`;
  const lang=document.getElementById('language-choice'),theme=document.getElementById('theme-choice');
  lang.value=locale;theme.value=['system','light','dark'].includes(saved.theme)?saved.theme:'system';
  apply(theme.value);
  theme.addEventListener('change',()=>{save({...read(),theme:theme.value});apply(theme.value);});
  lang.addEventListener('change',()=>{const language=resolveLanguage(lang.value);saveForms();window.dispatchEvent(new Event('minute:preferences-changing'));save({...read(),language});location.reload();});
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if((read().theme??'system')==='system')apply('system');});
  window.addEventListener('storage',e=>{if(e.key==='minute:preferences'){const value=read();theme.value=value.theme??'system';apply(theme.value);}});
}
