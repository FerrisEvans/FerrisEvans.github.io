import {
  CanvasTexture, Color, DoubleSide, HemisphereLight, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial,
  NoColorSpace, Object3D, RectAreaLight, ShaderChunk, SRGBColorSpace,
  Texture, TextureLoader, Vector2, Vector3, WebGLRenderer, type WebGLRenderTarget,
} from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

import { createCRT, type Program } from './crt';
import { separateTubeLayers } from './phosphor';
import { createVFD } from './vfd';
import { applyMicroSurface, type MicroSurface } from './micro-surfaces';
import { createThinGlass } from './thin-glass';
import type { RoomAssets } from './assets';
import type { RoomContent } from './content';
import type { Tape } from './tapes';
import { createWeather } from './weather';
import { textureBytes } from './texture-budget';
import { homeFrameRate } from './home-program';
import { yieldForLoading, type LoadingReporter } from './loading';
import { createLoadingUploadQueue } from './loading-upload';
import {createHomeVideo, type HomeFilmManifest} from './home-video';
import {captureRoomReflection, loadRoomReflection, type ReflectionAsset} from './reflection';

type Resource = { dispose(): void };
type LightMap = { file: string; preview?:string; range: number; peak: number };
type Atlas = { albedo: string; orm: string; normal: string; entry?:{orm?:string;normal?:string}; opacity?:string; cutout?:boolean; alphaTest?:number; leafDensity?:'orm-r'; room: LightMap; tv: LightMap; lampOff?: LightMap };
type Manifest = { reflection?:ReflectionAsset; buildId?:string; city?: string; homeFilm?:string; quality: string; atlases: Record<string, Atlas> };
export type Channel = 'blue' | 'white' | 'amber' | 'off';
const root = '/room/materials/';

/** Cycles diffuse illumination (without colour), combined in linear light. */
export async function applyMaterialStudy(scene: Object3D, resources: Set<Resource>, renderer: WebGLRenderer, assets?: RoomAssets, loading:{progress?:LoadingReporter;signal?:AbortSignal;captureReflection?:(target:WebGLRenderTarget)=>Promise<void>}={}) {
  const manifest: Manifest = assets
    ? JSON.parse(new TextDecoder().decode(await assets.read(root + 'manifest.json')))
    : await fetch(root + 'manifest.json').then((response) => {
      if (!response.ok) throw new Error(`Material manifest: ${response.status}`);
      return response.json();
    });
  const loader = new TextureLoader();
  const filmManifest:HomeFilmManifest|undefined=manifest.homeFilm&&assets?JSON.parse(new TextDecoder().decode(await assets.read(manifest.homeFilm))):undefined;
  const anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
  const lightFile=(light:LightMap)=>assets&&light.preview?light.preview:light.file;
  const surfaceFile=(atlas:Atlas,kind:'normal'|'orm')=>assets&&atlas.entry?.[kind]?atlas.entry[kind]!:atlas[kind];
  const initialTextures=new Set(Object.values(manifest.atlases).flatMap(atlas=>[
    `${root+atlas.albedo}/true/0`,`${root+surfaceFile(atlas,'orm')}/false/0`,`${root+surfaceFile(atlas,'normal')}/false/0`,
    `${root+lightFile(atlas.room)}/false/1`,`${root+lightFile(atlas.tv)}/false/1`,
    ...(atlas.opacity?[`${root+atlas.opacity}/false/0`]:[]),
  ]));
  initialTextures.add(`${manifest.city??'/room/city-night-v1.png'}/true/0`);
  if(filmManifest)initialTextures.add(`${filmManifest.poster}/true/0`);
  const textureTotal=initialTextures.size+1+(filmManifest?1:0);let preparedTextures=0;
  const textureCache=new Map<string,Promise<Texture>>();
  const uploadQueue=createLoadingUploadQueue({signal:loading.signal});
  const textureProgress=()=>loading.progress?.({stage:'textures',completed:preparedTextures,total:textureTotal,detail:`${preparedTextures}/${textureTotal}`});
  textureProgress();
  async function texture(path: string, color = false, channel = 0) {
    const key=`${path}/${color}/${channel}`;
    const pending=textureCache.get(key);if(pending)return pending;
    const request=loadTexture(path,color,channel,key);textureCache.set(key,request);
    try{return await request;}catch(error){textureCache.delete(key);throw error;}
  }
  async function loadTexture(path:string,color:boolean,channel:number,key:string) {
    const info={url:path,atlas:path.split('/').pop()?.replace(/-(albedo|orm|normal|room|tv|lamp-off)\.webp$/,'')};
    const bytes=assets?await assets.read(path):undefined;
    const endDecode=assets?.timing?.start('texture.decode',info);
    let objectUrl: string | undefined;
    if (bytes) objectUrl = URL.createObjectURL(new Blob([bytes], { type: path.endsWith('.webp') ? 'image/webp' : 'image/png' }));
    let map: Texture;
    try { map = await loader.loadAsync(objectUrl ?? path); }
    catch(error){endDecode?.('error',{error:String(error)});throw error;}
    finally { if (objectUrl) URL.revokeObjectURL(objectUrl); }
    if(assets?.isDisposed){endDecode?.('aborted');map.dispose();throw new DOMException('Aborted','AbortError');}
    resources.add(map);
    try{
    map.flipY = false; // glTF UV convention
    map.colorSpace = color ? SRGBColorSpace : NoColorSpace;
    map.channel = channel;
    map.anisotropy = anisotropy;
    if(map.image instanceof HTMLImageElement)await map.image.decode();
    const image=map.image as {width:number;height:number};
    endDecode?.('ok',{...info,width:image.width,height:image.height,decodedBytes:image.width*image.height*4,textureBytes:textureBytes(image.width,image.height,4,map.generateMipmaps)});
    const endQueue=assets?.timing?.start('texture.upload-queue',info);
    await uploadQueue(()=>{
      endQueue?.();const endUpload=assets?.timing?.start('texture.upload-submit',info);
      try{renderer.initTexture(map);endUpload?.();}
      catch(error){endUpload?.('error',{error:String(error)});throw error;}
      if(initialTextures.has(key)){preparedTextures++;textureProgress();}
    }).catch(error=>{endQueue?.(loading.signal?.aborted?'aborted':'error',{error:String(error)});throw error;});
    return map;
    }catch(error){endDecode?.(loading.signal?.aborted?'aborted':'error',{error:String(error)});resources.delete(map);map.dispose();throw error;}
  }
  const tvColor = { value: new Color() };
  const lampLevel = {value:1};
  scene.updateMatrixWorld(true);
  const lampPosition={value:scene.getObjectByName('Lamp_Bulb')?.getWorldPosition(new Vector3())??new Vector3(-1.475,1.8,-.486)};
  const materials = new Map<string, MeshStandardMaterial>();
  let lampReady=!assets;
  const lampMaps:{atlas:Atlas;map:{value:Texture};range:{value:number}}[]=[];
  const detailMix={value:0};
  const tvBases:{value:Texture}[]=[];
  const detailMaps:{file:string;preview:string;channel:number;base:Texture;detail?:{value:Texture};slots?:('normalMap'|'roughnessMap'|'metalnessMap')[];full?:Texture}[]=[];
  let detailStatus:'base'|'loading'|'blending'|'full'|'failed'='base',detailPromise:Promise<void>|undefined;
  const deferredMaps=new Map<string,Promise<Texture>>();
  let preparingLamp:Promise<void>|undefined;
  function prepareLampOff():Promise<void>{
    if(lampReady)return Promise.resolve();
    if(preparingLamp)return preparingLamp;
    preparingLamp=Promise.all(lampMaps.map(async item=>{
      if(!item.atlas.lampOff)return {item,map:item.map.value,range:item.range.value};
      const path=root+item.atlas.lampOff.file;
      let pending=deferredMaps.get(path);
      if(!pending){pending=texture(path,false,1).catch(error=>{deferredMaps.delete(path);throw error;});deferredMaps.set(path,pending);}
      return {item,map:await pending,range:item.atlas.lampOff.range};
    })).then(loaded=>{for(const {item,map,range} of loaded){item.map.value=map;item.range.value=range;}lampReady=true;})
      .finally(()=>{preparingLamp=undefined;});
    return preparingLamp;
  }
  // Start media buffering alongside atlas preparation, not behind its upload queue.
  // Observe failure immediately; rethrow at the join so no rejected task is orphaned.
  const filmTask=filmManifest&&assets?texture(filmManifest.poster,true)
    .then(poster=>createHomeVideo(filmManifest,assets,poster,loading.signal))
    .then(film=>{resources.add(film);return {film};},error=>({error})):undefined;
  await Promise.all(Object.entries(manifest.atlases).map(async ([name, atlas]) => {
    const [map, orm, normalMap, lightMap, tvMap, offMap, alphaMap] = await Promise.all([
      texture(root + atlas.albedo, true), texture(root + surfaceFile(atlas,'orm')),
      texture(root + surfaceFile(atlas,'normal')), texture(root + lightFile(atlas.room), false, 1),
      texture(root + lightFile(atlas.tv), false, 1),
      assets ? Promise.resolve(null) : texture(root + (atlas.lampOff?.file ?? atlas.room.file), false, 1),
      atlas.opacity ? texture(root+atlas.opacity) : Promise.resolve(null),
    ]);
    const materialOptions = {
      map, roughnessMap: orm, metalnessMap: orm, roughness: 1, metalness: 1,
      normalMap, lightMap, lightMapIntensity: Math.PI,
      alphaMap,alphaTest:alphaMap||atlas.cutout ? atlas.alphaTest??.45 : 0,
    };
    // Cloth gets a broad grazing fibre response instead of a stronger GGX
    // highlight. Soften atlas micro-normals while retaining the real folds.
    // Keep the authored roughness/irradiance and other room finishes intact.
    const material = name === 'curtains'
      ? new MeshPhysicalMaterial({...materialOptions, normalScale:new Vector2(.55,.55), sheen:.34, sheenColor:0xf0e2c9, sheenRoughness:.75, specularIntensity:.18})
      : name==='foliage' ? new MeshPhysicalMaterial({...materialOptions,side:DoubleSide,roughness:.90,normalScale:new Vector2(.85,.85),ior:1.46,sheen:.025,sheenColor:0x66743c,sheenRoughness:.7,specularIntensity:.75})
      : name==='ceramic' ? new MeshPhysicalMaterial({...materialOptions,ior:1.5,specularIntensity:.85})
      : ['equipment','tape','paper','lamp','desk'].includes(name) ? new MeshPhysicalMaterial({...materialOptions,specularIntensity:.5})
      : new MeshStandardMaterial(materialOptions);
    const offUniform={value:offMap??lightMap},offRange={value:offMap?(atlas.lampOff?.range??atlas.room.range):atlas.room.range};
    lampMaps.push({atlas,map:offUniform,range:offRange});
    const roomDetail={value:lightMap},tvDetail={value:tvMap},tvBase={value:tvMap};
    tvBases.push(tvBase);
    if(assets){
      if(atlas.room.preview)detailMaps.push({file:atlas.room.file,preview:atlas.room.preview,channel:1,base:lightMap,detail:roomDetail});
      if(atlas.tv.preview)detailMaps.push({file:atlas.tv.file,preview:atlas.tv.preview,channel:1,base:tvMap,detail:tvDetail});
      if(atlas.entry?.normal)detailMaps.push({file:atlas.normal,preview:atlas.entry.normal,channel:0,base:normalMap,slots:['normalMap']});
      if(atlas.entry?.orm)detailMaps.push({file:atlas.orm,preview:atlas.entry.orm,channel:0,base:orm,slots:['roughnessMap','metalnessMap']});
    }
    material.name = 'Baked ' + name;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.tvIrradiance = tvBase;
      shader.uniforms.tvDetailMap=tvDetail;
      shader.uniforms.roomDetailMap=roomDetail;shader.uniforms.roomDetailMix=detailMix;
      shader.uniforms.tvColor = tvColor;
      shader.uniforms.lampLevel = lampLevel;
      shader.uniforms.lampPosition = lampPosition;
      shader.uniforms.lampOffMap = offUniform;
      shader.uniforms.lampOffRange = offRange;
      shader.uniforms.roomRange = { value: atlas.room.range };
      shader.uniforms.tvRange = { value: atlas.tv.range };
      shader.fragmentShader = `uniform sampler2D tvIrradiance, tvDetailMap, lampOffMap, roomDetailMap;
        uniform float roomDetailMix;
        uniform float lampLevel, lampOffRange;
        uniform vec3 tvColor, lampPosition;
        uniform float roomRange;
        uniform float tvRange;\n` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>',ShaderChunk.lights_fragment_begin.replace('getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal )','vec3(0.0)'));
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>',
        ShaderChunk.lights_fragment_maps.replace('iblIrradiance += getIBLIrradiance( geometryNormal );', '').replace(
          'vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;',
          `vec4 tvTexel = texture2D(tvIrradiance, vLightMapUv);
           vec4 offTexel = texture2D(lampOffMap, vLightMapUv);
           vec3 baseLight = lightMapTexel.rgb * lightMapTexel.a;
           if(roomDetailMix>0.){vec4 detailTexel=texture2D(roomDetailMap,vLightMapUv);baseLight=mix(baseLight,detailTexel.rgb*detailTexel.a,roomDetailMix);}
           baseLight *= roomRange;
           vec3 roomLight = mix(offTexel.rgb * offTexel.a * lampOffRange, baseLight, lampLevel);
           ${name==='foliage'?`float leafPeak=max(roomLight.r,max(roomLight.g,roomLight.b));
           // Preserve the dim foliage response. A logarithmic shoulder keeps
           // the small leaf under the bulb coloured, with no flat bright cap.
           float leafResponse=leafPeak<=.75?leafPeak/(1.+leafPeak/3.):.6+.28*log(1.+(leafPeak-.75)/.4375);
           roomLight*=leafResponse/max(leafPeak,.0001)*mix(1.,.82,leafBack);`:''}
           vec3 tvLight = tvTexel.rgb * tvTexel.a;
           if(roomDetailMix>0.){vec4 tvDetail=texture2D(tvDetailMap,vLightMapUv);tvLight=mix(tvLight,tvDetail.rgb*tvDetail.a,roomDetailMix);}
           tvLight *= tvRange;
           vec3 lightMapIrradiance = (roomLight + tvLight * tvColor * 3.0) * lightMapIntensity;`,
        ));
      // Analytic area lights add view-dependent highlights only. Their diffuse
      // component is already present in the bake and must not be counted twice.
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>',
        '#include <lights_fragment_end>\nreflectedLight.directDiffuse = vec3(0.0);');
      if(name==='ceramic'||name==='equipment'){
        // Bright and dim objects share an RGBM range. Filtering the encoded
        // multiplier first draws contour lines across smooth glaze and ABS.
        // Decode neighbouring texels before filtering their irradiance.
        shader.fragmentShader=`vec3 sampleSmoothRGBM(sampler2D map,vec2 uv){
          ivec2 size=textureSize(map,0);vec2 xy=uv*vec2(size)-.5;
          ivec2 p=ivec2(floor(xy));vec2 f=fract(xy);
          vec4 a=texelFetch(map,clamp(p,ivec2(0),size-1),0);
          vec4 b=texelFetch(map,clamp(p+ivec2(1,0),ivec2(0),size-1),0);
          vec4 c=texelFetch(map,clamp(p+ivec2(0,1),ivec2(0),size-1),0);
          vec4 d=texelFetch(map,clamp(p+ivec2(1,1),ivec2(0),size-1),0);
          return mix(mix(a.rgb*a.a,b.rgb*b.a,f.x),mix(c.rgb*c.a,d.rgb*d.a,f.x),f.y);
        }\n`+shader.fragmentShader;
        for(const [encoded,map]of [
          ['lightMapTexel.rgb * lightMapTexel.a','lightMap'],
          ['detailTexel.rgb*detailTexel.a','roomDetailMap'],
          ['offTexel.rgb * offTexel.a','lampOffMap'],
          ['tvTexel.rgb * tvTexel.a','tvIrradiance'],
          ['tvDetail.rgb*tvDetail.a','tvDetailMap'],
        ])shader.fragmentShader=shader.fragmentShader.replace(encoded,`sampleSmoothRGBM(${map},vLightMapUv)`);
      }
      if(name==='foliage'){
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
          float leafBack=gl_FrontFacing?0.:1.;
          // Pale scanned veins remain visible, but should not read as opaque
          // yellow paint under the nearby warm bulb. Preserve their hue.
          float leafReflectance=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
          diffuseColor.rgb*=mix(1.02,.91,smoothstep(.06,.22,leafReflectance));
          diffuseColor.rgb*=mix(vec3(1.),vec3(.94,.97,.92),leafBack);`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
          float leafDensity=${atlas.leafDensity==='orm-r'?'texelRoughness.r':'.55'};
          roughnessFactor=clamp(roughnessFactor+leafBack*(.10+.04*leafDensity),.0,1.);`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',`#include <lights_physical_fragment>
          material.specularColor*=mix(1.,.55,leafBack);
          material.specularColorBlended*=mix(1.,.55,leafBack);
          material.specularF90*=mix(1.,.55,leafBack);`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`vec3 leafToLamp=(viewMatrix*vec4(lampPosition,1.)).xyz+vViewPosition;
          float lampThrough=pow(max(0.,dot(-nonPerturbedNormal,normalize(leafToLamp))),2.)/(1.+dot(leafToLamp,leafToLamp));
          float windowThrough=pow(max(0.,dot(-nonPerturbedNormal,normalize((viewMatrix*vec4(0.,.3,-1.,0.)).xyz))),2.);
          // Scanned vein relief supplies an optical-density proxy in ORM.R.
          // Veins transmit less than the lamina without recolouring variegation.
          float leafTransmittance=exp(-3.2*leafDensity);
          outgoingLight+=diffuseColor.rgb*leafTransmittance*(vec3(.16,.14,.045)*lampThrough*lampLevel+vec3(.016,.023,.012)*windowThrough);
          #include <opaque_fragment>`);
      }
    };
    material.customProgramCacheKey = () => name==='foliage'?`room-rgbm-foliage-v8-${atlas.leafDensity??'legacy'}`:name==='curtains'?'room-rgbm-linen-v2':['ceramic','equipment'].includes(name)?'room-rgbm-decode-first-v1':'room-rgbm-v2';
    resources.add(material);
    materials.set(name, material);
  }));

  if(!detailMaps.length)detailStatus='full';
  function prepareDetails():Promise<void>{
    if(detailStatus==='full'||detailStatus==='blending')return Promise.resolve();
    if(detailPromise)return detailPromise;
    detailStatus='loading';const end=assets?.timing?.start('details.prepare');
    detailPromise=(async()=>{
      const entries=detailMaps.map(item=>({item,path:root+item.file}));
      // A failed optional download must not leave three new, unused GPU maps.
      // Keep completed response buffers so an
      // explicit retry requests only missing data, then decode as one batch.
      const fetched=await Promise.allSettled(entries.map(({path})=>assets!.read(path,'low')));
      const fetchFailure=fetched.find(result=>result.status==='rejected');
      if(fetchFailure?.status==='rejected')throw fetchFailure.reason;
      const loaded=await Promise.allSettled(entries.map(async({item,path})=>({item,path,map:await texture(path,false,item.channel)})));
      for(const {path}of entries)assets!.release(path);
      const decodeFailure=loaded.find(result=>result.status==='rejected');
      if(decodeFailure?.status==='rejected'){
        for(const result of loaded)if(result.status==='fulfilled'){
          const {map,path,item}=result.value;resources.delete(map);map.dispose();textureCache.delete(`${path}/false/${item.channel}`);
        }
        throw decodeFailure.reason;
      }
      for(const result of loaded)if(result.status==='fulfilled'){const {item,map}=result.value;item.full=map;if(item.detail)item.detail.value=map;}
      detailStatus='blending';end?.();
    })().catch(error=>{detailStatus='failed';end?.('error');throw error;})
      .finally(()=>{detailPromise=undefined;});
    return detailPromise;
  }
  function updateDetails(dt:number,motion=true){
    if(detailStatus!=='blending')return;
    detailMix.value=motion?Math.min(1,detailMix.value+dt/.6):1;
    if(detailMix.value<1)return;
    for(const item of detailMaps){
      // Profiles and moving objects may share this bake. Rebind every material
      // before releasing the entry map, including the lamp-off placeholder.
      for(const resource of resources)if(resource instanceof MeshStandardMaterial){
        if(resource.lightMap===item.base)resource.lightMap=item.full!;
        for(const slot of item.slots??[])if(resource[slot]===item.base)resource[slot]=item.full!;
      }
      for(const uniform of tvBases)if(uniform.value===item.base)uniform.value=item.full!;
      for(const lamp of lampMaps)if(lamp.map.value===item.base)lamp.map.value=item.full!;
      item.base.dispose();resources.delete(item.base);textureCache.delete(`${root+item.preview}/false/${item.channel}`);
    }
    detailMaps.length=0;detailMix.value=0;
    detailStatus='full';assets?.timing?.mark('details.visible');
  }

  const endWeather=assets?.timing?.start('weather.prepare');
  const weather = createWeather(await texture(manifest.city ?? '/room/city-night-v1.png', true),scene);
  endWeather?.();
  const city = weather.material;
  resources.add(city); resources.add(weather.inspectionMaterial); resources.add(weather.depth);
  await yieldForLoading(loading.signal);renderer.initTexture(weather.depth);preparedTextures++;textureProgress();
  const crt = createCRT();
  const filmResult=await filmTask;
  if(filmResult&&'error'in filmResult)throw filmResult.error;
  const film=filmResult?.film;
  if(film){await yieldForLoading(loading.signal);renderer.initTexture(film.texture);preparedTextures++;textureProgress();}
  const screen = crt.material;
  resources.add(crt.map);
  resources.add(screen);
  resources.add(crt.glass);materials.set('crt-faceplate',crt.glass);
  const {material:readout,map:readoutMap,paint:paintReadout}=createVFD();
  resources.add(readoutMap);
  const led = new MeshBasicMaterial({ color: 0x7ccf66, toneMapped: false });
  const tvLed=led.clone();resources.add(tvLed);
  let tvPowered=true,lastHomeFrame=-1;
  resources.add(readout);
  resources.add(led);
  const printedMaterials = new Set<MeshStandardMaterial>();
  // Reuse the existing baked maps; only the existing paper jackets and hero
  // plastics receive a finish correction. No extra image or geometry download.
  const propBase=materials.get('props')!;
  const sleeveFinish=propBase.clone();sleeveFinish.name='Sleeve paper';
  sleeveFinish.onBeforeCompile=(shader,webgl)=>{
    propBase.onBeforeCompile(shader,webgl);
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      float pigment = dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(pigment)*vec3(1.08,1.0,.84),.28)*1.55;`);
  };
  sleeveFinish.customProgramCacheKey=()=> 'room-rgbm-sleeve-paper-v1';
  resources.add(sleeveFinish);materials.set('sleeve-finish',sleeveFinish);
  const caseFinish=propBase.clone();caseFinish.name='Hero plastic';caseFinish.roughness=.78;
  caseFinish.onBeforeCompile=propBase.onBeforeCompile;caseFinish.customProgramCacheKey=propBase.customProgramCacheKey;
  resources.add(caseFinish);materials.set('case-finish',caseFinish);
  const profiles=new Map<string,MeshStandardMaterial>();
  // The glass is reflective; its recessed rubber seat is deliberately matte.
  // Sharing the equipment finish made the seal read as a luminous green frame.
  const computerSeal=new MeshStandardMaterial({color:0x151a17,roughness:.80,metalness:0,envMapIntensity:.35});
  resources.add(computerSeal);materials.set('computer-seal',computerSeal);
  function surfaceProfile(base:MeshStandardMaterial,profile:string) {
    const key=base.name+'/'+profile;
    if(profiles.has(key))return profiles.get(key)!;
    let material=base.clone();
    material.onBeforeCompile=base.onBeforeCompile;material.customProgramCacheKey=base.customProgramCacheKey;
    if(profile==='instrument-glass'){
      material=createThinGlass({roughness:.08,ior:1.48,absorption:.008});
    }else if(profile==='tape-window'){
      material=createThinGlass({roughness:.10,ior:1.49,absorption:.025});
    }else if(material instanceof MeshPhysicalMaterial){
      // ORM already contains the authored finish. Another roughness factor
      // would turn satin ABS and enamel into much glossier surfaces.
      if(profile.startsWith('abs')||profile==='tape-shell'){
        const abs=profile.startsWith('abs');
        material.specularIntensity=abs?1:.45;material.ior=abs?1.53:1.48;
        // Submillimetre injection grain cannot survive a shared atlas at the
        // housing's texel density: its undersampled normals became centimetre
        // blotches. Keep a trace of the baked relief; the filtered, physical
        // scale micro-surface below supplies the fine mould texture.
        if(abs)material.normalScale.set(.16,.16);
        // Keep each authored grain/ORM, but distinguish graphite moulding,
        // fine control keys and the coarser ivory computer housing.
        if(profile==='abs-graphite')material.roughness=.91;
        if(profile==='abs-controls'){material.roughness=.86;material.normalScale.set(.10,.10);}
        if(profile==='abs-ivory'){material.roughness=1.05;material.normalScale.set(.12,.12);material.specularIntensity=.85;material.ior=1.49;}
      }
      if(profile==='satin-metal')material.specularIntensity=.75;
      // Painted steel reflects through its dielectric enamel coating. Keep
      // the baked ORM (including metallic=0) and add only the coating's lobe.
      if(profile==='painted-metal'){material.ior=1.5;material.specularIntensity=1;material.clearcoat=.2;material.clearcoatRoughness=.24;}
      if(profile==='pbt'){material.ior=1.5;material.specularIntensity=.72;material.roughness=1.12;material.normalScale.set(.12,.12);}
      if(profile==='paper'){material.specularIntensity=.2;material.sheen=.08;material.sheenRoughness=.85;}
      if(profile==='glazed-ceramic'){material.ior=1.5;material.clearcoat=.32;material.clearcoatRoughness=.14;}
      if(profile==='walnut-worktop'){
        material.normalScale.set(.45,.45);
        material.clearcoat=.16;material.clearcoatRoughness=.29;
        const bakedCompile=base.onBeforeCompile,bakedKey=base.customProgramCacheKey();
        // The source's dark, hairline pores overpower its broader walnut
        // figure. Compress only local luminance contrast; retain the source
        // colour, knots and joinery instead of blurring the whole surface.
        material.onBeforeCompile=(shader,webgl)=>{
          bakedCompile(shader,webgl);
          shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
            vec3 woodBroad=texture2D(map,vMapUv,2.).rgb;
            float woodLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
            float woodMean=dot(woodBroad,vec3(.2126,.7152,.0722));
            diffuseColor.rgb*=mix(1.,clamp(woodMean/max(woodLuma,.0001),.65,1.55),.60);`);
        };
        material.customProgramCacheKey=()=>bakedKey+'-walnut-worktop-v1';
      }
    }
    material.name=key;resources.add(material);profiles.set(key,material);return material;
  }
  // Capture the same luminous bulb seen in the room. A dark probe-only bulb
  // left glass and liquid without the real emitter in their reflected scene.
  const lampBulb=new MeshStandardMaterial({color:0xe7ddc5,roughness:.48,emissive:new Color(1,.62,.34),emissiveIntensity:1.65});
  resources.add(lampBulb);materials.set('lamp-bulb',lampBulb);
  for(const material of [city,led,tvLed,lampBulb])material.userData.roomGlow=true;
  function frontUv(object: Mesh) {
    const positions = object.geometry.attributes.position;
    const uv = object.geometry.attributes.uv;
    object.geometry.computeBoundingBox();
    const bounds = object.geometry.boundingBox!;
    for (let i = 0; i < positions.count; i++) {
      uv.setXY(i, (positions.getX(i) - bounds.min.x) / (bounds.max.x - bounds.min.x),
        1 - (positions.getY(i) - bounds.min.y) / (bounds.max.y - bounds.min.y));
    }
    uv.needsUpdate = true;
  }
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    // Register all original loader textures as well as replacement textures.
    for (const old of Array.isArray(object.material) ? object.material : [object.material]) {
      resources.add(old);
      for (const value of Object.values(old)) if (value instanceof Texture) resources.add(value);
    }
    const material = materials.get(object.userData.atlas);
    if (material) {
      if (!object.geometry.attributes.uv1) throw new Error(`Missing LightUV: ${object.name}`);
      object.material = material;
      if(typeof object.userData.surface_profile==='string'){
        let profile=object.userData.surface_profile;
        if(profile==='abs'){
          if(['CRT_Case','CRT_ControlPanel','VCR_Front'].includes(object.name))profile='abs-graphite';
          else if(/^(CRT_(Button|Power$|Slider_)|VCR_Key|Desk_Calculator_Key|Remote_Key)/.test(object.name))profile='abs-controls';
          else if(/^Computer_Key(?:[.]|$)/.test(object.name))profile='pbt';
          else if(['Computer_Base','Computer_Base_Fascia','Computer_Monitor','Computer_Keyboard','Computer_Mouse'].includes(object.name))profile='abs-ivory';
        }
        object.material=surfaceProfile(material,profile);
      }
      if(object.name==='Mug_Body'||object.name==='Mug_Handle')object.material=surfaceProfile(material,'glazed-ceramic');
      if(object.name==='Desk_Top'||object.name==='Desk_Return')object.material=surfaceProfile(material,'walnut-worktop');
      if(object.name==='Window_WallBelow'||/^Room_(LeftWall|RightWall|Ceiling)$/.test(object.name))object.material=surfaceProfile(material,'plaster');
    }
    if(object.userData.atlas==='props'&&object.name.startsWith('Label_VHS_'))object.material=sleeveFinish;
    if(object.userData.atlas==='props'&&['CRT_Case','CRT_ControlPanel','VCR_Body'].includes(object.name))object.material=caseFinish;
    if (object.name === 'City_Backdrop') object.material = city;
    if (object.name === 'CRT_Screen') {
      object.material = screen;
      // Refined glass carries its own regular ScreenUV; retain compatibility
      // with the first box-based study until a new bake finishes loading.
      if (!object.userData.screen_bulge_m) frontUv(object);
      separateTubeLayers(object,crt.glass,resources,.006);
    }
    if (object.name === 'VCR_Display') { object.material = readout; frontUv(object); }
    if (object.name === 'Computer_Recess'||object.name==='Computer_Screen') object.material=computerSeal;
    if (object.userData.surface_role === 'led') object.material = object.name==='CRT_PowerLED'?tvLed:led;
    if (object.userData.surface_role === 'lamp-bulb') object.material = lampBulb;
    if (object.userData.surface_role === 'print' && object.material instanceof MeshStandardMaterial) {
      printedMaterials.add(object.material);
    }
  });

  // Choose a finish on the final material, after all profile clones exist.
  // The delivered geometry and its baked illumination stay unchanged.
  const paperEdges=new Map<MeshStandardMaterial,Object3D>();
  for(const name of ['Desk_Book','Work_Notepad_Block']){
    const object=scene.getObjectByName(name);
    if(!(object instanceof Mesh)||!(object.material instanceof MeshStandardMaterial))continue;
    const source=object.material,edge=source.clone();
    edge.onBeforeCompile=source.onBeforeCompile;edge.customProgramCacheKey=source.customProgramCacheKey;
    edge.name='Paper edges '+name;object.material=edge;
    resources.add(edge);materials.set('paper-edge-'+name,edge);paperEdges.set(edge,object);
  }
  const finished=new Set<MeshStandardMaterial>();
  const detailFinishes=new Map<string,MeshStandardMaterial>();
  scene.traverse(object=>{
    if(!(object instanceof Mesh)||!(object.material instanceof MeshStandardMaterial))return;
    const atlas=object.userData.atlas,profile=object.userData.surface_profile??'';
    let material=object.material,kind:MicroSurface|undefined;
    if(paperEdges.has(material)){applyMicroSurface(material,'paper-edge',paperEdges.get(material));finished.add(material);return;}
    if(object.name==='Lamp_Shade'){
      const shade=material.clone();shade.onBeforeCompile=material.onBeforeCompile;
      shade.customProgramCacheKey=material.customProgramCacheKey;shade.name='Spun lamp shade';
      resources.add(shade);materials.set('spun-shade',shade);object.material=material=shade;
      applyMicroSurface(material,'spun-metal',object);finished.add(material);return;
    }
    if(object.name==='Desk_CD_Lid'||object.name==='Desk_Walkman_Door'){
      // These two aluminium skins have their own machining direction. Do not
      // turn every satin screw, VCR panel and phone part into brushed metal.
      const skin=material.clone();skin.onBeforeCompile=material.onBeforeCompile;
      skin.customProgramCacheKey=material.customProgramCacheKey;skin.name='Machined '+object.name+'/satin-metal';
      resources.add(skin);materials.set('machined-'+object.name,skin);object.material=skin;
      applyMicroSurface(skin,object.name==='Desk_CD_Lid'?'satin-turned':'satin-brushed',object);
      finished.add(skin);return;
    }
    const gasket=/^(Desk_CD_(Seam|DisplaySeat)|Desk_Walkman_(Seam|WindowBezel))$/.test(object.name);
    const smallControl=/^(Desk_CD_Button|Desk_Walkman_(Key|Stop))(?:[.]|$)/.test(object.name);
    if(gasket||smallControl){
      const key=material.uuid+(gasket?'/gasket':'/control');
      let detail=detailFinishes.get(key);
      if(!detail){
        detail=material.clone();detail.onBeforeCompile=material.onBeforeCompile;detail.customProgramCacheKey=material.customProgramCacheKey;
        detail.name=material.name+(gasket?'/gasket':'/control');detail.roughness=gasket?1.15:.86;
        if(detail instanceof MeshPhysicalMaterial){detail.ior=gasket?1.46:1.51;detail.specularIntensity=gasket?.38:.85;}
        resources.add(detail);materials.set('detail-'+key,detail);detailFinishes.set(key,detail);
        applyMicroSurface(detail,gasket?'rubber':'abs-controls');finished.add(detail);
      }
      object.material=detail;return;
    }
    if(atlas==='curtains')kind='linen';
    else if(atlas==='desk')kind='varnished-wood';
    // The pot's unglazed foot shares this atlas, but must keep its dry clay
    // response instead of inheriting the wall's transparent glaze.
    else if(atlas==='ceramic'&&object.name!=='Plant_Pot_Foot')kind='glaze';
    else if(material.name.endsWith('/plaster'))kind='plaster';
    else if(profile.startsWith('abs'))kind=/\/(abs-controls|pbt)$/.test(material.name)?'abs-controls':'abs';
    else if(profile==='pbt')kind='abs-controls';
    else if(profile==='painted-metal')kind='painted-metal';
    else if(atlas==='paper'||profile==='paper')kind='paper';
    if(kind&&!finished.has(material)){applyMicroSurface(material,kind);finished.add(material);}
  });

  const movingFill=new HemisphereLight(0xc8d4df,0x685241,.52);scene.add(movingFill);
  RectAreaLightUniformsLib.init();
  function area(position: number[], target: number[], color: number|Color, intensity: number, width: number, height: number) {
    const light = new RectAreaLight(color, intensity, width, height);
    // Blender Z-up -> glTF Y-up.
    light.position.set(position[0], position[2], -position[1]);
    light.lookAt(new Vector3(target[0], target[2], -target[1]));
    scene.add(light);
    return light;
  }
  // The bulb is enclosed by the shade. An unshadowed analytic source there
  // leaks through its shell; its static contribution is handled by the bake.
  // Cover the right side of the desk with the existing window reflection.
  // Match the vertical baked source outside the window. A tilted rectangle
  // intersects the joinery and draws a false triangular highlight on it.
  area([-.3, 1.25, 2.6], [-.3, -.5, 2.6], 0xc7d9ed, .65, 3.6, 2.1);
  const warmBounce = area([-2.3, -3, 2.8], [0, 0, 1.2], new Color(1,.82,.64), .92, 3, 2);
  const warmReflection = area([-.89, -.35, 3.67], [-1.40, -.17, 1.96], new Color(1,.86,.73), 10.3, .16, .60);
  const tvSpecular = area([0, -.37, 1.67], [0, -1.2, 1.2], 0xffffff, 9, .86, .63);

  let programAverage = new Color();
  function setChannel(channel: Channel) {
    tvColor.value.copy(crt.study(channel));
    tvSpecular.color.copy(tvColor.value);
    return tvColor.value.toArray();
  }
  function setProgram(program: Program | 'blank') {
    lastHomeFrame=-1;
    crt.uniforms.crtEnabled.value = 1;
    programAverage.copy(crt.paint(program));
    updateCRT(0, false, 0, program === 'blank' ? 0 : 1);
  }
  function setPosts(content: RoomContent, page: number) {
    lastHomeFrame=-1;
    crt.uniforms.crtEnabled.value = 1;
    programAverage.copy(crt.posts(content, page));
    updateCRT(0, false, 0, 1);
  }
  function setTape(tape:Tape,time:number,paused=false) {
    lastHomeFrame=-1;
    crt.uniforms.crtEnabled.value=1;programAverage.copy(crt.tape(tape,time,paused));
  }
  function setLamp(level:number) {if(!lampReady)level=1;lampLevel.value=level;lampBulb.emissiveIntensity=1.65*level;movingFill.intensity=.16+.36*level;warmBounce.intensity=.92*level;warmReflection.intensity=10.3*level;weather.setLamp(level);}
  function setHome(time:number,reduced:boolean) {
    if(film){crt.uniforms.crtEnabled.value=1;crt.signalMap(reduced?film.poster:film.texture);programAverage.copy(film.color(reduced));return;}
    const frame=reduced?-2:Math.floor(time*homeFrameRate);
    if(frame===lastHomeFrame)return;
    lastHomeFrame=frame;crt.uniforms.crtEnabled.value=1;
    programAverage.copy(crt.home(frame/homeFrameRate,reduced));
  }
  function setPower(powered:boolean) {tvPowered=powered;tvLed.color.setHex(powered?0x7ccf66:0x10150f);}
  const screenLightTarget=new Color();let lastScreenLightTime=0;
  function updateCRT(time: number, motion: boolean, snow: number, reveal: number) {
    crt.uniforms.crtTime.value = time;
    crt.uniforms.crtMotion.value = Number(motion&&tvPowered);
    crt.uniforms.crtStatic.value = motion&&tvPowered ? snow : 0;
    crt.uniforms.crtReveal.value = reveal;
    screenLightTarget.copy(crt.uniforms.crtBlank.value).lerp(programAverage, reveal);
    if(!tvPowered)screenLightTarget.setRGB(0,0,0);
    const lightStep=time-lastScreenLightTime;lastScreenLightTime=time;
    // Retain the baked near-field bounce and its matching specular source.
    // A short exposure response prevents cuts in a film from flashing the
    // neighbouring plastic; pauses, standby and power changes remain exact.
    if(!motion||!tvPowered||lightStep<=0||lightStep>.5)tvColor.value.copy(screenLightTarget);
    else tvColor.value.lerp(screenLightTarget,1-Math.exp(-lightStep/.18));
    tvSpecular.color.copy(tvColor.value);
    return tvColor.value.toArray();
  }
  // Capture the actual baked room once for metal and glass reflections. No
  // stock studio image: the probe sees the same geometry and local city plate.
  // Keep TV light out of this static probe; its highlights remain dynamic.
  setChannel('off');
  loading.progress?.({stage:'reflection',completed:0,total:1});await yieldForLoading(loading.signal);
  const endProbe=assets?.timing?.start(manifest.reflection&&!loading.captureReflection?'reflection.upload':'reflection.scene-probe',{size:128});
  let reflection:Texture;
  if(manifest.reflection&&!loading.captureReflection){
    reflection=await loadRoomReflection(manifest.reflection,async url=>{
      if(assets)return assets.read(url);
      const response=await fetch(url);if(!response.ok)throw new Error(`Reflection: HTTP ${response.status}`);
      return response.arrayBuffer();
    });
    resources.add(reflection);renderer.initTexture(reflection);
  }else{
    // This path supports unprepared development candidates and the offline
    // builder. Published bundles carry the identical filtered half-float data.
    const target=captureRoomReflection(scene,renderer);
    await loading.captureReflection?.(target);
    resources.add(target);reflection=target.texture;
  }
  endProbe?.();
  loading.progress?.({stage:'reflection',completed:1,total:1});await yieldForLoading(loading.signal);
  for (const material of [...materials.values(), ...profiles.values(), ...printedMaterials, screen, readout]) {
    material.envMap = reflection;
    material.envMapIntensity = material === computerSeal ? .35 : material === crt.glass ? 1 : material === screen ? 1 : material === readout ? .24 : /\/abs-(graphite|controls)$/.test(material.name) ? 1 : /\/satin-metal$/.test(material.name) ? .95 : /\/(abs(?:-ivory)?|painted-metal|pbt)$/.test(material.name) ? .8 : ['Spun lamp shade','Baked lamp'].includes(material.name) ? .88 : material.name === 'Baked props' ? .75 : .65;
    material.needsUpdate = true;
  }
  setChannel('blue');
  let lastReadout = -1;
  function updateWeather(time: number, dx: number, dy: number, motion = false, playbackTime?:number) {
    weather.update(time, dx, dy);
    const seconds = Math.floor(playbackTime??time), readoutKey = (motion ? seconds : -2)+(playbackTime===undefined?0:100000);
    if (readoutKey !== lastReadout) { paintReadout(seconds, motion,playbackTime!==undefined); readoutMap.needsUpdate = true; lastReadout = readoutKey; }
    tvLed.color.setHex(tvPowered?0x7ccf66:0x10150f).multiplyScalar(tvPowered&&motion ? .99 + .01*Math.sin(time*.6) : 1);
  }
  return { film, inspectionMaterial:weather.inspectionMaterial, environment:reflection, buildId:manifest.buildId, reflectionMode:manifest.reflection?'prefiltered':'runtime', anisotropy, reflectionSize:128, effect:(name:'chroma'|'tracking'|'underscan'|'delay'|'blue',value:number)=>{const key=({chroma:'crtChroma',tracking:'crtTracking',underscan:'crtUnderscan',delay:'crtDelay',blue:'crtBlue'} as const)[name];crt.uniforms[key].value=value;},setChannel, setProgram, setPosts, setTape, setHome, setPower, setLamp, prepareLampOff, prepareDetails, updateDetails, get detailsMoving(){return detailStatus==='blending';}, get detailState(){return detailStatus;}, updateCRT, updateWeather, quality: manifest.quality };
}
