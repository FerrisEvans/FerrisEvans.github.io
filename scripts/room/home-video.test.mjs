import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
async function module(name){const source=readFileSync(new URL(`../../src/scripts/room/${name}.ts`,import.meta.url),'utf8');return import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));}
const {createVideoTransport}=await module('home-video-transport');
const {isHomePlaying}=await module('home-program');
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
function media(){return{paused:true,currentTime:7.5,readyState:4,seeking:false,starts:0,play(){this.starts++;this.paused=false;return Promise.resolve();},pause(){this.paused=true;}};}

test('actual media transport shares Home/TV, retains position, and pauses all non-viewing states',async()=>{
  const video=media(),film=createVideoTransport(video);
  const state={view:'home',source:'home',powered:true,active:true,motion:true,hidden:false};
  const update=()=>film.setPlaying(isHomePlaying(state));
  update();await flush();video.currentTime=8;
  for(const view of ['tv','home','tv']){state.view=view;update();assert.equal(film.playing,true);assert.equal(film.time,8);}
  assert.equal(video.starts,1,'moving the camera must neither restart nor seek video');
  for(const view of ['posts','work','about','online','window','cd']){state.view=view;update();assert.equal(video.paused,true);assert.equal(film.time,8);}
  state.view='tv';update();await flush();assert.equal(video.starts,2);assert.equal(film.time,8);
  for(const key of ['powered','active','motion']){state[key]=false;update();assert.equal(film.playing,false);state[key]=true;update();await flush();assert.equal(film.time,8);}
  state.hidden=true;update();assert.equal(video.paused,true);state.hidden=false;update();await flush();
  state.source='tape';update();assert.equal(film.playing,false);state.source='posts';update();assert.equal(film.playing,false);
  film.reset();assert.equal(film.time,0);assert.equal(video.paused,true);
});
test('late play promises cannot restart a hidden or disposed film; decode stalls stop the score clock',async()=>{
  const video=media();let resolve;
  video.play=function(){this.starts++;return new Promise(done=>{resolve=()=>{this.paused=false;done();};});};
  const film=createVideoTransport(video);film.setPlaying(true);film.setPlaying(false);resolve();await flush();assert.equal(video.paused,true);
  film.setPlaying(true);resolve();await flush();assert.equal(film.playing,true);
  video.readyState=2;assert.equal(film.playing,false);video.readyState=4;video.seeking=true;assert.equal(film.playing,false);
  film.dispose();assert.equal(video.paused,true);film.setPlaying(true);assert.equal(video.paused,true);
});
test('a rejected play does not create a promise every render, but a new viewing intent can retry',async()=>{
  const video=media();video.play=function(){this.starts++;return Promise.reject(new Error('blocked'));};
  const film=createVideoTransport(video);film.setPlaying(true);await flush();
  for(let i=0;i<100;i++)film.setPlaying(true);
  assert.equal(video.starts,1);assert.equal(film.failed,true);
  film.setPlaying(false);film.setPlaying(true);await flush();assert.equal(video.starts,2);
});

test('an older cancelled play cannot block a newer Home viewing intent',async()=>{
  const video=media();let reject;
  video.play=function(){this.starts++;return new Promise((_,fail)=>{reject=fail;});};
  const film=createVideoTransport(video);
  film.setPlaying(true);film.setPlaying(false);film.setPlaying(true);
  reject(new Error('play interrupted by pause'));await flush();
  assert.equal(film.failed,false);assert.equal(video.starts,1);
  video.play=function(){this.starts++;this.paused=false;return Promise.resolve();};
  film.setPlaying(true);await flush();
  assert.equal(video.starts,2);assert.equal(film.playing,true);assert.equal(film.time,7.5);
});
