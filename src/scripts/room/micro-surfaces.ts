import { Matrix4, Mesh, MeshPhysicalMaterial, Vector3, type MeshStandardMaterial, type Object3D } from 'three';

export type MicroSurface = 'abs'|'abs-controls'|'rubber'|'painted-metal'|'spun-metal'|'satin-turned'|'satin-brushed'|'varnished-wood'|'glaze'|'linen'|'paper'|'paper-edge'|'plaster';
const finishes=new WeakMap<MeshStandardMaterial,{kind:MicroSurface;frame?:Object3D}>();

const field = `
  varying vec3 microWorld;
  uniform mat4 microFrameInverse;
  uniform mat4 microFrameWorld;
  uniform vec3 microFrameCenter;
  float microHash(vec3 p) {
    p=fract(p*.1031);p+=dot(p,p.yzx+33.33);
    return fract((p.x+p.y)*p.z);
  }
  float microNoise(vec3 p) {
    vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(mix(microHash(i),microHash(i+vec3(1,0,0)),f.x),
      mix(microHash(i+vec3(0,1,0)),microHash(i+vec3(1,1,0)),f.x),f.y),
      mix(mix(microHash(i+vec3(0,0,1)),microHash(i+vec3(1,0,1)),f.x),
      mix(microHash(i+vec3(0,1,1)),microHash(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  float microFilter(vec3 p) {
    return 1.-smoothstep(.30,1.15,max(length(dFdx(p)),length(dFdy(p))));
  }
  float microWave(float phase) {
    return sin(phase)*(1.-smoothstep(.65,3.1,fwidth(phase)));
  }
  vec3 microBump(vec3 n,vec3 viewPosition,float height) {
    vec3 dx=dFdx(viewPosition),dy=dFdy(viewPosition);
    vec3 r1=cross(dy,n),r2=cross(n,dx);
    float determinant=dot(dx,r1);
    vec3 gradient=dFdx(height)*r1+dFdy(height)*r2;
    return normalize(max(abs(determinant),1.e-12)*n-sign(determinant)*gradient);
  }
`;

const surface: Record<MicroSurface,{setup:string;roughness:string;physical?:string;finish?:string}> = {
  abs: {
    setup:`vec3 microCell=microWorld*1150.;
      float microGrain=(microNoise(microCell)-.5)*microFilter(microCell);
      float microRelief=microGrain*.000012;
      float microVariation=microNoise(microWorld*37.)-.5;`,
    roughness:'roughnessFactor=clamp(roughnessFactor+.035*microGrain+.018*microVariation,.28,.96);',
  },
  'abs-controls': {
    setup:`vec3 microCell=microWorld*1700.;
      float microGrain=(microNoise(microCell)-.5)*microFilter(microCell);
      float microRelief=microGrain*.000005;`,
    roughness:'roughnessFactor=clamp(roughnessFactor+.018*microGrain,.25,.90);',
  },
  'painted-metal': {
    setup:`vec3 microCell=microWorld*850.;
      float microGrain=(microNoise(microCell)-.5)*microFilter(microCell);
      float microRelief=microGrain*.000008;`,
    roughness:'roughnessFactor=clamp(roughnessFactor+.026*microGrain,.27,.93);',
  },
  rubber: {
    setup:`vec3 microCell=microWorld*1450.;
      float microGrain=(microNoise(microCell)-.5)*microFilter(microCell);
      float microRelief=microGrain*.000006;`,
    roughness:'roughnessFactor=clamp(roughnessFactor+.018*microGrain,.68,.98);',
  },
  'satin-turned': {
    setup:`vec3 microLocal=(microFrameInverse*vec4(microWorld,1.)).xyz-microFrameCenter;
      float microRadius=length(microLocal.xz);
      float microTool=microWave(microRadius*14959.97+microNoise(microLocal*83.)*.3);
      vec3 microCutCell=vec3(microRadius*1800.,microLocal.y*32.,1.7);
      float microCut=(microNoise(microCutCell)-.5)*microFilter(microCutCell);
      vec3 microFeedCell=vec3(microRadius*620.,microLocal.y*17.,3.2);
      float microFeed=(microNoise(microFeedCell)-.5)*microFilter(microFeedCell);
      float microRelief=microTool*.0000025+microCut*.000003+microFeed*.000003;
      vec3 microToolAxis=normalize(vec3(microLocal.x,0.,microLocal.z)+vec3(.000001,0.,0.));`,
    roughness:'roughnessFactor=clamp(roughnessFactor+.018*microTool+.025*microCut+.055*microFeed,.23,.65);',
    physical:`
      #ifdef USE_ANISOTROPY
        vec3 microDirection=normalize(mat3(viewMatrix)*mat3(microFrameWorld)*microToolAxis);
        vec3 microTangent=microDirection-normal*dot(normal,microDirection);
        material.anisotropyT=length(microTangent)>.0001?normalize(microTangent):tbn[0];
        material.anisotropyB=normalize(cross(normal,material.anisotropyT));
      #endif`,
  },
  'satin-brushed': {
    setup:`vec3 microLocal=(microFrameInverse*vec4(microWorld,1.)).xyz-microFrameCenter;
      vec3 microCutCell=microLocal*vec3(3100.,180.,52.);
      float microCut=(microNoise(microCutCell)-.5)*microFilter(microCutCell);
      float microLine=microWave(microLocal.x*19634.95+microNoise(microLocal*vec3(270.,1.,21.))*1.1);
      vec3 microFeedCell=microLocal*vec3(850.,20.,30.);
      float microFeed=(microNoise(microFeedCell)-.5)*microFilter(microFeedCell);
      float microRelief=microCut*.000008+microLine*.000002+microFeed*.000004;`,
    roughness:'roughnessFactor=clamp(roughnessFactor+.045*microCut+.012*microLine+.035*microFeed,.24,.68);',
    physical:`
      #ifdef USE_ANISOTROPY
        vec3 microDirection=normalize(mat3(viewMatrix)*mat3(microFrameWorld)*vec3(1.,0.,0.));
        vec3 microTangent=microDirection-normal*dot(normal,microDirection);
        material.anisotropyT=length(microTangent)>.0001?normalize(microTangent):tbn[0];
        material.anisotropyB=normalize(cross(normal,material.anisotropyT));
      #endif`,
  },
  'spun-metal': {
    // The lathe's axis is local Y in the delivered glTF, including its tilt.
    // Working in that frame keeps the tool marks circular around the shade.
    setup:`vec3 microLocal=(microFrameInverse*vec4(microWorld,1.)).xyz;
      float microRadius=length(microLocal.xz);
      float microTravel=microLocal.y+microRadius*.48;
      float microTurning=microWave(microTravel*8975.98);
      float microPass=microWave(microTravel*2094.40+microNoise(microLocal*31.)*.45);
      float microRelief=microTurning*.000004+microPass*.000006;`,
    roughness:'roughnessFactor=clamp(roughnessFactor+.014*microTurning+.012*microPass,.18,.65);',
  },
  'varnished-wood': {
    // The finish fills most wood pores. Very shallow, elongated rub marks
    // modulate its gloss, rather than etching black scratches into the grain.
    setup:`vec3 microRub=microWorld*vec3(5.,90.,245.);
      float microRubbed=(microNoise(microRub)-.5)*microFilter(microRub);
      float microRelief=microRubbed*.000008;`,
    roughness:'roughnessFactor=clamp(roughnessFactor+.024*microRubbed,.29,.83);',
    physical:`
      #ifdef USE_CLEARCOAT
        material.clearcoatRoughness=clamp(material.clearcoatRoughness+.018*microRubbed,.22,.38);
      #endif`,
  },
  glaze: {
    setup:`vec3 microCell=microWorld*680.;
      float microGlaze=(microNoise(microCell)-.5)*microFilter(microCell);
      float microRelief=microGlaze*.000003;`,
    roughness:'roughnessFactor=clamp(roughnessFactor+.012*microGlaze,.15,.86);',
  },
  linen: {
    // Four large atlas charts describe the front/back of two sewn panels.
    // Restore physical metres before choosing yarn spacing: the narrow cloth
    // is over four metres tall, so equal UV frequencies produce giant ribs.
    setup:`vec2 microPanel=vec2((fract(vMapUv.x*4.)-.048)/.904,(vMapUv.y-.05)/.935);
      float microBody=smoothstep(.042,.057,vMapUv.y);
      vec2 microCloth=microPanel*vec2(mix(.64,.72,step(.5,vMapUv.x)),4.293);
      vec2 microThread=microCloth/vec2(.00115,.00135);
      vec2 microThreadFilter=1.-smoothstep(vec2(.28),vec2(1.15),fwidth(microThread));
      vec2 microPhase=microThread*6.283185;
      // Alternating over/under yarns have rounded crowns, not random grit.
      float microCross=.5+.5*sin(microPhase.x*.5)*sin(microPhase.y*.5);
      vec2 microCrown=.5+.5*cos(microPhase);
      float microYarn=dot(microCrown-.5,microThreadFilter*vec2(.58,.42));
      float microInterlace=(microCross-.5)*min(microThreadFilter.x,microThreadFilter.y);
      vec3 microSlubCell=vec3(microCloth.x*205.,microCloth.y*13.,1.7);
      float microSlub=(microNoise(microSlubCell)-.5)*microFilter(microSlubCell);
      // Small yarn groups survive at the distance where individual threads
      // integrate away. They cross rather than becoming long vertical ribs.
      vec2 microBundle=microCloth/vec2(.0040,.0048);
      // Irregular spun yarns vary slightly along each thread family. These
      // fields shift spacing and crown width, never the pigment or brightness.
      vec2 microSpacing=vec2(microNoise(vec3(microBundle.x*.43,4.2,1.7)),
        microNoise(vec3(7.1,microBundle.y*.39,2.6)))-.5;
      vec2 microWidthVariation=vec2(microNoise(vec3(microBundle.x*.71,2.3,6.4)),
        microNoise(vec3(3.6,microBundle.y*.67,8.2)))-.5;
      vec2 microBundlePhase=microBundle*6.283185+vec2(
        .65*sin(microBundle.y*.31)+.26*sin(microBundle.y*.73),
        .55*sin(microBundle.x*.47)+.22*sin(microBundle.x*1.21))+microSpacing*3.2;
      microBundlePhase+=.34*microWidthVariation*sin(microBundlePhase);
      vec2 microBundleFilter=1.-smoothstep(vec2(.28),vec2(1.15),fwidth(microBundle));
      vec2 microBundleStrength=vec2(microNoise(vec3(microBundle*vec2(.47,.09),2.1)),
        microNoise(vec3(microBundle*vec2(.08,.51),8.7)));
      vec2 microBundleCrown=cos(microBundlePhase)*microBundleFilter*mix(vec2(.55),vec2(1.),microBundleStrength);
      float microBundleCross=sin(microBundlePhase.x*.5)*sin(microBundlePhase.y*.5);
      float microBundled=dot(microBundleCrown,vec2(.72,.28))*(.90+.10*microBundleCross);
      // Cavities belong to individual crossings, not a visible 5 mm grid.
      float microYarnCavity=(1.-microCrown.x)*(1.-microCrown.y)
        *min(microThreadFilter.x,microThreadFilter.y);
      float microSlubCavity=max(0.,-microBundleCrown.x)*(.35+.65*microBundleStrength.x)
        +.35*max(0.,-microBundleCrown.y)*microBundleStrength.y;
      // Sparse tension puckers end within a few centimetres. Their placement
      // varies, but they change the local normal, never stain the fabric.
      vec2 microWrinkleCell=microCloth/vec2(.075,.22),microWrinkleId=floor(microWrinkleCell);
      float microWrinkleSeed=microHash(vec3(microWrinkleId,8.3));
      vec2 microWrinkleUV=fract(microWrinkleCell);
      vec2 microWrinkleOffset=(microWrinkleUV-vec2(.38+.24*microWrinkleSeed,.5))*vec2(.075,.22);
      float microAcross=microWrinkleOffset.x+microWrinkleOffset.y*(microWrinkleSeed-.5)*.32;
      float microWidth=.004+.003*microWrinkleSeed,microLength=.027+.037*microWrinkleSeed;
      vec2 microTaper=smoothstep(vec2(.02),vec2(.20),microWrinkleUV)*(1.-smoothstep(vec2(.80),vec2(.98),microWrinkleUV));
      float microPucker=exp(-pow(microAcross/microWidth,2.)-pow(microWrinkleOffset.y/microLength,2.));
      microPucker*=sin(microAcross/microWidth*2.)*microTaper.x*microTaper.y*smoothstep(.28,.65,microWrinkleSeed);
      float microHem=smoothstep(.008,.030,min(microPanel.x,1.-microPanel.x));
      microHem*=smoothstep(.010,.025,microPanel.y)*(1.-smoothstep(.955,.990,microPanel.y));
      float microRelief=microBody*(microYarn*.000065+microInterlace*.000022+microSlub*.000025
        +microBundled*.000090+microPucker*.00075*mix(.45,1.,microHem));`,
    roughness:'roughnessFactor=clamp(roughnessFactor+microBody*(.035*microYarn+.022*microBundled+.025*microSlub),.68,.98);',
    finish:`
      vec3 microWindowDirection=normalize((viewMatrix*vec4(0.,.2,-1.,0.)).xyz);
      vec3 microLampVector=(viewMatrix*vec4(lampPosition,1.)).xyz+vViewPosition;
      vec3 microLampDirection=normalize(microLampVector);
      float microWarmWeight=lampLevel*clamp(5./(1.+dot(microLampVector,microLampVector)),.15,.75);
      float microWarmRelief=dot(normal-microLinenBaseNormal,microLampDirection);
      float microCoolRelief=abs(dot(normal,microWindowDirection))-abs(dot(microLinenBaseNormal,microWindowDirection));
      // Static irradiance resolves folds but cannot respond to new yarn
      // normals. Reorient only its microscopic diffuse response, with a
      // bounded change and the same real lamp/window directions as the room.
      float microShade=clamp(1.20*microWarmWeight*microWarmRelief+.85*(1.-microWarmWeight)*microCoolRelief,-.08,.08);
      // Light loses a small fraction between crossing yarns, even under
      // frontal soft light where a normal alone has no first-order response.
      // This is confined to woven gaps, not the drape's large fold shadows.
      float microGrazing=mix(1.-abs(dot(microLinenBaseNormal,microWindowDirection)),
        1.-abs(dot(microLinenBaseNormal,microLampDirection)),microWarmWeight);
      float microYarnShadow=(.09*microYarnCavity+.065*microSlubCavity)*(.65+.35*microGrazing);
      outgoingLight+=reflectedLight.indirectDiffuse*(microShade-microYarnShadow)*microBody;
      float microBacklight=pow(max(0.,dot(-nonPerturbedNormal,microWindowDirection)),2.);
      outgoingLight+=diffuseColor.rgb*vec3(.016,.021,.026)*microBacklight*microHem*microBody;`,
  },
  paper: {
    setup:`vec3 microCell=microWorld*vec3(850.,1250.,520.);
      float microFibre=(microNoise(microCell)-.5)*microFilter(microCell);
      float microRelief=microFibre*.000004;`,
    roughness:'roughnessFactor=clamp(roughnessFactor+.025*microFibre,.78,1.);',
  },
  'paper-edge': {
    // Book and memo blocks stack along local Y. Their front/back faces are
    // paper sides; their top faces and printed covers must stay unaffected.
    setup:`vec3 microLocal=(microFrameInverse*vec4(microWorld,1.)).xyz;
      vec3 microPaperNormal=normalize(cross(dFdx(microLocal),dFdy(microLocal)));
      float microPaperSide=1.-smoothstep(.10,.35,abs(microPaperNormal.y));
      float microEdgeDrift=microNoise(vec3(microLocal.xz*35.,1.4));
      float microLayer=microWave(microLocal.y*26179.94+microEdgeDrift*.18);
      float microCompression=microWave(microLocal.y*3926.99+microEdgeDrift*.5);
      float microRelief=microPaperSide*(microLayer*.000006+microCompression*.000012);
      diffuseColor.rgb*=1.+microPaperSide*(.016*microLayer+.020*microCompression);`,
    roughness:'roughnessFactor=clamp(roughnessFactor+microPaperSide*(.018*microLayer+.020*microCompression),.78,1.);',
  },
  plaster: {
    setup:`vec3 microCell=microWorld*480.;
      float microStipple=(microNoise(microCell)-.5)*microFilter(microCell);
      float microRoller=(microNoise(microWorld*84.)-.5);
      float microRelief=microStipple*.000030+microRoller*.000018;`,
    roughness:'roughnessFactor=clamp(roughnessFactor+.022*microStipple,.75,1.);',
  },
};

/** Add a finish at physical scale without changing authored geometry, albedo
 * or irradiance. Apply after the baked-light callback and before compiling.
 * The tilted shade and paper edges need their original object as a frame.
 * Give those objects a distinct material so batching retains that frame. */
export function applyMicroSurface(material:MeshStandardMaterial,kind:MicroSurface,frame?:Object3D) {
  finishes.set(material,{kind,frame});
  const previous=material.onBeforeCompile,cacheKey=material.customProgramCacheKey();
  const inverse=new Matrix4(),world=new Matrix4(),center=new Vector3();
  if(frame){
    frame.updateWorldMatrix(true,false);world.copy(frame.matrixWorld);inverse.copy(world).invert();
    if(frame instanceof Mesh){frame.geometry.computeBoundingBox();frame.geometry.boundingBox?.getCenter(center);}
    // The memo block follows the raised paper. The same coordinates must move
    // with it instead of leaving horizontal layer lines fixed in the room.
    const beforeRender=material.onBeforeRender;
    material.onBeforeRender=(...args)=>{
      frame.updateWorldMatrix(true,false);world.copy(frame.matrixWorld);inverse.copy(world).invert();
      beforeRender.call(material,...args);
    };
  }
  if(material instanceof MeshPhysicalMaterial){
    if(kind==='varnished-wood'){material.clearcoat=.16;material.clearcoatRoughness=.29;material.ior=1.48;}
    // Glaze already reflects through the main dielectric lobe. A second
    // strong clearcoat would make the cup and pot look like moulded plastic.
    if(kind==='glaze'){material.clearcoat=.07;material.clearcoatRoughness=.22;material.ior=1.5;}
    if(kind==='linen'){material.sheen=.42;material.sheenRoughness=.82;material.specularIntensity=.16;}
    if(kind==='satin-turned'||kind==='satin-brushed')material.anisotropy=.40;
  }
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);
    shader.uniforms.microFrameInverse={value:inverse};
    shader.uniforms.microFrameWorld={value:world};
    shader.uniforms.microFrameCenter={value:center};
    shader.vertexShader='varying vec3 microWorld;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',
      'microWorld=(modelMatrix*vec4(transformed,1.)).xyz;\n#include <project_vertex>');
    shader.fragmentShader=field+'\n'+shader.fragmentShader;
    const detail=surface[kind];
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\n'+detail.setup);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\n'+detail.roughness);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',
      '#include <normal_fragment_maps>\n'+(kind==='linen'?'vec3 microLinenBaseNormal=normal;\n':'')+
      'normal=microBump(normal,-vViewPosition,microRelief);');
    if(['varnished-wood','painted-metal','glaze'].includes(kind)){
      // The finish fills the coarse substrate pores. Its own shallow rubs
      // and orange peel still bend the coating's reflection by a little.
      shader.fragmentShader=shader.fragmentShader.replace('#include <clearcoat_normal_fragment_maps>',
        `#include <clearcoat_normal_fragment_maps>
        #ifdef USE_CLEARCOAT
          clearcoatNormal=microBump(clearcoatNormal,-vViewPosition,microRelief*.7);
        #endif`);
    }
    if(detail.physical)shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',
      '#include <lights_physical_fragment>\n'+detail.physical);
    if(detail.finish)shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',
      detail.finish+'\n#include <opaque_fragment>');
  };
  material.customProgramCacheKey=()=>cacheKey+'/micro-surface-'+(kind==='linen'?'v4':'v1')+'/'+kind;
  material.needsUpdate=true;
}

/** Moving props deliberately drop baked-light callbacks when cloned. Carry
 * only their surface finish into that new, normally lit material. */
export function inheritMicroSurface(source:MeshStandardMaterial,target:MeshStandardMaterial) {
  const finish=finishes.get(source);
  if(finish)applyMicroSurface(target,finish.kind,finish.frame);
}
