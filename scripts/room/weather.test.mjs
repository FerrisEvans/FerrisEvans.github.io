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
  const map=new three.Texture(),weather=module.exports.createWeather(map);
  assert.notEqual(weather.material,weather.inspectionMaterial);
  assert.equal(weather.material.map,map);assert.equal(weather.inspectionMaterial.map,map);
  const compile=material=>{const shader={uniforms:{},vertexShader:three.ShaderLib.basic.vertexShader,fragmentShader:three.ShaderLib.basic.fragmentShader};material.onBeforeCompile(shader,{});return shader;};
  const home=compile(weather.material),inspection=compile(weather.inspectionMaterial);
  assert.equal(home.uniforms.cityDepth.value,weather.depth);assert.equal(inspection.uniforms.cityDepth.value,weather.depth);
  assert.equal(home.uniforms.weatherTime,inspection.uniforms.weatherTime);
  weather.update(17.25,0,0);assert.equal(home.uniforms.weatherTime.value,17.25);assert.equal(inspection.uniforms.weatherTime.value,17.25);
  assert.notEqual(weather.material.customProgramCacheKey(),weather.inspectionMaterial.customProgramCacheKey());
  weather.material.dispose();weather.inspectionMaterial.dispose();weather.depth.dispose();map.dispose();
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
