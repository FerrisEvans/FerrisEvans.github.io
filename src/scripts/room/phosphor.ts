import { Matrix3, Matrix4, Mesh, MeshPhysicalMaterial, Vector3 } from 'three';

/** Keep the reflective envelope in its authored position and put the emitting
 * coating inside it. Offset in metres, including rotated/nonuniformly scaled
 * imported meshes; a local-axis translation can push a screen out of its case.
 */
export function separateTubeLayers(surface:Mesh, glass:MeshPhysicalMaterial,
  resources:Set<{dispose():void}>, thickness:number) {
  if(!(surface.material instanceof MeshPhysicalMaterial))throw new Error('Tube needs a physical phosphor material');
  surface.updateWorldMatrix(true,false);
  const geometry=surface.geometry.clone(),positions=geometry.attributes.position;
  if(!geometry.attributes.normal)geometry.computeVertexNormals();
  const normals=geometry.attributes.normal,normalMatrix=new Matrix3().getNormalMatrix(surface.matrixWorld);
  const inverse=new Matrix4().copy(surface.matrixWorld).invert(),point=new Vector3(),normal=new Vector3();
  for(let i=0;i<positions.count;i++){
    point.fromBufferAttribute(positions,i).applyMatrix4(surface.matrixWorld);
    normal.fromBufferAttribute(normals,i).applyMatrix3(normalMatrix).normalize();
    point.addScaledVector(normal,-thickness).applyMatrix4(inverse);
    positions.setXYZ(i,point.x,point.y,point.z);
  }
  positions.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const phosphor=new Mesh(geometry,surface.material);
  phosphor.name=surface.name+'_Phosphor';phosphor.userData.roomDynamic=true;
  // Picking inherits the existing named display target through this parent.
  surface.material=glass;surface.add(phosphor);resources.add(geometry);resources.add(glass);
  return phosphor;
}

/** Screen-local optics shared by the colour CRT and monochrome terminal.
 * Sample in linear light, including native video textures. Raster dimensions
 * describe the tube's beam bandwidth, independently of the source resolution.
 */
export const phosphorShader = `
  vec3 phosphorTexel(vec2 uv) {
    vec4 sampleColor=texture2D(emissiveMap,clamp(uv,vec2(.001),vec2(.999)));
    #ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
      sampleColor=sRGBTransferEOTF(sampleColor);
    #endif
    return sampleColor.rgb;
  }
  vec3 phosphorSignal(vec2 uv,vec2 raster,float beam,float glow) {
    vec2 dx=vec2(beam/raster.x,0.),dy=vec2(0.,beam*.55/raster.y);
    vec3 centre=phosphorTexel(uv);
    vec3 horizontal=phosphorTexel(uv-dx)+phosphorTexel(uv+dx);
    vec3 vertical=phosphorTexel(uv-dy)+phosphorTexel(uv+dy);
    // A narrow electron spot softens video edges, while preserving small ink.
    vec3 signal=centre*.42+horizontal*.21+vertical*.08;
    vec2 spread=vec2(2.2)/raster;
    vec3 halo=phosphorTexel(uv+vec2(spread.x,0.))+phosphorTexel(uv-vec2(spread.x,0.));
    halo+=phosphorTexel(uv+vec2(0.,spread.y))+phosphorTexel(uv-vec2(0.,spread.y));
    halo*=.25;
    signal+=halo*smoothstep(.18,.70,dot(halo,vec3(.2126,.7152,.0722)))*glow;
    return signal;
  }
  float phosphorRaster(vec2 uv,vec2 raster,float strength) {
    vec2 footprint=fwidth(uv)*raster;
    // A displayed field has to span at least two pixels per line. Integrate
    // its cosine over the pixel first, then fade near Nyquist rather than
    // removing every line as soon as a pixel covers half a beam.
    float phaseWidth=max(footprint.y*3.141593,.0001);
    float scanFilter=sin(phaseWidth)/phaseWidth*(1.-smoothstep(.42,.72,footprint.y));
    float maskFilter=1.-smoothstep(.20,.50,max(footprint.x,footprint.y));
    // Integrate subpixel lines to their mean; never let them turn into moire.
    float scan=1.-strength*.5+strength*.5*cos(uv.y*raster.y*6.283185)*scanFilter;
    float aperture=sin(uv.x*raster.x*6.283185)*sin(uv.y*raster.y*3.141593);
    return scan*(.993+.007*aperture*maskFilter);
  }
`;
