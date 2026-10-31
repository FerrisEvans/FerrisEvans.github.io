import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {PerspectiveCamera,Vector3} from 'three';
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
const viewports=[[1440,900],[1920,1080],[1024,768]];
function setup(width=1440,height=900){
  const camera=new PerspectiveCamera(42,1.6,.01,100);camera.position.set(.078,2.29,5.43);camera.lookAt(0,1.5,0);
  const nav=createNavigation(camera);
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

test('the room approach keeps its regular lens until the independent panorama scene is ready',()=>{
  const {camera,nav}=setup();nav.go('window',0,false);
  for(let frame=1;frame<72;frame++){nav.update(frame*1000/60,1/60,true);assert.equal(nav.moving,true);assert.equal(camera.zoom,1);assert.ok(!camera.view?.enabled);}
  nav.update(1200,1/60,true);assert.equal(nav.moving,false);assert.ok(camera.zoom>0);assert.equal(camera.view.enabled,true);checkCoverage(camera);
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
