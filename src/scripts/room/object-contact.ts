import { Box3, DataTexture, LinearFilter, MathUtils, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, Vector3 } from 'three';

/** Small receiver shadow for an object whose silhouette is excluded from the bake. */
export function createObjectContact(root:Object3D,object:Object3D,receiver:Object3D|undefined,resources:Set<{dispose():void}>,round=false) {
  if(!receiver)return ()=>{};
  root.updateMatrixWorld(true);
  const bounds=new Box3().setFromObject(object),size=bounds.getSize(new Vector3()),center=bounds.getCenter(new Vector3());
  const width=size.x,depth=size.z,margin=.024,resolution=64,data=new Uint8Array(resolution*resolution*4);
  for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++) {
    const u=((x+.5)/resolution-.5)*(width+margin*2),v=((y+.5)/resolution-.5)*(depth+margin*2);
    const edge=round?Math.hypot(u/(width/2),v/(depth/2))-1:Math.max(Math.abs(u)-width/2,Math.abs(v)-depth/2)/Math.min(width/2,depth/2);
    const i=(y*resolution+x)*4;data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(255*(1-MathUtils.smoothstep(edge,-.16,.16)));
  }
  const texture=new DataTexture(data,resolution,resolution);texture.minFilter=texture.magFilter=LinearFilter;texture.needsUpdate=true;
  const geometry=new PlaneGeometry(width+margin*2,depth+margin*2);
  const material=new MeshBasicMaterial({color:'#221a12',map:texture,transparent:true,opacity:.22,depthWrite:false,toneMapped:false});
  const shadow=new Mesh(geometry,material);shadow.name=object.name+'_Contact_Shadow';shadow.userData.roomDynamic=true;shadow.userData.keepIndependent=true;
  shadow.position.copy(center);shadow.position.y=new Box3().setFromObject(receiver).max.y+.00018;
  shadow.rotation.x=-Math.PI/2;shadow.raycast=()=>{};root.attach(shadow);
  for(const resource of [texture,geometry,material])resources.add(resource);
  const rest=object.getWorldPosition(new Vector3()),position=new Vector3();
  return function sync() {
    object.getWorldPosition(position);
    const height=Math.max(0,position.y-rest.y),slide=Math.hypot(position.x-rest.x,position.z-rest.z);
    material.opacity=.22*(1-MathUtils.smoothstep(height,0,.10))*(1-MathUtils.smoothstep(slide,0,.10));
    shadow.visible=material.opacity>.0001;
  };
}
