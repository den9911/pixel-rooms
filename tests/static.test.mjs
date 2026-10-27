import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('standalone static configuration and local entry points',async()=>{
  const html=await readFile('public/index.html','utf8');assert.match(html,/lang="ru"/);assert.match(html,/type="module"/);assert.doesNotMatch(html,/<script[^>]+src="https?:/);
  const {project}=await import('../public/shared/project.js');
  if(!project)return; // Combined and server packages obtain their configuration over their own API.
  assert.equal(project.apps.length,1);
  const slug=project.apps[0][0];assert.match(html,new RegExp(`data-app="${slug}"`));
  const app=await readFile(`public/${slug}/app.js`,'utf8');assert.doesNotMatch(app,/\bfetch\s*\(/);assert.doesNotMatch(app,/\bapi\s*\(/);
  await readFile('public/about/index.html','utf8');
  const boot=await readFile('public/shared/main.js','utf8');assert.match(boot,/project\?\?await api/);
});
