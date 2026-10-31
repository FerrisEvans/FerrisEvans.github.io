import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../../src/scripts/room/playback.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {createPlayback}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));

test('Work opens a directory without choosing media; ejected tape never returns through navigation',()=>{
  const deck=createPlayback(12);deck.navigate('work');assert.equal(deck.state.selected,null);
  deck.select(4);deck.tick(.1,false);deck.eject();
  for(const view of ['posts','home','work'])deck.navigate(view);
  assert.deepEqual(deck.state,{selected:null,transport:'empty',time:0,powered:true,source:'home',page:0});
  assert.equal(deck.togglePlay(),false);
});
test('pause holds position, stop rewinds inserted media, eject clears it',()=>{
  const deck=createPlayback(12);deck.select(2);deck.tick(.1,true);assert.equal(deck.state.time,0);
  deck.tick(.1,false);deck.togglePlay();deck.tick(.1,false);assert.equal(deck.state.time,.1);
  assert.equal(deck.state.transport,'paused');deck.togglePlay();deck.tick(.1,false);
  assert.equal(deck.state.time,.2);deck.stop();assert.equal(deck.state.time,0);assert.equal(deck.state.selected,2);
  assert.equal(deck.state.transport,'stopped');deck.togglePlay();assert.equal(deck.state.transport,'playing');
  deck.eject();assert.equal(deck.state.transport,'empty');assert.equal(deck.state.selected,null);
});
test('power preserves TV input and transport, Posts navigation keeps a running tape',()=>{
  const deck=createPlayback(12);deck.select(3);deck.navigate('posts',2);deck.power();deck.tick(.1,false);
  assert.equal(deck.state.powered,false);assert.equal(deck.state.time,.1);deck.power();
  assert.equal(deck.state.source,'posts');assert.equal(deck.state.page,2);
  deck.navigate('home');assert.equal(deck.state.source,'tape');deck.togglePlay();deck.power();deck.power();
  assert.equal(deck.state.transport,'paused');assert.equal(deck.state.time,.1);
});
test('rapid select/eject/power sequences retain only the final selection',()=>{
  const deck=createPlayback(12);
  for(const i of [1,7,11])deck.select(i);
  deck.eject();deck.power();deck.select(5);deck.stop();deck.navigate('work');
  assert.deepEqual(deck.state,{selected:5,transport:'stopped',time:0,powered:false,source:'tape',page:0});
  deck.eject();deck.navigate('work');assert.equal(deck.state.selected,null);deck.reset();
  assert.equal(deck.state.powered,true);assert.equal(deck.state.source,'home');
});
