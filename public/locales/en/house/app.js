import { $, $$, api, escape, action, share, toast, storage, download } from '/locales/en/shared/ui.js';
import { readRoomDraft, hasConflict, roomDraft } from '/locales/en/house/draft.js';
import { floodFill, brush } from '/locales/en/house/tools.js';
const palette=['#f3eedf','#282e2b','#7d8b80','#b8c7ae','#42775e','#7eaa82','#b6c9e0','#537bad','#e7bf77','#bd8958','#c75f4b','#e5a395','#b9a3cf','#826c9a','#f1d8ba','#ffffff'];
const names=['Ivory','Charcoal','Gray','Sage','Forest','Grass','Sky','Blue','Sand','Wood','Brick','Pink','Lilac','Purple','Cream','White'];
function preset(){const p=Array(256).fill('0');for(let y=11;y<16;y++)for(let x=0;x<16;x++)p[y*16+x]='9';for(let y=2;y<7;y++)for(let x=9;x<14;x++)p[y*16+x]=(x===11||y===4)?'f':'6';for(let y=8;y<12;y++)for(let x=2;x<9;x++)p[y*16+x]=y===8?'a':'b';for(let x=2;x<9;x++)p[12*16+x]='1';p[13*16+2]='1';p[13*16+8]='1';for(const [x,y] of [[12,9],[11,8],[13,8],[12,7]])p[y*16+x]='4';p[10*16+12]='8';return p.join('');}
function paint(canvas,pixels,grid=false){const ctx=canvas.getContext('2d'),size=canvas.width/16;for(let i=0;i<256;i++){ctx.fillStyle=palette[parseInt(pixels[i],16)]??palette[0];ctx.fillRect(i%16*size,Math.floor(i/16)*size,size,size);}if(grid){ctx.strokeStyle='#252a2720';ctx.lineWidth=1;for(let i=1;i<16;i++){ctx.beginPath();ctx.moveTo(i*size,0);ctx.lineTo(i*size,canvas.height);ctx.moveTo(0,i*size);ctx.lineTo(canvas.width,i*size);ctx.stroke();}}}
export async function mount(){
  let state=await api(`/api/rooms${location.search?`?id=${encodeURIComponent(new URLSearchParams(location.search).get('room')??'')}`:''}`);
  const draft=readRoomDraft(storage.get('room-draft'));
  let conflict=hasConflict(draft,state.mine),pixels=draft?.pixels??state.mine?.pixels??preset(),color='a';
  let version=draft&&!draft.legacy?draft.baseVersion:state.mine?.version??null;
  let roomId=draft&&!draft.legacy?draft.roomId:state.mine?.id??null;
  let dirty=!!draft,revision=0,history=[],redoHistory=[],painting=false,keyCell=0,page=0,tool='brush',symmetry='off',grid=true;
  const viewed=state.room;
  $('#app').innerHTML=`${viewed?`<section class="panel stack section-gap"><h2>Visiting: ${escape(viewed.name)}</h2><canvas id="visited" width="256" height="256" role="img" aria-label="Room ${escape(viewed.name)}"></canvas><a class="text-button" href="/house/">Go to your room →</a></section>`:''}<div class="split section-gap"><section class="stack"><div class="row between"><h2>Your room</h2><span class="small muted">16 × 16 pixels</span></div><canvas id="pixels" class="pixel-board" width="512" height="512" tabindex="0" role="application" aria-label="Pixel editor. Arrow keys move the cursor; Space paints with the selected color." aria-describedby="keyboard-help"></canvas><div class="row" role="group" aria-label="Tool"><button data-tool="brush" aria-pressed="true">Brush</button><button data-tool="fill" aria-pressed="false">Fill</button><button data-tool="pick" aria-pressed="false">Eyedropper</button></div><div class="row" role="group" aria-label="Brush symmetry"><span>Brush symmetry</span><button data-symmetry="off" aria-pressed="true">No symmetry</button><button data-symmetry="horizontal" aria-pressed="false">Left / right</button><button data-symmetry="vertical" aria-pressed="false">Top / bottom</button><button data-symmetry="both" aria-pressed="false">Both axes</button></div><div class="row"><button id="toggle-grid" class="secondary" aria-pressed="true">Grid</button><button id="undo" class="secondary">Undo</button><button id="redo" class="secondary" disabled>Redo</button><button id="preset" class="secondary">Cozy room</button><button id="clear" class="text-button">Clear</button><button id="export" class="secondary">Download room ↓</button></div><p id="keyboard-help" class="small muted">Draw with mouse or touch. Keyboard: arrows move, Space paints.</p></section><section class="panel stack"><h2>Make yourself at home</h2><p class="muted">There is room for everyone. Draw some furniture, a window, or a tiny universe.</p><div class="palette">${palette.map((c,i)=>`<button class="swatch" data-color="${i.toString(16)}" aria-label="${names[i]}" aria-pressed="${i===10}"></button>`).join('')}</div><label>Room name<input id="room-name" maxlength="40" required placeholder="The cactus room"></label><button id="save">Save room ↗</button><button id="share" class="secondary" ${state.mine?'':'disabled'}>Invite a friend ↗</button><section id="draft-conflict" class="stack" hidden><p>This draft is based on a different room version. Download the drawing or choose which version to continue. Keeping the draft allows it to replace the saved room on your next save.</p><button id="keep-draft" class="secondary">Continue with draft</button><button id="load-room" class="secondary">Replace draft with saved room</button></section><p id="save-status" class="small muted">Your draft stays in this browser. Saved rooms are public.</p><p class="small muted">Your anonymous browser session is the key. Clearing cookies removes your editing access.</p></section></div><section class="section-gap"><div class="section-head"><h2>Our neighbors</h2><button id="refresh" class="secondary">Refresh the house</button></div><div id="neighbors" class="room-grid"></div><div class="row section-gap"><button id="prev" class="secondary">← Back</button><button id="next" class="secondary">Next →</button></div></section>`;
  $('#room-name').value=draft?.name??state.mine?.name??'';
  if(viewed)paint($('#visited'),viewed.pixels);
  const canvas=$('#pixels');
  function draw(){for(const [id,locked]of [['undo',!history.length],['redo',!redoHistory.length]]){const b=$('#'+id);b.dataset.lock=String(locked);b.disabled=locked;}paint(canvas,pixels,grid);if(document.activeElement===canvas){const ctx=canvas.getContext('2d');ctx.strokeStyle='#e96736';ctx.lineWidth=3;ctx.strokeRect(keyCell%16*32+2,Math.floor(keyCell/16)*32+2,28,28);}}
  function store(){
    // Do not assign a fresh baseline to an unversioned draft until explicitly resolved.
    storage.set('room-draft',conflict&&draft?.legacy?{pixels,name:$('#room-name').value}:roomDraft(pixels,$('#room-name').value,roomId,version));
  }
  function conflictUI(){
    $('#draft-conflict').hidden=!conflict;$('#save').dataset.lock=String(conflict);$('#save').disabled=conflict;
  }
  function persist(){revision++;store();dirty=true;$('#save-status').textContent='You have unsaved changes.';}
  action($('#keep-draft'),()=>{version=state.mine?.version??null;roomId=state.mine?.id??null;conflict=false;persist();conflictUI();});
  action($('#load-room'),()=>{pixels=state.mine?.pixels??preset();$('#room-name').value=state.mine?.name??'';version=state.mine?.version??null;roomId=state.mine?.id??null;history=[];redoHistory=[];conflict=false;persist();conflictUI();draw();});
  function remember(){redoHistory=[];history.push(pixels);if(history.length>30)history.shift();}
  function selectTool(value){tool=value;$$('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===tool)));}
  function selectColor(value){color=value;$$('.swatch').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.color===color)));}
  function put(index){
    if(tool==='pick'){selectColor(pixels[index]);selectTool('brush');draw();return;}
    const next=tool==='fill'?floodFill(pixels,index,color):brush(pixels,index,color,symmetry);
    if(next!==pixels){pixels=next;draw();persist();}
  }
  $$('[data-tool]').forEach(b=>action(b,()=>selectTool(b.dataset.tool)));
  $$('[data-symmetry]').forEach(b=>action(b,()=>{symmetry=b.dataset.symmetry;$$('[data-symmetry]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));}));
  action($('#toggle-grid'),()=>{grid=!grid;$('#toggle-grid').setAttribute('aria-pressed',String(grid));draw();});
  function coordinate(e){const r=canvas.getBoundingClientRect();return Math.min(15,Math.max(0,Math.floor((e.clientY-r.top)/r.height*16)))*16+Math.min(15,Math.max(0,Math.floor((e.clientX-r.left)/r.width*16)));}
  canvas.addEventListener('pointerdown',e=>{e.preventDefault();canvas.focus();canvas.setPointerCapture(e.pointerId);painting=tool==='brush';if(tool!=='pick')remember();keyCell=coordinate(e);put(keyCell);});
  canvas.addEventListener('pointermove',e=>{if(painting){keyCell=coordinate(e);put(keyCell);}});
  for(const event of ['pointerup','pointercancel'])canvas.addEventListener(event,()=>{painting=false;});
  canvas.addEventListener('keydown',e=>{const deltas={ArrowLeft:-1,ArrowRight:1,ArrowUp:-16,ArrowDown:16};if(e.key in deltas){e.preventDefault();keyCell=Math.max(0,Math.min(255,keyCell+deltas[e.key]));draw();}else if(e.key===' '||e.key==='Enter'){e.preventDefault();if(tool!=='pick')remember();put(keyCell);}});
  canvas.addEventListener('focus',draw);canvas.addEventListener('blur',draw);
  $$('.swatch').forEach(button=>{button.style.setProperty('--swatch',palette[parseInt(button.dataset.color,16)]);action(button,()=>{selectColor(button.dataset.color);});});
  action($('#undo'),()=>{if(history.length){redoHistory.push(pixels);pixels=history.pop();draw();persist();}});
  action($('#redo'),()=>{if(redoHistory.length){history.push(pixels);pixels=redoHistory.pop();draw();persist();}});
  action($('#export'),()=>{const output=document.createElement('canvas');output.width=512;output.height=512;paint(output,pixels);download(output,'pixel-room.png');});
  action($('#preset'),()=>{remember();pixels=preset();draw();persist();});action($('#clear'),()=>{remember();pixels='0'.repeat(256);draw();persist();});
  $('#room-name').addEventListener('input',persist);
  action($('#save'),async()=>{
    if(conflict)return;
    const savedRevision=revision,payload={name:$('#room-name').value,pixels,version};
    let result;
    try{result=await api('/api/rooms',payload);}
    catch(error){if(error.status===409){const latest=await api('/api/rooms');state.mine=latest.mine;conflict=true;conflictUI();}throw error;}
    version=result.version;roomId=result.id;state.mine={...payload,...result};store();
    dirty=revision!==savedRevision;$('#share').disabled=false;
    $('#save-status').textContent=dirty?'You have unsaved changes.':'Saved. Welcome home.';
    toast('Your room is now in the house.');await neighbors();
  });
  action($('#share'),()=>share(`${location.origin}/house/?room=${state.mine.id}`,'Pixel Rooms','Come visit my room!'));
  async function neighbors(){const next=await api(`/api/rooms?page=${page}`);$('#neighbors').innerHTML=next.rooms.length?next.rooms.map(room=>`<a class="room-card" href="?room=${escape(room.id)}"><canvas width="160" height="160" data-room="${escape(room.id)}" role="img" aria-label="${escape(room.name)}"></canvas><p>${escape(room.name)}</p></a>`).join(''):'<p class="muted">Quiet for now. Your room could be the first.</p>';$$('[data-room]').forEach(c=>paint(c,next.rooms.find(r=>r.id===c.dataset.room).pixels));$('#prev').disabled=page===0;$('#next').disabled=!next.hasMore;}
  action($('#refresh'),neighbors);action($('#prev'),async()=>{if(page>0)page--;await neighbors();});action($('#next'),async()=>{page++;await neighbors();});
  window.addEventListener('minute:preferences-changing',()=>{dirty=false;});
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});conflictUI();draw();await neighbors();
}


