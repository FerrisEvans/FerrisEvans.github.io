import { BufferGeometry, Mesh, Object3D, Raycaster, Texture, Vector2, type Intersection, type Material } from 'three';

export type SurfaceTarget = { id:string; label:string; roots:Object3D[] };

function visible(object:Object3D){
  for(let current:Object3D|null=object;current;current=current.parent)if(!current.visible)return false;
  return true;
}
function materialAt(mesh:Mesh,index=0):Material{return Array.isArray(mesh.material)?mesh.material[index]:mesh.material;}
function solid(material:Material){return material.visible&&!(material.transparent&&!material.depthWrite);}

/** Keep the original local bounds for targets and their occluders. A render
 * batch can span the room; raycasting it defeats individual object culling.
 * These CPU meshes never join the rendered scene or allocate GPU geometry. */
export function createSurfacePicker(root:Object3D,targets:SurfaceTarget[],resources:Set<{dispose():void}>){
  type Pixels={data:Uint8Array|Uint8ClampedArray;width:number;height:number};
  const alphaPixels=new WeakMap<object,Pixels|null>();
  function pixels(texture:Texture):Pixels|null{
    const image=texture.image as {width:number;height:number;naturalWidth?:number;naturalHeight?:number;data?:unknown}|undefined;
    if(!image||typeof image!=='object')return null;
    if(alphaPixels.has(image))return alphaPixels.get(image)!;
    let result:Pixels|null=null;
    const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
    if(width&&height){
      if((image.data instanceof Uint8Array||image.data instanceof Uint8ClampedArray)&&image.data.length===width*height*4){
        result={data:image.data,width,height};
      }else if(typeof document!=='undefined'){
        // Separate from the WebGL canvas; read the same-origin cutout once.
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
        try{
          const context=canvas.getContext('2d',{willReadFrequently:true});
          if(context){context.drawImage(image as CanvasImageSource,0,0,width,height);result={data:context.getImageData(0,0,width,height).data,width,height};}
        }catch{/* An unreadable image remains solid, never a hole through a prop. */}
        finally{canvas.width=canvas.height=1;}
      }
    }
    alphaPixels.set(image,result);return result;
  }
  function sample(texture:Texture,hit:Intersection,channel:1|3){
    const uv=texture.channel===0?hit.uv:texture.channel===1?hit.uv1:undefined;
    const image=pixels(texture);if(!uv||!image)return null;
    if(texture.matrixAutoUpdate)texture.updateMatrix();
    const point=texture.transformUv(new Vector2().copy(uv));
    const x=Math.max(0,Math.min(image.width-1,Math.floor(point.x*image.width)));
    const y=Math.max(0,Math.min(image.height-1,Math.floor(point.y*image.height)));
    return image.data[(y*image.width+x)*4+channel]/255;
  }
  function visibleSurface(hit:Intersection){
    const material=materialAt(hit.object as Mesh,hit.face?.materialIndex) as Material&{map?:Texture|null;alphaMap?:Texture|null};
    if(!solid(material))return false;
    if(material.alphaTest<=0)return true;
    let alpha=material.opacity;
    if(material.map){const value=sample(material.map,hit,3);if(value===null)return true;alpha*=value;}
    if(material.alphaMap){const value=sample(material.alphaMap,hit,1);if(value===null)return true;alpha*=value;}
    return alpha>=material.alphaTest;
  }
  const owners=new Map<Object3D,SurfaceTarget>();
  for(const target of targets)for(const object of target.roots)owners.set(object,target);
  const proxies:{mesh:Mesh;path:Object3D[];frame:Object3D;target?:SurfaceTarget}[]=[];
  root.traverse(object=>{
    if(!(object instanceof Mesh))return;
    let target:SurfaceTarget|undefined;
    for(let parent:Object3D|null=object;parent&&!target;parent=parent.parent)target=owners.get(parent);
    const materials=Array.isArray(object.material)?object.material:[object.material];
    if(!materials.some(solid))return;
    const geometry=new BufferGeometry();
    // Retain attributes, including deforming paper, without duplicating buffers.
    geometry.setAttribute('position',object.geometry.getAttribute('position'));
    for(const name of ['uv','uv1']){const attribute=object.geometry.getAttribute(name);if(attribute)geometry.setAttribute(name,attribute);}
    geometry.setIndex(object.geometry.index);
    geometry.boundingSphere=object.geometry.boundingSphere?.clone()??null;
    for(const group of object.geometry.groups)geometry.addGroup(group.start,group.count,group.materialIndex);
    geometry.setDrawRange(object.geometry.drawRange.start,object.geometry.drawRange.count);
    resources.add(geometry);
    const mesh=new Mesh(geometry,object.material),path:Object3D[]=[];
    for(let parent:Object3D|null=object;parent&&parent!==root;parent=parent.parent)path.unshift(parent);
    proxies.push({mesh,path,frame:object,target});
  });
  const byMesh=new Map(proxies.map(proxy=>[proxy.mesh,proxy]));
  const meshes=proxies.map(proxy=>proxy.mesh);
  async function prepare(step:()=>Promise<void>){
    const textures=new Set<Texture>();
    for(const {mesh}of proxies){
      if(!mesh.geometry.boundingSphere)mesh.geometry.computeBoundingSphere();
      for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
        const cutout=material as Material&{map?:Texture|null;alphaMap?:Texture|null};
        if(!solid(cutout)||cutout.alphaTest<=0)continue;
        if(cutout.map)textures.add(cutout.map);
        if(cutout.alphaMap)textures.add(cutout.alphaMap);
      }
    }
    // Image readback can take a frame even though the texture is already on
    // the GPU. Cache every cutout while loading, before the first leaf hit.
    for(const texture of textures){pixels(texture);await step();}
  }
  function bind(){
    for(const proxy of proxies){
      let frame:Object3D|undefined=root;
      for(const original of proxy.path)frame=frame?.children.find(child=>child===original)??frame?.children.find(child=>child.name===original.name);
      if(!frame)throw new Error('Missing picking frame: '+proxy.path.map(object=>object.name).join('/'));
      proxy.frame=frame;
    }
  }
  function pick(ray:Raycaster):SurfaceTarget|null{
    root.updateWorldMatrix(true,true);
    for(const proxy of proxies){
      proxy.mesh.matrixWorld.copy(proxy.frame.matrixWorld);
      if(proxy.frame instanceof Mesh)proxy.mesh.material=proxy.frame.material;
      proxy.mesh.layers.mask=visible(proxy.frame)?ray.layers.mask:0;
    }
    // Hidden props remain represented so a later animation can reveal them.
    // One nearest visible surface decides both the action and its occlusion.
    const hit=ray.intersectObjects(meshes,false).find(visibleSurface);
    return hit?byMesh.get(hit.object as Mesh)!.target??null:null;
  }
  return{bind,pick,prepare};
}
