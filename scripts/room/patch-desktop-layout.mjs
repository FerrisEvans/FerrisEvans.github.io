#!/usr/bin/env node
/** Move only the delivered desktop families, preserving every existing UV. */
import {NodeIO} from '@gltf-transform/core';
import {copyToDocument} from '@gltf-transform/functions';
import {Matrix4,Quaternion,Vector3} from 'three';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {resolve} from 'node:path';

const root=new URL('../../',import.meta.url),base=new URL('public/room/materials/',root);
const recipePath=new URL('scripts/room/desktop-layout.json',root),recipeBytes=await readFile(recipePath);
const recipe=JSON.parse(recipeBytes),manifestPath=new URL('manifest.json',base);
const manifest=JSON.parse(await readFile(manifestPath,'utf8')),source=manifest.geometryTransport?.source??manifest.model;
if(!process.argv[2])throw new Error('Pass the GLB from export-desktop-label.py');
const labelBytes=await readFile(resolve(process.argv[2])),sourceBytes=await readFile(new URL(source,base));
const io=new NodeIO(),document=await io.readBinary(gunzipSync(sourceBytes)),labelDocument=await io.readBinary(labelBytes);
const nodes=document.getRoot().listNodes(),name=node=>node.getExtras().name??node.getName();
const names=new Set(Object.keys(recipe.objects)),inFamily=n=>[...names].some(prefix=>n===prefix||n.startsWith(prefix+'_'));
const untouched=()=>JSON.stringify(nodes.filter(n=>!inFamily(name(n))).map(n=>({name:name(n),matrix:n.getMatrix(),children:n.listChildren().map(name),extras:n.getExtras()})));
const before=untouched();
for(const [prefix,spec]of Object.entries(recipe.objects)){
  const baseNode=nodes.find(n=>name(n)===prefix);if(!baseNode)throw new Error('Missing '+prefix);
  const rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),spec.rotationY);
  const target=new Matrix4().compose(new Vector3(...spec.position),rotation,new Vector3().setScalar(spec.scale));
  const delta=target.multiply(new Matrix4().fromArray(baseNode.getWorldMatrix()).invert());
  const family=nodes.filter(n=>name(n)===prefix||name(n).startsWith(prefix+'_'));
  for(const node of family.filter(n=>!family.includes(n.getParentNode()))){
    if(node.getParentNode())throw new Error('Expected flattened family root: '+name(node));
    node.setMatrix(delta.clone().multiply(new Matrix4().fromArray(node.getMatrix())).toArray());
  }
}
const labelNode=nodes.find(n=>name(n)==='Desk_Floppy_Print');
const newLabel=labelDocument.getRoot().listNodes().find(n=>n.getName()==='Desk_Floppy_Print');
if(!labelNode?.getMesh()||!newLabel?.getMesh())throw new Error('Missing original or replacement ink mesh');
const oldMesh=labelNode.getMesh(),ink=oldMesh.listPrimitives()[0].getMaterial();
const buffer=document.getRoot().listBuffers()[0];
const mesh=copyToDocument(document,labelDocument,[newLabel.getMesh()]).get(newLabel.getMesh());
for(const primitive of mesh.listPrimitives()){
  primitive.setMaterial(ink);
  for(const semantic of primitive.listSemantics())primitive.getAttribute(semantic).setBuffer(buffer);
  primitive.getIndices()?.setBuffer(buffer);
}
for(const extra of document.getRoot().listBuffers())if(extra!==buffer)extra.dispose();
labelNode.setMesh(mesh).setTranslation(recipe.floppyLabel.position).setRotation([0,0,0,1]).setScale([1,1,1]);
labelNode.setExtras({...labelNode.getExtras(),print_text:recipe.floppyLabel.text});
oldMesh.dispose();
if(untouched()!==before)throw new Error('Desktop patch changed an unrelated node');
const output=gzipSync(await io.writeBinary(document),{level:9});
await writeFile(new URL(source,base),output);
const sha=b=>createHash('sha256').update(b).digest('hex');
manifest.desktopLayout={version:recipe.version,recipe:'scripts/room/desktop-layout.json',recipeSha256:sha(recipeBytes),
  scriptSha256:sha(await readFile(new URL(import.meta.url))),sourceModelSha256:sha(sourceBytes),labelGeometrySha256:sha(labelBytes),
  objects:recipe.objects,label:recipe.floppyLabel.text,geometry:'existing meshes and UVs preserved; ink mesh replaced'};
await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest.desktopLayout,null,2));
