import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import ts from 'typescript';
import {BufferGeometry,BufferAttribute,InterleavedBuffer,InterleavedBufferAttribute,MeshBasicMaterial} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
const source=readFileSync(new URL('../../src/scripts/room/dynamic-normals.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {createNormalUpdater}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const values=attribute=>Array.from({length:attribute.count},(_,i)=>[attribute.getX(i),attribute.getY(i),attribute.getZ(i)]);
function compare(geometry){
  const expected=geometry.clone(),update=createNormalUpdater(geometry),version=geometry.attributes.normal.version??geometry.attributes.normal.data.version;
  expected.computeVertexNormals();update();
  assert.deepEqual(values(geometry.attributes.normal),values(expected.attributes.normal));
  assert.deepEqual(geometry.attributes.position.array,expected.attributes.position.array);
  assert.equal(geometry.attributes.normal.version??geometry.attributes.normal.data.version,version+1);
  expected.dispose();
}
test('normalized Int16 specialization matches Three for indexed, unindexed, shared and degenerate faces',()=>{
  for(const indexed of [true,false])for(const interleaved of [true,false]){
    const g=new BufferGeometry();
    // Include negative, large/wrapping and zero-length face normals.
    g.setAttribute('position',new BufferAttribute(new Float32Array([0,0,0,1,0,0,0,1,0, .2,-2,1,2,1,-2,0,0,0]),3));
    if(indexed)g.setIndex([0,1,2,2,3,4,0,4,2,5,5,5]);
    if(interleaved){const array=new Int16Array(6*5).fill(123);g.setAttribute('normal',new InterleavedBufferAttribute(new InterleavedBuffer(array,5),3,1,true));}
    else g.setAttribute('normal',new BufferAttribute(new Int16Array(18),3,true));
    compare(g);if(interleaved)for(let i=0;i<6;i++){assert.equal(g.attributes.normal.array[i*5],123);assert.equal(g.attributes.normal.array[i*5+4],123);}
    g.dispose();
  }
});
test('other normal encodings retain the standard Three path',()=>{
  const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(new Float32Array([0,0,0,1,0,0,0,1,0]),3));g.setAttribute('normal',new BufferAttribute(new Float32Array(9),3));
  compare(g);g.dispose();
});
test('all delivered leaf, curtain and flexible paper normals remain exact across deformed poses',async()=>{
  const packed=readFileSync(new URL('../../public/room/materials/study-meshopt.glb.bin',import.meta.url)),bytes=gunzipSync(packed);
  // Only geometry is under test; skip browser image decoding for materials.
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register(()=>({name:'test_geometry_only',loadMaterial:async()=>new MeshBasicMaterial()}));
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  let checked=0;
  gltf.scene.traverse(mesh=>{
    if(!mesh.isMesh||!/^Plant_Leaf|^Curtain_|^Work_Notepad(?:$|_Loose)/.test(mesh.userData.name??mesh.name))return;
    for(const time of [0,.37,3.21]){
      const g=mesh.geometry.clone(),p=g.attributes.position;
      for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);p.setXYZ(i,x+Math.sin(y+time)*.003,y,z+Math.sin(x*2.8+time)*.012);}
      compare(g);g.dispose();checked++;
    }
  });
  assert(checked>=30,`expected production moving meshes, got ${checked} comparisons`);
  gltf.scene.traverse(mesh=>{if(mesh.isMesh){mesh.geometry.dispose();for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])m.dispose();}});
});
