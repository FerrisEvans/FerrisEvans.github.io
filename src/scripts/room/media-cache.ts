type MediaFile={url:string;bytes:number;sha256?:string;stream?:boolean;chunkSize?:number;chunks?:string[]};

/** Wait for this exact media worker before the native player issues its first
 * Range request. Registration/storage restrictions retain normal HTTP playback.
 */
export function prepareMediaCache(files:MediaFile[],signal?:AbortSignal,timeoutMs=8000):Promise<boolean>{
  const films=files.filter(file=>file.stream),hash=/^[a-f0-9]{64}$/;
  if(!films.length||films.some(file=>!hash.test(file.sha256??'')||!Number.isSafeInteger(file.bytes)||file.bytes<=0
    ||!Number.isSafeInteger(file.chunkSize)||(file.chunkSize??0)<=0||!Array.isArray(file.chunks)
    ||file.chunks.length!==Math.ceil(file.bytes/file.chunkSize!)||!file.chunks.every(value=>hash.test(value)))
    ||signal?.aborted||!('serviceWorker' in navigator))return Promise.resolve(false);
  return new Promise(resolve=>{
    const workers=navigator.serviceWorker;
    let finished=false,port:MessagePort|undefined;
    const removers:(()=>void)[]=[];
    const finish=(ready:boolean)=>{
      if(finished)return;finished=true;window.clearTimeout(timer);port?.close();
      workers.removeEventListener('controllerchange',check);signal?.removeEventListener('abort',abort);
      for(const remove of removers)remove();resolve(ready);
    };
    const check=()=>{
      if(finished)return;
      port?.close();port=undefined;
      const controller=workers.controller;
      if(!controller||new URL(controller.scriptURL).pathname!=='/sw.min.js')return;
      const channel=new MessageChannel();port=channel.port1;
      port.onmessage=event=>{
        const result=event.data;
        if(workers.controller===controller&&result?.type==='praxis-media-ready'&&result.version===1&&result.supported===true)finish(true);
      };
      try{controller.postMessage({type:'praxis-media-configure',files:films.map(({url,bytes,sha256,chunkSize,chunks})=>({url,bytes,sha256,chunkSize,chunks}))},[channel.port2]);}
      catch{channel.port1.close();channel.port2.close();}
    };
    const abort=()=>finish(false);
    const timer=window.setTimeout(()=>finish(false),timeoutMs);
    workers.addEventListener('controllerchange',check);signal?.addEventListener('abort',abort,{once:true});
    void Promise.resolve().then(()=>workers.register('/sw.min.js',{scope:'/',updateViaCache:'none'})).then(registration=>{
      if(finished)return;
      const watch=()=>{
        const worker=registration.installing??registration.waiting;
        if(worker){worker.addEventListener('statechange',check);removers.push(()=>worker.removeEventListener('statechange',check));}
        check();
      };
      registration.addEventListener('updatefound',watch);
      removers.push(()=>registration.removeEventListener('updatefound',watch));watch();
    }).catch(()=>finish(false));
    check();
  });
}
