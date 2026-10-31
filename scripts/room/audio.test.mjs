import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../../src/scripts/room/audio.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {RoomAudio}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const homeSource=readFileSync(new URL('../../src/scripts/room/home-program.ts',import.meta.url),'utf8');
const homeJS=ts.transpileModule(homeSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {isHomePlaying}=await import('data:text/javascript;base64,'+Buffer.from(homeJS).toString('base64'));

test('Home score is gesture-gated, singleton, resumes its offset, and yields to CD or mute',async t=>{
  let contexts=0,clock;const live=new Set(),starts=[];
  const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}});
  const node=()=>({connect(next){return next;},disconnect(){},gain:param(),frequency:param(),Q:param()});
  const sourceNode=()=>({...node(),start(when=0,offset=0){live.add(this);starts.push({node:this,offset});},stop(){live.delete(this);}});
  class Context{
    state='suspended';currentTime=0;sampleRate=100;destination=node();
    constructor(){contexts++;clock=this;}
    async resume(){this.state='running';}
    async suspend(){this.state='suspended';}
    async close(){this.state='closed';}
    createBuffer(channels,length){const data=Array.from({length:channels},()=>new Float32Array(length));return{getChannelData(i){return data[i];}};}
    createBufferSource(){return sourceNode();}
    createOscillator(){return sourceNode();}
    createGain(){return node();}
    createBiquadFilter(){return node();}
  }
  const old=globalThis.AudioContext;globalThis.AudioContext=Context;t.after(()=>{globalThis.AudioContext=old;});
  const audio=new RoomAudio();audio.setHome(true,7);assert.equal(contexts,0);
  await audio.enable();assert.equal(contexts,1);assert.equal(live.size,3);assert.equal(starts.at(-1).offset,7);
  for(let i=0;i<100;i++){clock.currentTime=i/30;audio.setHome(true,7+i/30);}
  assert.equal(live.size,3);assert.equal(starts.length,3);
  const watching={view:'home',source:'home',powered:true,active:true,motion:true,hidden:false};
  clock.currentTime=3.5;
  for(const view of ['tv','home','tv']){
    watching.view=view;audio.setHome(isHomePlaying(watching),10.5);
    assert.equal(live.size,3);assert.equal(starts.length,3,'TV camera changes reuse the same audio source');
  }
  clock.currentTime+=.35;audio.setHome(true,10.5);
  assert.equal(live.size,3,'clock correction replaces, never overlaps the score');
  assert.equal(starts.at(-1).offset,10.5);
  watching.source='posts';audio.setHome(isHomePlaying(watching),10.5);assert.equal(live.size,2);
  watching.source='home';audio.setHome(isHomePlaying(watching),10.5);
  assert.equal(live.size,3);assert.equal(starts.at(-1).offset,10.5);
  audio.setHome(false,11);assert.equal(live.size,2);
  audio.setHome(true,11);assert.equal(live.size,3);assert.equal(starts.at(-1).offset,11);
  await audio.setMusic(true);assert.equal(live.size,3,'CD replaces the Home score, leaving rain and hum');
  clock.currentTime+=5;assert.equal(audio.musicTime,5);
  audio.setMusic(false);clock.currentTime+=2;assert.equal(audio.musicTime,5,'pause retains the CD display and audio offset');
  await audio.setMusic(true);assert.equal(starts.at(-1).offset,5);
  clock.currentTime+=2;assert.equal(audio.musicTime,7);
  audio.setMusic(false,true);assert.equal(audio.musicTime,0,'stop returns the CD to its beginning');
  await audio.setMusic(true);assert.equal(starts.at(-1).offset,0);
  audio.setHome(true,12);assert.equal(live.size,3);audio.mute();assert.equal(live.size,0);
  audio.setHome(true,13);assert.equal(live.size,0);audio.setMusic(false);
  await audio.enable();assert.equal(live.size,3);assert.equal(starts.at(-1).offset,13);
  audio.dispose();assert.equal(live.size,0);
});

test('chunked synthesis yields; mute cancels pending starts and late buffers use the current position',async t=>{
  const live=new Set(),starts=[];let buffers=0,ticks=0;
  const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}});
  const node=()=>({connect(next){return next;},disconnect(){},gain:param(),frequency:param(),Q:param()});
  const sourceNode=()=>({...node(),start(when=0,offset=0){live.add(this);starts.push({duration:this.buffer?.duration,offset});},stop(){live.delete(this);}});
  class Context{
    state='suspended';currentTime=0;sampleRate=1000;destination=node();
    async resume(){this.state='running';}async suspend(){this.state='suspended';}async close(){this.state='closed';}
    createBuffer(channels,length,rate){buffers++;const data=Array.from({length:channels},()=>new Float32Array(length));return{duration:length/rate,getChannelData(i){return data[i];}};}
    createBufferSource(){return sourceNode();}createOscillator(){return sourceNode();}createGain(){return node();}createBiquadFilter(){return node();}
  }
  t.mock.property(globalThis,'AudioContext',Context);
  t.mock.method(performance,'now',()=>ticks+=7);
  const audio=new RoomAudio();audio.setHome(true,3);
  const enabling=audio.enable();await Promise.resolve();
  assert.equal(starts.some(s=>s.duration===48),false,'synthesis returns control before the full buffer is ready');
  audio.setHome(true,12);const cd=audio.setMusic(true);audio.mute();
  await Promise.all([enabling,cd]);assert.equal(live.size,0,'late tasks must not restart muted audio');
  audio.setMusic(false);audio.setHome(true,13);const ready=audio.enable();
  await Promise.resolve();audio.setHome(true,14);await ready;
  assert.equal(starts.at(-1).duration,48);assert.equal(starts.at(-1).offset,14);
  await audio.setMusic(true);const built=buffers;
  audio.setMusic(false);await audio.setMusic(true);
  assert.equal(buffers,built,'repeated CD play reuses one bounded PCM buffer');
  assert.equal([...live].filter(s=>s.buffer?.duration===48).length,0);
  assert.equal([...live].filter(s=>s.buffer?.duration===32).length,1);
  audio.dispose();assert.equal(live.size,0);
});
