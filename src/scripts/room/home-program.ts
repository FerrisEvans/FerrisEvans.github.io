/** Original 48-second station film. One timeline, driven by the room render loop. */
export const homeDuration = 48;
export const homeFrameRate = 24;
/** Watching the Home channel includes its close-up, independently of the lens. */
export function isHomePlaying(state: {
  view: string; source: string; powered: boolean; active: boolean; motion: boolean; hidden: boolean; requested?:boolean|null;
}) {
  return (state.view === 'home' || state.view === 'tv') && state.source === 'home'
    && state.powered && state.active && (state.requested??state.motion) && !state.hidden;
}
export function createHomeTimeline() {
  let time = 0;
  return {
    get time() { return time; },
    tick(delta: number, playing: boolean) {
      if (playing) time = (time + Math.max(0, Math.min(delta, .1))) % homeDuration;
      return time;
    },
    reset() { time = 0; },
  };
}

const smooth = (v: number) => { const x = Math.max(0, Math.min(1, v)); return x*x*(3-2*x); };
const noise = (n: number) => { const v = Math.sin(n*127.1+311.7)*43758.5453; return v-Math.floor(v); };

/** NIGHT LOG: a train home, a small idea, then a world made from that idea. */
export function paintHome(ctx: CanvasRenderingContext2D, seconds: number, reduced = false) {
  const t = reduced ? 7 : seconds % homeDuration;
  const chapter = Math.floor(t/16), local = t%16;
  ctx.save(); ctx.textAlign='left'; ctx.shadowBlur=0;
  ctx.fillStyle='#090e16';ctx.fillRect(0,0,768,576);
  ctx.save();ctx.beginPath();ctx.rect(0,32,768,488);ctx.clip();
  // A restrained push into each shot; lettering remains in the broadcast frame.
  ctx.save();const scale=1+smooth(local/16)*.035;
  ctx.translate(384,276);ctx.scale(scale,scale);ctx.translate(-384,-276);
  if (chapter===0) city(ctx,local);
  else if (chapter===1) desk(ctx,local);
  else world(ctx,local);
  ctx.restore();
  const edge=ctx.createRadialGradient(384,270,160,384,270,470);
  edge.addColorStop(0,'#07131800');edge.addColorStop(1,'#07131865');
  ctx.fillStyle=edge;ctx.fillRect(0,32,768,488);
  ctx.restore();
  // The edit is a short dissolve to dark, never a strobe or random cut.
  const edit = 1-smooth(local/.65)+smooth((local-15.35)/.65);
  ctx.fillStyle=`rgba(7,11,17,${edit})`;ctx.fillRect(0,32,768,488);
  ctx.fillStyle='#d5d9ce';ctx.font='23px RoomPixel,monospace';
  ctx.fillText('NIGHT LOG',30,23);
  ctx.textAlign='right';ctx.fillStyle='#9faeab';ctx.fillText(`0${chapter+1} / 03`,738,23);
  ctx.textAlign='left';ctx.font='27px RoomPixel,monospace';ctx.fillStyle='#ece0bd';
  ctx.fillText(['THE LAST TRAIN HOME','ONE SMALL IDEA','A WORLD, ONE FRAME AT A TIME'][chapter],30,551);
  ctx.restore();
}

function city(c: CanvasRenderingContext2D,t:number) {
  const sky=c.createLinearGradient(0,32,0,510);sky.addColorStop(0,'#111f2b');sky.addColorStop(.65,'#58666c');sky.addColorStop(1,'#14272c');c.fillStyle=sky;c.fillRect(0,32,768,488);
  // Three independent skyline layers and slow camera travel give the shot depth.
  for(let layer=0;layer<3;layer++) {
    const width=layer===0?62:layer===1?86:140,base=320+layer*55;
    for(let i=-1;i<14;i++) {
      const seed=(i+8)*17+layer*113,x=i*width-t*(layer+1)*1.7,height=60+noise(seed)*160;
      const facade=c.createLinearGradient(x,0,x+width,0);
      facade.addColorStop(0,['#40515b','#263c46','#152a33'][layer]);facade.addColorStop(.8,['#344852','#192f38','#0d2029'][layer]);facade.addColorStop(1,'#10232b');
      c.fillStyle=facade;c.fillRect(x,base-height,width-5,height+180);
      c.fillStyle='#9db0ad25';c.fillRect(x,base-height,width-5,2);
      for(let row=0;row<height/16-1;row++)for(let col=0;col<width/17-1;col++) {
        if(noise(seed+row*71+col*13)<.62)continue;
        c.fillStyle=noise(seed+row+col)>.5?'#dab880':'#7faaa9';c.globalAlpha=.35+noise(seed+row*3)*.35;
        c.fillRect(x+8+col*17,base-height+12+row*16,5,7);
        if(layer===2){c.globalAlpha=.07;c.fillRect(x+6+col*17,base-height+20+row*16,9,13);}
      }
      c.globalAlpha=1;
    }
  }
  const glow=c.createRadialGradient(571,198,1,571,198,90);glow.addColorStop(0,'#eab67955');glow.addColorStop(1,'#eab67900');c.fillStyle=glow;c.fillRect(470,98,200,200);
  c.fillStyle='#ceaa7e';c.font='25px RoomPixel,monospace';c.fillText('NIGHT LINE',505,207);
  const water=c.createLinearGradient(0,440,0,520);water.addColorStop(0,'#243b43');water.addColorStop(1,'#0a1b24');c.fillStyle=water;c.fillRect(0,440,768,80);
  c.fillStyle='#0b1a23';c.fillRect(0,435,768,8);c.fillStyle='#708181';c.fillRect(0,433,768,2);
  // Rounded metal body, carriage seams and reflected windows give the moving train weight.
  const trainX=830-t*91,body=c.createLinearGradient(0,382,0,432);
  body.addColorStop(0,'#c5c3af');body.addColorStop(.12,'#7e9190');body.addColorStop(.55,'#3d595f');body.addColorStop(.63,'#a4b1a6');body.addColorStop(1,'#3e535a');
  c.fillStyle='#08171e';for(let i=0;i<6;i++){c.beginPath();c.ellipse(trainX+30+i*65,431,8,5,0,0,Math.PI*2);c.fill();}
  c.fillStyle=body;c.beginPath();c.roundRect(trainX,383,390,46,[12,5,3,3]);c.fill();
  for(let i=0;i<11;i++){
    const x=trainX+13+i*34;c.fillStyle='#172b30';c.fillRect(x-1,391,25,23);
    const light=c.createLinearGradient(0,393,0,412);light.addColorStop(0,'#b6a67d');light.addColorStop(.5,'#e2c28c');light.addColorStop(1,'#8c8f74');
    c.fillStyle=light;c.fillRect(x,393,23,18);c.fillStyle='#253c3d';c.fillRect(x+11,393,1,18);
    c.fillStyle='#263b3c75';c.beginPath();c.ellipse(x+6,409,3,5,0,0,Math.PI*2);c.fill();
    for(let j=0;j<9;j++){c.fillStyle=`rgba(219,176,110,${.14*(1-j/9)})`;c.fillRect(x-3+Math.sin(j*2+t)*4,449+j*7,26+j*2,2);}
  }
  c.fillStyle='#c5c9b36b';c.fillRect(trainX+10,384,371,1);c.fillStyle='#20353d';for(let i=1;i<3;i++)c.fillRect(trainX+i*130,384,3,45);
  c.strokeStyle='#111e2a';c.lineWidth=2;c.beginPath();c.moveTo(0,355);c.bezierCurveTo(260,372,500,364,768,348);c.stroke();
  c.fillStyle='#14232b';for(const x of [205,618]){c.fillRect(x,345,4,92);c.fillRect(x-15,354,34,3);}
  // Fixed near-window mullions anchor the rain to an observed scene.
  c.fillStyle='#0a16208c';c.fillRect(88,32,12,488);c.fillRect(669,32,10,488);
}

function desk(c: CanvasRenderingContext2D,t:number) {
  const wall=c.createLinearGradient(0,32,768,520);wall.addColorStop(0,'#18272c');wall.addColorStop(.6,'#51473b');wall.addColorStop(1,'#8a7050');c.fillStyle=wall;c.fillRect(0,32,768,488);
  const pool=c.createRadialGradient(645,300,10,645,300,440);pool.addColorStop(0,'#e9ba7266');pool.addColorStop(1,'#e6c68c00');c.fillStyle=pool;c.fillRect(140,32,628,488);
  const wood=c.createLinearGradient(0,376,0,520);wood.addColorStop(0,'#70523c');wood.addColorStop(1,'#382e28');c.fillStyle=wood;c.fillRect(0,376,768,144);
  c.strokeStyle='#c19c6a12';c.lineWidth=1;for(let i=0;i<42;i++){const y=380+i*3.5;c.beginPath();c.moveTo(0,y);c.bezierCurveTo(180,y+noise(i)*7,490,y-4,768,y+2);c.stroke();}
  c.save();c.translate(8,0);
  c.save();c.shadowColor='#070d10';c.shadowBlur=22;c.fillStyle='#0a151999';c.beginPath();c.ellipse(315,440,250,30,0,0,Math.PI*2);c.fill();c.restore();
  const side=c.createLinearGradient(84,96,540,400);side.addColorStop(0,'#273735');side.addColorStop(.7,'#7b7962');side.addColorStop(1,'#aaa083');
  c.fillStyle=side;c.beginPath();c.roundRect(86,89,451,329,15);c.fill();
  const bezel=c.createLinearGradient(100,110,510,397);bezel.addColorStop(0,'#bab99b');bezel.addColorStop(.18,'#828d78');bezel.addColorStop(.75,'#696f5c');bezel.addColorStop(1,'#c6b78c');
  c.fillStyle=bezel;c.beginPath();c.roundRect(101,104,420,294,9);c.fill();
  c.strokeStyle='#dad2ad6b';c.lineWidth=1;c.stroke();
  c.fillStyle='#182724';c.beginPath();c.roundRect(121,126,377,249,13);c.fill();
  const screen=c.createRadialGradient(311,235,30,311,235,260);screen.addColorStop(0,'#173e38');screen.addColorStop(1,'#061d1e');c.fillStyle=screen;c.beginPath();c.roundRect(129,134,360,233,17);c.fill();
  c.save();c.beginPath();c.roundRect(129,134,360,233,17);c.clip();
  const glass=c.createLinearGradient(130,134,250,366);glass.addColorStop(0,'#d2d5b21c');glass.addColorStop(.45,'#b5cbb000');c.fillStyle=glass;c.fillRect(129,134,360,233);
  c.fillStyle='#a5d5b0';c.font='24px RoomPixel,monospace';c.fillText('STUDIO / 02',147,162);
  c.fillStyle='#5e8e7c';c.fillRect(147,177,322,1);
  const lines=['> a small idea','', 'while (night) {','  observe();','  build();','  return tomorrow;','}'];
  const typed=Math.floor(t*8);
  let used=0;
  lines.forEach((line,i)=>{const visible=line.slice(0,Math.max(0,typed-used));used+=line.length+3;c.fillStyle=i<2?'#d3d6a8':'#91c5ad';c.fillText(visible,147,211+i*21);});
  if(t>12){c.fillStyle='#cadcaa';c.fillRect(328,331,8,14);}
  c.restore();
  c.fillStyle='#34413b';c.fillRect(252,417,120,13);c.fillStyle='#222e2b';c.fillRect(241,427,145,7);
  const keys=c.createLinearGradient(0,429,0,491);keys.addColorStop(0,'#a09c7e');keys.addColorStop(1,'#4b5245');c.fillStyle=keys;c.beginPath();c.moveTo(95,435);c.lineTo(519,435);c.lineTo(561,493);c.lineTo(51,493);c.closePath();c.fill();
  c.fillStyle='#202e2b';c.fillRect(51,493,510,4);
  for(let y=0;y<4;y++)for(let x=0;x<16;x++){const kx=98+x*25-y*7,ky=442+y*11;c.fillStyle='#263b33';c.fillRect(kx,ky,19,7);c.fillStyle='#b4ad89';c.fillRect(kx,ky-1,19,4);}
  c.save();c.translate(576,412);c.rotate(-.13);c.shadowColor='#0e141280';c.shadowBlur=8;c.shadowOffsetY=4;c.fillStyle='#bca982';c.fillRect(0,0,139,90);c.shadowBlur=0;c.shadowOffsetY=0;c.fillStyle='#d5bf94';c.beginPath();c.moveTo(0,0);c.lineTo(132,0);c.lineTo(139,82);c.lineTo(0,90);c.closePath();c.fill();c.strokeStyle='#6d69514d';for(let i=0;i<4;i++){c.beginPath();c.moveTo(12,19+i*15);c.lineTo(120,19+i*15);c.stroke();}c.restore();
  c.save();c.shadowColor='#0b1717';c.shadowBlur=15;c.fillStyle='#18231c88';c.beginPath();c.ellipse(627,390,55,13,.15,0,Math.PI*2);c.fill();c.restore();
  c.strokeStyle='#8b8768';c.lineWidth=11;c.beginPath();c.ellipse(654,353,20,22,0,0,Math.PI*2);c.stroke();c.strokeStyle='#cfbd91';c.lineWidth=3;c.stroke();
  const ceramic=c.createLinearGradient(581,0,644,0);ceramic.addColorStop(0,'#4b5b50');ceramic.addColorStop(.35,'#a4aa83');ceramic.addColorStop(.8,'#d9c49a');ceramic.addColorStop(1,'#8f8e6d');
  c.fillStyle=ceramic;c.beginPath();c.moveTo(581,318);c.lineTo(585,382);c.bezierCurveTo(586,398,639,398,641,382);c.lineTo(644,318);c.closePath();c.fill();
  c.fillStyle='#c8c29d';c.beginPath();c.ellipse(612,318,32,11,0,0,Math.PI*2);c.fill();c.fillStyle='#242c24';c.beginPath();c.ellipse(612,319,27,7,0,0,Math.PI*2);c.fill();c.strokeStyle='#cfb88a66';c.lineWidth=1;c.stroke();
  c.strokeStyle='#d2c5a22e';c.lineWidth=2;for(let s=0;s<2;s++){c.beginPath();for(let j=0;j<30;j++){const y=305-j*2,x=602+s*17+Math.sin(j*.16+t*.8+s)*5;j?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();}
  c.restore();
}

function world(c:CanvasRenderingContext2D,t:number) {
  const sky=c.createLinearGradient(0,32,0,520);sky.addColorStop(0,'#20343e');sky.addColorStop(.55,'#758a88');sky.addColorStop(1,'#c6a875');c.fillStyle=sky;c.fillRect(0,32,768,488);
  const sun=c.createRadialGradient(545,235,0,545,235,100);sun.addColorStop(0,'#f2dfaca0');sun.addColorStop(1,'#f2dfac00');c.fillStyle=sun;c.fillRect(440,130,210,210);
  c.fillStyle='#ead4a4';c.beginPath();c.arc(545,235,27,0,Math.PI*2);c.fill();
  for(let l=0;l<3;l++) {
    const slope=c.createLinearGradient(0,280+l*40,0,520);slope.addColorStop(0,['#6b8280','#435f60','#2c4549'][l]);slope.addColorStop(.15,['#5d787b','#37575c','#203b41'][l]);slope.addColorStop(1,'#102931');c.fillStyle=slope;c.beginPath();c.moveTo(0,520);
    for(let x=-6;x<=780;x+=6){const y=315+l*45+Math.sin(x*.007+l*2+t*.012)*34+Math.sin(x*.018+l)*13;c.lineTo(x,y);}
    c.lineTo(768,520);c.closePath();c.fill();
  }
  const path=c.createLinearGradient(0,410,0,520);path.addColorStop(0,'#b3ae85');path.addColorStop(1,'#566d66');c.fillStyle=path;c.beginPath();c.moveTo(444,417);c.lineTo(451,417);c.bezierCurveTo(415,447,504,481,530,520);c.lineTo(277,520);c.bezierCurveTo(347,479,407,461,444,417);c.fill();
  // One tiny traveller: the constructed scene becomes inhabited.
  const px=390+t*1.9,py=463-t*.7;c.fillStyle='#0e252c66';c.beginPath();c.ellipse(px-7,py+10,17,3,-.2,0,Math.PI*2);c.fill();c.fillStyle='#d6bc90';c.beginPath();c.arc(px,py-25,4,0,Math.PI*2);c.fill();
  const coat=c.createLinearGradient(px-7,0,px+7,0);coat.addColorStop(0,'#614e3b');coat.addColorStop(1,'#ba8d59');c.fillStyle=coat;c.beginPath();c.moveTo(px-4,py-21);c.lineTo(px+4,py-21);c.lineTo(px+8,py+1);c.quadraticCurveTo(px,py+5,px-7,py);c.fill();
  c.strokeStyle='#142b31';c.lineWidth=3;for(const leg of [-1,1]){c.beginPath();c.moveTo(px+leg*3,py);c.lineTo(px+leg*3+Math.sin(t*3.4)*leg*3,py+10);c.stroke();}
  c.fillStyle='#d5dfd7';c.font='23px RoomPixel,monospace';c.fillText('BUILD 003  /  A PLACE TO RETURN TO',30,75);
  c.strokeStyle='#e5e3ca80';c.lineWidth=1;for(let i=0;i<3;i++){const x=120+i*73+t*7,y=135+Math.sin(t*.6+i)*9;c.beginPath();c.moveTo(x-6,y+2);c.lineTo(x,y);c.lineTo(x+6,y+2);c.stroke();}
}
