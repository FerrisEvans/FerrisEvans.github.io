import { BoxGeometry, Color, HemisphereLight, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry, Scene, Vector3, type Material, type Texture } from 'three';
import { windowInspection } from './window-navigation';
import type { WindowProjection } from './window-navigation';
import { cityProjection } from './weather';

/** Recover the photograph's affine world mapping from the actual authored UVs. */
function cityFrame(room?:Object3D) {
  const fallback={projection:windowInspection as WindowProjection,right:new Vector3(windowInspection.width,0,0),down:new Vector3(0,-windowInspection.height,0)};
  const source=room?.getObjectByName('City_Backdrop');if(!(source instanceof Mesh))return fallback;
  source.updateWorldMatrix(true,false);
  const position=source.geometry.getAttribute('position'),uv=source.geometry.getAttribute('uv');if(!position||!uv)return fallback;
  const points=Array.from({length:position.count},(_,i)=>new Vector3().fromBufferAttribute(position,i).applyMatrix4(source.matrixWorld));
  const coords=Array.from({length:uv.count},(_,i)=>[uv.getX(i)*cityProjection.scale[0]+cityProjection.offset[0],uv.getY(i)*cityProjection.scale[1]+cityProjection.offset[1]]);
  for(let j=1;j<points.length;j++)for(let k=j+1;k<points.length;k++){
    const du=coords[j][0]-coords[0][0],dv=coords[j][1]-coords[0][1],eu=coords[k][0]-coords[0][0],ev=coords[k][1]-coords[0][1],det=du*ev-dv*eu;
    if(Math.abs(det)<1e-8)continue;
    const a=points[j].clone().sub(points[0]),b=points[k].clone().sub(points[0]);
    const right=a.clone().multiplyScalar(ev).addScaledVector(b,-dv).divideScalar(det),down=b.clone().multiplyScalar(du).addScaledVector(a,-eu).divideScalar(det);
    const center=points[0].clone().addScaledVector(right,.5-coords[0][0]).addScaledVector(down,.5-coords[0][1]);
    const projection:WindowProjection={width:right.length(),height:down.length(),position:center.toArray() as [number,number,number],sourceBounds:{min:[Math.min(...coords.map(p=>p[0])),Math.min(...coords.map(p=>p[1]))],max:[Math.max(...coords.map(p=>p[0])),Math.max(...coords.map(p=>p[1]))]}};
    return{projection,right,down};
  }
  return fallback;
}

/** A continuous architectural opening. The near joinery stays in front of the
 * city at every magnification; overview never substitutes a photograph border. */
export function createWindowScene(city:Material,environment:Texture,resources:Set<{dispose():void}>,room?:Object3D) {
  const {projection,right,down}=cityFrame(room);
  const scene=Object.assign(new Scene(),{windowProjection:projection});scene.background=new Color('#25221f');
  const {width,height,position:[cx,cy,z]}=projection,{eye}=windowInspection;
  const plateGeometry=new PlaneGeometry(width,height),positions=plateGeometry.attributes.position,uv=plateGeometry.attributes.uv;
  for(let i=0;i<positions.count;i++){const point=right.clone().multiplyScalar(uv.getX(i)-.5).addScaledVector(down,.5-uv.getY(i));positions.setXYZ(i,point.x,point.y,point.z);}
  resources.add(plateGeometry);
  const plate=new Mesh(plateGeometry,city);plate.name='City_Backdrop';plate.position.set(cx,cy,z);scene.add(plate);
  scene.add(new HemisphereLight(0xadc2d3,0x997455,1.1));
  room?.updateMatrixWorld(true);
  // Keep the near aperture just outside the projected city corners, including
  // the bounded eye translation at the extremes of a pan.
  const nearZ=-1,ratio=(eye[2]-nearZ)/(eye[2]-z),w=width*ratio+.24,h=height*ratio+.08;
  const apertureX=eye[0]+(cx-eye[0])*ratio,apertureY=eye[1]+(cy-eye[1])*ratio;
  const finishes=new Map<Material,MeshStandardMaterial>();
  function piece(name:string,center:Vector3,size:Vector3){
    const source=room?.getObjectByName(name);if(!(source instanceof Mesh))return;
    const geometry=source.geometry.clone();geometry.applyMatrix4(source.matrixWorld);geometry.computeBoundingBox();
    const bounds=geometry.boundingBox!,original=bounds.getSize(new Vector3()),origin=bounds.getCenter(new Vector3());
    geometry.translate(-origin.x,-origin.y,-origin.z);
    geometry.scale(size.x/original.x,size.y/original.y,size.z/original.z);
    const originalMaterial=Array.isArray(source.material)?source.material[0]:source.material;
    let finish=finishes.get(originalMaterial);
    if(!finish&&originalMaterial instanceof MeshStandardMaterial){
      // Relocated joinery cannot reuse shadows baked for its old position.
      finish=new MeshStandardMaterial({map:originalMaterial.map,normalMap:originalMaterial.normalMap,roughnessMap:originalMaterial.roughnessMap,roughness:.8,envMap:environment,envMapIntensity:.7});
      finishes.set(originalMaterial,finish);resources.add(finish);
    }
    resources.add(geometry);const mesh=new Mesh(geometry,finish??originalMaterial);mesh.name='Inspection_'+name;mesh.position.copy(center);scene.add(mesh);
  }
  // Reuse the authored oak geometry and UVs in the independent aperture.
  // The sill projects toward the viewer; the surrounding wall has real depth.
  piece('Window_Upright',new Vector3(apertureX-w/2-.045,apertureY,nearZ),new Vector3(.09,h+.18,.17));
  piece('Window_Upright.002',new Vector3(apertureX+w/2+.045,apertureY,nearZ),new Vector3(.09,h+.18,.17));
  piece('Window_Sill_FrontBead',new Vector3(apertureX,apertureY+h/2+.045,nearZ),new Vector3(w,.09,.16));
  piece('Window_Sill_FrontBead',new Vector3(apertureX,apertureY-h/2-.045,nearZ),new Vector3(w,.09,.16));
  piece('Window_Sill',new Vector3(apertureX,apertureY-h/2-.13,nearZ+.14),new Vector3(w+.34,.09,.43));
  const plaster=new MeshStandardMaterial({color:0x82715d,roughness:1,envMap:environment,envMapIntensity:.2});resources.add(plaster);
  for(const [x,y,sw,sh]of [[apertureX,apertureY+h/2+4.08,20,8],[apertureX,apertureY-h/2-4.18,20,8],[apertureX-w/2-4.08,apertureY,8,h+.4],[apertureX+w/2+4.08,apertureY,8,h+.4]]){
    const geometry=new BoxGeometry(sw,sh,.16);resources.add(geometry);
    const wall=new Mesh(geometry,plaster);wall.position.set(x,y,nearZ-.10);scene.add(wall);
  }
  return scene;
}
