import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as three from 'three';
import ts from 'typescript';

const compiled=ts.transpileModule(readFileSync(new URL('../../src/scripts/room/micro-surfaces.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const module={exports:{}};
new Function('require','module','exports',compiled)(name=>{assert.equal(name,'three');return three;},module,module.exports);
const {applyMicroSurface,inheritMicroSurface}=module.exports;

test('shared ABS bodies, controls and gaskets compile one finish regardless of scene order',()=>{
  // Execute the actual material-selection block without loading textures or
  // WebGL. This caught clones inheriting an already wrapped base callback.
  const source=readFileSync(new URL('../../src/scripts/room/lighting.ts',import.meta.url),'utf8');
  const begin=source.indexOf('  const paperEdges='),end=source.indexOf('\n  const movingFill=',begin);
  assert(begin>=0&&end>begin,'locate the complete material-finish selection block');
  const body=ts.transpileModule(source.slice(begin,end),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const select=new Function('scene','resources','materials','Mesh','MeshStandardMaterial','MeshPhysicalMaterial','applyMicroSurface',body);
  const expected={Desk_CD_Body:'abs',Desk_CD_Button:'abs-controls',Desk_CD_Seam:'rubber'};
  for(const reverse of [false,true]){
    const scene=new three.Scene(),resources=new Set(),materials=new Map(),geometry=new three.BoxGeometry();
    const base=new three.MeshPhysicalMaterial();base.name='Baked equipment/abs';
    base.onBeforeCompile=shader=>{shader.fragmentShader='#define BAKED_FIXTURE\n'+shader.fragmentShader;};
    const names=Object.keys(expected);if(reverse)names.reverse();
    for(const name of names){
      const mesh=new three.Mesh(geometry,base);mesh.name=name;
      mesh.userData={atlas:'equipment',surface_profile:'abs'};scene.add(mesh);
    }
    try{
      select(scene,resources,materials,three.Mesh,three.MeshStandardMaterial,three.MeshPhysicalMaterial,applyMicroSurface);
      for(const object of scene.children){
        assert(object.material.customProgramCacheKey().endsWith('/'+expected[object.name]));
        // Reflection capture and the main frame each request a fresh shader.
        for(let pass=0;pass<2;pass++){
          const shader={uniforms:{},vertexShader:three.ShaderLib.physical.vertexShader,fragmentShader:three.ShaderLib.physical.fragmentShader};
          object.material.onBeforeCompile(shader,{});
          const label=`${object.name}, reverse=${reverse}, pass=${pass}`;
          assert.equal((shader.vertexShader.match(/varying vec3 microWorld;/g)||[]).length,1,label);
          for(const symbol of [/varying vec3 microWorld;/g,/uniform mat4 microFrameInverse;/g,/float microHash\(/g,/float microNoise\(/g,/float microRelief=/g,/#define BAKED_FIXTURE/g]){
            assert.equal((shader.fragmentShader.match(symbol)||[]).length,1,label+' '+symbol);
          }
        }
      }
    }finally{for(const resource of resources)resource.dispose();base.dispose();geometry.dispose();}
  }
});

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
