import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {Scene,Group,Mesh,BoxGeometry,MeshBasicMaterial,PerspectiveCamera,Vector4} from 'three';
let js=ts.transpileModule(readFileSync(new URL('../../src/scripts/room/warmup.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
js=js.replace("from 'three'",`from '${new URL('../../node_modules/three/build/three.module.js',import.meta.url).href}'`);
const {warmScene}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
function fixture(){
  const scene=new Scene(),camera=new PerspectiveCamera(),a=new Mesh(new BoxGeometry(),new MeshBasicMaterial()),b=new Mesh(a.geometry,new MeshBasicMaterial());
  a.layers.enable(2);scene.add(a,b);
  const state={scissor:new Vector4(3,4,50,60),test:false,target:{name:'original'},draws:[]};
  const renderer={getScissor:v=>v.copy(state.scissor),getScissorTest:()=>state.test,getRenderTarget:()=>state.target,
    setScissor:(...args)=>state.scissor.copy(args[0] instanceof Vector4?args[0]:new Vector4(...args)),setScissorTest:v=>state.test=v,setRenderTarget:v=>state.target=v,
    render:()=>state.draws.push(scene.children.filter(o=>o.layers.test(camera.layers)).map(o=>o.uuid))};
  return {scene,camera,a,b,state,renderer};
}
test('first draws are split by material and all renderer/mesh state is restored',async t=>{
  const {scene,camera,a,b,state,renderer}=fixture(),steps=[];
  let time=0;const render=renderer.render;renderer.render=()=>{render();time+=9;};t.mock.method(performance,'now',()=>time);
  await warmScene(renderer,scene,camera,async(...p)=>steps.push(p));
  assert.deepEqual(state.draws,[[a.uuid],[b.uuid]]);assert.deepEqual(steps,[[1,2],[2,2]]);
  assert.equal(a.layers.mask,5);assert.equal(b.layers.mask,1);
  assert.deepEqual(state.scissor.toArray(),[3,4,50,60]);assert.equal(state.test,false);assert.equal(state.target.name,'original');
});
test('already-warm materials share a short slice instead of waiting a frame each',async t=>{
  const {scene,camera,state,renderer}=fixture(),steps=[];t.mock.method(performance,'now',()=>0);
  await warmScene(renderer,scene,camera,async(...p)=>steps.push(p));
  assert.equal(state.draws.length,2);assert.deepEqual(steps,[[2,2]]);
});
test('cancelled preparation restores layers and scissor before propagating failure',async()=>{
  const {scene,camera,a,b,state,renderer}=fixture();
  await assert.rejects(warmScene(renderer,scene,camera,async()=>{throw new Error('aborted');}),/aborted/);
  assert.equal(a.layers.mask,5);assert.equal(b.layers.mask,1);assert.equal(state.test,false);
  assert.deepEqual(state.scissor.toArray(),[3,4,50,60]);assert.equal(state.target.name,'original');
});

test('hidden and off-camera interaction meshes receive a real draw and recover their exact visibility',async t=>{
  t.mock.method(performance,'now',()=>0);
  for(const abort of [false,true]){
    const {scene,camera,a,b,state,renderer}=fixture(),hidden=new Group();
    hidden.visible=false;scene.add(hidden);
    const tape=new Mesh(a.geometry,new MeshBasicMaterial());tape.visible=false;tape.position.set(100,0,100);hidden.add(tape);
    const drawn=new Set();
    renderer.render=()=>scene.traverseVisible(object=>{
      if(!(object instanceof Mesh)||!object.layers.test(camera.layers))return;
      assert.equal(object.frustumCulled,false,'off-camera geometry must not be rejected before its first GPU upload');
      drawn.add(object);
    });
    const task=warmScene(renderer,scene,camera,async()=>{if(abort)throw new Error('cancelled');});
    if(abort)await assert.rejects(task,/cancelled/);else await task;
    assert(drawn.has(tape),'the hidden cassette cannot defer its first material/geometry draw to insertion');
    assert(drawn.has(a));assert(drawn.has(b));
    assert.equal(hidden.visible,false);assert.equal(tape.visible,false);assert.equal(tape.frustumCulled,true);
    assert(tape.geometry.boundingSphere,'first visibility must not trigger deferred bounds computation');
    assert.equal(a.visible,true);assert.equal(a.frustumCulled,true);assert.equal(a.layers.mask,5);
    assert.deepEqual(state.scissor.toArray(),[3,4,50,60]);assert.equal(state.test,false);
    tape.material.dispose();
  }
});
