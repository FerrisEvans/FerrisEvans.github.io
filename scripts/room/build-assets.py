#!/usr/bin/env python3
"""Reproducible candidate → audit → private site → poster seal → promotion.

Run with the project's existing Python/Pillow runtime. The default output is
private; no stage writes public/room unless the explicit promote command is used.
The old build.py is a historical scene, not this build's entry point.
"""
import argparse
import gzip
import hashlib
import json
import shutil
import struct
import subprocess
import sys
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
DEFAULT=ROOT/'.room-build/high-quality/assets-candidate'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('stage',choices=['geometry','bake','pack','audit','site','seal-posters','promote'])
parser.add_argument('--candidate',type=Path,default=DEFAULT)
parser.add_argument('--blender',type=Path,default=Path('/Applications/Blender.app/Contents/MacOS/Blender'))
parser.add_argument('--draft',action='store_true')
parser.add_argument('--city',type=Path,default=ROOT/'public/room/city-night-v3.png')
parser.add_argument('--poster-dir',type=Path,help='Actual WebGL captures named loading.png, reading.png, share.png')
parser.add_argument('--capture-build-id',help='buildId read from the rendered page, required to seal captures')
args=parser.parse_args();candidate=args.candidate.resolve()
if candidate==ROOT or candidate==ROOT/'public' or (ROOT/'public') in candidate.parents:
    parser.error('Use a private candidate directory outside public/')
candidate.mkdir(parents=True,exist_ok=True)
raw=candidate/'materials';packed=candidate/'packed';build=candidate/'build'

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def write(path,data):path.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
def run(command):subprocess.run([str(x)for x in command],cwd=ROOT,check=True)
def blender(script,flags):run([args.blender,'--background','--factory-startup','--python-exit-code','1','--python',ROOT/'scripts/room'/script,'--',*flags])
def source_receipt():
    paths=sorted((ROOT/'scripts/room').glob('*.py'))+sorted(p for p in (ROOT/'scripts/room/sources').rglob('*')if p.is_file())+[ROOT/'scripts/room/architecture-uv.glb',ROOT/'src/data/room-tapes.json',ROOT/'src/scripts/room/anchors.json',ROOT/'public/room/walnut-grain-v1.png',args.city.resolve()]
    sources={str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else str(p):digest(p)for p in paths}
    build_id=hashlib.sha256(json.dumps(sources,sort_keys=True).encode()).hexdigest()[:16]
    return {'buildId':build_id,'sources':sources,'draft':args.draft,'blender':str(args.blender),'python':sys.version.split()[0]}

def audit():
    m=json.loads((packed/'manifest.json').read_text())
    body=gzip.decompress((packed/m['model']).read_bytes())
    magic,version,length=struct.unpack_from('<III',body);assert magic==0x46546c67 and version==2 and length==len(body)
    size,kind=struct.unpack_from('<II',body,12);assert kind==0x4e4f534a
    gltf=json.loads(body[20:20+size]);nodes={n['name']:n for n in gltf['nodes']if 'name'in n}
    required={'HomeCamera','CRT_Case','CRT_Screen','CRT_Power','CRT_PowerLED','VCR_Body','VCR_TapeSlot','Work_Notepad','Computer_Screen','Plant_Pot','Mug_Body'}
    if 'paper' in m['atlases']:required.update({'Work_Notepad_Backing','Work_Notepad_Block'})
    if 'tape' in m['atlases']:required.update({'VHS_Master','VHS_Master_Shell','VHS_Master_Window_Left','VHS_Master_Reel_Left','VHS_Master_Label'})
    if 'foliage' in m['atlases']:required.add('Plant_Leaf')
    required.update(t['object']for t in json.loads((ROOT/'src/data/room-tapes.json').read_text()))
    assert required<=nodes.keys(),sorted(required-nodes.keys())
    for name,n in nodes.items():
        atlas=n.get('extras',{}).get('atlas')
        if not atlas:continue
        assert atlas in m['atlases'],(name,atlas)
        if name.startswith('Plant_Leaf') and atlas=='foliage':
            assert len(n['extras'].get('leaf_base',[]))==len(n['extras'].get('leaf_tip',[]))==3,name
        if name=='Work_Notepad' and atlas=='paper':assert len(n['extras'].get('paper_bend',[]))==2,name
        for part in gltf['meshes'][n['mesh']]['primitives']:
            assert {'TEXCOORD_0','TEXCOORD_1'}<=part['attributes'].keys(),name
    files={m['model']:digest(packed/m['model'])};texture_bytes=0;initial=0;deferred=0;dimensions={}
    for atlas,a in m['atlases'].items():
        for channel in ['albedo','normal','orm','room','tv','lampOff']+(['opacity']if a.get('opacity')else []):
            name=a[channel]['file']if isinstance(a[channel],dict)else a[channel]
            path=packed/name;files[name]=digest(path)
            with Image.open(path)as image:
                dimensions[name]=list(image.size)
                if channel=='albedo' and a.get('cutout'):
                    assert image.mode=='RGBA' and image.getchannel('A').getextrema()==(0,255),'Missing real leaf cutout alpha'
                # Conservative decoded RGBA8 plus a full mip chain; excludes
                # runtime probes, Canvas/video textures and render targets.
                texture_bytes+=round(image.width*image.height*4*4/3)
            if channel=='lampOff':deferred+=path.stat().st_size
            else:initial+=path.stat().st_size
    initial+=(packed/m['model']).stat().st_size
    if m.get('bakeBuildId'):
        actual=hashlib.sha256(json.dumps({'bake':m['bakeBuildId'],'files':files},sort_keys=True).encode()).hexdigest()[:16]
        assert m['buildId']==actual,'Packed files no longer match their buildId; re-pack before sealing posters'
    report={'buildId':m['buildId'],'files':files,'dimensions':dimensions,'modelAndInitialAtlasBytes':initial,'deferredLampOffBytes':deferred,'atlasGpuBytesWithMips':texture_bytes,'nodeCount':len(nodes),'requiredNamesVerified':sorted(required),'note':'Budget excludes city, movie, probe, Canvas and render-target allocation. Browser acceptance is separate.'}
    write(candidate/'audit.json',report);print(json.dumps({k:v for k,v in report.items()if k not in ['files','dimensions','requiredNamesVerified']},indent=2))
    return m,report

if args.stage in ('geometry','bake'):
    receipt=source_receipt();write(candidate/'source-receipt.json',receipt)
    blender('greybox.py',['--output',candidate/'greybox','--build-dir',build])
    flags=['--output',raw,'--build-dir',build,'--base',build/'study-greybox.blend','--city',args.city,'--build-id',receipt['buildId'],'--skip-render']
    if args.stage=='geometry':flags.append('--geometry-only')
    if args.draft:flags.append('--draft')
    blender('materials.py',flags)
    if args.stage=='bake':
        run([sys.executable,ROOT/'scripts/room/optimize.py','--source',raw,'--output',packed,'--no-city'])
        audit()
elif args.stage=='pack':
    run([sys.executable,ROOT/'scripts/room/optimize.py','--source',raw,'--output',packed,'--no-city']);audit()
elif args.stage=='audit':audit()
elif args.stage=='site':
    m,report=audit();site=candidate/'site';site.mkdir(exist_ok=True)
    # A private Astro root makes its build-time file sizes and served assets
    # agree without ever swapping public assets beneath another preview.
    for name in ['src','scripts','public']:
        shutil.copytree(ROOT/name,site/name,dirs_exist_ok=True)
    for name in ['package.json','package-lock.json','astro.config.mjs','tsconfig.json']:
        shutil.copy2(ROOT/name,site/name)
    if not (site/'node_modules').exists():(site/'node_modules').symlink_to(ROOT/'node_modules',target_is_directory=True)
    dest=site/'public/room/materials';dest.mkdir(parents=True,exist_ok=True)
    for name in report['files']:shutil.copy2(packed/name,dest/name)
    current=json.loads((ROOT/'public/room/materials/manifest.json').read_text())
    for key in ('city','homeFilm'):
        if key in current:m[key]=current[key]
    write(dest/'manifest.json',m)
    print('Private Astro root:',site)
    print('Build: npm run build (cwd:',site,')')
elif args.stage=='seal-posters':
    m,report=audit()
    if not args.poster_dir or args.capture_build_id!=m['buildId']:
        parser.error('Read the rendered buildId, then pass --poster-dir and matching --capture-build-id')
    poster_dir=candidate/'posters';poster_dir.mkdir(exist_ok=True);files={}
    for name,size in [('loading',(1440,1440)),('reading',(1440,900)),('share',(1200,630))]:
        with Image.open(args.poster_dir/f'{name}.png')as image:
            assert image.size==size,(name,image.size)
            path=poster_dir/f'{name}.jpg';image.convert('RGB').save(path,quality=94,progressive=True);files[path.name]=digest(path)
    write(candidate/'poster-receipt.json',{'buildId':m['buildId'],'files':files})
elif args.stage=='promote':
    m,report=audit();posters=json.loads((candidate/'poster-receipt.json').read_text())
    assert m['quality']=='final' and posters['buildId']==m['buildId'],'Only a final, poster-sealed bundle can be promoted'
    for name,sha in posters['files'].items():assert digest(candidate/'posters'/name)==sha,name
    backup=candidate/'pre-promotion'
    if backup.exists():parser.error('This candidate was already promoted; use a new candidate directory')
    shutil.copytree(ROOT/'public/room/materials',backup/'materials')
    for name in posters['files']:shutil.copy2(ROOT/'public/room'/name,backup/name)
    # City/movie are separately owned. The current city binding is retained.
    current=json.loads((ROOT/'public/room/materials/manifest.json').read_text())
    for key in ('city','homeFilm'):
        if key in current:m[key]=current[key]
    dest=ROOT/'public/room/materials'
    for name in report['files']:shutil.copy2(packed/name,dest/name)
    for name in posters['files']:shutil.copy2(candidate/'posters'/name,ROOT/'public/room'/name)
    write(ROOT/'public/room/asset-build.json',{'buildId':m['buildId'],'assets':report['files'],'posters':posters['files']})
    write(dest/'manifest.json',m)
    print('PROMOTED',m['buildId'])
