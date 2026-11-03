import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as three from 'three';
import ts from 'typescript';

const compiled=ts.transpileModule(readFileSync(new URL('../../src/scripts/room/micro-surfaces.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const module={exports:{}};
new Function('require','module','exports',compiled)(name=>{assert.equal(name,'three');return three;},module,module.exports);
const {applyMicroSurface,inheritMicroSurface}=module.exports;

test('machining coordinates follow a reparented moving skin, including live material clones',()=>{
  for(const kind of ['satin-turned','satin-brushed']){
    const scene=new three.Group(),skin=new three.Mesh(new three.BoxGeometry(.3,.02,.25).translate(.04,0,.02),new three.MeshPhysicalMaterial());
    skin.position.set(2,.7,.8);scene.add(skin);scene.updateMatrixWorld(true);
    const source=skin.material;applyMicroSurface(source,kind,skin);
    const moving=new three.Group();moving.position.set(1,.6,.1);scene.add(moving);moving.attach(skin);
    const live=source.clone();inheritMicroSurface(source,live);skin.material=live;
    const shader={uniforms:{},vertexShader:three.ShaderLib.physical.vertexShader,fragmentShader:three.ShaderLib.physical.fragmentShader};
    live.onBeforeCompile(shader,{});
    assert(shader.uniforms.microFrameCenter.value.distanceTo(new three.Vector3(.04,0,.02))<1e-6);
    for(const angle of [0,.4,-.6]){
      moving.rotation.y=angle;moving.position.x+=.02;live.onBeforeRender();
      assert(shader.uniforms.microFrameWorld.value.equals(skin.matrixWorld));
      const point=new three.Vector3(.03,.01,.08),world=skin.localToWorld(point.clone());
      assert(world.applyMatrix4(shader.uniforms.microFrameInverse.value).distanceTo(point)<1e-10);
    }
    assert.equal(live.anisotropy,.4);
    skin.geometry.dispose();source.dispose();live.dispose();
  }
});
