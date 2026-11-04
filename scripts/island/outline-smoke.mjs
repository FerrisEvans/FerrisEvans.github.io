#!/usr/bin/env node
/** Independent real-WebGL regression. It renders no app/model and changes no asset seal.
 * Run with BROWSER_CHANNEL=chrome node scripts/island/outline-smoke.mjs locally.
 * Pixel comparisons intentionally exclude performance claims and approved-baseline scoring. */
import { createServer } from 'node:http';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
const output=process.env.SMOKE_SCREENSHOT_DIR ?? await mkdtemp(join(tmpdir(), 'weijin-outline-'));
await mkdir(output,{recursive:true});
const contents=`
import { WebGLRenderer, Scene, OrthographicCamera, Color, Mesh, SphereGeometry, BoxGeometry, PlaneGeometry, MeshStandardMaterial, ShadowMaterial, AmbientLight, DirectionalLight, ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import { createOutline } from './src/scripts/island/outline.ts';
const renderer = new WebGLRenderer({ antialias:true, preserveDrawingBuffer:true });
renderer.toneMapping=ACESFilmicToneMapping; renderer.toneMappingExposure=1.15; renderer.outputColorSpace=SRGBColorSpace; renderer.shadowMap.enabled=true;
renderer.setSize(600,400); document.body.append(renderer.domElement);
const scene=new Scene();scene.background=new Color('#f8f8f0');
const camera=new OrthographicCamera(-3,3,2,-2,.1,30);camera.position.set(0,0,10);camera.lookAt(0,0,0);
const ball=new Mesh(new SphereGeometry(.7,64,32),new MeshStandardMaterial({color:'#262621',roughness:.8}));ball.name='Dog';ball.castShadow=true;scene.add(ball);
const occluder=new Mesh(new BoxGeometry(.8,2.4,.3),new MeshStandardMaterial({color:'#829b69'}));occluder.name='Tree';occluder.position.set(-.45,0,1.8);scene.add(occluder);
const floor=new Mesh(new PlaneGeometry(20,20),new ShadowMaterial({color:'#68735f',opacity:.14}));floor.position.z=-1;floor.receiveShadow=true;scene.add(floor);
const sun=new DirectionalLight('#fff1d3',2.8);sun.position.set(-3,5,8);sun.castShadow=true;scene.add(new AmbientLight('#fff1db',1.5),sun);
let outline=createOutline(renderer,scene,camera);
const pixels=()=>{const gl=renderer.getContext(), bytes=new Uint8Array(renderer.domElement.width*renderer.domElement.height*4);gl.readPixels(0,0,renderer.domElement.width,renderer.domElement.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;};
const compare=(a,b,dpr=1)=>{let changed=0, outside=0, inside=0,max=0;for(let i=0;i<a.length;i+=4){let delta=Math.max(...[0,1,2].map(c=>Math.abs(a[i+c]-b[i+c])));if(delta){changed++;max=Math.max(max,delta);const x=(i/4)%(600*dpr)/dpr,y=Math.floor(i/4/(600*dpr))/dpr;if(x<225||x>375||y<125||y>275)outside++;if(x>315&&x<345&&y>190&&y<210)inside++;}}return {changed,outside,inside,max};};
window.outlineSnapshots=[];
window.checkOutline=async()=>{
 const records=[];
 for(const dpr of [1,2])for(const dark of [false,true]){
  renderer.setPixelRatio(dpr);renderer.setSize(600,400);outline.resize(600,400,dpr);outline.theme(dark);scene.background.set(dark?'#303b32':'#f8f8f0');
  outline.select(null);outline.update(1,true);outline.render();const before=pixels();
  await outline.warmup();const warmed=pixels();
  outline.select(ball);outline.update(1,true);outline.render();const hover=pixels();const state=outline.state();
  const diff=compare(before,hover,dpr),warmup=compare(before,warmed,dpr);
  window.outlineSnapshots.push({name:(dark?'dark':'light')+'-dpr-'+dpr,data:renderer.domElement.toDataURL()});
  outline.select(null);for(let i=0;i<12;i++)outline.update(1/60,false);outline.render();const restored=compare(before,pixels(),dpr);
  occluder.position.x=0;occluder.scale.x=3;outline.render();const hiddenBefore=pixels();outline.select(ball);outline.update(1,true);outline.render();const hidden=compare(hiddenBefore,pixels(),dpr);
  outline.select(null);outline.update(1,true);occluder.position.x=-.45;occluder.scale.x=1;outline.render();
  records.push({dpr,dark,state,info:{...renderer.info.render},diff,warmup,restored,hidden});
 }
 outline.select(ball);outline.update(1,true);outline.render();
 const peak={...renderer.info.memory};outline.dispose();outline.dispose();renderer.render(scene,camera);const afterDispose={...renderer.info.memory};
 outline=createOutline(renderer,scene,camera);outline.resize(600,400,2);outline.theme(true);await outline.warmup();outline.select(ball);outline.update(1,true);outline.render();const repeated={...renderer.info.memory};
 return {records,peak,afterDispose,repeated,sceneChildren:scene.children.length};
};
`;
await writeFile(output+'/fixture.ts',contents.replace('./src/scripts/island/outline.ts',root+'/src/scripts/island/outline.ts'));
const compiled=await build({configFile:false,root,resolve:{alias:[{find:/^three$/,replacement:root+'/node_modules/three/build/three.module.js'},{find:/^three\/addons\//,replacement:root+'/node_modules/three/examples/jsm/'}]},build:{write:false,minify:false,lib:{entry:output+'/fixture.ts',formats:['es'],fileName:'fixture'}}});
const js=(Array.isArray(compiled)?compiled[0]:compiled).output.find(x=>x.type==='chunk').code;
const server=createServer((req,res)=>{if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(js);}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body style="margin:0"><script type="module" src="/fixture.js"></script></body></html>')}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL || undefined});const errors=[];
try {
  const page=await browser.newPage({viewport:{width:600,height:400}});
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(()=>typeof window.checkOutline==='function');
  const report=await page.evaluate(()=>window.checkOutline());
  report.errors=errors;
  report.browser=browser.version();
  report.capturedAt=new Date().toISOString();
  await writeFile(join(output,'evidence.json'),JSON.stringify(report,null,2));
  const snapshots=await page.evaluate(()=>window.outlineSnapshots);
  for (const shot of snapshots) await writeFile(join(output,shot.name+'.png'),Buffer.from(shot.data.split(',')[1],'base64'));
  await page.setViewportSize({width:1200,height:870});
  await page.evaluate(snapshots=>{
    document.body.innerHTML='<main style="display:grid;grid-template-columns:1fr 1fr;font:14px system-ui;background:#f8f8f0">'+snapshots.map(shot=>`<figure style="margin:0"><figcaption style="padding:4px 12px">${shot.name}</figcaption><img style="width:600px;display:block" src="${shot.data}"></figure>`).join('')+'</main>';
  },snapshots);
  await page.screenshot({path:join(output,'contact.png')});
  assert.deepEqual(errors,[]);
  for(const row of report.records){
    assert(row.diff.changed>100,'the silhouette has a real visible response');
    assert.equal(row.diff.outside,0,'background and nonselected objects retain the direct-render pixels');
    assert.equal(row.diff.inside,0,'the selected object keeps its original fill');
    assert.equal(row.warmup.changed,0,'shader warmup does not change the visible scene');
    assert.equal(row.restored.changed,0,'fade-out returns to direct-render pixels');
    assert.equal(row.hidden.changed,0,'a fully occluded object has no x-ray outline');
  }
  assert.equal(report.peak.textures,report.repeated.textures,'reconstruction does not accumulate render targets');
  assert.equal(report.peak.geometries,report.repeated.geometries,'reconstruction does not accumulate full-screen geometry');
  assert(report.afterDispose.textures<report.peak.textures,'dispose releases all outline targets');
  assert.equal(report.sceneChildren,5,'outlines add no pickable objects to the scene');
  console.log('PASS: visible silhouettes preserve fill/background, respect occlusion, fade to direct rendering and dispose cleanly at DPR 1/2 in both palettes.');
  console.log('Evidence:',output);
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
