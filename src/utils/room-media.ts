import {createHash} from 'node:crypto';

/** Content-owned block checksums travel with the page's film manifest, so adding
 * a film does not replace the service worker or invalidate any other movie. */
export function roomMediaChunks(bytes:Uint8Array) {
  const chunkSize=512*1024;
  const chunks:string[]=[];
  for(let start=0;start<bytes.length;start+=chunkSize){
    chunks.push(createHash('sha256').update(bytes.subarray(start,start+chunkSize)).digest('hex'));
  }
  return {chunkSize,chunks};
}
