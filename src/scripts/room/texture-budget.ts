/** Decoded storage estimate, including a full mip pyramid when generated.
 * Driver padding/compression and browser video decode surfaces are additional. */
export function textureBytes(width:number,height:number,bytesPerTexel=4,mipmaps=true) {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return 0;
  let w=Math.floor(width),h=Math.floor(height),pixels=0;
  for(;;){pixels+=w*h;if(!mipmaps||(w===1&&h===1))break;w=Math.max(1,w>>1);h=Math.max(1,h>>1);}
  return pixels*bytesPerTexel;
}
