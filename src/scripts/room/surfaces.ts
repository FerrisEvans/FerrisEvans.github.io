import { BufferGeometry, CanvasTexture, DoubleSide, Float32BufferAttribute, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Texture, Object3D, PerspectiveCamera, SRGBColorSpace, Vector3 } from 'three';
import anchors from './anchors.json';
import { mapPlane } from './osd';
import { pageInfo, pageSize, wrapText, type RoomContent, type RoomView } from './content';
import { tapes } from './tapes';
import { computerPages, paintComputer } from './computer';
import { paperLift, paperFlex } from './paper-shape';

type SurfaceView = 'posts'|'work'|'about'|'online';
const width=768,height=576;
/** Canvas textures are the visible interface; aligned native controls provide keyboard semantics. */
export function createSurfaces(scene:Object3D, resources:Set<{dispose():void}>,content:RoomContent,
  callbacks:{page(page:number):void;tape(index:number):void;paper():void;navigate(view:RoomView):void;wake():void}, paper:Object3D, environment:Texture) {
  const layer=document.querySelector<HTMLElement>('#surface-layer')!;
  const controls=new Map<SurfaceView,HTMLElement>();
  for(const view of ['posts','work','about','online'] as SurfaceView[]) {
    const el=document.createElement('section');el.className=`surface-controls surface-${view}`;
    el.setAttribute('aria-label', {posts:'电视中的文章列表',work:'记事本上的录像带目录',about:'电脑中的个人介绍',online:'电脑中的在线联系'}[view]);
    Object.assign(el.style,{width:`${width}px`,height:`${height}px`});el.hidden=true;layer.append(el);controls.set(view,el);
  }
  function place(el:HTMLElement,[x,y,w,h]:number[]){el.dataset.rect=JSON.stringify([x,y,w,h]);Object.assign(el.style,{left:`${x}px`,top:`${y}px`,width:`${w}px`,height:`${h}px`});}
  function label(el:HTMLElement,text:string){el.setAttribute('aria-label',text);el.title=text;el.append(Object.assign(document.createElement('span'),{className:'sr-only',textContent:text}));}
  function link(parent:HTMLElement,text:string,href:string,rect:number[],external=false){const a=document.createElement('a');a.href=href;label(a,text);if(external){a.target='_blank';a.rel='noopener noreferrer';}place(a,rect);parent.append(a);return a;}
  function button(parent:HTMLElement,text:string,rect:number[],action:()=>void){const b=document.createElement('button');b.type='button';label(b,text);place(b,rect);b.addEventListener('click',action);parent.append(b);return b;}
  const workCorners=anchors.surfaces.work.map(p=>paper.worldToLocal(new Vector3(...p as [number,number,number])));
  const paperBend:number[]=paper.userData.bend??[0,0];
  function paperPoint(u:number,v:number) {
    const top=workCorners[0].clone().lerp(workCorners[1],u),bottom=workCorners[3].clone().lerp(workCorners[2],u);
    const point=top.lerp(bottom,v);point.y+=paperLift(u,v,paperBend)+paperFlex(u,v,paper.userData.flex??0);return point;
  }
  function textureSurface(view:'work'|'about') {
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d')!;
    const map=new CanvasTexture(canvas);map.flipY=false;map.colorSpace=SRGBColorSpace;map.anisotropy=16;
    const geometry=new BufferGeometry();
    if(view==='work') {
      const positions:number[]=[],uv:number[]=[],indices:number[]=[];const columns=24,rows=18;
      for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){positions.push(...paperPoint(x/columns,y/rows).toArray());uv.push(x/columns,y/rows);}
      for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const a=y*(columns+1)+x;indices.push(a,a+columns+2,a+1,a,a+columns+1,a+columns+2);}
      geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));geometry.setIndex(indices);
    } else {
      const corners=anchors.surfaces.about.map(p=>new Vector3(...p as [number,number,number]));
      const normal=corners[3].clone().sub(corners[0]).cross(corners[1].clone().sub(corners[0])).normalize();
      const positions:number[]=[],uv:number[]=[],indices:number[]=[],columns=24,rows=18;
      for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){
        const u=x/columns,v=y/rows;
        const point=corners[0].clone().lerp(corners[1],u).lerp(corners[3].clone().lerp(corners[2],u),v);
        point.addScaledVector(normal,.004*(1-(u*2-1)**2)*(1-(v*2-1)**2));
        positions.push(...point.toArray());uv.push(u,v);
      }
      for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const a=y*(columns+1)+x;indices.push(a,a+columns+2,a+1,a,a+columns+1,a+columns+2);}
      geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
      geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));geometry.setIndex(indices);
    }
    geometry.computeVertexNormals();
    const material=view==='work'
      ? new MeshStandardMaterial({map,transparent:true,depthWrite:false,side:DoubleSide,roughness:.94,metalness:0})
      : new MeshPhysicalMaterial({color:0x050907,emissive:0xffffff,emissiveMap:map,emissiveIntensity:.82,
          roughness:.19,clearcoat:.28,clearcoatRoughness:.12,envMap:environment,envMapIntensity:.22,side:DoubleSide});
    const mesh=new Mesh(geometry,material);mesh.name=`Interface_${view}`;mesh.renderOrder=2;(view==='work'?paper:scene).add(mesh);
    resources.add(geometry);resources.add(map);resources.add(material);return{ctx,map,mesh};
  }
  const work=textureSurface('work'), computer=textureSurface('about');
  let selected:number|null=null;let computerPage=0,lineOffset=0,terminal=false,computerMode:'about'|'online'='about';
  const pages=computerPages(content);let dialing=false,dialStart=0,dialStep=-1;
  function paintWork() {
    const c=work.ctx,tape=selected===null?null:tapes[selected];c.clearRect(0,0,width,height);c.textAlign='left';
    // Light ruling belongs to the paper; transparent ink still receives room light.
    c.strokeStyle='rgba(93,114,119,.16)';c.lineWidth=.8;c.beginPath();
    for(let y=146;y<526;y+=29){c.moveTo(21,y);c.lineTo(747,y);}c.stroke();
    c.strokeStyle='rgba(152,90,65,.20)';c.beginPath();c.moveTo(23,25);c.lineTo(23,552);c.stroke();
    c.fillStyle='#342d21';c.font='38px RoomPixel,monospace';c.fillText('TAPE LIBRARY',35,56);
    c.font='24px RoomPixelZH,sans-serif';c.fillText('研究与实践',35,91);c.fillStyle='#7b6b51';c.fillRect(35,108,697,1);
    tapes.forEach((t,i)=>{const y=141+i*29;c.fillStyle=i===selected?'#845735':'#463f33';c.font='25px RoomPixel,monospace';c.fillText(`${i===selected?'>':' '} ${String(i+1).padStart(2,'0')} ${t.label}`,30,y);});
    c.fillStyle='#b6a78b';c.fillRect(363,130,1,343);c.fillStyle='#815634';c.font='29px RoomPixel,monospace';c.fillText(selected===null?'SELECT A TAPE':`TAPE ${String(selected+1).padStart(2,'0')}`,392,148);
    c.fillStyle='#332e25';c.font='24px RoomPixelZH,sans-serif';wrapText(c,tape?.title??'精选内容与概念动画',330,2).forEach((line,i)=>c.fillText(line,392,191+i*32));
    c.font='24px RoomPixelZH,sans-serif';wrapText(c,tape?.description??'选择左侧标题播放。录像带是精选内容，完整文章请查看 POSTS。',318,7).forEach((line,i)=>c.fillText(line,392,267+i*29));
    c.fillStyle='#815634';c.font='24px RoomPixelZH,sans-serif';if(tape)c.fillText('阅读全文 →',392,473);
    c.fillStyle='#62533c';c.font='25px RoomPixel,monospace';c.fillText('[ESC] PUT DOWN',40,521);
    work.map.needsUpdate=true;
    const section=controls.get('work')!;section.replaceChildren();
    tapes.forEach((t,i)=>{const b=button(section,`播放录像带 ${i+1}：${t.title}`,[28,117+i*29,320,29],()=>callbacks.tape(i));b.dataset.tape=t.id;b.setAttribute('aria-pressed',String(i===selected));});
    if(tape)link(section,'阅读全文：'+tape.title,tape.href,[384,450,342,34]);button(section,'放下记事本，继续播放',[28,489,310,48],callbacks.paper);
  }
  function paintPC() {
    const source=pages[computerPage],visible=(lineOffset===0?source.lines:[...source.lines.slice(lineOffset),...(pages[computerPage+1]?[pages[computerPage+1].title,...pages[computerPage+1].lines]:[])]).slice(0,8);
    paintComputer(computer.ctx,{title:source.title,lines:visible},computerPage,pages.length,computerMode,content);
    if(terminal){const c=computer.ctx;c.fillStyle='#09170f';c.fillRect(0,0,768,576);c.fillStyle='#b9d2a6';c.font='36px RoomPixel,monospace';c.fillText('486 PERSONAL COMPUTER',45,64);c.font='28px RoomPixelZH,monospace';c.fillText('选择一个文件',45,126);c.font='32px RoomPixel,monospace';c.fillText('1  ABOUT.TXT',50,217);c.fillText('2  ONLINE.BBS',50,307);c.fillText('ESC  RETURN TO DESK',50,510);}
    computer.map.needsUpdate=true;
    for(const key of ['about','online'] as const){const section=controls.get(key)!;section.replaceChildren();
      if(terminal){button(section,'打开 ABOUT.TXT',[40,165,680,75],()=>{terminal=false;callbacks.navigate('about');});button(section,'打开 ONLINE.BBS',[40,255,680,75],()=>{terminal=false;callbacks.navigate('online');});continue;}
      const text=document.createElement('p');text.className='sr-only';text.textContent=key==='about'?source.title.replace(/[。.!！?？]+$/u,'')+'。'+visible.join(' '):`GitHub ${content.github}。Email ${content.email}`;section.append(text);
      button(section,'在电脑中阅读关于',[48,18,220,54],()=>callbacks.navigate('about'));
      button(section,'在电脑中查看在线联系',[470,18,250,54],()=>callbacks.navigate('online'));
      if(key==='online'){
        link(section,'访问 GitHub',content.github,[48,185,672,72],true);link(section,'发送电子邮件',`mailto:${content.email}`,[48,285,672,72]);
      }else{
        const prev=button(section,'上一页个人介绍',[48,510,140,50],()=>changeComputerPage(-1));prev.disabled=computerPage===0;
        const next=button(section,'下一页个人介绍',[580,510,140,50],()=>changeComputerPage(1));next.disabled=computerPage===pages.length-1;
      }
    }
    document.querySelector<HTMLElement>('#room')!.dataset.computerPage=`${computerPage+1}/${pages.length}`;
  }
  function updateComputer(time:number,motion:boolean){if(!dialing)return;const elapsed=time-dialStart;if(!motion||elapsed>1.8){dialing=false;paintPC();return;}const step=Math.floor(elapsed/.45);if(step===dialStep)return;dialStep=step;const c=computer.ctx;c.fillStyle='#09170f';c.fillRect(0,0,768,576);c.fillStyle='#b9d2a6';c.font='36px RoomPixel,monospace';c.fillText('MODEM / 14400',48,70);c.font='32px RoomPixel,monospace';['ATZ','OK','ATDT 5550144','CONNECT 14400'].slice(0,step+1).forEach((line,i)=>c.fillText(line,48,160+i*65));computer.map.needsUpdate=true;}
  function changeComputerPage(delta:number){terminal=false;lineOffset=0;computerPage=Math.max(0,Math.min(pages.length-1,computerPage+delta));paintPC();callbacks.wake();}
  function computerKey(key:string){
    if(key.toLowerCase()==='q'){dialing=false;terminal=true;paintPC();callbacks.wake();return;}
    if(terminal){
      if(key==='1'){terminal=false;callbacks.navigate('about');}
      else if(key==='2'){terminal=false;callbacks.navigate('online');}
      callbacks.wake();return;
    }
    if(computerMode==='online'){
      if(!dialing&&(key==='1'||key==='2'))controls.get('online')?.querySelectorAll<HTMLAnchorElement>('a')[Number(key)-1]?.click();
      return;
    }
    if(key==='ArrowDown'){lineOffset++;if(lineOffset>=pages[computerPage].lines.length){if(computerPage<pages.length-1){computerPage++;lineOffset=0;}else lineOffset=Math.max(0,pages[computerPage].lines.length-1);}}
    else if(key==='ArrowUp'){lineOffset--;if(lineOffset<0){if(computerPage>0){computerPage--;lineOffset=pages[computerPage].lines.length-1;}else lineOffset=0;}}
    paintPC();callbacks.wake();
  }
  function setPage(requested:number){const {page,previous,next:hasNext}=pageInfo(content.posts.length,requested);document.querySelector<HTMLElement>('#room')!.dataset.postsPage=String(page+1);const section=controls.get('posts')!;section.replaceChildren();
    content.posts.slice(page*pageSize,(page+1)*pageSize).forEach((p,i)=>link(section,`${p.title}，${p.date}`,p.href,[48,130+i*76,672,70]));
    for(const [text,next,x]of[['上一页',page-1,48],['下一页',page+1,604]]as const){const b=button(section,text,[x,520,116,50],()=>callbacks.page(next));b.disabled=next<page?!previous:!hasNext;}
  }
  paintWork();paintPC();setPage(0);
  let previousPaperFlex=NaN;
  function project(camera:PerspectiveCamera,view:RoomView,w:number,h:number,enabled:boolean,raised:boolean){
    const flex=paper.userData.flex??0;
    if(flex!==previousPaperFlex){
      const positions=work.mesh.geometry.attributes.position;
      for(let y=0;y<=18;y++)for(let x=0;x<=24;x++){const point=paperPoint(x/24,y/18);positions.setXYZ(y*25+x,point.x,point.y,point.z);}
      positions.needsUpdate=true;work.mesh.geometry.computeVertexNormals();previousPaperFlex=flex;
    }
    for(const[key,el]of controls){el.hidden=!enabled||key!==view||(key==='work'&&!raised)||(key==='online'&&dialing);if(el.hidden)continue;
      if(key==='work') {
        el.style.transform='none';el.style.width=w+'px';el.style.height=h+'px';
        for(const control of el.querySelectorAll<HTMLElement>('[data-rect]')) {
          const [x,y,cw,ch]=JSON.parse(control.dataset.rect!);
          const points=[[x,y],[x+cw,y],[x+cw,y+ch],[x,y+ch]].map(([px,py])=>{const p=paper.localToWorld(paperPoint(px/width,py/height)).project(camera);return[(p.x+1)*w/2,(1-p.y)*h/2];});
          Object.assign(control.style,{left:'0',top:'0',transformOrigin:'0 0'});mapPlane(control,cw,ch,points);
        }
        continue;
      }
      const corners=anchors.surfaces[key==='online'?'about':key].map(p=>new Vector3(...p as [number,number,number]));
      const points=corners.map(p=>{p.project(camera);return[(p.x+1)*w/2,(1-p.y)*h/2];});mapPlane(el,width,height,points);
    }
  }
  return{project,setPage,updateComputer,changeComputerPage,computerKey,selectTape:(index:number|null)=>{selected=index;paintWork();},setMode:(mode:RoomView)=>{if(mode==='about'||mode==='online'){terminal=false;if(mode==='online'&&computerMode!=='online'){dialing=true;dialStart=performance.now()/1000;dialStep=-1;}else if(mode==='about')dialing=false;computerMode=mode;paintPC();}},dispose:()=>layer.replaceChildren()};
}
