const language=document.documentElement.lang;
const locale=['en','ru'].includes(language)?language:'en';
try{
  const path=location.pathname.endsWith('/')?`${location.pathname}index.html`:location.pathname;
  const response=await fetch(`/locales/${locale}/pages${path}`);
  if(!response.ok)throw new Error('Unable to load language assets');
  const page=new DOMParser().parseFromString(await response.text(),'text/html');
  document.title=page.title;
  document.querySelector('meta[name="description"]')?.setAttribute('content',page.querySelector('meta[name="description"]')?.content??'');
  document.body.replaceWith(page.body);
  await import(`/locales/${locale}/shared/main.js`);
}catch(error){
  const target=document.getElementById('app')??document.body;
  target.textContent=({en:'Unable to load. Please reload the page.',ru:'Не удалось загрузить. Обновите страницу.'})[locale];
  console.error(error);
}finally{delete document.documentElement.dataset.languageLoading;}
