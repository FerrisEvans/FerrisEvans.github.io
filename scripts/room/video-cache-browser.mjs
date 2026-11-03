import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import ts from 'typescript';

const cacheName='praxis-room-video-v1',chunkSize=524288;
const firstFilm='/room/film/cache-fixture-first.mp4',secondFilm='/room/film/cache-fixture-second.mp4';
const hash=body=>createHash('sha256').update(body).digest('hex');

/** Real H.264/native video, HTTP Range streams and a restarted disk profile.
 * The private origin/profile never registers a worker on the user's website.
 */
export async function verifyVideoCache(){
  const original=await readFile(new URL('../../public/room/film/night-log.mp4',import.meta.url));
  const core=await readFile(new URL('../../src/scripts/room/media-worker.js',import.meta.url),'utf8');
  const helper=ts.transpileModule(await readFile(new URL('../../src/scripts/room/media-cache.ts',import.meta.url),'utf8'),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022},
  }).outputText;
  const bodies=new Map([[firstFilm,original]]),requests=[],pageErrors=[],workerRequests=[],documents=[];
  let contentVersion=1,delayMs=20,mediaEnabled=true,fault='',legacy=false;
  const catalog=()=>[...bodies].map(([url,body])=>({url,bytes:body.length,sha256:hash(body),chunkSize,
    chunks:Array.from({length:Math.ceil(body.length/chunkSize)},(_,i)=>hash(body.subarray(i*chunkSize,(i+1)*chunkSize)))}));
  const legacyWorker=`self.addEventListener('install',e=>e.waitUntil(caches.open('chirpy-1700000000').then(c=>c.add('/'))));
    self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));`;
  const server=createServer((request,response)=>{
    const url=new URL(request.url,'http://localhost'),path=url.pathname;
    response.setHeader('Cache-Control','no-store, max-age=0');
    response.setHeader('Expires','Thu, 01 Jan 1970 00:00:00 GMT');
    if(path==='/sw.min.js'){
      response.writeHead(200,{'Content-Type':'application/javascript','Service-Worker-Allowed':'/'});
      const blocked=fault==='read'?`CacheStorage.prototype.open=()=>Promise.reject(new DOMException('fixture storage denied','SecurityError'));`
        :fault==='write'?`Cache.prototype.put=()=>Promise.reject(new DOMException('fixture quota full','QuotaExceededError'));`:'';
      const source=legacy?legacyWorker:`const MEDIA_CATALOG=[];
        ${blocked}
        ${core}`;
      workerRequests.push({fault,legacy,sha256:hash(source)});response.end(source);return;
    }
    if(path==='/media-cache.js'){
      response.writeHead(200,{'Content-Type':'application/javascript'});response.end(helper);return;
    }
    if(bodies.has(path)){
      const body=bodies.get(path),range=request.headers.range;
      const item={path,query:url.search,range,bytes:0,completed:false,status:mediaEnabled?206:503};requests.push(item);
      if(!mediaEnabled){response.writeHead(503);response.end('the native HTTP film cache is deliberately unavailable');return;}
      const parts=/^bytes=(\d*)-(\d*)$/.exec(range??'');
      let start=0,end=body.length-1,status=200;
      if(parts){status=206;if(!parts[1])start=Math.max(0,body.length-Number(parts[2]));else{start=Number(parts[1]);if(parts[2])end=Math.min(end,Number(parts[2]));}}
      if(start> end||start>=body.length){response.writeHead(416,{'Content-Range':`bytes */${body.length}`});response.end();return;}
      item.start=start;item.end=end;item.status=status;
      response.setHeader('Accept-Ranges','bytes');response.setHeader('Content-Type','video/mp4');
      response.setHeader('Content-Length',end-start+1);response.setHeader('ETag',`"${hash(body)}"`);
      if(status===206)response.setHeader('Content-Range',`bytes ${start}-${end}/${body.length}`);
      response.writeHead(status);
      let offset=start,timer;
      const write=()=>{
        if(response.destroyed)return;
        const next=Math.min(offset+32768,end+1),piece=body.subarray(offset,next);
        item.bytes+=piece.length;offset=next;response.write(piece);
        if(offset>end){item.completed=true;response.end();}
        else timer=setTimeout(write,delayMs);
      };
      response.on('close',()=>clearTimeout(timer));write();return;
    }
    if(legacy){
      response.writeHead(200,{'Content-Type':'text/html'});
      response.end('<!doctype html><title>Legacy Chirpy</title><script>navigator.serviceWorker.register("/sw.min.js");</script>');return;
    }
    documents.push({path,version:contentVersion});
    response.writeHead(200,{'Content-Type':'text/html','X-Fixture-Content-Version':String(contentVersion)});
    response.end(`<!doctype html><title>Video content ${contentVersion}</title><h1>Video content ${contentVersion}</h1><input aria-label="Draft">
      <script type="module">
        import {prepareMediaCache} from '/media-cache.js';
        const files=${JSON.stringify(catalog().map(file=>({...file,stream:true})))};
        let video;
        window.prepare=()=>prepareMediaCache(files);
        window.stopVideo=()=>{if(video){video.pause();video.removeAttribute('src');video.load();video.remove();video=undefined;}};
        window.playVideo=async path=>{
          window.stopVideo();
          const prepared=await prepareMediaCache(files);
          const file=files.find(file=>file.url===path);if(!file)throw new Error('unlisted fixture film');
          video=document.createElement('video');video.width=320;video.height=240;
          video.crossOrigin='anonymous';video.muted=true;video.defaultMuted=true;video.playsInline=true;video.preload='auto';
          window.controlledAtSource=prepared&&Boolean(navigator.serviceWorker.controller);
          document.body.append(video);video.src=file.url+'?v='+file.sha256;video.load();
          await video.play();return {prepared,controlled:window.controlledAtSource,time:video.currentTime,duration:video.duration,ready:video.readyState};
        };
        window.seekVideo=async time=>{
          if(Math.abs(video.currentTime-time)<.1)time+=.25;
          const seeked=new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>reject(new Error('native seek timed out '+JSON.stringify({time:video.currentTime,seeking:video.seeking,ready:video.readyState,network:video.networkState,error:video.error?.code,buffered:Array.from({length:video.buffered.length},(_,i)=>[video.buffered.start(i),video.buffered.end(i)])}))),10000);
            video.addEventListener('seeked',()=>{clearTimeout(timer);resolve();},{once:true});
            video.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('native video decode error'));},{once:true});
          });
          video.currentTime=time;await seeked;await video.play();return {time:video.currentTime,ready:video.readyState,duration:video.duration};
        };
        window.fixtureReady=true;
      </script>`);
  });
  const directory=await mkdtemp(join(tmpdir(),'praxis-video-cache-'));
  let context,base;
  const mediaResponses=[];
  const launch=async(profile='main')=>{
    context=await chromium.launchPersistentContext(join(directory,profile),{headless:true,channel:process.env.BROWSER_CHANNEL||undefined});
    const observe=page=>{
      page.on('pageerror',error=>pageErrors.push(String(error)));
      page.on('response',response=>{if(bodies.has(new URL(response.url()).pathname))mediaResponses.push({url:response.url(),worker:response.fromServiceWorker(),status:response.status()});});
    };
    context.on('page',observe);for(const page of context.pages())observe(page);
    const page=context.pages()[0]??await context.newPage();
    // no-store responses plus a 503-only warm MP4 server exclude HTTP cache reuse.
    return page;
  };
  const visit=async(page,path='/')=>{const response=await page.goto(base+path);await page.waitForFunction(()=>window.fixtureReady===true);return response;};
  const until=async(predicate,message)=>{
    const deadline=Date.now()+30000;
    do{if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,50));}while(Date.now()<deadline);
    assert.fail(message);
  };
  const prepare=async page=>{
    assert.equal(await page.evaluate(()=>window.prepare()),true,'the actual entry helper must wait for the video worker');
  };
  const play=async(page,path=firstFilm)=>{
    const info=await page.evaluate(path=>window.playVideo(path),path);
    assert(info.prepared&&info.controlled,'the first native request must have the media controller');
    assert.equal(info.duration,48);assert(info.ready>=2);return info;
  };
  const cached=async(page,path)=>page.evaluate(async({name,path,sha})=>{
    if(!(await caches.keys()).includes(name))return [];
    return (await(await caches.open(name)).keys()).map(key=>new URL(key.url))
      .filter(url=>url.pathname===path&&url.searchParams.get('v')===sha).map(url=>Number(url.searchParams.get('chunk'))).sort((a,b)=>a-b);
  },{name:cacheName,path,sha:hash(bodies.get(path))});
  const complete=async(page,path=firstFilm)=>{
    const file=catalog().find(file=>file.url===path);
    await until(async()=>new Set(await cached(page,path)).size===file.chunks.length,'all video chunks must finish caching');
    assert.deepEqual(await cached(page,path),Array.from({length:file.chunks.length},(_,i)=>i),'all real chunk keys must exist before restarting the browser');
  };
  const configure=async page=>{
    await prepare(page);
    assert.equal(await page.evaluate(async()=>Boolean((await navigator.serviceWorker.getRegistration('/'))?.waiting)),false,
      'catalog changes must not install a waiting worker');
    assert.equal(new Set(workerRequests.filter(item=>!item.legacy&&!item.fault).map(item=>item.sha256)).size,1,
      'adding or editing films must leave the served worker program byte-identical');
  };
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    base=`http://127.0.0.1:${server.address().port}`;
    let page=await launch();await visit(page);
    assert.equal(await page.evaluate(()=>Boolean(navigator.serviceWorker.controller)),false,'the cold fixture begins without a controller');
    await play(page);
    const firstPlaybackBytes=requests.reduce((sum,item)=>sum+item.bytes,0);
    assert(firstPlaybackBytes<original.length,'native playback must start before the entire MP4 has crossed HTTP');
    assert(mediaResponses[0]?.worker,'the first native video response must already come from the worker');
    await complete(page);await page.evaluate(()=>window.stopVideo());
    assert(requests.every(item=>item.status===206&&/^bytes=\d+-\d+$/.test(item.range)),'the server must receive actual bounded byte ranges');
    assert(requests.every(item=>item.end-item.start+1<=chunkSize),'one HTTP request must not buffer the full film');
    const firstRequests=requests.length;
    await context.close();context=undefined;mediaEnabled=false;delayMs=0;
    page=await launch();await visit(page);
    const slice=await page.evaluate(async({url})=>{const r=await fetch(url,{headers:{Range:'bytes=123-456'}});return {status:r.status,range:r.headers.get('Content-Range'),bytes:[...new Uint8Array(await r.arrayBuffer())]};},{url:firstFilm+'?v='+hash(original)});
    assert.equal(slice.status,206);assert.equal(slice.range,`bytes 123-456/${original.length}`);assert.deepEqual(slice.bytes,[...original.subarray(123,457)],'a restarted worker must restore its catalog before any page configure call');
    await play(page);
    const sought=await page.evaluate(()=>window.seekVideo(40));assert(sought.time>=40&&sought.ready>=2);
    assert.equal(requests.length,firstRequests,'a restarted profile must play and seek without any MP4 HTTP request');
    await page.evaluate(()=>window.stopVideo());
    console.log(`PASS: real H.264 starts after ${firstPlaybackBytes}/${original.length} bytes; bounded Range chunks survive a browser restart and offline media seek`);

    const beforeDocuments=documents.length;
    contentVersion++;const post=await visit(page,'/posts/cache-fixture/');
    assert.equal(post.fromServiceWorker(),false);assert.equal(await page.title(),'Video content 2');
    const home=await visit(page);assert.equal(home.fromServiceWorker(),false);assert.equal(await page.title(),'Video content 2');
    assert.equal(post.headers()['x-fixture-content-version'],'2');assert.equal(home.headers()['x-fixture-content-version'],'2');
    assert.deepEqual(documents.slice(beforeDocuments).filter(item=>item.path==='/'||item.path==='/posts/cache-fixture/'),[
      {path:'/posts/cache-fixture/',version:2},{path:'/',version:2},
    ],'both updated documents must reach the HTTP server immediately');
    mediaEnabled=true;bodies.set(secondFilm,original);
    await visit(page);await configure(page);const beforeAdded=requests.length;
    await play(page);await page.evaluate(()=>window.seekVideo(35));
    assert.equal(requests.length,beforeAdded,'adding a different video cannot invalidate the original film');
    await play(page,secondFilm);await complete(page,secondFilm);
    assert(requests.slice(beforeAdded).every(item=>item.path===secondFilm));
    await page.evaluate(()=>window.stopVideo());
    // A legal trailing free atom changes the MP4 hash while keeping it decodable.
    const free=Buffer.alloc(24);free.writeUInt32BE(24);free.write('free',4);free.write('revision-two',8);
    bodies.set(firstFilm,Buffer.concat([original,free]));
    await visit(page);await configure(page);const beforeEdited=requests.length;
    await play(page,secondFilm);await page.evaluate(()=>window.seekVideo(37));
    assert.equal(requests.length,beforeEdited,'editing the first film leaves the second hash reusable');
    await play(page);await complete(page);
    assert(requests.length>beforeEdited);assert(requests.slice(beforeEdited).every(item=>item.path===firstFilm));
    assert(requests.slice(beforeEdited).every(item=>new URLSearchParams(item.query).get('v')===hash(bodies.get(firstFilm))));
    console.log('PASS: HTML/posts remain network documents; adding a film or changing one hash leaves every other video reusable');

    await context.close();context=undefined;
    page=await launch('partial');await visit(page);
    delayMs=25;await play(page);await page.evaluate(()=>window.stopVideo());
    await context.close();context=undefined;
    page=await launch('partial');await visit(page);const existing=await cached(page,firstFilm);
    const count=catalog().find(file=>file.url===firstFilm).chunks.length;
    assert(existing.length>0&&existing.length<count,'short viewing must leave a real partial persistent film');
    const beforeResume=requests.length;delayMs=0;await play(page);await complete(page);
    const resumed=requests.slice(beforeResume).filter(item=>item.path===firstFilm);
    assert(resumed.length>0);assert(resumed.every(item=>!existing.includes(Math.floor(item.start/chunkSize))),'resuming must request only chunks absent from the disk cache');
    console.log('PASS: after partial viewing and a browser restart, only missing verified chunks cross HTTP');

    await context.close();context=undefined;
    for(const mode of ['read','write']){
      fault=mode;page=await launch('fault-'+mode);await visit(page);await prepare(page);
      const before=requests.length;await play(page);await page.evaluate(()=>window.seekVideo(30));
      assert(requests.length>before,`${mode} failure must still use native HTTP playback`);
      await page.evaluate(()=>window.stopVideo());
      await context.close();context=undefined;
    }
    console.log('PASS: denied CacheStorage reads and quota-rejected chunk writes still permit native playback and seek');

    fault='';legacy=true;
    page=await launch('legacy');await page.goto(base);await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
    await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));assert.equal(await page.title(),'Legacy Chirpy');
    legacy=false;contentVersion++;
    await visit(page,'/posts/cache-fixture/?new=1');await page.getByLabel('Draft').fill('keep this draft');
    let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
    await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration('/')).update();});
    await prepare(page);assert.equal(navigations,0);assert.equal(await page.getByLabel('Draft').inputValue(),'keep this draft');
    const fresh=await page.goto(base);assert.equal(fresh.fromServiceWorker(),false);assert.equal(await page.title(),'Video content 3');
    assert(!(await page.evaluate(()=>caches.keys())).includes('chirpy-1700000000'));
    assert.deepEqual(pageErrors,[],'native caching must not create unhandled page errors');
    console.log('PASS: upgrading the old Chirpy worker preserves the current page and draft, then serves fresh HTML without fallback');
  }catch(error){
    const workerState=await context?.pages()[0]?.evaluate(async files=>({controller:{url:navigator.serviceWorker.controller?.scriptURL,state:navigator.serviceWorker.controller?.state},
      handshake:await new Promise(resolve=>{const c=new MessageChannel();const timer=setTimeout(()=>{c.port1.close();resolve('timeout');},1000);c.port1.onmessage=e=>{clearTimeout(timer);c.port1.close();resolve(e.data);};navigator.serviceWorker.controller?.postMessage({type:'praxis-media-status',files},[c.port2]);}),
      registrations:(await navigator.serviceWorker.getRegistrations()).map(r=>({active:r.active?.state,waiting:r.waiting?.state,installing:r.installing?.state}))}),catalog().map(({url,sha256})=>({url,sha256}))).catch(()=>undefined);
    console.error('Video cache fixture failure:',JSON.stringify({fault,mediaEnabled,workerRequests,workerState,requests:requests.map(({path,range,bytes,status,completed})=>({path,range,bytes,status,completed})),mediaResponses},null,2));
    throw error;
  }finally{
    await context?.close();
    if(server.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    await rm(directory,{recursive:true,force:true});
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await verifyVideoCache();
