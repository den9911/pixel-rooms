import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/index.mjs';
import { dayKey, dayNumber, dailyPuzzle, questions } from '../server/content.mjs';
import { decodeImage, integer, text, validDay, HttpError } from '../server/validation.mjs';
import { transaction } from '../server/store.mjs';
import { primaryApp } from '../server/project.mjs';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6jJ8AAAAASUVORK5CYII=';
async function listen(app){app.server.listen(0,'127.0.0.1');await once(app.server,'listening');return `http://127.0.0.1:${app.server.address().port}`;}
async function close(server){await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
function client(base){let cookie='';return async(path,input,headers={})=>{
  const response=await fetch(base+path,{method:input===undefined?'GET':'POST',headers:{...(cookie?{Cookie:cookie}:{}),...(input===undefined?{}:{'Content-Type':'application/json'}),...headers},...(input===undefined?{}:{body:JSON.stringify(input)})});
  const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
  const content=response.headers.get('content-type')??'';
  return {status:response.status,headers:response.headers,body:content.includes('application/json')?await response.json():await response.text()};
};}

test('validation, images, and daily boundaries',()=>{
  assert.equal(text('  hi  '),'hi');assert.equal(text('',10,0),'');
  for(const input of [null,{},'','a'.repeat(161),'a\u0001'])assert.throws(()=>text(input),HttpError);
  assert.equal(integer(3,0,5),3);for(const x of ['3',-1,6,NaN])assert.throws(()=>integer(x,0,5));
  assert.equal(validDay('2024-02-29'),'2024-02-29');for(const day of ['2023-02-29','bad','2026-13-30'])assert.throws(()=>validDay(day));
  assert.equal(dayKey(new Date('2026-10-27T21:01:00Z')),'2026-10-28');
  assert.equal(dayKey(new Date('2026-10-27T20:59:00Z')),'2026-10-27');
  assert.equal(dayNumber('1970-01-01'),0);assert.deepEqual(dailyPuzzle('2026-10-27'),dailyPuzzle('2026-10-27'));
  assert.equal(decodeImage(png).mime,'image/png');assert.equal(decodeImage(null).bytes,0);
  assert.throws(()=>decodeImage('data:image/svg+xml;base64,PHN2Zz4='));
  assert.throws(()=>decodeImage(png.replace('image/png','image/jpeg')));
  assert.throws(()=>decodeImage('data:image/png;base64,'+Buffer.alloc(500001).toString('base64')));
  const huge=Buffer.from(png.split(',')[1],'base64');huge.writeUInt32BE(8000,16);assert.throws(()=>decodeImage(`data:image/png;base64,${huge.toString('base64')}`));
  const webp=Buffer.alloc(32);webp.write('RIFF');webp.write('WEBP',8);webp.write('VP8X',12);assert.equal(decodeImage(`data:image/webp;base64,${webp.toString('base64')}`).mime,'image/webp');
  webp[20]=2;assert.throws(()=>decodeImage(`data:image/webp;base64,${webp.toString('base64')}`));
  const lossless=Buffer.alloc(32);lossless.write('RIFF');lossless.write('WEBP',8);lossless.write('VP8L',12);lossless[20]=0x2f;assert.equal(decodeImage(`data:image/webp;base64,${lossless.toString('base64')}`).bytes,32);
  const lossy=Buffer.alloc(32);lossy.write('RIFF');lossy.write('WEBP',8);lossy.write('VP8 ',12);lossy[23]=0x9d;lossy[24]=1;lossy[25]=0x2a;lossy.writeUInt16LE(1,26);lossy.writeUInt16LE(1,28);assert.equal(decodeImage(`data:image/webp;base64,${lossy.toString('base64')}`).mime,'image/webp');
  const jpeg=Buffer.from([255,216,255,192,0,8,8,0,1,0,1,0]);assert.equal(decodeImage(`data:image/jpeg;base64,${jpeg.toString('base64')}`).mime,'image/jpeg');
});

test('all community workflows persist and enforce their invariants',async t=>{
  const dataDir=await mkdtemp(join(tmpdir(),'minute-test-'));
  const options={dataDir,adminToken:'test-key-do-not-use',uploadBudget:1_000_000,disableRateLimit:true,appId:''};
  let app=await createApp(options),base=await listen(app);
  const alice=client(base),bob=client(base),admin={'Authorization':'Bearer test-key-do-not-use'};
  t.after(async()=>{if(app.server.listening)await close(app.server);await rm(dataDir,{recursive:true,force:true});});
  let captionId,pollId,roomId,imageId;
  await t.test('static content, health, headers, compression, and cache',async()=>{
    assert.equal((await alice('/healthz')).status,200);
    const config=await alice('/api/config');assert.equal(config.body.apps.length,9);assert.equal(config.body.maxImageBytes,500000);
    const root=await alice(primaryApp?`/${primaryApp}/`:'/');assert.equal(root.status,200);assert.match(root.body,/lang="ru"/);assert.match(root.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    assert.equal((await alice('/shared/style.css',undefined,{'If-None-Match':(await alice('/shared/style.css')).headers.get('etag')})).status,304);
    assert.equal((await alice('/missing')).status,404);assert.equal((await alice('/shared/absent.js')).status,404);assert.equal((await alice('/%zz')).status,400);
    const head=await fetch(base+'/shared/style.css',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
    assert.equal((await fetch(base+'/',{method:'DELETE'})).status,405);
  });
  await t.test('captions: publish, vote once, reject bad input, and retain vote',async()=>{
    const created=await alice('/api/captions',{title:'Когда коробка — это дом'});assert.equal(created.status,201);captionId=created.body.id;
    const rows=(await bob('/api/captions')).body.entries;assert.equal(rows.length,1);assert.equal(rows[0].title,'Когда коробка — это дом');
    assert.equal((await bob('/api/captions/vote',{id:captionId})).status,200);
    assert.equal((await bob('/api/captions/vote',{id:captionId})).status,409);
    assert.equal((await bob('/api/captions')).body.entries[0].votes,1);
    assert.equal((await bob('/api/captions')).body.entries[0].voted,1);
    assert.equal((await alice('/api/captions',{title:''})).status,400);
    assert.equal((await alice('/api/captions/vote',{})).status,400);
    assert.equal((await alice('/api/captions/vote',{id:'unknown'})).status,404);
    assert.equal((await alice('/api/captions?day=2023-02-29')).status,400);
    await alice('/api/captions',{title:'Вторая подпись'});await alice('/api/captions',{title:'Третья подпись'});
    assert.equal((await alice('/api/captions',{title:'Четвёртая подпись'})).status,429);
  });
  await t.test('majority: only real counts, one answer per question',async()=>{
    let result=(await alice('/api/majority')).body;assert.equal(result.questions.length,questions.length);assert.deepEqual(result.questions[0].counts,[0,0]);
    assert.equal((await alice('/api/majority',{id:0,choice:1})).status,200);
    assert.equal((await alice('/api/majority',{id:0,choice:0})).status,409);
    result=(await alice('/api/majority')).body;assert.deepEqual(result.questions[0].counts,[0,1]);assert.equal(result.questions[0].choice,'1');
    assert.equal((await bob('/api/majority',{id:999,choice:0})).status,400);
  });
  await t.test('arena: valid pairs, transactional votes, no repeated pair',async()=>{
    const {pair}= (await alice('/api/arena')).body;const [a,b]=pair.map(p=>p.id);
    assert.equal((await alice('/api/arena/vote',{a,b,winner:'not-a-candidate'})).status,400);
    assert.equal((await alice('/api/arena/vote',{a,b:a,winner:a})).status,400);
    assert.equal((await alice('/api/arena/vote',{a,b,winner:a})).status,200);
    assert.equal((await alice('/api/arena/vote',{a:b,b:a,winner:b})).status,409);
    assert.notDeepEqual((await alice('/api/arena')).body.pair.map(p=>p.id).sort(),[a,b].sort());
    const voted=app.db.prepare('SELECT votes FROM posts WHERE id=?').get(a);assert.equal(voted.votes,1);
  });
  await t.test('polls: sharing, distinct options, and one vote',async()=>{
    const created=await alice('/api/polls',{title:'Имя кота?',options:['Пончик','Батон']});assert.equal(created.status,201);pollId=created.body.id;
    assert.equal((await bob(`/api/poll?id=${pollId}`)).body.title,'Имя кота?');
    const voted=await bob('/api/poll/vote',{id:pollId,choice:0});assert.equal(voted.status,200);assert.equal(voted.body.counts[0].count,1);
    assert.equal((await bob('/api/poll/vote',{id:pollId,choice:1})).status,409);
    assert.equal((await alice('/api/poll/vote',{id:pollId,choice:8})).status,400);
    assert.equal((await alice('/api/polls',{title:'?',options:['x','X']})).status,400);
    assert.equal((await alice('/api/polls',{title:'?',options:['x']})).status,400);
    assert.equal((await alice('/api/poll?id=missing')).status,404);
  });
  await t.test('rooms: isolated ownership, shared gallery, conflict detection',async()=>{
    const pixels='a'.repeat(256);const created=await alice('/api/rooms',{name:'Мой дом',pixels});assert.equal(created.status,200);roomId=created.body.id;assert.equal(created.body.version,1);
    const view=(await bob(`/api/rooms?id=${roomId}`)).body;assert.equal(view.mine,null);assert.equal(view.room.pixels,pixels);
    assert.equal((await alice('/api/rooms',{name:'Обновлено',pixels,version:0})).status,409);
    assert.equal((await alice('/api/rooms',{name:'Обновлено',pixels:'0'.repeat(256),version:1})).body.version,2);
    assert.equal((await bob('/api/rooms',{name:'Другой дом',pixels})).status,200);
    assert.equal((await alice('/api/rooms')).body.rooms.length,2);
    assert.equal((await alice('/api/rooms',{name:'x',pixels:'q'.repeat(256),version:2})).status,400);
  });
  await t.test('daily game: server-checked guesses, persistent completion',async()=>{
    const initial=(await alice('/api/minute')).body;assert.equal(initial.game,null);
    assert.equal((await alice('/api/minute/guess',{index:0,day:initial.day})).status,400);
    const start=(await alice('/api/minute/start',{})).body;assert.equal(start.cells.length,25);
    assert.equal((await alice('/api/minute/guess',{index:0,day:'2000-01-01'})).status,409);
    const correct=dailyPuzzle(start.day).answer;
    const wrong=await alice('/api/minute/guess',{index:(correct+1)%25,day:start.day});assert.equal(wrong.body.correct,false);
    const win=await alice('/api/minute/guess',{index:correct,day:start.day});assert.equal(win.body.correct,true);assert.equal(win.body.attempts,2);
    assert.equal((await alice('/api/minute/guess',{index:correct,day:start.day})).status,409);
    assert.ok((await alice('/api/minute')).body.game.finished);
  });
  await t.test('uploads: size and signature checks, private queue, moderation, reports',async()=>{
    const upload=await alice('/api/posts',{kind:'finds',title:'Загадочная вывеска',body:'Тестовая находка',category:'Вывески',image:png});assert.equal(upload.status,201);imageId=upload.body.id;
    assert.equal((await bob('/api/finds')).body.entries.length,0);
    assert.equal((await bob(`/api/find?id=${imageId}`)).status,404);
    assert.equal((await bob(`/media/${imageId}`)).status,401);
    assert.equal((await alice('/api/admin')).status,401);
    const queue=await alice('/api/admin',undefined,admin);assert.equal(queue.body.posts.length,1);assert.ok(queue.body.usage>0);
    assert.equal((await alice(`/media/${imageId}`,undefined,admin)).status,200);
    assert.equal((await alice('/api/admin/moderate',{id:imageId,action:'approve'},admin)).status,200);
    const feed=await bob('/api/finds?category=%D0%92%D1%8B%D0%B2%D0%B5%D1%81%D0%BA%D0%B8&sort=top');assert.equal(feed.body.entries[0].id,imageId);
    assert.equal((await bob('/api/finds?category=Other')).body.entries.length,0);
    assert.equal((await bob(`/api/find?id=${imageId}`)).body.id,imageId);
    const media=await bob(`/media/${imageId}`);assert.equal(media.status,200);assert.equal(media.headers.get('content-type'),'image/png');
    assert.equal((await bob(`/media/${imageId}`,undefined,{'If-None-Match':media.headers.get('etag')})).status,304);
    assert.equal((await bob('/api/finds/vote',{id:imageId})).status,200);assert.equal((await bob('/api/finds/vote',{id:imageId})).status,409);
    assert.equal((await bob('/api/report',{id:imageId,reason:'Проверка жалобы'})).status,200);
    assert.equal((await alice('/api/admin',undefined,admin)).body.posts[0].reports,1);
    assert.equal((await alice('/api/admin/moderate',{id:imageId,action:'delete'},admin)).status,200);
    assert.equal((await bob(`/media/${imageId}`)).status,404);assert.equal((await alice('/api/admin',undefined,admin)).body.usage,0);
    assert.equal((await alice('/api/posts',{kind:'finds',title:'x',category:'Другое',image:'x'})).status,400);
    assert.equal((await alice('/api/posts',{kind:'bad',title:'x',image:png})).status,400);
    assert.equal((await alice('/api/posts',{kind:'finds',title:'x',category:'invalid',image:png})).status,400);
    assert.equal((await alice('/api/posts',{kind:'arena',title:'x'})).status,400);
    assert.equal((await alice('/api/admin/moderate',{id:'none',action:'unknown'},admin)).status,400);
    assert.equal((await bob('/api/report',{id:'missing',reason:'x'})).status,404);
    const meme=await alice('/api/posts',{kind:'arena',title:'Мой мем',image:png});assert.equal(meme.status,201);
    await alice('/api/admin/moderate',{id:meme.body.id,action:'approve'},admin);
    assert.ok((await alice('/api/arena')).body.pair.some(p=>p.id===meme.body.id));
  });
  await t.test('request validation, origin checks, unknown routes, and transaction rollback',async()=>{
    assert.equal((await alice('/api/polls',{title:'x',options:['a','b']},{Origin:'https://evil.test'})).status,403);
    assert.equal((await alice('/api/polls',{title:'x',options:['a','b']},{'Sec-Fetch-Site':'cross-site'})).status,403);
    assert.equal((await alice('/api/polls',{title:'x'},{'Content-Type':'text/plain'})).status,415);
    assert.equal((await fetch(base+'/api/polls',{method:'POST',headers:{'Content-Type':'application/json'},body:'bad'})).status,400);
    assert.equal((await fetch(base+'/api/polls',{method:'POST',headers:{'Content-Type':'application/json'},body:'[]'})).status,400);
    assert.equal((await fetch(base+'/api/polls',{method:'POST',headers:{'Content-Type':'application/json'},body:' '.repeat(700001)})).status,413);
    assert.equal((await alice('/api/missing')).status,404);
    assert.throws(()=>transaction(app.db,()=>{app.db.prepare('DELETE FROM polls WHERE id=?').run(pollId);throw new Error('rollback');}));
    assert.ok(app.db.prepare('SELECT id FROM polls WHERE id=?').get(pollId));
  });
  await t.test('data survives restart',async()=>{
    await close(app.server);app=await createApp(options);base=await listen(app);const fresh=client(base);
    assert.equal((await fresh(`/api/poll?id=${pollId}`)).body.counts[0].count,1);
    assert.equal((await fresh('/api/captions')).body.entries.find(r=>r.id===captionId).votes,1);
    assert.equal((await fresh(`/api/rooms?id=${roomId}`)).body.room.name,'Обновлено');
  });
});

test('standalone scope, quota, missing moderation, and rate limits',async t=>{
  const dirs=[];const servers=[];
  t.after(async()=>{for(const s of servers)if(s.listening)await close(s);for(const d of dirs)await rm(d,{recursive:true,force:true});});
  async function setup(options){const dataDir=await mkdtemp(join(tmpdir(),'minute-options-'));dirs.push(dataDir);const app=await createApp({dataDir,...options});servers.push(app.server);return client(await listen(app));}
  const limited=await setup({appId:'caption',disableRateLimit:true});
  assert.equal((await limited('/api/config')).body.apps.length,1);assert.equal((await limited('/api/polls',{})).status,404);assert.equal((await limited('/arena/')).status,404);
  assert.equal((await limited('/api/admin')).status,503);
  const noAdmin=await setup({appId:'',adminToken:'',disableRateLimit:true});assert.equal((await noAdmin('/api/posts',{kind:'arena',title:'x',image:png})).status,503);
  const quota=await setup({appId:'finds',adminToken:'key',uploadBudget:1,disableRateLimit:true});assert.equal((await quota('/api/posts',{kind:'finds',title:'x',category:'Другое',image:png})).status,507);
  assert.equal((await quota('/api/posts',{kind:'arena',title:'x',image:png})).status,400);
  const rate=await setup({appId:'',disableRateLimit:false});
  let limitedStatus=0;for(let i=0;i<9;i++)limitedStatus=(await rate('/api/polls',{title:'Rate test',options:['a','b']})).status;assert.equal(limitedStatus,429);
});

test('packaged default route and secure signed session',async t=>{
  const dataDir=await mkdtemp(join(tmpdir(),'minute-default-'));
  const app=await createApp({dataDir,origin:'https://example.test',disableRateLimit:true});
  const base=await listen(app);
  t.after(async()=>{await close(app.server);await rm(dataDir,{recursive:true,force:true});});
  const response=await fetch(base+'/');assert.equal(response.status,200);
  assert.match(await response.text(),new RegExp(`data-app="${primaryApp||'home'}"`));
  const config=await fetch(base+'/api/config');assert.equal((await config.json()).apps.length,primaryApp?1:9);
  const cookie=config.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Lax/);assert.match(cookie,/Secure/);
  const fake='minute_session=00000000-0000-0000-0000-000000000000.'+'0'.repeat(64);
  const replacement=await fetch(base+'/api/config',{headers:{Cookie:fake}});assert.ok(replacement.headers.get('set-cookie'));
});
