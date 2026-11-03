import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/scripts/room/assets.ts', import.meta.url), 'utf8');
const compilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 };
const cacheSource = readFileSync(new URL('../../src/scripts/room/asset-cache.ts', import.meta.url), 'utf8');
const cacheModule = 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(cacheSource, { compilerOptions }).outputText).toString('base64');
const js = ts.transpileModule(source, { compilerOptions }).outputText.replace("'./asset-cache'", JSON.stringify(cacheModule));
const { RoomAssets } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const flush = () => new Promise(resolve => setImmediate(resolve));

test('legacy callers keep bundle versioning while streams keep their independent version',async t=>{
  const clock=fakeClock(),previousWindow=globalThis.window;globalThis.window=clock.window;t.after(()=>{globalThis.window=previousWindow;});
  const requests=[];t.mock.method(globalThis,'fetch',async(url,options)=>{requests.push([url,options.cache]);return new Response(new Uint8Array([1]));});
  const files=[{url:'/model?format=glb',bytes:1},{url:'/film.mp4',bytes:1,stream:true}];
  const first=new RoomAssets(files,()=>{},{version:'build one',deferred:[{url:'/lamp',bytes:1}]});
  await first.preload();await first.read('/lamp');
  assert.equal(first.mediaUrl('/film.mp4','film-hash'),'/film.mp4?v=film-hash','streamed media keeps its content hash');
  first.dispose();
  const next=new RoomAssets(files,()=>{},{version:'build-two'});await next.preload();next.dispose();
  const legacy=new RoomAssets([{url:'/legacy',bytes:1}],()=>{});await legacy.preload();legacy.dispose();
  assert.deepEqual(requests,[['/model?format=glb&v=build+one','default'],['/lamp?v=build+one','default'],['/model?format=glb&v=build-two','default'],['/legacy','no-cache']]);
});

test('model priority unlocks preparation before bulk downloads and reserves module connection slots',async t=>{
  const clock=fakeClock(),previousWindow=globalThis.window;globalThis.window=clock.window;t.after(()=>{globalThis.window=previousWindow;});
  const requests=[];let releaseModel;
  t.mock.method(globalThis,'fetch',(url,options)=>{
    requests.push([url,options.priority]);
    if(url==='/model')return new Promise(resolve=>{releaseModel=()=>resolve(new Response(new Uint8Array([1])));});
    return Promise.resolve(new Response(new Uint8Array([2])));
  });
  const assets=new RoomAssets([{url:'/model',bytes:1,priority:'high'},...Array.from({length:8},(_,i)=>({url:'/map'+i,bytes:1}))],()=>{});
  const pending=assets.preload();assert.deepEqual(requests,[['/model','high']]);
  const shared=assets.read('/model');releaseModel();await shared;await pending;
  assert.equal(requests.filter(([url])=>url==='/model').length,1);assert.equal(requests.length,9);assets.dispose();
});

function fakeClock() {
  let now = 0, id = 0;
  const timers = new Map();
  return {
    window: {
      setTimeout(fn, ms) { timers.set(++id, { fn, at: now + ms }); return id; },
      clearTimeout(key) { timers.delete(key); },
    },
    advance(ms) {
      now += ms;
      for (const [key, timer] of [...timers]) if (timer.at <= now) { timers.delete(key); timer.fn(); }
    },
    count() { return timers.size; },
  };
}

test('queued headers do not time out while another resource continues delivering bytes', async t => {
  const clock = fakeClock();
  const previousWindow = globalThis.window;
  globalThis.window = clock.window;
  t.after(() => { globalThis.window = previousWindow; });
  const requests = new Map();
  t.mock.method(globalThis, 'fetch', (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    requests.set(url, { resolve, signal });
  }));
  const samples = [];
  const assets = new RoomAssets([{ url: '/active', bytes: 4 }, { url: '/queued', bytes: 2 }], (n, total) => samples.push([n, total]));
  const done = assets.preload();
  assert.equal(requests.size, 2);
  const cached = assets.read('/active');
  assert.equal(requests.size, 2, 'shared consumers reuse the same network request');
  let stream;
  requests.get('/active').resolve(new Response(new ReadableStream({ start(controller) { stream = controller; } })));
  await flush();
  clock.advance(45000);
  stream.enqueue(new Uint8Array([1, 2]));
  await flush();
  clock.advance(45000); // Queued headers have waited 90 seconds, but the bundle is progressing.
  assert.equal(requests.get('/queued').signal.aborted, false);
  stream.enqueue(new Uint8Array([3, 4]));
  stream.close();
  requests.get('/queued').resolve(new Response(new Uint8Array([5, 6])));
  await done;
  assert.deepEqual([...new Uint8Array(await cached)], [1, 2, 3, 4]);
  assert.deepEqual(samples.at(-1), [6, 6]);
  assert(samples.every((sample, i) => i === 0 || sample[0] >= samples[i - 1][0]));
  assert.equal(clock.count(), 0);
  assets.dispose();
});

test('a bundle with no activity fails and disposal aborts pending requests', async t => {
  const clock = fakeClock();
  const previousWindow = globalThis.window;
  globalThis.window = clock.window;
  t.after(() => { globalThis.window = previousWindow; });
  t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error(String(signal.reason))), { once: true });
  }));
  const assets = new RoomAssets([{ url: '/stalled', bytes: 1 }], () => {});
  const failed = assert.rejects(assets.preload(), /Resource stalled/);
  clock.advance(60001);
  await failed;
  assert.equal(clock.count(), 0);
  const leaving = new RoomAssets([{ url: '/leaving', bytes: 1 }], () => {});
  const cancelled = assert.rejects(leaving.preload(), /AbortError/);
  leaving.dispose();
  await cancelled;
  assert.equal(clock.count(), 0);
});

test('deferred maps do not preload or change first-frame progress; failed maps can retry', async t => {
  const clock=fakeClock(), previousWindow=globalThis.window;
  globalThis.window=clock.window;t.after(()=>{globalThis.window=previousWindow;});
  const requests=[], samples=[];let fail=true;
  t.mock.method(globalThis,'fetch',async url=>{
    requests.push(url);
    if(url==='/off'&&fail){fail=false;return new Response('',{status:503});}
    return new Response(new Uint8Array(url==='/main'?[1,2]:[3,4,5]));
  });
  const assets=new RoomAssets([{url:'/main',bytes:2}],(n,total)=>samples.push([n,total]),{deferred:[{url:'/off',bytes:3}]});
  await assets.preload();assert.deepEqual(requests,['/main']);assert.equal(assets.total,2);
  await assert.rejects(assets.read('/off'),/503/);
  const a=assets.read('/off'),b=assets.read('/off');assert.equal(a,b);
  assert.deepEqual([...new Uint8Array(await a)],[3,4,5]);
  assert.deepEqual(samples,[[2,2]]);assert.deepEqual(requests,['/main','/off','/off']);
  assets.dispose();await assert.rejects(assets.read('/off'),/AbortError/);
});

test('a deferred timeout can retry without reviving a disposed loader', async t=>{
  const clock=fakeClock(),previousWindow=globalThis.window;
  globalThis.window=clock.window;t.after(()=>{globalThis.window=previousWindow;});
  let attempts=0;
  t.mock.method(globalThis,'fetch',(_url,{signal})=>{
    attempts++;
    if(attempts===1)return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error(String(signal.reason))),{once:true}));
    assert.equal(signal.aborted,false);return Promise.resolve(new Response(new Uint8Array([8])));
  });
  const assets=new RoomAssets([],()=>{},{deferred:[{url:'/off',bytes:1}]});
  const first=assert.rejects(assets.read('/off'),/Resource stalled/);clock.advance(60001);await first;
  assert.deepEqual([...new Uint8Array(await assets.read('/off'))],[8]);
  assets.dispose();await assert.rejects(assets.read('/off'),/AbortError/);assert.equal(attempts,2);
});

test('streamed media bypasses the full-file preload and byte gate and uses only an allowlisted versioned URL',async t=>{
  const clock=fakeClock(),previousWindow=globalThis.window;
  globalThis.window=clock.window;t.after(()=>{globalThis.window=previousWindow;});
  const requests=[],samples=[];
  t.mock.method(globalThis,'fetch',async url=>{requests.push(url);return new Response(new Uint8Array([1,2,3]));});
  const assets=new RoomAssets([{url:'/light.json',bytes:3},{url:'/film.mp4',bytes:6101941,stream:true}],(n,total)=>samples.push([n,total]));
  await assets.preload();
  assert.deepEqual(requests,['/light.json']);assert.equal(assets.total,3);assert.deepEqual(samples,[[3,3]]);
  assert.equal(assets.mediaUrl('/film.mp4','new-sha'),'/film.mp4?v=new-sha');
  assert.throws(()=>assets.read('/film.mp4'),/Streamed media must use mediaUrl/);
  assert.throws(()=>assets.mediaUrl('/unlisted.mp4'),/Unlisted streamed/);
  assert.throws(()=>assets.mediaUrl('/light.json'),/Unlisted streamed/);
  assert.equal(assets.activeRequests,0);assert(assets.lastNetworkActivity>0);
  assets.release();assert.equal(assets.mediaUrl('/film.mp4','new-sha'),'/film.mp4?v=new-sha','releasing JS buffers must not end film playback');
  assets.dispose();assert.throws(()=>assets.mediaUrl('/film.mp4'),{name:'AbortError'});assert.equal(clock.count(),0);
});

test('streamed URLs cannot escape the same-origin room asset allowlist',()=>{
  for(const url of ['https://example.com/film.mp4','//example.com/film.mp4','/\\example.com/film.mp4']){
    const assets=new RoomAssets([{url,bytes:1,stream:true}],()=>{});
    assert.throws(()=>assets.mediaUrl(url),/must be local/);
  }
});

test('background detail reads stay low priority and release buffers without aborting other assets',async t=>{
 const clock=fakeClock(),previousWindow=globalThis.window;globalThis.window=clock.window;t.after(()=>{globalThis.window=previousWindow;});
 const requests=[];t.mock.method(globalThis,'fetch',async(url,options)=>{requests.push([url,options.priority]);return new Response(new Uint8Array([1]));});
 const assets=new RoomAssets([{url:'/base',bytes:1}],()=>{},{deferred:[{url:'/detail',bytes:1},{url:'/lamp',bytes:1}]});
 const base=assets.read('/base');await base;await assets.read('/detail','low');const lamp=assets.read('/lamp');await lamp;
 assets.release('/detail');assert.equal(assets.read('/base'),base);assert.equal(assets.read('/lamp'),lamp);
 await assets.read('/detail','low');assert.deepEqual(requests,[['/base','auto'],['/detail','low'],['/lamp','auto'],['/detail','low']]);assets.dispose();
});

function cacheGlobals(t,cache,clock){
 const values={window:clock.window,location:{href:'https://room.test/'},caches:{open:async()=>cache}};
 for(const [name,value]of Object.entries(values)){
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,name);
  Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});
  t.after(()=>{if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];});
 }
}

test('disposing while a persistent cache write is pending still rejects the asset read',
 {concurrency:false,timeout:5000},async t=>{
  const clock=fakeClock(),bytes=new Uint8Array([1,2,3]);
  const file={url:'/room/model.bin',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  let releasePut,notifyPut;
  const putStarted=new Promise(resolve=>{notifyPut=resolve;});
  cacheGlobals(t,{match:async()=>undefined,put:async()=>{
   notifyPut();await new Promise(resolve=>{releasePut=resolve;});
  }},clock);
  t.mock.method(globalThis,'fetch',async()=>new Response(bytes));
  const assets=new RoomAssets([file],()=>{});
  try{
   const cancelled=assert.rejects(assets.read(file.url),{name:'AbortError'});
   await putStarted;
   assert.equal(assets.activeRequests,1,'the verified response is still waiting for its disk write');
   assets.dispose();releasePut();
   await cancelled;
   assert.equal(assets.activeRequests,0);
   assert.equal(clock.count(),0);
   await assert.rejects(assets.read(file.url),{name:'AbortError'});
  }finally{releasePut?.();assets.dispose();}
 });

test('an older manifest cannot prune persistent paths introduced by a newer open page',
 {concurrency:false,timeout:5000},async t=>{
  const clock=fakeClock(),bytes=new Uint8Array([7,8,9]);
  const sha256=createHash('sha256').update(bytes).digest('hex'),entries=new Map();
  const keyOf=key=>typeof key==='string'?key:key.url;
  cacheGlobals(t,{
   match:async key=>entries.get(keyOf(key))?.clone(),
   put:async(key,response)=>{entries.set(keyOf(key),response.clone());},
   keys:async()=>[...entries.keys()].map(key=>new Request(key)),
   delete:async key=>entries.delete(keyOf(key)),
  },clock);
  const requests=[];
  t.mock.method(globalThis,'fetch',async url=>{requests.push(url);return new Response(bytes);});
  const existing={url:'/room/existing.webp',bytes:bytes.length,sha256};
  const added={url:'/room/new-detail.webp',bytes:bytes.length,sha256};
  const newer=new RoomAssets([existing,added],()=>{});
  const older=new RoomAssets([existing],()=>{});
  const reopened=new RoomAssets([existing,added],()=>{});
  try{
   await newer.preload();
   assert.equal(requests.length,2);
   await older.preload(); // Its prune runs after the newer page has populated both paths.
   assert(entries.has(`https://room.test${added.url}?v=${sha256}`),'the new-only asset must survive the older manifest');
   assert.deepEqual([...new Uint8Array(await reopened.read(added.url))],[...bytes]);
   assert.equal(requests.length,2,'a fresh loader must read the new path from persistent storage');
   assert.equal(reopened.cacheStats.cacheHits,1);
  }finally{newer.dispose();older.dispose();reopened.dispose();}
 });
