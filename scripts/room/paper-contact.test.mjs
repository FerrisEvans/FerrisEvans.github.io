import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as three from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
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
const {createProps}=load('props'),{batchRoom}=load('batch');
const {paperLift,paperFlex}=load('paper-shape');
const anchors=JSON.parse(readFileSync(new URL('../../src/scripts/room/anchors.json',import.meta.url),'utf8'));
const camera=new three.PerspectiveCamera();camera.position.set(1.35,2.65,6.65);camera.lookAt(1.3,1.28,.10);

function fixture(){
  const root=new three.Group(),resources=new Set(),material=new three.MeshStandardMaterial();resources.add(material);
  function box(name,size,position,angle=0){
    const geometry=new three.BoxGeometry(...size);resources.add(geometry);
    const mesh=new three.Mesh(geometry,material);mesh.name=name;mesh.position.fromArray(position);mesh.rotation.y=angle;root.add(mesh);return mesh;
  }
  const desk=box('Desk_Top',[5.9,.065,1.875],[-.25,.6525,.0125]);
  // Conservative top-sheet bounds and actual backing/block dimensions. The
  // backing's 0.6 mm clearance is intentional, not an adjustable animation fix.
  box('Work_Notepad',[1.05,.03624,.66],[1.46,.71978,.58],-.11).userData.paper_bend=[.02,.036];
  box('Work_Notepad_Block',[1.05,.0132,.66],[1.46,.693,.58],-.11);
  box('Work_Notepad_Backing',[1.05,.0008,.66],[1.46,.686,.58],-.11);
  const master=new three.Group();master.name='VHS_Master';root.add(master);
  const props=createProps(root,resources),rest={position:props.paper.position.clone(),quaternion:props.paper.quaternion.clone()};
  return {root,resources,props,rest,desk,shadow:root.getObjectByName('Paper_Contact_Shadow'),dispose(){for(const resource of resources)resource.dispose();}};
}
function closePose(actual,expected){
  assert(actual.position.distanceTo(expected.position)<1e-10,'position changed');
  assert(actual.quaternion.angleTo(expected.quaternion)<1e-7,'orientation changed');
}
function aboveDesk(f){
  const paper=new three.Box3().setFromObject(f.props.paper,true),desk=new three.Box3().setFromObject(f.desk,true);
  assert(paper.min.y>=desk.max.y-1e-7,`paper penetrated desktop by ${desk.max.y-paper.min.y}`);
}

test('paper clears the desk before tilting and is level before settling',()=>{
  const f=fixture();f.props.setPaper(true,0,false,camera);f.props.update(.12,true,1/60);
  assert(f.props.paper.position.y>f.rest.position.y+.03);assert.equal(f.props.paper.position.x,f.rest.position.x);assert.equal(f.props.paper.position.z,f.rest.position.z);
  assert(f.props.paper.quaternion.angleTo(f.rest.quaternion)<1e-7);
  f.props.update(1,true,1/60);
  const held=f.props.paper.position.clone().sub(camera.position).applyQuaternion(camera.quaternion.clone().invert());
  assert(held.y<-.25&&held.z>-2.5,'held paper must occupy the lower foreground');
  const reading=f.props.paper.quaternion.clone();
  f.props.setPaper(false,2,false,camera);f.props.update(2.63,true,1/60);
  assert(f.props.paper.position.y>f.rest.position.y);assert.equal(f.props.paper.position.x,f.rest.position.x);assert.equal(f.props.paper.position.z,f.rest.position.z);
  assert(f.props.paper.quaternion.angleTo(f.rest.quaternion)<1e-7);
  f.props.update(2.71,true,1/60);closePose(f.props.paper,f.rest);
  f.props.setPaper(true,3,true,camera);assert(f.props.paper.quaternion.angleTo(reading)<1e-7);f.dispose();
});

test('normal and interrupted paper journeys preserve desk clearance and do not snap on reversal',()=>{
  for(const fraction of [.03,.13,.25,.5,.85,1]){
    const f=fixture();let time=0;
    for(const [raised,duration] of [[true,.95],[false,.70],[true,.95],[false,.70]]){
      const snapshot={position:f.props.paper.position.clone(),quaternion:f.props.paper.quaternion.clone()};
      f.props.setPaper(raised,time,false,camera);f.props.update(time,true,1/120);closePose(f.props.paper,snapshot);
      for(let i=1;i<=120;i++){f.props.update(time+duration*fraction*i/120,true,1/120);aboveDesk(f);}
      time+=duration*fraction;
    }
    f.props.finish();closePose(f.props.paper,f.rest);aboveDesk(f);f.dispose();
  }
});

test('contact shadow fades on lift and resets immediately on reduced motion or finish',()=>{
  const f=fixture(),shadow=f.shadow,restOpacity=shadow.material.opacity;
  assert(shadow.visible&&restOpacity>0&&restOpacity<=.2);
  f.props.setPaper(true,0,false,camera);f.props.update(.08,true,1/60);
  assert(shadow.material.opacity>0&&shadow.material.opacity<restOpacity);
  f.props.update(.2,true,1/60);assert.equal(shadow.visible,false);
  f.props.finish();assert.equal(shadow.visible,false);
  f.props.setPaper(false,1,true,camera);closePose(f.props.paper,f.rest);assert(shadow.visible);assert.equal(shadow.material.opacity,restOpacity);
  f.props.setPaper(true,2,true,camera);assert.equal(shadow.visible,false);assert.equal(f.props.paperMoving,false);
  f.props.setPaper(false,3,false,camera);f.props.finish();assert(shadow.visible);assert.equal(shadow.material.opacity,restOpacity);closePose(f.props.paper,f.rest);f.dispose();
});

test('contact cue stays independent of batching, has no picking hit, and owns disposable resources',()=>{
  const f=fixture(),shadow=f.shadow;
  f.props.optimize();batchRoom(f.root,f.resources);
  assert.equal(f.root.getObjectByName('Paper_Contact_Shadow'),shadow);assert(shadow.userData.roomDynamic);
  const bounds=new three.Box3().setFromObject(shadow),backing=new three.Box3().setFromObject(f.props.paper.getObjectByName('Work_Notepad_Backing'));
  assert(bounds.max.y<backing.min.y&&bounds.min.y>.685,'contact cue lies between desktop and backing');
  assert.equal(shadow.parent,f.root,'shadow must not travel with held paper');
  const ray=new three.Raycaster(new three.Vector3(1.46,2,.58),new three.Vector3(0,-1,0));assert.equal(ray.intersectObject(shadow).length,0);
  for(const resource of [shadow.geometry,shadow.material,shadow.material.map])assert(f.resources.has(resource));
  f.props.setPaper(true,0,true,camera);assert.equal(shadow.visible,false);f.dispose();
});

test('held directory keeps last tape, reading link and put-down action inside desktop viewports',()=>{
  for(const [width,height] of [[1440,900],[1024,768],[1440,800],[1920,1080]]){
    const f=fixture(),corners=anchors.surfaces.work.map(p=>f.props.paper.worldToLocal(new three.Vector3(...p)));
    const view=camera.clone();view.aspect=width/height;view.fov=2*Math.atan(Math.tan(.5829135753502417/2)*1.5/view.aspect)*180/Math.PI;view.updateProjectionMatrix();view.updateMatrixWorld(true);
    f.props.resize(width,height);f.props.setPaper(true,0,true,view);
    for(const rect of [[28,117+11*29,320,29],[384,450,342,34],[28,489,310,48]]){
      const [x,y,w,h]=rect;
      for(const [px,py]of [[x,y],[x+w,y],[x+w,y+h],[x,y+h]]){
        const u=px/768,v=py/576,p=corners[0].clone().lerp(corners[1],u).lerp(corners[3].clone().lerp(corners[2],u),v);
        p.y+=paperLift(u,v,[.02,.036])+paperFlex(u,v,0);f.props.paper.localToWorld(p).project(view);
        const screenX=(p.x+1)*width/2,screenY=(1-p.y)*height/2;
        assert(screenX>=0&&screenX<=width&&screenY>80&&screenY<height-16,`${width}×${height}: clipped action at ${screenX},${screenY}`);
      }
    }
    f.dispose();
  }
});
