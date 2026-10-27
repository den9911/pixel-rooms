import { SourceTextModule } from 'node:vm';
import { readFile } from 'node:fs/promises';
for(const file of process.argv.slice(2))new SourceTextModule(await readFile(file,'utf8'),{identifier:file});
