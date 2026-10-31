#!/usr/bin/env node
/** Rebuild the pinned Three.js CubeUV probe, without a GPU task at site entry.
 * node scripts/room/build-reflection.mjs [--playwright /absolute/path/to/playwright]
 * Requires a local Chrome and Playwright; no deployment server is involved.
 */
import {createServer} from 'vite';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(import.meta.url),args=process.argv.slice(2),moduleAt=args.indexOf('--playwright');
const {chromium}=moduleAt>=0?await import(pathToFileURL(resolve(args[moduleAt+1],'index.mjs')).href):require('playwright');
const server=await createServer({root,configFile:false,publicDir:resolve(root,'public'),server:{host:'127.0.0.1',port:0},logLevel:'warn'});
let browser;
try{
  await server.listen();const port=server.httpServer.address().port;
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/room/materials/manifest.json`);
  const result=await page.evaluate(async()=>{
    const {captureReflection}=await import('/scripts/room/capture-reflection.ts');return captureReflection();
  });
  const packed=gzipSync(Buffer.from(result.bytes),{level:9});
  const manifestPath=resolve(root,'public/room/materials/manifest.json');
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  const inputs=['src/scripts/room/lighting.ts','src/scripts/room/reflection.ts','src/scripts/room/weather.ts','src/scripts/room/crt.ts','src/scripts/room/model.ts','scripts/room/capture-reflection.ts','scripts/room/build-reflection.mjs',`public/room/materials/${manifest.model}`,'node_modules/three/package.json'];
  inputs.push('public'+manifest.city);
  for(const atlas of Object.values(manifest.atlases))for(const value of Object.values(atlas)){
    const file=typeof value==='object'?value.file:typeof value==='string'?value:null;
    if(file&&/\.(webp|ktx2)$/.test(file))inputs.push('public/room/materials/'+file);
  }
  const sources={};for(const file of [...new Set(inputs)].sort())sources[file]=createHash('sha256').update(await readFile(resolve(root,file))).digest('hex');
  const file='reflection-cubeuv.bin';
  await writeFile(resolve(root,'public/room/materials',file),packed);
  manifest.reflection={file,encoding:'rgba16f-gzip',width:result.width,height:result.height,threeRevision:result.threeRevision,manifestSha256:createHash('sha256').update(JSON.stringify({atlases:manifest.atlases,city:manifest.city,model:manifest.model})).digest('hex'),sha256:createHash('sha256').update(packed).digest('hex'),sources};
  manifest.buildId=createHash('sha256').update(JSON.stringify({reflection:manifest.reflection.sha256,inputs:sources,bindings:manifest.reflection.manifestSha256})).digest('hex').slice(0,16);
  await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({file,buildId:manifest.buildId,bytes:packed.length,decodedBytes:result.bytes.length,width:result.width,height:result.height,threeRevision:result.threeRevision}));
}finally{await browser?.close();await server.close();}
