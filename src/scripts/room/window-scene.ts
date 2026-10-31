import { BoxGeometry, Color, HemisphereLight, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry, Scene, Vector3, type Material, type Texture } from 'three';
import { windowInspection } from './window-navigation';

/** A continuous architectural opening. The near joinery stays in front of the
 * city at every magnification; overview never substitutes a photograph border. */
export function createWindowScene(city:Material,environment:Texture,resources:Set<{dispose():void}>,room?:Object3D) {
  const scene=new Scene();scene.background=new Color('#25221f');
  const {width,height,position:[cx,cy,z],eye}=windowInspection;
  const plateGeometry=new PlaneGeometry(width,height);resources.add(plateGeometry);
  const plate=new Mesh(plateGeometry,city);plate.name='City_Backdrop';plate.position.set(cx,cy,z);scene.add(plate);
  scene.add(new HemisphereLight(0xadc2d3,0x997455,1.1));
  room?.updateMatrixWorld(true);
  // Keep the near aperture just outside the projected city corners, including
  // the bounded eye translation at the extremes of a pan.
  const nearZ=-1,ratio=(eye[2]-nearZ)/(eye[2]-z),w=width*ratio+.24,h=height*ratio+.08;
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
  piece('Window_Upright',new Vector3(cx-w/2-.045,cy,nearZ),new Vector3(.09,h+.18,.17));
  piece('Window_Upright.002',new Vector3(cx+w/2+.045,cy,nearZ),new Vector3(.09,h+.18,.17));
  piece('Window_Sill_FrontBead',new Vector3(cx,cy+h/2+.045,nearZ),new Vector3(w,.09,.16));
  piece('Window_Sill_FrontBead',new Vector3(cx,cy-h/2-.045,nearZ),new Vector3(w,.09,.16));
  piece('Window_Sill',new Vector3(cx,cy-h/2-.13,nearZ+.14),new Vector3(w+.34,.09,.43));
  const plaster=new MeshStandardMaterial({color:0x82715d,roughness:1,envMap:environment,envMapIntensity:.2});resources.add(plaster);
  for(const [x,y,sw,sh]of [[cx,cy+h/2+4.08,20,8],[cx,cy-h/2-4.18,20,8],[cx-w/2-4.08,cy,8,h+.4],[cx+w/2+4.08,cy,8,h+.4]]){
    const geometry=new BoxGeometry(sw,sh,.16);resources.add(geometry);
    const wall=new Mesh(geometry,plaster);wall.position.set(x,y,nearZ-.10);scene.add(wall);
  }
  return scene;
}
