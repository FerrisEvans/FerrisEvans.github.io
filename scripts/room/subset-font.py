#!/usr/bin/env python3
"""Build the locally hosted room UI pixel subset; never install packages.

Requires fontTools. If its optional Brotli module is absent, the repository's
existing Node.js runtime performs only Brotli compression/decompression.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import types

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, default=ROOT / '.room-build/fonts/fusion-pixel-12px-proportional-zh_hans.otf.woff2')
parser.add_argument('--fonttools-path', type=Path, default=os.environ.get('ROOM_FONTTOOLS_PATH'), help='Existing site-packages directory, or set ROOM_FONTTOOLS_PATH; no packages are installed.')
parser.add_argument('--check', action='store_true', help='Check that the installed subset covers current supported UI characters; do not rewrite it.')
args = parser.parse_args()
if args.fonttools_path:
    sys.path.insert(0, str(args.fonttools_path))
if importlib.util.find_spec('fontTools') is None:
    parser.error(f'fontTools is unavailable to {sys.executable}. Select an existing Python environment or pass --fonttools-path /path/to/existing/site-packages. No packages were installed.')

if importlib.util.find_spec('brotli') is None and importlib.util.find_spec('brotlicffi') is None:
    node = shutil.which('node')
    if not node:
        parser.error('WOFF2 needs an existing Brotli module or Node.js. No packages were installed.')
    # fontTools only calls these two one-shot functions. Node ships Brotli in
    # node:zlib; this avoids modifying the machine's Python installation.
    brotli = types.ModuleType('brotli')
    brotli.MODE_GENERIC, brotli.MODE_TEXT, brotli.MODE_FONT = 0, 1, 2

    def codec(data, *, decode=False, mode=0):
        operation = 'brotliDecompressSync' if decode else 'brotliCompressSync'
        script = (
            "const z=require('node:zlib'),fs=require('node:fs');"
            f"process.stdout.write(z.{operation}(fs.readFileSync(0),"
            f"{{params:{{[z.constants.BROTLI_PARAM_MODE]:{mode}}}}}));"
        )
        return subprocess.run([node, '-e', script], input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True).stdout

    brotli.decompress = lambda data: codec(data, decode=True)
    brotli.compress = lambda data, mode=0: codec(data, mode=mode)
    sys.modules['brotli'] = brotli

from fontTools import subset
from fontTools.ttLib import TTFont

source = args.source.resolve()
if not source.is_file():
    parser.error(f'Missing source font: {source}. Download the pinned official release listed in font-source.json.')
node = shutil.which('node')
if not node:
    parser.error('Node.js is required for the shared font character collector. No packages were installed.')
collection = json.loads(subprocess.run(
    [node, str(ROOT / 'scripts/room/font-coverage.mjs'), '--characters'],
    check=True, capture_output=True, text=True,
).stdout)
requested = set(collection['requestedCodepoints'])
metadata = json.loads((ROOT / 'scripts/room/font-source.json').read_text())
source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
if source_hash != metadata['faceSha256']:
    parser.error('Source font hash differs from the pinned official font in font-source.json.')
font = TTFont(source, recalcTimestamp=False)
supported = set(font.getBestCmap())
covered = requested & supported
unsupported = sorted(requested - supported)
destination = ROOT / 'public/fonts/room-pixel-zh.woff2'

if args.check:
    if not destination.is_file():
        parser.error(f'Missing subset: {destination}')
    installed = set(TTFont(destination).getBestCmap())
    missing = sorted(covered - installed)
    print(json.dumps({'requestedCodepoints': len(requested), 'supportedCodepoints': len(covered), 'missingFromSubset': ''.join(map(chr, missing)), 'systemFallbackCharacters': ''.join(map(chr, unsupported))}, ensure_ascii=False, indent=2))
    raise SystemExit(1 if missing else 0)

options = subset.Options()
options.flavor = 'woff2'
options.recalc_timestamp = False
options.name_IDs = ['*']
options.name_legacy = True
options.name_languages = ['*']
options.notdef_glyph = True
options.notdef_outline = True
options.recommended_glyphs = True
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=covered)
subsetter.subset(font)
# Identify the modified subset distinctly while retaining copyright and OFL
# metadata. This font is not advertised as the complete upstream font.
names = {1: 'Mainloop UI Pixel', 2: 'Regular', 3: 'Mainloop UI Pixel subset of Fusion Pixel 2026.10.25', 4: 'Mainloop UI Pixel Regular', 6: 'MainloopUIPixel-Regular', 16: 'Mainloop UI Pixel', 17: 'Regular'}
for record in font['name'].names:
    if record.nameID in names:
        record.string = names[record.nameID].encode(record.getEncoding(), errors='replace')
font.flavor = 'woff2'
destination.parent.mkdir(parents=True, exist_ok=True)
font.save(destination)
result = TTFont(destination, recalcTimestamp=False)
assert covered <= set(result.getBestCmap()), 'Subset unexpectedly dropped supported codepoints'
report = {
    'family': 'Mainloop UI Pixel',
    'upstream': 'Fusion Pixel Font 12px proportional zh-Hans',
    'version': '2026.10.25',
    'license': 'SIL Open Font License 1.1',
    'sourceBytes': source.stat().st_size,
    'sourceSha256': source_hash,
    'subsetBytes': destination.stat().st_size,
    'subsetSha256': hashlib.sha256(destination.read_bytes()).hexdigest(),
    'requestedCodepoints': len(requested),
    'supportedCodepoints': len(covered),
    'systemFallbackCharacters': ''.join(map(chr, unsupported)),
    'sourceFiles': collection['sourceFiles'],
    'unicodeCodepoints': [f'U+{cp:04X}' for cp in sorted(covered)],
}
(destination.parent / 'room-pixel-zh.coverage.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k: v for k, v in report.items() if k not in ('sourceFiles', 'unicodeCodepoints')}, ensure_ascii=False, indent=2))
