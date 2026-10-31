import { AdditiveBlending, Color, DoubleSide, HalfFloatType, Material, Mesh, MeshBasicMaterial, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, WebGLRenderTarget, type Camera, type WebGLRenderer } from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { warmScene } from './warmup';

/** A small, occluded halo from actual light sources. The beauty pass stays on
 * the MSAA default framebuffer, so adding glow cannot remove edge antialiasing
 * or silently change the room's existing AgX/color-space pipeline. */
export function createRoomGlow(renderer:WebGLRenderer,scene:Scene,camera:Camera) {
  const mask=new WebGLRenderTarget(1,1,{type:HalfFloatType,depthBuffer:true});
  mask.texture.generateMipmaps=false;
  const bloom=new UnrealBloomPass(new Vector2(1,1),.3,.12,.72);
  const black=new MeshBasicMaterial({color:0x000000,side:DoubleSide});
  const cutouts=new Map<Material,MeshBasicMaterial>();
  const saved=new Map<Mesh,Material|Material[]>();
  const background=new Color(0,0,0);
  const composite=new ShaderMaterial({
    uniforms:{glowMap:{value:bloom.renderTargetsHorizontal[0].texture}},
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`uniform sampler2D glowMap; varying vec2 vUv;
      void main(){vec3 light=texture2D(glowMap,vUv).rgb;
        gl_FragColor=vec4(sRGBTransferOETF(vec4(light,1.)).rgb*.22,1.);}`,
    transparent:true,blending:AdditiveBlending,depthTest:false,depthWrite:false,toneMapped:false,
  });
  const quad=new FullScreenQuad(composite);
  let width=1,height=1;
  const emitter=(mesh:Mesh)=>mesh.name==='CRT_Screen'||mesh.name==='City_Backdrop'||mesh.name==='VCR_Display'
    ||mesh.userData.surface_role==='led'||mesh.userData.surface_role==='lamp-bulb'
    ||(Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(m=>m.userData.roomGlow);
  function occluder(source:Material) {
    const alpha=source as MeshBasicMaterial;
    if(!alpha.alphaTest)return black;
    let material=cutouts.get(source);
    if(!material){material=new MeshBasicMaterial({color:0,side:source.side,alphaMap:alpha.alphaMap,map:alpha.map,alphaTest:alpha.alphaTest});cutouts.set(source,material);}
    return material;
  }
  function maskMaterials(targetScene=scene) {
    targetScene.traverse(object=>{
      if(!(object instanceof Mesh)||emitter(object))return;
      saved.set(object,object.material);
      object.material=Array.isArray(object.material)?object.material.map(occluder):occluder(object.material);
    });
  }
  function restoreMaterials(){for(const [mesh,material]of saved)mesh.material=material;saved.clear();}
  async function compile(targetScene=scene){
    const oldTarget=renderer.getRenderTarget();
    maskMaterials(targetScene);
    try{renderer.setRenderTarget(mask);await renderer.compileAsync(targetScene,camera);}
    finally{restoreMaterials();renderer.setRenderTarget(oldTarget);}
    const passScene=new Scene(),geometry=new PlaneGeometry(2,2),passCamera=new OrthographicCamera(-1,1,1,-1,0,1);
    const passes=[bloom.materialHighPassFilter,...bloom.separableBlurMaterials,bloom.compositeMaterial,bloom.blendMaterial];
    try{
      for(const material of passes)passScene.add(new Mesh(geometry,material));
      renderer.setRenderTarget(mask);await renderer.compileAsync(passScene,passCamera);
      passScene.clear();passScene.add(new Mesh(geometry,composite));renderer.setRenderTarget(null);
      await renderer.compileAsync(passScene,passCamera);
    }finally{geometry.dispose();renderer.setRenderTarget(oldTarget);}
  }
  async function warmup(step:(completed:number,total:number)=>Promise<void>){
    const oldTarget=renderer.getRenderTarget();
    maskMaterials();
    try{renderer.setRenderTarget(mask);await warmScene(renderer,scene,camera,step);}
    finally{restoreMaterials();renderer.setRenderTarget(oldTarget);}
    // These passes allocate their half-float render targets on first use.
    // Submit them before reveal, separately from the scene pipelines.
    bloom.render(renderer,mask,mask,0,false);renderer.setRenderTarget(oldTarget);
    await step(1,1);
    quad.render(renderer);
  }
  function render(targetScene=scene) {
    renderer.setRenderTarget(null);renderer.render(targetScene,camera);
    const oldBackground=targetScene.background,oldAutoClear=renderer.autoClear;
    targetScene.background=background;maskMaterials(targetScene);
    try {
      renderer.setRenderTarget(mask);renderer.clear();renderer.render(targetScene,camera);
      bloom.render(renderer,mask,mask,0,false);
    }finally{
      restoreMaterials();
      targetScene.background=oldBackground;renderer.autoClear=false;renderer.setRenderTarget(null);
    }
    quad.render(renderer);renderer.autoClear=oldAutoClear;
  }
  return {
    render,compile,warmup,
    resize(w:number,h:number,dpr:number){width=Math.max(1,Math.round(w*dpr*.5));height=Math.max(1,Math.round(h*dpr*.5));mask.setSize(width,height);bloom.setSize(width,height);},
    // RGBA16F mask+blur chains and a depth attachment. This excludes the
    // browser-owned beauty framebuffer, reported separately by the caller.
    get estimatedBytes(){return width*height*12+[bloom.renderTargetBright,...bloom.renderTargetsHorizontal,...bloom.renderTargetsVertical].reduce((sum,target)=>sum+target.width*target.height*8,0);},
    dispose(){mask.dispose();bloom.dispose();bloom.materialHighPassFilter.dispose();black.dispose();for(const material of cutouts.values())material.dispose();composite.dispose();quad.dispose();},
  };
}
