import { Mesh, Vector4, type Camera, type Scene, type WebGLRenderer } from 'three';

/** compileAsync links shaders, but drivers can still create pipelines and upload
 * geometry on the first draw. Submit those draws in material-sized batches while
 * the poster is visible, yielding between them so loading remains responsive. */
export async function warmScene(renderer:WebGLRenderer,scene:Scene,camera:Camera,step:(completed:number,total:number)=>Promise<void>) {
  const groups=new Map<string,Mesh[]>(),layers=new Map<Mesh,number>();
  scene.traverse(object=>{
    if(!(object instanceof Mesh)||!object.layers.test(camera.layers))return;
    const materials=Array.isArray(object.material)?object.material:[object.material];
    const key=materials.map(material=>material.uuid).join(',');
    const group=groups.get(key)??[];group.push(object);groups.set(key,group);
    layers.set(object,object.layers.mask);
  });
  const scissor=renderer.getScissor(new Vector4()),scissorTest=renderer.getScissorTest();
  const target=renderer.getRenderTarget();
  try{
    renderer.setScissor(0,0,1,1);renderer.setScissorTest(true);
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
    renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);renderer.setRenderTarget(target);
  }
}
