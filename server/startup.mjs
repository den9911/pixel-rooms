import {access,stat,open,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
export async function checkStartup({dataDir=process.env.DATA_DIR??'./data',port=Number(process.env.PORT??3000),host=process.env.HOST??'127.0.0.1',env=process.env}={}){
 if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Choose a port from 0 to 65535 / Укажите допустимый порт');
 try{new Intl.DateTimeFormat('en',{timeZone:env.APP_TIMEZONE??'Europe/Moscow'});}catch{throw new Error('Invalid APP_TIMEZONE / Неверный часовой пояс');}
 if(env.PUBLIC_ORIGIN){try{const u=new URL(env.PUBLIC_ORIGIN);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error();}catch{throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin without credentials / Укажите HTTP(S) origin без секретов');}}
 if(env.APP_ID&&!['caption','majority','arena','decide','house','minute','finds','memory','papers','mischief'].includes(env.APP_ID))throw new Error('Unknown APP_ID / Неизвестный проект');
 const budget=Number(env.UPLOAD_BUDGET_BYTES??0);if(!Number.isSafeInteger(budget)||budget<0)throw new Error('Invalid UPLOAD_BUDGET_BYTES / Неверный бюджет файлов');
 const target=resolve(dataDir);let parent=target;
 try{while(true){try{const s=await stat(parent);if(!s.isDirectory())throw new Error('not a directory');break;}catch(e){if(e.code!=='ENOENT')throw e;const next=dirname(parent);if(next===parent)throw e;parent=next;}}
  const probe=join(parent,'.startup-'+randomUUID());const file=await open(probe,'wx',0o600);await file.close();await unlink(probe);
  try{await access(join(target,'minute.sqlite'),constants.W_OK);if(!(await stat(join(target,'minute.sqlite'))).isFile())throw new Error('Database path must be a file');}catch(e){if(e.code!=='ENOENT')throw e;}
 }catch{throw new Error('Data path unavailable; choose a writable directory / Выберите доступный каталог данных');}
 const socket=createServer();try{await new Promise((done,reject)=>{socket.once('error',reject);socket.listen(port,host,done);});}catch{throw new Error('Local address unavailable; stop the other instance or check HOST/PORT / Адрес недоступен: проверьте HOST/PORT');}finally{if(socket.listening)await new Promise(done=>socket.close(done));}
 return {dataDir:target,port,host};
}
