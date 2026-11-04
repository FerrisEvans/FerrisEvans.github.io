import type { RoomLoadTimings } from './load-timings';
import { assetUrl, matchesAsset, RoomAssetCache } from './asset-cache';

export type AssetFile = { url: string; bytes: number; sha256?:string; stream?: boolean; priority?:'high' };
export type AssetCacheStats={cacheBytes:number;cacheHits:number;httpBytes:number;httpRequests:number};

/** Counts resource reads separately from persistent cache hits and HTTP reads. */
export class RoomAssets {
  private pending = new Map<string, Promise<ArrayBuffer>>();
  private aborter = new AbortController();
  private received = 0;
  private active = 0;
  private networkActivityAt = 0;
  private idleTimer?: number;
  private disposed=false;
  private deferred?: RoomAssets;
  private readonly version?: string;
  private readonly cache:RoomAssetCache;
  private stats:AssetCacheStats={cacheBytes:0,cacheHits:0,httpBytes:0,httpRequests:0};
  readonly total: number;
  readonly timing?: RoomLoadTimings;

  constructor(readonly files: AssetFile[], private progress: (loaded: number, total: number, stats:AssetCacheStats) => void, options: {deferred?:AssetFile[];timing?:RoomLoadTimings;version?:string} = {}) {
    this.timing = options.timing;
    this.version = options.version;
    this.cache=new RoomAssetCache([...files,...options.deferred??[]]);
    this.total = files.reduce((sum, file) => sum + (file.stream ? 0 : file.bytes), 0);
    if(options.deferred?.length)this.deferred=new RoomAssets(options.deferred,()=>{},{timing:this.timing,version:this.version});
  }

  read(url: string, priority:'auto'|'high'|'low'='auto'): Promise<ArrayBuffer> {
    if(this.disposed)return Promise.reject(new DOMException('Aborted','AbortError'));
    if(this.deferred?.files.some(file=>file.url===url))return this.deferred.read(url,priority);
    if(this.aborter.signal.aborted&&this.active===0)this.aborter=new AbortController();
    const cached = this.pending.get(url);
    if (cached) return cached;
    const file = this.files.find((file) => file.url === url);
    if (!file) throw new Error(`Unlisted room asset: ${url}`);
    if (file.stream) throw new Error(`Streamed media must use mediaUrl(): ${url}`);
    const request = this.fetchFile(file,priority).catch(error=>{this.pending.delete(url);throw error;});
    this.pending.set(url, request);
    return request;
  }

  private activity() {
    this.networkActivityAt = performance.now();
    window.clearTimeout(this.idleTimer);
    // HTTP connection queues can legitimately wait behind large textures.
    // Only a complete lack of progress across the bundle is a stalled download.
    this.idleTimer = window.setTimeout(() => this.aborter.abort('Resource stalled'), 60000);
  }

  private async fetchFile(file:AssetFile,priority:'auto'|'high'|'low') {
    const {url}=file;
    const endFetch = this.timing?.start('asset.fetch', {url,priority});
    this.active++;
    this.activity();
    try {
      const local=file.sha256?await this.cache.read(file):undefined;
      if(this.disposed||this.aborter.signal.aborted)throw new DOMException('Aborted','AbortError');
      if(local){
        this.received+=local.byteLength;this.stats.cacheBytes+=local.byteLength;this.stats.cacheHits++;
        this.activity();this.progress(this.received,this.total,{...this.stats});
        this.timing?.mark('asset.cache-hit',{url,bytes:local.byteLength});
        endFetch?.('ok',{source:'persistent-cache',bytes:local.byteLength});return local;
      }
      // Content-addressed files are immutable, even after HTTP freshness ends.
      // Unversioned legacy/capture callers still revalidate their stable URLs.
      const requestUrl=assetUrl(url,file.sha256??this.version);
      for(let attempt=0;;attempt++){
        this.stats.httpRequests++;
        const response = await fetch(requestUrl, { signal: this.aborter.signal, cache: attempt ? 'reload' : file.sha256 ? 'force-cache' : this.version ? 'default' : 'no-cache', priority });
        this.timing?.mark('asset.headers', {url, status: response.status});
        if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
        if (!response.body) throw new Error(`Streaming response unavailable: ${url}`);
        this.activity();
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            if (!length) this.timing?.mark('asset.first-byte', {url});
            this.activity();
            chunks.push(chunk.value);
            length += chunk.value.length;
            this.received += chunk.value.length;
            this.stats.httpBytes+=chunk.value.length;
            this.progress(this.received, this.total,{...this.stats});
          }
        } finally { reader.releaseLock(); }
        this.timing?.mark('asset.body-complete', {url, bytes: length, chunks: chunks.length});
        const endAssemble = this.timing?.start('asset.assemble', {url, bytes: length});
        const buffer = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
        endAssemble?.();
        if(!await matchesAsset(file,buffer.buffer)){
          if(attempt===0){
            // A stale/corrupt HTTP response must not trap force-cache in a
            // permanent failure. Bypass that entry once; never store bad bytes.
            this.received-=length;continue;
          }
          throw new Error(`Room asset differs from its content hash: ${url}`);
        }
        if(this.disposed||this.aborter.signal.aborted)throw new DOMException('Aborted','AbortError');
        await this.cache.write(file,buffer.buffer);
        if(this.disposed||this.aborter.signal.aborted)throw new DOMException('Aborted','AbortError');
        endFetch?.('ok', {source:'http',bytes: length, chunks: chunks.length});
        return buffer.buffer;
      }
    } catch (error) {
      endFetch?.(this.aborter.signal.aborted ? 'aborted' : 'error', {error: String(error)});
      throw error;
    } finally {
      this.active--;
      if (!this.active) window.clearTimeout(this.idleTimer);
    }
  }

  /** Keep native media requests out of the JS full-response buffer and byte gate. */
  mediaUrl(url: string, version?: string) {
    if (this.disposed) throw new DOMException('Aborted', 'AbortError');
    const file=this.files.find(file => file.url === url && file.stream);
    if (!file) throw new Error(`Unlisted streamed room asset: ${url}`);
    const parsed = new URL(url, 'https://room.invalid');
    if (!url.startsWith('/') || parsed.origin !== 'https://room.invalid') throw new Error(`Room media must be local: ${url}`);
    // The build hashes the delivered bytes. Prefer that identity over a film
    // manifest's older encoding receipt when the file is replaced in place.
    const revision=file.sha256??version;
    if (revision) parsed.searchParams.set('v', revision);
    return parsed.pathname + parsed.search + parsed.hash;
  }
  /** Trim owned revisions without reading or hashing any asset again. */
  prune() { return this.disposed ? Promise.resolve() : this.cache.prune(); }
  async preload() {
    // The model unlocks decoding, material setup and native media buffering.
    // Do not divide its connection bandwidth among every atlas at startup.
    const critical=this.files.filter(file=>!file.stream&&file.priority==='high');
    if(critical.length)await Promise.all(critical.map(file=>this.read(file.url,'high')));
    const files=this.files.filter(file=>!file.stream&&file.priority!=='high');let next=0;
    // Leave connection slots for the module graph and native video buffering.
    const result=await Promise.all(Array.from({length:Math.min(4,files.length)},async()=>{
      while(next<files.length)await this.read(files[next++].url);
    }));
    await this.prune();return result;
  }
  get cacheStats(){return {...this.stats};}
  get activeRequests(){return this.active;}
  get lastNetworkActivity(){return this.networkActivityAt;}
  get isDisposed(){return this.disposed;}
  release(url?:string) { if(url)this.pending.delete(url);else this.pending.clear();this.deferred?.release(url); }
  dispose() { this.disposed=true;window.clearTimeout(this.idleTimer); this.aborter.abort(); this.deferred?.dispose(); this.release(); }
}
