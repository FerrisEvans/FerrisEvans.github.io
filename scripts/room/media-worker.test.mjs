import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash, webcrypto} from 'node:crypto';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../../src/scripts/room/media-worker.js', import.meta.url), 'utf8');
const origin = 'https://room.test';
const bytes = Buffer.from('abcdefghijklmnopqrstuvwxyz0123456789');
const sha = data => createHash('sha256').update(data).digest('hex');
const film = {url: '/room/film/test.mp4', bytes: bytes.length, sha256: sha(bytes), chunkSize: 8,
  chunks: Array.from({length: Math.ceil(bytes.length / 8)}, (_, index) => sha(bytes.subarray(index * 8, index * 8 + 8)))};
const filmURL = `${origin}${film.url}?v=${film.sha256}`;
const cacheName = 'praxis-room-video-v1';
const catalogCacheName = 'praxis-room-video-catalog-v1';
const filmCatalogKey = filmURL + '&__catalog=1';
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture(options = {}) {
  const listeners = new Map(), stores = options.stores ?? new Map(), requests = [], lifetime = [], calls = [];
  const storage = {
    async open(name) {
      if (options.openError) throw new Error('storage blocked');
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async match(key) { if (options.readError) throw new Error('cache read failed'); return entries.get(String(key))?.clone(); },
        async put(key, response) {
          if (options.writeError) throw new Error('quota exceeded');
          assert.equal(response.status, 200, 'internal chunks must normalize 206 to cacheable 200');
          const buffer = await response.arrayBuffer();
          entries.set(String(key), new Response(buffer, {status: response.status, headers: response.headers}));
        },
        async delete(key) { return entries.delete(String(key)); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const network = async (url, init) => {
    if (typeof url !== 'string') { init = {method: url.method, headers: Object.fromEntries(url.headers), native: true}; url = url.url; }
    requests.push({url, ...init});
    if (options.fetch) return options.fetch(url, init, requests.length);
    const [, from, to] = /^bytes=(\d+)-(\d+)$/.exec(init.headers.Range ?? init.headers.range);
    return new Response(bytes.subarray(Number(from), Number(to) + 1), {status: 206, headers: {
      'Content-Range': `bytes ${from}-${to}/${bytes.length}`, 'Content-Length': String(Number(to) - Number(from) + 1),
    }});
  };
  runInNewContext(`const MEDIA_CATALOG=${JSON.stringify(options.catalog ?? [film])};\n${source}`, {
    self: {location: {origin}, addEventListener: (type, callback) => listeners.set(type, callback),
      skipWaiting: async () => {calls.push('skipWaiting');}, clients: {claim: async () => {calls.push('claim');}}},
    URL, Headers, Response, ReadableStream, crypto: webcrypto, caches: storage, fetch: network,
  });
  return {
    stores, requests, calls,
    dispatch(type, fields = {}) {
      listeners.get(type)({...fields, waitUntil: promise => lifetime.push(promise)});
    },
    async message(type, files, sender = origin) {
      let result;
      listeners.get('message')({origin: sender, data: {type, files}, ports: [{postMessage: answer => {result = answer;}}],
        waitUntil: promise => lifetime.push(promise)});
      await Promise.all(lifetime);
      return result;
    },
    request(range, fields = {}) {
      let response;
      const headers = new Headers(fields.headers);
      if (range !== undefined) headers.set('Range', range);
      listeners.get('fetch')({request: {url: filmURL, method: 'GET', mode: 'cors', destination: 'video', ...fields, headers},
        respondWith: value => {response = Promise.resolve(value);}, waitUntil: promise => lifetime.push(promise)});
      return response;
    },
    async settled() { await Promise.all(lifetime); },
  };
}

test('film ranges stream canonical chunks and persist verified bytes across worker restarts', async () => {
  const first = fixture();
  const response = await first.request('bytes=2-18');
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('Content-Range'), `bytes 2-18/${bytes.length}`);
  assert.equal(response.headers.get('Content-Length'), '17');
  assert.equal(first.requests.length, 0, 'response creation must not buffer the movie');
  const reader = response.body.getReader();
  assert.deepEqual(Buffer.from((await reader.read()).value), bytes.subarray(2, 8));
  await flush();
  assert.equal(first.requests.length, 1, 'without another pull, the next chunk must not download');
  assert.deepEqual(Buffer.from((await reader.read()).value), bytes.subarray(8, 16));
  assert.deepEqual(Buffer.from((await reader.read()).value), bytes.subarray(16, 19));
  assert.equal((await reader.read()).done, true);
  await first.settled();
  assert.deepEqual(first.requests.map(request => request.headers.Range), ['bytes=0-7', 'bytes=8-15', 'bytes=16-23']);
  const second = fixture({stores: first.stores});
  assert.deepEqual(Buffer.from(await (await second.request('bytes=3-21')).arrayBuffer()), bytes.subarray(3, 22));
  assert.equal(second.requests.length, 0, 'restarted worker reads stored chunks without HTTP');
  await second.settled();
});

test('open, suffix, full and unsatisfiable ranges have correct HTTP semantics', async () => {
  for (const [range, start, end, status] of [
    ['bytes=30-', 30, 35, 206], ['bytes=-5', 31, 35, 206], ['bytes=-100', 0, 35, 206],
    ['bytes=2-999', 2, 35, 206], [undefined, 0, 35, 200],
  ]) {
    const worker = fixture(), response = await worker.request(range);
    assert.equal(response.status, status);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes.subarray(start, end + 1));
    await worker.settled();
  }
  for (const range of ['bytes=36-', 'bytes=-0', 'bytes=8-2', 'bytes=9007199254740992-']) {
    const worker = fixture(), response = await worker.request(range);
    assert.equal(response.status, 416);
    assert.equal(response.headers.get('Content-Range'), `bytes */${bytes.length}`);
    assert.equal(await response.text(), ''); assert.equal(worker.requests.length, 0);
  }
  const worker = fixture();
  const head = await worker.request('bytes=0-1', {method: 'HEAD'});
  assert.equal(head.status, 200); assert.equal(head.headers.get('Content-Length'), String(bytes.length));
  assert.equal(await head.text(), ''); assert.equal(worker.requests.length, 0);
  const changed = await worker.request('bytes=0-1', {headers: {'If-Range': '"old-etag"'}});
  assert.equal(changed.status, 200); assert.deepEqual(Buffer.from(await changed.arrayBuffer()), bytes);
});

test('HTML, scripts, invalid version URLs and multipart ranges stay outside the worker handler', () => {
  const worker = fixture();
  for (const fields of [
    {url: origin + '/'}, {url: origin + '/app.js'}, {url: filmURL.replace(film.sha256, 'invalid-hash')},
    {url: filmURL + '&extra=1'}, {url: filmURL + '&v=' + film.sha256}, {url: filmURL.replace(origin, 'https://other.test')},
    {method: 'POST'}, {mode: 'navigate'}, {destination: 'document'},
  ]) assert.equal(worker.request('bytes=0-1', fields), undefined);
  for (const range of ['bytes=0-1,4-6', 'items=0-1', 'bytes=-', 'invalid']) assert.equal(worker.request(range), undefined);
  assert.equal(worker.requests.length, 0);
});

test('cancelled streams stop after their current chunk; overlapping ranges share an in-flight chunk', async () => {
  const worker = fixture();
  const a = await worker.request('bytes=0-'), b = await worker.request('bytes=2-4');
  const ra = a.body.getReader(), rb = b.body.getReader();
  const [partA, partB] = await Promise.all([ra.read(), rb.read()]);
  assert.deepEqual(Buffer.from(partA.value), bytes.subarray(0, 8));
  assert.deepEqual(Buffer.from(partB.value), bytes.subarray(2, 5));
  assert.equal(worker.requests.length, 1);
  await ra.cancel(); await rb.cancel(); await worker.settled(); await flush();
  assert.equal(worker.requests.length, 1, 'cancellation must not fetch remaining chunks');

  let release;
  const paused = fixture({fetch: () => new Promise(resolve => {release = () => resolve(new Response(bytes.subarray(0, 8),
    {status: 206, headers: {'Content-Range': `bytes 0-7/${bytes.length}`}}));})});
  const reader = (await paused.request('bytes=0-')).body.getReader();
  const read = reader.read();
  while (!release) await flush();
  await reader.cancel(); release(); await read; await paused.settled();
  assert.equal(paused.requests.length, 1);
  assert.equal(paused.stores.get(cacheName).size, 1, 'an already-started complete chunk may finish caching');
});

test('a paused consumer cannot keep its fetch event alive and prevent a new worker activating', async () => {
  const worker = fixture();
  const reader = (await worker.request('bytes=0-')).body.getReader();
  await reader.read();
  let settled = false;
  const completion = worker.settled().then(() => { settled = true; });
  await flush();
  assert.equal(settled, true, 'lifetime promises must cover actual chunk work, not a suspended media stream');
  assert.equal(worker.requests.length, 1);
  await reader.cancel(); await completion;
});

test('cache corruption and storage failures recover through HTTP without caching unsafe bytes', async () => {
  const initial = fixture();
  await (await initial.request('bytes=0-15')).arrayBuffer(); await initial.settled();
  initial.stores.get(cacheName).set(`${filmURL}&chunk=1`, new Response(Buffer.alloc(8, 120)));
  const recovered = fixture({stores: initial.stores});
  assert.deepEqual(Buffer.from(await (await recovered.request('bytes=0-15')).arrayBuffer()), bytes.subarray(0, 16));
  assert.deepEqual(recovered.requests.map(request => request.headers.Range), ['bytes=8-15']);
  for (const failure of ['openError', 'readError', 'writeError']) {
    const worker = fixture({[failure]: true});
    assert.deepEqual(Buffer.from(await (await worker.request('bytes=0-15')).arrayBuffer()), bytes.subarray(0, 16));
    assert.equal(worker.requests.length, 2); await worker.settled();
  }
});

test('bad HTTP content retries once with reload, then either heals or rejects without cache pollution', async () => {
  for (const heal of [true, false]) {
    const worker = fixture({fetch: (_url, _init, attempt) => new Response(heal && attempt === 2 ? bytes.subarray(0, 8) : Buffer.alloc(8, 120),
      {status: 206, headers: {'Content-Range': `bytes 0-7/${bytes.length}`, 'Content-Length': '8'}})});
    const response = await worker.request('bytes=0-7');
    if (heal) assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes.subarray(0, 8));
    else await assert.rejects(response.arrayBuffer(), /content hash/);
    assert.deepEqual(worker.requests.map(request => request.cache), ['force-cache', 'reload']);
    assert.equal(worker.stores.get(cacheName).size, heal ? 1 : 0); await worker.settled();
  }
  for (const contentRange of ['bytes 8-15/36', 'bytes 0-7/100']) {
    const worker = fixture({fetch: () => new Response(bytes.subarray(0, 8), {status: 206, headers: {'Content-Range': contentRange}})});
    await assert.rejects((await worker.request('bytes=0-7')).arrayBuffer(), /response range/);
    assert.equal(worker.requests.length, 2); assert.equal(worker.stores.get(cacheName).size, 0); await worker.settled();
  }
});

test('a server ignoring Range is sliced at absolute offsets and its full response is reused', async () => {
  const worker = fixture({fetch: () => new Response(bytes, {status: 200, headers: {'Content-Length': String(bytes.length)}})});
  assert.deepEqual(Buffer.from(await (await worker.request('bytes=10-29')).arrayBuffer()), bytes.subarray(10, 30));
  assert.equal(worker.requests.length, 1, 'one 200 response must not be downloaded once for every requested chunk');
  await worker.settled();
  const wrong = fixture({fetch: () => new Response(Buffer.alloc(bytes.length, 120), {status: 200})});
  await assert.rejects((await wrong.request('bytes=10-15')).arrayBuffer(), /content hash/);
  assert.equal(wrong.requests.length, 2); assert.equal(wrong.stores.get(cacheName).size, 0); await wrong.settled();
});

test('response buffer transfer cannot detach shared in-flight or full-response bytes', async () => {
  const transfer = chunk => structuredClone(chunk, {transfer: [chunk.buffer]});
  const concurrent = fixture();
  const a = (await concurrent.request('bytes=0-7')).body.getReader();
  const b = (await concurrent.request('bytes=2-4')).body.getReader();
  const [chunkA, chunkB] = await Promise.all([a.read(), b.read()]);
  assert.deepEqual(Buffer.from(transfer(chunkA.value)), bytes.subarray(0, 8));
  assert.deepEqual(Buffer.from(transfer(chunkB.value)), bytes.subarray(2, 5), 'one response must not detach a concurrent range');
  assert.equal(concurrent.requests.length, 1); await concurrent.settled();

  const full = fixture({fetch: () => new Response(bytes, {status: 200})});
  const reader = (await full.request('bytes=10-29')).body.getReader();
  const received = [];
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    received.push(Buffer.from(transfer(chunk.value)));
  }
  assert.deepEqual(Buffer.concat(received), bytes.subarray(10, 30), 'each emitted buffer must be independent of the full-response fallback');
  assert.equal(full.requests.length, 1); await full.settled();
});

test('handshake confirms exact catalog versions; activation only clears the old root Chirpy cache', async () => {
  const worker = fixture();
  const reply = files => worker.message('praxis-media-status', files);
  assert.equal((await reply([{url: film.url, sha256: film.sha256}])).supported, true);
  assert.equal((await reply([{url: film.url, sha256: 'f'.repeat(64)}])).supported, false);
  assert.equal((await reply([])).supported, false);
  let foreignReply = false;
  worker.dispatch('message', {origin: 'https://other.test', data: {type: 'praxis-media-status', files: [film]}, ports: [{postMessage: () => {foreignReply = true;}}]});
  assert.equal(foreignReply, false);
  worker.stores.set('chirpy-123', new Map([[origin + '/', new Response('old homepage')]]));
  worker.stores.set('chirpy-456', new Map([[origin + '/other/', new Response('other project')]]));
  worker.stores.set('unrelated', new Map());
  worker.stores.set(cacheName, new Map());
  worker.dispatch('install'); worker.dispatch('activate'); await worker.settled();
  assert.deepEqual(worker.calls, ['skipWaiting', 'claim']);
  assert.deepEqual([...worker.stores.keys()], [catalogCacheName, 'chirpy-456', 'unrelated', cacheName]);
});

test('page configuration persists validated catalogs across restarts without changing existing film keys', async () => {
  const first = fixture({catalog: []});
  assert.equal((await first.message('praxis-media-configure', [film])).supported, true);
  assert.deepEqual(await first.stores.get(catalogCacheName).get(filmCatalogKey).clone().json(), film);
  assert(!first.stores.get(catalogCacheName).has(filmURL), 'cross-cache matches for a native video URL cannot return catalog JSON');
  await (await first.request('bytes=0-15')).arrayBuffer(); await first.settled();
  const originalKeys = [...first.stores.get(cacheName).keys()];
  const secondFilm = {...film, url: '/room/film/new-film.mp4'};
  assert.equal((await first.message('praxis-media-configure', [secondFilm])).supported, true);
  const newVersion = {...film, sha256: 'a'.repeat(64)};
  assert.equal((await first.message('praxis-media-configure', [newVersion])).supported, true);
  assert.deepEqual([...first.stores.get(cacheName).keys()], originalKeys, 'adding films or versions must not touch existing chunks');
  assert.equal(first.stores.get(catalogCacheName).size, 3, 'same-path versions and new paths coexist');

  const restarted = fixture({catalog: [], stores: first.stores});
  assert.equal((await restarted.message('praxis-media-status', [film, secondFilm, newVersion])).supported, true);
  assert.deepEqual(Buffer.from(await (await restarted.request('bytes=0-15')).arrayBuffer()), bytes.subarray(0, 16));
  assert.equal(restarted.requests.length, 0, 'restarted empty worker restores the persisted old-film metadata and bytes');
  await restarted.settled();
});

test('configuration is all-or-nothing, rejects malformed metadata and accepts only same-origin messages', async () => {
  for (const invalid of [null, {...film, url: '/posts/film.mp4'}, {...film, url: '/room/film/../elsewhere.mp4'},
    {...film, url: '/room/film/%2e%2e/elsewhere.mp4'}, {...film, url: '/room/film/test.mp4?other=1'},
    {...film, bytes: -1}, {...film, bytes: Number.MAX_SAFE_INTEGER + 1}, {...film, chunkSize: 0},
    {...film, sha256: 'wrong'}, {...film, chunks: [film.chunks[0]]}, {...film, chunks: Array(5)}]) {
    const worker = fixture({catalog: []});
    assert.equal((await worker.message('praxis-media-configure', [film, invalid])).supported, false);
    assert.equal(worker.stores.size, 0, 'no valid prefix may be persisted from a rejected batch');
    assert.equal((await worker.message('praxis-media-status', [film])).supported, false, 'rejected batches cannot partially register in memory');
  }
  const worker = fixture({catalog: []});
  assert.equal(await worker.message('praxis-media-configure', [film], 'https://other.test'), undefined);
  assert.equal(worker.stores.size, 0);
});

test('catalog storage failures preserve current-page configuration while unknown/corrupt metadata uses native HTTP', async () => {
  for (const failure of ['openError', 'writeError']) {
    const worker = fixture({catalog: [], [failure]: true});
    assert.equal((await worker.message('praxis-media-configure', [film])).supported, true);
    assert.deepEqual(Buffer.from(await (await worker.request('bytes=0-7')).arrayBuffer()), bytes.subarray(0, 8));
    assert.equal(worker.requests[0].native, undefined, 'valid in-memory metadata still enables bounded verified ranges');
  }
  const native = async (url, init) => {
    assert.equal(url, filmURL); assert.equal(init.native, true);
    assert.equal(init.headers.range, 'bytes=2-5');
    return new Response('native bytes', {status: 206});
  };
  for (const value of ['not json', JSON.stringify({...film, sha256: 'f'.repeat(64)}), JSON.stringify({...film, chunks: []})]) {
    const stores = new Map([[catalogCacheName, new Map([[filmCatalogKey, new Response(value)]])]]);
    const worker = fixture({catalog: [], stores, fetch: native});
    assert.equal(await (await worker.request('bytes=2-5')).text(), 'native bytes');
    assert(!stores.has(cacheName), 'unknown metadata cannot cause film chunk caching');
  }
  const unknown = fixture({catalog: [], fetch: native});
  assert.equal(await (await unknown.request('bytes=2-5')).text(), 'native bytes');
  assert(!unknown.stores.has(cacheName));
});
