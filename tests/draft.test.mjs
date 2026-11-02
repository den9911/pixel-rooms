import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readRoomDraft,hasConflict,roomDraft} from '../public/house/draft.js';
const pixels='a'.repeat(256);
test('room drafts preserve their actual baseline across reload and newer server versions',()=>{
 const draft=readRoomDraft(roomDraft(pixels,'Draft','room-a',1));
 assert.equal(hasConflict(draft,{id:'room-a',version:1}),false);
 assert.equal(hasConflict(draft,{id:'room-a',version:2}),true);
 assert.equal(draft.baseVersion,1);
 assert.equal(hasConflict(draft,{id:'room-b',version:1}),true);
 assert.equal(hasConflict(draft,null),true);
 const fresh=readRoomDraft(roomDraft(pixels,'New',null,null));
 assert.equal(hasConflict(fresh,null),false);assert.equal(hasConflict(fresh,{id:'room-a',version:1}),true);
});
test('legacy drafts require a decision for existing rooms; invalid pixels never reach canvas',()=>{
 const legacy=readRoomDraft({pixels,name:'Old'});
 assert.equal(hasConflict(legacy,{id:'room-a',version:4}),true);
 assert.equal(hasConflict(legacy,null),false);
 for(const value of [null,[],{pixels:Array(256).fill('a'),name:'x'},{pixels:'z'.repeat(256),name:'x'},{pixels,name:3},{schema:2,pixels,name:'x'},{schema:1,pixels,name:'x',roomId:null,baseVersion:1}])assert.equal(readRoomDraft(value),null);
});
