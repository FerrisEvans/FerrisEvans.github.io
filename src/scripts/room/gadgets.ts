import { Box3, CanvasTexture, LatheGeometry, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, PlaneGeometry, RingGeometry, SRGBColorSpace, Vector2, Vector3 } from 'three';
import { mapPlane } from './osd';

export const calculatorKeys=['MC','MR','C','/','7','8','9','*','4','5','6','-','1','2','3','+','0','.','%','='];
/** Four-function calculator; arithmetic is explicit and never evaluates input as code. */
export function createCalculator(root:Object3D,resources:Set<{dispose():void}>,wake:()=>void) {
  let display='0',stored:number|null=null,operator='',fresh=true,memory=0,lastOperand=0;
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d')!;
  const map=new CanvasTexture(canvas);map.flipY=false;map.colorSpace=SRGBColorSpace;resources.add(map);
  const material=new MeshBasicMaterial({map,toneMapped:false});resources.add(material);
  const lcd=root.getObjectByName('Desk_Calculator_Display');
  if(lcd instanceof Mesh){const geometry=lcd.geometry.clone();resources.add(geometry);lcd.geometry=geometry;geometry.computeBoundingBox();const b=geometry.boundingBox!,p=geometry.attributes.position,uv=geometry.attributes.uv;
    for(let i=0;i<p.count;i++)uv.setXY(i,(p.getX(i)-b.min.x)/(b.max.x-b.min.x),(p.getZ(i)-b.min.z)/(b.max.z-b.min.z));uv.needsUpdate=true;lcd.material=material;delete lcd.userData.atlas;lcd.userData.surface_role='screen';}
  const print=root.getObjectByName('Desk_Calculator_Print_Digits');if(print)print.visible=false;
  const section=document.createElement('section');section.className='calculator-controls';section.setAttribute('aria-label','桌面计算器');section.hidden=true;
  document.querySelector('#surface-layer')!.append(section);
  const group=root.getObjectByName('Desk_Calculator_Motion')!;
  const controls:{element:HTMLButtonElement;corners:Vector3[]}[]=[];
  function paint(){ctx.fillStyle='#95a280';ctx.fillRect(0,0,512,128);ctx.fillStyle='#26382b';ctx.textAlign='right';ctx.font='80px RoomPixel,monospace';ctx.fillText(display,490,98);if(memory!==0){ctx.font='26px RoomPixel,monospace';ctx.textAlign='left';ctx.fillText('M',15,30);}map.needsUpdate=true;section.setAttribute('aria-label',`桌面计算器，显示 ${display}`);document.querySelector<HTMLElement>('#room')!.dataset.calculator=display;}
  const format=(n:number)=>Number.isFinite(n)?String(Number(n.toPrecision(9))):'Error';
  function calculate(a:number,b:number,op:string){return op==='+'?a+b:op==='-'?a-b:op==='*'?a*b:op==='/'?a/b:b;}
  function press(key:string){
    if(key==='C'){display='0';stored=null;operator='';fresh=true;}
    else if(key==='MC')memory=0;
    else if(key==='MR'){display=format(memory);fresh=true;}
    else if(key==='M+')memory+=Number(display)||0;
    else if(key==='%'){display=format(Number(display)/100);fresh=true;}
    else if(key==='Backspace'){display=display.length>1?display.slice(0,-1):'0';}
    else if(/^[0-9.]$/.test(key)){if(fresh||display==='Error'){display=key==='.'?'0.':key;fresh=false;}else if(!(key==='.'&&display.includes('.'))&&display.length<10){display=display==='0'&&key!=='.'?key:display+key;}}
    else if(['+','-','*','/'].includes(key)){if(stored!==null&&!fresh)display=format(calculate(stored,Number(display),operator));stored=Number(display);operator=key;fresh=true;}
    else if(key==='='){if(operator&&stored!==null){const operand=fresh?lastOperand:Number(display);lastOperand=operand;display=format(calculate(stored,operand,operator));stored=Number(display);fresh=true;}}
    paint();wake();
  }
  const operatorInk=new MeshBasicMaterial({color:0xeee0c2,toneMapped:false});resources.add(operatorInk);
  calculatorKeys.forEach((key,i)=>{if(i%4===3){const text=root.getObjectByName('Desk_Calculator_Print_Key.'+String(i).padStart(3,'0'));if(text instanceof Mesh)text.material=operatorInk;}const object=root.getObjectByName('Desk_Calculator_Key'+(i?'.'+String(i).padStart(3,'0'):''));if(!object)return;
    if(!(object instanceof Mesh))return;object.geometry.computeBoundingBox();const b=object.geometry.boundingBox!;const y=b.max.y+.002,corners=[new Vector3(b.min.x,y,b.min.z),new Vector3(b.max.x,y,b.min.z),new Vector3(b.max.x,y,b.max.z),new Vector3(b.min.x,y,b.max.z)].map(p=>object.localToWorld(p));
    const button=document.createElement('button');button.type='button';button.setAttribute('aria-label',`计算器 ${key}`);button.append(Object.assign(document.createElement('span'),{className:'sr-only',textContent:key}));Object.assign(button.style,{left:'0',top:'0',width:'100px',height:'100px',transformOrigin:'0 0'});button.addEventListener('click',()=>press(key));section.append(button);controls.push({element:button,corners:corners.map(p=>group.worldToLocal(p))});});
  paint();
  function project(camera:PerspectiveCamera,width:number,height:number,enabled:boolean){section.hidden=!enabled;if(!enabled)return;for(const control of controls){const points=control.corners.map(p=>{const n=group.localToWorld(p.clone()).project(camera);return[(n.x+1)*width/2,(1-n.y)*height/2];});mapPlane(control.element,100,100,points);}}
  return{press,project};
}

/** The close-up keeps the existing controls but gives the player a manufactured shell. */
export function createCD(root:Object3D,resources:Set<{dispose():void}>) {
  const own=<T extends {dispose():void}>(item:T)=>{resources.add(item);return item;};
  const player=root.getObjectByName('Desk_CD');
  const old=player instanceof Mesh&&player.material instanceof MeshStandardMaterial?player.material:undefined;
  const envMap=old?.envMap??null;
  const body=own(new MeshPhysicalMaterial({color:'#b6b9b4',metalness:.65,roughness:.28,clearcoat:.12,clearcoatRoughness:.3,envMap,envMapIntensity:1.05}));
  const lid=own(new MeshPhysicalMaterial({color:'#c4c7be',metalness:.72,roughness:.22,clearcoat:.12,envMap,envMapIntensity:1.05}));
  const rubber=own(new MeshStandardMaterial({color:'#282c29',roughness:.62,envMap,envMapIntensity:.55}));
  function roundedDisc(name:string,material:MeshStandardMaterial){
    const object=root.getObjectByName(name);if(!(object instanceof Mesh))return;
    object.geometry.computeBoundingBox();const b=object.geometry.boundingBox!,size=b.getSize(new Vector3()),center=b.getCenter(new Vector3());
    const radius=Math.max(size.x,size.z)/2,half=size.y/2,bevel=Math.min(.0023,half*.45);
    const profile=[[0,-half],[radius-bevel,-half],[radius-bevel*.28,-half+bevel*.28],[radius,-half+bevel],[radius,half-bevel],[radius-bevel*.28,half-bevel*.28],[radius-bevel,half],[0,half]].map(([x,y])=>new Vector2(x,y));
    object.geometry=own(new LatheGeometry(profile,96).translate(center.x,center.y,center.z));object.material=material;
  }
  roundedDisc('Desk_CD',body);roundedDisc('Desk_CD_Lid',lid);roundedDisc('Desk_CD_Seam',rubber);
  const disc=root.getObjectByName('Desk_CD_Disc');
  if(disc instanceof Mesh){
    disc.geometry.computeBoundingBox();const b=disc.geometry.boundingBox!,center=b.getCenter(new Vector3());
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d')!;
    c.fillStyle='#c0c0c0';c.fillRect(0,0,256,256);c.lineWidth=.55;
    for(let r=32;r<128;r+=1.7){c.strokeStyle=r%5<2?'#929292':'#aaaaaa';c.beginPath();c.arc(128,128,r,0,Math.PI*2);c.stroke();}
    const grooves=own(new CanvasTexture(canvas));
    const print=document.createElement('canvas');print.width=print.height=256;const ink=print.getContext('2d')!;
    ink.fillStyle='#d6d9d6';ink.fillRect(0,0,256,256);ink.strokeStyle='#89988f';ink.lineWidth=.6;
    for(const radius of [29,33,112,116]){ink.beginPath();ink.arc(128,128,radius,0,Math.PI*2);ink.stroke();}
    ink.fillStyle='#53655c';ink.textAlign='center';ink.font='bold 10px monospace';ink.font='8px monospace';ink.fillText('01 / NIGHT SESSIONS',128,199);ink.fillText('COMPACT DISC',128,211);
    const label=own(new CanvasTexture(print));label.colorSpace=SRGBColorSpace;
    disc.geometry=own(new RingGeometry(.018,.085,96,1).rotateX(-Math.PI/2).translate(center.x,b.max.y,center.z));
    disc.material=own(new MeshPhysicalMaterial({map:label,metalness:.9,roughness:.16,roughnessMap:grooves,bumpMap:grooves,bumpScale:.00006,iridescence:.35,iridescenceIOR:1.3,iridescenceThicknessRange:[180,240],envMap,envMapIntensity:1.15}));
  }
  const window=root.getObjectByName('Desk_CD_Window');
  if(window instanceof Mesh){
    window.material=rubber;
    window.geometry.computeBoundingBox();const b=window.geometry.boundingBox!,center=b.getCenter(new Vector3()),radius=Math.min(b.max.x-b.min.x,b.max.z-b.min.z)/2;
    const profile=Array.from({length:13},(_,i)=>{const r=1-i/12;return new Vector2(radius*.94*r,.0025*(1-r*r));});
    const glass=new Mesh(own(new LatheGeometry(profile,96)),own(new MeshPhysicalMaterial({color:'#f3f5f3',metalness:0,roughness:.045,clearcoat:1,clearcoatRoughness:.08,transparent:true,opacity:.12,depthWrite:false,envMap,envMapIntensity:1.1})));
    glass.name='Desk_CD_Glass';glass.position.set(center.x,b.max.y+.0038,center.z);glass.userData.roomDynamic=true;window.add(glass);
  }
  for(let i=0;i<3;i++){
    const name='Desk_CD_Button'+(i?'.'+String(i).padStart(3,'0'):'');roundedDisc(name,rubber);
    const object=root.getObjectByName(name);if(!(object instanceof Mesh))continue;
    object.userData.keepIndependent=true;
    object.geometry.computeBoundingBox();const b=object.geometry.boundingBox!,center=b.getCenter(new Vector3());
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const c=canvas.getContext('2d')!;
    c.strokeStyle=c.fillStyle='#d6d6c6';c.lineWidth=5;c.lineJoin='round';
    if(i===0){c.beginPath();c.moveTo(16,17);c.lineTo(36,32);c.lineTo(16,47);c.closePath();c.fill();c.fillRect(43,18,5,28);}
    else if(i===1)c.fillRect(18,18,28,28);
    else{c.beginPath();c.moveTo(12,26);c.lineTo(22,26);c.lineTo(34,16);c.lineTo(34,48);c.lineTo(22,38);c.lineTo(12,38);c.closePath();c.fill();c.beginPath();c.arc(31,32,18,-.75,.75);c.stroke();}
    const texture=own(new CanvasTexture(canvas));texture.colorSpace=SRGBColorSpace;
    const ink=new Mesh(own(new PlaneGeometry(.019,.019).rotateX(-Math.PI/2)),own(new MeshStandardMaterial({map:texture,transparent:true,depthWrite:false,roughness:.8})));
    ink.name=name+'_Legend';ink.position.set(center.x,b.max.y+.0002,center.z);ink.userData.roomDynamic=true;object.add(ink);
  }
  const lcd=root.getObjectByName('Desk_CD_Display'),print=root.getObjectByName('Desk_CD_Print_Digits');if(print)print.visible=false;
  const canvas=document.createElement('canvas');canvas.width=448;canvas.height=136;const c=canvas.getContext('2d')!;
  const map=own(new CanvasTexture(canvas));map.flipY=false;map.colorSpace=SRGBColorSpace;
  if(lcd instanceof Mesh){
    const geometry=own(lcd.geometry.clone());lcd.geometry=geometry;geometry.computeBoundingBox();const b=geometry.boundingBox!,p=geometry.attributes.position,uv=geometry.attributes.uv;
    for(let i=0;i<p.count;i++)uv.setXY(i,(p.getX(i)-b.min.x)/(b.max.x-b.min.x),(p.getZ(i)-b.min.z)/(b.max.z-b.min.z));uv.needsUpdate=true;
    lcd.material=own(new MeshBasicMaterial({map,toneMapped:false}));lcd.userData.keepIndependent=true;
  }
  let previous='';
  function update(transport:'playing'|'paused'|'stopped'|'muted'|'loading',time:number,volume:number){
    const seconds=Math.max(0,Math.floor(time%32)),bars=Math.round(volume*5),state=({playing:'PLAY',paused:'PAUSE',stopped:'STOP',muted:'MUTE',loading:'LOAD'})[transport],key=`${state}:${seconds}:${bars}`;if(key===previous)return;previous=key;
    c.fillStyle='#7d8d69';c.fillRect(0,0,448,136);c.fillStyle='#243329';c.font='bold 60px monospace';c.fillText(`01 ${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`,12,67);
    c.font='bold 25px monospace';c.fillText(state,14,116);for(let i=0;i<5;i++){c.globalAlpha=i<bars?1:.18;c.fillRect(310+i*22,104-i*5,14,12+i*5);}c.globalAlpha=1;map.needsUpdate=true;
  }
  update('stopped',0,.6);return{update};
}
