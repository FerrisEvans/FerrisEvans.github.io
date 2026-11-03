import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as three from 'three';
import ts from 'typescript';

const compiled=ts.transpileModule(readFileSync(new URL('../../src/scripts/room/thin-glass.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const module={exports:{}};
new Function('require','module','exports',compiled)(name=>{assert.equal(name,'three');return three;},module,module.exports);
const {createThinGlass}=module.exports;

test('thin glass converts unpremultiplied reflection before weighting it for the output framebuffer',()=>{
  const material=createThinGlass({roughness:.08,ior:1.5,absorption:.01});
  assert.equal(material.blending,three.CustomBlending);
  assert.equal(material.blendSrc,three.OneFactor);
  assert.equal(material.blendDst,three.OneMinusSrcAlphaFactor);
  assert.equal(material.premultipliedAlpha,true);
  const shader={uniforms:{},fragmentShader:three.ShaderLib.physical.fragmentShader};
  material.onBeforeCompile(shader,{});
  assert.match(shader.fragmentShader,/gl_FragColor=vec4\(reflectedLight\.indirectSpecular\/max\(glassOpacity,.00001\),glassOpacity\)/);
  const conversion=shader.fragmentShader.indexOf('#include <colorspace_fragment>');
  assert(shader.fragmentShader.indexOf('#include <premultiplied_alpha_fragment>')>conversion,
    'output conversion must precede the one final alpha weighting');
  // In the chosen display-space blend, an encoded 4% linear reflection
  // cannot be added to a separately attenuated white backdrop: .96+.22
  // exceeds white. Unpremultiply/encode/premultiply retains .96+.04=1.
  const srgb=x=>x<=.0031308?12.92*x:1.055*Math.pow(x,1/2.4)-.055;
  const fresnel=.04;
  assert(Math.abs(1-fresnel+srgb(fresnel/fresnel)*fresnel-1)<1e-12);
  assert(1-fresnel+srgb(fresnel)>1.17);
  assert.equal(shader.uniforms.thinGlassAbsorption.value,.01);
  material.dispose();
});

test('closed instrument crystals draw the visible face without transmission passes or a diffuse veil',()=>{
  const material=createThinGlass({roughness:.07});
  assert.equal(material.side,three.FrontSide);
  assert.equal(material.forceSinglePass,true);
  assert.equal(material.depthWrite,false);
  assert.equal(material.transmission,0);
  assert.equal(material.clearcoat,0);
  assert.equal(material.color.getHex(),0);
  assert.equal(material.userData.thinGlass,true);
  material.dispose();
});
