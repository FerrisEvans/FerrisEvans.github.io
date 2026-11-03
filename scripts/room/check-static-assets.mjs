#!/usr/bin/env node
/** Catch stale precomputed assets before the static site is published. */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url),sha=data=>createHash('sha256').update(data).digest('hex');
const read=path=>readFile(new URL(path,root));
const manifest=JSON.parse(await read('public/room/materials/manifest.json'));
if(manifest.desktopLayout){
  const layout=manifest.desktopLayout;
  if(sha(await read(layout.recipe))!==layout.recipeSha256||sha(await read('scripts/room/patch-desktop-layout.mjs'))!==layout.scriptSha256)throw new Error('Desktop placement recipe changed; rebuild the desktop model patch');
}
if(manifest.receiverLighting){
  const receiver=manifest.receiverLighting;
  if(receiver.buildId!==manifest.bakeBuildId)throw new Error('Receiver lighting belongs to a different bake');
  if(sha(await read('scripts/room/pack-receiver-lighting.py'))!==receiver.packingScriptSha256)throw new Error('Receiver packing script changed; repack the receiver lighting');
  for(const [path,hash]of Object.entries(receiver.sources))if(sha(await read(path))!==hash)throw new Error(`Receiver lighting source changed: ${path}; refresh its targeted bake`);
  for(const [file,hash]of Object.entries(receiver.files))if(sha(await read('public/room/materials/'+file))!==hash)throw new Error(`Receiver lighting differs: ${file}`);
}
const geometry=manifest.geometryTransport;
if(geometry){
  for(const [path,hash] of [[`public/room/materials/${geometry.source}`,geometry.sourceSha256],[`public/room/materials/${manifest.model}`,geometry.sha256],['scripts/room/build-model.mjs',geometry.scriptSha256]]){
    if(sha(await read(path))!==hash)throw new Error(`Stale geometry: ${path}; run npm run assets:model`);
  }
}
const entry=manifest.entryLighting;
if(entry){
  if(sha(await read('scripts/room/build-entry-lighting.mjs'))!==entry.scriptSha256)throw new Error('Entry lighting script changed; run npm run assets:lighting');
  for(const [file,input]of Object.entries(entry.sources)){
    const light=Object.values(manifest.atlases).flatMap(atlas=>[atlas.room,atlas.tv]).find(light=>light.file===file);
    if((input.range!==undefined&&light?.range!==input.range)||sha(await read('public/room/materials/'+file))!==input.sha256)throw new Error(`Entry lighting source changed: ${file}; run npm run assets:lighting`);
  }
  for(const [file,hash]of Object.entries(entry.files))if(sha(await read('public/room/materials/'+file))!==hash)throw new Error(`Entry lighting differs: ${file}; run npm run assets:lighting`);
}
const reflection=manifest.reflection;
if(!reflection)throw new Error('Missing prefiltered room reflection; run npm run assets:reflection');
const version=JSON.parse(await read('node_modules/three/package.json')).version.split('.')[1];
if(reflection.threeRevision!==version)throw new Error('Three.js changed; rebuild the room reflection');
if(sha(await read('public/room/materials/'+reflection.file))!==reflection.sha256)throw new Error('Reflection asset hash differs from manifest');
if(sha(JSON.stringify({atlases:manifest.atlases,city:manifest.city,model:manifest.model}))!==reflection.manifestSha256)throw new Error('Material bindings changed; run npm run assets:reflection');
for(const [path,hash] of Object.entries(reflection.sources))if(sha(await read(path))!==hash)throw new Error(`Stale reflection input: ${path}; run npm run assets:reflection`);
const receipt=JSON.parse(await read('public/room/asset-build.json'));
if(receipt.buildId!==manifest.buildId)throw new Error('Posters belong to an older room build; run npm run assets:posters');
for(const file of ['loading.jpg','reading.jpg','share.jpg'])if(sha(await read('public/room/'+file))!==receipt.posters?.[file])throw new Error(`Poster seal differs: ${file}; run npm run assets:posters`);
console.log(`Static room assets verified: ${geometry?.bytes??'original'} model bytes, ${Object.keys(reflection.sources).length} reflection inputs.`);
