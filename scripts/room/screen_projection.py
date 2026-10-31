"""Export the accepted CRT plane in HomeCamera coordinates for the loading OSD."""
import json
from pathlib import Path
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

root = Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(root / '.room-build/study-materials.blend'))
scene = bpy.context.scene
screen = bpy.data.objects['CRT_Screen']
camera = bpy.data.objects['HomeCamera']
corners = []
for x, z in [(-.45, .3325), (.45, .3325), (.45, -.3325), (-.45, -.3325)]:
    p = world_to_camera_view(scene, camera, screen.matrix_world @ Vector((x, -.01, z)))
    corners.append([round(p.x * 1440, 4), round((1 - p.y) * 960, 4)])
data = {'width': 1440, 'height': 960, 'corners': corners}
(root / 'src/scripts/room/screen-projection.json').write_text(json.dumps(data, indent=2) + '\n')
print(json.dumps(data))
