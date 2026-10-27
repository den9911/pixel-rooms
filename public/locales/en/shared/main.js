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
    $('#app').innerHTML=`<section class="home-intro"><div><p class="eyebrow">NINE LITTLE REASONS TO TAKE A BREAK</p><h1>Got a<br>minute<span class="orange">?</span></h1><p class="lede">Draw, debate, write a caption.<br>Small diversions for a proper little break.</p><a class="button" href="/caption/">Start with today’s picture <span aria-hidden="true">↗</span></a></div><div class="home-art" aria-hidden="true"><div class="art-orbit"></div><div class="art-square">m.</div><span class="art-note">the to-do list can wait<br>just for a minute</span><span class="art-star">✳</span></div></section><section class="app-grid" aria-label="All diversions">${config.apps.map(([slug,name,description,,number])=>`<a class="app-card theme-${slug}" href="/${slug}/"><div class="card-top"><span class="small">${number} /</span><span class="card-symbol" aria-hidden="true">${{caption:'“ ”',majority:'½',arena:'vs',memory:'↶',papers:'§',decide:'?',house:'▦',minute:'60',finds:'!'}[slug]}</span><span class="card-arrow" aria-hidden="true">↗</span></div><h2>${name}</h2><p>${description}</p></a>`).join('')}</section><p class="home-note">No sign-up. No installation. Just jump in.</p>`;
  } else if(app==='mischief') {
    const {mount}=await import('/locales/en/mischief/app.js');await mount(config);
  } else if(app==='admin') {
    const {mount}=await import('/locales/en/admin/app.js');await mount(config);
  } else {
    const item=config.apps.find(([slug])=>slug===app);
    if(!item)throw new Error('Section not found.');
    const facts={caption:'A fresh picture every day',majority:'12 unusual questions',arena:'One winner in every pair',memory:'30 seconds to sketch',papers:'3 documents with personality',decide:'Your question. Everyone’s choice.',house:'16 × 16 pixels of your own',minute:'25 words. One odd one out.',finds:'Little discoveries, every day'};
    $('#hero').innerHTML=`${config.apps.length>1?'<a class="back" href="/">← All diversions</a>':''}<div class="title-row"><div><p class="eyebrow">MINUTE CLUB / ${item[4]}</p><h1>${escape(item[1])}</h1><p class="lede">${escape(item[2])}</p><div class="hero-context"><span class="context-symbol" aria-hidden="true">✳</span><span>${facts[app]}</span></div></div><span class="hero-symbol" aria-hidden="true">${{caption:'“',majority:'½',arena:'vs',memory:'↶',papers:'§',decide:'?',house:'▦',minute:'60',finds:'!'}[app]}</span></div>`;
    const {mount}=await import(`/locales/en/${app}/app.js`);await mount(config);
  }
}
boot().then(restoreForms).catch(error=>{toast(error.message);$('#app').innerHTML='<div class="empty panel"><h2>Unable to load</h2><p>Check your connection and try again.</p><button id="reload">Try again</button></div>';$('#reload').onclick=()=>location.reload();});
