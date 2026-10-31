#!/usr/bin/env python3
"""Render the approved 48-second film, yielding safely between frames."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
BUILD = ROOT / '.room-build/high-quality/film'

parser = argparse.ArgumentParser()
parser.add_argument('--blender', default=os.environ.get('BLENDER_BINARY') or shutil.which('blender') or '/Applications/Blender.app/Contents/MacOS/Blender')
parser.add_argument('--samples', type=int, default=64)
parser.add_argument('--resume', action='store_true')
parser.add_argument('--encode', action='store_true')
args = parser.parse_args()
BUILD.mkdir(parents=True, exist_ok=True)

for shot in ('train', 'idea', 'world'):
    if (BUILD / 'pause-render').exists():
        print('Film paused; remove pause-render and rerun with --resume.', flush=True)
        sys.exit(0)
    command = [args.blender, '--background', '--python', str(ROOT / 'scripts/room/film/render.py'), '--', '--shot', shot, '--samples', str(args.samples)]
    if args.resume:
        command.append('--resume')
    print('Rendering', shot, flush=True)
    with (BUILD / f'{shot}-full.log').open('a') as log:
        subprocess.run(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, check=True)
    if (BUILD / 'pause-render').exists():
        print('Film yielded the GPU after the current frame.', flush=True)
        sys.exit(0)

if args.encode:
    subprocess.run([sys.executable, str(ROOT / 'scripts/room/film/encode.py')], cwd=ROOT, check=True)
