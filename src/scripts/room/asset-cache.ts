export type HashedAsset = {url:string;bytes:number;sha256?:string;stream?:boolean};

const cacheName='praxis-room-assets-v1';
const hashed=(file:HashedAsset)=>!file.stream&&/^[a-f0-9]{64}$/.test(file.sha256??'');

export function assetUrl(url:string,version?:string){
  if(!version)return url;
  const parsed=new URL(url,'https://room.invalid');parsed.searchParams.set('v',version);
  return parsed.origin==='https://room.invalid'?parsed.pathname+parsed.search+parsed.hash:parsed.href;
}

export async function matchesAsset(file:HashedAsset,buffer:ArrayBuffer){
  if(!hashed(file))return true;
  if(buffer.byteLength!==file.bytes)return false;
  const digest=await crypto.subtle.digest('SHA-256',buffer);
  return Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('')===file.sha256;
}

/** Window-owned binary cache. Never intercept navigation or install a worker. */
export class RoomAssetCache {
  private opening?:Promise<Cache|undefined>;
  private writable=true;
  constructor(private files:HashedAsset[]){}

  private open(){
    if(!this.opening)this.opening=(async()=>{
      try{return await globalThis.caches?.open(cacheName);}catch{return undefined;}
    })();
    return this.opening;
  }
  private key(file:HashedAsset){return new URL(assetUrl(file.url,file.sha256),location.href).href;}

  async read(file:HashedAsset):Promise<ArrayBuffer|undefined>{
    if(!hashed(file))return;
    try{
      const cache=await this.open(),key=this.key(file),response=await cache?.match(key);
      if(!response)return;
      const buffer=await response.arrayBuffer();
      if(response.status===200&&await matchesAsset(file,buffer))return buffer;
      await cache?.delete(key);
    }catch{/* Private mode, eviction or unreadable data falls back to HTTP. */}
  }

  async write(file:HashedAsset,buffer:ArrayBuffer){
    if(!hashed(file)||!this.writable)return;
    try{
      const cache=await this.open();
      await cache?.put(this.key(file),new Response(buffer,{headers:{
        'Content-Type':'application/octet-stream','Content-Length':String(buffer.byteLength),
      }}));
    }catch{
      // Quota/storage failures must never prevent a downloaded room from opening.
      this.writable=false;
    }
  }

  async prune(){
    const current=this.files.filter(hashed);if(!current.length)return;
    try{
      const cache=await this.open();if(!cache)return;
      const keys=await cache.keys(),keep=new Set(current.map(file=>this.key(file)));
      const ownedPaths=new Set(current.map(file=>{const url=new URL(this.key(file));return url.origin+url.pathname;}));
      const byPath=new Map<string,Request[]>();
      for(const key of keys){
        const url=new URL(key.url),path=url.origin+url.pathname;
        // An older open tab cannot identify paths introduced by a new release
        // as obsolete. Only prune revisions of paths this manifest owns.
        if(!ownedPaths.has(path))keep.add(key.url);
        const group=byPath.get(path)??[];group.push(key);byPath.set(path,group);
      }
      for(const file of current){
        const url=new URL(this.key(file));
        // Retain one previous revision so overlapping old/new tabs don't evict
        // one another. A font-only update cannot evict model or texture entries.
        const previous=byPath.get(url.origin+url.pathname)?.reverse().find(key=>key.url!==url.href);
        if(previous)keep.add(previous.url);
      }
      await Promise.all(keys.filter(key=>!keep.has(key.url)).map(key=>cache.delete(key)));
    }catch{/* Best-effort cleanup only touches this dedicated asset cache. */}
  }
}
