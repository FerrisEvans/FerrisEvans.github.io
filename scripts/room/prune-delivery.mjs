#!/usr/bin/env node
/** Keep build-only source images/models in the repository, outside the Pages artifact. */
import {readFile,rm,stat} from 'node:fs/promises';
import {basename,resolve} from 'node:path';
const room=resolve(process.argv[2]??'dist','room');
const directory=resolve(room,'materials');
const manifest=JSON.parse(await readFile(resolve(directory,'manifest.json'),'utf8'));
const source=manifest.geometryTransport?.source;
if(source&&source!==manifest.model){
  if(basename(source)!==source)throw new Error('Expected a local model source filename');
  await rm(resolve(directory,source),{force:true});
  console.log(`Published model: ${manifest.model}; retained ${source} only in source assets.`);
}
// Explicit source list: runtime fallbacks, provenance and compressed HD assets
// remain published. This reduces artifact size, not the scene's frame cost.
let removedBytes=0;
for(const file of ['city-night-v2.png','city-night-v3.png','walnut-grain-v1.png','window/city-panorama-v1.png','window/city-panorama-v2.png']){
  const target=resolve(room,file);
  const info=await stat(target).catch(error=>{if(error.code!=='ENOENT')throw error;});
  if(info){removedBytes+=info.size;await rm(target);}
}
console.log(`Omitted ${removedBytes} bytes of build-only source images from delivery.`);
