export type LoadingStage = 'download' | 'model' | 'textures' | 'reflection' | 'shaders' | 'frame';
export type LoadingUpdate = { stage: LoadingStage; completed: number; total: number; detail?: string };
export type LoadingReporter = (update: LoadingUpdate) => void;
const weights: Record<LoadingStage, number> = { download: 65, model: 8, textures: 12, reflection: 5, shaders: 8, frame: 2 };

/** Each contribution advances only after measured bytes or a completed task. */
export function createLoadingProgress() {
  const fractions: Record<LoadingStage, number> = { download: 0, model: 0, textures: 0, reflection: 0, shaders: 0, frame: 0 };
  return {
    report({stage, completed, total}: LoadingUpdate) {
      if (Number.isFinite(completed) && Number.isFinite(total) && total > 0) {
        fractions[stage] = Math.max(fractions[stage], Math.max(0, Math.min(1, completed / total)));
      }
      return Math.floor(Object.entries(weights).reduce((sum,[key,weight])=>sum+weight*fractions[key as LoadingStage],0));
    },
  };
}

/** Let the OSD paint, without making asset preparation depend on rAF cadence.
 * Embedded/background surfaces can throttle rAF to 1 Hz or stop it entirely. */
export function yieldForLoading(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new DOMException('Aborted','AbortError'));return;}
    let timer:ReturnType<typeof setTimeout>,deadline:ReturnType<typeof setTimeout>,frame=0,settled=false;
    const cleanup=()=>{cancelAnimationFrame(frame);clearTimeout(timer);clearTimeout(deadline);signal?.removeEventListener('abort',aborted);};
    const finish=()=>{if(settled)return;settled=true;cleanup();resolve();};
    const aborted=()=>{if(settled)return;settled=true;cleanup();reject(new DOMException('Aborted','AbortError'));};
    frame=requestAnimationFrame(()=>{timer=setTimeout(finish,0);});
    deadline=setTimeout(finish,48);
    signal?.addEventListener('abort',aborted,{once:true});
  });
}
