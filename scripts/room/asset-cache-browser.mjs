import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import ts from 'typescript';

const cacheName='praxis-room-assets-v1';
const model='/room/materials/cache-test-model.glb.bin';
const atlas='/room/materials/cache-test-albedo.webp';
const lampOff='/room/materials/cache-test-lamp-off.webp';
const stream='/room/film/cache-test.mp4';
const hash=body=>createHash('sha256').update(body).digest('hex');

/** Real Window CacheStorage, native HTTP and a restarted persistent Chromium
 * profile. The temporary origin/profile never touches the user's site cache.
 */
export async function verifyRoomAssetCache(){
  const modules=new Map();
  for(const name of ['assets','asset-cache']){
    const source=await readFile(new URL(`../../src/scripts/room/${name}.ts`,import.meta.url),'utf8');
    modules.set(name,ts.transpileModule(source,{
      compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022},
    }).outputText);
  }
  const bodies=new Map([
    [model,Buffer.from('model geometry version one')],
    [atlas,Buffer.from('unchanged shared texture bytes')],
    [lampOff,Buffer.from('deferred lamp-off illumination bytes')],
  ]);
  let contentVersion=1;
  let corruptModelResponses=0;
  let cacheModelResponse=false;
  const requests=[],documents=[],pageErrors=[];
  const files=()=>[...bodies].map(([url,body])=>({url,bytes:body.length,sha256:hash(body),
    ...(url===model?{priority:'high'}:{}),...(url===lampOff?{deferred:true}:{})}));
  const expected=()=>Object.fromEntries([...bodies].map(([url,body])=>[url,body.toString()]));
  const server=createServer((request,response)=>{
    const url=new URL(request.url,'http://localhost'),path=url.pathname;
    // A request made by fetch must reach this server even after a restart.
    // A passing cache hit therefore cannot be an HTTP cache hit in disguise.
    response.setHeader('Cache-Control','no-store, max-age=0');
    response.setHeader('Expires','Thu, 01 Jan 1970 00:00:00 GMT');
    const module=path.match(/^\/modules\/([a-z-]+)(?:\.js)?$/)?.[1];
    if(module&&modules.has(module)){
      response.writeHead(200,{'Content-Type':'text/javascript'});response.end(modules.get(module));return;
    }
    if(bodies.has(path)){
      requests.push({path,query:url.search,version:[...url.searchParams.values()],cacheControl:request.headers['cache-control']??''});
      const corrupt=path===model&&corruptModelResponses>0;
      if(corrupt)corruptModelResponses--;
      const original=bodies.get(path),body=corrupt?Buffer.alloc(original.length,120):original;
      // The recovery cases deliberately poison a fresh native HTTP cache entry.
      // Retrying force-cache would return it forever without reaching this server.
      if(path===model&&cacheModelResponse){response.setHeader('Cache-Control','public, max-age=3600');response.removeHeader('Expires');}
      response.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':body.length});response.end(body);return;
    }
    if(path===stream){requests.push({path,query:url.search});response.writeHead(200,{'Content-Type':'video/mp4'});response.end('stream fixture');return;}
    if(path==='/'||path==='/posts/cache-fixture/'){
      documents.push({path,version:contentVersion});
      const manifest=[...files(),{url:stream,bytes:1000000,stream:true,sha256:hash('stream fixture')}];
      response.writeHead(200,{'Content-Type':'text/html'});
      response.end(`<!doctype html><title>Content ${contentVersion}</title><h1>Content ${contentVersion}</h1>
        <script type="module">
          import {RoomAssets} from '/modules/assets.js';
          const files=${JSON.stringify(manifest)};
          window.loadBundle=async()=>{
            const progress=[],initial=files.filter(file=>!file.deferred);
            const assets=new RoomAssets(initial,(loaded,total)=>progress.push([loaded,total]),{
              deferred:files.filter(file=>file.deferred),version:'content-${contentVersion}'
            });
            try{
              await assets.preload();
              const values={};
              for(const file of files.filter(file=>!file.stream))values[file.url]=new TextDecoder().decode(await assets.read(file.url));
              let unlistedRejected=false;
              try{await assets.read('/posts/cache-fixture/');}catch{unlistedRejected=true;}
              assets.release();
              return {values,progress,total:assets.total,active:assets.activeRequests,unlistedRejected};
            }finally{assets.dispose();}
          };
          window.cacheFixtureReady=true;
        </script>`);return;
    }
    response.writeHead(404);response.end('not found');
  });
  const profile=await mkdtemp(join(tmpdir(),'praxis-room-cache-'));
  let context;
  const launch=async()=>{
    context=await chromium.launchPersistentContext(profile,{headless:true,channel:process.env.BROWSER_CHANNEL||undefined});
    const observe=page=>page.on('pageerror',error=>pageErrors.push(String(error)));
    context.on('page',observe);for(const page of context.pages())observe(page);
    return context.pages()[0]??await context.newPage();
  };
  const ready=async(page,url)=>{await page.goto(url);await page.waitForFunction(()=>window.cacheFixtureReady===true);};
  const load=async page=>{
    const result=await page.evaluate(()=>window.loadBundle());
    assert.deepEqual(result.values,expected());assert.equal(result.active,0);assert(result.unlistedRejected);
    const total=bodies.get(model).length+bodies.get(atlas).length;
    assert.equal(result.total,total,'native media and deferred files stay outside the initial byte gate');
    assert.deepEqual(result.progress.at(-1),[total,total],'cached bytes must complete the same loading progress as network bytes');
    return result;
  };
  async function cachedKeys(page){
    return page.evaluate(async name=>{
      if(!(await caches.keys()).includes(name))return [];
      return (await(await caches.open(name)).keys()).map(request=>request.url);
    },cacheName);
  }
  async function waitCached(page){
    await page.waitForFunction(async({name,files})=>{
      if(!(await caches.keys()).includes(name))return false;
      const keys=await(await caches.open(name)).keys();
      return files.every(file=>keys.some(key=>{
        const url=new URL(key.url);return url.pathname===file.url&&[...url.searchParams.values()].includes(file.sha256);
      }));
    },{name:cacheName,files:files()});
  }
  async function clearHttpCache(page){
    const cdp=await context.newCDPSession(page);
    try{await cdp.send('Network.clearBrowserCache');}finally{await cdp.detach();}
  }
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const base=`http://127.0.0.1:${server.address().port}`;
    let page=await launch();await ready(page,base);await load(page);await waitCached(page);
    assert.deepEqual(requests.map(request=>request.path),[model,atlas,lampOff]);
    for(const request of requests)assert(request.version.includes(hash(bodies.get(request.path))),'each network URL must use that file’s SHA-256');
    assert((await cachedKeys(page)).every(key=>bodies.has(new URL(key).pathname)),'only declared static assets belong in the room cache');
    const warmRequests=requests.length;
    await ready(page,base);await load(page);assert.deepEqual(requests.slice(warmRequests),[],'expired HTTP entries must reuse CacheStorage without fetch');
    await context.close();context=undefined;
    page=await launch();await ready(page,base);await load(page);
    assert.equal(requests.length,warmRequests,'the same browser profile must retain assets across a full browser restart');
    console.log('PASS: room assets survive expired HTTP caching and a full browser restart with zero repeat asset requests');

    contentVersion++;const priorDocuments=documents.length;
    await ready(page,base+'/posts/cache-fixture/');assert.equal(await page.title(),'Content 2');await load(page);
    assert(documents.length>priorDocuments,'HTML is fetched again after a content-only release');
    assert.equal(requests.length,warmRequests,'content and bundle version changes cannot invalidate unchanged file hashes');
    const previousAtlasKey=(await cachedKeys(page)).find(key=>new URL(key).pathname===atlas);
    bodies.set(model,Buffer.from('model geometry version two with an actual edit'));
    contentVersion++;await ready(page,base);await load(page);await waitCached(page);
    assert.deepEqual(requests.slice(warmRequests).map(request=>request.path),[model],'only the changed model may download after a single-file release');
    assert(requests.at(-1).version.includes(hash(bodies.get(model))));
    assert((await cachedKeys(page)).includes(previousAtlasKey),'the unchanged atlas retains its cache key');
    console.log('PASS: content-only releases keep all cached assets; a single changed resource fetches only its new hash');

    const modelKey=(await cachedKeys(page)).find(key=>new URL(key).pathname===model&&new URL(key).searchParams.get('v')===hash(bodies.get(model)));
    assert(modelKey,'the current model hash must be cached');
    await page.evaluate(async({name,key,length})=>{
      await(await caches.open(name)).put(key,new Response(new Uint8Array(length).fill(120)));
    },{name:cacheName,key:modelKey,length:bodies.get(model).length});
    const beforeCorrupt=requests.length;await ready(page,base);await load(page);
    assert.deepEqual(requests.slice(beforeCorrupt).map(request=>request.path),[model],'corrupt cached bytes must redownload only the affected file');
    await page.evaluate(async({name,key})=>(await caches.open(name)).delete(key),{name:cacheName,key:modelKey});
    corruptModelResponses=1;cacheModelResponse=true;const beforeRecovery=requests.length;
    await ready(page,base);await load(page);await waitCached(page);
    const recoveryRequests=requests.slice(beforeRecovery);
    assert.deepEqual(recoveryRequests.map(request=>request.path),[model,model],'a bad fresh HTTP cache entry must retry the affected file exactly once');
    assert.equal(recoveryRequests[0].query,recoveryRequests[1].query,'recovery must retain the content-addressed URL');
    assert.match(recoveryRequests[1].cacheControl,/no-cache/,'the recovery request must bypass the poisoned HTTP cache entry');
    await page.evaluate(async({name,key})=>(await caches.open(name)).delete(key),{name:cacheName,key:modelKey});
    await clearHttpCache(page);
    corruptModelResponses=2;const beforeMismatch=requests.length;
    await ready(page,base);
    const rejected=await page.evaluate(async()=>{try{await window.loadBundle();return '';}catch(error){return String(error);}});
    assert.match(rejected,/content hash/i,'HTTP bytes that disagree with the manifest must reject loading');
    assert.deepEqual(requests.slice(beforeMismatch).map(request=>request.path),[model,model],'two bad responses must stop after one cache-bypassing retry');
    assert.match(requests.at(-1).cacheControl,/no-cache/);
    assert(!(await cachedKeys(page)).includes(modelKey),'bad HTTP bytes must never enter the persistent cache');
    corruptModelResponses=0;cacheModelResponse=false;await clearHttpCache(page);
    await ready(page,base);await load(page);await waitCached(page);
    console.log('PASS: corrupt cached bytes recover only their file; poisoned HTTP cache heals with one reload, and two bad responses reject without caching');

    await page.evaluate(name=>caches.delete(name),cacheName);const beforeDeletion=requests.length;
    await ready(page,base);await load(page);await waitCached(page);
    assert.equal(requests.length-beforeDeletion,3,'deleted CacheStorage entries fall back to HTTP');
    await ready(page,base);await page.evaluate(()=>{
      CacheStorage.prototype.open=()=>Promise.reject(new DOMException('fixture blocked Cache API','SecurityError'));
    });
    const beforeDenied=requests.length;await load(page);
    assert.equal(requests.length-beforeDenied,3,'a blocked Cache API cannot block asset loading');
    await ready(page,base);await page.evaluate(async name=>{
      await caches.delete(name);
      Cache.prototype.put=()=>Promise.reject(new DOMException('fixture quota full','QuotaExceededError'));
    },cacheName);
    const beforeQuota=requests.length;await load(page);
    assert.equal(requests.length-beforeQuota,3,'cache write rejection must leave network responses usable');
    await ready(page,base);await load(page);await waitCached(page);
    assert.deepEqual(await page.evaluate(()=>navigator.serviceWorker.getRegistrations()),[],'asset persistence must not register a service worker');
    assert((await cachedKeys(page)).every(key=>bodies.has(new URL(key).pathname)),'HTML, posts and native video must not enter CacheStorage');
    assert(!requests.some(request=>request.path===stream),'preload must leave streamed media to the browser');
    assert.deepEqual(pageErrors,[],'cache fallback must not produce unhandled browser errors');
    console.log('PASS: deleted, blocked and quota-full caches degrade to HTTP; HTML, posts and streams stay outside CacheStorage and no worker is registered');
  }finally{
    await context?.close();
    if(server.listening)await new Promise(resolve=>server.close(resolve));
    await rm(profile,{recursive:true,force:true});
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await verifyRoomAssetCache();
