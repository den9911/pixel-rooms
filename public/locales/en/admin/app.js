import { $, $$, api, escape, action, toast } from '/locales/en/shared/ui.js';
export async function mount(){
  let token='';const urls=[];
  $('#hero').innerHTML='<div class="hero"><h1>Moderation</h1><p class="lede">Pending submissions and visitor reports.</p></div>';
  $('#app').innerHTML='<form id="login" class="panel stack narrow"><label>Moderator key<input name="token" type="password" autocomplete="off" required></label><button>Open queue</button><p class="small muted">The key stays in this tab’s memory only.</p></form><div id="queue" class="section-gap"></div>';
  function revoke(){urls.splice(0).forEach(url=>URL.revokeObjectURL(url));}
  async function load(){
    const data=await api('/api/admin',undefined,{Authorization:`Bearer ${token}`});revoke();
    $('#queue').innerHTML=`<div class="section-head"><h2>Pending review</h2><span class="small muted">Media: ${(data.usage/1e9).toFixed(3)} / ${(data.budget/1e9).toFixed(1)} GB</span></div><div class="leader-grid">${data.posts.map(post=>`<article class="panel stack">${post.hasImage?`<img class="admin-image" data-id="${escape(post.id)}" alt="Image awaiting review" width="400" height="300">`:''}<span class="small muted">${escape(post.kind)} · ${escape(post.status)} · reports: ${post.reports}</span><h3>${escape(post.title)}</h3><p>${escape(post.body)}</p>${post.reasons?`<p class="note">Reports: ${escape(post.reasons)}</p>`:''}<div class="row"><button class="moderate" data-id="${escape(post.id)}" data-action="approve">Approve</button><button class="moderate danger" data-id="${escape(post.id)}" data-action="delete">Delete</button></div></article>`).join('')}</div>${data.posts.length?'':'<p class="muted">The queue is empty.</p>'}`;
    for(const img of $$('img[data-id]')){
      try{const response=await fetch(`/media/${img.dataset.id}`,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)throw new Error('Image unavailable');const url=URL.createObjectURL(await response.blob());urls.push(url);img.src=url;}catch(error){img.alt=error.message;}
    }
    $$('.moderate').forEach(button=>action(button,async()=>{if(button.dataset.action==='delete'&&!confirm('Permanently delete this post?'))return;await api('/api/admin/moderate',{id:button.dataset.id,action:button.dataset.action},{Authorization:`Bearer ${token}`});await load();toast('Done.');}));
  }
  action($('#login'),async()=>{token=$('#login').elements.token.value;await load();$('#login').elements.token.value='';},'submit');window.addEventListener('pagehide',revoke);
}
