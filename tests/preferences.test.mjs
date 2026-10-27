import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { resolveLanguage,resolveTheme } from '../public/shared/preferences-model.js';

test('browser language negotiation and explicit preferences',()=>{
  assert.equal(resolveLanguage(null,['es-MX','en-US']),'es');
  assert.equal(resolveLanguage(null,['ru-RU','es']),'ru');
  assert.equal(resolveLanguage(null,['fr-FR','es-ES']),'es');
  assert.equal(resolveLanguage(null,['fr-FR']),'en');
  assert.equal(resolveLanguage('en',['ru-RU']),'en');
  assert.equal(resolveLanguage('bad',['ES-es']),'es');
  assert.equal(resolveTheme('system',true),'dark');assert.equal(resolveTheme('system',false),'light');
  assert.equal(resolveTheme('light',true),'light');assert.equal(resolveTheme('dark',false),'dark');
});

test('theme is applied before paint, even when storage is blocked',async()=>{
  const source=await readFile('public/shared/preferences.js','utf8');
  for(const [saved,preferred,dark,blocked,expectedLanguage,expectedTheme] of [
    [{},['es-ES'],true,false,'es','dark'],
    [{language:'ru',theme:'light'},['en-US'],true,false,'ru','light'],
    [{},['fr','en-US'],false,true,'en','light'],
  ]){
    const root={dataset:{},style:{}};
    runInNewContext(source,{localStorage:{getItem(){if(blocked)throw new Error('blocked');return JSON.stringify(saved);}},navigator:{languages:preferred},document:{documentElement:root},matchMedia:()=>({matches:dark})});
    assert.equal(root.lang,expectedLanguage);assert.equal(root.dataset.theme,expectedTheme);assert.equal(root.style.colorScheme,expectedTheme);
  }
});

test('editorial translation preserves user content and stable server identifiers',async()=>{
  for(const language of ['en','es','ru']){
    const {localizeResponse,localizeError,categories}=await import(`../public/locales/${language}/shared/editorial.js`);
    assert.equal(categories[0].value,'Вывески');
    if(language!=='ru')assert.doesNotMatch(categories[0].label,/[А-Яа-яЁё]/);
    const userPost={id:'user-post',title:'Мой Rust-проект',body:'Mi texto original',category:'Вывески'};
    const result=localizeResponse('/api/find',{...userPost});assert.equal(result.title,userPost.title);assert.equal(result.body,userPost.body);assert.equal(result.category,userPost.category);
    const poll={title:'Куда пойдём?',options:['Домой','Al parque'],choice:null,counts:[]};
    assert.deepEqual(localizeResponse('/api/poll?id=example',poll),poll);
    const game=localizeResponse('/api/minute',{word:'дом',odd:'дым',cells:['дом','дым','дом'],day:'2026-10-27'});
    assert.notEqual(game.cells[0],game.cells[1]);assert.equal(game.cells[0],game.cells[2]);assert.equal(game.day,'2026-10-27');
    const message=localizeError('Ваш голос уже учтён.');if(language!=='ru')assert.doesNotMatch(message,/[А-Яа-яЁё]/);
    assert.equal(localizeError('unrecognized message'),'unrecognized message');
    assert.match(localizeError('Введите от 2 до 10 символов.'),/2.*10/);
  }
});

function luminance(hex){const rgb=hex.match(/[\da-f]{2}/gi).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
function contrast(a,b){const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (values[0]+.05)/(values[1]+.05);}
test('core text, muted text, buttons, and accents meet 4.5:1 in both themes',()=>{
  for(const [bg,fg,muted,solid,onSolid,accent] of [['#fffdf7','#202c34','#53636d','#263940','#fffdf7','#b84024'],['#192832','#edf2ec','#b6c7cc','#dceadf','#13232a','#ffb18c']]){
    for(const color of [fg,muted,accent])assert.ok(contrast(bg,color)>=4.5,`${bg}/${color}`);
    assert.ok(contrast(solid,onSolid)>=4.5);
  }
});
