import { AddEquation, CustomBlending, FrontSide, MeshPhysicalMaterial, OneFactor, OneMinusSrcAlphaFactor, type Texture } from 'three';

/** A single visible interface over an already rendered dial or tape.
 * The background supplies transmission without a second render target.
 */
export function createThinGlass({roughness,ior=1.5,absorption=.01,envMap=null,envMapIntensity=1}:{
  roughness:number;ior?:number;absorption?:number;envMap?:Texture|null;envMapIntensity?:number;
}) {
  const material=new MeshPhysicalMaterial({
    color:0x000000,metalness:0,roughness,ior,specularIntensity:1,
    clearcoat:0,transmission:0,transparent:true,opacity:1,depthWrite:false,
    side:FrontSide,forceSinglePass:true,envMap,envMapIntensity,
    blending:CustomBlending,blendEquation:AddEquation,blendSrc:OneFactor,blendDst:OneMinusSrcAlphaFactor,
    premultipliedAlpha:true,
  });
  material.userData.thinGlass=true;
  material.onBeforeCompile=shader=>{
    shader.uniforms.thinGlassAbsorption={value:absorption};
    shader.fragmentShader='uniform float thinGlassAbsorption;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      float glassFacing=clamp(abs(dot(normal,normalize(vViewPosition))),0.,1.);
      float glassF0=pow((ior-1.)/(ior+1.),2.);
      float glassFresnel=glassF0+(1.-glassF0)*pow(1.-glassFacing,5.);
      float glassPath=inversesqrt(1.-(1.-glassFacing*glassFacing)/(ior*ior));
      float glassOpacity=1.-(1.-glassFresnel)*exp(-thinGlassAbsorption*glassPath);
      // Area lights in this room are bounce proxies. The captured room holds
      // the real reflected surfaces, without floating white cards over dials.
      // The beauty pass targets an sRGB framebuffer. Unpremultiply before
      // tone/output conversion, then Three's final premultiplication weights
      // reflection in that output space. Passing F*linearRGB directly would
      // encode a small reflectance into a much larger additive sRGB value.
      gl_FragColor=vec4(reflectedLight.indirectSpecular/max(glassOpacity,.00001),glassOpacity);
    `);
  };
  material.customProgramCacheKey=()=> 'room-thin-glass-v2-output-premultiplied';
  return material;
}
