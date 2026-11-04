import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { roomMediaChunks } from './room-media';

/** Build the same content-addressed resource catalog for home preload and room entry. */
export function getRoomAssetManifest() {
  const assetRoot = resolve('public');
  type AtlasFiles = { albedo: string; orm: string; normal: string; entry?:{orm?:string;normal?:string}; opacity?:string; cutout?:boolean; alphaTest?:number; room: { file: string; preview?:string }; tv: { file: string;preview?:string }; lampOff?: {file:string} };
  const manifest: { buildId?:string; model?: string; reflection?:{file:string}; city?: string; homeFilm?:string; atlases: Record<string, AtlasFiles> } = JSON.parse(readFileSync(resolve(assetRoot, 'room/materials/manifest.json'), 'utf8'));
  const posterVersion = manifest.buildId ?? '18';
  const urls = ['/room/materials/' + (manifest.model ?? 'study.glb'), '/room/materials/manifest.json', manifest.city ?? '/room/city-night-v1.png', '/room/fonts/VT323-Regular.ttf','/fonts/room-pixel-zh.woff2'];
  if(manifest.reflection)urls.push('/room/materials/'+manifest.reflection.file);
  const streamUrls=new Set<string>();
  if(manifest.homeFilm){const film=JSON.parse(readFileSync(resolve(assetRoot,'.'+manifest.homeFilm),'utf8'));urls.push(manifest.homeFilm,film.video,film.poster,film.light);streamUrls.add(film.video);}
  for (const atlas of Object.values(manifest.atlases)) {
    for (const file of [atlas.albedo, atlas.orm, atlas.normal, ...Object.values(atlas.entry??{}), atlas.room.file, ...(atlas.room.preview?[atlas.room.preview]:[]), atlas.tv.file,...(atlas.tv.preview?[atlas.tv.preview]:[]), ...(atlas.lampOff ? [atlas.lampOff.file] : []),...(atlas.opacity?[atlas.opacity]:[])]) urls.push('/room/materials/' + file);
  }
  const deferredUrls = new Set(Object.values(manifest.atlases).flatMap(atlas => [
    ...(atlas.lampOff ? ['/room/materials/' + atlas.lampOff.file] : []),
    ...(atlas.room.preview ? ['/room/materials/' + atlas.room.file] : []),
    ...(atlas.tv.preview ? ['/room/materials/' + atlas.tv.file] : []),
    ...(atlas.entry?.normal ? ['/room/materials/' + atlas.normal] : []),
    ...(atlas.entry?.orm ? ['/room/materials/' + atlas.orm] : []),
  ]));
  // Each file owns its cache identity: a new font or post must not invalidate
  // unchanged models and textures. The aggregate identifies the page for diagnostics.
  const files = [...new Set(urls)].map(url => {
    const bytes = readFileSync(resolve(assetRoot, '.' + url));
    const stream=streamUrls.has(url);
    return { url, bytes:bytes.length, sha256:createHash('sha256').update(bytes).digest('hex'), ...(stream?roomMediaChunks(bytes):{}), deferred:deferredUrls.has(url), stream, priority:url===urls[0]?'high':undefined };
  });
  const assetDigest = createHash('sha256');
  for (const file of [...files].sort((a,b)=>a.url.localeCompare(b.url))) {
    assetDigest.update(file.url).update('\0').update(file.sha256).update('\0');
  }
  const assetVersion = assetDigest.digest('hex').slice(0, 20);
  const hasPoster = existsSync(resolve(assetRoot, 'room/loading.jpg'));
  return { files, assetVersion, posterVersion, hasPoster };
}
