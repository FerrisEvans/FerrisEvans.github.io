// Production injects an empty MEDIA_CATALOG. Pages configure their films without
// changing this worker program; tests can also supply an initial catalog.
// This worker handles only configured, versioned films. It never handles pages.
const mediaCacheName = 'praxis-room-video-v1';
const mediaCatalogCacheName = 'praxis-room-video-catalog-v1';
const mediaInflight = new Map();
const mediaWholeBodies = new Map();
const mediaReaders = new Map();
const mediaOrigin = self.location.origin;
const mediaHash = /^[a-f0-9]{64}$/;
const mediaCatalog = new Map();

function mediaAddress(file) {
  if (!file || typeof file.url !== 'string' || !file.url.startsWith('/room/film/') || !file.url.endsWith('.mp4') ||
      /[?#\\]/.test(file.url) || /%2f|%5c/i.test(file.url) || typeof file.sha256 !== 'string' || !mediaHash.test(file.sha256)) return;
  const parsed = new URL(file.url, mediaOrigin);
  if (parsed.origin !== mediaOrigin || parsed.pathname !== file.url) return;
  return mediaURL(file);
}

function mediaMetadata(file) {
  if (!mediaAddress(file) || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 ||
      !Number.isSafeInteger(file.chunkSize) || file.chunkSize <= 0 || !Array.isArray(file.chunks) ||
      file.chunks.length !== Math.ceil(file.bytes / file.chunkSize) ||
      !Array.from(file.chunks).every(hash => typeof hash === 'string' && mediaHash.test(hash))) return;
  return {url: file.url, bytes: file.bytes, sha256: file.sha256, chunkSize: file.chunkSize, chunks: [...file.chunks]};
}

for (const entry of MEDIA_CATALOG) {
  const file = mediaMetadata(entry);
  if (file) mediaCatalog.set(mediaURL(file), file);
}

function mediaURL(file) {
  const url = new URL(file.url, mediaOrigin);
  url.searchParams.set('v', file.sha256);
  return url.href;
}

function mediaCatalogKey(url) {
  const key = new URL(url);
  key.searchParams.set('__catalog', '1');
  return key.href;
}

function mediaMatch(request) {
  if (!['GET', 'HEAD'].includes(request.method) || request.mode === 'navigate' || request.destination === 'document') return;
  const url = new URL(request.url);
  if (url.origin !== mediaOrigin || [...url.searchParams].length !== 1 || !url.searchParams.has('v')) return;
  return mediaAddress({url: url.pathname, sha256: url.searchParams.get('v')});
}

async function mediaFile(url) {
  if (mediaCatalog.has(url)) return mediaCatalog.get(url);
  try {
    const cache = await caches.open(mediaCatalogCacheName);
    const key = mediaCatalogKey(url);
    const response = await cache.match(key);
    if (!response) return;
    const file = response.status === 200 && mediaMetadata(await response.json());
    if (file && mediaURL(file) === url) { mediaCatalog.set(url, file); return file; }
    await cache.delete(key);
  } catch { /* Unavailable/malformed catalog entries use native HTTP. */ }
}

async function mediaConfigure(files) {
  if (!Array.isArray(files) || !files.length) return false;
  const valid = Array.from(files, mediaMetadata);
  if (valid.some(file => !file)) return false;
  for (const file of valid) mediaCatalog.set(mediaURL(file), file);
  try {
    const cache = await caches.open(mediaCatalogCacheName);
    await Promise.all(valid.map(file => cache.put(mediaCatalogKey(mediaURL(file)), new Response(JSON.stringify(file), {
      status: 200, headers: {'Content-Type': 'application/json'},
    }))));
  } catch { /* A valid current page can still play when catalog storage fails. */ }
  return true;
}

// Undefined means an unsupported/invalid range, which stays on native HTTP.
// Null means a syntactically valid but unsatisfiable byte range.
function mediaRange(value, size) {
  if (!value) return {start: 0, end: size - 1, status: 200};
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return;
  const first = match[1] ? Number(match[1]) : undefined;
  const last = match[2] ? Number(match[2]) : undefined;
  if ((first !== undefined && !Number.isSafeInteger(first)) || (last !== undefined && !Number.isSafeInteger(last))) return null;
  if (first === undefined) return last > 0 ? {start: Math.max(0, size - last), end: size - 1, status: 206} : null;
  if (first >= size || (last !== undefined && last < first)) return null;
  return {start: first, end: Math.min(size - 1, last ?? size - 1), status: 206};
}

async function mediaDigest(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

async function mediaCache() {
  try { return await caches.open(mediaCacheName); } catch { return undefined; }
}

async function mediaChunk(file, index) {
  const url = mediaURL(file), key = new URL(url);
  key.searchParams.set('chunk', String(index));
  const cacheKey = key.href;
  if (mediaInflight.has(cacheKey)) return mediaInflight.get(cacheKey);
  const task = (async () => {
    const start = index * file.chunkSize, end = Math.min(file.bytes, start + file.chunkSize) - 1;
    const valid = async bytes => bytes.byteLength === end - start + 1 && await mediaDigest(bytes) === file.chunks[index];
    const cache = await mediaCache();
    try {
      const response = await cache?.match(cacheKey);
      if (response) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (response.status === 200 && await valid(bytes)) return bytes;
        await cache?.delete(cacheKey);
      }
    } catch { /* Unreadable/evicted cache data must still permit HTTP playback. */ }

    let bytes;
    const whole = mediaWholeBodies.get(url);
    if (whole) bytes = whole.subarray(start, end + 1);
    else for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(url, {
        headers: {Range: `bytes=${start}-${end}`}, credentials: 'same-origin', redirect: 'error',
        cache: attempt ? 'reload' : 'force-cache',
      });
      if (response.status !== 206 && response.status !== 200) throw new Error(`Film chunk HTTP ${response.status}`);
      const expected = response.status === 206 ? end - start + 1 : file.bytes;
      const length = response.headers.get('Content-Length');
      const range = response.headers.get('Content-Range');
      const headersValid = (!length || Number(length) === expected) &&
        (response.status !== 206 || range === `bytes ${start}-${end}/${file.bytes}`);
      if (!headersValid) {
        await response.body?.cancel();
        if (!attempt) continue;
        throw new Error('Film chunk response range differs from its manifest');
      }
      const body = new Uint8Array(await response.arrayBuffer());
      const wholeValid = response.status === 200 && body.byteLength === file.bytes && await mediaDigest(body) === file.sha256;
      const candidate = response.status === 200 ? body.subarray(start, end + 1) : body;
      if ((response.status === 206 || wholeValid) && await valid(candidate)) {
        bytes = candidate;
        // Some servers ignore Range. Reuse that one verified full response
        // while its readers remain alive, instead of downloading it per chunk.
        if (wholeValid) mediaWholeBodies.set(url, body);
        break;
      }
      if (attempt) throw new Error('Film chunk differs from its content hash');
    }
    if (!bytes || !await valid(bytes)) throw new Error('Film chunk differs from its content hash');
    try {
      // Cache.put rejects 206. Internal entries are complete individual chunks.
      await cache?.put(cacheKey, new Response(bytes, {status: 200, headers: {
        'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.byteLength),
      }}));
    } catch { /* Cache quota/permission errors cannot interrupt the video. */ }
    return bytes;
  })();
  mediaInflight.set(cacheKey, task);
  try { return await task; } finally { if (mediaInflight.get(cacheKey) === task) mediaInflight.delete(cacheKey); }
}

function mediaResponse(event, file, range) {
  const headers = new Headers({
    'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', ETag: `"${file.sha256}"`, 'Cache-Control': 'no-store',
  });
  if (range === null) {
    headers.set('Content-Range', `bytes */${file.bytes}`);
    headers.set('Content-Length', '0');
    return new Response(null, {status: 416, headers});
  }
  headers.set('Content-Length', String(range.end - range.start + 1));
  if (range.status === 206) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${file.bytes}`);
  if (event.request.method === 'HEAD') return new Response(null, {status: range.status, headers});
  const url = mediaURL(file);
  mediaReaders.set(url, (mediaReaders.get(url) ?? 0) + 1);
  let offset = range.start, cancelled = false, finished = false, reading;
  const finish = () => {
    if (finished) return;
    finished = true;
    const readers = (mediaReaders.get(url) ?? 1) - 1;
    if (readers) mediaReaders.set(url, readers);
    else { mediaReaders.delete(url); mediaWholeBodies.delete(url); }
  };
  const body = new ReadableStream({
    async pull(controller) {
      if (cancelled) return;
      const index = Math.floor(offset / file.chunkSize);
      try {
        reading = mediaChunk(file, index);
        // Never extend this event until the video stream ends: a paused native
        // decoder may stop pulling without cancelling and block worker updates.
        // Protect only current work while this fetch event still permits it.
        // Later pulls use the active response stream; a terminated write remains
        // an ordinary cache miss because Cache.put commits complete chunks only.
        try { event.waitUntil(reading.catch(() => {})); } catch { /* Event already settled. */ }
        const bytes = await reading;
        reading = undefined;
        if (cancelled) { finish(); return; }
        const from = offset - index * file.chunkSize;
        const count = Math.min(bytes.byteLength - from, range.end - offset + 1);
        // respondWith transfers/detaches enqueued buffers. The chunk may also
        // belong to another range reader or to our shared full-200 fallback.
        controller.enqueue(bytes.slice(from, from + count));
        offset += count;
        if (offset > range.end) { controller.close(); finish(); }
      } catch (error) {
        reading = undefined;
        if (!cancelled) controller.error(error);
        finish();
      }
    },
    cancel() { cancelled = true; if (!reading) finish(); },
  }, {highWaterMark: 0});
  return new Response(body, {status: range.status, headers});
}

self.addEventListener('fetch', event => {
  const url = mediaMatch(event.request);
  if (!url) return;
  // Unsupported range syntax needs no catalog/cache work at all.
  const requested = event.request.headers.get('Range');
  if (event.request.method === 'GET' && mediaRange(requested, Number.MAX_SAFE_INTEGER) === undefined) return;
  event.respondWith((async () => {
    const file = await mediaFile(url);
    if (!file) return fetch(event.request);
    const ifRange = event.request.headers.get('If-Range');
    const header = event.request.method === 'HEAD' || (ifRange && ifRange !== `"${file.sha256}"`) ? null : requested;
    const range = mediaRange(header, file.bytes);
    if (range === undefined) return fetch(event.request);
    return mediaResponse(event, file, range);
  })());
});

self.addEventListener('message', event => {
  if (event.origin !== mediaOrigin || !['praxis-media-status', 'praxis-media-configure'].includes(event.data?.type) || !event.ports[0]) return;
  const files = event.data.files;
  event.waitUntil((async () => {
    const supported = event.data.type === 'praxis-media-configure' ? await mediaConfigure(files) :
      Array.isArray(files) && files.length > 0 && (await Promise.all(files.map(async file => {
        const url = mediaAddress(file); return Boolean(url && await mediaFile(url));
      }))).every(Boolean);
    event.ports[0].postMessage({type: 'praxis-media-ready', version: 1, supported});
  })());
});

self.addEventListener('install', event => { event.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const home = new URL('/', mediaOrigin).href;
      for (const name of await caches.keys()) {
        if (!/^chirpy-\d+$/.test(name)) continue;
        const cache = await caches.open(name);
        // Other projects on this github.io origin may have their own Chirpy.
        if (await cache.match(home)) await caches.delete(name);
      }
    } catch { /* Storage restrictions must not prevent activation/claim. */ }
    await self.clients.claim();
  })());
});
