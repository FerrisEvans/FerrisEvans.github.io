/** VCR transport is independent of the TV input and power switch. */
export function createPlayback(tapeCount:number) {
  let selected:number|null=null,transport:'empty'|'playing'|'paused'|'stopped'='empty';
  let time=0,powered=true,source:'home'|'tape'|'posts'='home',page=0;
  return {
    get state(){return{selected,transport,time,powered,source,page};},
    select(index:number){
      if(!tapeCount)return;
      selected=((index%tapeCount)+tapeCount)%tapeCount;
      transport='playing';time=0;source='tape';
    },
    togglePlay(){
      if(selected===null)return false;
      transport=transport==='playing'?'paused':'playing';source='tape';return true;
    },
    stop(){if(selected!==null){transport='stopped';time=0;}},
    eject(){selected=null;transport='empty';time=0;if(source==='tape')source='home';},
    power(){powered=!powered;},
    navigate(view:string,nextPage=page){
      if(view==='posts'){source='posts';page=nextPage;}
      else if(source==='posts')source=selected===null?'home':'tape';
    },
    tick(delta:number,loading:boolean){
      // The VCR keeps running if the TV is off or displaying the article input.
      if(!loading&&transport==='playing')time+=Math.max(0,Math.min(delta,.1));
    },
    reset(){selected=null;transport='empty';time=0;powered=true;source='home';page=0;},
  };
}
