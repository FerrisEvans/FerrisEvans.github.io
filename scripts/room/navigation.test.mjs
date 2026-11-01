import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {Box3,BoxGeometry,Mesh,MeshBasicMaterial,PerspectiveCamera,Scene,Vector3} from 'three';
import ts from 'typescript';

const require=createRequire(import.meta.url);
const compile=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const mathUrl=compile(readFileSync(new URL('../../src/scripts/room/window-navigation.ts',import.meta.url),'utf8'));
const {windowInspection,windowDetailZoom}=await import(mathUrl);
const anchors=JSON.parse(readFileSync(new URL('../../src/scripts/room/anchors.json',import.meta.url),'utf8'));
const source=readFileSync(new URL('../../src/scripts/room/navigation.ts',import.meta.url),'utf8')
  .replace("from 'three'",`from '${pathToFileURL(require.resolve('three').replace('/three.cjs','/three.module.js')).href}'`)
  .replace("import anchors from './anchors.json';",`const anchors=${JSON.stringify(anchors)};`)
  .replace("from './window-navigation'",`from '${mathUrl}'`);
const {createNavigation}=await import(compile(source));
const viewports=[[1440,900],[1920,1080],[1024,768],[1201,1000]];
function setup(width=1440,height=900,room){
  const camera=new PerspectiveCamera(42,1.6,.01,100);camera.position.set(.078,2.29,5.43);camera.lookAt(0,1.5,0);
  const nav=createNavigation(camera,undefined,room);
  function resize(w,h){camera.aspect=w/h;camera.fov=2*Math.atan(Math.tan(42*Math.PI/360)*1.6/camera.aspect)*180/Math.PI;camera.updateProjectionMatrix();nav.resize(w,h);}
  resize(width,height);return{camera,nav,resize};
}
function photoPoint(u,v){const [x,y,z]=windowInspection.position;return new Vector3(x+(u-.5)*windowInspection.width,y-(v-.5)*windowInspection.height,z);}
function screenUV(camera,x,y){
  camera.updateMatrixWorld(true);
  const ray=new Vector3(x,y,.5).unproject(camera).sub(camera.position).normalize();
  const hit=camera.position.clone().addScaledVector(ray,(windowInspection.position[2]-camera.position.z)/ray.z);
  return [(hit.x-windowInspection.position[0])/windowInspection.width+.5,.5-(hit.y-windowInspection.position[1])/windowInspection.height];
}
const close=(a,b,label='')=>assert.ok(Math.abs(a-b)<1e-7,`${label}: ${a} != ${b}`);
function checkCoverage(camera){
  const a=screenUV(camera,-1,1),b=screenUV(camera,1,-1);
  for(let i=0;i<2;i++){
    if(b[i]-a[i]>=1-1e-7){assert.ok(a[i]<=1e-7&&b[i]>=1-1e-7,'letterboxed axis must include the complete photograph');close((a[i]+b[i])/2,.5,'letterbox stays centred');}
    else assert.ok(a[i]>=-1e-7&&b[i]<=1+1e-7,`detail axis cannot reveal a card edge: ${a[i]}..${b[i]}`);
  }
}

test('overview contains all four original image corners in each required desktop viewport',()=>{
  for(const [width,height] of viewports){
    const {camera,nav}=setup(width,height);nav.go('window',0,true);nav.windowMode('overview');nav.update(0,0,false);camera.updateMatrixWorld(true);
    for(const u of [0,1])for(const v of [0,1]){
      const p=photoPoint(u,v).project(camera);
      assert.ok(Math.abs(p.x)<=1&&Math.abs(p.y)<=1,`${width}x${height} cropped photo corner ${u},${v}`);
    }
    close(nav.windowState.zoom,1);assert.equal(nav.windowState.mode,'overview');checkCoverage(camera);
  }
});

test('the first window look fills the view while full panorama remains one explicit action away',()=>{
  for(const [width,height]of viewports){
    const{camera,nav}=setup(width,height);nav.go('window',0,true);nav.update(0,0,false);
    assert.equal(nav.windowState.mode,'detail');
    const a=screenUV(camera,-1,1),b=screenUV(camera,1,-1);
    assert.ok(b[0]-a[0]<1&&b[1]-a[1]<1,'detail fills both viewport axes');
    nav.windowMode('overview');nav.update(1,0,false);
    assert.equal(nav.windowState.mode,'overview');checkCoverage(camera);
  }
});

test('the first window look provides useful vertical exploration, not only horizontal panning',()=>{
  const {nav}=setup();nav.go('window',0,true);nav.update(0,0,false);
  nav.drag(0,10000);nav.update(1,0,false);const top=nav.windowState.center[1];
  nav.drag(0,-20000);nav.update(2,0,false);
  assert(nav.windowState.center[1]-top>.20);
});

test('the 486 camera faces the rotated glass and keeps native screen corners ordered and visible',()=>{
  const {camera,nav}=setup();nav.go('about',0,true);nav.update(0,0,false);camera.updateMatrixWorld(true);
  const points=anchors.surfaces.about.map(p=>new Vector3(...p).project(camera));
  for(const p of points)assert(Math.abs(p.x)<1&&Math.abs(p.y)<1);
  assert(points[0].x<points[1].x&&points[3].x<points[2].x,'screen must not be mirrored');
  assert(points[0].y>points[3].y&&points[1].y>points[2].y,'screen must stay upright');
});

test('relocated clock and Rolodex inspection poses follow the delivered prop families',()=>{
  const room=new Scene(),material=new MeshBasicMaterial();
  function part(name,center,size){const mesh=new Mesh(new BoxGeometry(...size),material);mesh.name=name;mesh.position.fromArray(center);room.add(mesh);return mesh;}
  const clock=part('Desk_Clock',[3.649,.815,.37],[.142,.260,.220]);
  clock.rotation.y=-Math.PI/2;
  part('Desk_Rolodex',[-1.02,.735,-.35],[.400,.100,.300]);
  part('Desk_Rolodex_Cards',[-1.02,.90078,-.35],[.350,.23156,.220]);
  const {camera,nav}=setup(1440,900,room);
  for(const [name,target,front]of [['clock',new Vector3(3.649,.815,.37),new Vector3(-1,0,0)],['rolodex',new Vector3(-1.02,.85078,-.35),new Vector3(0,0,1)]]){
    nav.go(name,0,true);nav.update(0,0,false);camera.updateMatrixWorld(true);
    const p=target.clone().project(camera);assert.ok(Math.abs(p.x)<1e-6&&Math.abs(p.y)<1e-6,'family bounds centre stays at the visual focus');
    assert.ok(camera.position.clone().sub(target).dot(front)>.5,'view approaches the physical front');
  }
  clock.geometry.dispose();room.traverse(object=>object.geometry?.dispose());material.dispose();
});

test('clock inspection follows the delivered face orientation without changing Home limits or pose',()=>{
  const material=new MeshBasicMaterial();
  for(const yaw of [0,-Math.PI/2,.36]){
    const room=new Scene(),clock=new Mesh(new BoxGeometry(.22,.26,.142),material);clock.name='Desk_Clock';clock.position.set(3.1,.815,.25);clock.rotation.y=yaw;room.add(clock);
    const {camera,nav}=setup(1440,900,room),home=camera.position.clone(),orientation=camera.quaternion.clone();
    nav.go('clock',0,true);nav.update(0,0,false);camera.updateMatrixWorld(true);
    const towardCamera=camera.position.clone().sub(clock.position),front=new Vector3(0,0,1).applyQuaternion(clock.quaternion);
    assert.ok(Math.abs(towardCamera.dot(front)-.62)<1e-7,'inspection remains in front of the authored dial');
    const dial=clock.position.clone().project(camera);assert.ok(Math.abs(dial.x)<1e-7&&Math.abs(dial.y)<1e-7,'dial stays centred');
    nav.go('home',1,true);nav.update(1,0,false);
    assert.ok(camera.position.distanceTo(home)<1e-7);assert.ok(camera.quaternion.angleTo(orientation)<1e-7);
    clock.geometry.dispose();
  }
  material.dispose();
});

test('phone inspection faces the actual handset and dial, fits after resize, and stays inside the left wall',()=>{
  const material=new MeshBasicMaterial();
  for(const yaw of [0,Math.PI/18,-Math.PI/4]){
    const room=new Scene(),body=new Mesh(new BoxGeometry(.487,.26,.383),material),cord=new Mesh(new BoxGeometry(.587,.02,.536),material);
    body.name='Retro_Phone';body.position.set(-2.85,.815,.48);body.rotation.y=yaw;room.add(body);
    cord.name='Retro_Phone_Cord';cord.position.set(-2.85,.70,.48);cord.rotation.y=yaw;room.add(cord);
    const {camera,nav,resize}=setup(1440,900,room);nav.go('phone',0,true);
    const bounds=new Box3().setFromObject(room),center=bounds.getCenter(new Vector3()),front=new Vector3(0,0,1).applyQuaternion(body.quaternion);
    for(const [width,height]of viewports){
      resize(width,height);nav.update(0,0,false);camera.updateMatrixWorld(true);
      assert.ok(camera.position.x>=-3.60&&camera.position.y>bounds.max.y,'camera stays within the room and above the phone');
      assert.ok(camera.position.clone().sub(center).dot(front)>.45,'view approaches the actual dial/front side');
      for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
        const p=new Vector3(x,y,z).project(camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1,'handset, dial and cord remain in frame');
      }
    }
    body.geometry.dispose();cord.geometry.dispose();
  }
  material.dispose();
});

test('phone returns to the exact Home observation and subsequent drag continues the saved orbit',()=>{
  for(const reduced of [false,true]){
    const reference=setup(),inspection=setup();
    for(const {nav}of [reference,inspection]){
      nav.drag(-145,33);nav.drag(65,-20,true);nav.zoom(170);nav.update(1000,0,false);
      nav.drag(-14,7);nav.update(1016,1/60,true); // Also preserve an in-flight orbit ease and Home breathing phase.
    }
    const {camera,nav}=inspection,saved=nav.captureInspectionReturn(),position=camera.position.clone(),quaternion=camera.quaternion.clone();assert(saved);
    nav.go('phone',1100,reduced);nav.update(2300,.1,true);
    nav.restoreInspectionReturn(saved,4000,reduced);
    if(!reduced){nav.update(5199.999,.1,true);const before=camera.position.clone();nav.update(5200,.001,true);assert.ok(before.distanceTo(camera.position)<1e-7);}
    else nav.update(4000,0,false);
    assert.ok(camera.position.distanceTo(position)<1e-7,'return first frame must use the captured camera');
    assert.ok(camera.quaternion.angleTo(quaternion)<1e-7);assert.equal(nav.view,'home');
    const arrived=reduced?4000:5200;
    reference.nav.update(1032,1/60,true);nav.update(arrived+16,1/60,true);
    assert.ok(camera.position.distanceTo(reference.camera.position)<1e-7,'next frame resumes the same orbit ease and breathing phase');
    for(const entry of [reference,inspection])entry.nav.drag(24,-9);
    reference.nav.update(1048,1/60,true);nav.update(arrived+32,1/60,true);
    assert.ok(camera.position.distanceTo(reference.camera.position)<1e-7,'drag must keep the original pan, zoom and target');
    assert.ok(camera.quaternion.angleTo(reference.camera.quaternion)<1e-7);
  }
});

test('inspection return preserves current resize and TV/window state, and refuses unsettled snapshots',()=>{
  for(const view of ['home','tv','window']){
    const {camera,nav,resize}=setup();nav.go(view,0,true);
    if(view==='window'){nav.windowMode('detail');nav.update(0,0,false);nav.drag(80,40);}
    else{nav.drag(-35,20);nav.zoom(60);}
    nav.update(1,0,false);const saved=nav.captureInspectionReturn();assert(saved);
    const state=nav.windowState;nav.go('phone',10,false);assert.equal(nav.captureInspectionReturn(),null);
    nav.update(1210,.1,true);resize(1920,1080);const fov=camera.fov;
    nav.restoreInspectionReturn(saved,2000,true);nav.update(2000,0,false);
    assert.equal(camera.aspect,1920/1080);assert.equal(camera.fov,fov);assert.equal(nav.view,view);
    const arrival=camera.position.clone();nav.update(2001,0,false);assert.ok(camera.position.distanceTo(arrival)<1e-7,'responsive return must not snap again on its following frame');
    if(view==='window'){assert.equal(nav.windowState.zoom,state.zoom);checkCoverage(camera);nav.resetWindow();nav.update(2001,0,false);assert.equal(nav.windowState.zoom,1);}
    else{assert.equal(camera.zoom,1);assert.ok(!camera.view?.enabled);nav.drag(10,10);nav.update(2001,0,false);assert.ok(camera.position.toArray().every(Number.isFinite));}
  }
});

test('route navigation cancels a pending phone return instead of later restoring its stale Home state',()=>{
  const {camera,nav}=setup();nav.drag(-120,30);nav.update(1,0,false);const saved=nav.captureInspectionReturn();assert(saved);
  nav.go('phone',10,true);nav.restoreInspectionReturn(saved,20,false);nav.update(420,.1,true);
  nav.go('posts',500,true);nav.update(500,0,false);const posts=camera.position.clone();
  nav.update(3000,.1,false);assert.equal(nav.view,'posts');assert.ok(camera.position.distanceTo(posts)<1e-7);
  nav.reset();nav.update(3001,0,false);assert.equal(nav.view,'home');assert.ok(camera.position.distanceTo(new Vector3(.078,2.29,5.43))<1e-7);
});

test('lowering Work paper supersedes a phone return and leaves the down view draggable',()=>{
  const reference=setup();reference.nav.go('work',0,true);reference.nav.paper(false,0,true);reference.nav.update(0,0,false);
  for(const reducedReturn of [false,true]){
    const {camera,nav}=setup();nav.go('work',0,true);nav.paper(true,0,true);nav.update(0,0,false);
    const saved=nav.captureInspectionReturn();assert(saved);nav.go('phone',100,true);nav.update(100,0,false);
    nav.restoreInspectionReturn(saved,2000,reducedReturn);
    if(!reducedReturn)nav.update(2400,.1,true);
    const before=camera.position.clone();nav.paper(false,2500,false);nav.update(3100,.1,true);
    assert.ok(camera.position.distanceTo(before)>.05,'paper transition cannot be skipped by an old return arrival frame');
    nav.update(3700,.1,false);assert.ok(camera.position.distanceTo(reference.camera.position)<1e-7);
    const arrived=camera.position.clone();nav.update(3716,1/60,false);
    assert.ok(camera.position.distanceTo(arrived)<1e-7,'old raised-paper snapshot cannot overwrite the completed paper-down transition');
    nav.drag(25,-10);nav.update(3732,0,false);
    assert.ok(camera.position.distanceTo(arrived)>.01,'paper-down orbit remains enabled');
  }
});

test('window reset during an inspection return stays queued while drag and zoom are ignored',()=>{
  const {camera,nav}=setup();nav.go('window',0,true);nav.windowMode('detail');nav.update(0,0,false);
  const saved=nav.captureInspectionReturn();assert(saved);const state=nav.windowState;
  nav.go('phone',100,true);nav.restoreInspectionReturn(saved,2000,false);nav.update(2300,.1,true);
  nav.drag(1000,1000);nav.zoom(-999);nav.resetWindow();
  assert.equal(nav.windowState.zoom,state.zoom);assert.deepEqual(nav.windowState.center,state.center);
  nav.update(3200,.1,true);assert.equal(nav.windowState.zoom,state.zoom);
  nav.update(3216,1/60,false);assert.equal(nav.windowState.zoom,1);assert.deepEqual(nav.windowState.center,[.5,.5]);checkCoverage(camera);
});

test('resizing during a phone-to-TV return updates the arrival pose before completing the return',()=>{
  const room=new Scene(),material=new MeshBasicMaterial(),cabinet=new Mesh(new BoxGeometry(1.156,1.178,.826),material);
  cabinet.name='CRT_Case';cabinet.position.set(0,1.538,-.098);room.add(cabinet);
  const {camera,nav,resize}=setup(1440,900,room);nav.go('tv',0,true);nav.drag(12,-4);nav.zoom(70);nav.update(0,0,false);
  const saved=nav.captureInspectionReturn();assert(saved);nav.go('phone',100,true);nav.restoreInspectionReturn(saved,2000,false);
  nav.update(2600,.1,true);resize(1920,1080);nav.update(3199.999,.1,true);const approaching=camera.position.clone();
  nav.update(3200,.001,true);const arrived=camera.position.clone();assert.ok(approaching.distanceTo(arrived)<1e-7);
  nav.update(3216,1/60,false);assert.ok(camera.position.distanceTo(arrived)<1e-7,'responsive TV base must not replace a stale arrival pose one frame later');
  const reference=setup(1920,1080,room);reference.nav.go('tv',0,true);reference.nav.drag(12,-4);reference.nav.zoom(70);reference.nav.update(0,0,false);
  assert.ok(camera.position.distanceTo(reference.camera.position)<1e-7,'arrival uses the resized TV framing with the saved orbit and zoom');
  assert.ok(camera.quaternion.angleTo(reference.camera.quaternion)<1e-7);
  cabinet.geometry.dispose();material.dispose();
});

test('TV inspection keeps the whole cabinet and lowest physical slider visible at common sizes and after resize',()=>{
  const room=new Scene(),material=new MeshBasicMaterial(),min=new Vector3(-.578,.949,-.511),max=new Vector3(.578,2.127,.315);
  const cabinet=new Mesh(new BoxGeometry(max.x-min.x,max.y-min.y,max.z-min.z),material);cabinet.name='CRT_Case';cabinet.position.copy(min).add(max).multiplyScalar(.5);room.add(cabinet);
  const {camera,nav,resize}=setup(1440,900,room);nav.go('tv',0,true);
  for(const [width,height]of viewports){
    resize(width,height);nav.update(0,0,false);camera.updateMatrixWorld(true);
    for(const x of [min.x,max.x])for(const y of [min.y,max.y])for(const z of [min.z,max.z]){
      const p=new Vector3(x,y,z).project(camera);assert.ok(Math.abs(p.x)<=.841&&Math.abs(p.y)<=.841,`${width}x${height}: cabinet/control edge lost`);
    }
    const lowest=new Vector3(.35,1.053,.315).project(camera);assert.ok(lowest.y>-.84,'chroma slider remains above the viewport edge');
  }
  cabinet.geometry.dispose();material.dispose();
});

test('detail and maximum zoom can reach every original image edge with bounded eye movement',()=>{
  for(const [width,height] of viewports)for(const maximum of [false,true]){
    const {camera,nav}=setup(width,height);nav.go('window',0,true);nav.windowMode('detail');nav.update(1,0,false);
    if(maximum){nav.zoom(-9999);nav.update(2,0,false);}
    close(nav.windowState.zoom,maximum?windowInspection.maxZoom:windowDetailZoom(width/height),'inspection magnification');
    for(const sign of [1,-1]){
      nav.drag(sign*1e6,sign*1e6);nav.update(3,0,false);
      const p=screenUV(camera,sign===1?-1:1,sign===1?1:-1);
      const other=screenUV(camera,sign===1?1:-1,sign===1?-1:1);
      for(let axis=0;axis<2;axis++){
        if(Math.abs(other[axis]-p[axis])<=1)close(p[axis],sign===1?0:1,'panned photo edge');
        else assert.ok(Math.min(p[axis],other[axis])<=0&&Math.max(p[axis],other[axis])>=1,'a letterboxed axis already shows both complete photo edges');
      }
      assert.ok(camera.position.distanceTo(new Vector3(...windowInspection.eye))<.20);assert.ok(camera.position.z>.8);
      checkCoverage(camera);
    }
  }
});

test('zoom anchors remain at the pointer throughout eased zoom, before edge clamping is needed',()=>{
  const {camera,nav}=setup();nav.go('window',0,true);nav.windowMode('overview');nav.update(0,0,false);nav.zoom(-Math.log(2)/.001);nav.update(0,0,false);
  const anchor={x:.23,y:-.13},before=screenUV(camera,anchor.x,anchor.y);
  nav.zoom(-Math.log(1.5)/.001,anchor);
  for(let frame=1;frame<=90;frame++){
    nav.update(frame*1000/60,1/60,true);const after=screenUV(camera,anchor.x,anchor.y);
    close(after[0],before[0],'anchor u');close(after[1],before[1],'anchor v');checkCoverage(camera);
  }
});

test('drag uses viewport pixels and reset restores the complete overview',()=>{
  const {camera,nav}=setup();nav.go('window',0,true);nav.zoom(-9999);nav.update(0,0,false);
  camera.updateMatrixWorld(true);const before=photoPoint(.5,.5).project(camera);nav.drag(80,30);nav.update(1,0,false);camera.updateMatrixWorld(true);
  const after=photoPoint(.5,.5).project(camera);close((after.x-before.x)*1440/2,80,'horizontal drag pixels');close((before.y-after.y)*900/2,30,'vertical drag pixels');
  nav.resetWindow();nav.update(2,0,false);close(nav.windowState.zoom,1);assert.deepEqual(nav.windowState.center,[.5,.5]);checkCoverage(camera);
});

test('resize preserves safe photo coverage during every frame of zoom and pan',()=>{
  const {camera,nav,resize}=setup();nav.go('window',0,true);nav.windowMode('detail');
  for(let frame=1;frame<=240;frame++){
    if(frame===30)nav.drag(9999,-9999);
    if(frame===60){resize(1920,1080);nav.zoom(-9999,{x:.8,y:.6});}
    if(frame===100)resize(1024,768);
    if(frame===140){nav.drag(-19999,19999);resize(1440,900);}
    if(frame===180)nav.resetWindow();
    nav.update(frame*1000/60,1/60,true);checkCoverage(camera);
  }
});

test('the approach arrives with its final lens and photo composition instead of changing them at the scene handoff',()=>{
  for(const [width,height] of viewports){
    const {camera,nav}=setup(width,height),initial=camera.projectionMatrix.clone(),position=camera.position.clone();
    nav.go('window',0,false);nav.update(0,0,true);
    assert.ok(camera.projectionMatrix.equals(initial));assert.ok(camera.position.equals(position));
    nav.update(600,.1,true);assert.equal(nav.moving,true);assert.notEqual(camera.zoom,1);
    nav.update(1199.999,.1,true);camera.updateMatrixWorld(true);
    const before=[photoPoint(.3,.3),photoPoint(.5,.4),photoPoint(.7,.6)].map(p=>p.project(camera));
    nav.update(1200,.001,true);camera.updateMatrixWorld(true);assert.equal(nav.moving,false);
    const after=[photoPoint(.3,.3),photoPoint(.5,.4),photoPoint(.7,.6)].map(p=>p.project(camera));
    before.forEach((p,i)=>assert.ok(Math.hypot((p.x-after[i].x)*width/2,(p.y-after[i].y)*height/2)<.001,'scene handoff cannot move a photo landmark by a pixel'));
    const top=screenUV(camera,-1,1),bottom=screenUV(camera,1,-1);
    assert.ok(top[1]>=0&&bottom[1]<.811375,'initial frame must contain photo pixels already present on the physical room card');
    checkCoverage(camera);
    const arrived=camera.projectionMatrix.clone();nav.go('home',2000,false);nav.update(2000,0,true);
    assert.ok(camera.projectionMatrix.equals(arrived),'return must start from the outgoing lens');
    nav.update(3200,.1,false);assert.equal(camera.zoom,1);assert.ok(!camera.view?.enabled);
  }
});

test('resize keeps a matched entry frame and a reset during the approach follows after arrival',()=>{
  const {camera,nav,resize}=setup();nav.go('window',0,false);nav.update(600,.1,true);resize(1024,768);nav.resetWindow();
  nav.update(1199.999,.1,true);camera.updateMatrixWorld(true);const before=photoPoint(.5,.5).project(camera);
  nav.update(1200,.001,true);camera.updateMatrixWorld(true);const after=photoPoint(.5,.5).project(camera);
  assert.ok(before.distanceTo(after)<1e-7);assert.equal(nav.windowState.mode,'detail');checkCoverage(camera);
  const bottom=screenUV(camera,1,-1);assert.ok(bottom[1]<.811375,'resized entry remains within the physical room card');
  nav.update(1201,.001,false);assert.equal(nav.windowState.zoom,1);checkCoverage(camera);
});

test('returning Home clears the inspection frustum and does not alter the original Home pose',()=>{
  const {camera,nav}=setup();const home=camera.position.clone();
  nav.go('window',0,true);nav.windowMode('detail');nav.update(1,0,false);nav.drag(500,300,true);nav.update(2,0,false);
  nav.go('home',3000,true);nav.update(3000,.1,false);
  assert.equal(camera.zoom,1);assert.ok(!camera.view?.enabled);assert.ok(camera.position.distanceTo(home)<1e-8);
  nav.go('window',4000,true);assert.equal(nav.windowState.zoom,windowDetailZoom(1.6));checkCoverage(camera);
});

test('computer approach interpolates in normal motion and is immediate in reduced motion',()=>{
  const {camera,nav}=setup();const initial=camera.position.clone();
  nav.go('about',1000,false);assert.equal(nav.moving,true);nav.update(2400,.1,true);
  const middle=camera.position.clone();assert.ok(middle.distanceTo(initial)>.5);assert.equal(nav.moving,true);
  nav.update(4000,.1,true);assert.equal(nav.moving,false);assert.ok(middle.distanceTo(camera.position)>.5);
  nav.go('home',5000,true);assert.equal(nav.moving,false);assert.ok(camera.position.distanceTo(initial)<1e-8);
});
