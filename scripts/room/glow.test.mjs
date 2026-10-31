import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as three from 'three';
import ts from 'typescript';

const source=ts.transpileModule(readFileSync(new URL('../../src/scripts/room/glow.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function fixture(){
  class Bloom{renderTargetsHorizontal=[{texture:new three.Texture()}];render(){}dispose(){}}
  class Quad{render(){}dispose(){}}
  const module={exports:{}};
  new Function('require','module','exports',source)(name=>name==='three'?three:name.includes('UnrealBloomPass')?{UnrealBloomPass:Bloom}:name.includes('Pass.js')?{FullScreenQuad:Quad}:{warmScene:async()=>{}},module,module.exports);
  const scene=new three.Scene(),camera=new three.PerspectiveCamera(),mesh=new three.Mesh(new three.BoxGeometry(),new three.MeshBasicMaterial());scene.add(mesh);scene.background=new three.Color('grey');
  let target=null,updates=0,failMask=false;
  const renderings=[],update=scene.updateMatrixWorld.bind(scene);scene.updateMatrixWorld=force=>{updates++;update(force);};
  const renderer={autoClear:true,setRenderTarget(value){target=value;},clear(){},render(current){if(current.matrixWorldAutoUpdate)current.updateMatrixWorld();renderings.push({current,auto:current.matrixWorldAutoUpdate,position:mesh.matrixWorld.elements[12]});if(target&&failMask)throw new Error('mask failure');}};
  const glow=module.exports.createRoomGlow(renderer,scene,camera);
  return{scene,mesh,glow,renderings,get updates(){return updates;},set failMask(value){failMask=value;},dispose(){mesh.geometry.dispose();mesh.material.dispose();}};
}

test('beauty updates moving objects once and the mask reuses exactly those world matrices',()=>{
  const f=fixture();f.mesh.position.x=3;f.glow.render();
  assert.equal(f.updates,1);assert.deepEqual(f.renderings.map(({auto,position})=>({auto,position})),[{auto:true,position:3},{auto:false,position:3}]);assert(f.scene.matrixWorldAutoUpdate);
  f.mesh.position.x=4;f.glow.render();assert.equal(f.updates,2);assert.equal(f.renderings.at(-1).position,4);f.dispose();
});

test('mask failure restores matrix updates, original materials and scene background',()=>{
  const f=fixture(),material=f.mesh.material,background=f.scene.background;f.failMask=true;
  assert.throws(()=>f.glow.render(),/mask failure/);assert(f.scene.matrixWorldAutoUpdate);assert.equal(f.mesh.material,material);assert.equal(f.scene.background,background);f.dispose();
});

test('alternate window scenes retain their own matrix update setting',()=>{
  const f=fixture(),windowScene=new three.Scene();windowScene.matrixWorldAutoUpdate=false;
  f.glow.render(windowScene);assert.equal(windowScene.matrixWorldAutoUpdate,false);assert(f.scene.matrixWorldAutoUpdate);assert(f.renderings.every(entry=>entry.current===windowScene));f.dispose();
});
