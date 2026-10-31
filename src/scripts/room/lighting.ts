import {
  CanvasTexture, Color, DoubleSide, HemisphereLight, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial,
  NoColorSpace, Object3D, RectAreaLight, ShaderChunk, SRGBColorSpace,
  Texture, TextureLoader, Vector3, WebGLRenderer, type WebGLRenderTarget,
} from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

import { createCRT, type Program } from './crt';
import type { RoomAssets } from './assets';
import type { RoomContent } from './content';
import type { Tape } from './tapes';
import { createWeather } from './weather';
import { textureBytes } from './texture-budget';
import { homeFrameRate } from './home-program';
import { yieldForLoading, type LoadingReporter } from './loading';
import {createHomeVideo, type HomeFilmManifest} from './home-video';
import {captureRoomReflection, loadRoomReflection, type ReflectionAsset} from './reflection';

type Resource = { dispose(): void };
type LightMap = { file: string; preview?:string; range: number; peak: number };
type Atlas = { albedo: string; orm: string; normal: string; entry?:{orm?:string;normal?:string}; opacity?:string; cutout?:boolean; alphaTest?:number; room: LightMap; tv: LightMap; lampOff?: LightMap };
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
  let uploadQueue=Promise.resolve();
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
    const endDecode=assets?.timing?.start('texture.decode',info);
    let objectUrl: string | undefined;
    if (assets) objectUrl = URL.createObjectURL(new Blob([await assets.read(path)], { type: path.endsWith('.webp') ? 'image/webp' : 'image/png' }));
    let map: Texture;
    try { map = await loader.loadAsync(objectUrl ?? path); }
    finally { if (objectUrl) URL.revokeObjectURL(objectUrl); }
    if(assets?.isDisposed){map.dispose();throw new DOMException('Aborted','AbortError');}
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
    const uploaded=uploadQueue.then(async()=>{
      await yieldForLoading(loading.signal);
      endQueue?.();const endUpload=assets?.timing?.start('texture.upload-submit',info);
      renderer.initTexture(map);endUpload?.();
      if(initialTextures.has(key)){preparedTextures++;textureProgress();}
    });
    uploadQueue=uploaded.catch(()=>{});await uploaded;
    return map;
    }catch(error){resources.delete(map);map.dispose();throw error;}
  }
  const tvColor = { value: new Color() };
  const lampLevel = {value:1};
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
    // Only fabric pays for fibre sheen. Keep the same RGBM light response and
    // all other room materials, exposure and analytic lights unchanged.
    const material = name === 'curtains'
      ? new MeshPhysicalMaterial({...materialOptions, sheen:.32, sheenColor:0xd4c6ad, sheenRoughness:.75, specularIntensity:.35})
      : name==='foliage' ? new MeshPhysicalMaterial({...materialOptions,side:DoubleSide,sheen:.12,sheenColor:0x66743c,sheenRoughness:.7,specularIntensity:.4})
      : ['equipment','tape','paper'].includes(name) ? new MeshPhysicalMaterial({...materialOptions,specularIntensity:.5})
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
      shader.uniforms.lampOffMap = offUniform;
      shader.uniforms.lampOffRange = offRange;
      shader.uniforms.roomRange = { value: atlas.room.range };
      shader.uniforms.tvRange = { value: atlas.tv.range };
      shader.fragmentShader = `uniform sampler2D tvIrradiance, tvDetailMap, lampOffMap, roomDetailMap;
        uniform float roomDetailMix;
        uniform float lampLevel, lampOffRange;
        uniform vec3 tvColor;
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
           ${name==='foliage'?'roomLight /= 1. + max(roomLight.r,max(roomLight.g,roomLight.b))/10.;':''}
           vec3 tvLight = tvTexel.rgb * tvTexel.a;
           if(roomDetailMix>0.){vec4 tvDetail=texture2D(tvDetailMap,vLightMapUv);tvLight=mix(tvLight,tvDetail.rgb*tvDetail.a,roomDetailMix);}
           tvLight *= tvRange;
           vec3 lightMapIrradiance = (roomLight + tvLight * tvColor * 3.0) * lightMapIntensity;`,
        ));
      // Analytic area lights add view-dependent highlights only. Their diffuse
      // component is already present in the bake and must not be counted twice.
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>',
        '#include <lights_fragment_end>\nreflectedLight.directDiffuse = vec3(0.0);');
      if(name==='foliage')shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`float throughLeaf=pow(max(0.0,dot(-geometryNormal,normalize((viewMatrix*vec4(-.4,.7,.3,0.0)).xyz))),2.0);
        outgoingLight+=diffuseColor.rgb*vec3(.12,.15,.045)*throughLeaf;
        #include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => name==='foliage'?'room-rgbm-foliage-v4':'room-rgbm-v2';
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
  const weather = createWeather(await texture(manifest.city ?? '/room/city-night-v1.png', true));
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
  const readoutCanvas = document.createElement('canvas');
  readoutCanvas.width = 512;
  readoutCanvas.height = 128;
  const displayContext = readoutCanvas.getContext('2d')!;
  function paintReadout(seconds: number, blink: boolean, media=false) {
    displayContext.shadowBlur = 0;
    displayContext.fillStyle = '#061511'; displayContext.fillRect(0, 0, 512, 128);
    displayContext.fillStyle = '#c6f4e0';
    displayContext.shadowColor = '#4cbd9d'; displayContext.shadowBlur = 7;
    const segments = [[0,1,2,3,4,5], [1,2], [0,1,6,4,3], [0,1,6,2,3], [5,6,1,2],
      [0,5,6,2,3], [0,5,6,4,2,3], [0,1,2], [0,1,2,3,4,5,6], [0,1,2,3,5,6]];
    const elapsed = seconds + (media?0:23*60+5);
    const stamp = [Math.floor(elapsed/3600)%24, Math.floor(elapsed/60)%60, elapsed%60].map(n => String(n).padStart(2,'0')).join(':');
    let digitX = 36;
    for (const digit of stamp) {
      if (digit === ':') {
        if (!blink || seconds % 2 === 0) { displayContext.fillRect(digitX+5,44,6,6); displayContext.fillRect(digitX+5,73,6,6); }
        digitX += 22; continue;
      }
      const rectangles = [[8,0,34,7],[44,7,7,33],[44,47,7,33],[8,81,34,7],[0,47,7,33],[0,7,7,33],[8,40,34,7]];
      for (const segment of segments[Number(digit)]) {
        const [x,y,width,height] = rectangles[segment]; displayContext.fillRect(digitX+x,17+y,width,height);
      }
      digitX += 62;
    }
  }
  paintReadout(0, false);
  const readoutMap = new CanvasTexture(readoutCanvas);
  readoutMap.flipY = false;
  readoutMap.colorSpace = SRGBColorSpace;
  resources.add(readoutMap);
  const readout = new MeshBasicMaterial({ map: readoutMap, toneMapped: false });
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
    if(profile==='tape-window'){
      material=new MeshPhysicalMaterial({color:0x63706e,roughness:.13,metalness:0,transparent:true,opacity:.24,depthWrite:false,ior:1.46,specularIntensity:.65,side:DoubleSide});
    }else if(material instanceof MeshPhysicalMaterial){
      // ORM already contains the authored finish. Another roughness factor
      // would turn satin ABS and enamel into much glossier surfaces.
      if(profile==='abs'||profile==='tape-shell'){material.specularIntensity=profile==='abs'?.85:.45;material.ior=1.48;}
      if(profile==='satin-metal')material.specularIntensity=.75;
      if(profile==='paper'){material.specularIntensity=.2;material.sheen=.08;material.sheenRoughness=.85;}
    }
    material.name=key;resources.add(material);profiles.set(key,material);return material;
  }
  // The bulb is the only emissive lamp surface; its shell and lining retain
  // the baked illumination. Start dark while the reflection probe is captured.
  const lampBulb=new MeshStandardMaterial({color:0xe7ddc5,roughness:.48,emissive:0xffbd75,emissiveIntensity:0});
  resources.add(lampBulb);materials.set('lamp-bulb',lampBulb);
  for(const material of [city,screen,readout,led,tvLed,lampBulb])material.userData.roomGlow=true;
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
      if(typeof object.userData.surface_profile==='string')object.material=surfaceProfile(material,object.userData.surface_profile);
    }
    if(object.userData.atlas==='props'&&object.name.startsWith('Label_VHS_'))object.material=sleeveFinish;
    if(object.userData.atlas==='props'&&['CRT_Case','CRT_ControlPanel','VCR_Body'].includes(object.name))object.material=caseFinish;
    if (object.name === 'City_Backdrop') object.material = city;
    if (object.name === 'CRT_Screen') {
      object.material = screen;
      // Refined glass carries its own regular ScreenUV; retain compatibility
      // with the first box-based study until a new bake finishes loading.
      if (!object.userData.screen_bulge_m) frontUv(object);
    }
    if (object.name === 'VCR_Display') { object.material = readout; frontUv(object); }
    if (object.name === 'Computer_Recess'||object.name==='Computer_Screen') object.material=computerSeal;
    if (object.userData.surface_role === 'led') object.material = object.name==='CRT_PowerLED'?tvLed:led;
    if (object.userData.surface_role === 'lamp-bulb') object.material = lampBulb;
    if (object.userData.surface_role === 'print' && object.material instanceof MeshStandardMaterial) {
      printedMaterials.add(object.material);
    }
  });

  const movingFill=new HemisphereLight(0xd9dfd3,0x685241,.85);scene.add(movingFill);
  RectAreaLightUniformsLib.init();
  function area(position: number[], target: number[], color: number, intensity: number, width: number, height: number) {
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
  // Keep the analytic light count and the diffuse bake unchanged.
  area([.2, 1.08, 2.6], [0, -.5, .7], 0xc7d9ed, .9, 4.4, 2.1);
  const warmBounce = area([-2.3, -3, 2.8], [0, 0, 1.2], 0xffdcb4, 2.3, 3, 2);
  const warmReflection = area([-1.3, .35, 3.8], [-1.475, .486, 1.867], 0xffe7cf, 36, .35, 1.0);
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
  function setLamp(level:number) {if(!lampReady)level=1;lampLevel.value=level;lampBulb.emissiveIntensity=1.5*level;movingFill.intensity=.22+.63*level;warmBounce.intensity=2.3*level;warmReflection.intensity=36*level;}
  function setHome(time:number,reduced:boolean) {
    if(film){crt.uniforms.crtEnabled.value=1;crt.signalMap(reduced?film.poster:film.texture);programAverage.copy(film.color(reduced));return;}
    const frame=reduced?-2:Math.floor(time*homeFrameRate);
    if(frame===lastHomeFrame)return;
    lastHomeFrame=frame;crt.uniforms.crtEnabled.value=1;
    programAverage.copy(crt.home(frame/homeFrameRate,reduced));
  }
  function setPower(powered:boolean) {tvPowered=powered;tvLed.color.setHex(powered?0x7ccf66:0x10150f);}
  function updateCRT(time: number, motion: boolean, snow: number, reveal: number) {
    crt.uniforms.crtTime.value = time;
    crt.uniforms.crtMotion.value = Number(motion&&tvPowered);
    crt.uniforms.crtStatic.value = motion&&tvPowered ? snow : 0;
    crt.uniforms.crtReveal.value = reveal;
    tvColor.value.copy(crt.uniforms.crtBlank.value).lerp(programAverage, reveal);
    if(!tvPowered)tvColor.value.setRGB(0,0,0);
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
  for (const material of [...materials.values(), ...profiles.values(), ...printedMaterials, screen]) {
    material.envMap = reflection;
    material.envMapIntensity = material === computerSeal ? .35 : material === screen ? 1.1 : /\/(abs|satin-metal)$/.test(material.name) ? .9 : material.name === 'Baked props' ? .85 : .65;
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
