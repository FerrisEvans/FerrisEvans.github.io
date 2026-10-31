import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as three from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as merge from 'three/addons/utils/BufferGeometryUtils.js';
import ts from 'typescript';

const cache=new Map();
function load(name){
  if(cache.has(name))return cache.get(name);
  const source=readFileSync(new URL(`../../src/scripts/room/${name}.ts`,import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};
  new Function('require','module','exports',compiled)(name=>{
    if(name==='three')return three;
    if(name.endsWith('RoundedBoxGeometry.js'))return {RoundedBoxGeometry};
    if(name.endsWith('BufferGeometryUtils.js'))return merge;
    if(name.endsWith('.json'))return {default:JSON.parse(readFileSync(new URL(`../../src/scripts/room/${name.slice(2)}`,import.meta.url),'utf8'))};
    return load(name.replace('./',''));
  },module,module.exports);
  cache.set(name,module.exports);return module.exports;
}
const {createProps}=load('props'),{batchRoom}=load('batch'),{leafMotion}=load('leaf-motion');
function fixture(interleaved=false){
  const root=new three.Group(),resources=new Set();
  const material=new three.MeshStandardMaterial();
  function mesh(name,x=0){const o=new three.Mesh(new three.BoxGeometry(.2,.03,.1),material);o.name=name;o.position.x=x;root.add(o);return o;}
  mesh('Work_Notepad').userData.paper_bend=[.006,.010];mesh('Work_Notepad_Backing');
  mesh('VHS_A_5',1).position.y=.8;mesh('VHS_A_1',1.3).position.y=.8;
  const master=new three.Group();master.name='VHS_Master';master.position.set(1,.8,0);root.add(master);
  for(const name of ['Shell','Label','Window_Left','Reel_Left','Reel_Right']){const o=mesh('VHS_Master_'+name);o.userData.atlas='tape';}
  const leaf=mesh('Plant_Leaf');leaf.userData.leaf_base=[0,0,0];leaf.userData.leaf_tip=[.2,.1,0];leaf.userData.leaf_phase=.8;
  if(interleaved){
    const p=leaf.geometry.attributes.position,n=leaf.geometry.attributes.normal,values=[];
    for(let i=0;i<p.count;i++)values.push(p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i));
    const buffer=new three.InterleavedBuffer(new Float32Array(values),6);
    leaf.geometry.setAttribute('position',new three.InterleavedBufferAttribute(buffer,3,0));leaf.geometry.setAttribute('normal',new three.InterleavedBufferAttribute(buffer,3,3));
  }
  const props=createProps(root,resources);
  return {root,resources,props,leaf,dispose(){for(const r of resources)r.dispose();material.dispose();}};
}
test('authored VHS remains visible and shares geometry with its moving instance after static batching',()=>{
  const f=fixture();f.props.optimize();batchRoom(f.root,f.resources);
  const master=f.root.getObjectByName('VHS_Master'),moving=f.root.getObjectByName('Authored_Moving_VHS');
  assert(master.visible);assert.equal(master.parent.name,'VHS_A_5');
  const geometry=new Set();master.traverse(o=>{if(o.isMesh)geometry.add(o.geometry);});
  moving.traverse(o=>{if(o.isMesh)assert(geometry.has(o.geometry),'clone must share the source geometry');});
  assert.equal(f.props.paper.children.filter(o=>o.name.startsWith('Work_Notepad')).length,2);f.dispose();
});
test('rapid insert, switch and eject clears physical as well as playback state',()=>{
  const f=fixture(),a={id:'a',object:'VHS_A_1'},b={id:'b',object:'VHS_A_5'};
  f.props.selectTape(a,0,false);f.props.update(.3,true,.1);f.props.selectTape(b,.3,false);f.props.eject(.4,false);f.props.update(2,true,.1);
  assert.deepEqual(f.props.tapeState,{tapePhase:'idle',physicalTape:'',pendingTape:''});
  assert.equal(f.root.getObjectByName('Moving_Cassette').visible,false);f.dispose();
});
test('the displayed cassette leaves its sleeve exactly once and returns before another tape loads',()=>{
  const f=fixture(),a={id:'stack',object:'VHS_A_5'},b={id:'pointers',object:'VHS_A_1'};
  f.props.optimize();batchRoom(f.root,f.resources);
  const resting=f.root.getObjectByName('VHS_Master'),moving=f.root.getObjectByName('Moving_Cassette');
  const home=resting.getWorldPosition(new three.Vector3());
  f.props.selectTape(a,0,false);
  assert.equal(resting.visible,false);assert.equal(moving.visible,true);assert(moving.position.distanceTo(home)<1e-8);
  f.props.update(2,true,.1);assert.equal(resting.visible,false);assert.equal(moving.visible,false);
  f.props.selectTape(b,3,false);f.props.update(3.5,true,.1);assert.equal(resting.visible,false);
  f.props.update(4,true,.1);assert.equal(resting.visible,true);assert.equal(moving.visible,true);
  assert.equal(f.props.tapeState.physicalTape,'pointers');
  f.props.selectTape(a,5,true);assert.equal(resting.visible,false);
  f.props.eject(6,true);assert.equal(resting.visible,true);assert.equal(moving.visible,false);f.dispose();
});
test('settling during a cassette return restores its resting representation',()=>{
  const f=fixture(),a={id:'stack',object:'VHS_A_5'};
  f.props.selectTape(a,0,false);f.props.update(.2,true,.1);f.props.eject(.3,false);f.props.finish();
  assert.equal(f.root.getObjectByName('VHS_Master').visible,true);
  assert.deepEqual(f.props.tapeState,{tapePhase:'idle',physicalTape:'',pendingTape:''});f.dispose();
});
test('reduced motion restores deformed blade coordinates without accumulating drift',()=>{
  const f=fixture(),original=Array.from(f.leaf.geometry.attributes.position.array);
  f.props.update(1.2,true,.1);
  assert.notDeepEqual(Array.from(f.leaf.geometry.attributes.position.array),original);
  f.props.update(1.3,false,.1);assert.deepEqual(Array.from(f.leaf.geometry.attributes.position.array),original);
  f.props.update(100,false,.1);assert.deepEqual(Array.from(f.leaf.geometry.attributes.position.array),original);f.dispose();
});
test('interleaved mesh transport retains bounded leaf animation and restores semantic positions',()=>{
  const f=fixture(true),positions=()=>{const p=f.leaf.geometry.attributes.position;return Array.from({length:p.count},(_,i)=>[p.getX(i),p.getY(i),p.getZ(i)]);},rest=positions();
  f.props.update(.25,true,1/60);
  const moving=positions();for(let i=0;i<rest.length;i++)assert(new three.Vector3(...rest[i]).distanceTo(new three.Vector3(...moving[i]))<.06,'mesh fields must never be mistaken for positions');
  f.props.update(.3,false,1/60);assert.deepEqual(positions(),rest);f.dispose();
});
test('ambient leaf motion remains bounded and differs in phase',()=>{
  let max=0,difference=0;
  for(let i=0;i<1200;i++){const a=leafMotion(i/24,0,true),b=leafMotion(i/24,2.4,true);max=Math.max(max,Math.abs(a.bend));difference+=Math.abs(a.bend-b.bend);}
  assert(max<.34);assert(difference>50);
  assert.deepEqual(leafMotion(10,1,false),{bend:0,twist:0});
});

test('insertion starts at the cached sleeve position after its geometry has been batched away',()=>{
  const f=fixture(),sleeve=f.root.getObjectByName('VHS_A_1');
  // The static merger retains identity as an empty Object3D.
  sleeve.geometry.dispose();sleeve.removeFromParent();const identity=new three.Group();identity.name='VHS_A_1';f.root.add(identity);
  f.props.selectTape({id:'a',object:'VHS_A_1'},2,false);
  const position=f.root.getObjectByName('Moving_Cassette').position;
  assert.equal(position.x,1.3);assert.equal(position.y,.8);assert.equal(position.z,.22);f.dispose();
});
test('ejection clears the recorder horizontally before lifting over the desk',()=>{
  const f=fixture();f.props.selectTape({id:'a',object:'VHS_A_1'},0,false);f.props.update(2,true,.1);
  f.props.eject(3,false);f.props.update(3.1,true,.1);
  const position=f.root.getObjectByName('Moving_Cassette').position;
  assert.equal(position.x,-.22);assert.equal(position.y,.85);assert(position.z>.32&&position.z<.88);
  f.props.update(3.5,true,.1);assert(position.y>.85);f.dispose();
});
