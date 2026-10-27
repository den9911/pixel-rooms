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
    $('#app').innerHTML=`<section class="home-intro"><div><p class="eyebrow">NUEVE MOTIVOS PARA DESCONECTAR</p><h1>¿Tienes un<br>minuto<span class="orange">?</span></h1><p class="lede">Dibuja, debate, inventa un subtítulo.<br>Pequeños juegos para una buena pausa.</p><a class="button" href="/caption/">Empieza con la imagen del día <span aria-hidden="true">↗</span></a></div><div class="home-art" aria-hidden="true"><div class="art-orbit"></div><div class="art-square">m.</div><span class="art-note">las tareas pueden esperar<br>solo un minuto</span><span class="art-star">✳</span></div></section><section class="app-grid" aria-label="Todos los juegos">${config.apps.map(([slug,name,description,,number])=>`<a class="app-card theme-${slug}" href="/${slug}/"><div class="card-top"><span class="small">${number} /</span><span class="card-symbol" aria-hidden="true">${{caption:'“ ”',majority:'½',arena:'vs',memory:'↶',papers:'§',decide:'?',house:'▦',minute:'60',finds:'!'}[slug]}</span><span class="card-arrow" aria-hidden="true">↗</span></div><h2>${name}</h2><p>${description}</p></a>`).join('')}</section><p class="home-note">Sin registro. Sin instalación. Entra y prueba.</p>`;
  } else if(app==='mischief') {
    const {mount}=await import('/locales/es/mischief/app.js');await mount(config);
  } else if(app==='admin') {
    const {mount}=await import('/locales/es/admin/app.js');await mount(config);
  } else {
    const item=config.apps.find(([slug])=>slug===app);
    if(!item)throw new Error('Sección no encontrada.');
    const facts={caption:'Una imagen nueva cada día',majority:'12 preguntas originales',arena:'Un ganador en cada pareja',memory:'30 segundos para dibujar',papers:'3 documentos con personalidad',decide:'Tu pregunta. Una decisión compartida.',house:'16 × 16 píxeles para ti',minute:'25 palabras. Una diferente.',finds:'Pequeños descubrimientos cada día'};
    $('#hero').innerHTML=`${config.apps.length>1?'<a class="back" href="/">← Todos los juegos</a>':''}<div class="title-row"><div><p class="eyebrow">CLUB MINUTO / ${item[4]}</p><h1>${escape(item[1])}</h1><p class="lede">${escape(item[2])}</p><div class="hero-context"><span class="context-symbol" aria-hidden="true">✳</span><span>${facts[app]}</span></div></div><span class="hero-symbol" aria-hidden="true">${{caption:'“',majority:'½',arena:'vs',memory:'↶',papers:'§',decide:'?',house:'▦',minute:'60',finds:'!'}[app]}</span></div>`;
    const {mount}=await import(`/locales/es/${app}/app.js`);await mount(config);
  }
}
boot().then(restoreForms).catch(error=>{toast(error.message);$('#app').innerHTML='<div class="empty panel"><h2>No se ha podido cargar</h2><p>Comprueba tu conexión e inténtalo de nuevo.</p><button id="reload">Reintentar</button></div>';$('#reload').onclick=()=>location.reload();});
