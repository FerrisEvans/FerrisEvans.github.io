#!/usr/bin/env python3
"""Prepare a private pre-optimization site with the same load timing points.

Never replaces live source files or the frozen before/dist artifact. Timing-only
sources are frozen separately so current loading changes cannot pollute baseline.
"""
import difflib
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[2]
BEFORE = ROOT / '.room-build/immersion/before'
SITE = BEFORE / 'site'
INSTRUMENTATION = BEFORE / 'timing-instrumentation'
if not (INSTRUMENTATION / 'sha256.json').exists():
    raise SystemExit('Missing frozen baseline instrumentation; refusing to copy live loading strategy')
instrumentation_hashes = json.loads((INSTRUMENTATION / 'sha256.json').read_text())
for name, expected in instrumentation_hashes.items():
    if hashlib.sha256((INSTRUMENTATION / name).read_bytes()).hexdigest() != expected:
        raise SystemExit(f'Changed baseline instrumentation: {name}')
if SITE.exists():
    raise SystemExit(f'Refusing to replace an existing baseline site: {SITE}')
SITE.mkdir()
shutil.copytree(ROOT / 'src', SITE / 'src')
(SITE / 'public').mkdir()
for entry in (ROOT / 'public').iterdir():
    # Frozen build contains the original public bytes, including old window art.
    source = BEFORE / 'dist' / entry.name
    if not source.exists():
        continue
    target = SITE / 'public' / entry.name
    if source.is_dir():
        shutil.copytree(source, target)
    else:
        shutil.copy2(source, target)
for name in ('package.json', 'package-lock.json', 'astro.config.mjs', 'tsconfig.json'):
    shutil.copy2(ROOT / name, SITE / name)
(SITE / 'node_modules').symlink_to(ROOT / 'node_modules', target_is_directory=True)
(SITE / 'scripts/room').mkdir(parents=True)
for source in (ROOT / 'scripts/room').iterdir():
    if source.is_file() and source.suffix in ('.mjs', '.json'):
        shutil.copy2(source, SITE / 'scripts/room' / source.name)

originals = {}
for source in BEFORE.iterdir():
    if source.suffix not in ('.ts', '.astro'):
        continue
    relative = Path('src/pages/room.astro') if source.name == 'room.astro' else Path('src/scripts/room') / source.name
    shutil.copy2(source, SITE / relative)
    originals[str(relative)] = source.read_text()

def replace_once(text, before, after):
    if text.count(before) != 1:
        raise RuntimeError(f'Expected exactly one baseline timing anchor: {before[:100]!r}')
    return text.replace(before, after, 1)

def patch(name, changes):
    relative = Path('src/scripts/room') / name
    text = (SITE / relative).read_text()
    for before, after in changes:
        text = replace_once(text, before, after)
    (SITE / relative).write_text(text)

# Captured before direct HTTP streaming and other runtime policy changes.
for name in ('assets.ts', 'model.ts', 'home-video.ts', 'load-timings.ts'):
    shutil.copy2(INSTRUMENTATION / name, SITE / 'src/scripts/room' / name)

patch('entry.ts', [
    ("import { RoomAssets, type AssetFile } from './assets';", "import { RoomAssets, type AssetFile } from './assets';\nimport { createLoadTimings } from './load-timings';"),
    ("  const params = new URLSearchParams(location.search);", "  const params = new URLSearchParams(location.search);\n  const timing=createLoadTimings();\n  if(params.has('debug')||['localhost','127.0.0.1'].includes(location.hostname))(window as Window & {__roomLoadTimings?:typeof timing.snapshot}).__roomLoadTimings=()=>timing.snapshot();"),
    ("  function setState(value: State, message: string) {", "  function setState(value: State, message: string) {\n    timing.mark('state.'+value);"),
    ("{deferred:files.filter(file=>file.deferred)}", "{deferred:files.filter(file=>file.deferred),timing}"),
    ("    const [, , module] = await Promise.all([assets.preload(), fontReady, import('./experience')]);", "    const endDownloads=timing.start('loading.downloads');\n    const [, , module] = await Promise.all([assets.preload(), fontReady, import('./experience')]);\n    endDownloads();"),
])

patch('lighting.ts', [
    ("import { createWeather } from './weather';", "import { createWeather } from './weather';\nimport { textureBytes } from './texture-budget';"),
    ("  async function loadTexture(path:string,color:boolean,channel:number,key:string) {", "  async function loadTexture(path:string,color:boolean,channel:number,key:string) {\n    const info={url:path,atlas:path.split('/').pop()?.replace(/-(albedo|orm|normal|room|tv|lamp-off)\\.webp$/,'')};\n    const endDecode=assets?.timing?.start('texture.decode',info);"),
    ("    if(map.image instanceof HTMLImageElement)await map.image.decode();", "    if(map.image instanceof HTMLImageElement)await map.image.decode();\n    const image=map.image as {width:number;height:number};\n    endDecode?.('ok',{...info,width:image.width,height:image.height,decodedBytes:image.width*image.height*4,textureBytes:textureBytes(image.width,image.height,4,map.generateMipmaps)});\n    const endQueue=assets?.timing?.start('texture.upload-queue',info);"),
    ("      renderer.initTexture(map);", "      endQueue?.();const endUpload=assets?.timing?.start('texture.upload-submit',info);\n      renderer.initTexture(map);endUpload?.();"),
    ("  const weather = createWeather(await texture(manifest.city ?? '/room/city-night-v1.png', true));", "  const endWeather=assets?.timing?.start('weather.prepare');\n  const weather = createWeather(await texture(manifest.city ?? '/room/city-night-v1.png', true));\n  endWeather?.();"),
    ("  const probeScene = new Scene();", "  const endProbe=assets?.timing?.start('reflection.scene-probe',{size:128});\n  const probeScene = new Scene();"),
    ("  pmrem.dispose();", "  pmrem.dispose();endProbe?.();"),
])

patch('experience.ts', [
    ("    const shaderVariants=lighting.film?3:2;", "    const endShaders=assets.timing?.start('shaders.total');\n    const compile=async(name:string,operation:()=>Promise<unknown>)=>{const end=assets.timing?.start('shaders.'+name);try{await operation();end?.();}catch(error){end?.('error');throw error;}};\n    const shaderVariants=lighting.film?3:2;"),
    ("if(lighting.film){lighting.setHome(0,false);await renderer.compileAsync(scene,camera);await glow.compile();", "if(lighting.film){lighting.setHome(0,false);await compile('beauty',()=>renderer.compileAsync(scene,camera));await compile('glow',()=>glow.compile());"),
    ("    await renderer.compileAsync(scene,camera);", "    await compile('beauty',()=>renderer.compileAsync(scene,camera));"),
    ("    await glow.compile();", "    await compile('glow',()=>glow.compile());"),
    ("    progress({stage:'shaders',completed:shaderVariants,total:shaderVariants});await yieldForLoading(signal);", "    progress({stage:'shaders',completed:shaderVariants,total:shaderVariants});await yieldForLoading(signal);\n    endShaders?.();"),
    ("    host.append(canvas);render();", "    const endFirstFrame=assets.timing?.start('frame.first-submit');\n    host.append(canvas);render();endFirstFrame?.();"),
    ("    render();progress({stage:'frame',completed:2,total:2});", "    const endSecondFrame=assets.timing?.start('frame.second-submit');\n    render();endSecondFrame?.();progress({stage:'frame',completed:2,total:2});"),
])

# Guard against accidentally transplanting the new independent window scene.
assert 'createWindowScene' not in (SITE / 'src/scripts/room/experience.ts').read_text()
assert 'windowScene' not in (SITE / 'src/scripts/room/experience.ts').read_text()
assert 'inspectionMaterial' not in (SITE / 'src/scripts/room/lighting.ts').read_text()
for name in ('weather.ts', 'navigation.ts', 'props.ts', 'quality.ts', 'loading.ts'):
    assert (SITE / 'src/scripts/room' / name).read_bytes() == (BEFORE / name).read_bytes(), name
assert (SITE / 'src/pages/room.astro').read_bytes() == (BEFORE / 'room.astro').read_bytes()

diff = []
for relative, original in originals.items():
    revised = (SITE / relative).read_text()
    diff.extend(difflib.unified_diff(original.splitlines(keepends=True), revised.splitlines(keepends=True), fromfile='before/'+relative, tofile='timed/'+relative))
(BEFORE / 'timing-only.patch').write_text(''.join(diff))
hashes = {str(path.relative_to(SITE)): hashlib.sha256(path.read_bytes()).hexdigest() for path in (SITE / 'src').rglob('*') if path.is_file()}
(BEFORE / 'timed-source-hashes.json').write_text(json.dumps(hashes, indent=2)+'\n')
print(json.dumps({'site':str(SITE),'originalFilesRestored':len(originals),'timingDiff':str(BEFORE/'timing-only.patch'),'note':'Review the timing-only diff; build and preview this private site without replacing the live workspace.'},indent=2))
