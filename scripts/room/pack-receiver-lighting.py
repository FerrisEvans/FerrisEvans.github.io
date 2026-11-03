"""Install a receiver-only bake without re-encoding any surface texture."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--receipt', type=Path, required=True)
args = parser.parse_args()
source = args.source.resolve()
base = ROOT / 'public/room/materials'
manifest_path = base / 'manifest.json'
manifest = json.loads(manifest_path.read_text())
baked = json.loads((source / 'manifest.json').read_text())
receipt = json.loads(args.receipt.read_text())
assert set(baked['atlases']) == {'desk', 'equipment'}
assert baked['buildId'] == receipt['buildId']
files = {}

for group in ('desk', 'equipment'):
    for kind in ('room', 'lampOff', 'tv'):
        current = manifest['atlases'][group][kind]
        light = baked['atlases'][group][kind]
        target = base / current['file']
        size = Image.open(target).size
        image = Image.open(source / light['file']).convert('RGBA')
        if image.size != size:
            encoded = np.asarray(image).astype(np.float32) / 255
            linear = encoded[:, :, :3] * encoded[:, :, 3:4] * light['range']
            linear = np.maximum(np.stack([
                np.asarray(Image.fromarray(linear[:, :, i], mode='F').resize(size, Image.Resampling.LANCZOS))
                for i in range(3)
            ], axis=2), 0)
            multiplier = np.clip(np.ceil(np.max(linear, axis=2, keepdims=True) / light['range'] * 255) / 255, 1 / 255, 1)
            encoded = np.concatenate([np.clip(linear / (multiplier * light['range']), 0, 1), multiplier], axis=2)
            image = Image.fromarray(np.rint(encoded * 255).astype(np.uint8))
        image.save(target, format='WEBP', lossless=True, exact=True, method=6)
        assert np.array_equal(np.asarray(image), np.asarray(Image.open(target).convert('RGBA')))
        manifest['atlases'][group][kind] = {**current, **light, 'file': target.name}
        files[target.name] = hashlib.sha256(target.read_bytes()).hexdigest()

manifest['receiverLighting'] = {
    'baseBakeBuildId': manifest['bakeBuildId'],
    'buildId': baked['buildId'],
    'groups': ['desk', 'equipment'],
    'channels': ['room', 'lampOff', 'tv'],
    'sourceReceiptSha256': hashlib.sha256(args.receipt.read_bytes()).hexdigest(),
    'sources': receipt['sources'],
    'files': files,
    'packingScriptSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    'preserved': 'All other irradiance, albedo, roughness and normal maps are unchanged.'
}
manifest['bakeBuildId'] = baked['buildId']
manifest['lighting']['deskShadowExclusions'] = baked['lighting']['deskShadowExclusions']
# Reflection sealing computes the final delivery ID after entry lighting has
# been refreshed. Keep an explicit intermediate ID instead of the old seal.
manifest['buildId'] = hashlib.sha256(json.dumps({'receiver': manifest['receiverLighting'], 'layout': manifest['desktopLayout']}, sort_keys=True).encode()).hexdigest()[:16]
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'bakeBuildId': manifest['bakeBuildId'], 'buildId': manifest['buildId'], 'files': files}, indent=2))
