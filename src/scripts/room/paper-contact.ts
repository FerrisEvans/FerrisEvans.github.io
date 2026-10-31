import { Box3, DataTexture, LinearFilter, MathUtils, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, Quaternion, Vector3 } from 'three';

/** A local contact cue only: the desk bake intentionally contains no paper shadow. */
export function createPaperContact(root:Object3D,paper:Object3D,resources:Set<{dispose():void}>) {
  const backing=paper.getObjectByName('Work_Notepad_Backing'),desk=root.getObjectByName('Desk_Top');
  if(!(backing instanceof Mesh)||!desk)return ()=>{};
  root.updateMatrixWorld(true);
  backing.geometry.computeBoundingBox();
  const bounds=backing.geometry.boundingBox!,size=bounds.getSize(new Vector3());
  const scale=backing.getWorldScale(new Vector3()),width=size.x*scale.x,depth=size.z*scale.z;
  const margin=.014,resolution=64,data=new Uint8Array(resolution*resolution*4);
  // A rounded footprint with a soft edge; only its narrow fringe is visible
  // at rest. No atlas, shadow map, canvas, or per-frame texture upload.
  for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++) {
    const px=Math.abs(((x+.5)/resolution-.5)*(width+margin*2))-width/2+.008;
    const py=Math.abs(((y+.5)/resolution-.5)*(depth+margin*2))-depth/2+.008;
    const distance=Math.hypot(Math.max(px,0),Math.max(py,0))+Math.min(Math.max(px,py),0)-.008;
    const i=(y*resolution+x)*4;
    data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(255*(1-MathUtils.smoothstep(distance,-.012,margin)));
  }
  const texture=new DataTexture(data,resolution,resolution);texture.minFilter=texture.magFilter=LinearFilter;texture.needsUpdate=true;
  const geometry=new PlaneGeometry(width+margin*2,depth+margin*2);
  const material=new MeshBasicMaterial({color:'#16120e',map:texture,transparent:true,opacity:.18,depthWrite:false,toneMapped:false});
  const shadow=new Mesh(geometry,material);shadow.name='Paper_Contact_Shadow';shadow.userData.roomDynamic=true;
  shadow.position.copy(bounds.getCenter(new Vector3()).applyMatrix4(backing.matrixWorld));
  shadow.position.y=new Box3().setFromObject(desk).max.y+.00015;
  shadow.quaternion.copy(backing.getWorldQuaternion(new Quaternion())).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-Math.PI/2));
  shadow.raycast=()=>{};root.attach(shadow);
  for(const resource of [texture,geometry,material])resources.add(resource);
  const rest=paper.position.clone();
  return function sync() {
    const height=Math.max(0,paper.position.y-rest.y),slide=Math.hypot(paper.position.x-rest.x,paper.position.z-rest.z);
    material.opacity=.18*(1-MathUtils.smoothstep(height,0,.05))*(1-MathUtils.smoothstep(slide,0,.05));
    shadow.visible=material.opacity>.0001;
  };
}
