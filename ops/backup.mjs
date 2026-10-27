import { DatabaseSync, backup } from 'node:sqlite';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const source=resolve(process.env.DATA_DIR??'./data','minute.sqlite');
const output=process.argv[2];
if(!output)throw new Error('Usage: node ops/backup.mjs /absolute/path/to/backup.sqlite');
await mkdir(resolve(output,'..'),{recursive:true});
const db=new DatabaseSync(source,{readOnly:true});
try{await backup(db,resolve(output));console.log(`Backup complete: ${resolve(output)}`);}finally{db.close();}
