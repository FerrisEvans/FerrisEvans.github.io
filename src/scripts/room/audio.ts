/** Locally synthesized rain, a quiet room hum, and short control tones. No audio is created before opt-in. */
export class RoomAudio {
  private context?: AudioContext;
  private playing = new Set<OscillatorNode>();
  private ambience: AudioScheduledSourceNode[] = [];
  private ambientNodes: AudioNode[] = [];
  enabled = false;
  music = false;
  volume = .6;
  private musicSource?:AudioBufferSourceNode;
  private musicGain?:GainNode;
  private musicStartedAt=0;
  private musicOffset=0;
  private homeSource?:AudioBufferSourceNode;
  private homeGain?:GainNode;
  private homeBuffer?:AudioBuffer;
  private musicBuffer?:AudioBuffer;
  private homePreparing?:Promise<void>;
  private musicPreparing?:Promise<void>;
  private disposed=false;
  private homePlaying=false;
  private homeTime=0;
  private homeStartedAt=0;
  private homeOffset=0;
  onStateChange?: () => void;

  get state() { return this.context?.state ?? 'uninitialized'; }
  get musicTime() { return (this.musicOffset+(this.musicSource&&this.context?this.context.currentTime-this.musicStartedAt:0))%32; }
  get musicRunning() { return !!this.musicSource&&this.enabled&&this.context?.state==='running'; }
  async enable() {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.context.onstatechange = () => this.onStateChange?.();
      }
      await this.context.resume();
      this.enabled = this.context.state === 'running';
      if (this.enabled && !this.ambience.length) this.startAmbience();
      if(this.enabled&&this.music)await this.startMusic();
      if(this.enabled&&this.homePlaying&&!this.music)await this.startHome();
    } catch { this.enabled = false; }
    return this.enabled;
  }
  private startAmbience() {
    const ctx = this.context!;
    const buffer = ctx.createBuffer(2, ctx.sampleRate * 8, ctx.sampleRate);
    // A deterministic, decorrelated stereo rain bed, stationary at the loop seam.
    let seed = 29061990;
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        seed = (1664525 * seed + 1013904223) >>> 0;
        data[i] = seed / 2147483648 - 1;
      }
    }
    const rain = ctx.createBufferSource(); rain.buffer = buffer; rain.loop = true;
    const high = ctx.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 520;
    const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 1650; low.Q.value = .55;
    const rainGain = ctx.createGain(); rainGain.gain.setValueAtTime(0,ctx.currentTime);
    rainGain.gain.linearRampToValueAtTime(.035,ctx.currentTime+.8);
    rain.connect(high).connect(low).connect(rainGain).connect(ctx.destination);
    const hum = ctx.createOscillator(); hum.type = 'sine'; hum.frequency.value = 60;
    const humGain = ctx.createGain(); humGain.gain.value = .0018;
    hum.connect(humGain).connect(ctx.destination);
    this.ambience = [rain, hum]; this.ambientNodes = [rain, high, low, rainGain, hum, humGain];
    rain.start(); hum.start();
  }
  setMusic(value:boolean,reset=false) {
    if(reset)this.stopMusic(true);
    this.music=value;
    if(value)this.stopHome();
    if(value&&this.enabled)return this.startMusic();
    else this.stopMusic(reset);
  }
  private stopMusic(reset=false){this.musicOffset=reset?0:this.musicTime;try{this.musicSource?.stop();}catch{}this.musicSource?.disconnect();this.musicGain?.disconnect();this.musicSource=undefined;this.musicGain=undefined;}
  setVolume(value:number){this.volume=Math.max(0,Math.min(1,value));if(this.musicGain&&this.context)this.musicGain.gain.setTargetAtTime(this.volume*.075,this.context.currentTime,.08);if(this.homeGain&&this.context)this.homeGain.gain.setTargetAtTime(this.volume*.035,this.context.currentTime,.08);}
  setHome(playing:boolean,time:number) {
    this.homePlaying=playing;this.homeTime=time;
    if(playing&&this.homeSource&&this.context){
      const expected=(this.homeOffset+this.context.currentTime-this.homeStartedAt)%48;
      const drift=Math.abs(((time-expected+72)%48)-24);
      // A decoder stall or scheduling gap must not leave the score in a later chapter.
      if(drift>.18)this.stopHome();
    }
    if(playing&&this.enabled&&!this.music)this.startHome();else this.stopHome();
  }
  private stopHome(){try{this.homeSource?.stop();}catch{}this.homeSource?.disconnect();this.homeGain?.disconnect();this.homeSource=undefined;this.homeGain=undefined;}
  private startHome():Promise<void>|void{
    if(this.homeSource||!this.context||!this.enabled||!this.homePlaying||this.music||this.disposed)return;
    if(this.homePreparing)return this.homePreparing;
    const ctx=this.context;
    if(!this.homeBuffer){
      const task=this.prepareHome(ctx).finally(()=>{this.homePreparing=undefined;});
      this.homePreparing=task;
      return task.then(()=>{if(this.homeBuffer)this.startHome();});
    }
    const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=this.homeBuffer;source.loop=true;
    gain.gain.value=this.volume*.035;source.connect(gain).connect(ctx.destination);source.start(0,this.homeTime%48);
    this.homeStartedAt=ctx.currentTime;this.homeOffset=this.homeTime%48;
    this.homeSource=source;this.homeGain=gain;
  }
  private async prepareHome(ctx:AudioContext){
    // Keep the original score sample-for-sample; yield before synthesis can
    // block a frame. Use the latest media position when the buffer is ready.
    const buffer=ctx.createBuffer(1,ctx.sampleRate*48,ctx.sampleRate),data=buffer.getChannelData(0);
    const chords=[[110,164.81,220],[130.81,196,261.63],[146.83,220,293.66]];
    let deadline=performance.now()+6;
    for(let start=0;start<data.length;start+=4096){
      for(let i=start;i<Math.min(start+4096,data.length);i++){const t=i/ctx.sampleRate,local=t%16,env=Math.min(1,local/2,(16-local)/2);let v=0;
        for(const f of chords[Math.floor(t/16)])v+=Math.sin(2*Math.PI*f*t)+.08*Math.sin(2*Math.PI*f*2*t);
        data[i]=v/3*env*.65;
      }
      if(performance.now()>=deadline){await new Promise<void>(resolve=>setTimeout(resolve,0));if(!this.enabled||this.disposed)return;deadline=performance.now()+6;}
    }
    if(!this.disposed&&this.enabled)this.homeBuffer=buffer;
  }
  private startMusic():Promise<void>|void{
    if(this.musicSource||!this.context||!this.enabled||!this.music||this.disposed)return;
    if(this.musicPreparing)return this.musicPreparing;
    const ctx=this.context;
    if(!this.musicBuffer){
      const task=this.prepareMusic(ctx).finally(()=>{this.musicPreparing=undefined;});
      this.musicPreparing=task;
      return task.then(()=>{if(this.musicBuffer)this.startMusic();});
    }
    const source=ctx.createBufferSource();source.buffer=this.musicBuffer;source.loop=true;const gain=ctx.createGain();gain.gain.value=this.volume*.075;source.connect(gain).connect(ctx.destination);source.start(0,this.musicOffset);this.musicStartedAt=ctx.currentTime;this.musicSource=source;this.musicGain=gain;
  }
  private async prepareMusic(ctx:AudioContext){
    const duration=32,buffer=ctx.createBuffer(2,ctx.sampleRate*duration,ctx.sampleRate);
    // Original, deterministic four-chord electric-piano loop, synthesized locally.
    const chords=[[130.81,164.81,196,246.94],[110,130.81,164.81,196],[87.31,110,130.81,164.81],[98,123.47,146.83,196]];
    let deadline=performance.now()+6;
    for(let channel=0;channel<2;channel++) {const data=buffer.getChannelData(channel);
      for(let start=0;start<data.length;start+=4096){
        for(let i=start;i<Math.min(start+4096,data.length);i++){const t=i/ctx.sampleRate,bar=Math.floor(t/8),chord=chords[bar];let value=0;
          chord.forEach((frequency,j)=>{const local=(t-j*.065+duration)%2;const envelope=(1-Math.exp(-local*85))*Math.exp(-local*1.55);const phase=2*Math.PI*frequency*(1+(channel?1:-1)*.0006)*t;
            value+=envelope*(Math.sin(phase)+.16*Math.sin(phase*2)+.035*Math.sin(phase*3))/4;});
          const edge=Math.min(1,t/.06,(duration-t)/.10);data[i]=value*edge;
        }
        if(performance.now()>=deadline){await new Promise<void>(resolve=>setTimeout(resolve,0));if(!this.enabled||!this.music||this.disposed)return;deadline=performance.now()+6;}
      }
    }
    if(!this.disposed&&this.enabled&&this.music)this.musicBuffer=buffer;
  }
  tone(enter = false) {
    if (!this.enabled || this.context?.state !== 'running') return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(enter ? 660 : 330, now);
    oscillator.frequency.exponentialRampToValueAtTime(enter ? 165 : 220, now + .12);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(.025, now + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .14);
    oscillator.connect(gain).connect(this.context.destination);
    this.playing.add(oscillator);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.playing.delete(oscillator); };
    oscillator.start(now); oscillator.stop(now + .15);
  }
  mute() {
    this.enabled = false;
    this.stopHome();
    this.stopMusic();
    for (const oscillator of this.playing) { try { oscillator.stop(); } catch { /* Already ended. */ } }
    for (const source of this.ambience) { try { source.stop(); } catch { /* Already stopped. */ } }
    for (const node of this.ambientNodes) node.disconnect();
    this.ambience = []; this.ambientNodes = [];
    void this.context?.suspend();
  }
  dispose() { this.disposed=true;this.mute();this.homeBuffer=this.musicBuffer=undefined;void this.context?.close(); }
}
