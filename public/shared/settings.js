import { resolveLanguage, resolveTheme } from '/shared/preferences-model.js';

export const locale=document.documentElement.lang;
const labels={en:{language:'Language',theme:'Color theme',system:'System',light:'Light',dark:'Dark'},ru:{language:'Язык',theme:'Цветовая тема',system:'Системная',light:'Светлая',dark:'Тёмная'}};
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
function preferenceGroup(kind,label,options,value){
  return `<div class="preference-switch" role="group" aria-label="${label}">${options.map(([key,name,icon])=>`<button type="button" data-preference="${kind}" data-value="${key}" aria-label="${name}" title="${name}" aria-pressed="${key===value}">${icon?`<span aria-hidden="true">${icon}</span>`:name}</button>`).join('')}</div>`;
}
export function mountSettings(){
  const host=document.getElementById('preferences');if(!host)return;
  document.documentElement.style.setProperty('--project-tint',getComputedStyle(document.body).getPropertyValue('--theme').trim());
  const copy=labels[locale]??labels.en;
  let selectedTheme=['light','dark'].includes(read().theme)?read().theme:'system';
  const themeChoice=()=>selectedTheme;
  host.innerHTML=preferenceGroup('language',copy.language,[['en','English','EN'],['ru','Русский','RU']],locale)+preferenceGroup('theme',copy.theme,[['system',copy.system,'◐'],['light',copy.light,'☀'],['dark',copy.dark,'☾']],themeChoice());
  function updateTheme(){const choice=themeChoice();apply(choice);host.querySelectorAll('[data-preference="theme"]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.value===choice));}
  updateTheme();
  host.addEventListener('click',event=>{
    const button=event.target.closest('button[data-preference]');if(!button||!host.contains(button))return;
    const {preference,value}=button.dataset;
    if(preference==='theme'){selectedTheme=value;save({...read(),theme:value});updateTheme();}
    else if(value!==locale){const language=resolveLanguage(value);saveForms();window.dispatchEvent(new Event('minute:preferences-changing'));save({...read(),language});location.reload();}
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(themeChoice()==='system')updateTheme();});
  window.addEventListener('storage',e=>{if(e.key==='minute:preferences'||e.key===null){selectedTheme=['light','dark'].includes(read().theme)?read().theme:'system';updateTheme();}});
}
