"""Encode reviewed physical-scene frames to the browser movie and static poster.

Requires Pillow and ffmpeg. Set FFMPEG_BINARY or use the temporary imageio-ffmpeg
package under .room-build/high-quality/film/tools; no global installation needed.
"""
import argparse, hashlib, json, os, shutil, subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[3]
BUILD=ROOT/'.room-build/high-quality/film'; OUT=ROOT/'public/room/film'
OUT.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(BUILD/'tools'))
ffmpeg=os.environ.get('FFMPEG_BINARY') or shutil.which('ffmpeg')
if not ffmpeg:
    import imageio_ffmpeg
    ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
parser=argparse.ArgumentParser();parser.add_argument('--preview',action='store_true');parser.add_argument('--motion-preview',action='store_true');parser.add_argument('--crf',type=int,default=22);parser.add_argument('--reuse-edited',action='store_true');parser.add_argument('--build-dir',type=Path,default=BUILD);parser.add_argument('--output',type=Path,default=OUT);opts=parser.parse_args()
BUILD=opts.build_dir.resolve();OUT=opts.output.resolve();OUT.mkdir(parents=True,exist_ok=True)
shots=['train','idea','world'];titles=['THE LAST TRAIN HOME','ONE SMALL IDEA','A WORLD TAKES SHAPE']
font_path=Path('/System/Library/Fonts/Supplemental/Arial.ttf')
font=ImageFont.truetype(str(font_path),16) if font_path.exists() else ImageFont.load_default(size=16)
small=ImageFont.truetype(str(font_path),12) if font_path.exists() else ImageFont.load_default(size=12)
frames=BUILD/'edited';frames.mkdir(exist_ok=True)

def edit(image,shot,frame):
    image=image.convert('RGB');w,h=image.size
    # Physical footage stays full 4:3; one understated caption is burnt in.
    overlay=Image.new('RGBA',(w,h),(0,0,0,0));d=ImageDraw.Draw(overlay)
    for y in range(h-70,h):d.line((0,y,w,y),fill=(4,8,12,int((y-(h-70))/70*125)))
    d.text((28,h-37),titles[shot],font=font,fill=(229,222,203,255))
    label=f'NIGHT LOG  /  0{shot+1}'
    d.text((w-28-d.textlength(label,font=small),h-34),label,font=small,fill=(196,204,198,255))
    image=Image.alpha_composite(image.convert('RGBA'),overlay).convert('RGB')
    # Each chapter fades through black; first and last decoded frames agree.
    local=(frame-1)/24
    opacity=min(1,local/.5,(383/24-local)/.5)
    opacity=max(0,opacity);opacity=opacity*opacity*(3-2*opacity)
    if opacity<1:image=Image.blend(Image.new('RGB',image.size,(4,7,10)),image,opacity)
    return image

if opts.preview:
    for s,shot in enumerate(shots):
        frame=300 if shot=='world' else 192
        edit(Image.open(BUILD/shot/f'{frame:04d}.png'),s,frame).save(BUILD/f'preview-{shot}.jpg',quality=95,subsampling=0)
    raise SystemExit()

if opts.motion_preview:
    motion=BUILD/'motion-preview';motion.mkdir(exist_ok=True)
    for s,(shot,start) in enumerate(zip(shots,[190,190,70])):
        for i in range(24):edit(Image.open(BUILD/shot/f'{start+i:04d}.png'),s,start+i).save(motion/f'{s*24+i+1:04d}.png')
    subprocess.run([ffmpeg,'-y','-framerate','24','-i',str(motion/'%04d.png'),'-frames:v','72','-c:v','libx264','-crf',str(opts.crf),'-pix_fmt','yuv420p','-movflags','+faststart','-an',str(BUILD/'motion-preview.mp4')],check=True)
    raise SystemExit()

for s,shot in enumerate(shots):
    for frame in range(1,385):
        source=BUILD/shot/f'{frame:04d}.png'
        if not source.exists():raise RuntimeError(f'Missing reviewed source frame: {source}')
        target=frames/f'{s*384+frame:04d}.png'
        if not (opts.reuse_edited and target.exists()):edit(Image.open(source),s,frame).save(target)
video=OUT/'night-log.mp4'
subprocess.run([ffmpeg,'-y','-framerate','24','-i',str(frames/'%04d.png'),'-frames:v','1152','-vf','scale=in_range=full:out_range=tv:out_color_matrix=bt709,setparams=range=limited:color_primaries=bt709:color_trc=iec61966-2-1:colorspace=bt709','-c:v','libx264','-preset','slow','-crf',str(opts.crf),'-pix_fmt','yuv420p','-profile:v','high','-level','3.1','-colorspace','bt709','-color_primaries','bt709','-color_trc','iec61966-2-1','-g','48','-keyint_min','24','-sc_threshold','40','-movflags','+faststart','-an',str(video)],check=True)
poster=edit(Image.open(BUILD/'train/0192.png'),0,192)
poster.save(OUT/'night-log-still.webp',quality=92,method=6)
# Derive the lighting track from the encoded video, rather than guessing shot
# colours or forcing the browser to read GPU video pixels back every frame.
decoded=subprocess.check_output([ffmpeg,'-v','error','-i',str(video),'-vf','scale=32:24','-pix_fmt','rgb24','-f','rawvideo','pipe:1'])
stride=32*24*3
assert len(decoded)==1152*stride,(len(decoded),1152*stride)
linear=[v/255/12.92 if v/255<=.04045 else ((v/255+.055)/1.055)**2.4 for v in range(256)]
averages=[]
for offset in range(0,len(decoded),stride):
    pixels=decoded[offset:offset+stride]
    averages.append([round(sum(linear[v] for v in pixels[c::3])/(32*24),6) for c in range(3)])
light_path=OUT/'night-log-light.json'
light_path.write_text(json.dumps({'fps':24,'duration':48,'colorSpace':'linear-srgb','frames':averages},separators=(',',':'))+'\n')
manifest={
 'version':1,'title':'NIGHT LOG','duration':48,'fps':24,'width':960,'height':720,'posterTime':191/24,
 'video':'/room/film/night-log.mp4','poster':'/room/film/night-log-still.webp','light':'/room/film/night-log-light.json',
 'encoding':{'codec':'H.264','pixelFormat':'yuv420p','profile':'High','level':'3.1','crf':opts.crf,'colorPrimaries':'BT.709','transfer':'sRGB (IEC 61966-2-1)','matrix':'BT.709','range':'limited','audioTracks':0},
 'audio':'none; the existing synchronized Mainloop synthesized score remains authoritative',
 'chapters':[{'start':i*16,'duration':16,'title':titles[i]} for i in range(3)],
 'files':{p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [video,OUT/'night-log-still.webp',light_path]},
 'decodeBudget':{'rgbaTextureBytes':960*720*4,'yuv420FrameBytes':960*720*3//2,'note':'Decoder surface count and hardware acceleration vary by browser; measure actual playback, not only this per-frame estimate.'},
}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(manifest,ensure_ascii=False,indent=2))
