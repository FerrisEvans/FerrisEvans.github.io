import { PerspectiveCamera, Quaternion, Spherical, Vector2, Vector3 } from 'three';
import anchors from './anchors.json';
import type { RoomView } from './content';
import { constrainWindow, easeWindow, panWindow, windowBounds, windowInspection, windowDetailZoom, windowSpan, zoomWindow, type WindowAnchor, type WindowFrame } from './window-navigation';
type Pose={position:Vector3;quaternion:Quaternion;target:Vector3};
export function createNavigation(camera:PerspectiveCamera){
  const home:Pose={position:camera.position.clone(),quaternion:camera.quaternion.clone(),target:camera.position.clone().add(camera.getWorldDirection(new Vector3()).multiplyScalar(5.35))};
  function pose(position:number[],target:number[]):Pose{const c=new PerspectiveCamera(),t=new Vector3().fromArray(target);c.position.fromArray(position);c.lookAt(t);return{position:c.position,quaternion:c.quaternion,target:t};}
  const center=anchors.surfaces.about.reduce((s,p)=>s.add(new Vector3(...p as [number,number,number])),new Vector3()).multiplyScalar(.25);
  const upperLeft=new Vector3(...anchors.surfaces.about[0] as [number,number,number]);
  const right=new Vector3(...anchors.surfaces.about[1] as [number,number,number]).sub(upperLeft);
  const down=new Vector3(...anchors.surfaces.about[3] as [number,number,number]).sub(upperLeft);
  const normal=down.clone().cross(right).normalize();
  const computer=pose(center.clone().addScaledVector(normal,1.40).add(new Vector3(0,.025,0)).toArray(),center.toArray());
  const poses:Record<RoomView,Pose>={home,tv:pose([.015,1.69,2.24],[0,1.673,.34]),posts:pose([.035,1.78,3.66],[0,1.43,.34]),
    work:pose([1.35,2.65,6.65],[1.3,1.28,.10]),about:computer,online:computer,window:pose([...windowInspection.eye],[...windowInspection.position]),calculator:pose([-1.55,1.55,1.20],[-1.55,.81,.72]),
    cd:pose([2.40,1.65,1.20],[2.40,.74,.68]),clock:pose([2.48,1.06,.05],[2.48,.84,-.70]),
    rolodex:pose([-2.05,1.19, .40],[-1.67,.86,-.37]),walkman:pose([2.34,1.32,.42],[2.34,.74,-.13])};
  const workDown=pose([.10,1.97,2.75],[.25,1.49,.05]);
  let view:RoomView='home',moving=false,started=0,duration=1200,paperRaised=false;
  let from=home,to=home;const look=new Vector2(),wanted=new Vector2(),pan=new Vector2();let zoom=1;
  let viewportWidth=1440,viewportHeight=900;
  let windowCurrent:WindowFrame={zoom:1,center:[.5,.5]},windowWanted:WindowFrame={zoom:1,center:[.5,.5]};
  const windowAspect=()=>viewportWidth/viewportHeight;
  function resetWindow(){windowWanted={zoom:1,center:[.5,.5]};}
  function windowMode(mode:'overview'|'detail'){
    windowWanted=constrainWindow({zoom:mode==='overview'?1:windowDetailZoom(windowAspect()),center:mode==='overview'?[.5,.5]:windowCurrent.center},windowAspect());
  }
  function applyWindow(){
    const [u,v]=windowCurrent.center,[spanU,spanV]=windowSpan(windowAspect(),windowCurrent.zoom);
    const width=spanU*windowInspection.width,height=spanV*windowInspection.height;
    const distance=windowInspection.eye[2]-windowInspection.position[2];
    camera.position.set(windowInspection.eye[0]+(u-.5)*.36,windowInspection.eye[1]-(v-.5)*.16,windowInspection.eye[2]);
    camera.quaternion.copy(poses.window.quaternion);
    camera.zoom=2*distance*Math.tan(camera.fov*Math.PI/360)/height;
    const centerX=windowInspection.position[0]+(u-.5)*windowInspection.width;
    const centerY=windowInspection.position[1]-(v-.5)*windowInspection.height;
    // A shifted frustum pans over the complete plate without turning it into a
    // trapezoid or moving the eye through the room's side walls.
    camera.setViewOffset(viewportWidth,viewportHeight,(centerX-camera.position.x)/width*viewportWidth,-(centerY-camera.position.y)/height*viewportHeight,viewportWidth,viewportHeight);
  }
  function resize(width:number,height:number){
    viewportWidth=Math.max(1,width);viewportHeight=Math.max(1,height);
    const fit=(frame:WindowFrame)=>constrainWindow({...frame,zoom:frame.zoom>=windowInspection.detailZoom-.001?Math.max(frame.zoom,windowDetailZoom(windowAspect())):frame.zoom},windowAspect());
    windowCurrent=fit(windowCurrent);windowWanted=fit(windowWanted);
    if(view==='window'&&!moving)applyWindow();
  }
  function transition(target:Pose,now:number,reduced:boolean){from={position:camera.position.clone(),quaternion:camera.quaternion.clone(),target:to.target.clone()};to=target;started=now;look.set(0,0);wanted.set(0,0);pan.set(0,0);zoom=1;
    duration=['about','online'].includes(view)&&from.position.distanceTo(to.position)>.3?3000:1200;
    moving=!reduced&&(from.position.distanceTo(to.position)>.00001||from.quaternion.angleTo(to.quaternion)>.00001);
    if(!moving){camera.position.copy(to.position);camera.quaternion.copy(to.quaternion);}}
  function go(next:RoomView,now:number,reduced:boolean){
    if(camera.view?.enabled)camera.clearViewOffset();camera.zoom=1;camera.updateProjectionMatrix();
    if(next==='window'){windowCurrent={zoom:windowDetailZoom(windowAspect()),center:[.5,.5]};windowWanted=windowCurrent;}
    view=next;transition(poses[next],now,reduced);
    if(view==='window'&&!moving)applyWindow();
  }
  function paper(raised:boolean,now:number,reduced:boolean){paperRaised=raised;if(view==='work')transition(raised?poses.work:workDown,now,reduced);}
  const canOrbit=()=>['home','window','tv','cd'].includes(view)||(view==='work'&&!paperRaised);
  function update(now:number,dt:number,motion:boolean){
    // The wide inspection lens is applied only after arrival. The room's
    // approach/return transition keeps its usual lens and no shifted frustum.
    if(view!=='window'||moving){if(camera.view?.enabled)camera.clearViewOffset();if(camera.zoom!==1){camera.zoom=1;camera.updateProjectionMatrix();}}
    if(moving){const t=Math.max(0,Math.min((now-started)/duration,1)),s=t*t*(3-2*t);camera.position.lerpVectors(from.position,to.position,s);camera.quaternion.slerpQuaternions(from.quaternion,to.quaternion,s);
      if(duration===3000)camera.position.z+=Math.sin(t*Math.PI)*.7;if(t===1)moving=false;
    }if(!moving){if(motion)look.lerp(wanted,1-Math.exp(-dt*10));else look.copy(wanted);camera.position.copy(to.position);camera.quaternion.copy(to.quaternion);
      if(view==='window'){
        windowCurrent=motion?easeWindow(windowCurrent,windowWanted,windowAspect(),1-Math.exp(-dt*10)):windowWanted;
        applyWindow();return moving;
      }
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
  function finish(){moving=false;camera.position.copy(to.position);camera.quaternion.copy(to.quaternion);look.copy(wanted);if(view==='window'){windowCurrent=windowWanted;applyWindow();}}
  return{go,paper,update,drag,finish,resize,windowMode,resetWindow,zoom:(delta:number,anchor?:WindowAnchor)=>{
    if(!canOrbit()||moving)return;
    if(view==='window'){windowWanted=zoomWindow(windowCurrent,windowAspect(),windowWanted.zoom*Math.exp(-delta*.001),anchor);return;}
    zoom=Math.max(.72,Math.min(view==='home'?1.30:1.22,zoom*Math.exp(delta*.0008)));
  },
    get windowState(){return{zoom:windowCurrent.zoom,center:[...windowCurrent.center],bounds:windowBounds(windowAspect(),windowCurrent.zoom),mode:windowCurrent.zoom<1.001?'overview' as const:'detail' as const};},
    get view(){return view;},get moving(){return moving;},get workPose(){return poses.work;},reset:()=>go('home',0,true)};
}
