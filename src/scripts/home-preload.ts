import { RoomAssets, type AssetFile } from './room/assets';
import { prepareMediaCache } from './room/media-cache';

type PreloadFile = AssetFile & { chunkSize?: number; chunks?: string[] };

/** Download into the room's existing content-addressed cache. The separate room
 * document owns WebGL decoding and can continue loading after an early visit. */
export function preloadHomeRoom() {
  const root = document.querySelector<HTMLElement>('#home-preload');
  const manifest = document.querySelector<HTMLScriptElement>('#room-assets');
  if (!root || !manifest) return;
  const status = root.querySelector<HTMLElement>('#home-preload-status')!;
  const progress = root.querySelector<HTMLProgressElement>('#home-preload-progress')!;
  const retry = root.querySelector<HTMLButtonElement>('#home-preload-retry')!;
  const files: PreloadFile[] = JSON.parse(manifest.textContent!);
  let assets: RoomAssets | undefined;
  let aborter: AbortController | undefined;
  let completed = false;

  async function start() {
    assets?.dispose();
    aborter?.abort();
    const current = new AbortController();
    aborter = current;
    const { signal } = current;
    root!.dataset.state = 'loading';
    status.setAttribute('aria-live', 'off');
    status.textContent = '书房资源预加载 0%';
    progress.value = 0;
    retry.hidden = true;
    const resources = new RoomAssets(files, (loaded, total, stats) => {
      if (signal.aborted) return;
      const percent = total ? Math.min(99, Math.floor(loaded / total * 100)) : 0;
      Object.assign(root!.dataset, { loadedBytes: String(loaded), totalBytes: String(total),
        cacheBytes: String(stats.cacheBytes), cacheHits: String(stats.cacheHits),
        httpBytes: String(stats.httpBytes), httpRequests: String(stats.httpRequests) });
      progress.value = percent;
      status.textContent = `书房资源预加载 ${percent}% · ${(loaded / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB`;
    }, { version: root!.dataset.assetVersion });
    assets = resources;

    // Warm only the opening video block. The worker reuses verified ranges on
    // /room/; the remaining film stays streamed rather than inflating this gate.
    const media = prepareMediaCache(files, signal).then(async supported => {
      if (!supported || signal.aborted) return;
      const film = files.find(file => file.stream && file.chunkSize);
      if (!film) return;
      const response = await fetch(resources.mediaUrl(film.url), {
        headers: { Range: `bytes=0-${Math.min(film.bytes, film.chunkSize!) - 1}` }, signal,
      });
      if (!response.ok) throw new Error(`Film preload HTTP ${response.status}`);
      await response.arrayBuffer();
    }).catch(() => { /* Native video loading remains available in the room. */ });

    try {
      await resources.preload();
      if (signal.aborted) return;
      completed = true;
      root!.dataset.state = 'ready';
      progress.value = 100;
      status.setAttribute('aria-live', 'polite');
      status.textContent = '书房资源已预加载 · 随时进入';
      resources.release();
    } catch {
      if (signal.aborted) return;
      resources.dispose();
      root!.dataset.state = 'error';
      status.setAttribute('aria-live', 'polite');
      status.textContent = '预加载暂未完成 · 仍可进入书房继续加载';
      retry.hidden = false;
    }
    // This task has its own rejection handler and never blocks either exit.
    void media;
  }

  retry.addEventListener('click', () => void start());
  window.addEventListener('pagehide', () => {
    aborter?.abort();
    assets?.dispose();
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted && !completed) void start();
  });
  void start();
}
