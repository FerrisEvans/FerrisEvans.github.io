#!/usr/bin/env python3
"""Decode the shipped movie and record frame, transition and asset integrity QA."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
from PIL import Image, ImageChops, ImageDraw, ImageStat

ROOT = Path(__file__).resolve().parents[3]
BUILD = ROOT / '.room-build/high-quality/film'
OUT = ROOT / 'public/room/film'
sys.path.insert(0, str(BUILD / 'tools'))
parser=argparse.ArgumentParser()
parser.add_argument('--build-dir',type=Path,default=BUILD)
parser.add_argument('--output',type=Path,default=OUT)
options=parser.parse_args();BUILD=options.build_dir.resolve();OUT=options.output.resolve()
ffmpeg = os.environ.get('FFMPEG_BINARY') or shutil.which('ffmpeg')
if not ffmpeg:
    import imageio_ffmpeg
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()

manifest = json.loads((OUT / 'manifest.json').read_text())
for name, expected in manifest['files'].items():
    data = (OUT / name).read_bytes()
    assert len(data) == expected['bytes'], name
    assert hashlib.sha256(data).hexdigest() == expected['sha256'], name
movie = OUT / Path(manifest['video']).name
data = movie.read_bytes()
atoms = []
offset = 0
while offset + 8 <= len(data):
    size, kind = struct.unpack_from('>I4s', data, offset)
    if size == 1:
        size = struct.unpack_from('>Q', data, offset + 8)[0]
    elif size == 0:
        size = len(data) - offset
    assert size >= 8
    atoms.append(kind.decode('ascii'))
    offset += size
assert atoms.index('moov') < atoms.index('mdat'), 'MP4 is not fast-start'

probe = subprocess.run([ffmpeg, '-hide_banner', '-i', str(movie), '-f', 'null', '-'], capture_output=True, text=True, check=True)
assert 'Audio:' not in probe.stderr, 'Unexpected audio track'
assert '960x720' in probe.stderr and '24 fps' in probe.stderr
assert 'bt709/bt709/iec61966-2-1' in probe.stderr, 'Colour primaries or transfer tags were lost'
duration = re.search(r'Duration: ([0-9:.]+)', probe.stderr).group(1)
assert duration == '00:00:48.00', duration

# Decode the final compressed asset, not the pre-encode render sequence.
size = (320, 240)
stride = size[0] * size[1] * 3
process = subprocess.Popen([ffmpeg, '-v', 'error', '-i', str(movie), '-vf', 'scale=320:240', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], stdout=subprocess.PIPE)
selected = {0, 48, 144, 240, 336, 383, 384, 432, 528, 624, 720, 767, 768, 816, 912, 1008, 1104, 1151}
images = {}
movement = [[], [], []]
count = 0
previous = None
while True:
    frame = process.stdout.read(stride)
    if not frame:
        break
    assert len(frame) == stride
    image = Image.frombytes('RGB', size, frame)
    if count in selected:
        images[count] = image.copy()
    if previous is not None and count % 384 > 24 and count % 384 < 360:
        movement[count // 384].append(sum(ImageStat.Stat(ImageChops.difference(previous, image)).mean) / 3)
    previous = image
    count += 1
assert process.wait() == 0
assert count == 1152, count
loop_difference = ImageStat.Stat(ImageChops.difference(images[0], images[1151])).mean
assert max(loop_difference) < 1, loop_difference
light = json.loads((OUT / 'night-log-light.json').read_text())
assert light['fps'] == 24 and light['duration'] == 48 and light['colorSpace'] == 'linear-srgb'
assert len(light['frames']) == count
assert all(len(rgb) == 3 and all(0 <= value <= 1 for value in rgb) for rgb in light['frames'])
poster = Image.open(OUT / 'night-log-still.webp')
assert poster.size == (960, 720)

contact = Image.new('RGB', (320 * 6, 266 * 3), '#11191e')
draw = ImageDraw.Draw(contact)
for index, (frame, image) in enumerate(sorted(images.items())):
    x, y = index % 6 * 320, index // 6 * 266
    contact.paste(image, (x, y))
    draw.text((x + 8, y + 245), f'{frame / 24:.2f}s / frame {frame + 1}', fill='#e2dfd1')
contact.save(BUILD / 'full-film-contact.jpg', quality=94)
report = {
    'encodedFrames': count, 'duration': duration, 'dimensions': list(poster.size),
    'fps': 24, 'audioTracks': 0, 'mp4AtomOrder': atoms,
    'colorTags': 'BT.709 primaries/matrix, sRGB transfer, limited YUV range',
    'firstLastMeanRgbDifference': loop_difference,
    'meanSuccessiveFrameChangeByChapter': [sum(changes) / len(changes) for changes in movement],
    'downloadBytes': sum(item['bytes'] for item in manifest['files'].values()) + (OUT / 'manifest.json').stat().st_size,
    'downloadIncludes': ['manifest.json', *manifest['files']],
    'videoBytes': manifest['files'][movie.name]['bytes'],
    'contactSheet': str(BUILD/'full-film-contact.jpg'),
    'limitations': 'Integrity and decoded-frame checks do not establish visual quality or integrated room performance. Review the movie in the production browser.',
}
(BUILD / 'validation.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
