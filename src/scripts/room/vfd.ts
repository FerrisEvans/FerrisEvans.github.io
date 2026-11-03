import {CanvasTexture, MeshPhysicalMaterial, SRGBColorSpace} from 'three';

/** A vacuum-fluorescent counter seen through its dark protective window. */
export function createVFD() {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
  const ctx=canvas.getContext('2d')!;
  const map=new CanvasTexture(canvas);map.flipY=false;map.colorSpace=SRGBColorSpace;
  const material=new MeshPhysicalMaterial({color:0x020806,emissive:0xffffff,emissiveMap:map,
    roughness:.12,ior:1.5,specularIntensity:.55,envMapIntensity:.24,toneMapped:false});
  material.userData.roomGlow=false;
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`
      // View-dependent refraction separates the phosphor plate from the
      // cover without a transmission render target or a second scene pass.
      vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
      vec2 ux=dFdx(vEmissiveMapUv),uy=dFdy(vEmissiveMapUv);
      float uvDet=ux.x*uy.y-ux.y*uy.x;
      float handed=uvDet<0.?-1.:1.;
      vec3 axisU=(dx*uy.y-dy*ux.y)*handed;
      vec3 axisV=(dy*ux.x-dx*uy.x)*handed;
      // The authored display is a thin solid. Its side faces deliberately
      // collapse to the black UV border and have no valid plate tangent.
      axisU*=inversesqrt(max(dot(axisU,axisU),1e-20));
      axisV*=inversesqrt(max(dot(axisV,axisV),1e-20));
      vec3 eye=normalize(vViewPosition);
      vec2 inset=vec2(dot(eye,axisU),dot(eye,axisV))*vec2(.006,.018)
        *smoothstep(1e-12,1e-10,abs(uvDet));
      vec2 plateUV=clamp(vEmissiveMapUv-inset,vec2(.002),vec2(.998));
      vec3 phosphor=texture2D(emissiveMap,plateUV).rgb*.76;
      phosphor+=(texture2D(emissiveMap,plateUV+vec2(.0008,0.)).rgb
               +texture2D(emissiveMap,plateUV-vec2(.0008,0.)).rgb)*.12;
      float edge=min(min(plateUV.x,1.-plateUV.x),min(plateUV.y,1.-plateUV.y));
      float transmission=.94-.10*pow(1.-abs(dot(normal,eye)),2.);
      totalEmissiveRadiance*=phosphor*smoothstep(.004,.025,edge)*transmission;
    `);
    // The room probe supplies real glass reflections; diffuse bounce cards
    // must not become unrelated bright rectangles on this small window.
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',
      '#include <lights_fragment_end>\nreflectedLight.directSpecular=vec3(0.);');
  };
  material.customProgramCacheKey=()=> 'vfd-smoked-cover-v2-safe-edge';
  const segments=[[0,1,2,3,4,5],[1,2],[0,1,6,4,3],[0,1,6,2,3],[5,6,1,2],
    [0,5,6,2,3],[0,5,6,4,2,3],[0,1,2],[0,1,2,3,4,5,6],[0,1,2,3,5,6]];
  const rectangles=[[8,0,34,6],[44,7,6,29],[44,43,6,29],[8,73,34,6],[0,43,6,29],[0,7,6,29],[8,36,34,6]];
  function segment(x:number,y:number,w:number,h:number) {
    const bevel=1.7;ctx.beginPath();ctx.moveTo(x+bevel,y);ctx.lineTo(x+w-bevel,y);
    ctx.lineTo(x+w,y+bevel);ctx.lineTo(x+w,y+h-bevel);ctx.lineTo(x+w-bevel,y+h);
    ctx.lineTo(x+bevel,y+h);ctx.lineTo(x,y+h-bevel);ctx.lineTo(x,y+bevel);ctx.closePath();ctx.fill();
  }
  function paint(seconds:number,blink:boolean,media=false) {
    ctx.shadowBlur=0;ctx.fillStyle='#020706';ctx.fillRect(0,0,512,128);
    const elapsed=Math.max(0,Math.floor(seconds))+(media?0:23*60+5);
    const stamp=[Math.floor(elapsed/3600)%24,Math.floor(elapsed/60)%60,elapsed%60]
      .map(n=>String(n).padStart(2,'0')).join(':');
    let digitX=36,digitIndex=0;
    for(const digit of stamp) {
      if(digit===':') {
        ctx.shadowColor='#65c5a4';ctx.shadowBlur=4;ctx.fillStyle='#a9dec7';
        if(!blink||seconds%2===0){ctx.fillRect(digitX+5,38,5,5);ctx.fillRect(digitX+5,65,5,5);}
        ctx.shadowBlur=0;digitX+=22;continue;
      }
      for(let index=0;index<rectangles.length;index++) {
        const[x,y,w,h]=rectangles[index];
        const lit=segments[Number(digit)].includes(index);
        ctx.shadowColor='#5dc5a0';ctx.shadowBlur=lit?5:0;
        // Stable small cathode/segment differences, never time-varying noise.
        const level=.93+.055*Math.sin(index*2.3+digitIndex*1.7);
        ctx.fillStyle=lit?`rgb(${Math.round(182*level)},${Math.round(235*level)},${Math.round(208*level)})`:'#091811';
        segment(digitX+x,14+y,w,h);
      }
      digitIndex++;digitX+=62;
    }
    ctx.shadowBlur=0;ctx.fillStyle='#6ca68e';ctx.font='11px RoomPixel,monospace';
    ctx.fillText(media?'TAPE  /  ELAPSED':'COUNTER  /  RUN',36,116);
    // A barely visible filament line is behind the smoked glass, not a
    // screen-wide scanline effect shared with either CRT.
    ctx.strokeStyle='rgba(39,70,54,.16)';ctx.lineWidth=.6;ctx.beginPath();
    ctx.moveTo(22,48);ctx.lineTo(490,48);ctx.moveTo(22,75);ctx.lineTo(490,75);ctx.stroke();
    map.needsUpdate=true;
  }
  paint(0,false);
  return {material,map,paint};
}
