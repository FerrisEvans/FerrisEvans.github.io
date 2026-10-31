import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3 } from 'three';
import { mapPlane } from './osd';
import { wrapText } from './content';

/** A small paper insert pulled from the desk, with native links on its surface. */
export function createCards(scene:Object3D,camera:PerspectiveCamera,resources:Set<{dispose():void}>,close:()=>void){
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=576;const ctx=canvas.getContext('2d')!;
  const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;
  const geometry=new PlaneGeometry(.72,.54);const material=new MeshBasicMaterial({map,side:DoubleSide,toneMapped:false});
  const mesh=new Mesh(geometry,material);mesh.name='Desk_Paper_Insert';mesh.visible=false;scene.add(mesh);[map,geometry,material].forEach(r=>resources.add(r));
  const section=document.createElement('section');section.className='surface-controls';section.hidden=true;Object.assign(section.style,{width:'768px',height:'576px'});document.querySelector('#surface-layer')!.append(section);
  let shown=false,started=0,instant=false;const from=new Vector3(),to=new Vector3(),fromQ=new Quaternion(),toQ=new Quaternion();
  const cards={credits:{title:'CREDITS / 制作记录',lines:['场景：独立建模与交互实现。','视觉研究参考：Felix Rieseberg 的个人书房。','原作模型、代码与素材未作为运行依赖。','字体：VT323 / Fusion Pixel（OFL）。','引擎：Three.js；建模与光照：Blender。'],href:'https://felixrieseberg.com/',label:'查看视觉参考原站 →'},rss:{title:'RSS / 循环之外',lines:['把文章送到你的 RSS 阅读器。','编程语言、游戏开发与 AI 的笔记。','复制订阅地址，或直接打开订阅文件。'],href:'/rss.xml',label:'打开 RSS 订阅 →'},audio:{title:'AFTER HOURS / 夜间播放',lines:['一段独立合成的钢琴循环。','打开 SOUND ON，然后使用 CD 控制播放。','场景声音不会自动开启。'],href:'',label:''}};
  function open(kind:keyof typeof cards,origin:Vector3,reduced:boolean){const card=cards[kind];shown=true;started=performance.now()/1000;instant=reduced;from.copy(origin);fromQ.identity();to.copy(new Vector3(0,0,-1.15).applyQuaternion(camera.quaternion).add(camera.position));toQ.copy(camera.quaternion);mesh.visible=true;
    ctx.fillStyle='#e8dec6';ctx.fillRect(0,0,768,576);ctx.fillStyle='#393a2b';ctx.font='36px RoomPixel,RoomPixelZH,monospace';ctx.fillText(card.title,40,64);ctx.fillStyle='#a89977';ctx.fillRect(40,87,688,2);ctx.fillStyle='#393a2b';ctx.font='24px RoomPixelZH,monospace';let y=143;for(const text of card.lines){for(const line of wrapText(ctx,text,684,3)){ctx.fillText(line,40,y);y+=32;}y+=12;}ctx.fillStyle='#744e2b';ctx.fillText(card.label,40,482);ctx.font='30px RoomPixel,monospace';ctx.fillText('ESC / PUT DOWN',40,545);map.needsUpdate=true;
    section.replaceChildren();const text=document.createElement('p');text.className='sr-only';text.textContent=card.lines.join(' ');section.append(text);
    if(card.href){const a=document.createElement('a');a.href=card.href;a.setAttribute('aria-label',card.label);a.textContent=card.label;a.className='card-link';Object.assign(a.style,{left:'35px',top:'445px',width:'690px',height:'55px',color:'transparent'});if(card.href.startsWith('https:')){a.target='_blank';a.rel='noopener noreferrer';}section.append(a);}
    const b=document.createElement('button');b.type='button';b.setAttribute('aria-label','放下卡片');Object.assign(b.style,{left:'35px',top:'510px',width:'690px',height:'55px'});b.addEventListener('click',close);section.append(b);
  }
  function hide(){shown=false;mesh.visible=false;section.hidden=true;}
  function update(time:number,width:number,height:number){if(!shown)return;const t=instant?1:Math.max(0,Math.min(1,(time-started)/.65)),s=t*t*(3-2*t);mesh.position.lerpVectors(from,to,s);mesh.quaternion.slerpQuaternions(fromQ,toQ,s);mesh.updateMatrixWorld(true);section.hidden=t<1;
    const points=[[-.36,.27,0],[.36,.27,0],[.36,-.27,0],[-.36,-.27,0]].map(p=>{const n=mesh.localToWorld(new Vector3(...p as [number,number,number])).project(camera);return[(n.x+1)*width/2,(1-n.y)*height/2];});mapPlane(section,768,576,points);}
  return{open,hide,finish:()=>{instant=true;},update,get shown(){return shown;},get moving(){return shown&&!instant&&performance.now()/1000-started<.65;}};
}
