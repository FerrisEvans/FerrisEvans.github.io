import { assetUrl, matchesAsset, RoomAssetCache } from './asset-cache';

type AssetFile = { url: string; bytes: number; sha256?:string };
type AssetCacheStats={cacheBytes:number;cacheHits:number;httpBytes:number;httpRequests:number};

/** Counts resource reads separately from persistent cache hits and HTTP reads. */
export class RoomAssets {
  private pending = new Map<string, Promise<ArrayBuffer>>();
  private aborter = new AbortController();
  private received = 0;
  private active = 0;
  private idleTimer?: number;
  private disposed=false;
  private readonly cache:RoomAssetCache;
  private stats:AssetCacheStats={cacheBytes:0,cacheHits:0,httpBytes:0,httpRequests:0};
  private readonly total: number;

  constructor(private files: AssetFile[], private progress: (loaded: number, total: number, stats:AssetCacheStats) => void) {
    this.cache=new RoomAssetCache(files);
    this.total = files.reduce((sum, file) => sum + file.bytes, 0);
  }

  read(url: string, priority:'auto'|'high'|'low'='auto'): Promise<ArrayBuffer> {
    if(this.disposed)return Promise.reject(new DOMException('Aborted','AbortError'));
    if(this.aborter.signal.aborted&&this.active===0)this.aborter=new AbortController();
    const cached = this.pending.get(url);
    if (cached) return cached;
    const file = this.files.find((file) => file.url === url);
    if (!file) throw new Error(`Unlisted room asset: ${url}`);
    const request = this.fetchFile(file,priority).catch(error=>{this.pending.delete(url);throw error;});
    this.pending.set(url, request);
    return request;
  }

  private activity() {
    window.clearTimeout(this.idleTimer);
    // HTTP connection queues can legitimately wait behind large textures.
    // Only a complete lack of progress across the bundle is a stalled download.
    this.idleTimer = window.setTimeout(() => this.aborter.abort('Resource stalled'), 60000);
  }

  private async fetchFile(file:AssetFile,priority:'auto'|'high'|'low') {
    const {url}=file;
    this.active++;
    this.activity();
    try {
      const local=file.sha256?await this.cache.read(file):undefined;
      if(this.disposed||this.aborter.signal.aborted)throw new DOMException('Aborted','AbortError');
      if(local){
        this.received+=local.byteLength;this.stats.cacheBytes+=local.byteLength;this.stats.cacheHits++;
        this.activity();this.progress(this.received,this.total,{...this.stats});
        return local;
      }
      // Content-addressed files are immutable, even after HTTP freshness ends.
      // A file without a content hash still revalidates its stable URL.
      const requestUrl=assetUrl(url,file.sha256);
      for(let attempt=0;;attempt++){
        this.stats.httpRequests++;
        const response = await fetch(requestUrl, { signal: this.aborter.signal, cache: attempt ? 'reload' : file.sha256 ? 'force-cache' : 'no-cache', priority });
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
            this.activity();
            chunks.push(chunk.value);
            length += chunk.value.length;
            this.received += chunk.value.length;
            this.stats.httpBytes+=chunk.value.length;
            this.progress(this.received, this.total,{...this.stats});
          }
        } finally { reader.releaseLock(); }
        const buffer = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
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
        return buffer.buffer;
      }
    } finally {
      this.active--;
      if (!this.active) window.clearTimeout(this.idleTimer);
    }
  }

  /** Trim owned revisions without reading or hashing any asset again. */
  prune() { return this.disposed ? Promise.resolve() : this.cache.prune(); }
  release() { this.pending.clear(); }
  dispose() { this.disposed=true;window.clearTimeout(this.idleTimer); this.aborter.abort(); this.release(); }
}
