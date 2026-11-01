import { Matrix4, Mesh, Object3D, PerspectiveCamera, Vector3 } from 'three';
import { mapPlane } from './osd';

export const tvSettings = {
  volume: {label:'音量',max:1,initial:.6},
  tracking: {label:'磁带跟踪',max:1,initial:0},
  chroma: {label:'色彩',max:1.6,initial:1},
} as const;
export type TVSetting = keyof typeof tvSettings;
export const clampTVValue=(id:TVSetting,value:number)=>Math.max(0,Math.min(tvSettings[id].max,Number.isFinite(value)?value:tvSettings[id].initial));
export const tvValueText=(id:TVSetting,value:number)=>`${tvSettings[id].label} ${Math.round(value*100)}%${id==='tracking'&&value===0?' · 标准':id==='chroma'&&value===1?' · 标准':''}`;

/** Native ranges sit on the authored rails. Their physical thumbs, printed
 * scales and live readout are the visible control, including keyboard input. */
export function createTVControls(root:Object3D,layer:HTMLElement,onInput:(id:TVSetting,value:number,commit:boolean)=>void){
  const hint=document.createElement('output');hint.className='tv-tuning-hint';hint.hidden=true;layer.append(hint);
  const controls=new Map<TVSetting,{mesh:Mesh;input:HTMLInputElement;corners:Vector3[];min:number;max:number;value:number}>();
  let active:TVSetting|undefined;
  for(const id of Object.keys(tvSettings) as TVSetting[]){
    const mesh=root.getObjectByName('CRT_Slider_'+id[0].toUpperCase()+id.slice(1));
    if(!(mesh instanceof Mesh)||!Array.isArray(mesh.userData.slider_surface))continue;
    mesh.userData.roomDynamic=true;mesh.userData.keepIndependent=true;
    const input=document.createElement('input');input.type='range';input.className='tv-slider';input.dataset.tvSetting=id;
    input.min='0';input.max=String(tvSettings[id].max);input.step='.01';input.value=String(tvSettings[id].initial);
    input.setAttribute('aria-label',tvSettings[id].label);input.setAttribute('aria-description','左右拖动或使用方向键调节；Home 最小，End 最大。');input.hidden=true;
    const control={mesh,input,corners:mesh.userData.slider_surface.map((p:number[])=>new Vector3(p[0],p[1],p[2])),min:Number(mesh.userData.slider_min_x),max:Number(mesh.userData.slider_max_x),value:tvSettings[id].initial as number};
    const railWidth=control.corners[0].distanceTo(control.corners[1]);
    input.style.setProperty('--tv-thumb-size',`${300*(1-(control.max-control.min)/railWidth)}px`);
    controls.set(id,control);layer.append(input);
    input.addEventListener('input',()=>{set(id,Number(input.value));onInput(id,control.value,false);show(id);});
    input.addEventListener('change',()=>onInput(id,control.value,true));
    input.addEventListener('pointerenter',()=>show(id));input.addEventListener('focus',()=>show(id));
    input.addEventListener('pointerleave',()=>{if(document.activeElement!==input)hide();});input.addEventListener('blur',hide);
    // Scene/global handlers must not turn slider keys into navigation or VCR actions.
    input.addEventListener('keydown',event=>{if(event.key!=='Escape')event.stopPropagation();});
    input.addEventListener('wheel',event=>event.stopPropagation(),{passive:true});
    set(id,tvSettings[id].initial);
  }
  function hide(){active=undefined;hint.hidden=true;}
  function show(id:TVSetting){
    const control=controls.get(id);if(!control||control.input.hidden)return;
    active=id;hint.textContent=tvValueText(id,control.value)+' · ← → 调节';hint.hidden=false;
    const box=control.input.getBoundingClientRect(),parent=layer.getBoundingClientRect();
    hint.style.left=Math.max(8,Math.min(parent.width-250,box.left-parent.left))+'px';hint.style.top=Math.max(8,box.top-parent.top-34)+'px';
  }
  function set(id:TVSetting,value:number){
    const control=controls.get(id);if(!control)return;
    control.value=clampTVValue(id,value);control.input.value=String(control.value);
    control.input.setAttribute('aria-valuetext',tvValueText(id,control.value));
    control.mesh.position.x=control.min+(control.max-control.min)*control.value/tvSettings[id].max;
    if(active===id)show(id);
  }
  const view=new Matrix4(),lens=new Matrix4();let previousWidth=0,previousHeight=0,previousVisible=false;
  function project(camera:PerspectiveCamera,width:number,height:number,visible:boolean){
    if(width===previousWidth&&height===previousHeight&&visible===previousVisible&&view.equals(camera.matrixWorldInverse)&&lens.equals(camera.projectionMatrix))return;
    previousWidth=width;previousHeight=height;previousVisible=visible;view.copy(camera.matrixWorldInverse);lens.copy(camera.projectionMatrix);
    for(const {input,corners} of controls.values()){
      const points=corners.map(point=>point.clone().project(camera));
      input.hidden=!visible||points.some(p=>p.z< -1||p.z>1)||points.every(p=>Math.abs(p.x)>1||Math.abs(p.y)>1);
      if(input.hidden)continue;
      mapPlane(input,300,44,points.map(p=>[(p.x+1)*width/2,(1-p.y)*height/2]));
    }
    if(!visible||(active&&controls.get(active)?.input.hidden))hide();else if(active)show(active);
  }
  return{set,project,dispose(){for(const {input}of controls.values())input.remove();hint.remove();}};
}
