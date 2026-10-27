// Blocking, tiny, and local: apply the saved or system theme before styles paint.
(() => {
  let saved={};try{saved=JSON.parse(localStorage.getItem('minute:preferences'))??{};}catch{}
  const supported=['en','es','ru'];
  const preferred=(navigator.languages?.length?navigator.languages:[navigator.language]).map(value=>String(value).toLowerCase().split(/[-_]/)[0]);
  const language=supported.includes(saved.language)?saved.language:preferred.find(value=>supported.includes(value))??'en';
  const choice=['light','dark','system'].includes(saved.theme)?saved.theme:'system';
  const theme=choice==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):choice;
  document.documentElement.dataset.theme=theme;
  document.documentElement.lang=language;
  document.documentElement.style.colorScheme=theme;
  document.documentElement.dataset.languageLoading='true';
})();
