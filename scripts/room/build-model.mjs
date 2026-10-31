#!/usr/bin/env node
/** Compact static geometry offline, preserving motion's local coordinate frames.
 * Does not join meshes or quantize positions: props/leaf anchors depend on both.
 */
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS,EXTMeshoptCompression} from '@gltf-transform/extensions';
import {dedup,quantize,reorder} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
const root=new URL('../../',import.meta.url),manifestPath=new URL('public/room/materials/manifest.json',root);
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
const source=manifest.geometryTransport?.source??manifest.model;
if(!source||source.includes('/')||source.includes('..'))throw new Error('Expected a local source model');
const original=await readFile(new URL('public/room/materials/'+source,root));
await MeshoptEncoder.ready;await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const document=await io.readBinary(manifest.modelEncoding==='gzip'?gunzipSync(original):original);
const identity=doc=>JSON.stringify(doc.getRoot().listNodes().map(node=>({name:node.getName(),extras:node.getExtras(),matrix:node.getMatrix(),children:node.listChildren().map(n=>n.getName()),camera:node.getCamera()?.getName()})));
// Triangle position hashes ignore vertex/cache reorder, but preserve every face,
// including winding, and catch any accidental decimation or coordinate change.
function triangles(doc){return doc.getRoot().listMeshes().map(mesh=>mesh.listPrimitives().map(primitive=>{
  const positions=primitive.getAttribute('POSITION'),indices=primitive.getIndices();if(!positions)return '';
  const position=positions.getArray(),stride=positions.getElementSize(),at=i=>Array.from(position.slice(i*stride,(i+1)*stride)).join(',');
  const corners=indices?Array.from(indices.getArray()):Array.from({length:positions.getCount()},(_,i)=>i),faces=[];
  for(let i=0;i<corners.length;i+=3){const a=at(corners[i]),b=at(corners[i+1]),c=at(corners[i+2]);faces.push([`${a};${b};${c}`,`${b};${c};${a}`,`${c};${a};${b}`].sort()[0]);}
  return createHash('sha256').update(faces.sort().join('\n')).digest('hex');
}));}
const beforeIdentity=identity(document),beforeTriangles=JSON.stringify(triangles(document));
await document.transform(dedup({propertyTypes:['Accessor']}),reorder({encoder:MeshoptEncoder}),quantize({pattern:/^(NORMAL|TEXCOORD_)/,quantizeNormal:16,quantizeTexcoord:16}));
document.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
const binary=await io.writeBinary(document),decoded=await io.readBinary(binary);
if(identity(decoded)!==beforeIdentity)throw new Error('Node names, transforms, hierarchy or extras changed');
if(JSON.stringify(triangles(decoded))!==beforeTriangles)throw new Error('Triangle positions or winding changed');
const packed=gzipSync(binary,{level:9}),file='study-meshopt.glb.bin';
await writeFile(new URL('public/room/materials/'+file,root),packed);
const sha=data=>createHash('sha256').update(data).digest('hex');
manifest.model=file;manifest.modelEncoding='gzip';
manifest.geometryTransport={source,sourceSha256:sha(original),sha256:sha(packed),extension:'EXT_meshopt_compression',normalBits:16,uvBits:16,positions:'unchanged',nodes:decoded.getRoot().listNodes().length,sourceBytes:original.length,bytes:packed.length,scriptSha256:sha(await readFile(fileURLToPath(import.meta.url)))};
await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest.geometryTransport,null,2));
