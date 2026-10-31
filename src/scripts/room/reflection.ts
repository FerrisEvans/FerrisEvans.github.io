import {Color, CubeUVReflectionMapping, DataTexture, HalfFloatType, LinearFilter, LinearSRGBColorSpace, Object3D, PMREMGenerator, REVISION, RGBAFormat, Scene, Vector3, type WebGLRenderer} from 'three';
import {gunzipSync} from 'three/addons/libs/fflate.module.js';

/** PMREM's packed CubeUV layout is versioned with the renderer, not portable HDR. */
export type ReflectionAsset={file:string;encoding:'rgba16f-gzip';width:number;height:number;threeRevision:string};

export async function loadRoomReflection(asset:ReflectionAsset,read:(url:string)=>Promise<ArrayBuffer>) {
  if(asset.encoding!=='rgba16f-gzip'||asset.threeRevision!==REVISION||asset.width!==384||asset.height!==512)throw new Error('Reflection needs rebuilding for this Three.js version');
  const packed=await read('/room/materials/'+asset.file);
  const data=typeof DecompressionStream==='function'
    ? await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    : gunzipSync(new Uint8Array(packed)).buffer as ArrayBuffer;
  if(data.byteLength!==asset.width*asset.height*8)throw new Error('Invalid prefiltered reflection length');
  const map=new DataTexture(new Uint16Array(data),asset.width,asset.height,RGBAFormat,HalfFloatType);
  map.mapping=CubeUVReflectionMapping;map.colorSpace=LinearSRGBColorSpace;
  map.minFilter=map.magFilter=LinearFilter;map.generateMipmaps=false;map.flipY=false;map.needsUpdate=true;
  map.name='Room prefiltered reflection';return map;
}

/** Build-time capture. The TV remains off; its live highlights use area lights. */
export function captureRoomReflection(room:Object3D,renderer:WebGLRenderer) {
  const scene=new Scene();scene.background=new Color(.025,.02,.015);scene.add(room.clone(true));
  const pmrem=new PMREMGenerator(renderer);
  try{return pmrem.fromScene(scene,.04,.05,40,{size:128,position:new Vector3(-.6,1.5,.9)});}
  finally{pmrem.dispose();}
}
