import { $, api, escape, toast } from './ui.js';
import { project } from './project.js';
import { mountSettings, restoreForms, locale } from '/shared/settings.js';
const app=document.body.dataset.app;
async function boot() {
  mountSettings();
  if(app==='about')return;
  const config=project??await api('/api/config');
  const nav=config.apps.map(([slug,name])=>`<a href="/${slug}/"${slug===app?' aria-current="page"':''}>${escape(name)}</a>`).join('');
  $('#navigation').innerHTML=nav;
  if(config.apps.length===1)document.querySelector('.site-menu').hidden=true;
  if(app==='home') {
    $('#app').innerHTML=`<section class="home-intro"><div><p class="eyebrow">ДЕВЯТЬ ПОВОДОВ ОТВЛЕЧЬСЯ</p><h1>У тебя есть<br>минутка<span class="orange">?</span></h1><p class="lede">Порисуй, поспорь, придумай подпись.<br>Маленькие развлечения для большого перерыва.</p><a class="button" href="/caption/">Начать с подписи дня <span aria-hidden="true">↗</span></a></div><div class="home-art" aria-hidden="true"><div class="art-orbit"></div><div class="art-square">m.</div><span class="art-note">дела подождут<br>ровно минуту</span><span class="art-star">✳</span></div></section><section class="app-grid" aria-label="Все развлечения">${config.apps.map(([slug,name,description,,number])=>`<a class="app-card theme-${slug}" href="/${slug}/"><div class="card-top"><span class="small">${number} /</span><span class="card-symbol" aria-hidden="true">${{caption:'“ ”',majority:'½',arena:'vs',memory:'↶',papers:'§',decide:'?',house:'▦',minute:'60',finds:'!'}[slug]}</span><span class="card-arrow" aria-hidden="true">↗</span></div><h2>${name}</h2><p>${description}</p></a>`).join('')}</section><p class="home-note">Без регистрации. Без установки. Просто открой и попробуй.</p>`;
  } else if(app==='mischief') {
    const {mount}=await import('/locales/ru/mischief/app.js');await mount(config);
  } else if(app==='admin') {
    const {mount}=await import('/locales/ru/admin/app.js');await mount(config);
  } else {
    const item=config.apps.find(([slug])=>slug===app);
    if(!item)throw new Error('Раздел не найден.');
    const facts={caption:'Новая картинка каждый день',majority:'12 необычных вопросов',arena:'Один победитель в каждой паре',memory:'30 секунд на рисунок',papers:'3 документа с характером',decide:'Твой вопрос. Общий выбор.',house:'16 × 16 пикселей для себя',minute:'25 слов. Одно лишнее.',finds:'Маленькие открытия каждый день'};
    $('#hero').innerHTML=`${config.apps.length>1?'<a class="back" href="/">← Все развлечения</a>':''}<div class="title-row"><div><p class="eyebrow">МИНУТА КЛУБ / ${item[4]}</p><h1>${escape(item[1])}</h1><p class="lede">${escape(item[2])}</p><div class="hero-context"><span class="context-symbol" aria-hidden="true">✳</span><span>${facts[app]}</span></div></div><span class="hero-symbol" aria-hidden="true">${{caption:'“',majority:'½',arena:'vs',memory:'↶',papers:'§',decide:'?',house:'▦',minute:'60',finds:'!'}[app]}</span></div>`;
    const {mount}=await import(`/locales/ru/${app}/app.js`);await mount(config);
  }
}
boot().then(restoreForms).catch(error=>{toast(error.message);$('#app').innerHTML='<div class="empty panel"><h2>Не удалось загрузить</h2><p>Проверьте соединение и попробуйте ещё раз.</p><button id="reload">Повторить</button></div>';$('#reload').onclick=()=>location.reload();});
