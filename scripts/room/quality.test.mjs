import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const js=ts.transpileModule(readFileSync(new URL('../../src/scripts/room/quality.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {selectQuality,createQualityMonitor,renderPixelRatio}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const capable={renderer:'ANGLE (Apple, Apple M3 Max, Metal)',maxTextureSize:16384,hardwareConcurrency:12};
function run(initial=selectQuality(capable)){
 const monitor=createQualityMonitor(initial);let nowMs=0;const advice=[],adviceAt=[];
 function frame(frameMs,flags={}){nowMs+=frameMs;const result=monitor.observe({nowMs,frameMs,...flags});if(result){advice.push(result);adviceAt.push(nowMs);}}
 function span(ms,frameMs,flags={}){const end=nowMs+ms;while(nowMs<end)frame(frameMs,flags);}
 return{monitor,advice,adviceAt,frame,span,get now(){return nowMs;}};
}
test('desktop 3D has one fixed high-quality profile with native DPR 2',()=>{
 for(const hints of [capable,{}, {...capable,renderer:'WebKit WebGL'}, {...capable,renderer:'ANGLE (Intel Iris Xe)'}]){
  const q=selectQuality(hints);assert.equal(q.mode,'3d');assert.equal(q.tier,'high');assert.equal(q.fps,60);assert.equal(q.dprCap,2);assert(Object.isFrozen(q));
 }
 assert.equal(renderPixelRatio(1),1.5);assert.equal(renderPixelRatio(2),2);assert.equal(renderPixelRatio(3),2);assert.equal(renderPixelRatio(NaN),1.5);
});
test('software and explicitly insufficient hardware use LO-FI without a low-quality override',()=>{
 for(const renderer of ['SwiftShader','llvmpipe (LLVM 15)','Microsoft Basic Render Driver','Software Rasterizer']){
  assert.equal(selectQuality({...capable,renderer}).mode,'lofi');
  assert.equal(selectQuality({...capable,renderer,allowSoftware:true}).mode,'lofi');
 }
 assert.equal(selectQuality({...capable,maxTextureSize:2048}).reason,'texture-limit');
 assert.equal(selectQuality({...capable,hardwareConcurrency:2}).mode,'lofi');
 assert.equal(selectQuality({...capable,maxTextureSize:4096}).mode,'3d');
});
test('reduced motion keeps the high-quality material and resolution policy',()=>{
 const q=selectQuality({...capable,reducedMotion:true});assert.equal(q.tier,'high');assert.equal(q.dprCap,2);assert.equal(q.renderOnDemand,true);
});
test('healthy 60fps and isolated stalls do not recommend LO-FI',()=>{
 const s=run();for(let i=0;i<60;i++){s.span(3000,1000/60);s.frame(150);}assert.equal(s.advice.length,0);
});
test('sustained 30fps cannot interrupt the first 30s, then offers LO-FI only once without changing quality',()=>{
 const s=run();s.span(30000,1000/30);assert.equal(s.advice.length,0);
 s.span(10000,1000/30);assert.equal(s.advice.length,1);assert(s.adviceAt[0]>=38000);assert(s.adviceAt[0]<39000);
 assert(Math.abs(s.advice[0].measuredFps-30)<.01);
 assert.equal(s.monitor.current.tier,'high');assert.equal(s.monitor.current.fps,60);assert.equal(s.monitor.current.dprCap,2);
 s.monitor.reset();s.span(90000,100);assert.equal(s.advice.length,1,'dismissed advice must not repeat after navigation');
});
test('moderately uneven 45–48fps cadence does not interrupt exploration',()=>{
 for(const fps of [45,48]){const s=run();s.span(90000,1000/fps);assert.equal(s.advice.length,0);}
});
test('a healthy window cancels a pending recommendation instead of accumulating historical slow windows',()=>{
 const s=run();s.span(20100,1000/60);s.span(12200,1000/30);assert.equal(s.advice.length,0);
 s.span(7000,1000/60);s.span(12000,1000/30);assert.equal(s.advice.length,0);
 s.span(7000,1000/30);assert.equal(s.advice.length,1);
});
test('recurring long stalls count even when most frames meet the deadline',()=>{
 const s=run();for(let i=0;i<300;i++){for(let j=0;j<4;j++)s.frame(1000/60);s.frame(85);}
 assert.equal(s.advice.length,1);assert.equal(s.monitor.current.tier,'high');
});
test('hidden, on-demand, camera transitions and long background gaps cannot accumulate bad cadence',()=>{
 for(const flags of [{visible:false},{continuous:false},{stable:false}]){
  const s=run();s.span(33000,50);s.span(60000,50,flags);s.span(33000,50);assert.equal(s.advice.length,0);
  s.span(6000,50);assert.equal(s.advice.length,1);
 }
 const s=run();s.span(33000,50);s.frame(60000);s.span(33000,50);assert.equal(s.advice.length,0);
 s.span(6000,50);assert.equal(s.advice.length,1);
});
test('startup wall time and an explicit pause do not substitute for stable runtime samples',()=>{
 const s=run();s.frame(60000,{stable:false});s.span(33000,50);assert.equal(s.advice.length,0);
 s.monitor.reset();s.span(33000,50);assert.equal(s.advice.length,0);s.span(6000,50);assert.equal(s.advice.length,1);
});
test('an invalid sample discards partial low-frame-rate evidence',()=>{
 const s=run();s.span(33000,50);s.monitor.observe({nowMs:NaN,frameMs:50});s.span(33000,50);assert.equal(s.advice.length,0);
 s.span(6000,50);assert.equal(s.advice.length,1);
});
test('LO-FI does not start a performance monitor',()=>{const s=run(selectQuality({renderer:'SwiftShader'}));s.span(90000,100);assert.equal(s.advice.length,0);});
