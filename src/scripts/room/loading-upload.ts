import { yieldForLoading } from './loading';

/** Keep GPU submissions ordered, but share a short loading slice when uploads
 * are cheap. A large upload still yields before the next one can start. */
export function createLoadingUploadQueue(options:{signal?:AbortSignal;budgetMs?:number;now?:()=>number;yield?:(signal?:AbortSignal)=>Promise<void>}={}) {
  const {signal}=options,now=options.now??(()=>performance.now()),yieldTask=options.yield??yieldForLoading;
  const budget=options.budgetMs??8;
  let queue=Promise.resolve(),sliceStart=-Infinity;
  const checkAbort=()=>{if(signal?.aborted)throw new DOMException('Aborted','AbortError');};
  return (upload:()=>void):Promise<void>=>{
    const pending=queue.then(async()=>{
      checkAbort();
      if(now()-sliceStart>=budget){
        await yieldTask(signal);
        checkAbort();sliceStart=now();
      }
      checkAbort();upload();
    });
    // An individual failure remains visible to its caller without poisoning
    // later requests. Cancellation is checked independently for every upload.
    queue=pending.catch(()=>{});
    return pending;
  };
}
