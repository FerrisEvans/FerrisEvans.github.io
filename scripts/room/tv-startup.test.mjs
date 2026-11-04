import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../../src/scripts/room/tv-startup.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {createTVStartup}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));

test('each TV power-on presents a new prompt; playing never requires restarting the room',()=>{
  const tv=createTVStartup();
  assert.equal(tv.play(),false);
  for(let cycle=1;cycle<=3;cycle++){
    tv.power(true,10*cycle);
    assert.equal(tv.phase,'booting');assert.equal(tv.cycle,cycle);assert.equal(tv.reveal,0);
    tv.update(10*cycle+.325);
    assert(Math.abs(tv.reveal-.5)<1e-10);assert.equal(tv.waiting,true);
    tv.update(10*cycle+1);
    assert.equal(tv.phase,'prompt');assert.equal(tv.reveal,1);assert.equal(tv.moving,false);
    tv.power(true,10*cycle+2);assert.equal(tv.phase,'prompt');assert.equal(tv.cycle,cycle,'duplicate wake must not restart the television');
    assert.equal(tv.play(),true);assert.equal(tv.phase,'playing');assert.equal(tv.waiting,false);
    tv.power(false,10*cycle+3);assert.equal(tv.phase,'off');assert.equal(tv.play(),false);
  }
});

test('reduced motion keeps the TV prompt without an animated entry barrier',()=>{
  const tv=createTVStartup();tv.power(true,0,true);
  assert.equal(tv.phase,'prompt');assert.equal(tv.moving,false);assert.equal(tv.reveal,1);
  tv.play();assert.equal(tv.phase,'playing');
  tv.power(false,1);tv.power(true,2);tv.update(2.1,true);
  assert.equal(tv.phase,'prompt');assert.equal(tv.reveal,1);
});

test('rapid off/on and early play cancel the previous television reveal',()=>{
  const tv=createTVStartup();tv.power(true,0);tv.update(.3);
  tv.power(false,.31);tv.power(true,.32);tv.update(.32);
  assert.equal(tv.reveal,0);assert.equal(tv.cycle,2);
  tv.play();tv.update(.33);assert.equal(tv.phase,'playing');assert.equal(tv.reveal,1);
  tv.power(false,.34);tv.update(100);assert.equal(tv.phase,'off');assert.equal(tv.waiting,false);
});
