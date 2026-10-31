import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import ts from 'typescript';
import {CubeUVReflectionMapping,HalfFloatType,REVISION} from 'three';
let js=ts.transpileModule(readFileSync(new URL('../../src/scripts/room/reflection.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
js=js.replace("from 'three'",`from '${new URL('../../node_modules/three/build/three.module.js',import.meta.url).href}'`).replace('three/addons/libs/fflate.module.js',new URL('../../node_modules/three/examples/jsm/libs/fflate.module.js',import.meta.url).href);
const {loadRoomReflection}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const asset={file:'test.bin',encoding:'rgba16f-gzip',width:384,height:512,threeRevision:REVISION};
const values=new Uint16Array(384*512*4);values[0]=0x3c00;values[1]=0x4000;values[4*128*384+7]=0x1000;
const packed=gzipSync(new Uint8Array(values.buffer));
const read=async()=>packed.buffer.slice(packed.byteOffset,packed.byteOffset+packed.length);
test('prefiltered probe preserves half-float bytes and CubeUV layout without regenerating mips',async()=>{
 const native=globalThis.DecompressionStream;
 try{for(const decoder of [native,undefined]){
  globalThis.DecompressionStream=decoder;const map=await loadRoomReflection(asset,read);
  assert.deepEqual(map.image.data,values);assert.equal(map.type,HalfFloatType);assert.equal(map.mapping,CubeUVReflectionMapping);
  assert.equal(map.generateMipmaps,false);assert.equal(map.flipY,false);map.dispose();
 }}finally{globalThis.DecompressionStream=native;}
});
test('incompatible versions and truncated reflection payloads reject before GPU use',async()=>{
 await assert.rejects(loadRoomReflection({...asset,threeRevision:'old'},read),/rebuilding/);
 const short=gzipSync(new Uint8Array([1,2]));
 await assert.rejects(loadRoomReflection(asset,async()=>short.buffer.slice(short.byteOffset,short.byteOffset+short.length)),/length/);
});
