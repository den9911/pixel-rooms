import { createServer } from 'node:http';
import { randomUUID, randomBytes, createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { openStore, transaction } from './store.mjs';
import { apps, questions, scenes, dayKey, dayNumber, dailyPuzzle } from './content.mjs';
import { HttpError, text, integer, validDay, decodeImage } from './validation.mjs';
import { primaryApp } from './project.mjs';

const zip = promisify(gzip);
const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json; charset=utf-8', '.ico':'image/x-icon' };
const postFields = 'id,kind,title,body,category,day,status,votes,created,CASE WHEN image IS NULL THEN 0 ELSE 1 END AS hasImage';

/** One HTTP process, one SQLite writer; do not run multiple cluster workers on the same database. */
export async function createApp(options = {}) {
  const dataDir = resolve(options.dataDir ?? process.env.DATA_DIR ?? './data');
  await mkdir(dataDir, { recursive:true, mode:0o700 });
  let secret = options.secret;
  if (!secret) {
    try { secret = await readFile(resolve(dataDir,'session-key'),'utf8'); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      secret = randomBytes(32).toString('hex');
      await writeFile(resolve(dataDir,'session-key'),secret,{mode:0o600,flag:'wx'});
    }
  }
  const db = openStore(resolve(dataDir,'minute.sqlite'));
  const appId=options.appId ?? process.env.APP_ID ?? primaryApp;
  if (appId && ![...apps.map(a=>a[0]),'mischief'].includes(appId)) throw new Error('Unknown APP_ID');
  const adminToken = options.adminToken ?? process.env.ADMIN_TOKEN ?? '';
  const origin = options.origin ?? process.env.PUBLIC_ORIGIN ?? '';
  const timezone = options.timezone ?? process.env.APP_TIMEZONE ?? 'Europe/Moscow';
  const uploadBudget = Number(options.uploadBudget ?? process.env.UPLOAD_BUDGET_BYTES ?? 0);
  if (!Number.isSafeInteger(uploadBudget) || uploadBudget < 0) throw new Error('Invalid UPLOAD_BUDGET_BYTES');
  const today = () => dayKey(new Date(),timezone);
  const limits = new Map();
  const cache = new Map();
  const sign = value => createHmac('sha256',secret).update(value).digest('hex');
  const safeEqual = (a,b) => { const left=Buffer.from(a),right=Buffer.from(b);return left.length === right.length && timingSafeEqual(left,right); };

  function session(req,res) {
    const value = /(?:^|;\s*)minute_session=([a-f0-9-]{36}\.[a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
    if (value) { const [id,signature] = value.split('.'); if (safeEqual(signature,sign(id))) return id; }
    const id = randomUUID();
    res.setHeader('Set-Cookie',`minute_session=${id}.${sign(id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${origin.startsWith('https:') ? '; Secure' : ''}`);
    return id;
  }
  function throttle(req, group, max = 120) {
    if (options.disableRateLimit) return;
    const key = `${req.socket.remoteAddress}:${group}`;
    const now = Date.now();
    if (limits.size > 10000) for (const [k,v] of limits) if (v.until < now) limits.delete(k);
    const entry = limits.get(key);
    if (!entry || entry.until < now) { limits.set(key,{until:now+60000,count:1}); return; }
    if (++entry.count > max) throw new HttpError(429,'Слишком быстро. Попробуйте через минуту.');
  }
  function json(res, value, status = 200) {
    res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    res.end(JSON.stringify(value));
  }
  async function body(req) {
    if (Number(req.headers['content-length'])>700000) {req.resume();throw new HttpError(413,'Слишком большой запрос.');}
    if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415,'Нужен JSON.');
    const expected = origin || `http://${req.headers.host}`;
    if (req.headers.origin && req.headers.origin !== new URL(expected).origin) throw new HttpError(403,'Чужой источник запроса.');
    if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403,'Чужой источник запроса.');
    const chunks=[]; let bytes=0;
    for await (const chunk of req) { bytes+=chunk.length; if (bytes>700000) throw new HttpError(413,'Слишком большой запрос.'); chunks.push(chunk); }
    try { const result=JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!result || Array.isArray(result) || typeof result!=='object') throw new Error(); return result; }
    catch { throw new HttpError(400,'Некорректный JSON.'); }
  }
  function once(scope,target,voter,choice='') {
    const result=db.prepare('INSERT OR IGNORE INTO votes(scope,target,voter,choice,created) VALUES(?,?,?,?,?)').run(scope,target,voter,String(choice),Date.now());
    if (!result.changes) throw new HttpError(409,'Ваш голос уже учтён.');
  }
  function approvedPost(id,kind) {
    text(id,50);
    const row=db.prepare('SELECT id FROM posts WHERE id=? AND kind=? AND status=?').get(id,kind,'approved');
    if (!row) throw new HttpError(404,'Публикация не найдена.');
    return row;
  }
  function pollResult(id,sid) {
    text(id,50);
    const poll=db.prepare('SELECT id,title,options FROM polls WHERE id=?').get(id);
    if (!poll) throw new HttpError(404,'Опрос не найден.');
    const counts=db.prepare('SELECT choice,COUNT(*) AS count FROM votes WHERE scope=? AND target=? GROUP BY choice').all('poll',id);
    const own=db.prepare('SELECT choice FROM votes WHERE scope=? AND target=? AND voter=?').get('poll',id,sid);
    return {...poll,options:JSON.parse(poll.options),counts,choice:own?.choice ?? null};
  }
  function checkAdmin(req) {
    if (!adminToken) throw new HttpError(503,'Модерация не настроена: задайте ADMIN_TOKEN на сервере.');
    const token=req.headers.authorization?.replace(/^Bearer /,'') ?? '';
    if (!safeEqual(token,adminToken)) throw new HttpError(401,'Неверный ключ модератора.');
  }

  const server=createServer(async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      if (!['GET','HEAD','POST'].includes(req.method)) throw new HttpError(405,'Метод не поддерживается.');
      const url=new URL(req.url,'http://localhost');
      const path=url.pathname==='/' && appId ? `/${appId}/` : url.pathname;
      if (path==='/healthz') return json(res,{ok:true});
      if (appId) {
        const groups={caption:['captions','report'],majority:['majority'],arena:['arena','posts','report'],decide:['poll','polls'],house:['rooms'],minute:['minute'],finds:['find','finds','posts','report'],memory:[],papers:[],mischief:[]};
        const prefix=path.split('/')[2];
        if (path.startsWith('/api/') && !['config','admin'].includes(prefix) && !groups[appId].includes(prefix)) throw new HttpError(404,'Адрес не найден.');
        if (!path.startsWith('/api/') && !['',appId,'shared','locales','admin','about','media','healthz','favicon.svg','robots.txt'].includes(path.split('/')[1])) throw new HttpError(404,'Страница не найдена.');
      }
      if (path.startsWith('/api/')) {
        throttle(req,req.method === 'POST' ? 'write':'read',req.method === 'POST' ? 40:240);
        const sid=session(req,res);
        const input=req.method === 'POST' ? await body(req) : null;
        const method=req.method;
        if (path==='/api/config' && method==='GET') return json(res,{apps:appId?apps.filter(a=>a[0]===appId):apps,day:today(),timezone,maxImageBytes:500000});
        if (path==='/api/captions' && method==='GET') {
          const day=validDay(url.searchParams.get('day') ?? today());
          const scene=((dayNumber(day)%scenes.length)+scenes.length)%scenes.length;
          const rows=db.prepare(`SELECT ${postFields},EXISTS(SELECT 1 FROM votes v WHERE v.scope='caption' AND v.target=posts.id AND v.voter=?) AS voted FROM posts WHERE kind='caption' AND day=? AND status='approved' ORDER BY votes DESC,created LIMIT 100`).all(sid,day);
          const yesterday=dayKey(new Date(Date.parse(`${today()}T12:00:00Z`)-86400000),timezone);
          const winner=db.prepare(`SELECT ${postFields} FROM posts WHERE kind='caption' AND day=? AND status='approved' ORDER BY votes DESC,created LIMIT 1`).get(yesterday);
          return json(res,{day,scene,entries:rows,winner:winner ?? null});
        }
        if (path==='/api/captions' && method==='POST') {
          throttle(req,'publish',8);
          const title=text(input.title,160);
          const count=db.prepare("SELECT COUNT(*) AS n FROM posts WHERE kind='caption' AND owner=? AND day=?").get(sid,today()).n;
          if (count>=3) throw new HttpError(429,'На сегодня достаточно трёх подписей.');
          const id=randomUUID();
          db.prepare("INSERT INTO posts(id,kind,title,day,owner,status,created) VALUES(?,'caption',?,?,?,'approved',?)").run(id,title,today(),sid,Date.now());
          return json(res,{id,day:today()},201);
        }
        if (path==='/api/captions/vote' && method==='POST') {
          transaction(db,()=>{ approvedPost(input.id,'caption'); once('caption',input.id,sid); db.prepare('UPDATE posts SET votes=votes+1 WHERE id=?').run(input.id); });
          return json(res,{ok:true});
        }
        if (path==='/api/majority' && method==='GET') {
          return json(res,{questions:questions.map(([question,a,b],id)=>({id,question,options:[a,b],counts:[0,1].map(i=>db.prepare("SELECT COUNT(*) AS n FROM votes WHERE scope='majority' AND target=? AND choice=?").get(String(id),String(i)).n),choice:db.prepare("SELECT choice FROM votes WHERE scope='majority' AND target=? AND voter=?").get(String(id),sid)?.choice ?? null}))});
        }
        if (path==='/api/majority' && method==='POST') {
          integer(input.id,0,questions.length-1); integer(input.choice,0,1);
          once('majority',String(input.id),sid,input.choice); return json(res,{ok:true});
        }
        if (path==='/api/arena' && method==='GET') {
          const candidates=db.prepare(`SELECT ${postFields} FROM posts WHERE kind='arena' AND status='approved' ORDER BY created DESC LIMIT 100`).all();
          const used=new Set(db.prepare("SELECT target FROM votes WHERE scope='arena' AND voter=?").all(sid).map(r=>r.target));
          let pair=null;
          for (let i=0;i<candidates.length && !pair;i++) for (let j=i+1;j<candidates.length;j++) {
            const key=[candidates[i].id,candidates[j].id].sort().join(':');
            if (!used.has(key)) { pair=[candidates[i],candidates[j]]; break; }
          }
          const leaders=db.prepare(`SELECT ${postFields} FROM posts WHERE kind='arena' AND status='approved' ORDER BY votes DESC,created LIMIT 6`).all();
          return json(res,{pair,leaders});
        }
        if (path==='/api/arena/vote' && method==='POST') {
          const a=text(input.a,50), b=text(input.b,50), winner=text(input.winner,50);
          if (a===b || ![a,b].includes(winner)) throw new HttpError(400,'Некорректная пара.');
          transaction(db,()=>{approvedPost(a,'arena'); approvedPost(b,'arena'); once('arena',[a,b].sort().join(':'),sid,winner); db.prepare('UPDATE posts SET votes=votes+1 WHERE id=?').run(winner);});
          return json(res,{ok:true});
        }
        if (path==='/api/posts' && method==='POST') {
          throttle(req,'publish',8);
          if (!adminToken) throw new HttpError(503,'Загрузка откроется после настройки модерации.');
          if (!['arena','finds'].includes(input.kind) || (appId && input.kind!==appId)) throw new HttpError(400,'Неизвестный раздел.');
          const title=text(input.title,120), description=text(input.body ?? '',400,0);
          const category=input.kind==='finds' ? text(input.category,30) : '';
          if (input.kind==='finds' && !['Вывески','Объявления','Предметы','Другое'].includes(category)) throw new HttpError(400,'Неизвестная категория.');
          const {image,mime,bytes}=decodeImage(input.image);
          if (!image) throw new HttpError(400,'Добавьте картинку.');
          const id=randomUUID();
          transaction(db,()=>{
            const used=db.prepare('SELECT bytes FROM uploads_usage WHERE id=1').get().bytes;
            if (used+bytes>uploadBudget) throw new HttpError(507,'Место для новых картинок закончилось.');
            db.prepare('INSERT INTO posts(id,kind,title,body,category,owner,status,created,image,mime,bytes) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,input.kind,title,description,category,sid,'pending',Date.now(),image,mime,bytes);
          });
          return json(res,{id,status:'pending'},201);
        }
        if (path==='/api/finds' && method==='GET') {
          const category=url.searchParams.get('category') ?? '';
          const page=Math.min(10000,Math.max(0,Number(url.searchParams.get('page'))||0));
          const order=url.searchParams.get('sort')==='top' ? 'votes DESC,created DESC':'created DESC';
          const entries=db.prepare(`SELECT ${postFields},EXISTS(SELECT 1 FROM votes v WHERE v.scope='finds' AND v.target=posts.id AND v.voter=?) AS voted FROM posts WHERE kind='finds' AND status='approved' AND (?='' OR category=?) ORDER BY ${order} LIMIT 13 OFFSET ?`).all(sid,category,category,Math.floor(page)*12);
          return json(res,{entries:entries.slice(0,12),hasMore:entries.length>12});
        }
        if (path==='/api/find' && method==='GET') {
          const row=db.prepare(`SELECT ${postFields} FROM posts WHERE id=? AND kind='finds' AND status='approved'`).get(url.searchParams.get('id'));
          if (!row) throw new HttpError(404,'Находка не найдена.');
          return json(res,row);
        }
        if (path==='/api/finds/vote' && method==='POST') {
          transaction(db,()=>{approvedPost(input.id,'finds');once('finds',input.id,sid);db.prepare('UPDATE posts SET votes=votes+1 WHERE id=?').run(input.id);});return json(res,{ok:true});
        }
        if (path==='/api/report' && method==='POST') {
          const id=text(input.id,50),reason=text(input.reason,200);
          if (!db.prepare("SELECT id FROM posts WHERE id=? AND status='approved'").get(id)) throw new HttpError(404,'Публикация не найдена.');
          db.prepare('INSERT OR IGNORE INTO reports(post,reporter,reason) VALUES(?,?,?)').run(id,sid,reason);return json(res,{ok:true});
        }
        if (path==='/api/polls' && method==='POST') {
          throttle(req,'publish',8);
          const title=text(input.title,160);
          if (!Array.isArray(input.options) || input.options.length<2 || input.options.length>6) throw new HttpError(400,'Добавьте от 2 до 6 вариантов.');
          const choices=input.options.map(v=>text(v,80));
          if (new Set(choices.map(v=>v.toLowerCase())).size!==choices.length) throw new HttpError(400,'Варианты должны различаться.');
          const id=randomUUID();db.prepare('INSERT INTO polls(id,title,options,owner,created) VALUES(?,?,?,?,?)').run(id,title,JSON.stringify(choices),sid,Date.now());
          return json(res,{id},201);
        }
        if (path==='/api/poll' && method==='GET') return json(res,pollResult(url.searchParams.get('id'),sid));
        if (path==='/api/poll/vote' && method==='POST') {
          const poll=pollResult(input.id,sid);integer(input.choice,0,poll.options.length-1);
          once('poll',input.id,sid,input.choice);return json(res,pollResult(input.id,sid));
        }
        if (path==='/api/rooms' && method==='GET') {
          const page=Math.min(10000,Math.max(0,Math.floor(Number(url.searchParams.get('page'))||0)));
          const rooms=db.prepare('SELECT id,name,pixels,version FROM rooms ORDER BY updated DESC LIMIT 25 OFFSET ?').all(page*24);
          const mine=db.prepare('SELECT id,name,pixels,version FROM rooms WHERE owner=?').get(sid);
          const selected=url.searchParams.get('id');
          const room=selected ? db.prepare('SELECT id,name,pixels,version FROM rooms WHERE id=?').get(selected) : null;
          return json(res,{rooms:rooms.slice(0,24),hasMore:rooms.length>24,mine:mine??null,room:room??null});
        }
        if (path==='/api/rooms' && method==='POST') {
          const name=text(input.name,40),pixels=text(input.pixels,256,256);
          if (!/^[0-9a-f]{256}$/.test(pixels)) throw new HttpError(400,'Нужна сетка 16 × 16.');
          const existing=db.prepare('SELECT id,version FROM rooms WHERE owner=?').get(sid);
          if (existing && input.version!==existing.version) throw new HttpError(409,'Комната изменилась в другой вкладке. Обновите страницу.');
          const id=existing?.id ?? randomUUID();
          db.prepare('INSERT INTO rooms(id,owner,name,pixels,updated) VALUES(?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET name=excluded.name,pixels=excluded.pixels,updated=excluded.updated,version=rooms.version+1').run(id,sid,name,pixels,Date.now());
          return json(res,{id,version:(existing?.version??0)+1});
        }
        if (path==='/api/minute' && method==='GET') {
          const day=today(),puzzle=dailyPuzzle(day);
          const game=db.prepare('SELECT attempts,finished,started FROM games WHERE day=? AND player=?').get(day,sid);
          const completed=db.prepare('SELECT COUNT(*) AS n FROM games WHERE day=? AND finished IS NOT NULL').get(day).n;
          return json(res,{day,word:puzzle.word,odd:puzzle.odd,game:game??null,completed,...(game ? {cells:Array.from({length:25},(_,i)=>i===puzzle.answer?puzzle.odd:puzzle.word)}:{})});
        }
        if (path==='/api/minute/start' && method==='POST') {
          const day=today(),p=dailyPuzzle(day);
          db.prepare('INSERT OR IGNORE INTO games(day,player,started) VALUES(?,?,?)').run(day,sid,Date.now());
          return json(res,{day,cells:Array.from({length:25},(_,i)=>i===p.answer?p.odd:p.word)});
        }
        if (path==='/api/minute/guess' && method==='POST') {
          integer(input.index,0,24); const day=today();
          if (input.day!==day) throw new HttpError(409,'Начался новый день. Обновите игру.');
          const game=db.prepare('SELECT * FROM games WHERE day=? AND player=?').get(day,sid);
          if (!game) throw new HttpError(400,'Сначала начните игру.');
          if (game.finished) throw new HttpError(409,'Сегодняшняя задача уже решена.');
          const correct=input.index===dailyPuzzle(day).answer;
          const finished=correct ? Date.now():null;
          db.prepare('UPDATE games SET attempts=attempts+1,finished=? WHERE day=? AND player=?').run(finished,day,sid);
          return json(res,{correct,attempts:game.attempts+1,elapsed:correct ? Math.max(0,finished-game.started):null});
        }
        if (path.startsWith('/api/admin')) {
          checkAdmin(req);
          if (path==='/api/admin' && method==='GET') {
            const posts=db.prepare(`SELECT ${postFields},(SELECT COUNT(*) FROM reports WHERE post=posts.id) AS reports,(SELECT group_concat(reason,' · ') FROM reports WHERE post=posts.id) AS reasons FROM posts WHERE status='pending' OR EXISTS(SELECT 1 FROM reports WHERE post=posts.id) ORDER BY created DESC LIMIT 100`).all();
            const usage=db.prepare('SELECT bytes FROM uploads_usage WHERE id=1').get().bytes;
            return json(res,{posts,usage,budget:uploadBudget});
          }
          if (path==='/api/admin/moderate' && method==='POST') {
            const id=text(input.id,50);
            if (input.action==='approve') db.prepare("UPDATE posts SET status='approved' WHERE id=?").run(id);
            else if (input.action==='delete') db.prepare('DELETE FROM posts WHERE id=?').run(id);
            else throw new HttpError(400,'Неизвестное действие.');
            db.prepare('DELETE FROM reports WHERE post=?').run(id);return json(res,{ok:true});
          }
        }
        throw new HttpError(404,'Адрес не найден.');
      }
      if (path.startsWith('/media/')) {
        const id=path.slice(7);
        const row=db.prepare('SELECT image,mime,status,owner FROM posts WHERE id=? AND image IS NOT NULL').get(id);
        if (!row) throw new HttpError(404,'Картинка не найдена.');
        if (row.status!=='approved') {
          // Private pending images require the moderator key; no caching of private responses.
          checkAdmin(req);
        }
        const etag=`"${id}"`;
        res.setHeader('Cache-Control',row.status==='approved'?'public, max-age=3600':'no-store');
        if (row.status==='approved' && req.headers['if-none-match']===etag) {res.writeHead(304);return res.end();}
        res.writeHead(200,{'Content-Type':row.mime,'Content-Length':row.image.length,'ETag':etag});
        return res.end(req.method==='HEAD' ? undefined : Buffer.from(row.image));
      }
      let filePath;
      try { filePath=decodeURIComponent(path); } catch { throw new HttpError(400,'Некорректный адрес.'); }
      if (filePath.endsWith('/')) filePath+='index.html';
      const filename=resolve(publicRoot,`.${filePath}`);
      if (!filename.startsWith(publicRoot.endsWith(sep)?publicRoot:publicRoot+sep)) throw new HttpError(403,'Нет доступа.');
      const type=MIME[extname(filename)];
      if (!type) throw new HttpError(404,'Страница не найдена.');
      let cached=cache.get(filename);
      // In development refresh the cache when the source file changes.
      const info=await stat(filename);
      if (!cached || cached.mtime!==info.mtimeMs) {
        const buffer=await readFile(filename);
        cached={buffer,gz:await zip(buffer),mtime:info.mtimeMs,etag:`"${createHash('sha256').update(buffer).digest('hex').slice(0,16)}"`};cache.set(filename,cached);
      }
      const compressed=/\bgzip\b/.test(req.headers['accept-encoding']??'');
      res.setHeader('Vary','Accept-Encoding');
      res.setHeader('Cache-Control','public, max-age=0, must-revalidate');
      res.setHeader('ETag',cached.etag);
      if (req.headers['if-none-match']===cached.etag) {res.writeHead(304);return res.end();}
      const bytes=compressed?cached.gz:cached.buffer;
      if (compressed) res.setHeader('Content-Encoding','gzip');
      res.writeHead(200,{'Content-Type':type,'Content-Length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);
    } catch (error) {
      if (res.headersSent) return res.end();
      const status=error.status ?? (error.code==='ENOENT' || error.code==='ENOTDIR' ? 404:500);
      if (status===500) console.error(error);
      json(res,{error:status===500?'Что-то пошло не так. Попробуйте ещё раз.':status===404?'Не найдено.':error.message},status);
    }
  });
  server.requestTimeout=15000; server.headersTimeout=10000; server.maxHeadersCount=60;
  server.on('close',()=>db.close());
  return {server,db,dataDir};
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const {server}=await createApp();
  const portFlag=process.argv.indexOf('--port'),hostFlag=process.argv.indexOf('--host');
  const port=Number(portFlag>=0?process.argv[portFlag+1]:process.env.PORT??3000);
  const host=hostFlag>=0?process.argv[hostFlag+1]:process.env.HOST??'127.0.0.1';
  server.listen(port,host,()=>console.log(`Minute Club listening on ${JSON.stringify(server.address())}`));
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>process.exit(0)));
}
