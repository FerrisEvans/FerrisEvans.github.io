import {
  Box3, CanvasTexture, Color, DoubleSide, Group, LatheGeometry,
  Matrix3, Matrix4, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, Quaternion,
  ShaderChunk, ShaderMaterial, SRGBColorSpace, Vector2, Vector3, Vector4,
} from 'three';
import { createObjectContact } from './object-contact';
import { cityProjection } from './weather';

type Resources = Set<{ dispose(): void }>;
type CameraPose = { position: Vector3; quaternion?: Quaternion };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };

/** Initialize after createProps and before either static batching pass.
 * Owns Mug_* transforms and the pager's feedback; do not also props.nudge them.
 */
export function createDeskDetails(root: Object3D, resources: Resources) {
  const own = <T extends { dispose(): void }>(resource: T): T => { resources.add(resource); return resource; };
  const dynamic = (object: Object3D) => {
    object.userData.roomDynamic = true;
    object.userData.keepIndependent = true;
  };
  root.updateMatrixWorld(true);
  const body = root.getObjectByName('Mug_Body');
  const opening = root.getObjectByName('Mug_Opening');
  const cup = new Group(); cup.name = 'Coffee_Sip'; dynamic(cup);
  const cupBounds = body ? new Box3().setFromObject(body) : new Box3(new Vector3(-.835, .685, .675), new Vector3(-.565, 1.005, .945));
  const center = cupBounds.getCenter(new Vector3());
  const dimensions = cupBounds.getSize(new Vector3());
  const radius = Math.min(dimensions.x, dimensions.z) / 2;
  const height = dimensions.y;
  let inner = radius - .014;
  const mugParts: Object3D[] = [];
  root.traverse(object => { if (object.name.startsWith('Mug_')) mugParts.push(object); });
  cup.position.copy(root.worldToLocal(center.clone())); root.add(cup);
  mugParts.forEach(object => { cup.attach(object); dynamic(object); });
  const cupRest = { position: cup.position.clone(), quaternion: cup.quaternion.clone() };
  // The receiver bake omits the cup; this cue follows its distance from the desk.
  const syncCupContact = createObjectContact(root, body ?? cup, root.getObjectByName('Desk_Top'), resources, true);

  // The source cylinder has a solid top. A real interior prevents a lowered
  // coffee disk revealing a ceramic lid, and the outside silhouette is retained.
  const roomReflection = body instanceof Mesh && body.material instanceof MeshStandardMaterial ? body.material.envMap : null;
  const authoredInterior = body?.userData.ceramicInterior === true;
  if(authoredInterior&&body instanceof Mesh){
    // Intersect the authored hollow shell at the coffee level. Its rounded
    // lip and thinner upper wall differ from the old solid-cylinder fallback;
    // guessing the bore from the outside radius left a visible dry gap.
    const positions=body.geometry.attributes.position,index=body.geometry.index;
    const count=index?.count??positions.count,levelY=center.y+height/2-.014;
    let innerSection=Infinity,outerSection=0;
    const a=new Vector3(),b=new Vector3(),point=new Vector3();
    for(let triangle=0;triangle<count;triangle+=3)for(let edge=0;edge<3;edge++){
      const ia=index?.getX(triangle+edge)??triangle+edge;
      const ib=index?.getX(triangle+(edge+1)%3)??triangle+(edge+1)%3;
      a.fromBufferAttribute(positions,ia).applyMatrix4(body.matrixWorld);
      b.fromBufferAttribute(positions,ib).applyMatrix4(body.matrixWorld);
      if((a.y-levelY)*(b.y-levelY)>0||Math.abs(b.y-a.y)<1e-8)continue;
      point.copy(a).lerp(b,(levelY-a.y)/(b.y-a.y));
      const r=Math.hypot(point.x-center.x,point.z-center.z);
      innerSection=Math.min(innerSection,r);outerSection=Math.max(outerSection,r);
    }
    if(outerSection-innerSection>.004&&innerSection>radius*.7)inner=innerSection;
  }
  // Current Blender cups already carry a hollow shell and baked stoneware.
  // Retain the runtime shell only as a compatibility path for older models.
  if (!authoredInterior) {
    const ceramic = own(new MeshStandardMaterial({ color: '#d6d0bd', roughness: .23, envMap: roomReflection, envMapIntensity: .7 }));
    for (const object of mugParts) if (object instanceof Mesh && object !== opening) object.material = ceramic;
  }
  if (body instanceof Mesh && !authoredInterior) {
    const profile = [
      [0, -height / 2], [radius - .005, -height / 2], [radius, -height / 2 + .007],
      [radius, height / 2 - .006], [radius - .004, height / 2],
      [inner + .003, height / 2], [inner, height / 2 - .005],
      [inner, -height / 2 + .018], [0, -height / 2 + .018],
    ].map(([x, y]) => new Vector2(x, y));
    const geometry = own(new LatheGeometry(profile, 64));
    body.updateWorldMatrix(true, false);
    geometry.applyMatrix4(new Matrix4().makeTranslation(center.x, center.y, center.z));
    geometry.applyMatrix4(body.matrixWorld.clone().invert());
    body.geometry = geometry;
  }
  if (opening) opening.visible = false;
  const city=root.getObjectByName('City_Backdrop');
  const cityMap=city instanceof Mesh&&city.material instanceof MeshBasicMaterial?city.material.map:null;
  const cityU=new Vector3(),cityV=new Vector3();let cityZ=-12.068;
  const timbers:Vector4[]=[];
  if(city instanceof Mesh&&cityMap){
    const positions=city.geometry.attributes.position,uv=city.geometry.attributes.uv;
    const indices=[0,1,2].map(i=>city.geometry.index?.getX(i)??i);
    const points=indices.map(i=>city.localToWorld(new Vector3().fromBufferAttribute(positions,i)));
    const transform=new Matrix3().set(...points.flatMap(p=>[p.x,p.y,1]) as [number,number,number,number,number,number,number,number,number]).invert();
    cityU.set(...indices.map(i=>uv.getX(i)) as [number,number,number]).applyMatrix3(transform);
    cityV.set(...indices.map(i=>uv.getY(i)) as [number,number,number]).applyMatrix3(transform);
    cityZ=points[0].z;
    root.traverse(object=>{if(/^Window_(Upright|Rail)(?:[_.]|$)/.test(object.name)){
      const b=new Box3().setFromObject(object);timbers.push(new Vector4(b.min.x,b.min.y,b.max.x,b.max.y));
    }});
  }
  const television=root.getObjectByName('CRT_Case');
  const tvBounds=television?new Box3().setFromObject(television):new Box3(new Vector3(),new Vector3());
  cup.updateWorldMatrix(true,true);
  const liquidCupInverse={value:cup.matrixWorld.clone().invert()};
  const bulb=root.getObjectByName('Lamp_Bulb');
  const liquidBulbCenter={value:bulb?.getWorldPosition(new Vector3())??new Vector3()};
  const liquidBulbRadiance={value:new Color()};
  const coffeeMaterial = own(new MeshPhysicalMaterial({ color: '#201007', roughness: .18, ior:1.33, specularIntensity:1, envMap: roomReflection, envMapIntensity:.85 }));
  // The rim shields most analytic room cards. Retain the captured room's
  // Fresnel reflection without a broad unoccluded rectangle whitening coffee.
  coffeeMaterial.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{liquidCity:{value:cityMap},liquidCityU:{value:cityU},liquidCityV:{value:cityV},liquidCityZ:{value:cityZ},
      liquidTimbers:{value:timbers},liquidTVMin:{value:tvBounds.min},liquidTVMax:{value:tvBounds.max},liquidCupInverse,liquidBulbCenter,liquidBulbRadiance});
    shader.vertexShader='varying vec3 liquidWorldPosition;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nliquidWorldPosition=(modelMatrix*vec4(position,1.)).xyz;');
    shader.fragmentShader=`varying vec3 liquidWorldPosition;
      uniform sampler2D liquidCity; uniform vec3 liquidCityU,liquidCityV,liquidTVMin,liquidTVMax,liquidBulbCenter,liquidBulbRadiance;
      uniform float liquidCityZ;
      uniform mat4 liquidCupInverse;
      ${timbers.length?`uniform vec4 liquidTimbers[${timbers.length}];`:''}\n`+shader.fragmentShader;
    // The shared probe is above and behind the cup. Project reflection rays
    // to the actual room/window envelope before sampling it: otherwise a
    // low liquid surface reflects the probe's sky instead of the lower sash.
    shader.fragmentShader=shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>',
      ShaderChunk.envmap_physical_pars_fragment.replace(
        'vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );',`
        vec3 liquidBaseRay=reflectVec,liquidRadiance=vec3(0.);
        vec3 liquidTangent=normalize(cross(vec3(0.,1.,0.),liquidBaseRay));
        vec3 liquidBitangent=cross(liquidBaseRay,liquidTangent);
        // Integrate the liquid's narrow reflection lobe before applying
        // Fresnel. Rim/window silhouettes then soften consistently in motion.
        float liquidSpread=.008+roughness*roughness*.9;
        for(int liquidSample=0;liquidSample<5;liquidSample++){
        vec2 liquidOffset=liquidSample==1?vec2(1.,0.):liquidSample==2?vec2(-1.,0.):liquidSample==3?vec2(0.,1.):liquidSample==4?vec2(0.,-1.):vec2(0.);
        reflectVec=normalize(liquidBaseRay+(liquidTangent*liquidOffset.x+liquidBitangent*liquidOffset.y)*liquidSpread);
        vec3 liquidRay=reflectVec;
        vec3 safeRay=mix(vec3(-1.),vec3(1.),step(vec3(0.),reflectVec))*max(abs(reflectVec),vec3(.0001));
        vec3 roomExit=(mix(vec3(-3.525,0.,-1.04),vec3(4.125,4.40,3.),step(vec3(0.),reflectVec))-liquidWorldPosition)/safeRay;
        float roomDistance=max(0.,min(roomExit.x,min(roomExit.y,roomExit.z)));
        reflectVec=normalize(liquidWorldPosition+reflectVec*roomDistance-vec3(-.6,1.5,.9));
        vec4 envMapColor=textureCubeUV(envMap,envMapRotation*reflectVec,roughness);
        ${cityMap?`
        // The probe cannot recover a window hidden behind the CRT from its
        // capture point. Trace the actual exterior plate for visible window
        // rays, with its existing UV mapping, joinery and TV occlusion.
        if(liquidRay.z<-.001){
          float toGlass=(-.89-liquidWorldPosition.z)/liquidRay.z;
          vec3 glassPoint=liquidWorldPosition+liquidRay*toGlass;
          float edgeAA=max(max(fwidth(glassPoint.x),fwidth(glassPoint.y)),.025);
          float aperture=smoothstep(-edgeAA,edgeAA,min(min(glassPoint.x+2.30,1.80-glassPoint.x),min(glassPoint.y-1.15,3.875-glassPoint.y)));
          ${timbers.length?`for(int i=0;i<${timbers.length};i++){vec4 b=liquidTimbers[i];float inside=min(min(glassPoint.x-b.x,b.z-glassPoint.x),min(glassPoint.y-b.y,b.w-glassPoint.y));aperture*=1.-smoothstep(-edgeAA,edgeAA,inside);}`:''}
          vec3 cupPoint=(liquidCupInverse*vec4(liquidWorldPosition,1.)).xyz;
          vec3 cupRay=(liquidCupInverse*vec4(liquidRay,0.)).xyz;
          float rimDistance=(${height/2}-cupPoint.y)/max(cupRay.y,.0001);
          float rimRadius=length((cupPoint+cupRay*rimDistance).xz);
          aperture*=1.-smoothstep(${inner-.001},${inner+.001},rimRadius);
          vec3 tvA=(liquidTVMin-liquidWorldPosition)/safeRay,tvB=(liquidTVMax-liquidWorldPosition)/safeRay;
          vec3 tvNear=min(tvA,tvB),tvFar=max(tvA,tvB);
          float tvEnter=max(tvNear.x,max(tvNear.y,tvNear.z)),tvExit=min(tvFar.x,min(tvFar.y,tvFar.z));
          if(tvEnter>0.&&tvEnter<toGlass&&tvExit>=tvEnter)aperture=0.;
          vec3 platePoint=liquidWorldPosition+liquidRay*((liquidCityZ-liquidWorldPosition.z)/liquidRay.z);
          vec3 plane=vec3(platePoint.xy,1.);
          vec2 photoUv=vec2(dot(liquidCityU,plane),dot(liquidCityV,plane))*vec2(${cityProjection.scale.join(',')})+vec2(${cityProjection.offset.join(',')});
          vec2 photo=clamp(photoUv,vec2(.002),vec2(.998));
          vec2 spread=vec2(.0014,.0032);
          vec3 exterior=(texture2D(liquidCity,photo-spread).rgb+texture2D(liquidCity,photo+spread).rgb+texture2D(liquidCity,photo+vec2(spread.x,-spread.y)).rgb+texture2D(liquidCity,photo+vec2(-spread.x,spread.y)).rgb)*.25;
          exterior=mix(exterior,vec3(.012,.021,.037),smoothstep(0.,.18,-photoUv.y));
          envMapColor.rgb=mix(envMapColor.rgb,exterior*.68,aperture);
        }`:''}
        // A near liquid surface sees the illuminated ceramic interior, not
        // whatever a remote room probe sees behind that rim. Trace the actual
        // cylindrical opening in the moving cup's local coordinates.
        vec3 localOrigin=(liquidCupInverse*vec4(liquidWorldPosition,1.)).xyz;
        vec3 localRay=(liquidCupInverse*vec4(liquidRay,0.)).xyz;
        float wallA=max(dot(localRay.xz,localRay.xz),.00001);
        float wallB=dot(localOrigin.xz,localRay.xz);
        float wallC=dot(localOrigin.xz,localOrigin.xz)-${inner*inner};
        float wallT=(-wallB+sqrt(max(0.,wallB*wallB-wallA*wallC)))/wallA;
        vec3 wallPoint=localOrigin+localRay*wallT;
        float wallCover=1.-smoothstep(${height/2-.004},${height/2+.004},wallPoint.y);
        // White glaze near the mouth receives the room's broad illumination;
        // the deeper bore is sheltered. Keep that pale return concentrated
        // near the lip instead of tinting the whole reflected wall brown.
        float lipLight=exp(-max(0.,${height/2}-wallPoint.y)/.008);
        vec3 ceramicReturn=mix(vec3(.030,.024,.017),vec3(.90,.82,.68),lipLight);
        vec3 localBulb=(liquidCupInverse*vec4(liquidBulbCenter,1.)).xyz;
        vec3 wallInward=normalize(vec3(-wallPoint.x,0.,-wallPoint.z));
        float wallLampFacing=max(0.,dot(wallInward,normalize(localBulb-wallPoint)));
        // The far inner wall faces away from the lamp. A uniform bright
        // ceramic return made its reflection resemble an extra solid ring.
        ceramicReturn*=.32+.68*wallLampFacing*clamp(liquidBulbRadiance.r/1.65,0.,1.);
        // Only the actual finite bulb may produce a compact warm highlight.
        // It follows lamp power; the broad diffuse-light cards never appear.
        vec3 toBulb=liquidBulbCenter-liquidWorldPosition;
        float bulbAlong=dot(toBulb,liquidRay);
        float bulbMiss=length(toBulb-liquidRay*bulbAlong);
        float bulbSpread=max(.007,bulbAlong*roughness*roughness);
        float bulbCover=(1.-smoothstep(.042-bulbSpread,.042+bulbSpread,bulbMiss))*step(0.,bulbAlong);
        envMapColor.rgb=mix(envMapColor.rgb,liquidBulbRadiance,bulbCover);
        envMapColor.rgb=mix(envMapColor.rgb,ceramicReturn,wallCover);
        liquidRadiance+=envMapColor.rgb*(liquidSample==0?.4:.15);
        }
        vec4 envMapColor=vec4(liquidRadiance,1.);`));
    // Broad analytic cards are diffuse-light approximations, not additional
    // luminous rectangles above the cup. Their unoccluded specular response
    // produced the blue disk and abrupt brown/black partitions across views.
    // The room probe and actual window projection retain the real reflection.
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',
      '#include <lights_fragment_end>\nreflectedLight.directSpecular=vec3(0.);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      vec3 liquidLocal=(liquidCupInverse*vec4(liquidWorldPosition,1.)).xyz;
      float liquidHeight=sin(liquidLocal.x*84.+liquidLocal.z*43.)*.000028
        +sin(liquidLocal.x*51.-liquidLocal.z*67.)*.000018;
      vec2 liquidGradient=vec2(dFdx(liquidHeight),dFdy(liquidHeight));
      vec3 liquidDx=dFdx(-vViewPosition),liquidDy=dFdy(-vViewPosition);
      vec3 liquidR1=cross(liquidDy,normal),liquidR2=cross(normal,liquidDx);
      float liquidDet=dot(liquidDx,liquidR1);
      normal=normalize(abs(liquidDet)*normal-sign(liquidDet)*(liquidGradient.x*liquidR1+liquidGradient.y*liquidR2));`);
  };
  coffeeMaterial.customProgramCacheKey=()=> 'coffee-window-projection-v8-'+timbers.length;
  // Resolve the capillary curve itself. Three widely spaced profile rings
  // smeared the last sloping normal across the whole central disk and made
  // the rim reflection look like a second solid ceramic ring.
  const meniscusRadius=inner-.0002,meniscusWidth=.007,meniscusRise=.0026;
  const meniscus=Array.from({length:17},(_,i)=>{
    const t=1-i/16;
    return new Vector2(meniscusRadius-meniscusWidth*(1-t),meniscusRise*t*t*t);
  });
  meniscus.push(new Vector2(0,0));
  const liquidGeometry=own(new LatheGeometry(meniscus,128));
  const liquidPositions=liquidGeometry.attributes.position,liquidNormals=liquidGeometry.attributes.normal;
  for(let i=0;i<liquidPositions.count;i++){
    const x=liquidPositions.getX(i),z=liquidPositions.getZ(i),r=Math.hypot(x,z);
    const t=clamp((r-meniscusRadius+meniscusWidth)/meniscusWidth);
    const slope=3*meniscusRise*t*t/meniscusWidth;
    const normal=new Vector3(r>0?-x*slope/r:0,1,r>0?-z*slope/r:0).normalize();
    liquidNormals.setXYZ(i,normal.x,normal.y,normal.z);
  }
  const liquid = new Mesh(liquidGeometry, coffeeMaterial);
  liquid.name = 'Coffee_Liquid'; dynamic(liquid); cup.add(liquid);
  const fullY = height / 2 - .016, drain = Math.max(0, height - .045);
  liquid.position.y = fullY;

  const steamMaterial = own(new ShaderMaterial({
    transparent: true, depthWrite: false, side: DoubleSide,
    uniforms: { time: { value: 0 }, strength: { value: 0 } },
    vertexShader: `uniform float time; varying vec2 vUv;
      void main(){vUv=uv;vec3 p=position;
        p.x+=sin(uv.y*7.0-time*1.4)*.012*uv.y;
        p.z+=sin(uv.y*5.0-time*.9)*.008*uv.y;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`,
    fragmentShader: `uniform float time,strength; varying vec2 vUv;
      void main(){float bend=.5+sin(vUv.y*8.0-time*1.4)*.10;
        float wisps=exp(-pow((vUv.x-bend)*5.5,2.0));
        float ends=smoothstep(0.0,.16,vUv.y)*(1.0-smoothstep(.58,1.0,vUv.y));
        float drift=.65+.35*sin(vUv.y*15.0-time*1.8);
        gl_FragColor=vec4(.72,.75,.77,wisps*ends*drift*strength);}`,
  }));
  const steam = new Group(); steam.name = 'Coffee_Steam'; dynamic(steam); cup.add(steam);
  const steamGeometry = own(new PlaneGeometry(.052, .22, 4, 12));
  for (let i = 0; i < 3; i++) {
    const wisp = new Mesh(steamGeometry, steamMaterial); dynamic(wisp);
    wisp.position.set((i - 1) * .025, height / 2 + .105 + (i % 2) * .025, (i - 1) * .016);
    wisp.rotation.y = (i - 1) * .55;
    steam.add(wisp);
  }
  steam.visible = false;

  // Only LCD pixels receive emission. Printed case labels retain their own ink.
  const pager = root.getObjectByName('Desk_Pager_Motion') ?? root.getObjectByName('Desk_Pager');
  const lcd = root.getObjectByName('Desk_Pager_LCD');
  const oldDigits = root.getObjectByName('Desk_Pager_Print_Digits');
  const pagerRest = pager ? { position: pager.position.clone(), quaternion: pager.quaternion.clone() } : null;
  const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 128;
  const context = canvas.getContext('2d');
  const lcdMap = own(new CanvasTexture(canvas)); lcdMap.colorSpace = SRGBColorSpace;
  const lcdMaterial = own(new MeshStandardMaterial({ map: lcdMap, roughness: .66, emissive: new Color('#d4efb6'), emissiveMap: lcdMap, emissiveIntensity: 0 }));
  if (lcd instanceof Mesh) {
    lcd.geometry = own(new PlaneGeometry(.130, .064).rotateX(-Math.PI / 2).translate(0, .0018, 0));
    lcd.material = lcdMaterial; dynamic(lcd);
  }
  if (oldDigits) { oldDigits.visible = false; dynamic(oldDigits); }
  let pages = 0, sips = 0, level = 1, targetLevel = 1, sipStart: number | null = null;
  let pagerStart = -Infinity, pagerLight = 0, lastTime = 0, motionEnabled = false;
  const sipTravel = new Vector3(0, .24, .16), tiltAxis = new Vector3(1, 0, 0);
  const tilt = new Quaternion();
  function paintPager() {
    if (!context) return;
    context.fillStyle = '#889a70'; context.fillRect(0, 0, 320, 128);
    context.fillStyle = '#26372a';
    context.font = 'bold 46px monospace'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(pages ? 'NEW MSG' : 'HELLO', 160, 64);
    lcdMap.needsUpdate = true;
  }
  paintPager();
  function sip(time: number, camera?: CameraPose, reduced = false) {
    if (!body || sipStart !== null || sips >= 7) return false;
    sips++; targetLevel = Math.max(0, 1 - sips / 7);
    const direction = camera ? root.worldToLocal(camera.position.clone()).sub(cupRest.position) : new Vector3(0, 0, 1);
    direction.y = 0;
    if (direction.lengthSq() < .001) direction.set(0, 0, 1);
    direction.normalize(); sipTravel.copy(direction).multiplyScalar(.18); sipTravel.y = .24;
    tiltAxis.crossVectors(new Vector3(0, 1, 0), direction).normalize();
    if (reduced) { level = targetLevel; liquid.position.y = fullY - drain * (1 - level); liquid.visible = level > .001; steam.visible = false; }
    else sipStart = time;
    return true;
  }
  function page(time: number) {
    if (!pager) return false;
    pages++; pagerStart = time; pagerLight = 1;
    paintPager(); lcdMaterial.emissiveIntensity = 1.15;
    return true;
  }
  function update(time: number, motion: boolean, dt: number) {
    lastTime = time; motionEnabled = motion;
    cup.position.copy(cupRest.position); cup.quaternion.copy(cupRest.quaternion);
    let amount = 0;
    if (sipStart !== null) {
      const age = Math.max(0, time - sipStart);
      amount = age < .7 ? smooth(age / .7) : age < 1.15 ? 1 : 1 - smooth((age - 1.15) / .85);
      if (!motion || age >= 2) { sipStart = null; amount = 0; level = targetLevel; }
      else {
        cup.position.addScaledVector(sipTravel, amount);
        tilt.setFromAxisAngle(tiltAxis, .18 * smooth((age - .4) / .4) * amount);
        cup.quaternion.multiply(tilt);
      }
      if (age > .5) level += (targetLevel - level) * (1 - Math.exp(-Math.max(0, dt) * 7));
    }
    liquid.position.y = fullY - drain * (1 - level);
    liquid.visible = level > .001;
    // A small counter-rotation keeps the coffee surface level while sipping.
    liquid.quaternion.copy(cup.quaternion).invert();
    steam.quaternion.copy(cup.quaternion).invert();
    steam.visible = motion && level > .015 && Boolean(body);
    steamMaterial.uniforms.time.value = time;
    steamMaterial.uniforms.strength.value = motion ? .075 * level * (1 - amount * .75) : 0;
    const age = Math.max(0, time - pagerStart);
    pagerLight = age < 1 ? 1 : Math.exp(-(age - 1) * 1.25);
    if (pagerLight < .002) pagerLight = 0;
    lcdMaterial.emissiveIntensity = pagerLight * 1.15;
    if (pager && pagerRest) {
      pager.position.copy(pagerRest.position); pager.quaternion.copy(pagerRest.quaternion);
      if (motion && age < .9) {
        const decay = Math.exp(-age * 5);
        pager.position.x += Math.sin(age * 91) * .004 * decay;
        pager.position.z += Math.sin(age * 73) * .0017 * decay;
        pager.rotateY(Math.sin(age * 85) * .012 * decay);
      }
    }
    root.updateMatrixWorld(true);
    liquidCupInverse.value.copy(cup.matrixWorld).invert();
    if(bulb instanceof Mesh&&bulb.material instanceof MeshStandardMaterial){
      liquidBulbCenter.value.copy(bulb.getWorldPosition(liquidBulbCenter.value));
      liquidBulbRadiance.value.copy(bulb.material.emissive).multiplyScalar(bulb.material.emissiveIntensity);
    }
    syncCupContact();
  }
  function reset() {
    sips = pages = 0; level = targetLevel = 1; sipStart = null; pagerStart = -Infinity; pagerLight = 0;
    cup.position.copy(cupRest.position); cup.quaternion.copy(cupRest.quaternion);
    liquid.position.y = fullY; liquid.visible = true; liquid.quaternion.identity(); steam.quaternion.identity(); steam.visible = false;
    steamMaterial.uniforms.strength.value = 0; lcdMaterial.emissiveIntensity = 0;
    if (pager && pagerRest) { pager.position.copy(pagerRest.position); pager.quaternion.copy(pagerRest.quaternion); }
    paintPager();
    syncCupContact();
  }
  return {
    sip, page, update, reset,
    get moving() { return sipStart !== null || pagerLight > .002 || (motionEnabled && lastTime - pagerStart < .9); },
    getstate: () => ({ sips, level, empty: sips >= 7, sipping: sipStart !== null, steam: steam.visible ? level : 0, pages, pagerLit: pagerLight }),
  };
}
