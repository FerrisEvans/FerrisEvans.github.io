"""Prepare local web assets. Data maps use exact lossless WebP; RGBM resizes in linear light.
Run after materials.py. --activate installs the verified candidate and archives bake sources.
"""
import argparse
import gzip
import hashlib
import json
import shutil
from pathlib import Path
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[2]
args = argparse.ArgumentParser()
args.add_argument('--activate', action='store_true')
args.add_argument('--source', type=Path, default=root/'public/room/materials')
args.add_argument('--output', type=Path, default=root/'.room-build/web-assets')
args.add_argument('--city', type=Path, default=root/'public/room/city-night-v3.png')
args.add_argument('--no-city', action='store_true', help='Leave the separately owned city plate untouched')
options = args.parse_args()
source, out = options.source.resolve(), options.output.resolve()
out.mkdir(parents=True, exist_ok=True)
if options.activate and source != (root/'public/room/materials').resolve():
    raise SystemExit('Candidate builds are validated and promoted through build-assets.py, never --activate.')
manifest = json.loads((source/'manifest.json').read_text())
if manifest.get('transport') == 'webp-gzip':
    raise SystemExit('Run a fresh material bake before optimizing again.')
report = {'files': [], 'sourceBytes': 0, 'resultBytes': 0}

def record(path, result, note):
    a,b=path.stat().st_size,result.stat().st_size
    report['sourceBytes']+=a; report['resultBytes']+=b
    report['files'].append({'source':path.name,'output':result.name,'before':a,'after':b,'note':note})

def resize_float(array, size):
    return np.stack([np.asarray(Image.fromarray(array[:,:,i], mode='F').resize((size,size), Image.Resampling.LANCZOS)) for i in range(array.shape[2])], axis=2)

for group, atlas in manifest['atlases'].items():
    opacity_path=source/atlas['opacity'] if atlas.get('opacity') else None
    for kind in ['albedo','orm','normal','room','lampOff','tv']:
        light = kind in ('room','lampOff','tv')
        path = source/(atlas[kind]['file'] if light else atlas[kind])
        image = Image.open(path).convert('RGBA')
        # 4K desk colour retains fibre detail; data maps use 2K to bound GPU and
        # transfer cost. Irradiance is baked independently at 2K, never upscaled.
        size = 1024 if group != 'desk' and kind in ('normal','orm') else image.width
        if group == 'desk' and kind in ('normal','orm'): size=min(size,2048)
        if group == 'desk' and kind == 'orm': size=min(size,1024)
        if group == 'desk' and kind in ('tv','lampOff'):
            size=min(size,512 if kind=='tv' else 1024)
        if group == 'walls' and kind != 'albedo':
            size=min(size,1024 if kind in ('room','lampOff') else 256 if kind=='tv' else 512)
        # Cloth and window charts retain their broad lighting at 512px;
        # their very soft, weak TV contribution needs still less resolution.
        # Keep the colour/yarn map at source size. RGBM is resized in linear light.
        if group in ('curtains','window','ceramic','paper') and kind != 'albedo':
            size = min(image.width, 256 if kind == 'tv' else 512)
        # The memo's glyphs are a separate live CanvasTexture. Its subtle stock
        # colour/fibres showed no discernible loss in the 1440×900 A/B at these
        # sizes; the actual curved sheet geometry is unchanged.
        if group == 'paper':
            size = min(image.width, 512 if kind == 'albedo' else 256)
        # Large hero colour/normal maps carry the visible finish. Their baked
        # illumination changes over centimetres, not individual plastic grains.
        # Re-encode RGBM in linear light rather than resampling encoded bytes.
        if group in ('equipment','props','foliage','tape') and light:
            size=min(image.width,1024 if kind=='room' else 512)
        if group=='architecture' and light:
            size=min(image.width,256 if kind=='tv' else 512)
        note = 'exact RGBA lossless WebP'
        if size < image.width:
            data = np.asarray(image).astype(np.float32)/255
            if light:
                span = atlas[kind]['range']
                linear = data[:,:,:3]*data[:,:,3:4]*span
                linear = np.maximum(resize_float(linear, size), 0)
                multiplier = np.clip(np.ceil(np.max(linear,axis=2,keepdims=True)/span*255)/255, 1/255, 1)
                encoded = np.concatenate([np.clip(linear/(multiplier*span),0,1),multiplier],axis=2)
                image = Image.fromarray(np.rint(encoded*255).astype(np.uint8))
                note = f'linear irradiance resize {size}px, RGBM re-encode, lossless WebP'
            elif kind=='normal':
                normal = resize_float(data[:,:,:3]*2-1,size)
                normal /= np.maximum(np.linalg.norm(normal,axis=2,keepdims=True),1e-8)
                image = Image.fromarray(np.rint(np.clip(normal*.5+.5,0,1)*255).astype(np.uint8)).convert('RGBA')
                note = f'{size}px renormalized tangent normals, lossless WebP'
            else:
                image = image.resize((size,size),Image.Resampling.LANCZOS)
                note = f'{size}px resize, lossless WebP'
        target = out/(path.stem+'.webp')
        # Albedo may use high-quality lossy compression; data and RGBM never do.
        if kind=='albedo':
            if opacity_path:
                mask=Image.open(opacity_path).convert('RGB').getchannel('G')
                assert mask.size==image.size,'Cutout and albedo UV grids must match'
                image.putalpha(mask)
                image.save(target,format='WEBP',quality=93,alpha_quality=100,exact=True,method=6)
                assert np.array_equal(np.asarray(mask),np.asarray(Image.open(target).getchannel('A'))),'WebP alpha must remain exact'
                atlas.pop('opacity',None);atlas['cutout']=True;atlas['alphaTest']=.45
                report['sourceBytes']+=opacity_path.stat().st_size
                note=f'{size}px sRGB albedo q93 + byte-exact cutout alpha; one GPU texture'
            else:
                image.convert('RGB').save(target,format='WEBP',quality=93,method=6)
                note = f'{size}px sRGB albedo, WebP quality 93'
        else:
            image.save(target,format='WEBP',lossless=True,exact=True,method=6)
            decoded = Image.open(target).convert('RGBA')
            if not np.array_equal(np.asarray(image), np.asarray(decoded)):
                raise RuntimeError(f'Lossless mismatch: {target.name}')
        if light: atlas[kind]['file']=target.name
        else: atlas[kind]=target.name
        record(path,target,note)
model = source/'study.glb'
packed = out/'study.glb.bin'
with packed.open('wb') as dest:
    with gzip.GzipFile(fileobj=dest,mode='wb',mtime=0,compresslevel=9) as stream: stream.write(model.read_bytes())
assert gzip.decompress(packed.read_bytes())==model.read_bytes()
record(model,packed,'byte-identical GLB after gzip decompression')
if not options.no_city:
    city = options.city.resolve()
    city_out=out/city.with_suffix('.webp').name
    Image.open(city).convert('RGB').save(city_out,format='WEBP',quality=92,method=6)
    record(city,city_out,'local city plate, WebP quality 92')
    manifest['city']='/room/'+city_out.name
manifest['model']='study.glb.bin';manifest['modelEncoding']='gzip';manifest['transport']='webp-gzip'
if manifest.get('buildId'):
    # Packing can be repeated without another expensive light bake. Give the
    # actual web payload its own identity so old posters cannot seal a repack.
    manifest['bakeBuildId']=manifest['buildId']
    manifest['packingScriptSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    payload={item['output']:hashlib.sha256((out/item['output']).read_bytes()).hexdigest() for item in report['files']}
    manifest['buildId']=hashlib.sha256(json.dumps({'bake':manifest['bakeBuildId'],'files':payload},sort_keys=True).encode()).hexdigest()[:16]
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(out/'compression-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='files'},indent=2))
if options.activate:
    backup=root/'.room-build/materials-source'
    backup.mkdir(parents=True,exist_ok=True)
    shutil.copy2(source/'manifest.json',backup/'manifest.json')
    for path in source.glob('*.png'): shutil.move(str(path),str(backup/path.name))
    shutil.copy2(model,backup/model.name)
    for path in out.iterdir():
        if path.name=='compression-report.json': continue
        shutil.copy2(path,root/'public/room'/path.name if path.name.startswith('city-') else source/path.name)
    model.unlink()
    print('ACTIVATED')
