import { Box3, PerspectiveCamera, Quaternion, Spherical, Vector2, Vector3, type Object3D } from 'three';
import anchors from './anchors.json';
import type { RoomView } from './content';
import { constrainWindow, easeWindow, panWindow, windowBounds, windowInspection, windowDetailZoom, windowEntryFrame, windowSpan, zoomWindow, type WindowAnchor, type WindowFrame, type WindowProjection } from './window-navigation';
type Pose={position:Vector3;quaternion:Quaternion;target:Vector3};
type Lens={zoom:number;x:number;y:number};
export function createNavigation(camera:PerspectiveCamera,windowProjection:WindowProjection=windowInspection,room?:Object3D){
  const home:Pose={position:camera.position.clone(),quaternion:camera.quaternion.clone(),target:camera.position.clone().add(camera.getWorldDirection(new Vector3()).multiplyScalar(5.35))};
  function pose(position:number[],target:number[]):Pose{const c=new PerspectiveCamera(),t=new Vector3().fromArray(target);c.position.fromArray(position);c.lookAt(t);return{position:c.position,quaternion:c.quaternion,target:t};}
  const center=anchors.surfaces.about.reduce((s,p)=>s.add(new Vector3(...p as [number,number,number])),new Vector3()).multiplyScalar(.25);
  const upperLeft=new Vector3(...anchors.surfaces.about[0] as [number,number,number]);
  const right=new Vector3(...anchors.surfaces.about[1] as [number,number,number]).sub(upperLeft);
  const down=new Vector3(...anchors.surfaces.about[3] as [number,number,number]).sub(upperLeft);
  const normal=down.clone().cross(right).normalize();
  const computer=pose(center.clone().addScaledVector(normal,1.40).add(new Vector3(0,.025,0)).toArray(),center.toArray());
  const poses:Record<RoomView,Pose>={home,tv:pose([.015,1.69,2.24],[0,1.673,.34]),posts:pose([.035,1.78,3.66],[0,1.43,.34]),
    work:pose([1.35,2.65,6.65],[1.3,1.28,.10]),about:computer,online:computer,window:pose([...windowInspection.eye],[windowInspection.eye[0],windowInspection.eye[1],windowProjection.position[2]]),calculator:pose([-1.55,1.55,1.20],[-1.55,.81,.72]),
    cd:pose([2.40,1.65,1.20],[2.40,.74,.68]),clock:pose([2.48,1.06,.05],[2.48,.84,-.70]),
    rolodex:pose([-2.05,1.19, .40],[-1.67,.86,-.37]),walkman:pose([2.34,1.32,.42],[2.34,.74,-.13])};
  // Baking can split a prop's children into independent scene nodes. Frame
  // the delivered family rather than relying on an obsolete root location.
  function familyBounds(matches:(name:string)=>boolean){
    const bounds=new Box3();room?.updateWorldMatrix(true,true);
    room?.traverse(object=>{if(matches(object.name))bounds.union(new Box3().setFromObject(object));});
    return bounds.isEmpty()?undefined:bounds;
  }
  function inspectFamily(name:'clock'|'rolodex',prefix:string,offset:Vector3){
    const bounds=familyBounds(n=>n===prefix||n.startsWith(prefix+'_'));if(!bounds)return;
    const target=bounds.getCenter(new Vector3());poses[name]=pose(target.clone().add(offset).toArray(),target.toArray());
  }
  inspectFamily('clock','Desk_Clock',new Vector3(-.62,.10,0));
  inspectFamily('rolodex','Desk_Rolodex',new Vector3(-.14,.30,.70));
  const tvBounds=familyBounds(n=>n==='CRT_Case'||n==='CRT_ControlPanel'||n.startsWith('CRT_Slider'));
  function frameTV(){
    if(!tvBounds)return;
    const size=tvBounds.getSize(new Vector3()),target=tvBounds.getCenter(new Vector3());
    const tanY=Math.tan(camera.fov*Math.PI/360),tanX=tanY*camera.aspect;
    // Fit the nearest face, including the lowest control, with an 8% border.
    const distance=Math.max(size.x/(2*tanX*.84),size.y/(2*tanY*.84))+size.z/2;
    const next=pose(target.clone().add(new Vector3(0,0,distance)).toArray(),target.toArray());
    poses.tv.position.copy(next.position);poses.tv.quaternion.copy(next.quaternion);poses.tv.target.copy(next.target);
  }
  frameTV();
  const workDown=pose([.10,1.97,2.75],[.25,1.49,.05]);
  let view:RoomView='home',moving=false,started=0,duration=1200,paperRaised=false;
  let from=home,to=home;const look=new Vector2(),wanted=new Vector2(),pan=new Vector2();let zoom=1;
  let viewportWidth=1440,viewportHeight=900;
  let windowCurrent:WindowFrame={zoom:1,center:[.5,.5]},windowWanted:WindowFrame={zoom:1,center:[.5,.5]};
  let pendingWindowMode:'overview'|'detail'|undefined;
  const roomLens:Lens={zoom:1,x:0,y:0};let fromLens:Lens=roomLens;
  const windowAspect=()=>viewportWidth/viewportHeight;
  function resetWindow(){windowMode('overview');}
  function windowMode(mode:'overview'|'detail'){
    // The room card does not include the complete photograph. A shortcut
    // during the approach takes effect after the matched entry frame arrives.
    if(view==='window'&&moving){pendingWindowMode=mode;return;}
    windowWanted=constrainWindow({zoom:mode==='overview'?1:windowDetailZoom(windowAspect()),center:mode==='overview'?[.5,.5]:windowCurrent.center},windowAspect());
  }
  function windowEye(frame:WindowFrame){const[u,v]=frame.center;return new Vector3(windowInspection.eye[0]+(u-.5)*.36,windowInspection.eye[1]-(v-.5)*.16,windowInspection.eye[2]);}
  function windowLens(frame:WindowFrame):Lens{
    const [u,v]=frame.center,[spanU,spanV]=windowSpan(windowAspect(),frame.zoom),eye=windowEye(frame);
    const width=spanU*windowProjection.width,height=spanV*windowProjection.height;
    const distance=eye.z-windowProjection.position[2];
    const centerX=windowProjection.position[0]+(u-.5)*windowProjection.width;
    const centerY=windowProjection.position[1]-(v-.5)*windowProjection.height;
    return{zoom:2*distance*Math.tan(camera.fov*Math.PI/360)/height,x:(centerX-eye.x)/width,y:-(centerY-eye.y)/height};
  }
  function applyLens(lens:Lens){
    camera.zoom=lens.zoom;
    // A shifted frustum pans over the complete plate without turning it into a
    // trapezoid or moving the eye through the room's side walls.
    if(lens.x||lens.y||view==='window')camera.setViewOffset(viewportWidth,viewportHeight,lens.x*viewportWidth,lens.y*viewportHeight,viewportWidth,viewportHeight);
    else{if(camera.view?.enabled)camera.clearViewOffset();camera.updateProjectionMatrix();}
  }
  function applyWindow(){
    camera.position.copy(windowEye(windowCurrent));camera.quaternion.copy(poses.window.quaternion);applyLens(windowLens(windowCurrent));
  }
  function resize(width:number,height:number){
    viewportWidth=Math.max(1,width);viewportHeight=Math.max(1,height);
    frameTV();
    const fit=(frame:WindowFrame)=>constrainWindow({...frame,zoom:frame.zoom>=windowInspection.detailZoom-.001?Math.max(frame.zoom,windowDetailZoom(windowAspect())):frame.zoom},windowAspect());
    if(view==='window'&&moving)windowCurrent=windowWanted=windowEntryFrame(windowAspect(),windowProjection);
    else{windowCurrent=fit(windowCurrent);windowWanted=fit(windowWanted);}
    if(view==='window'&&!moving)applyWindow();
  }
  function transition(target:Pose,now:number,reduced:boolean){from={position:camera.position.clone(),quaternion:camera.quaternion.clone(),target:to.target.clone()};to=target;started=now;look.set(0,0);wanted.set(0,0);pan.set(0,0);zoom=1;
    fromLens={zoom:camera.zoom,x:camera.view?.enabled?camera.view.offsetX/camera.view.fullWidth:0,y:camera.view?.enabled?camera.view.offsetY/camera.view.fullHeight:0};
    duration=['about','online'].includes(view)&&from.position.distanceTo(to.position)>.3?3000:1200;
    const targetLens=view==='window'?windowLens(windowWanted):roomLens;
    moving=!reduced&&(from.position.distanceTo(to.position)>.00001||from.quaternion.angleTo(to.quaternion)>.00001||Math.abs(fromLens.zoom-targetLens.zoom)>.00001||Math.abs(fromLens.x-targetLens.x)>.00001||Math.abs(fromLens.y-targetLens.y)>.00001);
    if(!moving){camera.position.copy(to.position);camera.quaternion.copy(to.quaternion);applyLens(targetLens);}}
  function go(next:RoomView,now:number,reduced:boolean){
    pendingWindowMode=undefined;
    if(next==='window'){windowCurrent=windowEntryFrame(windowAspect(),windowProjection);windowWanted=windowCurrent;poses.window.position.copy(windowEye(windowCurrent));}
    view=next;transition(poses[next],now,reduced);
    if(view==='window'&&!moving)applyWindow();
  }
  function paper(raised:boolean,now:number,reduced:boolean){paperRaised=raised;if(view==='work')transition(raised?poses.work:workDown,now,reduced);}
  const canOrbit=()=>['home','window','tv','cd'].includes(view)||(view==='work'&&!paperRaised);
  function update(now:number,dt:number,motion:boolean){
    if(!moving&&pendingWindowMode){const mode=pendingWindowMode;pendingWindowMode=undefined;windowMode(mode);}
    if(moving){
      // Resize can change the arrival frame during an approach. Its eye and
      // lens must use the same target.
      if(view==='window')to.position.copy(windowEye(windowWanted));
      const t=Math.max(0,Math.min((now-started)/duration,1)),s=t*t*(3-2*t);camera.position.lerpVectors(from.position,to.position,s);camera.quaternion.slerpQuaternions(from.quaternion,to.quaternion,s);
      if(duration===3000)camera.position.z+=Math.sin(t*Math.PI)*.7;
      // Lens and off-axis centre arrive with the camera, not one frame after
      // the scene changes. Inverse zoom interpolates the actual frustum span.
      const lens=view==='window'?windowLens(windowWanted):roomLens;
      applyLens({zoom:1/((1-s)/fromLens.zoom+s/lens.zoom),x:fromLens.x+(lens.x-fromLens.x)*s,y:fromLens.y+(lens.y-fromLens.y)*s});
      if(t===1){moving=false;if(view==='window')windowCurrent=windowWanted;}
    }if(!moving){if(motion)look.lerp(wanted,1-Math.exp(-dt*10));else look.copy(wanted);camera.position.copy(to.position);camera.quaternion.copy(to.quaternion);
      if(view==='window'){
        windowCurrent=motion?easeWindow(windowCurrent,windowWanted,windowAspect(),1-Math.exp(-dt*10)):windowWanted;
        applyWindow();return moving;
      }
      if(camera.view?.enabled||camera.zoom!==1)applyLens(roomLens);
      if(canOrbit()){const target=to.target.clone().add(new Vector3(pan.x,pan.y,0).applyQuaternion(to.quaternion));const spherical=new Spherical().setFromVector3(to.position.clone().sub(to.target));spherical.theta-=look.x;spherical.phi=Math.max(.22,Math.min(Math.PI-.22,spherical.phi-look.y));
        spherical.radius*=zoom;camera.position.copy(target).add(new Vector3().setFromSpherical(spherical));camera.lookAt(target);}
      if(motion&&view==='home'){camera.position.x+=Math.sin(now*.00019)*.003;camera.position.y+=Math.sin(now*.00013)*.0015;}
    }
    return moving;
  }
  function drag(dx:number,dy:number,translate=false){if(moving||!canOrbit())return;
    if(view==='window'){windowWanted=panWindow(windowWanted,viewportWidth,viewportHeight,dx,dy);return;}
    // The right return contains a complete workstation. Let Home pan far
    // enough to inspect it while retaining the left wall clearance.
    const px=view==='home'?.85:.30,py=.22;
    if(translate){pan.x=Math.max(-.30,Math.min(px,pan.x-dx*.0015));pan.y=Math.max(-py,Math.min(py,pan.y+dy*.0015));}
    else{const yaw=.48,pitch=.20;wanted.x=Math.max(-yaw,Math.min(yaw,wanted.x+dx*.002));wanted.y=Math.max(-pitch,Math.min(pitch,wanted.y+dy*.0015));}}
  function finish(){moving=false;camera.position.copy(to.position);camera.quaternion.copy(to.quaternion);look.copy(wanted);if(view==='window'){windowCurrent=windowWanted;applyWindow();}else applyLens(roomLens);}
  return{go,paper,update,drag,finish,resize,windowMode,resetWindow,zoom:(delta:number,anchor?:WindowAnchor)=>{
    if(!canOrbit()||moving)return;
    if(view==='window'){windowWanted=zoomWindow(windowCurrent,windowAspect(),windowWanted.zoom*Math.exp(-delta*.001),anchor);return;}
    zoom=Math.max(.72,Math.min(view==='home'?1.30:1.22,zoom*Math.exp(delta*.0008)));
  },
    get windowState(){return{zoom:windowCurrent.zoom,center:[...windowCurrent.center],bounds:windowBounds(windowAspect(),windowCurrent.zoom),mode:windowCurrent.zoom<1.001?'overview' as const:'detail' as const};},
    get view(){return view;},get moving(){return moving;},get workPose(){return poses.work;},reset:()=>go('home',0,true)};
}
