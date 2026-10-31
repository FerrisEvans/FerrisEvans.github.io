import { AgXToneMapping, Box3, BoxGeometry, Color, FloatType, HalfFloatType, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Raycaster, Scene, SRGBColorSpace, Texture, Vector2, Vector3, WebGLRenderer, WebGLRenderTarget } from 'three';
import { loadRoomModel } from './model';
import { batchRoom } from './batch';
import { applyMaterialStudy } from './lighting';
import type { RoomAssets } from './assets';
import { createNavigation } from './navigation';
import { createSurfaces } from './surfaces';
import { createProps } from './props';
import { createCards } from './cards';
import { createDeskDetails } from './desk-details';
import { createCalculator,createCD,calculatorKeys } from './gadgets';
import { tapes } from './tapes';
import { createPlayback } from './playback';
import { createHomeTimeline, isHomePlaying } from './home-program';
import { renderPixelRatio } from './quality';
import { yieldForLoading, type LoadingReporter } from './loading';
import { createRoomGlow } from './glow';
import { warmScene } from './warmup';
import { createWindowScene } from './window-scene';
import { textureBytes } from './texture-budget';
import type { RoomContent, RoomView } from './content';

type Action={id:string;label:string;object:Object3D;mesh:Mesh;size:Vector3};
export async function createExperience(host:HTMLElement,assets:RoomAssets,signal:AbortSignal,lost:()=>void,
  content:RoomContent,callbacks:{navigate(view:RoomView):void;page(page:number):void;wake():void;feedback(message:string):void;music(value:boolean,reset?:boolean):void;musicTime():number;musicRunning():boolean;soundEnabled():boolean;volume(value:number):void;homeAudio(playing:boolean,time:number):void},
  graphics:{canvas:HTMLCanvasElement;context:WebGL2RenderingContext;dprCap?:number}, progress:LoadingReporter=()=>{}) {
  const pixelRatioCap=graphics.dprCap??2;
  const{canvas,context}=graphics,renderer=new WebGLRenderer({canvas,context,antialias:true});
  renderer.outputColorSpace=SRGBColorSpace;renderer.toneMapping=AgXToneMapping;renderer.toneMappingExposure=1;
  const scene=new Scene();scene.background=new Color('#777a7e');
  const resources=new Set<{dispose():void}>();let surfaces:ReturnType<typeof createSurfaces>|undefined,disposed=false;
  const dispose=()=>{if(disposed)return;disposed=true;for(const r of resources)r.dispose();surfaces?.dispose();renderer.dispose();canvas.remove();};
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost();},{signal});signal.addEventListener('abort',dispose,{once:true});
  try{
    progress({stage:'model',completed:0,total:2});await yieldForLoading(signal);
    const gltf=await loadRoomModel(assets,(completed,total)=>progress({stage:'model',completed,total:total*2}));
    progress({stage:'model',completed:1,total:2});await yieldForLoading(signal);
    gltf.scene.traverse(o=>{if(o instanceof Mesh){resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])resources.add(m);}});
    if(signal.aborted)throw new DOMException('Aborted','AbortError');
    const lighting=await applyMaterialStudy(gltf.scene,resources,renderer,assets,{progress,signal});
    const exportedCamera=gltf.cameras.find(item=>item.name==='HomeCamera');
    if(!(exportedCamera instanceof PerspectiveCamera))throw new Error('Missing HomeCamera');
    const camera=exportedCamera,horizontalHalfFov=Math.tan(camera.fov*Math.PI/360)*camera.aspect;
    scene.add(gltf.scene);scene.updateMatrixWorld(true);
    const worldPosition=camera.getWorldPosition(new Vector3()),worldQuaternion=camera.getWorldQuaternion(camera.quaternion.clone());
    camera.removeFromParent();camera.position.copy(worldPosition);camera.quaternion.copy(worldQuaternion);scene.add(camera);
    const navigation=createNavigation(camera),props=createProps(gltf.scene,resources);
    const windowScene=createWindowScene(lighting.inspectionMaterial,lighting.environment,resources,gltf.scene);
    const details=createDeskDetails(gltf.scene,resources);
    const calculator=createCalculator(gltf.scene,resources,callbacks.wake);
    const cd=createCD(gltf.scene,resources);
    const room=host.parentElement!,tooltip=document.querySelector<HTMLElement>('#object-hint')!;
    Object.assign(room.dataset,{assetBuildId:lighting.buildId??'legacy',anisotropy:String(lighting.anisotropy),reflectionSize:String(lighting.reflectionSize),reflections:lighting.reflectionMode});
    let reduced=false,currentTime=0,environmentTime=0,previousTime=0;
    const cards=createCards(gltf.scene,camera,resources,()=>{cards.hide();callbacks.wake();});
    let inspection:'window'|'calculator'|'tv'|'cd'|'clock'|'rolodex'|'walkman'|null=null,previousView:RoomView='home';
    const windowTransition=document.querySelector<HTMLCanvasElement>('#window-transition')!;
    const transitionContext=windowTransition.getContext('2d');
    const previousCamera=camera.clone();
    let previousWindowShown=false,hasPresented=false,transitionAnimation:Animation|undefined;
    signal.addEventListener('abort',()=>transitionAnimation?.cancel(),{once:true});
    function closeInspection(_immediate=false){
      if(!inspection)return;
      clearHover();
      const previous=inspection;inspection=null;delete room.dataset.inspection;
      if(previous==='calculator')props.holdCalculator(false,performance.now()/1000,reduced,camera);
      else{navigation.go(previousView,performance.now(),reduced);if(previousView==='work'&&!props.raised)navigation.paper(false,performance.now(),reduced);}
      callbacks.feedback(previousView==='work'?'选择录像带 · ESC 放下记事本':'已返回桌面');callbacks.wake();
    }
    function inspect(kind:'window'|'calculator'|'tv'|'cd'|'clock'|'rolodex'|'walkman'){
      if(inspection===kind){closeInspection();return;}if(inspection)closeInspection(true);
      clearHover();
      previousView=navigation.view;if(kind==='window')cards.hide();
      inspection=kind;room.dataset.inspection=kind;
      if(kind==='calculator')props.holdCalculator(true,performance.now()/1000,reduced,camera);
      else navigation.go(kind,performance.now(),reduced);callbacks.wake();
    }
    let paperHidden=false,choosingTape=false;
    const deck=createPlayback(tapes.length);
    const home=createHomeTimeline();
    let homeRequested:boolean|null=null,homeAdvancing=false;
    const homeTime=()=>lighting.film?.time??home.time;
    function syncTelevision(){const{selected,transport,time,powered,source,page}=deck.state;
      if(!powered||source!=='home')lighting.film?.setPlaying(false);
      lighting.setPower(powered);
      if(!powered)lighting.setProgram('off');
      else if(source==='posts')lighting.setPosts(content,page);
      else if(source==='tape'&&selected!==null){if(props.loading)lighting.setProgram('blank');else lighting.setTape(tapes[selected],time,transport!=='playing');}
      else lighting.setHome(homeTime(),reduced&&homeRequested===null);
      room.dataset.channel=powered?source:'off';room.dataset.television=powered?'on':'off';room.dataset.tvSource=source;
    }
    let lampWanted=true,lampRequest=0;
    let lampOn=true,lampLevel=1,musicOn=false,volume=.6,tracking=0,chroma=1,underscan=false,delay=false,blue=false;
    async function toggleLamp(){
      const wanted=lampWanted=!lampWanted,request=++lampRequest;
      try{
        if(!wanted){room.dataset.lampLoading='true';callbacks.feedback('台灯准备中…');await lighting.prepareLampOff();}
        if(disposed||request!==lampRequest)return;
        lampOn=wanted;delete room.dataset.lampLoading;props.nudge('lamp',currentTime);
        room.dataset.lamp=lampOn?'on':'off';callbacks.feedback(lampOn?'台灯已打开':'台灯已关闭');callbacks.wake();
      }catch{
        if(disposed||request!==lampRequest)return;
        lampWanted=lampOn;delete room.dataset.lampLoading;callbacks.feedback('台灯资源暂未就绪，请再次点击重试');callbacks.wake();
      }
    }
    function adjust(id:string,amount:number){
      if(id==='volume'){volume=Math.max(0,Math.min(1,volume+amount));callbacks.volume(volume);callbacks.feedback(`音量 ${Math.round(volume*100)}%`);}
      if(id==='tracking'){tracking=Math.max(0,Math.min(1,tracking+amount));lighting.effect('tracking',tracking);callbacks.feedback(`TRACKING ${Math.round(tracking*100)}%`);}
      if(id==='chroma'){chroma=Math.max(0,Math.min(1.6,chroma+amount));lighting.effect('chroma',chroma);callbacks.feedback(`CHROMA ${Math.round(chroma*100)}%`);}
      callbacks.wake();
    }
    function setPaper(raised:boolean){paperHidden=!raised;props.setPaper(raised,performance.now()/1000,reduced,navigation.workPose);navigation.paper(raised,performance.now(),reduced);room.dataset.paper=raised?'up':'down';callbacks.wake();}
    function beginTape(index:number){deck.select(index);const selected=deck.state.selected!;
      props.selectTape(tapes[selected],performance.now()/1000,reduced);surfaces?.selectTape(selected);
      syncTelevision();callbacks.feedback(`录像带 ${selected+1} · ${tapes[selected].title}`);callbacks.wake();}
    function chooseTape(index:number){const next=((index%tapes.length)+tapes.length)%tapes.length;
      if(navigation.view!=='work'){choosingTape=true;callbacks.navigate('work');choosingTape=false;}
      beginTape(next);
    }
    function pauseTape(){if(!deck.togglePlay()){callbacks.feedback('请先从记事本或书桌选择一盒录像带');callbacks.wake();return;}
      syncTelevision();callbacks.feedback(deck.state.transport==='playing'?'继续播放':'录像已暂停');callbacks.wake();}
    function ejectTape(){deck.eject();props.eject(performance.now()/1000,reduced);surfaces?.selectTape(null);
      delete room.dataset.tape;delete room.dataset.tapeTime;syncTelevision();callbacks.feedback('录像已退出');callbacks.wake();}
    function action(id:string){
      if(lighting.detailState==='failed')void prepareDetails().then(callbacks.wake,()=>{});
      if(id.startsWith('calc:')){calculator.press(calculatorKeys[Number(id.split(':')[1])]);callbacks.wake();return;}
      if(id.startsWith('tape:')){chooseTape(Number(id.split(':')[1]));return;}
      switch(id){
        case 'home-play':homeRequested=!(homeRequested??!reduced);callbacks.feedback(homeRequested?'播放 Home 节目':'Home 节目已暂停');break;
        case 'pager':details.page(currentTime);callbacks.feedback('寻呼机 · ONE MORE LOOP');break;
        case 'floppy':props.nudge('Desk_Floppy_Shutter',currentTime);break;
        case 'pencil':props.nudge('Desk_Pencil',currentTime);break;
        case 'clock':inspect('clock');callbacks.feedback('查看表盘 · ESC 返回');break;
        case 'rolodex':inspect('rolodex');callbacks.feedback('名片夹 · ESC 返回');break;
        case 'walkman':inspect('walkman');callbacks.feedback('随身听 · ESC 返回');break;
        case 'credits': case 'rss':{const name=id==='credits'?'Desk_Rolodex':id==='rss'?'Desk_ReplyCard':'Desk_Walkman';const object=gltf.scene.getObjectByName(name+'_Motion');cards.open(id==='credits'?'credits':id==='rss'?'rss':'audio',object?.getWorldPosition(new Vector3())??new Vector3(),reduced);callbacks.wake();break;}
        case 'volume': case 'tracking': case 'chroma':adjust(id,.2);break;
        case 'underscan':underscan=!underscan;lighting.effect('underscan',Number(underscan));callbacks.feedback(underscan?'UNDERSCAN ON':'UNDERSCAN OFF');break;
        case 'delay':delay=!delay;lighting.effect('delay',Number(delay));callbacks.feedback(delay?'H/V DELAY ON':'H/V DELAY OFF');break;
        case 'blue':blue=!blue;lighting.effect('blue',Number(blue));callbacks.feedback(blue?'BLUE ONLY ON':'BLUE ONLY OFF');break;
        case 'rewind':chooseTape((deck.state.selected??1)-1);break;
        case 'forward':chooseTape((deck.state.selected??-1)+1);break;
        case 'remote':props.nudge('Remote_Key',currentTime);deck.power();syncTelevision();callbacks.feedback(deck.state.powered?'电视已打开':'电视已关闭');break;
        case 'stop':deck.stop();syncTelevision();callbacks.feedback(deck.state.selected===null?'未插入录像带':'STOP · 录像停止并回到起点');break;
        case 'record':callbacks.feedback('WRITE PROTECTED · 录像带已写保护');break;
        case 'home': callbacks.navigate('home');break;
        case 'zoom': inspect('tv');break;
        case 'work': if(navigation.view==='work')setPaper(!props.raised);else callbacks.navigate('work');break;
        case 'posts': callbacks.navigate('posts');break;
        case 'about': callbacks.navigate('about');break;
        case 'online': callbacks.navigate('online');break;
        case 'window': inspect('window');callbacks.feedback(inspection==='window'?'窗外夜景 · 拖动查看 / SCROLL 缩放 / ESC 返回':'已返回书桌');break;
        case 'lamp': void toggleLamp();break;
        case 'curtain': props.nudge('curtain',currentTime);callbacks.feedback('窗边微风');break;
        case 'play': pauseTape();break;
        case 'next': chooseTape((deck.state.selected??-1)+1);break;
        case 'previous': chooseTape((deck.state.selected??1)-1);break;
        case 'eject': ejectTape();break;
        case 'power': deck.power();syncTelevision();callbacks.feedback(deck.state.powered?'电视已打开':'电视已关闭');break;
        case 'coffee': if(details.sip(currentTime,camera,reduced))callbacks.feedback('休息一下，再继续。');else if(details.getstate().empty)callbacks.feedback('咖啡喝完了。');break;
        case 'phone': callbacks.navigate('online');break;
        case 'cd':inspect('cd');callbacks.feedback('CD · M 返回 · 控件播放原创音乐');break;
        case 'music':props.nudge('Desk_CD',currentTime);musicOn=!musicOn;callbacks.music(musicOn);room.dataset.music=musicOn?'playing':'paused';callbacks.feedback(musicOn?'CD · 原创夜间钢琴循环（SOUND ON 可听）':'CD · 已暂停');break;
        case 'music-stop':props.nudge('Desk_CD_Button.001',currentTime);musicOn=false;callbacks.music(false,true);room.dataset.music='stopped';callbacks.feedback('CD · 已停止');break;
        case 'music-volume':props.nudge('Desk_CD_Button.002',currentTime);adjust('volume',volume>=.99?-.8:.2);break;
        case 'calculator': inspect('calculator');callbacks.feedback('计算器 · 点击按键或使用数字键');break;
      }
      callbacks.wake();
    }
    surfaces=createSurfaces(gltf.scene,resources,content,{page:callbacks.page,tape:chooseTape,paper:()=>setPaper(false),navigate:callbacks.navigate,wake:callbacks.wake},props.paper,lighting.environment);
    const targets:Action[]=[],hitMaterial=new MeshBasicMaterial();resources.add(hitMaterial);
    function addTarget(name:string,id:string,label:string,pad=.008){const object=gltf.scene.getObjectByName(name+'_Motion')??gltf.scene.getObjectByName(name);if(!object)return;
      const box=new Box3().setFromObject(object),size=box.getSize(new Vector3()).addScalar(pad),center=box.getCenter(new Vector3());
      const geometry=new BoxGeometry(size.x,size.y,size.z);resources.add(geometry);
      const mesh=new Mesh(geometry,hitMaterial);mesh.position.copy(center);mesh.layers.set(1);mesh.userData.action=id;scene.add(mesh);targets.push({id,label,object,mesh,size});}
    tapes.forEach((t,i)=>addTarget(t.object,`tape:${i}`,`播放 ${String(i+1).padStart(2,'0')} · ${t.title}`,.002));
    const objects=[['CRT_Screen','zoom','电视 · 放大 / 返回'],['CRT_Button','home','HOME'],['CRT_Button.001','work','WORK'],['CRT_Button.002','posts','POSTS'],['CRT_Button.003','underscan','UNDERSCAN'],['CRT_Button.004','delay','H/V DELAY'],['CRT_Button.005','blue','BLUE ONLY'],['CRT_Power','power','电视电源'],['CRT_Knob','volume','音量'],['CRT_Knob.001','tracking','TRACKING'],['CRT_Knob.002','chroma','CHROMA'],['Work_Notepad','work','记事本 · 录像带目录'],
      ['Desk_Remote','remote','遥控器 · 电视电源'],['Computer_Monitor','about','电脑 · 关于我'],['Computer_Keyboard','online','电脑 · 在线联系'],
      ['Lamp_Shade','lamp','台灯 · 开 / 关'],['Lamp_Base','lamp','台灯 · 开 / 关'],
      ['Curtain_Left','curtain','窗帘 · 轻碰'],['Curtain_Right','curtain','窗帘 · 轻碰'],['City_Backdrop','window','预览窗外夜景'],['Window_Handle','window','预览窗外夜景'],['Desk_Book','work','打开研究笔记'],
      ['Mug_Body','coffee','休息一下'],['Retro_Phone','phone','电话 · 联系方式'],['Desk_CD','cd','CD · 近景'],['Desk_CD_Button','music','CD 播放 / 暂停'],['Desk_CD_Button.001','music-stop','CD 停止'],['Desk_CD_Button.002','music-volume','CD 音量'],['Desk_Calculator','calculator','计算器'],
      ['Desk_Pager','pager','寻呼机 · 震动'],['Desk_Floppy','floppy','软盘 · 拨动防尘片'],['Desk_Pencil','pencil','铅笔 · 轻推'],['Desk_Clock','clock','时钟 · 查看表盘'],['Desk_Rolodex','rolodex','名片夹 · 近看'],['Desk_ReplyCard','rss','RSS 订阅卡'],['Desk_Walkman','walkman','随身听 · 近看'],
      ['VCR_Key','rewind','REW · 上一节目'],['VCR_Key.001','play','播放 / 暂停'],['VCR_Key.002','forward','FF · 下一节目'],['VCR_Key.003','stop','停止'],['VCR_Key.004','record','录制 / 写保护'],['VCR_TapeSlot','eject','退出录像带']] as const;
    objects.forEach(([name,id,label])=>addTarget(name,id,label));
    calculatorKeys.forEach((key,i)=>addTarget('Desk_Calculator_Key'+(i?'.'+String(i).padStart(3,'0'):''),'calc:'+i,'计算器 '+key,.001));
    props.optimize();batchRoom(gltf.scene,resources);
    const glow=createRoomGlow(renderer,scene,camera);resources.add(glow);
    renderer.info.autoReset=false;
    let textureBudget=0,budgetAt=0;
    function measureBudget(){
      textureBudget=0;const textures=new Set<Texture>();
      for(const resource of resources){
        if(resource instanceof Texture)textures.add(resource);
        else if('texture' in resource && resource.texture instanceof Texture)textures.add(resource.texture);
      }
      for(const map of textures){const size=map.image as {width?:number;height?:number;videoWidth?:number;videoHeight?:number}|undefined;textureBudget+=textureBytes(size?.videoWidth||size?.width||0,size?.videoHeight||size?.height||0,map.type===FloatType?16:map.type===HalfFloatType?8:4,map.generateMipmaps);}
      Object.assign(room.dataset,{textureBytesEstimate:String(textureBudget),glowBytesEstimate:String(glow.estimatedBytes),msaaSamples:String(context.getParameter(context.SAMPLES))});
      if(lighting.film){const stats=lighting.film.stats;Object.assign(room.dataset,{homeBackend:'video',videoDecoded:String(stats.decoded),videoDropped:String(stats.dropped),videoReady:String(stats.ready)});}
    }
    const raycaster=new Raycaster(),pointer=new Vector2();
    function pick(event:PointerEvent){if(room.dataset.state!=='active'||navigation.moving||props.moving||navigation.view==='window')return null;
      const rect=host.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);
      raycaster.setFromCamera(pointer,camera);raycaster.layers.set(1);
      const candidates=raycaster.intersectObjects(targets.map(t=>t.mesh),false).flatMap(hit=>{
        const target=targets.find(t=>t.mesh===hit.object)!;
        if(target.id!=='curtain')return [{target,distance:hit.distance}];
        // A pleated curtain's box contains empty air in front of the clock.
        // Use its live cloth surface so that air cannot steal another click.
        raycaster.layers.set(0);const cloth=raycaster.intersectObject(target.object,true)[0];raycaster.layers.set(1);
        return cloth?[{target,distance:cloth.distance}]:[];
      }).sort((a,b)=>a.distance-b.distance);
      const hit=candidates[0];if(!hit)return null;
      raycaster.layers.set(0);const obstruction=raycaster.intersectObject(gltf.scene,true)[0];
      if(obstruction&&obstruction.distance+.035<hit.distance)return null;
      return hit.target;
    }
    function clearHover(){host.style.cursor='';tooltip.hidden=true;delete room.dataset.hover;}
    const down=new Vector2(),last=new Vector2();let pressedPointer:number|undefined,dragged=false,knob:string|null=null,panDrag=false;
    host.addEventListener('pointerdown',event=>{if(![0,2].includes(event.button)||!event.isPrimary)return;panDrag=event.button===2;pressedPointer=event.pointerId;dragged=false;const target=pick(event);knob=target&&['volume','tracking','chroma'].includes(target.id)?target.id:null;down.set(event.clientX,event.clientY);last.copy(down);host.setPointerCapture(event.pointerId);},{signal});
    host.addEventListener('pointermove',event=>{

      if(event.pointerId===pressedPointer){if(down.distanceTo(new Vector2(event.clientX,event.clientY))>6)dragged=true;
        if(dragged){if(knob)adjust(knob,(event.clientX-last.x-event.clientY+last.y)*.004);else navigation.drag(event.clientX-last.x,event.clientY-last.y,panDrag);clearHover();host.style.cursor='grabbing';callbacks.wake();}last.set(event.clientX,event.clientY);if(dragged)return;}
      const target=pick(event);if(!target){clearHover();if(navigation.view==='window')host.style.cursor='grab';return;}host.style.cursor='pointer';tooltip.hidden=false;tooltip.textContent=target.label;
      tooltip.style.left=`${Math.min(event.clientX+16,room.clientWidth-250)}px`;tooltip.style.top=`${Math.min(event.clientY+16,room.clientHeight-55)}px`;room.dataset.hover=target.id;
    },{signal});
    host.addEventListener('pointerleave',()=>{clearHover();},{signal});
    host.addEventListener('pointercancel',()=>{pressedPointer=undefined;clearHover();},{signal});
    host.addEventListener('pointerup',event=>{if(event.pointerId!==pressedPointer)return;pressedPointer=undefined;host.releasePointerCapture(event.pointerId);
      if(panDrag||dragged||down.distanceTo(new Vector2(event.clientX,event.clientY))>6){clearHover();return;}
      if(cards.shown){cards.hide();callbacks.wake();return;}
      if(inspection==='calculator'){closeInspection();return;}
      // The raised paper is modal: one outside click only lowers the paper.
      if(navigation.view==='work'&&props.raised){setPaper(false);return;}
      const target=pick(event);if(target)action(target.id);
    },{signal});
    host.addEventListener('dblclick',()=>{if(navigation.view==='window'){navigation.resetWindow();callbacks.wake();}},{signal});
    host.addEventListener('contextmenu',event=>event.preventDefault(),{signal});
    host.addEventListener('wheel',event=>{if(room.dataset.state!=='active'||navigation.view==='about'||(props.raised&&navigation.view!=='window')||inspection==='calculator')return;event.preventDefault();const rect=host.getBoundingClientRect();navigation.zoom(event.deltaY,{x:2*(event.clientX-rect.left)/rect.width-1,y:1-2*(event.clientY-rect.top)/rect.height});callbacks.wake();},{signal,passive:false});
    let wheelAt=0;
    host.parentElement!.addEventListener('wheel',event=>{if(room.dataset.state!=='active'||navigation.view!=='about'||Math.abs(event.deltaY)<8)return;event.preventDefault();if(performance.now()-wheelAt>220){wheelAt=performance.now();surfaces?.changeComputerPage(event.deltaY>0?1:-1);}},{signal,passive:false});
    function resize(){if(disposed)return;const{width,height}=host.getBoundingClientRect();renderer.setPixelRatio(renderPixelRatio(devicePixelRatio,pixelRatioCap));renderer.setSize(width,height,false);glow.resize(width,height,renderer.getPixelRatio());camera.aspect=width/height;camera.fov=2*Math.atan(horizontalHalfFov/camera.aspect)*180/Math.PI;camera.updateProjectionMatrix();props.resize(width,height);navigation.resize(width,height);}
    function render(time=0,motion=false,snow=0,reveal=0){if(disposed)return;currentTime=time;const elapsed=time-previousTime,dt=Math.max(0,Math.min(elapsed,.1));previousTime=time;reduced=!motion;
      const active=room.dataset.state==='active',animated=motion&&active;if(animated)environmentTime+=dt;
      if(active)lighting.updateDetails(dt,motion);
      if(room.dataset.lightingDetails!==lighting.detailState)budgetAt=0;
      room.dataset.lightingDetails=lighting.detailState;
      navigation.update(time*1000,dt,animated);
      props.update(time,animated,dt);details.update(time,animated,dt);props.updateClock();
      cd.update(musicOn?(!callbacks.soundEnabled()?'muted':callbacks.musicRunning()?'playing':'loading'):callbacks.musicTime()>0?'paused':'stopped',callbacks.musicTime(),volume);
      lampLevel=reduced?Number(lampOn):lampLevel+(Number(lampOn)-lampLevel)*(1-Math.exp(-dt*12));lighting.setLamp(lampLevel);
      // A selected tape is user-requested content. Reduced motion freezes the
      // room's decorative movement, not the VCR transport.
      if(active&&!document.hidden)deck.tick(elapsed>.25?0:dt,props.loading);
      const{selected,time:tapeTime,transport,powered,source}=deck.state;
      const homePlaying=isHomePlaying({view:navigation.view,source,powered,active,motion,hidden:document.hidden,requested:homeRequested});
      homeAdvancing=homePlaying;
      if(lighting.film)lighting.film.setPlaying(homePlaying);
      else home.tick(elapsed>.25?0:dt,homePlaying);
      const filmTime=homeTime(),playing=lighting.film?lighting.film.playing:homePlaying;
      if(active&&powered&&source==='home')lighting.setHome(filmTime,reduced&&homeRequested===null);
      callbacks.homeAudio(playing,filmTime);
      room.dataset.homeTime=filmTime.toFixed(3);room.dataset.homeProgram=reduced&&homeRequested===null?'still':playing?'playing':lighting.film?.failed?'blocked':'paused';
      if(powered&&source==='tape'&&selected!==null&&!props.loading)lighting.setTape(tapes[selected],tapeTime,transport!=='playing');
      room.dataset.playback=selected===null?'empty':props.loading?'loading':transport;
      room.dataset.television=powered?'on':'off';room.dataset.tvSource=source;room.dataset.channel=powered?source:'off';
      if(selected!==null){room.dataset.tape=tapes[selected].id;room.dataset.tapeTime=tapeTime.toFixed(2);}
      else{delete room.dataset.tape;delete room.dataset.tapeTime;}
      Object.assign(room.dataset,props.tapeState);
      camera.updateMatrixWorld(true);surfaces?.updateComputer(time,animated);
      lighting.updateWeather(environmentTime,Math.max(-.004,Math.min(.004,(camera.position.x-worldPosition.x)*.002)),Math.max(-.002,Math.min(.002,(camera.position.y-worldPosition.y)*.001)),animated,selected===null?undefined:tapeTime);
      const linear=lighting.updateCRT(time,motion,snow,reveal);renderer.info.reset();const windowShown=navigation.view==='window'&&!navigation.moving;
      if(hasPresented&&windowShown!==previousWindowShown&&!reduced&&transitionContext){
        // Re-render the last real view before crossing scene/lens boundaries.
        // Dissolve that image over the next view; never insert an opaque color.
        const currentCamera=camera.clone();camera.copy(previousCamera);camera.updateMatrixWorld(true);
        glow.render(previousWindowShown?windowScene:scene);
        windowTransition.width=canvas.width;windowTransition.height=canvas.height;
        transitionContext.drawImage(canvas,0,0);
        camera.copy(currentCamera);camera.updateMatrixWorld(true);
        transitionAnimation?.cancel();
        transitionAnimation=windowTransition.animate([{opacity:1},{opacity:0}],{duration:320,easing:'ease-out'});
        transitionAnimation.onfinish=()=>{windowTransition.width=windowTransition.height=1;};
      }
      glow.render(windowShown?windowScene:scene);
      previousCamera.copy(camera);previousWindowShown=windowShown;hasPresented=true;
      room.dataset.windowActive=String(windowShown);
      if(windowShown){const w=navigation.windowState;Object.assign(room.dataset,{windowMode:w.mode,windowZoom:w.zoom.toFixed(4),windowCenter:w.center.map(v=>v.toFixed(6)).join(','),windowBounds:JSON.stringify(w.bounds)});document.querySelectorAll<HTMLElement>('#window-controls button[data-window-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.windowMode===w.mode)));}
      if(!budgetAt||time-budgetAt>2){measureBudget();budgetAt=time;}
      const{width,height}=host.getBoundingClientRect();surfaces?.project(camera,navigation.view,width,height,active&&!(navigation.view==='posts'&&!powered)&&!navigation.moving&&!props.paperMoving,props.raised);
      cards.update(time,width,height);
      calculator.project(camera,width,height,active&&inspection==='calculator'&&!props.moving);
      const detailState=details.getstate();Object.assign(room.dataset,{coffeeSips:String(detailState.sips),coffeeLevel:detailState.level.toFixed(3),coffeeSteam:String(detailState.steam>0),pager:String(detailState.pages),pagerLight:detailState.pagerLit.toFixed(3)});
      Object.assign(room.dataset,{environmentTime:environmentTime.toFixed(3),cameraMoving:String(navigation.moving),propMoving:String(props.moving),cameraPosition:camera.position.toArray().map(n=>n.toFixed(4)).join(','),tvLinear:linear.join(','),triangles:String(renderer.info.render.triangles),drawCalls:String(renderer.info.render.calls),textures:String(renderer.info.memory.textures),geometries:String(renderer.info.memory.geometries),pixelRatio:String(renderer.getPixelRatio()),lamp:lampOn?'on':'off'});
    }
    lighting.setProgram('blank');resize();
    progress({stage:'model',completed:2,total:2});await yieldForLoading(signal);
    const endShaders=assets.timing?.start('shaders.total');
    const compile=async(name:string,operation:()=>Promise<unknown>)=>{const end=assets.timing?.start('shaders.'+name);try{await operation();end?.();}catch(error){end?.('error');throw error;}};
    const shaderVariants=lighting.film?4:3;
    progress({stage:'shaders',completed:0,total:shaderVariants});await yieldForLoading(signal);
    if(lighting.film){lighting.setHome(0,false);await compile('beauty',()=>renderer.compileAsync(scene,camera));await compile('glow',()=>glow.compile());lighting.setProgram('blank');progress({stage:'shaders',completed:1,total:shaderVariants});await yieldForLoading(signal);}
    await compile('beauty',()=>renderer.compileAsync(scene,camera));
    progress({stage:'shaders',completed:shaderVariants-1,total:shaderVariants});await yieldForLoading(signal);
    await compile('glow',()=>glow.compile());
    await compile('window',()=>renderer.compileAsync(windowScene,camera));
    await compile('window-glow',()=>glow.compile(windowScene));
    // Spectacle transmission redraws the opaque room into a linear target.
    // Its shaders differ from the AgX beauty pass; warming isolated materials
    // alone leaves this full-room variant to compile synchronously on entry.
    const transmissionTarget=new WebGLRenderTarget(1,1,{type:HalfFloatType});
    try{
      renderer.setRenderTarget(transmissionTarget);
      await compile('transmission',()=>renderer.compileAsync(scene,camera));
      await warmScene(renderer,scene,camera,()=>yieldForLoading(signal));
    }finally{renderer.setRenderTarget(null);transmissionTarget.dispose();}
    progress({stage:'shaders',completed:shaderVariants,total:shaderVariants});await yieldForLoading(signal);
    endShaders?.();
    if(signal.aborted)throw new DOMException('Aborted','AbortError');
    const endWarmup=assets.timing?.start('frame.warmup');
    await warmScene(renderer,scene,camera,async(completed,total)=>{
      progress({stage:'frame',completed:completed/total,total:4});
      await yieldForLoading(signal);
    });
    await glow.warmup(async(completed,total)=>{
      progress({stage:'frame',completed:1+completed/total,total:4});
      await yieldForLoading(signal);
    });
    endWarmup?.();
    const endFirstFrame=assets.timing?.start('frame.first-submit');
    host.append(canvas);render();endFirstFrame?.();
    if(context.isContextLost())throw new Error('Graphics context lost during first frame');
    progress({stage:'frame',completed:3,total:4});await yieldForLoading(signal);
    const endSecondFrame=assets.timing?.start('frame.second-submit');
    render();endSecondFrame?.();progress({stage:'frame',completed:4,total:4});await yieldForLoading(signal);
    function navigate(view:RoomView,page:number,isReduced:boolean){reduced=isReduced;cards.hide();if(inspection)closeInspection(true);clearHover();navigation.go(view,performance.now(),reduced);surfaces?.setMode(view);
      if(lighting.detailState==='failed')void prepareDetails().then(callbacks.wake,()=>{});
      const raised=view==='work'&&!(choosingTape&&paperHidden);if(view==='work'&&!choosingTape)paperHidden=false;
      props.setPaper(raised,performance.now()/1000,reduced,navigation.workPose);room.dataset.paper=raised?'up':'down';if(view==='work')navigation.paper(raised,performance.now(),reduced);
      deck.navigate(view,page);if(view==='posts')surfaces?.setPage(page);syncTelevision();
    }
    function setPage(page:number){deck.navigate('posts',page);syncTelevision();surfaces?.setPage(page);}
    function settle(){reduced=true;transitionAnimation?.cancel();navigation.finish();props.finish();cards.finish();lampLevel=Number(lampOn);}
    function standby(){
      transitionAnimation?.cancel();hasPresented=false;
      lighting.film?.reset();
      homeRequested=null;homeAdvancing=false;
      clearHover();cards.hide();details.reset();inspection=null;delete room.dataset.inspection;

      props.holdCalculator(false,0,true,camera);props.eject(0,true);props.finish();
      environmentTime=previousTime=0;deck.reset();home.reset();lighting.setPower(true);callbacks.homeAudio(false,0);surfaces?.selectTape(null);delete room.dataset.tape;delete room.dataset.tapeTime;musicOn=false;callbacks.music(false,true);room.dataset.music='stopped';
      navigation.reset();props.setPaper(false,0,true,navigation.workPose);room.dataset.paper='down';
      lighting.setProgram('blank');render();
    }
    function escape(){if(cards.shown){cards.hide();callbacks.wake();return true;}if(inspection){closeInspection();return true;}if(navigation.view==='work'&&props.raised){setPaper(false);return true;}return false;}
    function suspend(){lighting.film?.setPlaying(false);callbacks.homeAudio(false,homeTime());}
    async function prepareDetails(){try{const pending=lighting.prepareDetails();room.dataset.lightingDetails=lighting.detailState;await pending;if(room.dataset.capture)lighting.updateDetails(1,false);}finally{room.dataset.lightingDetails=lighting.detailState;}}
    return{resize,render,navigate,setPage,standby,settle,escape,action,chooseTape,suspend,prepareDetails,returnFromWindow:()=>{if(inspection==='window')closeInspection();},windowMode:(mode:'overview'|'detail')=>{if(navigation.view==='window'){navigation.windowMode(mode);callbacks.wake();}},get windowActive(){return inspection==='window';},nextTape:()=>chooseTape((deck.state.selected??-1)+1),computerPage:(delta:number)=>surfaces?.changeComputerPage(delta),calculatorKey:calculator.press,computerKey:(key:string)=>surfaces?.computerKey(key),
      setProgram:lighting.setProgram,get calculatorActive(){return inspection==='calculator';},get mediaPlaying(){return homeAdvancing||deck.state.transport==='playing'||musicOn&&callbacks.musicRunning();},get moving(){return navigation.moving||props.moving||cards.moving||details.moving||lighting.detailsMoving||Math.abs(lampLevel-Number(lampOn))>.001;},dispose};
  }catch(error){for(const r of resources)r.dispose();dispose();throw error;}
}
