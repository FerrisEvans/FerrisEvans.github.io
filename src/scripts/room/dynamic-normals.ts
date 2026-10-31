import { type BufferAttribute, type BufferGeometry, type InterleavedBufferAttribute } from 'three';

function layout(attribute:BufferAttribute|InterleavedBufferAttribute) {
  return 'isInterleavedBufferAttribute' in attribute
    ? {array:attribute.array,stride:attribute.data.stride,offset:attribute.offset}
    : {array:attribute.array,stride:attribute.itemSize,offset:0};
}

/** The delivered moving meshes have float positions and signed-normalized
 * 16-bit normals. Keep Three's face order, quantization on every accumulation,
 * and final normalization exactly; specialize only its repeated attribute/type
 * dispatch. Unknown layouts continue through the standard implementation.
 * The updater belongs to one geometry with fixed attribute/index buffers. */
export function createNormalUpdater(geometry:BufferGeometry):()=>void {
  const position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),index=geometry.index;
  if(!position||!normal||position.normalized||!normal.normalized||position.itemSize!==3||normal.itemSize!==3||position.count!==normal.count
    ||!(position.array instanceof Float32Array)||!(normal.array instanceof Int16Array)||index?.normalized||(index&&index.itemSize!==1))
    return ()=>geometry.computeVertexNormals();
  const p=layout(position),n=layout(normal),indices=index?.array,count=position.count;
  return ()=>{
    for(let i=0;i<count;i++){const at=i*n.stride+n.offset;n.array[at]=n.array[at+1]=n.array[at+2]=0;}
    const length=indices?index!.count:count;
    for(let i=0;i<length;i+=3){
      const a=indices?indices[i]:i,b=indices?indices[i+1]:i+1,c=indices?indices[i+2]:i+2;
      const pa=a*p.stride+p.offset,pb=b*p.stride+p.offset,pc=c*p.stride+p.offset;
      const cbx=p.array[pc]-p.array[pb],cby=p.array[pc+1]-p.array[pb+1],cbz=p.array[pc+2]-p.array[pb+2];
      const abx=p.array[pa]-p.array[pb],aby=p.array[pa+1]-p.array[pb+1],abz=p.array[pa+2]-p.array[pb+2];
      const x=cby*abz-cbz*aby,y=cbz*abx-cbx*abz,z=cbx*aby-cby*abx;
      const na=a*n.stride+n.offset,nb=b*n.stride+n.offset,nc=c*n.stride+n.offset;
      // Typed-array assignment intentionally retains Int16 wrapping, matching
      // BufferAttribute.setXYZ even for large or degenerate input triangles.
      if(indices){
        for(let corner=0;corner<3;corner++){
          const at=corner===0?na:corner===1?nb:nc;
          n.array[at]=Math.round((Math.max(n.array[at]/32767,-1)+x)*32767);
          n.array[at+1]=Math.round((Math.max(n.array[at+1]/32767,-1)+y)*32767);
          n.array[at+2]=Math.round((Math.max(n.array[at+2]/32767,-1)+z)*32767);
        }
      }else{
        for(let corner=0;corner<3;corner++){const at=corner===0?na:corner===1?nb:nc;n.array[at]=Math.round(x*32767);n.array[at+1]=Math.round(y*32767);n.array[at+2]=Math.round(z*32767);}
      }
    }
    for(let i=0;i<count;i++){
      const at=i*n.stride+n.offset,x=Math.max(n.array[at]/32767,-1),y=Math.max(n.array[at+1]/32767,-1),z=Math.max(n.array[at+2]/32767,-1);
      const inverse=1/(Math.sqrt(x*x+y*y+z*z)||1);
      n.array[at]=Math.round(x*inverse*32767);n.array[at+1]=Math.round(y*inverse*32767);n.array[at+2]=Math.round(z*inverse*32767);
    }
    normal.needsUpdate=true;
  };
}
