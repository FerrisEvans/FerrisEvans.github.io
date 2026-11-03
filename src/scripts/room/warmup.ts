import { Mesh, MeshPhysicalMaterial, Vector4, type Camera, type Object3D, type Scene, type WebGLRenderer } from 'three';

/** Only transmission materials trigger Three's extra opaque-room pass.
 * Reflective glass using clearcoat or opacity does not need that variant. */
export function hasVisibleTransmission(scene:Scene,camera:Camera) {
  let found=false;
  scene.traverseVisible(object=>{
    if(found||!(object instanceof Mesh)||!object.layers.test(camera.layers))return;
    const materials=Array.isArray(object.material)?object.material:[object.material];
    found=materials.some(material=>material.visible&&material instanceof MeshPhysicalMaterial&&material.transmission>0);
  });
  return found;
}

/** compileAsync links shaders, but drivers can still create pipelines and upload
 * geometry on the first draw. Submit those draws in material-sized batches while
 * the poster is visible, yielding between them so loading remains responsive. */
export async function warmScene(renderer:WebGLRenderer,scene:Scene,camera:Camera,step:(completed:number,total:number)=>Promise<void>) {
  const groups=new Map<string,Mesh[]>(),layers=new Map<Mesh,number>();
  const visibility=new Map<Object3D,boolean>(),culling=new Map<Mesh,boolean>();
  scene.traverse(object=>{
    if(!(object instanceof Mesh)||!object.layers.test(camera.layers))return;
    const materials=Array.isArray(object.material)?object.material:[object.material];
    const key=materials.map(material=>material.uuid).join(',');
    const group=groups.get(key)??[];group.push(object);groups.set(key,group);
    if(!object.geometry.boundingSphere)object.geometry.computeBoundingSphere();
    layers.set(object,object.layers.mask);
    culling.set(object,object.frustumCulled);
    for(let ancestor:Object3D|null=object;ancestor;ancestor=ancestor.parent){
      if(!visibility.has(ancestor))visibility.set(ancestor,ancestor.visible);
      if(ancestor===scene)break;
    }
  });
  const scissor=renderer.getScissor(new Vector4()),scissorTest=renderer.getScissorTest();
  const target=renderer.getRenderTarget();
  try{
    renderer.setScissor(0,0,1,1);renderer.setScissorTest(true);
    // The moving cassette and paper inserts start hidden, and side-table
    // objects can be outside the Home frustum. Submit their real first draw
    // under the loading poster, not on the visitor's first interaction.
    for(const object of visibility.keys())object.visible=true;
    for(const object of culling.keys())object.frustumCulled=false;
    for(const object of layers.keys())object.layers.mask=0;
    let completed=0,sliceStart=performance.now();
    for(const group of groups.values()){
      for(const object of group)object.layers.mask=layers.get(object)!;
      renderer.render(scene,camera);
      for(const object of group)object.layers.mask=0;
      completed++;
      // Cached driver pipelines are cheap. Batch those draws rather than
      // adding a full animation-frame wait for every already-warm material.
      if(completed===groups.size||performance.now()-sliceStart>=8){
        await step(completed,groups.size);sliceStart=performance.now();
      }
    }
  }finally{
    for(const [object,mask] of layers)object.layers.mask=mask;
    for(const [object,value] of visibility)object.visible=value;
    for(const [object,value] of culling)object.frustumCulled=value;
    renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);renderer.setRenderTarget(target);
  }
}
