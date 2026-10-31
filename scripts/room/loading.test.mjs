import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const js=ts.transpileModule(readFileSync(new URL('../../src/scripts/room/loading.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {createLoadingProgress,yieldForLoading}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('download completion leaves real scene, upload, reflection, compilation and frame work outstanding',()=>{
 const p=createLoadingProgress(),report=(stage,completed,total=1)=>p.report({stage,completed,total});
 assert.equal(report('download',0),0);assert.equal(report('download',.5),32);assert.equal(report('download',1),65);
 assert.equal(report('model',1,2),69);assert.equal(report('textures',1,4),72);assert.equal(report('textures',4,4),81);
 assert.equal(report('reflection',1),86);assert.equal(report('model',2,2),90);assert.equal(report('shaders',0),90);
 assert.equal(report('shaders',1),98);assert.equal(report('frame',1,2),99);assert.equal(report('frame',2,2),100);
});

test('loading continues when an embedded browser never delivers an animation frame',async()=>{
 const originalFrame=globalThis.requestAnimationFrame,originalCancel=globalThis.cancelAnimationFrame;
 let cancelled=0;
 globalThis.requestAnimationFrame=()=>42;globalThis.cancelAnimationFrame=id=>{if(id===42)cancelled++;};
 try{await yieldForLoading();assert.equal(cancelled,1,'the stale frame must be cancelled after the task fallback');}
 finally{globalThis.requestAnimationFrame=originalFrame;globalThis.cancelAnimationFrame=originalCancel;}
});
test('aborting a queued upload prevents either scheduler from continuing preparation',async()=>{
 const originalFrame=globalThis.requestAnimationFrame,originalCancel=globalThis.cancelAnimationFrame;
 let cancelled=0;
 globalThis.requestAnimationFrame=()=>42;globalThis.cancelAnimationFrame=()=>cancelled++;
 try{const controller=new AbortController(),pending=yieldForLoading(controller.signal);controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(cancelled,1);}
 finally{globalThis.requestAnimationFrame=originalFrame;globalThis.cancelAnimationFrame=originalCancel;}
});
test('duplicate or out-of-order completion events cannot move progress backwards or exceed 100',()=>{
 const p=createLoadingProgress();p.report({stage:'download',completed:100,total:100});
 assert.equal(p.report({stage:'download',completed:50,total:100}),65);
 assert.equal(p.report({stage:'download',completed:200,total:100}),65);
 assert.equal(p.report({stage:'textures',completed:NaN,total:0}),65);
 for(const stage of ['model','textures','reflection','shaders','frame'])p.report({stage,completed:1,total:1});
 assert.equal(p.report({stage:'frame',completed:2,total:1}),100);
});
