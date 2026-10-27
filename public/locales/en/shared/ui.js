export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const storage = {
  get(key, fallback = null) { try { return JSON.parse(localStorage.getItem(`minute:${key}`)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`minute:${key}`,JSON.stringify(value)); } catch { toast('Your browser could not save the draft. Download your work.'); } },
};

export function toast(message) {
  const status=$('#status');status.textContent=message;status.hidden=false;
  clearTimeout(toast.timer);toast.timer=setTimeout(()=>{status.hidden=true;},6000);
}
export async function api(path, input, headers = {}) {
  const response = await fetch(path,{method:input===undefined?'GET':'POST',headers:{...(input===undefined?{}:{'Content-Type':'application/json'}),...headers},...(input===undefined?{}:{body:JSON.stringify(input)})});
  const result=await response.json();
  const {localizeResponse,localizeError}=await import('./editorial.js');
  if (!response.ok) {const error=new Error(localizeError(result.error??'The request could not be completed.'));error.status=response.status;throw error;}
  return localizeResponse(path,result);
}
export function action(element, handler, event='click') {
  element.addEventListener(event,async e=>{
    e.preventDefault();
    const buttons=element.matches('form')?$$('button',element):[element];
    buttons.forEach(button=>button.disabled=true);
    try { await handler(e); }
    catch(error) { toast(error.message??'That did not work. Please try again.'); }
    finally {buttons.forEach(button=>{if(button.isConnected)button.disabled=button.dataset.lock==='true';});}
  });
}
export async function share(url = location.href, title = document.title, text = '') {
  try {
    if (navigator.share) await navigator.share({url,title,text});
    else {await navigator.clipboard.writeText([text,url].filter(Boolean).join('\n'));toast('Link copied. Send it to a friend.');}
  } catch(error) { if(error.name!=='AbortError') { $('#share-fallback')?.remove();const input=document.createElement('input');input.id='share-fallback';input.value=url;input.readOnly=true;input.setAttribute('aria-label','Link to copy');$('#app').append(input);input.select();toast('Copy the link from the field.'); } }
}
export function download(canvas, filename) {
  canvas.toBlob(blob=>{
    if(!blob)return toast('Could not create the image.');
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  },'image/png');
}

/** Decode and re-encode locally: strips metadata, limits dimensions, and sends no original file. */
export async function compressImage(file) {
  if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Choose JPEG, PNG, or WebP. Animation is not supported yet.');
  if (file.size>12_000_000) throw new Error('The original image must be smaller than 12 MB.');
  const bitmap=await createImageBitmap(file);
  try {
    if (bitmap.width*bitmap.height>40_000_000) throw new Error('The image resolution is too large.');
    const canvas=document.createElement('canvas');
    const ratio=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));
    canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    for (const quality of [0.84,0.7,0.55,0.4]) {
      const data=canvas.toDataURL('image/webp',quality);
      const bytes=Math.floor((data.length-data.indexOf(',')-1)*3/4);
      if(bytes<=500_000) return {data,bytes};
    }
    throw new Error('Could not compress to 500 KB. Choose a smaller picture.');
  } finally { bitmap.close(); }
}

export function imageUpload(form) {
  const file=$('[type=file]',form),preview=$('.upload-preview',form),status=$('.upload-status',form);
  let image=null,working=false;
  file.addEventListener('change',async()=>{
    image=null;working=true;preview.hidden=true;status.textContent='Compressing on your device…';
    try {const result=await compressImage(file.files[0]);image=result.data;preview.src=image;preview.hidden=false;status.textContent=`Ready: ${Math.ceil(result.bytes/1000)} KB. The original stays on your device.`;}
    catch(error){status.textContent=error.message;file.value='';}
    finally{working=false;}
  });
  return ()=>{if(working)throw new Error('Please wait for the image to finish compressing.');if(!image)throw new Error('Add a picture first.');return image;};
}
export function uploadForm(kind) {
  return `<form id="upload" class="panel stack"><h2>${kind==='arena'?'A new contender':'A new discovery'}</h2><label>Title<input name="title" maxlength="120" required placeholder="What is happening here?"></label><label>A little context<textarea name="body" maxlength="400" rows="2" placeholder="Optional"></textarea></label>${kind==='finds'?'<label>Category<select name="category"><option value="\u0412\u044b\u0432\u0435\u0441\u043a\u0438">Signs</option><option value="\u041e\u0431\u044a\u044f\u0432\u043b\u0435\u043d\u0438\u044f">Notices</option><option value="\u041f\u0440\u0435\u0434\u043c\u0435\u0442\u044b">Objects</option><option value="\u0414\u0440\u0443\u0433\u043e\u0435">Other</option></select></label>':''}<label class="file-drop">Choose a picture<input type="file" accept="image/jpeg,image/png,image/webp" required></label><img class="upload-preview" alt="Upload preview" width="400" height="240" hidden><p class="upload-status muted">JPEG, PNG or WebP. We will compress to 500 KB right here.</p><button type="submit">Submit for review <span aria-hidden="true">↗</span></button><p class="small muted">Share your own work or material you have permission to publish.</p></form>`;
}
export function wireUpload(kind) {
  const form=$('#upload'),image=imageUpload(form);
  action(form,async()=>{
    const fields=Object.fromEntries(new FormData(form));
    await api('/api/posts',{...fields,kind,image:image()});
    form.reset();$('.upload-preview',form).hidden=true;$('.upload-status',form).textContent='Submitted. It will appear after review.';toast('Received! A moderator will take a look.');
  },'submit');
}
export function reportButton(id) {return `<button class="text-button report" data-id="${escape(id)}" aria-label="Report this post">Report</button>`;}
export function wireReports() {
  $$('.report').forEach(button=>action(button,async()=>{
    const reason=prompt('What is wrong with this post? Up to 200 characters.');
    if(!reason?.trim())return;
    await api('/api/report',{id:button.dataset.id,reason});toast('Thank you. A moderator will review the post.');
  }));
}
export function memeCard(post, button = true) {
  return `<article class="meme panel ${post.hasImage?'':'meme-text'}" data-seed="${escape(post.id)}">${post.hasImage?`<img src="/media/${escape(post.id)}" loading="lazy" width="480" height="320" alt="${escape(post.title)}">`:`<div class="meme-poster"><p>${escape(post.title)}</p><div class="poster-face" aria-hidden="true">:)</div><p>${escape(post.body)}</p></div>`}${post.hasImage?`<h3>${escape(post.title)}</h3><p>${escape(post.body)}</p>`:''}${button?`<button class="pick" data-id="${escape(post.id)}">This one wins <span aria-hidden="true">↗</span></button>`:`<p class="small muted">Wins: ${post.votes}</p>`}</article>`;
}
export function wrapText(ctx,text,x,y,maxWidth,lineHeight,maxLines=8) {
  let line='',lines=0;
  for(const word of text.split(/\s+/)) {
    const test=line?`${line} ${word}`:word;
    if(ctx.measureText(test).width>maxWidth && line){ctx.fillText(line,x,y);y+=lineHeight;line=word;if(++lines>=maxLines)return y;}
    else line=test;
    // Split unbroken strings rather than painting beyond the canvas.
    while(ctx.measureText(line).width>maxWidth){let cut=line.length;while(cut>1&&ctx.measureText(line.slice(0,cut)).width>maxWidth)cut--;ctx.fillText(line.slice(0,cut),x,y);line=line.slice(cut);y+=lineHeight;if(++lines>=maxLines)return y;}
  }
  if(line)ctx.fillText(line,x,y);return y+lineHeight;
}
