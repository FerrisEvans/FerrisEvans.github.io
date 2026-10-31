/** Playback intent is independent from the camera and from audio opt-in. */
export function createVideoTransport(video: Pick<HTMLVideoElement, 'play'|'pause'|'paused'|'currentTime'|'readyState'|'seeking'>) {
  let wanted=false, pending=false, failed=false, disposed=false, generation=0;
  function setPlaying(value:boolean) {
    if(disposed)return;
    if(value!==wanted){wanted=value;failed=false;generation++;}
    if(!wanted){video.pause();return;}
    if(!video.paused||pending||failed)return;
    pending=true;
    const requestedGeneration=generation;
    void video.play().catch(()=>{
      // pause() may reject an older pending play after a new Home intent.
      // That cancellation must not block the current intent from retrying.
      if(!disposed&&requestedGeneration===generation)failed=true;
    }).finally(()=>{
      pending=false;
      // A navigation or visibility event can arrive before play() resolves.
      if(!wanted||disposed)video.pause();
    });
  }
  return {
    setPlaying,
    get time(){return video.currentTime;},
    get playing(){return wanted&&!video.paused&&!video.seeking&&video.readyState>=3&&!failed;},
    get failed(){return failed;},
    reset(){setPlaying(false);video.currentTime=0;},
    dispose(){disposed=true;wanted=false;video.pause();},
  };
}
