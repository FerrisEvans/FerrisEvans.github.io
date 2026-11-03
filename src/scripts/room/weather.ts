import { Box3, CubeReflectionMapping, CubeUVReflectionMapping, DataTexture, LinearFilter, Matrix4, Mesh, MeshBasicMaterial, NoColorSpace, RGBAFormat, Vector2, Vector3, Vector4, type Object3D, type Texture } from 'three';

type Polygon = readonly (readonly [number, number])[];
export const cityDepthSize = [1024, 342] as const;
// The panorama fills the full authored 29.12 m-wide exterior, including unique
// side content. Its aspect ratio is preserved; only overcast sky extends above it.
export const cityProjection = { scale: [.5, .84375], offset: [.25, .052] } as const;
export const cityTrainPath = [[.834,.344],[.867,.502],[.596,.718],[.075,1.025]] as const;

/** Hand-traced panorama depth, independent of the previous city's silhouettes.
 * R is inverse depth for restrained camera parallax; G preserves the rail's hard
 * occluders. Fine aerials/gantries do not get blurred into the movement mask.
 */
export function cityDepthPixels() {
  const [width, height] = cityDepthSize;
  const buildings: { shape: Polygon; depth: number }[] = [
    { shape: [[0,.21],[.08,.21],[.08,.29],[.14,.29],[.14,.36],[0,.39]], depth: .19 },
    { shape: [[.075,.32],[.075,.26],[.118,.26],[.118,.23],[.143,.23],[.143,.29],[.205,.29],[.205,.26],[.235,.26],[.235,.39],[.19,.46],[.075,.43]], depth: .28 },
    { shape: [[.235,.295],[.327,.285],[.327,.261],[.403,.267],[.403,.285],[.451,.291],[.451,.263],[.494,.263],[.494,.302],[.583,.319],[.583,.44],[.448,.451],[.358,.425],[.235,.39]], depth: .32 },
    { shape: [[.584,.287],[.63,.267],[.63,.241],[.668,.241],[.668,.266],[.723,.271],[.723,.345],[.686,.381],[.584,.368]], depth: .24 },
    { shape: [[.92,.221],[.935,.221],[.935,.174],[.954,.174],[.954,.236],[1,.239],[1,.407],[.947,.389],[.92,.327]], depth: .29 },
    { shape: [[.12,.423],[.142,.391],[.196,.394],[.245,.433],[.245,.48],[.193,.491],[.111,.463]], depth: .47 },
    { shape: [[0,.468],[.103,.45],[.218,.482],[.218,.497],[.298,.487],[.364,.544],[.364,.793],[.29,.852],[.17,.921],[0,.946]], depth: .78 },
    { shape: [[.359,.535],[.416,.513],[.477,.545],[.477,.671],[.439,.7],[.365,.742]], depth: .66 },
    { shape: [[.339,.468],[.379,.459],[.384,.498],[.427,.488],[.444,.493],[.448,.534],[.371,.548],[.337,.521]], depth: .52 },
    { shape: [[.864,.477],[.928,.443],[1,.451],[1,.629],[.93,.616],[.864,.568]], depth: .48 },
    { shape: [[.94,.593],[1,.574],[1,1],[.948,1],[.94,.716]], depth: .88 },
  ];
  const occluders: Polygon[] = [
    // Near trees and warehouse silhouettes; the track itself stays unmasked.
    [[0,.51],[.023,.532],[.027,.567],[.055,.575],[.067,.62],[.086,.662],[.072,.692],[.083,.72],[.066,.762],[.078,.795],[.061,.837],[.07,.881],[.055,.918],[.065,1],[0,1]],
    [[0,.468],[.103,.45],[.218,.482],[.218,.497],[.298,.487],[.364,.544],[.364,.793],[.29,.852],[.17,.907],[0,.917]],
    [[.483,.489],[.49,.456],[.503,.444],[.511,.473],[.52,.46],[.53,.501],[.543,.517],[.539,.552],[.55,.583],[.539,.619],[.544,.649],[.526,.679],[.521,.739],[.507,.739],[.505,.675],[.493,.642],[.481,.602],[.488,.564]],
    [[.64,.462],[.653,.438],[.668,.429],[.675,.456],[.69,.453],[.692,.479],[.708,.492],[.706,.52],[.696,.536],[.698,.566],[.686,.589],[.686,.637],[.677,.649],[.676,.582],[.661,.565],[.655,.536],[.642,.522]],
    // Mid-ground catenary: beam and two separately traced narrow legs.
    [[.588,.429],[.766,.451],[.766,.465],[.588,.444]],
    [[.591,.418],[.595,.418],[.595,.808],[.591,.811]],
    [[.763,.435],[.767,.435],[.767,.65],[.763,.652]],
    [[.741,.376],[.744,.376],[.744,.629],[.741,.631]],
    [[.809,.326],[.811,.326],[.811,.505],[.809,.506]],
    [[.824,.298],[.826,.298],[.826,.451],[.824,.453]],
    // Closest right-hand portal and tree against the bottom rail approach.
    [[.904,.556],[1,.531],[1,.546],[.904,.573]],
    [[.9,.55],[.907,.549],[.907,1],[.9,1]],
    [[.938,.586],[.951,.586],[.951,1],[.938,1]],
  ];
  const hard = new Float32Array(width*height), horizontal = new Float32Array(hard.length);
  const occlusion = new Uint8Array(hard.length), data = new Uint8Array(width*height*4);
  // Scanline rasterization keeps this one-time mask generation cheap; avoid a
  // point-in-every-polygon search for each of the 350,208 pixels at startup.
  function paintPolygon(shape: Polygon, paint: (start: number, end: number) => void) {
    const top = Math.max(0,Math.floor(Math.min(...shape.map(p=>p[1]))*height));
    const bottom = Math.min(height,Math.ceil(Math.max(...shape.map(p=>p[1]))*height));
    for(let y=top;y<bottom;y++) {
      const v=(y+.5)/height, intersections:number[]=[];
      for(let i=0,j=shape.length-1;i<shape.length;j=i++) {
        const [xi,yi]=shape[i],[xj,yj]=shape[j];
        if((yi>v)!==(yj>v))intersections.push(xi+(v-yi)*(xj-xi)/(yj-yi));
      }
      intersections.sort((a,b)=>a-b);
      for(let i=0;i+1<intersections.length;i+=2) {
        const left=Math.max(0,Math.ceil(intersections[i]*width-.5));
        const right=Math.min(width,Math.ceil(intersections[i+1]*width-.5));
        if(right>left)paint(y*width+left,y*width+right);
      }
    }
  }
  for(let y=0;y<height;y++) {
    const v=(y+.5)/height;
    hard.fill(v<.20?.025+v/.20*.075:.10+(v-.20)/.80*.68,y*width,(y+1)*width);
  }
  for(const building of buildings)paintPolygon(building.shape,(start,end)=>hard.fill(building.depth,start,end));
  for(const shape of occluders)paintPolygon(shape,(start,end)=>occlusion.fill(255,start,end));
  for(let i=0;i<hard.length;i++){data[i*4+1]=occlusion[i];data[i*4+3]=255;}
  // A separable five-tap Gaussian softens only R. G remains binary even at
  // rooflines; the shader reads it at exact texel centres without interpolation.
  const weights = [1,4,6,4,1];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let tap=-2;tap<=2;tap++) sum += hard[y*width+Math.max(0,Math.min(width-1,x+tap))]*weights[tap+2];
    horizontal[y*width+x] = sum/16;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let tap=-2;tap<=2;tap++) sum += horizontal[Math.max(0,Math.min(height-1,y+tap))*width+x]*weights[tap+2];
    data[(y*width+x)*4] = Math.round(sum/16*255);
  }
  return data;
}

function cityDepth() {
  const map = new DataTexture(cityDepthPixels(), ...cityDepthSize, RGBAFormat);
  map.colorSpace = NoColorSpace; map.flipY = false;
  map.minFilter = map.magFilter = LinearFilter; map.generateMipmaps = false;
  map.needsUpdate = true;
  return map;
}

/** Rain is evaluated on the window plane, with the city behind it. No full-screen rain overlay. */
export function createWeather(cityMap: Texture, room?: Object3D) {
  const depth = cityDepth();
  const shade=room?.getObjectByName('Lamp_Shade'),bulb=room?.getObjectByName('Lamp_Bulb');
  room?.updateWorldMatrix(true,true);
  const lampBounds=shade?new Box3().setFromObject(shade):undefined;
  const lampCenter=lampBounds?.getCenter(new Vector3())??new Vector3(-1.475,1.867,-.486);
  const lampSize=lampBounds?.getSize(new Vector3())??new Vector3(.58,.44,.58);
  const television=room?.getObjectByName('CRT_Case');
  const tvBounds=television instanceof Mesh?(television.geometry.computeBoundingBox(),television.geometry.boundingBox):undefined;
  const shadeLocal=shade instanceof Mesh?(shade.geometry.computeBoundingBox(),shade.geometry.boundingBox):undefined;
  const shadeBounds=shadeLocal??new Box3(new Vector3(-.286,-.172,-.286),new Vector3(.286,.199,.286));
  const shadeRadius=Math.max(shadeBounds.max.x-shadeBounds.min.x,shadeBounds.max.z-shadeBounds.min.z)*.5;
  const uniforms = {
    weatherTime: { value: 0 }, weatherPixelScale:{value:1}, cityDepth: { value: depth }, cityDepthSize: { value: new Vector2(...cityDepthSize) },
    weatherLampCenter:{value:lampCenter},weatherLampSize:{value:new Vector2(lampSize.x,lampSize.y)},
    weatherBulbCenter:{value:bulb?.getWorldPosition(new Vector3())??lampCenter.clone()},weatherLampLevel:{value:shade?1:0},
    weatherShadeInverse:{value:shade?.matrixWorld.clone().invert()??new Matrix4()},
    weatherShadeShape:{value:new Vector3(shadeBounds.min.y,shadeBounds.max.y,shadeRadius)},
    weatherTVInverse:{value:television?.matrixWorld.clone().invert()??new Matrix4()},
    weatherTVMin:{value:tvBounds?.min.clone()??new Vector3()},weatherTVMax:{value:tvBounds?.max.clone()??new Vector3()},
    weatherHasTV:{value:television?1:0},weatherHasLamp:{value:shade?1:0},
  };
  const viewport=new Vector4(),canvasSize=new Vector2();
  function makeMaterial(inspection:boolean) {
  const material = new MeshBasicMaterial({ map: cityMap, toneMapped: false });
  material.onBeforeRender=renderer=>{
    // The glow pass is half resolution. Account for its actual viewport as
    // well as device pixel ratio, without allocating anything per frame.
    renderer.getCurrentViewport(viewport);renderer.getSize(canvasSize);
    // A cube capture has no CSS projection. Its optical kernel must not
    // depend on the unrelated 64px canvas used by the offline probe builder.
    const mapping=renderer.getRenderTarget()?.texture.mapping;
    uniforms.weatherPixelScale.value=mapping===CubeUVReflectionMapping||mapping===CubeReflectionMapping?0:viewport.w/Math.max(1,canvasSize.y);
  };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec3 weatherWorld;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nweatherWorld = (modelMatrix * vec4(position, 1.)).xyz;');
    shader.fragmentShader = `
      uniform float weatherTime, weatherPixelScale;
      uniform sampler2D cityDepth;
      uniform vec2 cityDepthSize, weatherLampSize;
      uniform vec3 weatherLampCenter, weatherBulbCenter;
      uniform float weatherLampLevel, weatherHasTV, weatherHasLamp;
      uniform mat4 weatherShadeInverse, weatherTVInverse;
      uniform vec3 weatherShadeShape, weatherTVMin, weatherTVMax;
      varying vec3 weatherWorld;
      float rainHash(vec2 p) { return fract(sin(dot(p,vec2(41.37,289.11)))*43758.5453); }
      float wetPatch(vec2 p) {
        vec2 id=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(rainHash(id),rainHash(id+vec2(1.,0.)),f.x),
                   mix(rainHash(id+vec2(0.,1.)),rainHash(id+vec2(1.)),f.x),f.y);
      }
      float fallingRain(vec2 uv,float density,float speed) {
        vec2 q=uv*vec2(density,density*.31);
        q.x+=q.y*.055;
        float column=floor(q.x);
        // Individual columns have different fall speeds; the short segments
        // have their own width, angle and exposure length, not a ruled curtain.
        q.y-=weatherTime*speed*mix(.65,1.4,rainHash(vec2(column,4.7)));
        vec2 id=floor(q),p=fract(q);
        float seed=rainHash(id),x=.16+.68*rainHash(id+3.1);
        float length=mix(.12,.62,rainHash(id+7.6));
        float start=.08+.18*rainHash(id+2.4);
        float slope=(rainHash(id+13.2)-.5)*.15;
        float aa=max(fwidth(q.x),.001);
        float width=mix(.0012,.0035,rainHash(id+9.2));
        float streak=1.-smoothstep(width,width+aa,abs(p.x-x-(p.y-.5)*slope));
        float segment=smoothstep(start,start+.035,p.y)*(1.-smoothstep(start+length*.65,start+length,p.y));
        return streak*segment*step(.72,seed)*mix(.35,1.,rainHash(id+16.1));
      }
      vec4 rainLayer(vec2 p, float density, float speed, float wetness, vec2 lampSide, float lampStrength) {
        vec2 grid = p * vec2(density, density * .31);
        float column = floor(grid.x);
        // speed=0 is the adhered population. The second, sparse population
        // creeps down the same physical glass rather than drifting with the city.
        grid.y += weatherTime * speed * mix(.30, 1.0, rainHash(vec2(column,7.9)));
        vec2 id = floor(grid), cell = fract(grid) - .5;
        float seed = rainHash(id);
        float x = (seed - .5) * .72 + sin(cell.y * 4. + seed * 19.) * .014;
        float y = -.30 + rainHash(id + vec2(5.7,1.2)) * .50;
        float sizeSeed=rainHash(id + vec2(19.1,8.3));
        float size = mix(.55, 1.60, sizeSeed)*(1.+.3*smoothstep(.85,1.,sizeSeed))*mix(.85,1.15,wetness);
        float stretch = mix(2.0, 3.4, rainHash(id + vec2(2.3,17.1)));
        vec2 delta = vec2((cell.x-x) * 1.2, (cell.y-y) * stretch) / size;
        delta.x*=1.+clamp(delta.y,-.08,.08)*2.;
        float dist = length(delta);
        float aa = max(fwidth(dist), .010);
        float present = step(mix(.82,.19,wetness), seed);
        float drop = (1. - smoothstep(.043, .067 + aa, dist)) * present;
        float rim = (1.-smoothstep(.055,.080+aa,dist)) - (1.-smoothstep(.033,.055+aa,dist));
        float side = dot(normalize(delta + vec2(.0001)), normalize(vec2(-.7,.7)));
        float glint = smoothstep(.15,.90,side)*.16 - smoothstep(.05,.80,-side)*.03;
        float warmRim=pow(max(0.,dot(normalize(delta+vec2(.0001)),lampSide)),10.)*rim*.11*lampStrength*present;
        // The curved meniscus refracts in opposite directions on either side;
        // only one rim catches light. Most of the bead stays transparent.
        return vec4(delta * drop * .025, rim * glint * present, warmRim);
      }
      vec4 rainRuns(vec2 p, float wetness, vec2 lampSide, float lampStrength) {
        vec2 grid = p*vec2(3.2,1.25);
        float column = floor(grid.x);
        float speed = mix(.008,.035,rainHash(vec2(column,4.3)));
        grid.y += weatherTime*speed;
        vec2 id = floor(grid), cell = fract(grid);
        float seed = rainHash(id+vec2(7.3,12.8));
        float present = step(mix(.78,.48,wetness),seed);
        float headY = .13 + rainHash(id+vec2(2.1,4.8))*.12;
        float dy = cell.y-headY;
        float length = mix(.15,.67,rainHash(id+vec2(11.2,9.8)));
        float slope = (rainHash(id+vec2(1.9,8.7))-.5)*.13;
        float center = .20 + rainHash(id+vec2(5.1,3.7))*.60;
        float path = center + dy*slope + sin(dy*13.0+seed*29.0)*.010 + sin(dy*31.+seed*7.)*.003;
        float width = mix(.002,.007,rainHash(id+vec2(3.2,7.4)));
        width*=mix(1.15,.45,clamp(dy/length,0.,1.))*(.8+.2*sin(dy*47.+seed*11.));
        float offset = cell.x-path;
        float aa = max(fwidth(cell.x),.0008);
        float line = 1.-smoothstep(width*.45,width+aa,abs(offset));
        float ends = smoothstep(0.,.022,dy)*(1.-smoothstep(length*.65,length,dy));
        float flow = line*ends*present;
        vec2 bead = vec2(offset,dy*1.2)/max(width*2.,.006);
        float head = exp(-dot(bead,bead)*1.7)*present;
        float edge=exp(-pow((offset-width*.55)/max(aa,width*.3),2.))*ends*present;
        // Irregular water lenses bend the image; broken edge glints replace
        // the old uniformly white centre line along every rivulet.
        float highlight=edge*(.016+.026*pow(.5+.5*sin(dy*35.+seed*17.),3.));
        float warmEdge=exp(-pow((offset-width*.55*sign(lampSide.x))/max(aa,width*.3),2.))*ends*present;
        float warm=(warmEdge*.025*(.35+.65*abs(lampSide.x))+head*.045)*lampStrength;
        return vec4(clamp(offset/max(width,.001),-1.,1.)*flow*.0018,head*.00035,highlight+head*.075-flow*.008,warm);
      }
      float shadeHit(vec3 origin,vec3 direction) {
        // A finite spun shade in its authored local frame, including its tilt.
        // The cone approximation is only a reflection proxy, never new geometry.
        vec3 o=(weatherShadeInverse*vec4(origin,1.)).xyz;
        vec3 d=(weatherShadeInverse*vec4(direction,0.)).xyz;
        float low=weatherShadeShape.x,high=weatherShadeShape.y,r=weatherShadeShape.z;
        float slope=-r*.87/(high-low),intercept=r-slope*low;
        float a=dot(d.xz,d.xz)-pow(slope*d.y,2.);
        float b=dot(o.xz,d.xz)-(intercept+slope*o.y)*slope*d.y;
        float c=dot(o.xz,o.xz)-pow(intercept+slope*o.y,2.);
        float discriminant=b*b-a*c;
        if(discriminant<0.||abs(a)<.00001)return 1e4;
        vec2 roots=(-b+vec2(-1.,1.)*sqrt(discriminant))/a;
        float t=1e4;
        for(int i=0;i<2;i++){
          float y=o.y+roots[i]*d.y;
          if(roots[i]>0.&&y>=low&&y<=high)t=min(t,roots[i]);
        }
        return t;
      }
      vec3 roomReflection(vec3 origin,vec3 direction) {
        // Weak wall return, then nearer object silhouettes. The CRT presents
        // its opaque rear to the window; there is no false reflected TV image.
        vec3 reflected=mix(vec3(.017,.021,.028),vec3(.070,.050,.032),weatherLampLevel);
        float nearest=1e4;
        if(weatherHasTV>0.){
          vec3 o=(weatherTVInverse*vec4(origin,1.)).xyz;
          vec3 d=(weatherTVInverse*vec4(direction,0.)).xyz;
          vec3 safeDirection=mix(vec3(-1.),vec3(1.),step(vec3(0.),d))*max(abs(d),vec3(.00001));
          vec3 a=(weatherTVMin-o)/safeDirection,b=(weatherTVMax-o)/safeDirection;
          vec3 nearSide=min(a,b),farSide=max(a,b);
          float enter=max(max(nearSide.x,nearSide.y),nearSide.z),leave=min(min(farSide.x,farSide.y),farSide.z);
          if(enter>0.&&leave>=enter){
            nearest=enter;
            reflected=mix(vec3(.005,.007,.010),vec3(.016,.014,.011),weatherLampLevel);
          }
        }
        if(weatherHasLamp>0.){
          float shadeDistance=shadeHit(origin,direction);
          if(shadeDistance<nearest){
            nearest=shadeDistance;
            vec3 local=(weatherShadeInverse*vec4(origin+direction*shadeDistance,1.)).xyz;
            float face=.35+.65*pow(max(0.,dot(normalize(local.xz),normalize(vec2(-.7,.4)))),2.);
            reflected=mix(vec3(.025,.020,.016),vec3(.40,.215,.10)*face,weatherLampLevel);
          }
          // The bulb is visible only if the finite metal shade does not cover
          // it. A bright additive spot shining through the shade would be wrong.
          vec3 toBulb=origin-weatherBulbCenter;
          float along=dot(toBulb,direction),disc=along*along-dot(toBulb,toBulb)+.042*.042;
          if(disc>0.){
            float distance=-along-sqrt(disc);
            if(distance>0.&&distance<nearest)reflected=vec3(1.8,1.08,.48)*weatherLampLevel;
          }
        }
        return reflected;
      }
      vec3 movingTrain(vec2 uv, float occlusion) {
        // Tiny lights following the photographed perspective rails, behind foreground blocks.
        float phase = fract(weatherTime / 44. + .17);
        float along = phase * phase;
        float inv = 1.-along;
        vec2 a=vec2(${cityTrainPath[0].join(',')}), b=vec2(${cityTrainPath[1].join(',')});
        vec2 c=vec2(${cityTrainPath[2].join(',')}), d=vec2(${cityTrainPath[3].join(',')});
        vec2 center = inv*inv*inv*a + 3.*inv*inv*along*b + 3.*inv*along*along*c + along*along*along*d;
        vec2 tangent = normalize(3.*inv*inv*(b-a)+6.*inv*along*(c-b)+3.*along*along*(d-c));
        vec2 delta = uv-center;
        float side = dot(delta,vec2(tangent.y,-tangent.x));
        float forward = dot(delta,tangent);
        float scale = mix(.0009,.0038,along);
        float body = (1.-smoothstep(scale*.65,scale,abs(side))) * (1.-smoothstep(scale*4.,scale*5.,abs(forward)));
        float windows = step(.35,fract(forward/(scale*.9))) * body;
        float head = exp(-dot(vec2(side/scale, (forward-scale*4.)/scale),vec2(side/scale, (forward-scale*4.)/scale))*2.);
        float fade = smoothstep(.02,.09,phase)*(1.-smoothstep(.84,.98,phase));
        float visible = 1.-occlusion;
        return (vec3(.21,.15,.075)*windows + vec3(.65,.54,.34)*head) * fade * visible;
      }
    \n` + shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_pars_fragment>',`#include <map_pars_fragment>
      vec3 cityOpticalPlate(vec2 uv) {
        vec3 colour=texture2D(map,uv).rgb;
        // The existing blank lightbox remains blank. Its three translucent
        // diffuser panels have subtle joins and unequal interior illumination.
        vec2 panel=(uv*vec2(2172.,724.)-vec2(1494.,205.))/vec2(53.,21.);
        float edge=min(min(panel.x,1.-panel.x),min(panel.y,1.-panel.y));
        float inside=smoothstep(0.,.065,edge);
        float width=max(.010,fwidth(panel.x)*.65);
        float join=max(exp(-pow((panel.x-.3333)/width,2.)),exp(-pow((panel.x-.6667)/width,2.)));
        float illumination=.76+.13*sin(clamp(panel.y,0.,1.)*3.141593)
          +.035*cos(panel.x*18.84956+.4);
        colour*=mix(1.,illumination*(1.-join*.16),inside);
        return colour;
      }
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      // Unique panoramic content replaces the old mirrored city borders.
      vec2 photoUv=${inspection?'vec2(vMapUv.x,1.-vMapUv.y)':`vMapUv*vec2(${cityProjection.scale.join(',')})+vec2(${cityProjection.offset.join(',')})`};
      ${inspection?'float edgeFreedom=smoothstep(0.,.018,min(min(photoUv.x,1.-photoUv.x),min(photoUv.y,1.-photoUv.y)));':'float edgeFreedom=1.;'}
      float depthValue = texture2D(cityDepth, clamp(photoUv,.002,.998)).r;
      // Camera displacement, not just an arbitrary oscillation, determines the
      // foreground/far-field separation. Keep disocclusions below a few pixels.
      float atGlass=1.-smoothstep(-.6,2.,cameraPosition.z);
      vec2 eyeAnchor=mix(vec2(.078,2.29),vec2(-1.15,2.40),atGlass);
      vec2 head=(cameraPosition.xy-eyeAnchor)/vec2(29.12,9.7067);
      vec2 parallax=clamp(vec2(-head.x,head.y)*mix(.22,.65,atGlass),vec2(-.004),vec2(.004))*(depthValue-.10);
      vec2 uv = clamp(photoUv + parallax*edgeFreedom, ${inspection?'0.,1.':'.002,.998'});
      vec3 ray = weatherWorld - cameraPosition;
      // The glass stays at z=-.89; the city card is much farther behind it.
      float distanceToGlass = (-.89-cameraPosition.z) / min(ray.z,-.001);
      vec2 glass = (cameraPosition + ray * distanceToGlass).xy;
      vec3 viewRay=normalize(ray),toLamp=weatherBulbCenter-vec3(glass,-.89);
      float lampDistance=max(length(toLamp),.001);
      vec2 lampSide=normalize(toLamp.xy/lampDistance-viewRay.xy+vec2(.00001));
      // The opaque shade blocks the bulb for most window rays. Its weaker
      // warm return can still catch a bead; do not paint a warm window veil.
      float bulbVisible=step(lampDistance-.045,shadeHit(vec3(glass,-.89),toLamp/lampDistance));
      float lampStrength=weatherHasLamp*weatherLampLevel*mix(.25,1.,bulbVisible)/(1.+lampDistance*lampDistance*1.3);
      float wetness=smoothstep(.16,.80,wetPatch(glass*1.65+vec2(.8,2.3)));
      vec4 rain = rainLayer(glass, 15., 0.,wetness,lampSide,lampStrength) + rainLayer(glass + vec2(7.3,1.6), 27., .035,wetness,lampSide,lampStrength) * .45;
      rain += rainRuns(glass,wetness,lampSide,lampStrength);
      vec2 refracted = clamp(uv + rain.xy*edgeFreedom, ${inspection?'0.,1.':'.002,.998'});
      vec3 plate = cityOpticalPlate(refracted);
      // A little optical softness, strongest in the distant skyline; no global bloom pass.
      float farField=1.-smoothstep(.22,.78,depthValue);
      vec2 texel=vec2(1./2172.,1./724.);
      // A fixed source-pixel kernel becomes visibly narrower when the side
      // panorama is foreshortened. Retain its optical radius, with a bounded
      // screen-space floor for the far field. Use the unperturbed footprint:
      // water refraction must not inflate the city's blur around each bead.
      vec2 dx=dFdx(photoUv+parallax*edgeFreedom),dy=dFdy(photoUv+parallax*edgeFreedom);
      float radius=mix(.55,2.10,farField),floorPixels=mix(.32,2.65,farField)*weatherPixelScale;
      vec2 sourceFootprint=max(vec2(length(dx/texel),length(dy/texel)),vec2(.0001));
      vec2 steps=min(max(vec2(radius)/sourceFootprint,vec2(floorPixels)),vec2(radius*1.6)/sourceFootprint);
      vec2 blurX=dx*steps.x,blurY=dy*steps.y;
      vec3 soft = plate*.25;
      soft += (cityOpticalPlate(refracted+blurX) + cityOpticalPlate(refracted-blurX)
               + cityOpticalPlate(refracted+blurY) + cityOpticalPlate(refracted-blurY))*.125;
      soft += (cityOpticalPlate(refracted+blurX+blurY) + cityOpticalPlate(refracted-blurX-blurY)
               + cityOpticalPlate(refracted+blurX-blurY) + cityOpticalPlate(refracted-blurX+blurY))*.0625;
      plate = mix(plate,soft,mix(.035,.52,farField));
      vec3 halo = soft*.25 + (cityOpticalPlate(refracted+vec2(.0042,.0063)) + cityOpticalPlate(refracted-vec2(.0042,.0063))
                  + cityOpticalPlate(refracted+vec2(.0042,-.0063)) + cityOpticalPlate(refracted+vec2(-.0042,.0063)))*.1875;
      // Existing broad samples supply distant air scattering, not a
      // whole-window blur. Foreground rail and bright near lamps stay sharp.
      plate=mix(plate,halo,farField*.13);
      plate += max(halo-vec3(.29),vec3(0.))*.20;
      // The plate is framed lower than the window top. Continue its overcast
      // sky smoothly instead of stretching the first pixel row into stripes.
      plate = mix(plate,vec3(.012,.021,.037),smoothstep(0.,.18,-photoUv.y));
      // Query the silhouette at the same refracted coordinate as the plate.
      // Exact centres retain hard occlusion while R uses linear filtering.
      vec2 maskUv = (floor(refracted*cityDepthSize)+.5)/cityDepthSize;
      float occlusion = texture2D(cityDepth,maskUv).g;
      plate += movingTrain(refracted, occlusion);
      // Rain also occupies the air beyond the glass. It is strongest against
      // street lights, while aerial haze softens only the distant skyline.
      // Sparse rain in the air stays behind the attached beads and flow marks.
      float airborne=fallingRain(photoUv,96.,13.)+fallingRain(photoUv+vec2(.31,.17),151.,19.)*.32;
      float distanceHaze=pow(1.-depthValue,1.8)*.145;
      plate=mix(plate,vec3(.040,.052,.075),distanceHaze);
      plate+=airborne*vec3(.085,.105,.13)*(.25+clamp(dot(soft,vec3(.2126,.7152,.0722))*2.,0.,1.));
      plate *= .90;
      vec3 glassNormal=normalize(vec3(-rain.x*85.,rain.y*85.,1.));
      float surfaceFresnel=.04+.96*pow(1.-abs(dot(viewRay,glassNormal)),5.);
      // Two uncoated air/glass interfaces, accounting for internal transmission.
      float paneFresnel=2.*surfaceFresnel/(1.+surfaceFresnel);
      vec3 reflectionRay=reflect(viewRay,glassNormal);
      vec3 tangentX=normalize(cross(vec3(0.,1.,0.),reflectionRay));
      vec3 tangentY=cross(reflectionRay,tangentX);
      // Integrate the very weak double-surface reflection through old glass.
      // Its soft silhouette stays attached to the actual lamp, not the screen.
      float glassSpread=.0025+max(length(dFdx(reflectionRay)),length(dFdy(reflectionRay)))*.7;
      vec3 reflected=roomReflection(vec3(glass,-.89),reflectionRay)*.4;
      reflected+=roomReflection(vec3(glass,-.89),normalize(reflectionRay+tangentX*glassSpread))*.15;
      reflected+=roomReflection(vec3(glass,-.89),normalize(reflectionRay-tangentX*glassSpread))*.15;
      reflected+=roomReflection(vec3(glass,-.89),normalize(reflectionRay+tangentY*glassSpread))*.15;
      reflected+=roomReflection(vec3(glass,-.89),normalize(reflectionRay-tangentY*glassSpread))*.15;
      vec3 waterGlint=rain.z*mix(vec3(.26,.33,.42),clamp(plate*3.,0.,1.),.4)+rain.w*vec3(1.,.58,.24);
      diffuseColor *= vec4(max(mix(plate,reflected,paneFresnel)+waterGlint,vec3(0.)),1.);
    `);
  };
  material.customProgramCacheKey = () => inspection?'room-weather-v12-optical-panels-inspection':'room-weather-v12-optical-panels-room';
  return material;
  }
  const material=makeMaterial(false),inspectionMaterial=makeMaterial(true);
  function update(time: number, _driftX: number, _driftY: number) {
    uniforms.weatherTime.value = time;
  }
  return { material, inspectionMaterial, depth, update, setLamp:(level:number)=>{uniforms.weatherLampLevel.value=level;} };
}
