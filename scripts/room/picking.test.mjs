import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as three from 'three';
import * as merge from 'three/addons/utils/BufferGeometryUtils.js';
import ts from 'typescript';

function load(name){
  const source=readFileSync(new URL(`../../src/scripts/room/${name}.ts`,import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};
  new Function('require','module','exports',compiled)(name=>name==='three'?three:merge,module,module.exports);
  return module.exports;
}
const {createSurfacePicker}=load('picking'),{batchRoom}=load('batch');
const {Group,Mesh,MeshBasicMaterial,BoxGeometry,RingGeometry,Raycaster,Vector3}=three;
function fixture(){
  const root=new Group(),resources=new Set(),material=new MeshBasicMaterial();resources.add(material);
  function mesh(name,geometry,parent=root){const mesh=new Mesh(geometry,material);mesh.name=name;resources.add(geometry);parent.add(mesh);return mesh;}
  const target=(id,object)=>({id,label:id,roots:[object]});
  const ray=(x=0,y=0)=>new Raycaster(new Vector3(x,y,2),new Vector3(0,0,-1));
  return{root,resources,mesh,target,ray,dispose(){for(const resource of resources)resource.dispose();}};
}

test('surface picking respects a visible hole instead of the containing AABB',()=>{
  const f=fixture(),ring=f.mesh('Phone_Dial',new RingGeometry(.25,.5,32)),paper=f.mesh('Paper',new BoxGeometry(1,1,.02));paper.position.z=-.3;
  const picker=createSurfacePicker(f.root,[f.target('phone',ring),f.target('paper',paper)],f.resources);picker.bind();
  assert.equal(picker.pick(f.ray()).id,'paper');
  assert.equal(picker.pick(f.ray(.4)).id,'phone');f.dispose();
});

test('nearest real surface and nested controls win independent of registration order',()=>{
  for(const reverse of [false,true]){
    const f=fixture(),player=new Group();player.name='CD_Motion';f.root.add(player);
    f.mesh('Case',new BoxGeometry(1,1,.1),player);
    const button=f.mesh('Button',new BoxGeometry(.2,.2,.04),player);button.position.set(.3,0,.07);
    const targets=[f.target('cd',player),f.target('play',button)];if(reverse)targets.reverse();
    const picker=createSurfacePicker(f.root,targets,f.resources);picker.bind();
    assert.equal(picker.pick(f.ray(.3)).id,'play');assert.equal(picker.pick(f.ray(-.3)).id,'cd');f.dispose();
  }
});

test('a 2 mm noninteractive obstruction blocks a target while hidden and translucent decorations do not',()=>{
  const f=fixture(),target=f.mesh('Pager',new BoxGeometry(.4,.4,.1));
  const blocker=f.mesh('Other_Device',new BoxGeometry(.4,.4,.002));blocker.position.z=.052;
  const picker=createSurfacePicker(f.root,[f.target('pager',target)],f.resources);picker.bind();
  assert.equal(picker.pick(f.ray()),null);
  const hidden=new Group();hidden.visible=false;f.root.add(hidden);hidden.add(blocker);
  assert.equal(picker.pick(f.ray()).id,'pager','hidden ancestors cannot occlude');
  hidden.visible=true;blocker.material=new MeshBasicMaterial({transparent:true,opacity:.12,depthWrite:false});f.resources.add(blocker.material);
  assert.equal(picker.pick(f.ray()).id,'pager','decorative glass is not an opaque click wall');
  target.visible=false;assert.equal(picker.pick(f.ray()),null);f.dispose();
});

test('batching keeps picking on the same triangles and moving frame without extra rendered meshes',()=>{
  const f=fixture(),prop=new Group();prop.name='Floppy_Motion';f.root.add(prop);
  const body=f.mesh('Body',new BoxGeometry(.3,.3,.04),prop),shutter=f.mesh('Shutter',new BoxGeometry(.1,.1,.02),prop);
  shutter.position.set(.05,.05,.03);body.userData.atlas=shutter.userData.atlas='equipment';
  const picker=createSurfacePicker(f.root,[f.target('floppy',prop)],f.resources);
  assert.equal(f.root.children.length,1,'picking has no rendered scene nodes');
  batchRoom(prop,f.resources);picker.bind();
  assert.equal(prop.children.filter(object=>object.isMesh).length,1,'visible batching remains effective');
  assert.equal(picker.pick(f.ray(.05,.05)).id,'floppy');
  prop.position.x=.8;prop.rotation.z=.2;
  assert.equal(picker.pick(f.ray()),null,'old location is not still a hit box');
  assert.equal(picker.pick(f.ray(.8)).id,'floppy');
  prop.visible=false;assert.equal(picker.pick(f.ray(.8)),null);f.dispose();
});

test('occlusion uses local pre-batch geometry and never raycasts the merged render mesh',()=>{
  const f=fixture(),device=f.mesh('Device',new BoxGeometry(.4,.4,.1)),wall=f.mesh('Wall',new BoxGeometry(.2,.2,.02));
  wall.position.set(.1,0,.2);device.userData.atlas=wall.userData.atlas='equipment';
  const distant=f.mesh('Distant',new BoxGeometry(.2,.2,.02));distant.position.x=20;distant.userData.atlas='equipment';
  const picker=createSurfacePicker(f.root,[f.target('device',device)],f.resources);
  batchRoom(f.root,f.resources);picker.bind();
  for(const object of f.root.children)if(object.isMesh)object.raycast=()=>{throw new Error('Merged geometry must not be raycast');};
  assert.equal(picker.pick(f.ray(.1)),null,'unlabelled solid surface still occludes after batching');
  assert.equal(picker.pick(f.ray(-.1)).id,'device');assert.equal(picker.pick(f.ray(20)),null);f.dispose();
});

test('a detached VHS label belongs to the same tape and blocks the player behind it after batching',()=>{
  const f=fixture(),tape=f.mesh('VHS_B_2',new BoxGeometry(.4,.4,.08)),label=f.mesh('Label_VHS_B_2',new BoxGeometry(.3,.3,.004));
  label.position.z=.043;const player=f.mesh('Walkman',new BoxGeometry(.6,.6,.04));player.position.z=-.1;
  for(const object of [tape,label,player])object.userData.atlas='props';
  const target={id:'tape:6',label:'tape',roots:[tape,label]},picker=createSurfacePicker(f.root,[target,f.target('walkman',player)],f.resources);
  batchRoom(f.root,f.resources);picker.bind();
  assert.equal(picker.pick(f.ray()).id,'tape:6','label face is not an unassigned dead zone');
  assert.equal(picker.pick(f.ray(.18)).id,'tape:6','exposed sleeve has the same action');
  assert.equal(picker.pick(f.ray(.25)).id,'walkman');f.dispose();
});

function cutoutFixture(map,alphaMap=null){
  const f=fixture(),behind=f.mesh('Device',new BoxGeometry(1,1,.04)),leaf=f.mesh('Leaf',new three.PlaneGeometry(1,1));
  leaf.position.z=.3;leaf.material=new MeshBasicMaterial({map,alphaMap,alphaTest:.45,side:three.DoubleSide});
  f.resources.add(leaf.material);if(map)f.resources.add(map);if(alphaMap)f.resources.add(alphaMap);
  const picker=createSurfacePicker(f.root,[f.target('device',behind),f.target('leaf',leaf)],f.resources);picker.bind();
  return{...f,leaf,picker};
}
const rgba=(values,width=2,height=2)=>new three.DataTexture(new Uint8Array(values.flat()),width,height);

test('cutout texture holes pass through in both target and obstruction rays while opaque leaf pixels block',()=>{
  const map=rgba([[0,0,0,0],[255,255,255,255],[255,255,255,255],[0,0,0,0]]),f=cutoutFixture(map);
  assert.equal(f.picker.pick(f.ray(-.25,-.25)).id,'device');
  assert.equal(f.picker.pick(f.ray(.25,-.25)).id,'leaf');
  // Removing the leaf action must keep the same real-pixel occlusion rule.
  const picker=createSurfacePicker(f.root,[f.target('device',f.root.getObjectByName('Device'))],f.resources);picker.bind();
  assert.equal(picker.pick(f.ray(-.25,-.25)).id,'device');assert.equal(picker.pick(f.ray(.25,-.25)),null);f.dispose();
});

test('alpha picking follows texture UV transform, flipY, repeat and mirrored wrapping',()=>{
  const map=rgba([[0,0,0,0],[255,255,255,255],[255,255,255,255],[0,0,0,0]]),f=cutoutFixture(map);
  map.flipY=true;assert.equal(f.picker.pick(f.ray(-.25,-.25)).id,'leaf');map.flipY=false;
  map.offset.x=.5;assert.equal(f.picker.pick(f.ray(-.25,-.25)).id,'leaf');
  map.offset.x=1;map.wrapS=three.RepeatWrapping;assert.equal(f.picker.pick(f.ray(-.25,-.25)).id,'device');
  map.wrapS=three.MirroredRepeatWrapping;assert.equal(f.picker.pick(f.ray(-.25,-.25)).id,'leaf');
  map.wrapS=three.ClampToEdgeWrapping;map.offset.x=-1;assert.equal(f.picker.pick(f.ray(.25,-.25)).id,'device');
  map.offset.set(0,0);map.rotation=Math.PI/2;map.center.set(.5,.5);assert.equal(f.picker.pick(f.ray(-.25,-.25)).id,'leaf');f.dispose();
});

test('alphaMap uses green, map uses alpha, and material opacity multiplies the threshold',()=>{
  const map=rgba([[0,0,0,128]],1,1),mask=rgba([[255,128,255,255]],1,1),f=cutoutFixture(map,mask);
  assert.equal(f.picker.pick(f.ray()).id,'device','combined .5 x .5 alpha is below the .45 threshold');
  f.leaf.material.map=null;assert.equal(f.picker.pick(f.ray()).id,'leaf','green .5 passes despite unrelated red/blue channels');
  f.leaf.material.opacity=.5;assert.equal(f.picker.pick(f.ray()).id,'device');f.dispose();
});

test('image alpha pixels are read once on an independent canvas and unreadable images stay solid',()=>{
  const previous=globalThis.document;let reads=0,draws=0,created=0;
  const pixels=new Uint8ClampedArray([255,255,255,0]);
  globalThis.document={createElement(name){assert.equal(name,'canvas');created++;return{width:0,height:0,getContext(kind,options){assert.equal(kind,'2d');assert.equal(options.willReadFrequently,true);return{drawImage(){draws++;},getImageData(){reads++;return{data:pixels};}};}};}};
  try{
    const map=new three.Texture({width:1,height:1}),f=cutoutFixture(map);
    for(let i=0;i<4;i++)assert.equal(f.picker.pick(f.ray()).id,'device');
    assert.equal(reads,1);assert.equal(draws,1);assert.equal(created,1);f.dispose();
    globalThis.document.createElement=()=>({width:0,height:0,getContext(){return{drawImage(){},getImageData(){throw new Error('unreadable');}};}});
    const blocked=cutoutFixture(new three.Texture({width:1,height:1}));
    assert.equal(blocked.picker.pick(blocked.ray()).id,'leaf');blocked.dispose();
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
