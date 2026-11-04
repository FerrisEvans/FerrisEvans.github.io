import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import ts from 'typescript';

// The replacement must leave all requests on the network while clearing only
// retired caches owned by this site.
const retirementWorker=await readFile(new URL('../src/scripts/retirement-worker.js',import.meta.url),'utf8');
const recovery=ts.transpileModule(await readFile(new URL('../src/scripts/legacy-worker.ts',import.meta.url),'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022},
}).outputText+'\nvoid retireLegacyWorker();';

// Reproduce Chirpy 7.2's cache-first root worker and its existing update hook.
// A private ephemeral origin keeps the user's site cache and other apps intact.
const legacyWorker=`
  self.addEventListener('install',event=>event.waitUntil(caches.open('chirpy-1700000000').then(cache=>cache.addAll(['/','/app.min.js']))));
  self.addEventListener('fetch',event=>event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request))));
`;
const legacyApp=`
  navigator.serviceWorker.register('/sw.min.js');
  let refreshing=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(!refreshing){refreshing=true;location.reload();}
  });
`;
const legacyPage='<!doctype html><title>Legacy Chirpy</title><aside id="sidebar">Mainloop / Home Categories Tags Archives About</aside><script src="/app.min.js"></script>';
const currentPage='<!doctype html><title>Praxis</title><h1>Praxis</h1><input aria-label="Draft" value=""><script type="module" src="/recovery.js"></script>';

export async function verifyLegacyWorkerRetirement(browser) {
  let mode='legacy',workerUpdates=0;
  const server=createServer((request,response)=>{
    const path=new URL(request.url,'http://localhost').pathname;
    response.setHeader('Cache-Control','no-store');
    if(path==='/sw.min.js'){
      workerUpdates++;
      if(mode==='missing'){response.writeHead(404,{'Content-Type':'text/html'});response.end('worker removed during migration');return;}
      response.writeHead(200,{'Content-Type':'text/javascript'});response.end(mode==='legacy'?legacyWorker:retirementWorker);return;
    }
    if(path==='/app.min.js'||path==='/recovery.js'||path==='/other-project/sw.js'){
      response.writeHead(200,{'Content-Type':'text/javascript'});
      response.end(path==='/app.min.js'?legacyApp:path==='/recovery.js'?recovery:"self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));");return;
    }
    response.writeHead(200,{'Content-Type':'text/html'});response.end(mode==='legacy'?legacyPage:currentPage);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const contexts=[];
  const context=async()=>{const value=await browser.newContext();contexts.push(value);return value;};
  async function installLegacy(page){
    mode='legacy';await page.goto(base);
    await page.evaluate(()=>navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
    assert.equal(await page.title(),'Legacy Chirpy');
  }
  async function waitMigrated(page){
    // Evaluate awaits the asynchronous checks before Node decides to poll again.
    // waitForFunction would treat the predicate's Promise itself as truthy.
    const deadline=Date.now()+30000;
    for(;;){
      const migrated=await page.evaluate(async()=>{
        const registration=await navigator.serviceWorker.getRegistration('/');
        return registration?.active?.state==='activated'
          &&registration.active===navigator.serviceWorker.controller
          &&!(await caches.keys()).includes('chirpy-1700000000');
      });
      if(migrated===true)break;
      if(Date.now()>=deadline)throw new Error('Retirement worker migration did not finish within 30 seconds');
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    const reply=await page.evaluate(()=>new Promise((resolve,reject)=>{
      const channel=new MessageChannel();
      const timer=setTimeout(()=>{channel.port1.close();reject(new Error('Retirement worker handshake timed out'));},5000);
      channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};
      navigator.serviceWorker.controller.postMessage({type:'praxis-retirement-status',files:[]},[channel.port2]);
    }));
    assert.equal(reply.type,'praxis-retirement-ready');assert.equal(reply.version,1);
  }
  try{
    const first=await context(),page=await first.newPage();await installLegacy(page);
    mode='missing';
    const updateFailed=await page.evaluate(async()=>{
      try{await(await navigator.serviceWorker.getRegistration('/')).update();return false;}catch{return true;}
    });
    assert(updateFailed,'the deleted worker URL cannot deliver its replacement');
    const stale=await page.reload();
    assert.equal(await page.title(),'Legacy Chirpy');assert(stale.fromServiceWorker(),'the old homepage survives a 404 worker update');
    await page.evaluate(async()=>{
      await(await caches.open('unrelated-app')).put('/other-project/data',new Response('keep'));
      await(await caches.open('chirpy-1700000001')).put('/other-project/',new Response('keep other Chirpy project'));
      await(await caches.open('praxis-room-video-v1')).put('/room/film/retired.mp4',new Response('old film'));
      await(await caches.open('praxis-room-video-catalog-v1')).put('/room/film/retired.mp4',new Response('old catalog'));
      await navigator.serviceWorker.register('/other-project/sw.js',{scope:'/other-project/'});
    });
    let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
    mode='media';const beforeUpdate=workerUpdates;
    await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration('/')).update();});
    await page.waitForFunction(()=>document.title==='Praxis');await waitMigrated(page);
    assert(workerUpdates>beforeUpdate,'the browser must download the replacement at the original worker URL');
    assert.equal(navigations,1,'Chirpy reloads once when the retirement worker takes control');
    const retained=await page.evaluate(async()=>({keys:await caches.keys(),scopes:(await navigator.serviceWorker.getRegistrations()).map(reg=>new URL(reg.scope).pathname)}));
    assert(!retained.keys.includes('chirpy-1700000000'));
    assert(!retained.keys.includes('praxis-room-video-v1'));
    assert(!retained.keys.includes('praxis-room-video-catalog-v1'));
    assert(retained.keys.includes('unrelated-app'));assert(retained.keys.includes('chirpy-1700000001'));
    assert.deepEqual(retained.scopes.sort(),['/','/other-project/'],'the retirement worker stays registered alongside the other project');
    const fresh=await page.reload();assert(!fresh.fromServiceWorker());assert.equal(await page.title(),'Praxis');
    await page.waitForTimeout(250);assert.equal(navigations,2,'migration must not cause a reload loop');
    const [ordinary]=await Promise.all([
      page.waitForResponse(response=>response.url()===base+'/other-project/data'),
      page.evaluate(()=>fetch('/other-project/data').then(response=>response.text())),
    ]);
    assert(!ordinary.fromServiceWorker(),'ordinary requests bypass the worker even when a matching unrelated cache entry exists');
    assert.notEqual(await ordinary.text(),'keep','the retirement worker must not serve unrelated cached responses');
    console.log('PASS: Chirpy migrates to the retirement worker once; HTML and ordinary requests use the network while other project caches/workers survive');

    const second=await context(),current=await second.newPage();await installLegacy(current);
    mode='media';
    await current.goto(base+'/lofi/');await current.getByLabel('Draft').fill('preserve this draft');
    let reloads=0;current.on('framenavigated',frame=>{if(frame===current.mainFrame())reloads++;});
    await waitMigrated(current);await current.waitForTimeout(250);
    assert.equal(reloads,0,'an already-current Astro page must retain its UI state');
    assert.equal(await current.getByLabel('Draft').inputValue(),'preserve this draft');
    console.log('PASS: a current page reached through a legacy cache miss upgrades to the retirement worker without reloading or losing input');

    // Their background update checks share this server counter. End both
    // migrated contexts before attributing requests to the clean visitor.
    await Promise.all([first.close(),second.close()]);contexts.splice(0,2);
    const third=await context(),clean=await third.newPage();const beforeClean=workerUpdates;
    await clean.goto(base+'/lofi/');await clean.waitForTimeout(250);
    assert.equal((await clean.evaluate(()=>navigator.serviceWorker.getRegistrations())).length,0);
    assert.equal(workerUpdates,beforeClean,'clean pages do not install or request the worker');
    console.log('PASS: clean pages install no service worker');
  }finally{
    await Promise.all(contexts.map(context=>context.close()));
    await new Promise(resolve=>server.close(resolve));
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||undefined});
  try{await verifyLegacyWorkerRetirement(browser);}finally{await browser.close();}
}
