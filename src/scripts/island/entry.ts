import { RoomAssets } from '../room/assets';
import { createPanels } from './panels';
import { views, getViewLabels, isIslandView, type IslandView, type HoverTarget } from './types';
import { localeForDocument, t } from '../../i18n';
import { createIslandTooltip } from './tooltip';
import type { createIsland } from './scene';

type Island = Awaited<ReturnType<typeof createIsland>>;

function mountIsland() {
  const root = document.querySelector<HTMLElement>('#island-root');
  if (!root) return () => {};
  const locale = localeForDocument();
  const viewLabels = getViewLabels(locale);
  const host = document.querySelector<HTMLElement>('#island-scene')!;
  const status = document.querySelector<HTMLElement>('#island-status')!;
  const progress = document.querySelector<HTMLProgressElement>('#island-progress')!;
  const retry = document.querySelector<HTMLButtonElement>('#island-retry')!;
  const aborter = new AbortController(), { signal } = aborter;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const capture = new URLSearchParams(location.search).has('capture');
  if (capture) root.dataset.capture = 'true';
  let viewer: Island | undefined, assets: RoomAssets | undefined, graphicsAborter: AbortController | undefined;
  let generation = 0, frame = 0, previous = 0, elapsed = 0, rendered = 0;
  let statSince = 0, statFrames = 0;
  let loadingStarted = performance.now();
  let visible = true;
  const hint = createIslandTooltip(host);
  const access = document.createElement('nav');
  access.className = 'island-access-nav'; access.setAttribute('aria-label', t(locale, '场景内容入口', 'Explore the island')); host.append(access);
  const navigationLinks = [...document.querySelectorAll<HTMLAnchorElement>('.site-header [data-island-nav]')];
  let focusedView: IslandView | null = null;
  function setHover(view: HoverTarget | null, point?: { x: number; y: number }) {
    viewer?.hover(view); root!.dataset.hover = view ?? '';
    navigationLinks.forEach(link => link.classList.toggle('is-scene-linked', Boolean(view) && link.dataset.islandNav === view));
    host.style.cursor = isIslandView(view) ? 'pointer' : 'grab';
    if (isIslandView(view) && point && !capture) hint.show(viewLabels[view], point.x, point.y, reduced.matches);
    else hint.hide();
    invalidate();
  }
  for (const view of views) {
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'island-access-target'; button.textContent = viewLabels[view];
    button.dataset.islandAccess = view;
    button.addEventListener('click', () => panels.open(view, button), { signal });
    button.addEventListener('focus', () => { focusedView = view; setHover(view, viewer?.project(view) ?? undefined); }, { signal });
    button.addEventListener('blur', () => { focusedView = null; setHover(null); }, { signal });
    access.append(button);
  }
  function positionAccess() {
    access.hidden = root!.dataset.state !== 'ready' || Boolean(panels.selected) || capture;
    const point = focusedView ? viewer?.project(focusedView) : null;
    if (focusedView && point && !access.hidden) hint.show(viewLabels[focusedView], point.x, point.y, reduced.matches);
  }
  function stop() { cancelAnimationFrame(frame); frame = 0; previous = statSince = statFrames = 0; }
  function draw(now: number) {
    frame = 0;
    if (!viewer || document.hidden || !visible || signal.aborted) return;
    const dt = previous ? Math.min((now - previous) / 1000, .08) : 1 / 60;
    previous = now; elapsed += dt;
    viewer.render(capture ? 0 : elapsed, dt, capture || reduced.matches);
    rendered++; root!.dataset.renderFrames = String(rendered);
    root!.dataset.cameraMoving = String(viewer.moving);
    root!.dataset.motion = reduced.matches || capture ? 'reduced' : 'full';
    positionAccess();
    root!.dataset.cameraPoints = JSON.stringify(views.map(view => viewer?.project(view) ?? null));
    const live = viewer.metrics();
    root!.dataset.effects = JSON.stringify(live.effects);
    root!.dataset.activity = JSON.stringify(live.activity);
    root!.dataset.poses = JSON.stringify(live.poses);
    root!.dataset.outline = JSON.stringify(live.outline);
    if (!statSince) statSince = now;
    else statFrames++;
    if (now - statSince > 2000) {
      root!.dataset.frameMs = ((now - statSince) / statFrames).toFixed(2);
      root!.dataset.metrics = JSON.stringify(viewer.metrics()); statSince = now; statFrames = 0;
    }
    if (!reduced.matches && !capture && !frame) frame = requestAnimationFrame(draw);
  }
  function invalidate() { if (!frame && viewer && !document.hidden && visible && !signal.aborted) frame = requestAnimationFrame(draw); }
  const panels = createPanels(view => {
    viewer?.navigate(view, reduced.matches || capture);
    root.dataset.view = view ?? 'home'; focusedView = null; setHover(null);
    invalidate();
  }, signal);
  // Existing header links still navigate normally; hover/focus only explains
  // their scene counterpart. Archives and recent updates intentionally differ.
  for (const link of navigationLinks) {
    const view = link.dataset.islandNav as IslandView;
    const highlight = () => { if (viewer && !panels.selected && !capture) setHover(view); };
    link.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') highlight(); }, { signal });
    link.addEventListener('pointerleave', () => { if (document.activeElement !== link) setHover(null); }, { signal });
    link.addEventListener('focus', highlight, { signal });
    link.addEventListener('blur', () => { if (!link.matches(':hover')) setHover(null); }, { signal });
  }
  function releaseGraphics() { stop(); graphicsAborter?.abort(); graphicsAborter = undefined; assets?.dispose(); assets = undefined; viewer?.dispose(); viewer = undefined; }
  function fail(error?: unknown) {
    if (signal.aborted) return;
    generation++; releaseGraphics();
    root!.dataset.state = 'fallback'; progress.hidden = true; retry.hidden = false;
    status.textContent = t(locale, '庭院暂时没能打开。可以使用目录阅读，或重新加载。', 'The courtyard could not load. Read from the directory or try again.');
    panels.enhanced(false); positionAccess();
    if (error) console.warn('Island unavailable:', error instanceof Error ? error.message : String(error));
  }
  async function start() {
    const current = ++generation; releaseGraphics();
    const attempt = new AbortController(); graphicsAborter = attempt;
    loadingStarted = performance.now();
    root!.dataset.state = 'loading'; progress.hidden = false; progress.value = 0; retry.hidden = true;
    status.textContent = t(locale, '正在准备小岛…', 'Preparing the island…'); panels.enhanced(false);
    try {
      const model = new URL(root!.dataset.modelUrl!, location.href);
      const file = { url: model.pathname, bytes: Number(root!.dataset.modelBytes), sha256: model.searchParams.get('v') ?? undefined };
      const resources = new RoomAssets([file], (loaded, total, stats) => {
        if (current !== generation || signal.aborted) return;
        progress.value = total ? Math.min(90, loaded / total * 90) : 0;
        status.textContent = `${t(locale, '正在带来小岛', 'Loading the island')} · ${(Math.min(loaded, total) / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB`;
        root!.dataset.loadedBytes = String(loaded); root!.dataset.cacheBytes = String(stats.cacheBytes);
      });
      assets = resources;
      const [bytes, module] = await Promise.all([resources.read(file.url, 'high'), import('./scene')]);
      if (current !== generation || signal.aborted) return;
      root!.dataset.state = 'preparing'; progress.value = 92; status.textContent = t(locale, '正在布置林间庭院…', 'Setting up the woodland courtyard…');
      const next = await module.createIsland(host, bytes, invalidate, () => { if (current === generation) fail(new Error('WebGL context lost')); }, attempt.signal);
      if (current !== generation || signal.aborted) { next.dispose(); return; }
      viewer = next; resources.release();
      viewer.render(0, 0, true);
      root!.dataset.state = 'ready'; root!.dataset.readyMs = (performance.now() - loadingStarted).toFixed(0);
      root!.dataset.metrics = JSON.stringify(viewer.metrics());
      progress.value = 100; progress.hidden = true;
      status.textContent = t(locale, '悬停物件查看入口，点击阅读。拖动环顾，滚轮缩放。', 'Hover to discover an entrance, or tap to read. Drag to look around; scroll or pinch to zoom.');
      panels.enhanced(true);
      if (panels.selected) viewer.navigate(panels.selected, true);
      invalidate();
      // Trim older cached revisions after readiness without delaying the scene.
      void resources.prune();
    } catch (error) { if (current === generation && !signal.aborted) fail(error); }
  }
  retry.addEventListener('click', () => void start(), { signal });
  const observer = new ResizeObserver(() => viewer?.resize()); observer.observe(host);
  const visibility = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting; root.dataset.inViewport = String(visible);
    stop(); if (visible) invalidate();
  }, { rootMargin: '80px' });
  visibility.observe(host);
  window.addEventListener('theme-changed', () => viewer?.theme(document.documentElement.classList.contains('dark')), { signal });
  window.addEventListener('storage', event => {
    if (event.key === 'theme') {
      document.documentElement.classList.toggle('dark', event.newValue === 'dark');
      window.dispatchEvent(new CustomEvent('theme-changed'));
    }
  }, { signal });
  reduced.addEventListener('change', () => { stop(); viewer?.navigate(panels.selected, reduced.matches); invalidate(); }, { signal });
  document.addEventListener('visibilitychange', () => { stop(); if (!document.hidden) invalidate(); }, { signal });
  const pointers = new Map<number, { x: number; y: number; multiple: boolean; moved: boolean }>();
  let pendingTap: IslandView | undefined;
  host.addEventListener('pointerdown', event => {
    pendingTap = undefined;
    if ((event.target !== viewer?.canvas) || (event.pointerType !== 'touch' && event.button !== 0)) return;
    for (const value of pointers.values()) value.multiple = true;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, multiple: pointers.size > 0, moved: false });
    setHover(null);
  }, { signal, capture: true });
  host.addEventListener('pointermove', event => {
    const start = pointers.get(event.pointerId);
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 7) start.moved = true;
  }, { signal, capture: true });
  host.addEventListener('pointerup', event => {
    const start = pointers.get(event.pointerId); pointers.delete(event.pointerId);
    if (!start || start.multiple || start.moved || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 7 || panels.selected) return;
    const view = viewer?.pick(event.clientX, event.clientY);
    if (isIslandView(view)) pendingTap = view;
  }, { signal, capture: true });
  // Open after the browser has targeted the compatibility click. Opening a
  // modal on touch pointerup retargets that click to its backdrop and closes it.
  host.addEventListener('click', event => {
    if (event.detail === 0 || !pendingTap) return;
    const tap = pendingTap; pendingTap = undefined;
    panels.open(tap);
  }, { signal, capture: true });
  host.addEventListener('pointercancel', event => { pointers.delete(event.pointerId); pendingTap = undefined; }, { signal, capture: true });
  host.addEventListener('pointermove', event => {
    if (!viewer || event.pointerType === 'touch' || event.buttons || panels.selected || capture) return;
    focusedView = null;
    const view = event.target === viewer.canvas ? viewer.pick(event.clientX, event.clientY) : null;
    const rect = host.getBoundingClientRect();
    setHover(view, { x: event.clientX - rect.left, y: event.clientY - rect.top });
  }, { signal });
  host.addEventListener('pointerleave', () => { if (!focusedView) setHover(null); }, { signal });
  // Claim the inline pending state only once setup succeeds. If this module
  // fails to load or initialize, the parser-time guard restores the directory.
  root.dataset.booted = 'true';
  root.dispatchEvent(new Event('island-booted'));
  void start();
  return () => { generation++; aborter.abort(); observer.disconnect(); visibility.disconnect(); releaseGraphics(); panels.dispose(); access.remove(); hint.dispose(); navigationLinks.forEach(link => link.classList.remove('is-scene-linked')); };
}

let unmount = mountIsland();
window.addEventListener('pagehide', () => { unmount(); });
window.addEventListener('pageshow', event => { if (event.persisted) unmount = mountIsland(); });
