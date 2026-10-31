import { Box3, BoxGeometry, Color, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Object3D, Quaternion, Vector3, type BufferAttribute, type InterleavedBufferAttribute } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Tape } from './tapes';
import { batchRoom } from './batch';
import { leafMotion } from './leaf-motion';
import { createPaperContact } from './paper-contact';
import { createObjectContact } from './object-contact';
import { paperFlex } from './paper-shape';
import anchors from './anchors.json';

type Resources = Set<{dispose():void}>;
// Mesh transport may interleave attributes; copying .array would include UVs
// and neighbouring fields as positions. Read the semantic attribute instead.
function coordinates(attribute:BufferAttribute|InterleavedBufferAttribute){
  const result=new Float32Array(attribute.count*3);
  for(let i=0;i<attribute.count;i++){result[i*3]=attribute.getX(i);result[i*3+1]=attribute.getY(i);result[i*3+2]=attribute.getZ(i);}
  return result;
}
/** Moving objects keep their hierarchy and get live materials, outside static batching. */
export function createProps(root: Object3D, resources: Resources) {
  root.updateMatrixWorld(true);
  const pad = root.getObjectByName('Work_Notepad')!;
  const padCenter = new Box3().setFromObject(pad).getCenter(new Vector3());
  const paper = new Group(); paper.name='Held_Notepad'; paper.position.copy(padCenter); root.add(paper);
  const paperParts:Object3D[]=[];root.traverse(o=>{if(o.name.startsWith('Work_Notepad'))paperParts.push(o);});paperParts.forEach(o=>paper.attach(o));
  paper.userData.bend=pad.userData.paper_bend??[0,0];
  const rest = {position:paper.position.clone(),quaternion:paper.quaternion.clone()};
  const lifted = {position:rest.position.clone(),quaternion:new Quaternion()};
  const paperFrom = {position:rest.position.clone(),quaternion:new Quaternion()};
  const paperVia = {position:rest.position.clone(),quaternion:new Quaternion()};
  let raised=false,paperStart=0,paperDuration=0,paperMoving=false;
  let paperAspect=1.6,paperPose:{position:Vector3;quaternion:Quaternion}|null=null;
  function readingPose(pose:{position:Vector3;quaternion:Quaternion}){
    const distance=2.20*Math.max(1,paperAspect/1.6);
    const lowerEdge=-.28-.66*(Math.max(1,1.6/paperAspect)-1);
    lifted.position.copy(new Vector3(.40,lowerEdge,-distance).applyQuaternion(pose.quaternion).add(pose.position));
    lifted.quaternion.copy(pose.quaternion).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),Math.PI/2-.12)).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.13)).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),.05));
  }
  function resize(width:number,height:number){
    paperAspect=width/Math.max(1,height);if(!paperPose)return;
    readingPose(paperPose);
    if(raised&&!paperMoving){paper.position.copy(lifted.position);paper.quaternion.copy(lifted.quaternion);}
  }
  const liveCache=new Map<MeshStandardMaterial,MeshStandardMaterial>();
  function live(object:Object3D,preserveBake=false) {
    object.traverse(child=>{
      child.userData.roomDynamic=true;
      if(!preserveBake && child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
        const old=child.material;
        const material=liveCache.get(old)??old.clone();
        material.lightMap=null;material.envMapIntensity=.8;
        liveCache.set(old,material);resources.add(material); child.material=material;
      }
    });
  }
  live(paper);
  const syncPaperContact=createPaperContact(root,paper,resources);
  const corners=anchors.surfaces.work.map(p=>paper.worldToLocal(new Vector3(...p as [number,number,number])));
  const along=corners[1].clone().sub(corners[0]),down=corners[3].clone().sub(corners[0]);
  const flexSheets:{mesh:Mesh;rest:Float32Array;u:Float32Array;v:Float32Array;direction:Vector3}[]=[];
  paper.traverse(object=>{
    if(!(object instanceof Mesh)||!/^Work_Notepad(?:$|_Loose)/.test(object.name))return;
    const geometry=object.geometry.clone();resources.add(geometry);object.geometry=geometry;
    const rest=coordinates(geometry.attributes.position),u=new Float32Array(rest.length/3),v=new Float32Array(rest.length/3);
    const direction=object.worldToLocal(paper.localToWorld(new Vector3(0,1,0))).sub(object.worldToLocal(paper.localToWorld(new Vector3())));
    for(let i=0;i<u.length;i++){
      const point=paper.worldToLocal(object.localToWorld(new Vector3().fromArray(rest,i*3))).sub(corners[0]);
      u[i]=Math.max(0,Math.min(1,point.dot(along)/along.lengthSq()));v[i]=Math.max(0,Math.min(1,point.dot(down)/down.lengthSq()));
    }
    geometry.computeBoundingSphere();if(geometry.boundingSphere)geometry.boundingSphere.radius+=.025;
    flexSheets.push({mesh:object,rest,u,v,direction});
  });
  let flex=0,flexVelocity=0;
  function flexPaper(amount:number){
    paper.userData.flex=amount;
    for(const sheet of flexSheets){
      const positions=sheet.mesh.geometry.attributes.position;
      for(let i=0;i<positions.count;i++){
        const offset=paperFlex(sheet.u[i],sheet.v[i],amount);
        positions.setXYZ(i,sheet.rest[i*3]+offset*sheet.direction.x,sheet.rest[i*3+1]+offset*sheet.direction.y,sheet.rest[i*3+2]+offset*sheet.direction.z);
      }
      positions.needsUpdate=true;sheet.mesh.geometry.computeVertexNormals();
    }
  }
  if(!pad.userData.paper_bend)paper.traverse(o=>{if(o instanceof Mesh&&o.material instanceof MeshStandardMaterial){o.material=o.material.clone();o.material.emissive=new Color(.12,.12,.12);o.material.emissiveMap=o.material.map;resources.add(o.material);}});
  const plant = new Group(); plant.name='Plant_Motion'; plant.position.set(-2.14,1.18,-.15);root.add(plant);
  const stems:Object3D[]=[];root.traverse(o=>{if(/^Plant_(Leaf|Stem)/.test(o.name))stems.push(o);});
  // Small idle sways retain local occlusion and lamp irradiance. Replacing
  // them with unshadowed hemisphere fill made even the resting leaves flat.
  stems.forEach(o=>plant.attach(o)); live(plant,true);
  const leaves:{pivot:Group;phase:number;blade?:{mesh:Mesh;rest:Float32Array;normal:Float32Array;weight:Float32Array;flex:number}}[]=[];
  for(const object of stems) {
    const base=object.userData.leaf_base;
    if(!/^Plant_Leaf/.test(object.name)||!Array.isArray(base)||base.length!==3)continue;
    const pivot=new Group();pivot.name=object.name+'_Flex';pivot.position.fromArray(base);
    root.add(pivot);pivot.attach(object);plant.attach(pivot);
    const phase=Number(object.userData.leaf_phase??leaves.length*2.3999632297);
    let blade:typeof leaves[number]['blade'];
    if(object instanceof Mesh&&Array.isArray(object.userData.leaf_tip)) {
      const geometry=object.geometry.clone();resources.add(geometry);object.geometry=geometry;
      object.updateWorldMatrix(true,false);
      const origin=object.worldToLocal(new Vector3().fromArray(base));
      const rest=coordinates(geometry.attributes.position),weight=new Float32Array(geometry.attributes.position.count);
      const point=new Vector3();let length=0;
      for(let i=0;i<weight.length;i++) {weight[i]=point.fromArray(rest,i*3).distanceTo(origin);length=Math.max(length,weight[i]);}
      for(let i=0;i<weight.length;i++)weight[i]=Math.pow(weight[i]/Math.max(.001,length),1.7);
      // Rest bounds include a small deformation margin for raycasting/culling.
      geometry.computeBoundingSphere();if(geometry.boundingSphere)geometry.boundingSphere.radius+=.055;
      blade={mesh:object,rest,normal:coordinates(geometry.attributes.normal),weight,flex:Number(object.userData.leaf_flex??.014)};
    }
    leaves.push({pivot,phase,blade});
  }
  const curtains:{mesh:Mesh;original:Float32Array;normals:Float32Array;bounds:Box3}[]=[];
  root.traverse(o=>{
    if(o instanceof Mesh&&/^Curtain_/.test(o.name)) {
      o.userData.roomDynamic=true;
      // Separate attributes before in-place deformation; shader UVs stay fixed.
      const geometry=o.geometry.clone(); resources.add(geometry);o.geometry=geometry;
      geometry.computeBoundingBox();
      curtains.push({mesh:o,original:coordinates(geometry.attributes.position),normals:coordinates(geometry.attributes.normal),bounds:geometry.boundingBox!.clone()});
    }
  });
  const shade=root.getObjectByName('Lamp_Shade');
  const shadeRest=shade?.quaternion.clone();
  if(shade)live(shade,true);
  const interior=root.getObjectByName('Lamp_Interior'); if(interior)live(interior,true);
  let curtainKick=-100,lampKick=-100,lastCloth=-1,clothWasMoving=false,lastLeaf=-1,leavesWereMoving=false;
  const transient=new Map<Object3D,{start:number;position:Vector3;quaternion:Quaternion;kind:string}>();
  const tapeHomes=new Map<string,Vector3>();
  root.traverse(o=>{if(/^VHS_[AB]_\d+$/.test(o.name)){const bounds=new Box3().setFromObject(o);if(!bounds.isEmpty())tapeHomes.set(o.name,bounds.getCenter(new Vector3()));}});
  const tapeGroup=new Group();tapeGroup.name='Moving_Cassette';root.add(tapeGroup);tapeGroup.visible=false;
  function material(color:string,roughness:number,metalness=0){const m=new MeshStandardMaterial({color,roughness,metalness});resources.add(m);return m;}
  const hubs:Object3D[]=[];
  const template=root.getObjectByName('VHS_Master');
  const masterHome=template?.getWorldPosition(new Vector3());
  if(template) {
    const pieces:Mesh[]=[];root.traverse(o=>{if(o instanceof Mesh&&o.name.startsWith('VHS_Master_'))pieces.push(o);});
    pieces.forEach(o=>template.attach(o));
    for(const [side,x]of [['Left',-.145],['Right',.145]]as const) {
      const reel=new Group();reel.name='Tape_Reel_'+side;reel.position.set(x,.013,-.047);template.add(reel);
      pieces.filter(o=>o.name.startsWith('VHS_Master_Reel_'+side)||o.name.startsWith('VHS_Master_ReelCut_'+side)).forEach(o=>reel.attach(o));
      batchRoom(reel,resources);reel.traverse(o=>o.userData.roomDynamic=true);
    }
    batchRoom(template,resources);template.traverse(o=>o.userData.roomDynamic=true);
    const model=template.clone(true);model.name='Authored_Moving_VHS';model.position.set(0,0,0);model.quaternion.identity();model.scale.set(1,1,1);tapeGroup.add(model);live(model);
    for(const side of ['Left','Right']) {const reel=model.getObjectByName('Tape_Reel_'+side);if(reel)hubs.push(reel);}
    // The visible cassette belongs to its sleeve's existing click target.
    root.getObjectByName('VHS_A_5')?.attach(template);
  } else {
  const shell=material('#242827',.44),silver=material('#b1b2a8',.28,.5),label=material('#ded7bb',.86);
  function part(geometry:BoxGeometry|CylinderGeometry|RoundedBoxGeometry,mat:MeshStandardMaterial,x:number,y:number,z:number){resources.add(geometry);const m=new Mesh(geometry,mat);m.position.set(x,y,z);tapeGroup.add(m);return m;}
  part(new RoundedBoxGeometry(.57,.041,.32,3,.007),shell,0,0,0);
  part(new BoxGeometry(.49,.002,.11),label,0,.022,.075);

  for(const x of [-.145,.145]) {
    part(new CylinderGeometry(.062,.062,.004,32),silver,x,.022,-.044);
    hubs.push(part(new CylinderGeometry(.026,.026,.007,12),shell,x,.025,-.044));
    for(let n=0;n<6;n++){const a=n*Math.PI/3;part(new BoxGeometry(.01,.004,.014),label,x+Math.cos(a)*.035,.026,-.044+Math.sin(a)*.035);}
  }
  part(new BoxGeometry(.49,.012,.018),shell,0,-.006,-.166);
  }
  let tapeStart=-100,tapePhase:'idle'|'inserting'|'returning'='idle',tapeFrom=new Vector3(),tapeTo=new Vector3();
  let physicalTape:Tape|null=null,pendingTape:Tape|null=null,returnFromSlot=false;
  const slot=new Vector3(-.22,.85,.32),approach=new Vector3(-.22,.85,.88);
  function syncRestingTape(){if(template)template.visible=physicalTape?.object!=='VHS_A_5';}
  function tapeHome(tape:Tape) {if(tape.object==='VHS_A_5'&&masterHome)return masterHome.clone();const p=tapeHomes.get(tape.object)?.clone()??new Vector3(1.1,1,.12);p.z+=.22;return p;}
  function insert(tape:Tape,time:number) {physicalTape=tape;syncRestingTape();tapeFrom=tapeHome(tape);tapeGroup.position.copy(tapeFrom);tapeGroup.rotation.set(0,0,0);tapeStart=time;tapePhase='inserting';tapeGroup.visible=true;}
  function selectTape(tape:Tape,time:number,reduced:boolean) {
    pendingTape=tape;
    if(reduced){physicalTape=tape;pendingTape=null;tapePhase='idle';tapeGroup.visible=false;syncRestingTape();return;}
    // A newer request replaces the pending selection without teleporting the
    // physical cassette already travelling back to its own sleeve.
    if(tapePhase==='returning')return;
    if(physicalTape){tapeFrom=tapeGroup.visible?tapeGroup.position.clone():slot.clone();returnFromSlot=tapeFrom.z<.86&&Math.abs(tapeFrom.x-slot.x)<.1&&tapeFrom.y<.96;tapeTo=tapeHome(physicalTape);tapeStart=time;tapePhase='returning';tapeGroup.visible=true;}
    else{pendingTape=null;insert(tape,time);}
  }
  function eject(time:number,reduced:boolean) {pendingTape=null;if(!physicalTape)return;if(reduced){tapePhase='idle';tapeGroup.visible=false;physicalTape=null;syncRestingTape();return;}tapeFrom=tapeGroup.visible?tapeGroup.position.clone():slot.clone();returnFromSlot=tapeFrom.z<.86&&Math.abs(tapeFrom.x-slot.x)<.1&&tapeFrom.y<.96;tapeTo=tapeHome(physicalTape);tapeStart=time;tapePhase='returning';tapeGroup.visible=true;}
  function setPaper(value:boolean,time:number,reduced:boolean,pose:{position:Vector3;quaternion:Quaternion}) {
    if(value===raised&&!paperMoving&&!reduced)return;
    raised=value;paperStart=time;paperDuration=value?.95:.70;
    // A close, lower foreground hold gives the pad a supported near edge.
    // The directory stays above that edge, while the room remains visible left.
    paperPose=pose;readingPose(pose);
    paperFrom.position.copy(paper.position);paperFrom.quaternion.copy(paper.quaternion);
    // Clear the desktop before tilting; return level before the final settle.
    paperVia.position.copy(value?paperFrom.position:rest.position);
    paperVia.position.y+=value?.05:Math.min(.05,Math.max(0,paperFrom.position.y-rest.position.y));
    paperVia.quaternion.copy(value?paperFrom.quaternion:rest.quaternion);
    paperMoving=!reduced;
    if(reduced){paper.position.copy(value?lifted.position:rest.position);paper.quaternion.copy(value?lifted.quaternion:rest.quaternion);flex=flexVelocity=0;flexPaper(0);}
    syncPaperContact();
  }
  function nudge(name:string,time:number) {
    if(name==='curtain'){curtainKick=time;return;}
    if(name==='lamp'){lampKick=time;return;}
    // A mechanical play key moves into its case; the entire player has weight.
    if(name==='Desk_CD')name='Desk_CD_Button';
    const object=movable.get(name)??root.getObjectByName(name);if(!object)return;
    if(!object.userData.roomDynamic)live(object);
    const existing=transient.get(object);
    transient.set(object,{start:time,position:existing?.position??object.position.clone(),quaternion:existing?.quaternion??object.quaternion.clone(),kind:name});
  }
  let heldMotion:{object:Object3D;from:Vector3;to:Vector3;fromQ:Quaternion;toQ:Quaternion;start:number}|null=null;
  let heldRest:{position:Vector3;quaternion:Quaternion}|null=null;
  function holdCalculator(value:boolean,time:number,reduced:boolean,camera:{position:Vector3;quaternion:Quaternion}){
    const object=movable.get('Desk_Calculator');if(!object)return;
    if(!heldRest)heldRest={position:object.position.clone(),quaternion:object.quaternion.clone()};
    const to=value?new Vector3(0,-.02,-1.05).applyQuaternion(camera.quaternion).add(camera.position):heldRest.position.clone();
    const toQ=value?camera.quaternion.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),Math.PI/2)).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.12)):heldRest.quaternion.clone();
    if(reduced){object.position.copy(to);object.quaternion.copy(toQ);heldMotion=null;}
    else heldMotion={object,from:object.position.clone(),to,fromQ:object.quaternion.clone(),toQ,start:time};
    syncCalculatorContact();
  }
  function update(time:number,motion:boolean,dt:number) {
    if(heldMotion){const t=Math.max(0,Math.min(1,(time-heldMotion.start)/.7)),s=t*t*(3-2*t);heldMotion.object.position.lerpVectors(heldMotion.from,heldMotion.to,s);heldMotion.object.quaternion.slerpQuaternions(heldMotion.fromQ,heldMotion.toQ,s);if(t===1)heldMotion=null;}
    if(paperMoving) {
      const t=Math.min(1,Math.max(0,(time-paperStart)/paperDuration)),split=raised?.18:.82;
      const from=t<split?paperFrom:paperVia,to=t<split?paperVia:raised?lifted:rest;
      const u=t<split?t/split:(t-split)/(1-split),s=u*u*(3-2*u);
      paper.position.lerpVectors(from.position,to.position,s);paper.quaternion.slerpQuaternions(from.quaternion,to.quaternion,s);
      syncPaperContact();
      if(t===1)paperMoving=false;
    }
    if(motion&&(paperMoving||Math.abs(flex)>.00002||Math.abs(flexVelocity)>.00002)){
      const t=Math.max(0,Math.min(1,(time-paperStart)/paperDuration));
      const target=paperMoving?Math.sin(t*Math.PI)*(raised?.021:-.006):0;
      // A damped response lets the free edge arrive after the supported pad.
      const step=Math.min(dt,1/30);flexVelocity+=(target-flex)*95*step;flexVelocity*=Math.exp(-step*12);flex+=flexVelocity*step;
      flex=Math.max(-.006,Math.min(.025,flex));flexPaper(flex);
    }else if(!motion&&(flex||flexVelocity)){flex=flexVelocity=0;flexPaper(0);}
    plant.rotation.z=motion?Math.sin(time*.65)*.004:0;
    const updateLeaves=motion?(time-lastLeaf>=1/30||!leavesWereMoving):leavesWereMoving||lastLeaf<0;
    if(updateLeaves){lastLeaf=time;leavesWereMoving=motion;}
    for(const {pivot,phase,blade} of leaves) {
      const flex=leafMotion(time,phase,motion);
      pivot.rotation.x=flex.twist; pivot.rotation.z=flex.twist*Math.cos(phase)*.6;
      if(!blade||!updateLeaves)continue;
      const attr=blade.mesh.geometry.attributes.position;
      for(let i=0;i<attr.count;i++) {
        const offset=blade.weight[i]*blade.flex*flex.bend;
        attr.setXYZ(i,blade.rest[i*3]+blade.normal[i*3]*offset,blade.rest[i*3+1]+blade.normal[i*3+1]*offset,blade.rest[i*3+2]+blade.normal[i*3+2]*offset);
      }
      attr.needsUpdate=true;
      if(motion)blade.mesh.geometry.computeVertexNormals();
      else {const normals=blade.mesh.geometry.attributes.normal;for(let i=0;i<normals.count;i++)normals.setXYZ(i,blade.normal[i*3],blade.normal[i*3+1],blade.normal[i*3+2]);normals.needsUpdate=true;}
    }
    if(shade&&shadeRest)shade.quaternion.copy(shadeRest).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),motion?Math.sin((time-lampKick)*11)*Math.exp(-(time-lampKick)*5)*.018:0));
    if(shade&&interior)interior.quaternion.copy(shade.quaternion);
    // Cloth can update at 30 Hz while camera motion renders at 60 Hz.
    const updateCloth=motion?(time-lastCloth>=1/30||!clothWasMoving):clothWasMoving||lastCloth<0;
    if(updateCloth){lastCloth=time;clothWasMoving=motion;}
    for(const {mesh,original,normals,bounds} of updateCloth?curtains:[]) {
      const attr=mesh.geometry.attributes.position;
      const extent=bounds.max.y-bounds.min.y;
      for(let i=0;i<attr.count;i++) {
        const x=original[i*3],y=original[i*3+1],z=original[i*3+2],weight=Math.pow(1-(y-bounds.min.y)/Math.max(.001,extent),1.7);
        const wave=motion?weight*(Math.sin(time*1.2+x*2.8)*.012+Math.sin((time-curtainKick)*5+x*3)*Math.exp(-(time-curtainKick)*1.4)*.06):0;
        attr.setXYZ(i,x+wave*.25,y,z+wave);
      }
      attr.needsUpdate=true;
      if(motion&&dt>0)mesh.geometry.computeVertexNormals();
      else if(!motion){const normal=mesh.geometry.attributes.normal;for(let i=0;i<normal.count;i++)normal.setXYZ(i,normals[i*3],normals[i*3+1],normals[i*3+2]);normal.needsUpdate=true;}
    }
    if(tapePhase!=='idle') {
      const t=Math.min(1,Math.max(0,(time-tapeStart)/(tapePhase==='returning'?.9:1.06))),s=t*t*(3-2*t);
      if(tapePhase==='inserting') {
        if(t<.65){const u=t/.65,v=u*u*(3-2*u);tapeGroup.position.lerpVectors(tapeFrom,approach,v);tapeGroup.position.y+=Math.sin(u*Math.PI)*.34;}
        else tapeGroup.position.lerpVectors(approach,slot,(t-.65)/.35);
        tapeGroup.rotation.set(0,Math.sin(t*Math.PI)*.18,Math.sin(t*Math.PI)*.08);
      } else if(returnFromSlot) {
        // Clear the recorder horizontally before the cassette rises; otherwise
        // its trailing half cuts through the hood during ejection.
        if(t<.32)tapeGroup.position.lerpVectors(tapeFrom,approach,t/.32);
        else {const u=(t-.32)/.68,v=u*u*(3-2*u);tapeGroup.position.lerpVectors(approach,tapeTo,v);tapeGroup.position.y+=Math.sin(u*Math.PI)*.23;}
      } else {tapeGroup.position.lerpVectors(tapeFrom,tapeTo,s);tapeGroup.position.y+=Math.sin(t*Math.PI)*.23;}
      if(t===1){const returning=tapePhase==='returning';tapePhase='idle';tapeGroup.visible=false;if(returning){physicalTape=null;syncRestingTape();if(pendingTape){const next=pendingTape;pendingTape=null;insert(next,time);}}}
    }
    hubs.forEach(h=>h.rotation.y=motion?time*2:0);
    for(const [object,value] of transient){const t=time-value.start;object.position.copy(value.position);object.quaternion.copy(value.quaternion);
      if(t>1.6||!motion){transient.delete(object);continue;}
      if(value.kind.startsWith('Desk_CD_Button')||value.kind.startsWith('Remote_Key')){
        object.position.y-=Math.sin(Math.min(1,t/.18)*Math.PI)*.0028;
        if(t>=.18)transient.delete(object);continue;
      }
      const lift=Math.sin(Math.min(1,t/1.6)*Math.PI);object.position.y+=lift*(value.kind.includes('Phone')?.10:.035);
      object.rotateZ(Math.sin(t*7)*Math.exp(-t*2)*.045);
      if(value.kind.includes('Shutter')){object.position.y=value.position.y;object.position.x+=Math.sin(Math.min(1,t/1.22)*Math.PI)*.045;}
      if(value.kind.includes('Pager')){object.position.y=value.position.y;object.position.x+=Math.sin(t*80)*Math.exp(-t*4)*.004;}
      if(value.kind.includes('Pencil')){object.position.y=value.position.y;object.position.z+=Math.sin(t*Math.PI/1.6)*.035;}
    }
    root.updateMatrixWorld(true);
    syncCalculatorContact();
  }
  const movable=new Map<string,Group>();
  for(const name of ['Retro_Phone','Desk_CD','Desk_Calculator','Desk_Pager','Desk_Floppy','Desk_Pencil','Desk_Rolodex','Desk_Walkman','Desk_Clock','Desk_ReplyCard']) {
    const base=root.getObjectByName(name);if(!base)continue;
    const group=new Group();group.name=name+'_Motion';group.position.copy(base.getWorldPosition(new Vector3()));root.add(group);
    const parts:Object3D[]=[];root.traverse(o=>{if(o!==group&&(o.name===name||o.name.startsWith(name+'_')))parts.push(o);});
    parts.forEach(o=>group.attach(o));live(group);
    movable.set(name,group);
  }
  const pencil=movable.get('Desk_Pencil');
  const calculator=movable.get('Desk_Calculator');
  const syncCalculatorContact=calculator?createObjectContact(root,calculator,root.getObjectByName('Desk_Book'),resources):()=>{};
  if(pencil){pencil.position.x=-.16;pencil.position.z=.86;pencil.rotation.y=.95;}
  root.traverse(o=>{if(/^(Mug_|Desk_Book)/.test(o.name))o.traverse(c=>c.userData.roomDynamic=true);});
  const hands:{object:Object3D;period:number}[]=[];
  root.traverse(o=>{if(/Desk_Floppy_Shutter|Desk_Clock_Hand_(Hour|Minute|Second)/.test(o.name)){o.userData.keepIndependent=true;o.userData.roomDynamic=true;}if(/Desk_Clock_Hand_(Hour|Minute|Second)$/.test(o.name))hands.push({object:o,period:o.name.endsWith('Hour')?43200:o.name.endsWith('Minute')?3600:60});});
  root.traverse(o=>{if(o.name.startsWith('Remote_Key')){o.userData.keepIndependent=true;o.userData.roomDynamic=true;}});
  function updateClock(){const now=new Date(),seconds=now.getHours()*3600+now.getMinutes()*60+now.getSeconds()+now.getMilliseconds()/1000;for(const h of hands)h.object.quaternion.setFromAxisAngle(new Vector3(0,0,1),-(seconds%h.period)/h.period*Math.PI*2);}
  function optimize(){
    // Branches share the root sway, so retain one draw for them. Blades keep
    // individual pivots without making every small petiole a separate draw.
    plant.traverse(o=>{if(o.name.startsWith('Plant_Stem'))delete o.userData.roomDynamic;});
    batchRoom(plant,resources);live(plant,true);
    for(const group of movable.values()){group.traverse(o=>{if(!o.userData.keepIndependent)delete o.userData.roomDynamic;});batchRoom(group,resources);group.traverse(o=>o.userData.roomDynamic=true);}
  }
  function finish(){
    paperMoving=false;const pose=raised?lifted:rest;paper.position.copy(pose.position);paper.quaternion.copy(pose.quaternion);
    syncPaperContact();
    flex=flexVelocity=0;flexPaper(0);
    if(heldMotion){heldMotion.object.position.copy(heldMotion.to);heldMotion.object.quaternion.copy(heldMotion.toQ);heldMotion=null;}
    syncCalculatorContact();
    if(tapePhase==='returning')physicalTape=pendingTape;
    pendingTape=null;tapePhase='idle';tapeGroup.visible=false;
    syncRestingTape();
    for(const[object,value]of transient){object.position.copy(value.position);object.quaternion.copy(value.quaternion);}transient.clear();
  }
  return {paper,resize,optimize,finish,updateClock,setPaper,holdCalculator,selectTape,eject,nudge,update,get raised(){return raised;},get moving(){return paperMoving||!!heldMotion||tapePhase!=='idle'||transient.size>0;},get paperMoving(){return paperMoving;},get loading(){return tapePhase!=='idle';},get tapeState(){return{tapePhase,physicalTape:physicalTape?.id??'',pendingTape:pendingTape?.id??''};}};
}
