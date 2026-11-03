import test from 'node:test';
import assert from 'node:assert/strict';
import {getEventListeners} from 'node:events';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../../src/scripts/room/media-cache.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {prepareMediaCache}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const film={url:'/room/film/night-log.mp4',bytes:524288+17,sha256:'a'.repeat(64),stream:true,
  chunkSize:524288,chunks:['b'.repeat(64),'c'.repeat(64)]};
const supported={type:'praxis-media-ready',version:1,supported:true};
const flush=()=>new Promise(resolve=>setImmediate(resolve));

function fixture(t,{registrationResult,unavailable=false}={}){
  let now=0,id=0;
  const timers=new Map(),channels=[],calls=[],workerTargets=[];
  const registration=new EventTarget();registration.installing=null;registration.waiting=null;registration.active=null;
  const workers=new EventTarget();workers.controller=null;
  workers.register=(...args)=>{calls.push(args);return registrationResult?registrationResult():Promise.resolve(registration);};
  function replace(name,value){
    const original=Object.getOwnPropertyDescriptor(globalThis,name);
    Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
    t.after(()=>{if(original)Object.defineProperty(globalThis,name,original);else delete globalThis[name];});
  }
  class Port{
    closed=false;onmessage=null;peer=null;
    close(){this.closed=true;}
    postMessage(data){queueMicrotask(()=>{if(!this.peer.closed)this.peer.onmessage?.({data});});}
  }
  replace('MessageChannel',class{
    constructor(){this.port1=new Port();this.port2=new Port();this.port1.peer=this.port2;this.port2.peer=this.port1;channels.push(this);}
  });
  replace('window',{
    setTimeout(fn,ms){timers.set(++id,{fn,at:now+ms});return id;},
    clearTimeout(key){timers.delete(key);},
  });
  replace('navigator',unavailable?{}:{serviceWorker:workers});
  function worker(path='/sw.min.js',{throws=false}={}){
    const target=new EventTarget();target.scriptURL='https://room.test'+path;target.state='installing';target.messages=[];
    target.postMessage=(data,[port])=>{
      if(throws)throw new DOMException('Worker is redundant','InvalidStateError');
      target.messages.push({data,port});
    };
    target.reply=(data=supported,index=target.messages.length-1)=>target.messages[index].port.postMessage(data);
    workerTargets.push(target);return target;
  }
  return {
    workers,registration,channels,calls,timers,worker,
    control(target){workers.controller=target;workers.dispatchEvent(new Event('controllerchange'));},
    advance(ms){now+=ms;for(const [key,timer] of [...timers])if(timer.at<=now){timers.delete(key);timer.fn();}},
    assertClean(signal){
      assert.equal(timers.size,0,'the startup deadline must be cleared');
      assert.equal(getEventListeners(workers,'controllerchange').length,0);
      assert.equal(getEventListeners(registration,'updatefound').length,0);
      for(const target of workerTargets)assert.equal(getEventListeners(target,'statechange').length,0);
      for(const channel of channels)assert(channel.port1.closed,'all local message ports must close');
      if(signal)assert.equal(getEventListeners(signal,'abort').length,0);
    },
  };
}

test('non-streamed or incomplete media metadata never registers a worker',async t=>{
  const f=fixture(t);
  const invalid=[
    {...film,sha256:undefined},{...film,sha256:'invalid'},
    {...film,bytes:undefined},{...film,bytes:0},{...film,bytes:1.5},
    {...film,chunkSize:undefined},{...film,chunkSize:0},
    {...film,chunks:undefined},{...film,chunks:[]},{...film,chunks:[film.chunks[0]]},
    {...film,chunks:[film.chunks[0],'invalid']},
  ];
  for(const files of [[],[{...film,stream:false}],...invalid.flatMap(file=>[[file],[film,{...file,url:'/room/film/other.mp4'}]])]){
    assert.equal(await prepareMediaCache(files),false);
  }
  const aborter=new AbortController();aborter.abort();
  assert.equal(await prepareMediaCache([film],aborter.signal),false);
  assert.equal(f.calls.length,0);assert.equal(f.channels.length,0);f.assertClean(aborter.signal);
});

test('missing service worker support retains native playback',async t=>{
  const f=fixture(t,{unavailable:true});
  assert.equal(await prepareMediaCache([film]),false);
  assert.equal(f.calls.length,0);f.assertClean();
});

test('registration must settle before any handshake reaches the existing controller',async t=>{
  let completeRegistration;
  const registered=new Promise(resolve=>{completeRegistration=resolve;});
  const f=fixture(t,{registrationResult:()=>registered}),old=f.worker();
  f.workers.controller=old;f.registration.active=old;
  const pending=prepareMediaCache([film],undefined,50);await flush();
  assert.equal(f.calls.length,1);
  assert.equal(old.messages.length,0,'register may still discover a pending replacement');
  assert.equal(f.channels.length,0,'do not transfer a MessagePort before registration is known');
  f.control(old);await flush();assert.equal(old.messages.length,0);
  completeRegistration(f.registration);await flush();
  assert.equal(old.messages.length,1,'an unchanged active controller can configure after registration settles');
  old.reply();assert.equal(await pending,true);f.assertClean();
});

test('installing and waiting replacements receive configuration only after taking control',async t=>{
  const f=fixture(t),old=f.worker(),next=f.worker();
  f.workers.controller=old;f.registration.active=old;f.registration.installing=next;
  let result;
  const pending=prepareMediaCache([film],undefined,50).then(value=>result=value);await flush();
  assert.equal(old.messages.length,0);assert.equal(next.messages.length,0);assert.equal(f.channels.length,0);
  f.registration.installing=null;f.registration.waiting=next;
  next.state='installed';next.dispatchEvent(new Event('statechange'));await flush();
  f.control(old);await flush();
  assert.equal(old.messages.length,0,'waiting for activation must not reopen a port on the old controller');
  f.registration.waiting=null;f.registration.active=next;
  for(const state of ['activating','activated']){
    next.state=state;next.dispatchEvent(new Event('statechange'));await flush();
    assert.equal(old.messages.length,0,'the new active worker may not have claimed the page yet');
    assert.equal(next.messages.length,0);assert.equal(result,undefined);
  }
  f.control(next);await flush();
  assert.deepEqual(next.messages.at(-1).data,{type:'praxis-media-configure',files:[{
    url:film.url,bytes:film.bytes,sha256:film.sha256,chunkSize:film.chunkSize,chunks:[...film.chunks],
  }]});
  assert.equal(old.messages.length,0);
  next.reply();assert.equal(await pending,true);f.assertClean();
});

test('first install waits for the correct controller and an exact supported handshake',async t=>{
  const f=fixture(t),installing=f.worker(),foreign=f.worker('/other-project/sw.js');
  f.registration.installing=installing;
  let result;
  const pending=prepareMediaCache([film,{url:'/texture.webp',bytes:17,sha256:'b'.repeat(64)}],undefined,50).then(value=>result=value);
  await flush();
  assert.deepEqual(f.calls,[['/sw.min.js',{scope:'/',updateViaCache:'none'}]]);
  installing.state='activated';installing.dispatchEvent(new Event('statechange'));await flush();
  assert.equal(result,undefined,'activation alone does not control this page');
  f.control(foreign);await flush();assert.equal(foreign.messages.length,0);
  f.control(installing);await flush();
  assert.deepEqual(installing.messages.at(-1).data,{type:'praxis-media-configure',files:[{
    url:film.url,bytes:film.bytes,sha256:film.sha256,chunkSize:film.chunkSize,chunks:[...film.chunks],
  }]});
  for(const reply of [null,{...supported,type:'unrelated'},{...supported,version:2},{...supported,supported:false}]){
    installing.reply(reply);await flush();assert.equal(result,undefined);
  }
  installing.reply();assert.equal(await pending,true);f.assertClean();
});

test('an unsupported configuration stays pending until a capable controller confirms it',async t=>{
  const f=fixture(t),old=f.worker(),next=f.worker();f.workers.controller=old;
  let result;
  const pending=prepareMediaCache([film],undefined,50).then(value=>result=value);await flush();
  old.reply({...supported,supported:false});await flush();assert.equal(result,undefined);
  const oldMessages=old.messages.length;
  f.registration.installing=next;f.registration.dispatchEvent(new Event('updatefound'));
  next.state='activated';next.dispatchEvent(new Event('statechange'));await flush();
  assert.equal(next.messages.length,0,'installing/activated workers cannot answer for the current page');
  assert.equal(old.messages.length,oldMessages,'an update must stop new handshakes to the old worker');
  old.reply({...supported,supported:false});await flush();assert.equal(result,undefined);
  f.control(next);await flush();
  assert.deepEqual(next.messages.at(-1).data,{type:'praxis-media-configure',files:[{
    url:film.url,bytes:film.bytes,sha256:film.sha256,chunkSize:film.chunkSize,chunks:[...film.chunks],
  }]});
  next.reply();
  assert.equal(await pending,true);f.assertClean();
});

test('a late success from a replaced controller cannot release the native player gate',async t=>{
  const f=fixture(t),old=f.worker(),foreign=f.worker('/other-project/sw.js');f.workers.controller=old;
  let result;
  const pending=prepareMediaCache([film],undefined,50).then(value=>result=value);await flush();
  f.control(foreign);old.reply();await flush();
  const early=result;f.advance(50);
  assert.equal(await pending,false);assert.equal(early,undefined);f.assertClean();
});

test('a reply is rejected if controller identity changed before its event was observed',async t=>{
  const f=fixture(t),old=f.worker(),next=f.worker();f.workers.controller=old;
  let result;
  const pending=prepareMediaCache([film],undefined,50).then(value=>result=value);await flush();
  // Controller assignment can precede delivery of its controllerchange event.
  f.workers.controller=next;old.reply();await flush();
  assert.equal(result,undefined,'the message must still belong to the current controller');
  f.control(next);next.reply();assert.equal(await pending,true);f.assertClean();
});

test('registration rejection or a synchronous security exception falls back and closes ports',async t=>{
  for(const synchronous of [false,true])await t.test(synchronous?'synchronous exception':'promise rejection',async t=>{
    const f=fixture(t,{registrationResult:()=>{
      const error=new DOMException('Registration disabled','SecurityError');
      if(synchronous)throw error;return Promise.reject(error);
    }});
    f.workers.controller=f.worker();
    assert.equal(await prepareMediaCache([film],undefined,50),false);f.assertClean();
  });
});

test('timeout releases native playback and a late registration does not attach listeners',async t=>{
  let completeRegistration;
  const registered=new Promise(resolve=>{completeRegistration=resolve;});
  const f=fixture(t,{registrationResult:()=>registered}),controller=f.worker(),installing=f.worker();
  f.workers.controller=controller;f.registration.installing=installing;
  let result;
  const pending=prepareMediaCache([film],undefined,50).then(value=>result=value);await flush();
  assert.equal(controller.messages.length,0);assert.equal(f.channels.length,0);
  f.advance(49);await flush();assert.equal(result,undefined);
  f.advance(1);assert.equal(await pending,false);f.assertClean();
  completeRegistration(f.registration);await flush();
  const count=f.channels.length;f.control(installing);await flush();
  assert.equal(f.channels.length,count);f.assertClean();
});

test('abort closes the handshake and removes registration, worker and signal listeners',async t=>{
  for(const upgrading of [false,true])await t.test(upgrading?'replacement is pending':'handshake port is open',async t=>{
    const f=fixture(t),controller=f.worker(),installing=f.worker(),aborter=new AbortController();
    f.workers.controller=controller;f.registration.installing=upgrading?installing:null;
    const pending=prepareMediaCache([film],aborter.signal,50);await flush();
    if(upgrading){
      assert.equal(getEventListeners(installing,'statechange').length,1);
      assert.equal(controller.messages.length,0);assert.equal(f.channels.length,0);
    }else assert(controller.messages.length>0,'exercise abort with an actual open handshake port');
    aborter.abort();assert.equal(await pending,false);f.assertClean(aborter.signal);
    const count=f.channels.length;f.control(installing);
    if(controller.messages.length)controller.reply();
    f.registration.dispatchEvent(new Event('updatefound'));await flush();
    assert.equal(f.channels.length,count);f.assertClean(aborter.signal);
  });
});

test('postMessage failure closes both untransferred ports and times out to native playback',async t=>{
  const f=fixture(t);f.workers.controller=f.worker('/sw.min.js',{throws:true});
  const pending=prepareMediaCache([film],undefined,50);await flush();
  assert(f.channels.length>0);
  for(const channel of f.channels)assert(channel.port1.closed&&channel.port2.closed);
  f.advance(50);assert.equal(await pending,false);f.assertClean();
});
