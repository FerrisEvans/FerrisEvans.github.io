import {Color, LinearFilter, SRGBColorSpace, VideoTexture, type Texture} from 'three';
import type {RoomAssets} from './assets';
import type {RoomLoadTimings} from './load-timings';
import {createVideoTransport} from './home-video-transport';

export type HomeFilmManifest={video:string;poster:string;light:string;duration:number;fps:number;width:number;height:number;posterTime:number;files?:Record<string,{bytes:number;sha256:string}>};
type LightFrames={fps:number;duration:number;colorSpace:'linear-srgb';frames:[number,number,number][]};

/** Only the continuous range at the playhead counts as initial playback buffer. */
export function homeBufferedAhead(video:Pick<HTMLVideoElement,'buffered'|'currentTime'>) {
  const {buffered,currentTime}=video;
  for(let i=0;i<buffered.length;i++)if(buffered.start(i)<=currentTime+.05&&buffered.end(i)>=currentTime)return buffered.end(i)-currentTime;
  return 0;
}

export function waitForHomeVideoReady(video:HTMLVideoElement,manifest:HomeFilmManifest,options:{signal?:AbortSignal;timing?:RoomLoadTimings;idleTimeoutMs?:number;now?:()=>number;activity?:()=>number|undefined}={}) {
  const now=options.now??(()=>performance.now()),idleTimeout=options.idleTimeoutMs??45000;
  const endReady=options.timing?.start('video.ready',{url:manifest.video,condition:'metadata + future data + 4s continuous buffer'});
  return new Promise<void>((resolve,reject)=>{
    let finished=false,timer:number|undefined,lastProgress=now(),lastAhead=-1,lastState=0,metadataObserved=false;
    const observed=['loadstart','loadedmetadata','durationchange','loadeddata','canplay','canplaythrough','progress','suspend','stalled','seeked'] as const;
    const cleanup=()=>{window.clearTimeout(timer);for(const event of observed)video.removeEventListener(event,observe);video.removeEventListener('error',error);options.signal?.removeEventListener('abort',abort);};
    const finish=(failure?:Error)=>{
      if(finished)return;finished=true;cleanup();
      endReady?.(failure?(failure.name==='AbortError'?'aborted':'error'):'ok',{readyState:video.readyState,bufferedAhead:homeBufferedAhead(video),error:failure?.message});
      if(failure)reject(failure);else resolve();
    };
    const arm=()=>{
      window.clearTimeout(timer);
      // Native media can queue behind the atlas requests. Productive bundle
      // traffic must not be mistaken for a failed video connection.
      const latest=Math.max(lastProgress,options.activity?.()??lastProgress);
      timer=window.setTimeout(()=>{
        const activity=Math.max(lastProgress,options.activity?.()??lastProgress);
        if(now()-activity<idleTimeout){arm();return;}
        finish(new Error('Home film initial buffering stalled'));
      },Math.max(1,idleTimeout-(now()-latest)));
    };
    const check=()=>{
      if(finished)return;
      if(video.readyState>=1){
        if(!Number.isFinite(video.duration)||Math.abs(video.duration-manifest.duration)>.1||video.videoWidth!==manifest.width||video.videoHeight!==manifest.height){finish(new Error('Home film metadata differs from its manifest'));return;}
        if(!metadataObserved){metadataObserved=true;options.timing?.mark('video.metadata-valid',{duration:video.duration,width:video.videoWidth,height:video.videoHeight});}
      }
      const ahead=homeBufferedAhead(video);
      if(ahead>lastAhead+.01||video.readyState>lastState){lastAhead=ahead;lastState=video.readyState;lastProgress=now();arm();}
      const needed=Math.min(4,Math.max(0,manifest.duration-video.currentTime));
      if(metadataObserved&&!video.seeking&&video.readyState>=3&&ahead+.01>=needed)finish();
    };
    const observe=(event:Event)=>{options.timing?.mark('video.'+event.type,{readyState:video.readyState,bufferedAhead:homeBufferedAhead(video)});check();};
    const error=()=>finish(new Error(`Home film could not be decoded (media error ${video.error?.code??'unknown'})`));
    const abort=()=>finish(new DOMException('Aborted','AbortError'));
    for(const event of observed)video.addEventListener(event,observe);
    video.addEventListener('error',error);options.signal?.addEventListener('abort',abort,{once:true});
    if(options.signal?.aborted){abort();return;}
    if(video.error){error();return;}
    arm();check();
  });
}

/** Native HTTP/Range buffering, one decoder, no full-file Blob or Canvas readback. */
export async function createHomeVideo(manifest:HomeFilmManifest,assets:RoomAssets,poster:Texture,signal?:AbortSignal) {
  if(![manifest.duration,manifest.fps,manifest.width,manifest.height].every(value=>Number.isFinite(value)&&value>0)||!Number.isFinite(manifest.posterTime))throw new Error('Invalid Home film manifest');
  const filename=manifest.video.split('/').pop()!.split('?')[0];
  const url=assets.mediaUrl(manifest.video,manifest.files?.[filename]?.sha256);
  const video=document.createElement('video');
  video.muted=true;video.defaultMuted=true;video.playsInline=true;video.loop=true;video.preload='auto';
  const aborter=new AbortController();
  let texture:VideoTexture|undefined,transport:ReturnType<typeof createVideoTransport>|undefined,disposed=false;
  const release=()=>{
    if(disposed)return;disposed=true;signal?.removeEventListener('abort',release);aborter.abort();
    transport?.dispose();texture?.dispose();video.pause();video.removeAttribute('src');video.load();
  };
  signal?.addEventListener('abort',release,{once:true});
  if(signal?.aborted){release();throw new DOMException('Aborted','AbortError');}
  try{
    const cancelled=new Promise<never>((_resolve,reject)=>aborter.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
    const ready=waitForHomeVideoReady(video,manifest,{signal:aborter.signal,timing:assets.timing,activity:()=>assets.activeRequests>0?assets.lastNetworkActivity:undefined});
    const lightTask=Promise.resolve().then(()=>assets.read(manifest.light)).then(bytes=>{
      const light:LightFrames=JSON.parse(new TextDecoder().decode(bytes));
      if(light.colorSpace!=='linear-srgb'||light.fps!==manifest.fps||light.duration!==manifest.duration||!Array.isArray(light.frames)||light.frames.length!==Math.round(manifest.duration*manifest.fps)||!light.frames.every(frame=>Array.isArray(frame)&&frame.length===3&&frame.every(value=>Number.isFinite(value)&&value>=0&&value<=1)))throw new Error('Invalid Home film light table');
      return light;
    });
    const prepared=Promise.race([Promise.all([ready,lightTask]),cancelled]);
    // Attach a handler before setting src: a synchronous browser failure still
    // cancels the waiter without leaving an unhandled promise rejection.
    void prepared.catch(()=>{});
    assets.timing?.mark('video.source',{url,mode:'native-http'});
    video.src=url;video.load();
    const [,light]=await prepared;
    if(disposed||signal?.aborted)throw new DOMException('Aborted','AbortError');
    texture=new VideoTexture(video);texture.flipY=false;texture.colorSpace=SRGBColorSpace;
    texture.minFilter=texture.magFilter=LinearFilter;texture.generateMipmaps=false;
    transport=createVideoTransport(video);
    const media=transport,average=new Color();
    return {
      ...media,
      // Preserve transport accessors; the actual media playhead owns the clock.
      get time(){return media.time;},get playing(){return media.playing&&!video.error;},get failed(){return media.failed||Boolean(video.error);},
      texture,poster,manifest,
      color(reduced=false){const time=reduced?manifest.posterTime:video.currentTime;return average.setRGB(...light.frames[Math.max(0,Math.min(light.frames.length-1,Math.floor(time*light.fps)))]);},
      get stats(){const frames=video.getVideoPlaybackQuality();return{decoded:frames.totalVideoFrames,dropped:frames.droppedVideoFrames,ready:video.readyState,bufferedAhead:homeBufferedAhead(video)};},
      dispose:release,
    };
  }catch(error){release();throw error;}
}
