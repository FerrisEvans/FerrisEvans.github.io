import { CanvasTexture, Color, MeshPhysicalMaterial, SRGBColorSpace, type Texture } from 'three';
import { pageInfo, pageSize, wrapText, type RoomContent } from './content';
import { paintTape, type Tape } from './tapes';
import { paintHome } from './home-program';
import { phosphorShader } from './phosphor';
import { createThinGlass } from './thin-glass';

export type Program = 'home' | 'notes' | 'night' | 'off';
const background = '#1753bd';

/** Canvas emission on the inner coating; the separate convex envelope reflects the room. */
export function createCRT() {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 576;
  // This canvas only draws. Pixel readback belongs to the small sample canvas
  // below; forcing the main canvas into a read-optimized path makes the film's
  // gradients and soft shadows expensive in Chromium.
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('TV canvas unavailable');
  const map = new CanvasTexture(canvas);
  map.flipY = false;
  map.colorSpace = SRGBColorSpace;
  const material = new MeshPhysicalMaterial({
    // The unlit phosphor behind the faceplate is a very dark grey-green,
    // rather than a perfectly absorbing hole in the room.
    color: 0x080d0b, emissive: 0xffffff, emissiveMap: map,
    roughness: .9, clearcoat: 0,
    specularIntensity: 0, ior: 1.52, toneMapped: false,
  });
  const glass=createThinGlass({roughness:.065,ior:1.52,absorption:.018});
  glass.name='CRT faceplate';
  const uniforms = {
    crtTime: { value: 0 }, crtMotion: { value: 0 }, crtStatic: { value: 0 },
    crtReveal: { value: 1 }, crtEnabled: { value: 0 },
    crtFilm:{value:0},
    crtBlank: { value: new Color(background) },
    crtChroma:{value:1},crtTracking:{value:0},crtUnderscan:{value:0},crtDelay:{value:0},crtBlue:{value:0},
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = `uniform float crtTime, crtMotion, crtStatic, crtReveal, crtEnabled, crtFilm;
      uniform vec3 crtBlank;
      uniform float crtChroma,crtTracking,crtUnderscan,crtDelay,crtBlue;
      float crtHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      \n` + shader.fragmentShader;
    // Insert after Three's emissive-map sampler and colour-space helpers.
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_pars_fragment>',
      '#include <emissivemap_pars_fragment>\n'+phosphorShader);
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
      vec2 p = vEmissiveMapUv * 2.0 - 1.0;
      vec2 uv = vEmissiveMapUv + p * dot(p,p) * .008;
      uv = (uv-.5)*(1.+crtUnderscan*.12)+.5;
      // The phosphor aperture is inside the glass, so framebuffer MSAA cannot
      // smooth this shader edge. Integrate its narrow cutoff per pixel.
      vec2 apertureAA=max(fwidth(uv)*.8,vec2(.0005));
      vec2 apertureEdge=smoothstep(-apertureAA,apertureAA,uv)
        *(1.-smoothstep(vec2(1.)-apertureAA,vec2(1.)+apertureAA,uv));
      float border=apertureEdge.x*apertureEdge.y;
      uv = fract(uv+vec2(.07,.05)*crtDelay);
      uv.x += sin(uv.y*70.+crtTime*9.)*crtTracking*.012*crtMotion;
      uv = clamp(uv, vec2(.002), vec2(.998));
      vec2 tubeRaster=vec2(640.,480.);
      vec3 signal=phosphorSignal(uv,tubeRaster,mix(.60,1.15,crtFilm),.085);
      // Resolve a stable 240-line interlaced field on the actual curved UV
      // surface. Signal bandwidth stays 480 lines; no full-screen overlay.
      float scan=phosphorRaster(uv,vec2(640.,240.),.20);
      float beamFalloff = 1. - .075 * dot(p,p);
      float breath=1.+(.0022*sin(crtTime*1.4)+.0012*sin(crtTime*.37))*crtMotion;
      float grain = (crtHash(floor(uv * tubeRaster) + floor(crtTime*24.)) - .5) * mix(.003,.0006,crtFilm) * crtMotion;
      signal = mix(vec3(dot(signal,vec3(.2126,.7152,.0722))),signal,crtChroma);
      signal = mix(signal,vec3(signal.b*.18,signal.b*.35,signal.b),crtBlue);
      signal += grain * crtEnabled;
      float snow = crtHash(floor(uv * vec2(380.,280.)) + floor(crtTime*60.));
      signal = mix(signal, vec3(snow * .25), crtStatic * .5);
      // Standby and video pass through the same tube optics. Previously the
      // reveal mix bypassed every raster/edge cue on the blank blue screen.
      // Glass attenuation belongs to the outer mesh, not this inner coating.
      vec3 displayed=mix(crtBlank,max(signal,vec3(0.)),crtReveal);
      totalEmissiveRadiance *= displayed*scan*beamFalloff*breath*border;
    `);
    // Bounce cards are diffuse-light proxies, not luminous objects floating
    // in front of the glass. The captured room already contains their lit
    // surfaces; reflecting both produced a broad grey oval over dark frames.
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',
      '#include <lights_fragment_end>\nreflectedLight.directSpecular=vec3(0.);');
  };
  material.customProgramCacheKey = () => 'room-crt-phosphor-v10-inner-coating';
  material.userData.roomGlow=false;
  function signalMap(texture:Texture){
    if(material.emissiveMap===texture)return;
    const video=(value:Texture|null)=>value!==null&&'isVideoTexture' in value;
    // A reduced-motion film poster goes through the same tube optics as
    // the moving film. Native canvas pages retain their text-friendly beam.
    uniforms.crtFilm.value=Number(texture!==map);
    if(video(material.emissiveMap)!==video(texture))material.needsUpdate=true;
    material.emissiveMap=texture;
  }
  const toLinear = (value: number) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  const sample = document.createElement('canvas'); sample.width=32; sample.height=24;
  const sampleContext=sample.getContext('2d',{willReadFrequently:true})!;
  function average() {
    // Integrate the actual emitted Canvas pixels only when content changes.
    sampleContext.drawImage(canvas,0,0,32,24);
    const pixels = sampleContext.getImageData(0, 0, 32, 24).data;
    const rgb = [0, 0, 0];
    for (let i = 0; i < pixels.length; i += 4) {
      for (let j = 0; j < 3; j++) rgb[j] += toLinear(pixels[i + j] / 255);
    }
    return new Color().setRGB(...rgb.map((v) => v / (pixels.length / 4)) as [number, number, number]);
  }
  function paint(program: Program | 'blank') {
    signalMap(map);
    if (!ctx) throw new Error('TV context lost');
    if(program==='home')return home(0);
    const backgrounds = { home: background, notes: '#76602a', night: '#164e53', blank: background, off: '#020304' };
    ctx.fillStyle = backgrounds[program];
    ctx.fillRect(0, 0, 768, 576);
    if (program !== 'blank' && program !== 'off') {
      ctx.fillStyle = '#eff4f0';
      ctx.textAlign = 'left';
      ctx.font = '38px RoomPixel, monospace';
      ctx.fillText(`CH 0${['home', 'notes', 'night'].indexOf(program) + 1}`, 68, 83);
      ctx.fillText('FERRIS / STUDIO', 300, 83);
      ctx.fillRect(68, 107, 632, 2);
      ctx.font = '82px RoomPixel, monospace';
      ctx.fillText({ home: 'HELLO, WORLD.', notes: 'WORK IN PROGRESS', night: 'AFTER HOURS' }[program], 68, 242);
      ctx.font = '42px RoomPixel, monospace';
      ctx.fillText({ home: 'CODE. BUILD. REPEAT.', notes: 'SMALL IDEAS, MADE REAL.', night: 'A QUIET PLACE TO THINK.' }[program], 68, 310);
      ctx.font = '36px RoomPixel, monospace';
      ctx.fillText('NOTES FROM MY DESK', 68, 457);
      ctx.fillText('EST. 2026', 68, 501);
    }
    map.needsUpdate = true;
    return program==='off'?new Color(0,0,0):average();
  }
  function home(time:number,reduced=false) {
    signalMap(map);
    paintHome(ctx!,time,reduced);map.needsUpdate=true;return average();
  }
  function study(channel: 'blue' | 'white' | 'amber' | 'off') {
    signalMap(map);
    if (!ctx) return new Color();
    uniforms.crtEnabled.value = 0;
    uniforms.crtReveal.value = 1;
    ctx.fillStyle = { blue: background, white: '#eeeeeb', amber: '#d89128', off: '#020304' }[channel];
    ctx.fillRect(0, 0, 768, 576);
    if (channel !== 'off') {
      ctx.fillStyle = channel === 'white' ? '#202a36' : '#e7ebeb';
      ctx.font = 'bold 45px monospace';
      ctx.fillText('NIGHT LOG', 57, 108);
      ctx.font = '27px monospace';
      ctx.fillText('ROOM / LIGHT STUDY', 57, 162);
      ctx.fillRect(57, 198, 654, 3);
      ctx.font = '24px monospace';
      ctx.fillText('SIGNAL  03', 57, 462);
      ctx.fillText(channel.toUpperCase().padStart(5), 582, 462);
    }
    map.needsUpdate = true;
    return channel === 'off' ? new Color(0, 0, 0) : average();
  }
  function posts(content: RoomContent, requested: number) {
    signalMap(map);
    const {page,pages,previous,next}=pageInfo(content.posts.length,requested);
    if (!ctx) throw new Error('TV context lost');
    ctx.fillStyle = '#090c10'; ctx.fillRect(0, 0, 768, 576);
    ctx.fillStyle = '#eff4ff'; ctx.textAlign = 'left';
    ctx.font = '44px RoomPixel, monospace';
    ctx.fillText('TELETEXT', 54, 63);
    ctx.fillStyle = '#9cd8df'; ctx.font = '30px RoomPixel, monospace';
    ctx.fillText(`POSTS  /  ${content.posts.length} NOTES`, 54, 102);
    ctx.fillText(`${page + 1} / ${pages}`, 635, 102);
    ctx.fillStyle = '#dce7ff'; ctx.fillRect(54, 116, 660, 2);
    content.posts.slice(page * pageSize, (page + 1) * pageSize).forEach((post, index) => {
      const y = 142 + index * 76;
      ctx.fillStyle = '#ffe4a0'; ctx.font = '32px RoomPixel, monospace';
      ctx.fillText(String(page * pageSize + index + 1).padStart(2, '0'), 54, y + 23);
      ctx.fillStyle = '#f3f4f3'; ctx.font = '24px RoomPixelZH, "PingFang SC", sans-serif';
      ctx.fillText(wrapText(ctx, post.title, 580, 1)[0], 104, y + 21);
      ctx.fillStyle = '#a9bedb'; ctx.font = '25px RoomPixel, monospace';
      ctx.fillText(post.date, 104, y + 51);
      ctx.fillStyle = '#ffffff18'; ctx.fillRect(54, y + 64, 660, 1);
    });
    ctx.fillStyle = '#f3f4f3'; ctx.font = '30px RoomPixel, monospace';
    ctx.fillStyle=previous?'#f3f4f3':'#535a66';ctx.fillText('< PREV', 54, 552);
    ctx.fillStyle=next?'#f3f4f3':'#535a66';ctx.fillText('NEXT >', 618, 552);
    map.needsUpdate = true;
    return average();
  }
  function tape(tape: Tape,time:number,paused:boolean) {
    signalMap(map);
    paintTape(ctx!,tape,time,768,576);
    if(paused){ctx!.fillStyle='#081311dd';ctx!.fillRect(286,240,196,72);ctx!.fillStyle='#efeadc';ctx!.font='38px RoomPixel,monospace';ctx!.textAlign='center';ctx!.fillText('PAUSED',384,287);ctx!.textAlign='left';}
    map.needsUpdate=true;return average();
  }
  return { canvas, map, material, glass, uniforms, paint, study, posts, tape, home, signalMap };
}
