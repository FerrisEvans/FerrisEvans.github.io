"""Export only the same physical ink mesh used by materials.py; no GPU render."""
import argparse
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).parent))
from refine_desktop_layout import make_floppy_label

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
ink = bpy.data.materials.new('Desktop label ink')
ink.diffuse_color = (.035, .032, .027, 1)
make_floppy_label(bpy.context.scene, ink)
args.output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(args.output), export_format='GLB', export_extras=True, export_yup=True)
