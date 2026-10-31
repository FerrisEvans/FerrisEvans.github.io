import { RoomAssets, type AssetFile } from './assets';
import { createLoadTimings } from './load-timings';
import { RoomAudio } from './audio';
import { selectQuality, createQualityMonitor, type QualitySelection } from './quality';
import { paintOSD, positionOSD } from './osd';
import type { createExperience } from './experience';
import { createLoadingProgress, yieldForLoading, type LoadingReporter } from './loading';
import { pageInfo, parseView, viewLabels, type RoomContent, type RoomView } from './content';

type State = 'loading' | 'preparing' | 'ready' | 'entering' | 'active' | 'fallback';

export async function mountRoom() {
  const room = document.querySelector<HTMLElement>('#room')!;
  const status = document.querySelector<HTMLElement>('#status')!;
  const params = new URLSearchParams(location.search);
  const timing=createLoadTimings();
  if(params.has('debug')||['localhost','127.0.0.1'].includes(location.hostname))(window as Window & {__roomLoadTimings?:typeof timing.snapshot}).__roomLoadTimings=()=>timing.snapshot();
  if(params.has('debug'))room.dataset.debug='true';
  else {const summary=document.querySelector('#object-menu summary');if(summary)summary.textContent='键盘操作';}
  if (['greybox', 'materials'].includes(params.get('study') ?? '')) {
    room.dataset.study = 'true';
    document.querySelector('.stage')!.textContent = 'STUDY / 03';
    const { mountGreybox } = await import('./greybox');
    return mountGreybox();
  }
  const host = document.querySelector<HTMLElement>('#scene')!;
  const osd = document.querySelector<HTMLElement>('#osd')!;
  const osdCanvas = document.querySelector<HTMLCanvasElement>('#osd-canvas')!;
  const enter = document.querySelector<HTMLButtonElement>('#enter-room')!;
  const sound = document.querySelector<HTMLButtonElement>('#sound')!;
  const next = document.querySelector<HTMLButtonElement>('#next-channel')!;
  const standby = document.querySelector<HTMLButtonElement>('#standby')!;
  const homePlay = document.querySelector<HTMLButtonElement>('#home-play')!;
  const progress = document.querySelector<HTMLElement>('#progress')!;
  const retry = document.querySelector<HTMLButtonElement>('#retry')!;
  const back = document.querySelector<HTMLButtonElement>('#back-home')!;
  const navLinks = [...document.querySelectorAll<HTMLAnchorElement>('[data-room-view]')];
  const content: RoomContent = JSON.parse(document.querySelector('#room-content')!.textContent!);
  const aborter = new AbortController();
  const { signal } = aborter;
  const graphicsAborter = new AbortController();
  signal.addEventListener('abort', () => graphicsAborter.abort(), { once: true });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  // Motion accessibility follows the operating system; it is not a third
  // rendering tier or a persisted user-selectable effects preset.
  const isReduced = () => reduced.matches || captureMode === 'reading';
  const small = matchMedia('(max-width: 700px), (max-aspect-ratio: 6/5)');
  const audio = new RoomAudio();
  audio.onStateChange = syncSound;
  const captureMode = params.get('capture');
  const capture = captureMode === 'poster' || captureMode === 'reading';
  if (capture) room.dataset.capture = 'true';
  let viewer: Awaited<ReturnType<typeof createExperience>> | undefined;
  let performanceDismissed=false;
  try{performanceDismissed=sessionStorage.getItem('room-performance-dismissed')==='true';}catch{/* Optional preference. */}
  let windowHintTimer:ReturnType<typeof setTimeout>|undefined;
  function revealWindowControls(){
    if(!viewer?.windowActive)return;
    room.dataset.windowControls='visible';clearTimeout(windowHintTimer);
    windowHintTimer=setTimeout(()=>{room.dataset.windowControls='quiet';},3500);
  }
  room.addEventListener('pointermove',revealWindowControls,{signal});
  room.addEventListener('wheel',revealWindowControls,{signal,passive:true});
  signal.addEventListener('abort',()=>clearTimeout(windowHintTimer),{once:true});
  document.querySelectorAll<HTMLButtonElement>('#window-controls button[data-window-mode]').forEach(button=>button.addEventListener('click',()=>{
    viewer?.windowMode(button.dataset.windowMode as 'overview'|'detail');revealWindowControls();
  },{signal}));
  document.querySelector('#window-return')!.addEventListener('click',()=>{viewer?.returnFromWindow();resumeLoop();},{signal});
  let state: State = 'loading';
  let frame = 0;
  let start = 0;
  let lastFrame = 0, lastRendered = 0, stableAfter = 0;
  let quality: QualitySelection = selectQuality({});
  let qualityMonitor = createQualityMonitor(quality);
  let staticUntil = 0;
  let displayedPercent = 0;
  const loadingProgress = createLoadingProgress();
  let assets: RoomAssets | undefined;
  let osdTitle = 'LOADING';
  let osdDetail = '0%';
  let view: RoomView = 'home';
  let requestedView = parseView(location.hash.slice(1));
  let page = pageInfo(content.posts.length, Number(history.state?.roomPage)).page;
  room.dataset.view = view;

  const drawOSD = () => paintOSD(osdCanvas, osdTitle, osdDetail, state === 'loading' || state === 'preparing' ? displayedPercent : undefined);
  const reportLoading:LoadingReporter=update=>{
    if(signal.aborted || (state!=='loading'&&state!=='preparing'))return;
    displayedPercent=loadingProgress.report(update);
    const labels={download:'下载资源',model:'建立场景',textures:'准备纹理与影片',reflection:'准备反射',shaders:'编译画面',frame:'确认首帧'};
    const osdLabels={download:'DOWNLOAD',model:'BUILD SCENE',textures:'TEXTURES',reflection:'REFLECTIONS',shaders:'SHADERS',frame:'FIRST FRAME'};
    const loaded=Number(room.dataset.loadedBytes??0),total=Number(room.dataset.totalBytes??0),downloading=loaded<total;
    const stage=downloading?'download':update.stage;
    const label=downloading&&state==='preparing'?'下载资源并准备画面':labels[stage];
    const detail=downloading?`${(loaded/1e6).toFixed(1)} / ${(total/1e6).toFixed(1)} MB`:update.detail;
    room.dataset.loadingStage=stage;room.dataset.loadingPercent=String(displayedPercent);
    progress.setAttribute('aria-valuenow',String(displayedPercent));
    progress.setAttribute('aria-valuetext',`${displayedPercent}% · ${label}`);
    osdDetail=`${displayedPercent}% / ${osdLabels[stage]}`;
    status.textContent=`${label} ${displayedPercent}%${detail?' · '+detail:''}`;
    drawOSD();
  };
  function setState(value: State, message: string) {
    timing.mark('state.'+value,{visibility:document.visibilityState});
    if((value==='ready'||value==='fallback')&&(params.has('debug')||['localhost','127.0.0.1'].includes(location.hostname))){
      const output=document.querySelector<HTMLScriptElement>('#room-load-timings')??document.createElement('script');
      output.id='room-load-timings';output.type='application/json';output.textContent=JSON.stringify(timing.snapshot());
      if(!output.isConnected)document.body.append(output);
    }
    state = value;
    room.dataset.state = value;
    status.setAttribute('aria-live', value === 'loading' ? 'off' : 'polite');
    status.textContent = message;
    enter.disabled = value !== 'ready';
    next.disabled = value !== 'active';
    standby.disabled = value !== 'active' && value !== 'entering';
    progress.hidden = value !== 'loading' && value !== 'preparing';
  }
  function syncSound() {
    sound.textContent = audio.enabled ? 'SOUND ON' : 'SOUND OFF';
    sound.setAttribute('aria-pressed', String(audio.enabled));
    sound.setAttribute('aria-label', audio.enabled ? '关闭雨声与交互声音' : '开启雨声与交互声音');
    room.dataset.audio = audio.state;
    room.dataset.sound = audio.enabled ? 'on' : 'off';
  }
  let fpsSince=0,fpsFrames=0,lastInspection:string|undefined,lastHomePlaying:boolean|undefined;
  function stopLoop() { cancelAnimationFrame(frame); frame = 0; lastRendered=0; fpsSince=0;fpsFrames=0;delete room.dataset.renderFps;qualityMonitor.reset(); }
  function draw(time: number) {
    if (!viewer || document.hidden) return;
    const reveal = state === 'entering' ? Math.min((time - start) / 650, 1) : state === 'active' ? 1 : 0;
    const smooth = reveal * reveal * (3 - 2 * reveal);
    viewer.render(time / 1000, !isReduced(), staticUntil > time ? (staticUntil - time) / 150 : 0, smooth);
    const homePlaying=room.dataset.homeProgram==='playing';
    if(homePlaying!==lastHomePlaying){homePlay.textContent=homePlaying?'暂停节目':'播放节目';homePlay.setAttribute('aria-pressed',String(homePlaying));lastHomePlaying=homePlaying;}
    if(room.dataset.inspection!==lastInspection){lastInspection=room.dataset.inspection;if(lastInspection==='window')revealWindowControls();else{clearTimeout(windowHintTimer);delete room.dataset.windowControls;}}
    if (state === 'entering' && reveal === 1) {
      setState('active', '拖动环顾 · C 电脑 / N 记事本 / Z 电视');
      navigate(requestedView, false, false);
      navLinks.find(link => link.dataset.roomView === view)?.focus({ preventScroll: true });
    }
  }
  function tick(time: number) {
    frame = 0;
    if (document.hidden || (state !== 'entering' && state !== 'active')) return;
    const delta = time - lastFrame, interval = 1000 / (isReduced() ? 24 : quality.fps);
    if (delta >= interval - .5) {
      lastFrame = time - (delta >= interval ? delta % interval : 0);
      const advice=qualityMonitor.observe({nowMs:time,frameMs:time-lastRendered,
        visible:!document.hidden,continuous:!isReduced()&&lastRendered>0,
        stable:state==='active'&&!viewer?.moving&&time>stableAfter});
      if(advice){
        room.dataset.performance='limited';
        room.dataset.measuredFps=advice.measuredFps.toFixed(1);
        document.querySelector<HTMLElement>('#performance-notice')!.hidden=performanceDismissed;
        console.info('Room performance: LO-FI offered; high-quality rendering retained.', advice);
      }
      lastRendered=time;draw(time);
      if(state==='active'&&!isReduced()){
        if(!fpsSince)fpsSince=time;
        else fpsFrames++;
        if(time-fpsSince>=2000){room.dataset.renderFps=(fpsFrames*1000/(time-fpsSince)).toFixed(1);fpsSince=time;fpsFrames=0;}
      }
    }
    if (!isReduced() || state === 'entering' || viewer?.moving || viewer?.mediaPlaying) frame = requestAnimationFrame(tick);
  }
  function resumeLoop() {
    stopLoop();
    draw(performance.now());
    if (!document.hidden && (state === 'entering' || (state === 'active' && (!isReduced() || viewer?.moving || viewer?.mediaPlaying)))) frame = requestAnimationFrame(tick);
  }
  function navigate(target: RoomView, push = true, animateLoop = true) {
    if (state !== 'active' || !viewer) return;
    view = requestedView = target;
    room.dataset.view = view;
    navLinks.forEach(link => {
      if (link.dataset.roomView === view) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    if (push && location.hash !== `#${view}`) history.pushState({ ...history.state, roomPage: page }, '', `#${view}`);
    viewer.navigate(view, page, isReduced());
    staticUntil = performance.now() + 150;
    status.textContent = view === 'home' ? '拖动环顾 · C 电脑 / N 记事本 / Z 电视' : view === 'work' ? '选择录像带 · ESC 放下记事本 · N 再次拿起' : `${viewLabels[view]} · ESC 返回桌面`;
    audio.tone();
    if (animateLoop) resumeLoop();
    else viewer.render(performance.now() / 1000, !isReduced(), 0, 1);
  }
  function changePage(nextPage: number) {
    if (!viewer || state !== 'active' || view !== 'posts') return;
    page = pageInfo(content.posts.length, nextPage).page;
    const selectedRow=[...document.querySelectorAll('.surface-posts a')].indexOf(document.activeElement as HTMLAnchorElement);
    viewer.setPage(page);
    if(selectedRow>=0){const links=[...document.querySelectorAll<HTMLAnchorElement>('.surface-posts a')];links[Math.min(selectedRow,links.length-1)]?.focus({preventScroll:true});}
    history.replaceState({ ...history.state, roomPage: page }, '', '#posts');
    staticUntil = performance.now() + 150;
    status.textContent = `文章 ${page + 1}/${pageInfo(content.posts.length, page).pages} · ←/→ 翻页 · Tab 选择 · ESC 返回`;
    audio.tone(); resumeLoop();
  }
  function resize() {
    stableAfter=performance.now()+2000;
    positionOSD(osd, room.clientWidth, room.clientHeight);
    viewer?.resize();
    draw(performance.now());
  }
  function fail(message: string, error?: unknown) {
    if (signal.aborted) return;
    stopLoop();
    assets?.dispose();
    graphicsAborter.abort();
    viewer?.dispose();
    viewer = undefined;
    audio.mute();
    syncSound();
    setState('fallback', message);
    retry.hidden = false;
    if (error) console.warn('Room unavailable:', error instanceof Error ? error.message : error);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(room);
  resize();
  syncSound();
  status.setAttribute('aria-live', 'off');
  retry.addEventListener('click', () => location.reload(), { signal });
  document.querySelector('#dismiss-performance')!.addEventListener('click',()=>{
    performanceDismissed=true;
    try{sessionStorage.setItem('room-performance-dismissed','true');}catch{/* Optional preference. */}
    document.querySelector<HTMLElement>('#performance-notice')!.hidden=true;
  },{signal});
  navLinks.forEach(link => link.addEventListener('click', event => {
    event.preventDefault(); navigate(parseView(link.dataset.roomView!));
  }, { signal }));
  back.addEventListener('click', () => navigate('home'), { signal });
  document.querySelectorAll<HTMLButtonElement>('[data-room-action]').forEach(button => button.addEventListener('click',()=>{if(state==='active'){viewer?.action(button.dataset.roomAction!);button.closest('details')?.removeAttribute('open');resumeLoop();}},{signal}));
  function restoreLocation() {
    requestedView = parseView(location.hash.slice(1));
    const restoredPage = pageInfo(content.posts.length, Number(history.state?.roomPage)).page;
    const changedPage = restoredPage !== page; page = restoredPage;
    if (state === 'active' && requestedView !== view) navigate(requestedView, false);
    else if (changedPage && view === 'posts') changePage(page);
  }
  window.addEventListener('popstate', restoreLocation, { signal });
  window.addEventListener('hashchange', restoreLocation, { signal });
  sound.addEventListener('click', async () => {
    sound.disabled = true;
    try {
      if (audio.enabled) audio.mute();
      else {
        const enabled = await audio.enable();
        if (signal.aborted || document.hidden) { audio.mute(); return; }
        if (enabled) audio.tone();
        else status.textContent = '声音不可用，仍可静音进入。';
      }
    } finally { sound.disabled = false; syncSound(); resumeLoop(); }
  }, { signal });
  enter.addEventListener('click', () => {
    if (state !== 'ready' || !viewer) return;
    start = performance.now();
    room.dataset.channel = 'home';
    viewer.setProgram('home');
    setState('entering', '进入场景…');
    audio.tone(true);
    if (isReduced()) start -= 650;
    resumeLoop();
  }, { signal });
  function returnToStandby() {
    if (state !== 'active' && state !== 'entering') return;
    stopLoop();
    staticUntil = 0;
    view = 'home'; room.dataset.view = view;
    viewer?.standby();
    audio.mute();syncSound();
    osdTitle = 'PRESS PLAY';
    osdDetail = 'CLICK TO ENTER';
    setState('ready', '画面已就绪 · 点击电视或按 Tab 选择后进入');
    drawOSD();
    enter.focus({ preventScroll: true });
  }
  standby.addEventListener('click', returnToStandby, { signal });
  document.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat) return;
    if(state==='active'&&viewer?.windowActive){revealWindowControls();if(event.key==='0'){event.preventDefault();viewer.windowMode('overview');return;}}
    if (state === 'active' && !viewer?.windowActive && view === 'posts' && ['ArrowLeft','ArrowRight','ArrowDown','ArrowUp'].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') changePage(page + (event.key === 'ArrowRight' ? 1 : -1));
      else {
        const links = [...document.querySelectorAll<HTMLAnchorElement>('.surface-posts a')];
        const index = links.indexOf(document.activeElement as HTMLAnchorElement);
        const first = 0;
        const nextIndex = index < 0 ? first : (index + (event.key === 'ArrowDown' ? 1 : links.length-1)) % links.length;
        links[nextIndex]?.focus({preventScroll:true});
      }
      return;
    }
    if(state==='active'&&viewer?.calculatorActive&&(/^[0-9.+*/%=-]$/.test(event.key)||['Enter','Backspace','Delete'].includes(event.key))){event.preventDefault();viewer?.calculatorKey(event.key==='Enter'?'=':event.key==='Delete'?'C':event.key);resumeLoop();return;}
    if(state==='active'&&!viewer?.windowActive&&((view==='about'&&['ArrowDown','ArrowUp'].includes(event.key))||(['about','online'].includes(view)&&['q','Q','1','2'].includes(event.key)))){event.preventDefault();viewer?.computerKey(event.key);resumeLoop();return;}
    if(state==='active' && !viewer?.windowActive && view==='about' && ['ArrowLeft','ArrowRight','PageDown','PageUp',' '].includes(event.key) && !(event.key===' ' && (event.target as HTMLElement).matches('button'))){event.preventDefault();viewer?.computerPage(['ArrowLeft','PageUp'].includes(event.key)?-1:1);resumeLoop();return;}
    if (state === 'active' && event.key.length === 1 && !['INPUT','TEXTAREA','SELECT'].includes((event.target as HTMLElement).tagName)) {
      const shortcut = ({c:'about',n:'work',z:'tv'} as const)[event.key.toLowerCase() as 'c'|'n'|'z'];
      if (shortcut) { event.preventDefault(); if(shortcut==='tv')viewer?.action('zoom');else if(shortcut==='work'&&view==='work')viewer?.action('work');else navigate(shortcut); resumeLoop();return; }
      const object=({l:'lamp',w:'window',m:'cd',' ':'play'} as Record<string,string>)[event.key.toLowerCase()];
      if(object&&!((event.target as HTMLElement).matches('button,a')&&event.key===' ')){event.preventDefault();viewer?.action(object);resumeLoop();return;}
    }
    if (event.key !== 'Escape') return;
    if(state==='active'&&viewer?.escape()){event.preventDefault();resumeLoop();return;}
    if (state === 'active' && view !== 'home') {
      navigate('home'); navLinks[0]?.focus({ preventScroll: true });
    } else returnToStandby();
  }, { signal });
  next.addEventListener('click', () => {
    if (state !== 'active' || !viewer) return;
    viewer.nextTape();
    staticUntil = performance.now() + 150;
    audio.tone();
    resumeLoop();
  }, { signal });
  function syncMotion() {
    room.dataset.motion = isReduced() ? 'reduced' : 'full';
    if (isReduced() && state === 'entering') start = performance.now() - 650;
    if (isReduced()) viewer?.settle();
    resumeLoop();
  }
  reduced.addEventListener('change', syncMotion, { signal });
  syncMotion();
  small.addEventListener('change', () => {
    if (small.matches && !capture) fail('窗口过窄，请使用 LO-FI；加宽窗口后可重新加载。');
  }, { signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopLoop(); viewer?.suspend(); audio.mute(); syncSound(); }
    else resumeLoop();
  }, { signal });
  window.addEventListener('pageshow', () => { resize(); resumeLoop(); }, { signal });
  window.addEventListener('pagehide', (event) => {
    stopLoop();
    viewer?.suspend();
    audio.mute();
    syncSound();
    if (!event.persisted) {
      aborter.abort();
      observer.disconnect();
      assets?.dispose();
      viewer?.dispose();
      audio.dispose();
    }
  }, { signal });

  if (small.matches && !capture) {
    setState('fallback', '手机与窄窗口请使用 LO-FI 阅读博客，保留现有文章与搜索。');
    sound.hidden = true;
    return;
  }
  try {
    // Reuse this context for rendering; unsupported desktops must not download
    // the scene bundle just to discover that WebGL 2 cannot be initialized.
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!context) {
      fail('当前浏览器无法启动 WebGL 2，请使用 LO-FI 阅读博客。');
      return;
    }
    const rendererInfo=context.getExtension('WEBGL_debug_renderer_info');
    const rendererName=String(context.getParameter(rendererInfo?.UNMASKED_RENDERER_WEBGL??context.RENDERER));
    quality=selectQuality({renderer:rendererName,maxTextureSize:context.getParameter(context.MAX_TEXTURE_SIZE),
      hardwareConcurrency:navigator.hardwareConcurrency,reducedMotion:isReduced()});
    qualityMonitor=createQualityMonitor(quality);
    Object.assign(room.dataset,{quality:quality.tier,qualityReason:quality.reason,targetFps:String(quality.fps)});
    if(quality.mode==='lofi'){
      context.getExtension('WEBGL_lose_context')?.loseContext();
      fail(quality.reason==='software-renderer'?'当前设备使用软件绘图，请进入 LO-FI 阅读版。':'当前图形能力不足，请使用 LO-FI 阅读版。');
      return;
    }
    performance.mark('room-load-start');
    graphicsAborter.signal.addEventListener('abort', () => {
      context.getExtension('WEBGL_lose_context')?.loseContext();
    }, { once: true });
    // The poster already has high fetch priority. Let it finish before dozens
    // of atlas requests compete on a slow connection; a broken poster must
    // never prevent the actual room from loading.
    const poster=document.querySelector<HTMLImageElement>('#poster img');
    if(poster&&!capture){
      const endPoster=timing.start('poster.prepare');
      let deadline:ReturnType<typeof setTimeout>|undefined;
      await Promise.race([poster.decode().catch(()=>{}),new Promise<void>(resolve=>{deadline=setTimeout(resolve,2000);})]);
      clearTimeout(deadline);endPoster();
      if(signal.aborted||graphicsAborter.signal.aborted)return;
    }
    const files: (AssetFile & {deferred?:boolean})[] = JSON.parse(document.querySelector('#room-assets')!.textContent!);
    assets = new RoomAssets(files.filter(file=>!file.deferred), (loaded, total) => {
      if (state !== 'loading' && state !== 'preparing') return;
      room.dataset.loadedBytes = String(loaded);
      room.dataset.totalBytes = String(total);
      reportLoading({stage:'download',completed:loaded,total,detail:`${(loaded / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB`});
    }, {deferred:files.filter(file=>file.deferred),timing,version:room.dataset.assetVersion});
    drawOSD();
    const fontReady = Promise.all([['RoomPixel','/room/fonts/VT323-Regular.ttf'],['RoomPixelZH','/fonts/room-pixel-zh.woff2']].map(async ([family,url]) => {
      const buffer=await assets!.read(url,'high');
      const font = await new FontFace(family, buffer).load();
      if (signal.aborted) return;
      document.fonts.add(font);
      drawOSD();
    }));
    // Start the module graph before dozens of texture requests occupy the
    // connection queue. Decode/upload can then overlap the remaining download.
    const experienceModule=import('./experience');
    const endDownloads=timing.start('loading.downloads');
    // Parse the model and prepare each arriving texture while the remaining
    // files are downloading. Keep every preload rejection observed immediately.
    const downloads=assets.preload().then(()=>{endDownloads();return {error:undefined};},error=>{endDownloads('error');return {error};});
    const [, module] = await Promise.all([fontReady, experienceModule]);
    if (signal.aborted||graphicsAborter.signal.aborted) return;
    setState('preparing', '正在下载资源并准备首帧…');
    osdTitle = 'TUNING IN';
    await yieldForLoading(signal);
    viewer = await module.createExperience(host, assets, graphicsAborter.signal, () => fail('图形上下文已丢失。可重新加载，或进入 LO-FI。'), content, { navigate, page: changePage, wake:resumeLoop,homeAudio:(playing,time)=>audio.setHome(playing,time),music:(value,reset)=>{void Promise.resolve(audio.setMusic(value,reset)).then(resumeLoop);},musicTime:()=>audio.musicTime,musicRunning:()=>audio.musicRunning,soundEnabled:()=>audio.enabled,volume:(value)=>audio.setVolume(value), feedback:(message)=>{status.textContent=message;audio.tone();} }, { canvas, context, dprCap:quality.dprCap }, reportLoading);
    const downloaded=await downloads;
    if(downloaded.error)throw downloaded.error;
    if (signal.aborted||graphicsAborter.signal.aborted) { viewer.dispose(); return; }
    assets.release();
    room.dataset.camera = 'HomeCamera';
    room.dataset.quality = quality.tier;
    performance.mark('room-ready');
    performance.measure('room-load-to-ready','room-load-start','room-ready');
    progress.setAttribute('aria-valuenow', '100');
    osdTitle = 'PRESS PLAY';
    osdDetail = 'CLICK TO ENTER';
    setState('ready', '画面已就绪 · 点击电视或按 Tab 选择后进入');
    drawOSD();
    resize();
    // Fine irradiance is optional for entry. Stream it after the first frame,
    // then blend it only while the visitor is inside the room.
    const detailTimer=setTimeout(()=>{
      if(graphicsAborter.signal.aborted)return;
      void viewer?.prepareDetails().then(resumeLoop,()=>{});
    },600);
    graphicsAborter.signal.addEventListener('abort',()=>clearTimeout(detailTimer),{once:true});
    // Asset capture uses the same entry path, with static Home and sound off.
    if (captureMode === 'reading') enter.click();
  } catch (error) {
    fail('场景加载失败。可以重试，或直接进入 LO-FI 阅读博客。', error);
  }
}
