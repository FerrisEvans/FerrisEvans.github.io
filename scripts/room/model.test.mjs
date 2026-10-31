import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import ts from 'typescript';

let js=ts.transpileModule(readFileSync(new URL('../../src/scripts/room/model.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
for(const path of ['loaders/GLTFLoader.js','libs/fflate.module.js','libs/meshopt_decoder.module.js'])js=js.replace(`three/addons/${path}`,new URL(`../../node_modules/three/examples/jsm/${path}`,import.meta.url).href);
const {loadRoomModel}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).buffer;
const json=bytes({asset:{version:'2.0'},scene:0,scenes:[{nodes:[0,1]}],nodes:[{mesh:0,name:'VCR_Key.003',extras:{name:'VCR_Key.003'}},{mesh:1,name:'Other'}],
  meshes:[{primitives:[{attributes:{POSITION:0}}]},{primitives:[{attributes:{POSITION:0}}]}],
  buffers:[{byteLength:36}],bufferViews:[{buffer:0,byteLength:36}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}]});
const jsonLength=Math.ceil(json.byteLength/4)*4,fixture=new ArrayBuffer(28+jsonLength+36),header=new DataView(fixture);
for(const [offset,value] of [[0,0x46546c67],[4,2],[8,fixture.byteLength],[12,jsonLength],[16,0x4e4f534a],[20+jsonLength,36],[24+jsonLength,0x004e4942]])header.setUint32(offset,value,true);
new Uint8Array(fixture,20,jsonLength).fill(32);new Uint8Array(fixture,20,json.byteLength).set(new Uint8Array(json));
new Float32Array(fixture,28+jsonLength,9).set([0,0,0,1,0,0,0,1,0]);
const compressed=gzipSync(new Uint8Array(fixture));
const assets={read:async url=>url.endsWith('manifest.json')?bytes({model:'test.glb.bin',modelEncoding:'gzip'}):compressed.buffer.slice(compressed.byteOffset,compressed.byteOffset+compressed.byteLength)};

test('native streaming and legacy gzip decoders both load the model and retain interaction names',async()=>{
  const native=globalThis.DecompressionStream;
  try {
    for(const decoder of [native,undefined]){
      globalThis.DecompressionStream=decoder;
      const progress=[],gltf=await loadRoomModel(assets,(completed,total)=>progress.push([completed,total]));
      assert.equal(gltf.scene.children[0].name,'VCR_Key.003');
      assert.equal(gltf.scene.children.length,2);
      assert.equal(gltf.scene.children[0].geometry.attributes.position.count,3);
      assert.equal(gltf.scene.children[0].geometry,gltf.scene.children[1].geometry,'shared geometry stays shared');
      assert.deepEqual(progress,[[1,2],[2,2]]);
    }
  } finally {globalThis.DecompressionStream=native;}
});
test('corrupt compressed models reject instead of becoming a ready scene',async()=>{
  await assert.rejects(loadRoomModel({read:async url=>url.endsWith('manifest.json')?await assets.read(url):new Uint8Array([1,2,3]).buffer}));
});

test('Meshopt payloads decode with named local frames and interleaved semantic attributes intact',async()=>{
  const {Document,NodeIO}=await import('@gltf-transform/core');
  const {EXTMeshoptCompression,KHRMeshQuantization}=await import('@gltf-transform/extensions');
  const {MeshoptEncoder}=await import('meshoptimizer');await MeshoptEncoder.ready;
  const document=new Document(),buffer=document.createBuffer(),positions=[0,0,0,1,0,0,0,1,0];
  const attribute=(type,array,normalized=false)=>document.createAccessor().setBuffer(buffer).setType(type).setArray(array).setNormalized(normalized);
  const primitive=document.createPrimitive().setAttribute('POSITION',attribute('VEC3',new Float32Array(positions)))
    .setAttribute('NORMAL',attribute('VEC3',new Int16Array([0,0,32767,0,0,32767,0,0,32767]),true))
    .setAttribute('TEXCOORD_0',attribute('VEC2',new Uint16Array([0,0,65535,0,0,65535]),true))
    .setIndices(attribute('SCALAR',new Uint16Array([0,1,2])));
  const node=document.createNode('VCR_Key.003').setExtras({name:'VCR_Key.003',surface_profile:'abs'}).setTranslation([2,3,4]).setMesh(document.createMesh().addPrimitive(primitive));
  document.createScene().addChild(node);document.createExtension(KHRMeshQuantization).setRequired(true);
  document.createExtension(EXTMeshoptCompression).setRequired(true);
  const io=new NodeIO().registerExtensions([EXTMeshoptCompression,KHRMeshQuantization]).registerDependencies({'meshopt.encoder':MeshoptEncoder});
  const packed=gzipSync(await io.writeBinary(document));
  const scene=await loadRoomModel({read:async url=>url.endsWith('manifest.json')?bytes({model:'test.bin',modelEncoding:'gzip'}):packed.buffer.slice(packed.byteOffset,packed.byteOffset+packed.length)});
  const decoded=scene.scene.getObjectByName('VCR_Key.003');assert(decoded);assert.deepEqual(decoded.position.toArray(),[2,3,4]);
  const p=decoded.geometry.getAttribute('position'),normal=decoded.geometry.getAttribute('normal'),uv=decoded.geometry.getAttribute('uv');
  assert.deepEqual(Array.from({length:3},(_,i)=>[p.getX(i),p.getY(i),p.getZ(i)]).flat(),positions);
  assert.equal(normal.getZ(1),1);assert.equal(uv.getX(1),1);assert.equal(uv.getY(2),1);
});
