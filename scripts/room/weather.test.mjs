import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as three from 'three';
import ts from 'typescript';

const module = { exports: {} };
const require = name => { assert.equal(name, 'three'); return three; };
const source = readFileSync(new URL('../../src/scripts/room/weather.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
new Function('require', 'module', 'exports', compiled)(require, module, module.exports);
const { cityDepthPixels, cityDepthSize: [width, height], cityTrainPath, cityProjection } = module.exports;
const pixels = cityDepthPixels();
const sample = (u, v, channel) => pixels[(Math.min(height-1,Math.floor(v*height))*width+Math.min(width-1,Math.floor(u*width)))*4+channel];

test('full inspection and Home materials share city pixels, depth and the same paused or advancing clock', () => {
  const room=new three.Group(),lamp=new three.Mesh(new three.BoxGeometry(.5,.4,.5));
  room.position.set(.2,.1,-.3);room.rotation.y=.12;
  lamp.name='Lamp_Shade';lamp.position.set(-1.4,1.8,-.4);lamp.rotation.z=.24;room.add(lamp);
  const television=new three.Mesh(new three.BoxGeometry(.9,.7,.55));
  television.name='CRT_Case';television.position.set(.1,1.5,0);room.add(television);
  const map=new three.Texture(),weather=module.exports.createWeather(map,room);
  assert.notEqual(weather.material,weather.inspectionMaterial);
  assert.equal(weather.material.map,map);assert.equal(weather.inspectionMaterial.map,map);
  const compile=material=>{const shader={uniforms:{},vertexShader:three.ShaderLib.basic.vertexShader,fragmentShader:three.ShaderLib.basic.fragmentShader};material.onBeforeCompile(shader,{});return shader;};
  const home=compile(weather.material),inspection=compile(weather.inspectionMaterial);
  assert.equal(home.uniforms.cityDepth.value,weather.depth);assert.equal(inspection.uniforms.cityDepth.value,weather.depth);
  assert.equal(home.uniforms.weatherTime,inspection.uniforms.weatherTime);
  assert(home.uniforms.weatherLampCenter.value.distanceTo(lamp.getWorldPosition(new three.Vector3()))<1e-10,'glass reflection follows the authored lamp position');
  for(const [object,key] of [[lamp,'weatherShadeInverse'],[television,'weatherTVInverse']]){
    const local=new three.Vector3(.11,-.07,.09),world=object.localToWorld(local.clone());
    assert(world.applyMatrix4(home.uniforms[key].value).distanceTo(local)<1e-10,'reflection proxy includes the complete parent transform and object tilt');
    assert.equal(home.uniforms[key],inspection.uniforms[key],'window inspection uses the same physical reflection transform');
  }
  assert.equal(home.uniforms.weatherLampLevel,inspection.uniforms.weatherLampLevel);
  assert.equal(home.uniforms.weatherPixelScale,inspection.uniforms.weatherPixelScale);
  const renderer={getCurrentViewport:target=>target.set(0,0,3840,2160),getSize:target=>target.set(1920,1080),getRenderTarget:()=>null};
  weather.material.onBeforeRender(renderer);
  assert.equal(home.uniforms.weatherPixelScale.value,2,'beauty sampling accounts for device pixel ratio');
  renderer.getCurrentViewport=target=>target.set(0,0,1920,1080);
  weather.inspectionMaterial.onBeforeRender(renderer);
  assert.equal(home.uniforms.weatherPixelScale.value,1,'half-resolution glow keeps the same visual kernel instead of doubling its radius');
  renderer.getCurrentViewport=target=>target.set(0,0,128,128);
  for(const mapping of [three.CubeUVReflectionMapping,three.CubeReflectionMapping])for(const height of [64,150,1080]){
    renderer.getRenderTarget=()=>({texture:{mapping}});renderer.getSize=target=>target.set(height,height);
    weather.material.onBeforeRender(renderer);
    assert.equal(home.uniforms.weatherPixelScale.value,0,'cube and PMREM captures retain the source kernel regardless of the offline canvas size');
  }
  renderer.getRenderTarget=()=>null;renderer.getSize=target=>target.set(1920,1080);renderer.getCurrentViewport=target=>target.set(0,0,3840,2160);
  weather.material.onBeforeRender(renderer);
  assert.equal(home.uniforms.weatherPixelScale.value,2,'the first beauty draw restores its floor after probe capture');
  weather.setLamp(0);assert.equal(home.uniforms.weatherLampLevel.value,0);assert.equal(inspection.uniforms.weatherLampLevel.value,0);
  weather.setLamp(1);assert.equal(home.uniforms.weatherLampLevel.value,1);
  weather.update(17.25,0,0);assert.equal(home.uniforms.weatherTime.value,17.25);assert.equal(inspection.uniforms.weatherTime.value,17.25);
  assert.notEqual(weather.material.customProgramCacheKey(),weather.inspectionMaterial.customProgramCacheKey());
  weather.material.dispose();weather.inspectionMaterial.dispose();weather.depth.dispose();map.dispose();lamp.geometry.dispose();lamp.material.dispose();television.geometry.dispose();television.material.dispose();
});

test('the train is masked by the foreground roof, trees and gantry, but remains visible on the open rail', () => {
  assert.equal(pixels.length, width*height*4);
  for (const [u,v] of [[.15,.65],[.51,.55],[.593,.60],[.765,.55]]) {
    assert.equal(sample(u,v,1),255,`foreground silhouette at ${u},${v}`);
  }
  for (const [u,v] of [[.70,.60],[.48,.79],[.35,.86],[.834,.35],[.50,.10]]) {
    assert.equal(sample(u,v,1),0,`unoccluded rail or sky at ${u},${v}`);
  }
  assert(sample(.50,.92,0)>sample(.50,.08,0), 'near foreground has more parallax than the distant sky');
  const rail = Array.from({length:501},(_,i)=>{const t=i/500,u=1-t,p=cityTrainPath;return sample(u*u*u*p[0][0]+3*u*u*t*p[1][0]+3*u*t*t*p[2][0]+t*t*t*p[3][0],Math.min(.999,u*u*u*p[0][1]+3*u*u*t*p[1][1]+3*u*t*t*p[2][1]+t*t*t*p[3][1]),1);});
  assert(rail.some(value=>value===255)&&rail.some(value=>value===0),'the actual rail path alternates between occluded and visible segments');
});

test('soft parallax depth does not soften the hard train silhouette or create random masks between loads', () => {
  let softJump=0,hardJump=0;
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const i=(y*width+x)*4;
    assert(pixels[i+1]===0||pixels[i+1]===255,'occlusion remains binary');
    assert.equal(pixels[i+3],255);
    if(x>0){softJump=Math.max(softJump,Math.abs(pixels[i]-pixels[i-4]));hardJump=Math.max(hardJump,Math.abs(pixels[i+1]-pixels[i-3]));}
  }
  assert(softJump>0&&softJump<60,`depth transitions are softened, maximum jump ${softJump}`);
  assert.equal(hardJump,255,'foreground edges remain sharp');
  assert.deepEqual(cityDepthPixels(),pixels,'same plate produces stable masks on every load');
});

// The source image fills the whole physical card exactly once. Camera movement
// can reveal new side content without walking into a mirrored city tile.
test('panoramic projection maps both authored card edges once and keeps the photographed aspect', () => {
  const u=x=>x*cityProjection.scale[0]+cityProjection.offset[0];
  assert.equal(u(-.5),0);assert.equal(u(1.5),1);
  assert(u(.25)<u(.5)&&u(.5)<u(.75));
  assert(Math.abs(14.56/cityProjection.scale[0]/(8.19/cityProjection.scale[1])-3)<1e-12);
});

test('airborne rain and glass water both move down screen in their respective coordinate systems',()=>{
  const weather=module.exports.createWeather(new three.Texture()),shader={uniforms:{},vertexShader:three.ShaderLib.basic.vertexShader,fragmentShader:three.ShaderLib.basic.fragmentShader};
  weather.material.onBeforeCompile(shader,{});
  const airborne=shader.fragmentShader.match(/float fallingRain\([\s\S]*?\n      }/)[0];
  const glass=shader.fragmentShader.match(/vec4 rainLayer\([\s\S]*?\n      }/)[0];
  const runs=shader.fragmentShader.match(/vec4 rainRuns\([\s\S]*?\n      }/)[0];
  const sign=block=>{const op=block.match(/(?:q|grid)\.y\s*([+-])=\s*weatherTime\s*\*\s*speed/);assert.ok(op,'shader must expose its advection coordinate');return op[1]==='+'?1:-1;};
  const camera=new three.PerspectiveCamera(42,1.6,.01,100);camera.position.set(-1.15,2.4,.9);camera.lookAt(-1.15,2.4,-12.068);camera.updateMatrixWorld(true);
  const before=new three.Vector3(0,1.5,-12.068),beforeY=before.clone().project(camera).y;
  // Holding a rain cell fixed requires d(coordinate)/dt = -advection.
  // Photo-v increases downward, while glass-world-y increases upward.
  const photoVDelta=-sign(airborne)*7.2/(105*.31)*.05;
  const airAfter=before.clone().add(new three.Vector3(0,-photoVDelta*(29.12/3),0));
  assert.ok(airAfter.project(camera).y<beforeY,'airborne streak must travel toward the screen bottom');
  for(const block of [glass,runs]){
    const after=before.clone().add(new three.Vector3(0,-sign(block)*.01,0));
    assert.ok(after.project(camera).y<beforeY,'glass beads and rivulets retain downward world motion');
  }
  weather.material.map.dispose();weather.material.dispose();weather.inspectionMaterial.dispose();weather.depth.dispose();
});
