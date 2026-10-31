import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../../src/scripts/room/home-program.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {createHomeTimeline,homeDuration,isHomePlaying}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));

test('Home and TV viewing share the clock; navigation, power and reduced motion gate it',()=>{
  const film=createHomeTimeline();
  const state={view:'home',source:'home',powered:true,active:true,motion:true,hidden:false};
  const tick=()=>film.tick(.0625,isHomePlaying(state));
  tick();state.view='tv';tick();state.view='home';tick();
  assert.equal(film.time,.1875,'approaching and leaving the TV must not freeze or reset the film');
  for(const view of ['posts','work','about','online','window','cd']){state.view=view;tick();}
  assert.equal(film.time,.1875);
  state.view='tv';state.source='posts';tick();state.source='tape';tick();
  state.source='home';
  for(const key of ['powered','active','motion']){state[key]=false;tick();state[key]=true;}
  state.hidden=true;tick();state.hidden=false;
  assert.equal(film.time,.1875,'non-viewing states preserve the playback position');
  tick();assert.equal(film.time,.25,'TV resumes the existing Home position');
});

test('Home film resumes its position after repeated inactive intervals and resets only on standby',()=>{
  const film=createHomeTimeline();
  for(let i=0;i<150;i++)film.tick(1/30,true);
  const position=film.time;
  for(let cycle=0;cycle<12;cycle++){
    for(let i=0;i<60;i++)film.tick(1/30,false);
    assert.equal(film.time,position+cycle*.0625);
    film.tick(.0625,true);
  }
  film.reset();assert.equal(film.time,0);
});
test('reduced motion allows an explicit Home play request without bypassing navigation, power or visibility',()=>{
  const state={view:'home',source:'home',powered:true,active:true,motion:false,hidden:false,requested:null};
  assert.equal(isHomePlaying(state),false);
  state.requested=true;assert.equal(isHomePlaying(state),true);
  state.view='tv';assert.equal(isHomePlaying(state),true);
  for(const change of [{view:'posts'},{source:'tape'},{powered:false},{active:false},{hidden:true}])assert.equal(isHomePlaying({...state,...change}),false);
  state.requested=false;assert.equal(isHomePlaying(state),false);
  state.motion=true;assert.equal(isHomePlaying(state),false,'an explicit pause survives a preference change');
  state.requested=null;assert.equal(isHomePlaying(state),true);
});
test('film wraps after the edit sequence and does not seek across a long scheduling gap',()=>{
  const film=createHomeTimeline();
  for(let i=0;i<homeDuration*16+8;i++)film.tick(1/16,true);
  assert.equal(film.time,.5);film.tick(80,false);assert.equal(film.time,.5);
  film.tick(10,true);assert.equal(film.time,.6);film.tick(-1,true);assert.equal(film.time,.6);
});
