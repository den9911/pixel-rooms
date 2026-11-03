import {test} from 'node:test';import assert from 'node:assert/strict';
import {floodFill,brush,mirroredCells} from '../public/house/tools.js';
test('fill respects connected components and does not cross a diagonal or row edge',()=>{
 const original='0'.repeat(256);assert.equal(floodFill(original,0,'a'),'a'.repeat(256));assert.equal(original,'0'.repeat(256));
 let separated='1'.repeat(256).split('');separated[15]='0';separated[16]='0';separated=separated.join('');
 const filled=floodFill(separated,15,'a');assert.equal(filled[15],'a');assert.equal(filled[16],'0');assert.equal(floodFill(filled,15,'a'),filled);
});
test('brush symmetry mirrors within the grid and preserves the 256-cell format',()=>{
 assert.deepEqual(mirroredCells(0,'both'),[0,15,240,255]);
 for(const mode of ['off','horizontal','vertical','both'])for(const i of [0,15,120,255]){const cells=mirroredCells(i,mode);assert(cells.every(n=>n>=0&&n<256));assert.equal(new Set(cells).size,cells.length);}
 assert.equal([...brush('0'.repeat(256),0,'a','both')].filter(c=>c==='a').length,4);
});
