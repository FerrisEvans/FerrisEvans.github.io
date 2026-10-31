import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const compile=name=>ts.transpileModule(readFileSync(new URL(`../../src/scripts/room/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const moduleUrl=js=>'data:text/javascript;base64,'+Buffer.from(js).toString('base64');
const three=new URL('../../node_modules/three/build/three.module.js',import.meta.url).href;
const js=compile('home-video').replace("'three'",JSON.stringify(three)).replace("'./home-video-transport'",JSON.stringify(moduleUrl(compile('home-video-transport'))));
const {homeBufferedAhead,waitForHomeVideoReady,createHomeVideo}=await import(moduleUrl(js));
const {createLoadTimings}=await import(moduleUrl(compile('load-timings')));
const manifest={video:'/room/film/night-log.mp4',poster:'/poster.webp',light:'/light.json',duration:48,fps:24,width:960,height:720,posterTime:7,files:{'night-log.mp4':{bytes:6101941,sha256:'content-hash'}}};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const lightBytes=()=>new TextEncoder().encode(JSON.stringify({fps:24,duration:48,colorSpace:'linear-srgb',frames:Array.from({length:1152},(_,i)=>[i/1152,.2,.3])})).buffer;

class Video extends EventTarget {
  paused=true;currentTime=0;readyState=0;seeking=false;duration=NaN;videoWidth=0;videoHeight=0;error=null;
  ranges=[];src='';loads=0;starts=0;
  get buffered(){const ranges=this.ranges;return{length:ranges.length,start:i=>ranges[i][0],end:i=>ranges[i][1]};}
  playable(ahead=4){this.readyState=3;this.duration=48;this.videoWidth=960;this.videoHeight=720;this.ranges=[[0,ahead]];}
  event(name){this.dispatchEvent(new Event(name));}
  pause(){this.paused=true;}
  play(){this.starts++;this.paused=false;return Promise.resolve();}
  load(){this.loads++;}
  removeAttribute(name){if(name==='src')this.src='';}
  getVideoPlaybackQuality(){return{totalVideoFrames:24,droppedVideoFrames:0};}
}
function clockFor(t){
  const oldWindow=globalThis.window;let time=0,next=0;const timers=new Map();
  globalThis.window={setTimeout(fn,ms){timers.set(++next,{fn,at:time+ms});return next;},clearTimeout(id){timers.delete(id);}};
  t.after(()=>{globalThis.window=oldWindow;});
  return{now:()=>time,count:()=>timers.size,advance(ms){time+=ms;for(const [id,timer] of [...timers])if(timer.at<=time){timers.delete(id);timer.fn();}}};
}
function documentFor(t,video){const previous=globalThis.document;globalThis.document={createElement(name){assert.equal(name,'video');return video;}};t.after(()=>{globalThis.document=previous;});}
function assetsFor(read=async()=>lightBytes()){
  return{activeRequests:0,lastNetworkActivity:0,read,mediaUrl(url,hash){assert.equal(url,manifest.video);assert.equal(hash,'content-hash');return url+'?v='+hash;}};
}

test('initial readiness requires metadata, future data and 4 contiguous seconds, not a canplaythrough hint or distant range',async t=>{
  const clock=clockFor(t),video=new Video();let done=false;
  const ready=waitForHomeVideoReady(video,manifest,{now:clock.now}).then(()=>{done=true;});
  video.playable(3.9);video.readyState=4;video.event('canplaythrough');await flush();assert.equal(done,false);
  video.ranges=[[0,2],[3,48]];assert.equal(homeBufferedAhead(video),2);video.event('progress');await flush();assert.equal(done,false);
  video.ranges=[[0,4.2]];video.seeking=true;video.event('canplay');await flush();assert.equal(done,false);
  video.seeking=false;video.event('seeked');await ready;assert.equal(done,true);assert.equal(clock.count(),0);
});

test('bad duration or dimensions fail before exposing a ready video texture',async t=>{
  const clock=clockFor(t);
  for(const invalid of [{duration:Infinity},{duration:47},{videoWidth:1280},{videoHeight:540}]){
    const video=new Video();video.playable(48);Object.assign(video,invalid);
    await assert.rejects(waitForHomeVideoReady(video,manifest,{now:clock.now}),/metadata differs/);
  }
  assert.equal(clock.count(),0);
});

test('progress and productive queued bundle traffic extend the idle deadline, but a true stall fails',async t=>{
  const clock=clockFor(t),video=new Video();let activity=0;
  const ready=waitForHomeVideoReady(video,manifest,{now:clock.now,activity:()=>activity});
  const rejected=assert.rejects(ready,/initial buffering stalled/);
  clock.advance(30000);activity=clock.now();clock.advance(30000);await flush();
  assert.equal(clock.count(),1,'the native connection can wait behind active atlas downloads');
  video.playable(2);video.event('progress');clock.advance(30000);await flush();
  assert.equal(clock.count(),1,'partial media progress starts a fresh idle deadline');
  clock.advance(16000);await rejected;assert.equal(clock.count(),0);
});

test('abort and native decode failure settle once and remove loading event listeners',async t=>{
  const clock=clockFor(t),video=new Video(),aborter=new AbortController(),timing=createLoadTimings({now:clock.now});
  const ready=assert.rejects(waitForHomeVideoReady(video,manifest,{signal:aborter.signal,now:clock.now,timing}),{name:'AbortError'});
  aborter.abort();await ready;const count=timing.snapshot().entries.length;
  video.playable(48);video.event('progress');assert.equal(timing.snapshot().entries.length,count);assert.equal(clock.count(),0);
  const failed=new Video();failed.error={code:3};await assert.rejects(waitForHomeVideoReady(failed,manifest,{now:clock.now}),/media error 3/);
});

test('native HTTP film uses no Blob or MP4 JS buffer, keeps the media clock and releases its request on exit',async t=>{
  const clock=clockFor(t),video=new Video(),aborter=new AbortController();documentFor(t,video);
  t.mock.method(URL,'createObjectURL',()=>{throw new Error('A streamed film must not create a Blob URL');});
  const reads=[];const assets=assetsFor(async url=>{reads.push(url);return lightBytes();});
  const filmTask=createHomeVideo(manifest,assets,{},aborter.signal);
  assert.equal(video.src,'/room/film/night-log.mp4?v=content-hash');assert.equal(video.preload,'auto');
  video.playable(4.25);video.event('canplay');const film=await filmTask;
  assert.deepEqual(reads,['/light.json']);assert.equal(video.starts,0,'readiness must not play or advance the opening shot');assert.equal(film.time,0);
  film.setPlaying(true);await flush();video.currentTime=17.5;assert.equal(film.time,17.5);assert.equal(film.playing,true);
  assert.equal(film.color().r,420/1152);assert.equal(film.color(true).r,168/1152);
  video.readyState=2;assert.equal(film.playing,false,'underflow pauses the score until media can progress');
  video.readyState=3;video.error={code:3};assert.equal(film.playing,false);assert.equal(film.failed,true);
  let disposed=0;film.texture.addEventListener('dispose',()=>disposed++);
  aborter.abort();assert.equal(video.src,'');assert.equal(video.paused,true);assert.equal(video.loads,2);assert.equal(disposed,1);
  film.dispose();assert.equal(disposed,1);assert.equal(video.loads,2);assert.equal(clock.count(),0);
});

test('leaving after media readiness while the LUT is pending still cancels setup and the native request',async t=>{
  const clock=clockFor(t),video=new Video(),aborter=new AbortController();documentFor(t,video);
  let resolveLight;const assets=assetsFor(()=>new Promise(resolve=>{resolveLight=resolve;}));
  const filmTask=createHomeVideo(manifest,assets,{},aborter.signal),rejected=assert.rejects(filmTask,{name:'AbortError'});
  video.playable();video.event('canplay');await flush();assert.equal(clock.count(),0);
  aborter.abort();await rejected;assert.equal(video.src,'');assert.equal(video.paused,true);
  resolveLight(lightBytes());await flush();assert.equal(video.starts,0);assert.equal(video.src,'');
});

test('a rejected LUT or synchronous asset error cancels the native download without an orphan readiness promise',async t=>{
  const clock=clockFor(t);
  for(const read of [()=>{throw new Error('missing light asset');},async()=>new TextEncoder().encode('{"colorSpace":"srgb"}').buffer]){
    const video=new Video();documentFor(t,video);
    await assert.rejects(createHomeVideo(manifest,assetsFor(read),{}),/missing light asset|Invalid Home film light table/);
    assert.equal(video.src,'');assert.equal(video.paused,true);assert.equal(clock.count(),0);
  }
});
