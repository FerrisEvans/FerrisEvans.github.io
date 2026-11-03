#!/usr/bin/env node
/** Keep accepted UV charts for atlases deliberately omitted from a partial bake. */
import {NodeIO,PropertyType} from '@gltf-transform/core';
import {copyToDocument,prune} from '@gltf-transform/functions';
import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const [generated,previousRoot,atlasList,reportPath]=process.argv.slice(2);
if(!generated||!previousRoot||!atlasList||!reportPath)throw new Error('Expected generated GLB, accepted material directory, selected atlas list and report path');
const selected=new Set(atlasList.split(',')),io=new NodeIO();
const manifest=JSON.parse(await readFile(join(previousRoot,'manifest.json'),'utf8'));
if([...selected].some(atlas=>!manifest.atlases[atlas]))throw new Error('Unknown selected atlas');
const source=await readFile(join(previousRoot,manifest.geometryTransport?.source??manifest.model));
if(manifest.geometryTransport?.sourceSha256&&createHash('sha256').update(source).digest('hex')!==manifest.geometryTransport.sourceSha256)throw new Error('Accepted model hash does not match its manifest');
const accepted=await io.readBinary(manifest.modelEncoding==='gzip'?gunzipSync(source):source);
const next=await io.readBinary(await readFile(generated));
const name=node=>node.getExtras().name??node.getName();
const oldNodes=accepted.getRoot().listNodes(),newNodes=next.getRoot().listNodes();
const byName=new Map(newNodes.map(node=>[name(node),node]));
const retained=node=>node.getExtras().atlas&&!selected.has(node.getExtras().atlas);
const names=nodes=>nodes.filter(retained).map(name).sort();
if(JSON.stringify(names(oldNodes))!==JSON.stringify(names(newNodes)))throw new Error('Unbaked atlas membership changed');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const round=x=>Math.round(x*1e6)/1e6;
function signature(node,uv){
  const faces=[];
  for(const primitive of node.getMesh()?.listPrimitives()??[]){
    const semantics=primitive.listSemantics().filter(s=>uv||!s.startsWith('TEXCOORD')).sort();
    const attributes=semantics.map(s=>primitive.getAttribute(s));
    const indices=primitive.getIndices()?.getArray(),count=indices?.length??attributes[0].getCount();
    for(let i=0;i<count;i+=3){
      const corners=[];
      for(let j=0;j<3;j++){
        const index=indices?indices[i+j]:i+j;
        corners.push(attributes.map(a=>Array.from(a.getArray().slice(index*a.getElementSize(),(index+1)*a.getElementSize()),round).join(',')).join('|'));
      }
      faces.push([corners.join(';'),[...corners.slice(1),corners[0]].join(';'),[corners[2],...corners.slice(0,2)].join(';')].sort()[0]);
    }
  }
  return sha(JSON.stringify({extras:node.getExtras(),
    parent:node.getParentNode()&&name(node.getParentNode()),children:node.listChildren().map(name).sort(),faces:faces.sort()}));
}
const equivalent=(a,b,uv)=>b&&a.getWorldMatrix().every((v,i)=>Math.abs(v-b.getWorldMatrix()[i])<1e-6)&&signature(a,uv)===signature(b,uv);
const retainedNodes=oldNodes.filter(node=>retained(node)||!node.getExtras().atlas);
for(const node of retainedNodes){
  const replacement=byName.get(name(node));
  if(!equivalent(node,replacement,false))throw new Error('Unbaked geometry, normals, hierarchy or metadata changed: '+name(node));
}
const meshes=[...new Set(retainedNodes.map(n=>n.getMesh()).filter(Boolean))];
const copies=copyToDocument(next,accepted,meshes);
for(const node of retainedNodes){
  const replacement=byName.get(name(node));
  if(node.getMesh())replacement.setMesh(copies.get(node.getMesh()));
}
const buffer=next.getRoot().listBuffers()[0];
for(const accessor of next.getRoot().listAccessors())accessor.setBuffer(buffer);
for(const extra of next.getRoot().listBuffers())if(extra!==buffer)extra.dispose();
await next.transform(prune({propertyTypes:[PropertyType.MESH,PropertyType.PRIMITIVE,PropertyType.PRIMITIVE_TARGET,PropertyType.ACCESSOR,PropertyType.MATERIAL,PropertyType.TEXTURE],keepExtras:false,keepAttributes:true,keepSolidTextures:true}));
const output=await io.writeBinary(next),decoded=await io.readBinary(output);
const decodedNodes=new Map(decoded.getRoot().listNodes().map(n=>[name(n),n]));
for(const node of retainedNodes)if(!equivalent(node,decodedNodes.get(name(node)),true))throw new Error('Retained atlas changed after serialization: '+name(node));
await writeFile(generated,output);
const report={acceptedBuildId:manifest.buildId,acceptedSourceSha256:sha(source),scriptSha256:sha(await readFile(new URL(import.meta.url))),selectedAtlases:[...selected].sort(),
  retainedNodes:retainedNodes.length,retainedAtlases:[...new Set(oldNodes.filter(retained).map(n=>n.getExtras().atlas))].sort(),
  geometryAndNormalGate:'unchanged to 1 micrometre; hierarchy and metadata identical',retainedUvGate:'accepted UV charts and meshes restored exactly'};
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
