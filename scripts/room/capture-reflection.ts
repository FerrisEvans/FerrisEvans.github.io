/** Browser-only entry point for build-reflection.mjs; never imported by the site. */
import {REVISION, WebGLRenderer} from 'three';
import {loadRoomModel} from '../../src/scripts/room/model';
import {applyMaterialStudy} from '../../src/scripts/room/lighting';

export async function captureReflection(){
  const renderer=new WebGLRenderer({antialias:false});renderer.setSize(64,64,false);
  const resources=new Set<{dispose():void}>();
  const gltf=await loadRoomModel();let capture:{width:number;height:number;threeRevision:string;bytes:number[]}|undefined;
  try{
    await applyMaterialStudy(gltf.scene,resources,renderer,undefined,{captureReflection:async target=>{
      const data=new Uint16Array(target.width*target.height*4);
      await renderer.readRenderTargetPixelsAsync(target,0,0,target.width,target.height,data);
      capture={width:target.width,height:target.height,threeRevision:REVISION,bytes:Array.from(new Uint8Array(data.buffer))};
    }});
    if(!capture)throw new Error('Reflection capture missing');return capture;
  }finally{for(const resource of resources)resource.dispose();renderer.dispose();}
}
