#!/usr/bin/env node
/** Capture matching static-hosting posters from an actual production WebGL build. */
import {build} from 'astro';
import {preview} from 'vite';
import {chromium} from 'playwright';
import sharp from 'sharp';
import {mkdtemp,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('../../',import.meta.url));
const temporary=await mkdtemp(join(tmpdir(),'mainloop-posters-'));
const outDir=join(temporary,'site'),sha=data=>createHash('sha256').update(data).digest('hex');
const manifest=JSON.parse(await readFile(join(root,'public/room/materials/manifest.json'),'utf8'));
let server,browser;
try{
  await build({root,outDir,logLevel:'error'});
  server=await preview({configFile:false,root,appType:'mpa',build:{outDir},preview:{host:'127.0.0.1',port:0},logLevel:'error'});
  const port=server.httpServer.address().port;
  browser=await chromium.launch({channel:'chrome',headless:true});
  const posters={},captures=[];
  for(const [name,width,height,mode]of [['loading',1440,1440,'poster'],['reading',1440,900,'reading'],['share',1200,630,'reading']]){
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(String(error)));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.goto(`http://127.0.0.1:${port}/?capture=${mode}`);
    await page.waitForFunction(()=>{
      const data=document.querySelector('#room')?.dataset;
      if(data?.state==='fallback')throw new Error('Capture requires working WebGL 2');
      return ['ready','active'].includes(data?.state)&&data?.lightingDetails==='full';
    },null,{timeout:60000});
    await page.waitForTimeout(100);
    const data=await page.locator('#room').evaluate(element=>({...element.dataset}));
    if(errors.length||data.assetBuildId!==manifest.buildId)throw new Error(`Capture mismatch: ${name}: ${errors.join(', ')}`);
    const jpeg=await sharp(await page.screenshot()).jpeg({quality:90,mozjpeg:true}).toBuffer();
    const file=name+'.jpg';await writeFile(join(temporary,file),jpeg);posters[file]=sha(jpeg);
    captures.push({file,width,height,buildId:data.assetBuildId});await context.close();
  }
  const files=new Set([manifest.model,manifest.reflection.file]);
  for(const atlas of Object.values(manifest.atlases)){
    for(const name of ['albedo','normal','orm','opacity'])if(atlas[name])files.add(atlas[name]);
    for(const name of ['room','tv','lampOff'])if(atlas[name]){files.add(atlas[name].file);if(atlas[name].preview)files.add(atlas[name].preview);}
  }
  const assets={};for(const file of files)assets[file]=sha(await readFile(join(root,'public/room/materials',file)));
  const receipt={buildId:manifest.buildId,bakeBuildId:manifest.bakeBuildId,assets,posters,capture:{browser:await browser.version(),captures}};
  // Publish only after every viewport has rendered successfully.
  for(const file of Object.keys(posters))await copyFile(join(temporary,file),join(root,'public/room',file));
  await writeFile(join(root,'public/room/asset-build.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({buildId:manifest.buildId,posters,captures}));
}finally{await browser?.close();await server?.close();await rm(temporary,{recursive:true,force:true});}
