import { $, $$, api, escape, action, toast } from '/locales/es/shared/ui.js';
export async function mount(){
  let token='';const urls=[];
  $('#hero').innerHTML='<div class="hero"><h1>Moderación</h1><p class="lede">Publicaciones pendientes y denuncias de visitantes.</p></div>';
  $('#app').innerHTML='<form id="login" class="panel stack narrow"><label>Clave de moderación<input name="token" type="password" autocomplete="off" required></label><button>Abrir la cola</button><p class="small muted">La clave permanece solo en la memoria de esta pestaña.</p></form><div id="queue" class="section-gap"></div>';
  function revoke(){urls.splice(0).forEach(url=>URL.revokeObjectURL(url));}
  async function load(){
    const data=await api('/api/admin',undefined,{Authorization:`Bearer ${token}`});revoke();
    $('#queue').innerHTML=`<div class="section-head"><h2>Pendiente de revisión</h2><span class="small muted">Archivos: ${(data.usage/1e9).toFixed(3)} / ${(data.budget/1e9).toFixed(1)} GB</span></div><div class="leader-grid">${data.posts.map(post=>`<article class="panel stack">${post.hasImage?`<img class="admin-image" data-id="${escape(post.id)}" alt="Imagen pendiente de revisión" width="400" height="300">`:''}<span class="small muted">${escape(post.kind)} · ${escape(post.status)} · denuncias: ${post.reports}</span><h3>${escape(post.title)}</h3><p>${escape(post.body)}</p>${post.reasons?`<p class="note">Denuncias: ${escape(post.reasons)}</p>`:''}<div class="row"><button class="moderate" data-id="${escape(post.id)}" data-action="approve">Aprobar</button><button class="moderate danger" data-id="${escape(post.id)}" data-action="delete">Eliminar</button></div></article>`).join('')}</div>${data.posts.length?'':'<p class="muted">La cola está vacía.</p>'}`;
    for(const img of $$('img[data-id]')){
      try{const response=await fetch(`/media/${img.dataset.id}`,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)throw new Error('Imagen no disponible');const url=URL.createObjectURL(await response.blob());urls.push(url);img.src=url;}catch(error){img.alt=error.message;}
    }
    $$('.moderate').forEach(button=>action(button,async()=>{if(button.dataset.action==='delete'&&!confirm('¿Eliminar esta publicación de forma permanente?'))return;await api('/api/admin/moderate',{id:button.dataset.id,action:button.dataset.action},{Authorization:`Bearer ${token}`});await load();toast('Hecho.');}));
  }
  action($('#login'),async()=>{token=$('#login').elements.token.value;await load();$('#login').elements.token.value='';},'submit');window.addEventListener('pagehide',revoke);
}
