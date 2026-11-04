import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as three from 'three';
import ts from 'typescript';
function moduleAt(name){
  const compiled=ts.transpileModule(readFileSync(new URL('../../src/scripts/room/'+name+'.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};
  new Function('require','module','exports',compiled)(name=>{assert.equal(name,'three');return three;},module,module.exports);
  return module.exports;
}
const {paintTVStartup}=moduleAt('tv-startup-screen');
const {separateTubeLayers}=moduleAt('phosphor');

test('startup writes to the real separated phosphor layer and leaves the outer glass untouched',()=>{
  const originalCanvas=globalThis.HTMLCanvasElement,labels=[];
  class Canvas {
    width=768;height=576;
    getContext(){return {save(){},restore(){},fillRect(){},fillText(text){labels.push(text);}};}
  }
  globalThis.HTMLCanvasElement=Canvas;
  const canvas=new Canvas(),map=new three.CanvasTexture(canvas);
  const coating=new three.MeshPhysicalMaterial({emissiveMap:map}),glass=new three.MeshPhysicalMaterial();
  const surface=new three.Mesh(new three.PlaneGeometry(1,1),coating);surface.name='CRT_Screen';
  const root=new three.Group();root.add(surface);
  const resources=new Set();
  try{
    const phosphor=separateTubeLayers(surface,glass,resources,.006);
    assert.equal(surface.material.emissiveMap,null,'the authored screen becomes non-emitting glass');
    assert.equal(phosphor.name,'CRT_Screen_Phosphor');
    const before=map.version;
    paintTVStartup(root);paintTVStartup(root);
    assert.equal(map.version,before+2,'each power-on uploads a fresh prompt to the coating');
    assert.deepEqual(labels,['PRESS PLAY','CLICK TV TO PLAY','PRESS PLAY','CLICK TV TO PLAY']);
    assert.equal(surface.material,glass);assert.equal(phosphor.material,coating);
    assert.equal(phosphor.material.emissiveMap,map);
  }finally{
    globalThis.HTMLCanvasElement=originalCanvas;
    for(const resource of resources)resource.dispose();surface.geometry.dispose();coating.dispose();map.dispose();
  }
});
