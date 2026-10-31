"""Re-render changed native 3D lettering, retaining the reviewed film elsewhere.

Uses the same camera, samples, shutter and animation as render.py. Originals
remain read-only; final full frames and an audit are written to a new directory.
"""
import argparse, json, subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[3]
p=argparse.ArgumentParser()
p.add_argument('--source',type=Path,default=ROOT/'.room-build/high-quality/film')
p.add_argument('--output',type=Path,default=ROOT/'.room-build/debranded-film')
p.add_argument('--frame',type=int)
p.add_argument('--compose-only',action='store_true')
p.add_argument('--blender',default='/Applications/Blender.app/Contents/MacOS/Blender')
args=p.parse_args();source=args.source.resolve();out=args.output.resolve()
assert source!=out,'Keep reviewed source frames intact'
out.mkdir(parents=True,exist_ok=True)
audit=[]
for shot in ('train','idea','world'):
    if not args.compose_only:
        command=[args.blender,'--background','--python-exit-code','1','--python',
            str(ROOT/'scripts/room/film/render.py'),'--','--shot',shot,'--samples','64',
            '--build-dir',str(out),'--patch-source',str(source),'--resume']
        if args.frame:command+=['--frame',str(args.frame)]
        with (out/f'{shot}.log').open('w') as log:
            subprocess.run(command,stdout=log,stderr=subprocess.STDOUT,check=True)
    (out/shot).mkdir(exist_ok=True)
    for meta in sorted((out/'patches'/shot).glob('*.json')):
        if args.frame and meta.stem!=f'{args.frame:04d}':continue
        region=json.loads(meta.read_text())['region'];left,top,right,bottom=region
        base=Image.open(source/shot/(meta.stem+'.png')).convert('RGB')
        patch=Image.open(meta.with_suffix('.png')).convert('RGB')
        # Blender uses integer border pixels; allow its float rounding to take
        # one pixel from the upper/right edge, never rescale rendered content.
        assert abs(patch.width-(right-left))<=1 and abs(patch.height-(bottom-top))<=1
        mask=Image.new('L',patch.size,255);draw=ImageDraw.Draw(mask)
        for inset in range(12):
            value=round(255*inset/12)
            if left>0:draw.line((inset,0,inset,patch.height-1),fill=value)
            if right<base.width:draw.line((patch.width-1-inset,0,patch.width-1-inset,patch.height-1),fill=value)
            if top>0:draw.line((0,inset,patch.width-1,inset),fill=value)
            if bottom<base.height:draw.line((0,patch.height-1-inset,patch.width-1,patch.height-1-inset),fill=value)
        base.paste(patch,(left,bottom-patch.height),mask)
        base.save(out/shot/(meta.stem+'.png'))
        audit.append({'shot':shot,'frame':int(meta.stem),'region':region,'changedPixelBudget':patch.width*patch.height})
    print('Completed',shot,flush=True)
(out/'lettering-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
