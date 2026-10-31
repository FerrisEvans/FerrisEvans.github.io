import { DataTexture, LinearFilter, MeshBasicMaterial, NoColorSpace, RGBAFormat, Vector2, type Texture } from 'three';

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
export function createWeather(cityMap: Texture) {
  const depth = cityDepth();
  const uniforms = { weatherTime: { value: 0 }, cityDepth: { value: depth }, cityDepthSize: { value: new Vector2(...cityDepthSize) } };
  function makeMaterial(inspection:boolean) {
  const material = new MeshBasicMaterial({ map: cityMap, toneMapped: false });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec3 weatherWorld;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nweatherWorld = (modelMatrix * vec4(position, 1.)).xyz;');
    shader.fragmentShader = `
      uniform float weatherTime;
      uniform sampler2D cityDepth;
      uniform vec2 cityDepthSize;
      varying vec3 weatherWorld;
      float rainHash(vec2 p) { return fract(sin(dot(p,vec2(41.37,289.11)))*43758.5453); }
      float fallingRain(vec2 uv,float density,float speed) {
        vec2 q=uv*vec2(density,density*.31);
        q.x+=q.y*.07;
        q.y+=weatherTime*speed;
        vec2 id=floor(q),p=fract(q);
        float seed=rainHash(id),x=.12+.76*rainHash(id+3.1);
        float aa=max(fwidth(p.x),.001);
        float streak=1.-smoothstep(.002,.006+aa,abs(p.x-x));
        float segment=smoothstep(.08,.14,p.y)*(1.-smoothstep(.28,.48,p.y));
        return streak*segment*step(.73,seed);
      }
      vec3 rainLayer(vec2 p, float density, float speed) {
        vec2 grid = p * vec2(density, density * .31);
        // Beads follow slightly different slow paths; most remain small and faint.
        float column = floor(grid.x);
        grid.y += weatherTime * speed * mix(.30, 1.0, rainHash(vec2(column,7.9)));
        vec2 id = floor(grid), cell = fract(grid) - .5;
        float seed = rainHash(id);
        float x = (seed - .5) * .72 + sin(cell.y * 4. + seed * 19.) * .018;
        float y = -.30 + rainHash(id + vec2(5.7,1.2)) * .50;
        float size = mix(.55, 1.35, rainHash(id + vec2(19.1,8.3)));
        float stretch = mix(2.4, 4.5, rainHash(id + vec2(2.3,17.1)));
        vec2 delta = vec2((cell.x-x) * 1.2, (cell.y-y) * stretch) / size;
        float dist = length(delta);
        float aa = max(fwidth(dist), .012);
        float present = step(.58, seed);
        float drop = (1. - smoothstep(.045, .065 + aa, dist)) * present;
        float tailLength = mix(.12, .42, rainHash(id + vec2(11.8,3.1)));
        float tailX = x + sin((cell.y-y)*6. + seed*14.)*.012;
        float trail = (1. - smoothstep(.004, .012*size + aa*.2, abs(cell.x-tailX))) * smoothstep(.02,.08,cell.y-y) * (1.-smoothstep(tailLength*.65,tailLength,cell.y-y)) * step(.72,seed);
        float rim = (1.-smoothstep(.055,.082+aa,dist)) - (1.-smoothstep(.036,.055+aa,dist));
        // Directional glints and a dim lower rim read as water, not white outline icons.
        float side = dot(normalize(delta + vec2(.0001)), normalize(vec2(-.7,.7)));
        float glint = smoothstep(-.05,.80,side)*.12 - smoothstep(.05,.80,-side)*.025;
        return vec3(delta * drop * .006 + vec2(trail * .00015,0.), (rim * glint + trail*.045) * present);
      }
      vec3 rainRuns(vec2 p) {
        // Short, sparse rivulets live in two-dimensional glass cells, instead
        // of drawing one long equally spaced line for nearly every column.
        vec2 grid = p*vec2(3.2,1.25);
        float column = floor(grid.x);
        float speed = mix(.025,.080,rainHash(vec2(column,4.3)));
        grid.y += weatherTime*speed;
        vec2 id = floor(grid), cell = fract(grid);
        float seed = rainHash(id+vec2(7.3,12.8));
        float present = step(.78,seed);
        float headY = .13 + rainHash(id+vec2(2.1,4.8))*.12;
        float dy = cell.y-headY;
        float length = mix(.12,.62,rainHash(id+vec2(11.2,9.8)));
        float slope = (rainHash(id+vec2(1.9,8.7))-.5)*.13;
        float center = .20 + rainHash(id+vec2(5.1,3.7))*.60;
        float path = center + dy*slope + sin(dy*13.0+seed*29.0)*.009;
        float width = mix(.0017,.0062,rainHash(id+vec2(3.2,7.4)));
        float offset = cell.x-path;
        float aa = max(fwidth(cell.x),.0008);
        float line = 1.-smoothstep(width*.45,width+aa,abs(offset));
        float ends = smoothstep(0.,.035,dy)*(1.-smoothstep(length*.65,length,dy));
        float flow = line*ends*present;
        vec2 bead = vec2(offset,dy*1.2)/max(width*2.,.006);
        float head = exp(-dot(bead,bead)*1.7)*present;
        // Signed refraction and a restrained highlight read as wet glass,
        // while the irregular trail fades rather than becoming a white stripe.
        return vec3(sign(offset)*flow*.00045,head*.00014,(flow*.055+head*.10));
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
      vec3 rain = rainLayer(glass, 18., .11) + rainLayer(glass + vec2(7.3,1.6), 31., .18) * .55;
      rain += rainRuns(glass);
      vec2 refracted = clamp(uv + rain.xy*edgeFreedom, ${inspection?'0.,1.':'.002,.998'});
      vec3 plate = texture2D(map, refracted).rgb;
      // A little optical softness, strongest in the distant skyline; no global bloom pass.
      vec2 blur = vec2(1./2172.,1./724.);
      vec3 soft = plate*.25;
      soft += (texture2D(map,refracted+vec2(blur.x,0.)).rgb + texture2D(map,refracted-vec2(blur.x,0.)).rgb
               + texture2D(map,refracted+vec2(0.,blur.y)).rgb + texture2D(map,refracted-vec2(0.,blur.y)).rgb)*.125;
      soft += (texture2D(map,refracted+blur).rgb + texture2D(map,refracted-blur).rgb
               + texture2D(map,refracted+vec2(blur.x,-blur.y)).rgb + texture2D(map,refracted+vec2(-blur.x,blur.y)).rgb)*.0625;
      plate = mix(plate,soft,.08);
      vec3 halo = soft*.25 + (texture2D(map,refracted+vec2(.0042,.0063)).rgb + texture2D(map,refracted-vec2(.0042,.0063)).rgb
                  + texture2D(map,refracted+vec2(.0042,-.0063)).rgb + texture2D(map,refracted+vec2(-.0042,.0063)).rgb)*.1875;
      plate += max(halo-vec3(.29),vec3(0.))*.25;
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
      float airborne=fallingRain(photoUv,105.,7.2)+fallingRain(photoUv+vec2(.31,.17),173.,11.7)*.40;
      float distanceHaze=(1.-depthValue)*.055;
      plate=mix(plate,vec3(.065,.083,.105),distanceHaze);
      plate+=airborne*vec3(.12,.15,.18)*(.25+clamp(dot(soft,vec3(.2126,.7152,.0722))*2.,0.,1.));
      plate *= .90;
      diffuseColor *= vec4(max(plate + rain.z*vec3(.30,.35,.39), vec3(0.)),1.);
    `);
  };
  material.customProgramCacheKey = () => inspection?'room-weather-v6-full-inspection':'room-weather-v5-panoramic-depth';
  return material;
  }
  const material=makeMaterial(false),inspectionMaterial=makeMaterial(true);
  function update(time: number, _driftX: number, _driftY: number) {
    uniforms.weatherTime.value = time;
  }
  return { material, inspectionMaterial, depth, update };
}
