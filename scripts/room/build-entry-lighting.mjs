#!/usr/bin/env node
/** First-view lighting and surface detail; original colour and geometry remain.
 * Average RGBM in linear irradiance, never its four encoded byte channels.
 */
import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url),base=new URL('public/room/materials/',root),manifestPath=new URL('manifest.json',base);
const manifest=JSON.parse(await readFile(manifestPath,'utf8')),sha=data=>createHash('sha256').update(data).digest('hex');
const sources={},files={};let fullBytes=0,entryBytes=0;
for(const [name,atlas] of Object.entries(manifest.atlases)){
 for(const kind of ['room','tv']){
  const light=atlas[kind],file=light.file,source=await readFile(new URL(file,base));
  const {data,info:{width,height}}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const limit=kind==='tv'?128:name==='desk'?512:256;
  const factor=Math.max(1,width/limit),w=width/factor,h=height/factor;
  if(factor===1){delete light.preview;continue;}
  if(!Number.isInteger(factor)||!Number.isInteger(h))throw new Error('Expected power-of-two lightmap dimensions');
  const out=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const rgb=[0,0,0];
    for(let dy=0;dy<factor;dy++)for(let dx=0;dx<factor;dx++){
      const p=((y*factor+dy)*width+x*factor+dx)*4,a=data[p+3]/255;
      for(let c=0;c<3;c++)rgb[c]+=data[p+c]/255*a*light.range/(factor*factor);
    }
    const multiplier=Math.max(1/255,Math.min(1,Math.ceil(Math.max(...rgb)/light.range*255)/255)),p=(y*w+x)*4;
    for(let c=0;c<3;c++)out[p+c]=Math.round(Math.min(1,rgb[c]/(multiplier*light.range))*255);
    out[p+3]=Math.round(multiplier*255);
  }
  const packed=await sharp(out,{raw:{width:w,height:h,channels:4}}).webp({lossless:true,effort:6}).toBuffer(),preview=name+'-'+kind+'-entry.webp';
  // Reopening the encoded map proves there is no further loss in transport.
  if(!Buffer.from(out).equals(await sharp(packed).ensureAlpha().raw().toBuffer()))throw new Error('Entry map encoder changed RGBM bytes');
  await writeFile(new URL(preview,base),packed);light.preview=preview;
  sources[file]={sha256:sha(source),range:light.range};files[preview]=sha(packed);fullBytes+=source.length;entryBytes+=packed.length;
 }
 atlas.entry={};
 for(const kind of ['normal','orm']){
  const file=atlas[kind],source=await readFile(new URL(file,base));
  const size=name==='desk'?1024:['equipment','foliage','tape'].includes(name)?512:256;
  const meta=await sharp(source).metadata();if(meta.width<=size)continue;
  // Data maps are averaged as linear channels, not sRGB colours. Normalize
  // tangent-space normals after averaging to avoid changing bump strength.
  const {data:input,info}=await sharp(source).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const factor=info.width/size,height=info.height/factor,data=Buffer.alloc(size*height*3);
  for(let y=0;y<height;y++)for(let x=0;x<size;x++)for(let c=0;c<3;c++){
    let sum=0;for(let dy=0;dy<factor;dy++)for(let dx=0;dx<factor;dx++)sum+=input[((y*factor+dy)*info.width+x*factor+dx)*info.channels+c];
    data[(y*size+x)*3+c]=Math.round(sum/(factor*factor));
  }
  if(kind==='normal')for(let p=0;p<data.length;p+=3){const x=data[p]/127.5-1,y=data[p+1]/127.5-1,z=data[p+2]/127.5-1,n=Math.hypot(x,y,z)||1;data[p]=Math.round((x/n+1)*127.5);data[p+1]=Math.round((y/n+1)*127.5);data[p+2]=Math.round((z/n+1)*127.5);}
  const packed=await sharp(data,{raw:{width:size,height,channels:3}}).webp({lossless:true,effort:6}).toBuffer(),preview=name+'-'+kind+'-entry.webp';
  await writeFile(new URL(preview,base),packed);atlas.entry[kind]=preview;
  sources[file]={sha256:sha(source)};files[preview]=sha(packed);fullBytes+=source.length;entryBytes+=packed.length;
 }
}
manifest.entryLighting={sources,files,scriptSha256:sha(await readFile(new URL(import.meta.url))),fullBytes,entryBytes};
await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({fullBytes,entryBytes,firstFrameSaved:fullBytes-entryBytes}));
