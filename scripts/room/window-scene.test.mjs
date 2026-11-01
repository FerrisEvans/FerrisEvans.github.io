import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import ts from 'typescript';
import * as three from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';

const modules=new Map();
function load(name){
  if(name==='three')return three;
  if(modules.has(name))return modules.get(name);
  const source=readFileSync(new URL(`../../src/scripts/room/${name.replace('./','')}.ts`,import.meta.url),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};new Function('require','module','exports',js)(load,module,module.exports);modules.set(name,module.exports);return module.exports;
}
const {createWindowScene}=load('./window-scene'),{cityProjection}=load('./weather');
const {windowEntryFrame,windowSpan}=load('./window-navigation');

test('the independent panorama preserves the delivered room card world-to-photo mapping',async()=>{
  const packed=readFileSync(new URL('../../public/room/materials/study-meshopt.glb.bin',import.meta.url)),bytes=gunzipSync(packed);
  const material=new three.MeshBasicMaterial(),environment=new three.Texture(),resources=new Set();
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register(()=>({name:'test_geometry_only',loadMaterial:async()=>material}));
  const {scene:room}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const scene=createWindowScene(material,environment,resources,room),source=room.getObjectByName('City_Backdrop'),plate=scene.getObjectByName('City_Backdrop');
  source.updateWorldMatrix(true,false);plate.updateWorldMatrix(true,false);
  const original=source.geometry.attributes.position,uv=source.geometry.attributes.uv;
  const generated=plate.geometry.attributes.position;
  // PlaneGeometry order is top-left, top-right, bottom-left, bottom-right.
  const topLeft=new three.Vector3().fromBufferAttribute(generated,0).applyMatrix4(plate.matrixWorld);
  const right=new three.Vector3().fromBufferAttribute(generated,1).applyMatrix4(plate.matrixWorld).sub(topLeft);
  const down=new three.Vector3().fromBufferAttribute(generated,2).applyMatrix4(plate.matrixWorld).sub(topLeft);
  for(let i=0;i<original.count;i++){
    const photo=[uv.getX(i)*cityProjection.scale[0]+cityProjection.offset[0],uv.getY(i)*cityProjection.scale[1]+cityProjection.offset[1]];
    const expected=new three.Vector3().fromBufferAttribute(original,i).applyMatrix4(source.matrixWorld);
    const actual=topLeft.clone().addScaledVector(right,photo[0]).addScaledVector(down,photo[1]);
    assert.ok(actual.distanceTo(expected)<2e-6,`photo coordinate ${photo} moved between the room and panorama`);
  }
  const projection=scene.windowProjection;
  assert.ok(Math.abs(projection.width/projection.height-3)<1e-6,'authored UV mapping preserves the original photograph aspect');
  for(const aspect of [1.201,4/3,1.6,16/9,21/9]){
    const frame=windowEntryFrame(aspect,projection),span=windowSpan(aspect,frame.zoom);
    for(let axis=0;axis<2;axis++){
      assert.ok(frame.center[axis]-span[axis]/2>=Math.max(0,projection.sourceBounds.min[axis]),'arrival begins within pixels present on the room card');
      assert.ok(frame.center[axis]+span[axis]/2<=Math.min(1,projection.sourceBounds.max[axis]),'arrival cannot expose newly extended card area');
    }
  }
  for(const resource of resources)resource.dispose();environment.dispose();material.dispose();
  room.traverse(object=>object.geometry?.dispose());
});
