import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const compile=name=>ts.transpileModule(readFileSync(new URL(`../../src/scripts/room/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const source=compile('loading-upload').replace("'./loading'",JSON.stringify(moduleUrl(compile('loading'))));
const {createLoadingUploadQueue}=await import(moduleUrl(source));

test('small uploads share a slice, preserve order and yield at the exact budget boundary',async()=>{
  let time=0;const events=[];
  const upload=createLoadingUploadQueue({now:()=>time,yield:async()=>{events.push('yield');}});
  const submit=(name,cost)=>upload(()=>{events.push(name);time+=cost;});
  await Promise.all([submit('a',3),submit('b',5),submit('c',1),submit('d',2)]);
  assert.deepEqual(events,['yield','a','b','yield','c','d']);
});

test('a large upload is followed by a yield, even when more work is already queued',async()=>{
  let time=0;const events=[];
  const upload=createLoadingUploadQueue({now:()=>time,yield:async()=>{events.push('yield');}});
  await Promise.all([upload(()=>{events.push('large');time+=15;}),upload(()=>events.push('small'))]);
  assert.deepEqual(events,['yield','large','yield','small']);
});

test('aborting while yielding prevents the resumed upload and all queued work',async()=>{
  const controller=new AbortController();let resume,yields=0,uploads=0;
  const upload=createLoadingUploadQueue({signal:controller.signal,now:()=>0,yield:()=>{yields++;return new Promise(resolve=>{resume=resolve;});}});
  const pending=Promise.allSettled([upload(()=>uploads++),upload(()=>uploads++)]);
  await Promise.resolve();assert.equal(yields,1);
  controller.abort();resume();
  const results=await pending;
  assert.equal(uploads,0);assert.equal(yields,1);
  assert.deepEqual(results.map(result=>[result.status,result.reason?.name]),[['rejected','AbortError'],['rejected','AbortError']]);
});

test('abort is checked between small uploads even when their slice has time left',async()=>{
  const controller=new AbortController();const events=[];
  const upload=createLoadingUploadQueue({signal:controller.signal,now:()=>0,yield:async()=>{events.push('yield');}});
  const results=await Promise.allSettled([upload(()=>{events.push('first');controller.abort();}),upload(()=>events.push('second'))]);
  assert.deepEqual(events,['yield','first']);
  assert.equal(results[0].status,'fulfilled');assert.equal(results[1].reason.name,'AbortError');
  await assert.rejects(upload(()=>events.push('late')),{name:'AbortError'});
  assert.deepEqual(events,['yield','first']);
});

test('an upload failure reaches its caller without poisoning subsequent work or the time budget',async()=>{
  let time=0;const events=[],failure=new Error('upload failed');
  const upload=createLoadingUploadQueue({now:()=>time,yield:async()=>{events.push('yield');}});
  const results=await Promise.allSettled([upload(()=>{events.push('failed');time+=8;throw failure;}),upload(()=>events.push('next'))]);
  assert.equal(results[0].reason,failure);assert.equal(results[1].status,'fulfilled');
  assert.deepEqual(events,['yield','failed','yield','next']);
});

test('a failed yield does not execute an upload or leave a falsely started slice',async()=>{
  let yields=0;const events=[],failure=new Error('yield failed');
  const upload=createLoadingUploadQueue({now:()=>0,yield:async()=>{if(++yields===1)throw failure;}});
  const results=await Promise.allSettled([upload(()=>events.push('failed')),upload(()=>events.push('next'))]);
  assert.equal(results[0].reason,failure);assert.equal(results[1].status,'fulfilled');
  assert.equal(yields,2);assert.deepEqual(events,['next']);
});
