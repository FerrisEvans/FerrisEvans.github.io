"""Author a static linen relaxation; the website never runs the cloth solver.

Run with Blender --background --factory-startup --python this_file --
--base .room-build/your-candidate/build/study-greybox.blend
--output .room-build/mcp-curtains/cloth-a. Inspect the saved comparison before
accepting its shape data. A regular simulation grid is sampled back onto the
existing nonuniform hem grid, preserving its UVs, topology and pinned header.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import refine_curtains as curtains

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base', type=Path, required=True, help='Actual greybox scene used by materials.py')
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--frames', type=int, default=72)
parser.add_argument('--bending', type=float, default=.08)
parser.add_argument('--mass', type=float, default=.18)
parser.add_argument('--stiffness', type=float, default=60.)
parser.add_argument('--blend', type=float, default=1.)
parser.add_argument('--render', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
out = args.output.resolve()
out.mkdir(parents=True, exist_ok=True)
SIM_ROWS = 97
STRIDE = curtains._SEGMENTS + 1
COUNT = curtains._ROWS * STRIDE


def fingerprint(points):
    return hashlib.sha256(json.dumps([[round(v, 9) for v in p] for p in points],
                                   separators=(',', ':')).encode()).hexdigest()


with bpy.data.libraries.load(str(args.base.resolve()), link=False) as (available, loaded):
    loaded.objects = ['Curtain_Left', 'Curtain_Right']
sources = {}
for obj in loaded.objects:
    if obj is None or obj.type != 'MESH':
        raise ValueError('The base scene must contain both original curtain meshes')
    sources[obj.name] = [tuple(vertex.co) for vertex in obj.data.vertices]
    bpy.data.objects.remove(obj, do_unlink=True)


def interpolate(points, levels, u, v):
    row = next((i for i in range(len(levels)-1) if v <= levels[i+1]), len(levels)-2)
    t = (v-levels[row])/max(1e-12, levels[row+1]-levels[row])
    column = min(STRIDE-2, int(u*(STRIDE-1)))
    s = u*(STRIDE-1)-column
    return tuple((1-t)*((1-s)*points[row*STRIDE+column][a]+s*points[row*STRIDE+column+1][a])
                 +t*((1-s)*points[(row+1)*STRIDE+column][a]+s*points[(row+1)*STRIDE+column+1][a])
                 for a in range(3))


def mesh_object(name, points, faces):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for face in mesh.polygons:
        face.use_smooth = True
    return obj


bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.fps = 24
scene.frame_start = 1
scene.frame_end = args.frames
scene.gravity = (0, 0, -9.81)
faces = [(row*STRIDE+col, row*STRIDE+col+1,
          (row+1)*STRIDE+col+1, (row+1)*STRIDE+col)
         for row in range(SIM_ROWS-1) for col in range(STRIDE-1)]
panels = {}
for side in ('Left', 'Right'):
    points, shell_faces, uvs = curtains._geometry(sources['Curtain_'+side], side)
    front = points[:COUNT]
    levels = [uvs[row*STRIDE][1] for row in range(curtains._ROWS)]
    initial = [interpolate(front, levels, col/(STRIDE-1), row/(SIM_ROWS-1))
               for row in range(SIM_ROWS) for col in range(STRIDE)]
    obj = mesh_object('Sim_'+side, initial, faces)
    pin = obj.vertex_groups.new(name='Pinned header')
    pin.add(list(range((SIM_ROWS-1)*STRIDE, SIM_ROWS*STRIDE)), 1., 'REPLACE')
    cloth = obj.modifiers.new('Offline linen relaxation', 'CLOTH')
    cloth.settings.quality = 8
    cloth.settings.mass = args.mass
    cloth.settings.tension_stiffness = args.stiffness
    cloth.settings.compression_stiffness = args.stiffness
    cloth.settings.shear_stiffness = args.stiffness*.5
    cloth.settings.bending_stiffness = args.bending
    cloth.settings.air_damping = 4.
    cloth.settings.bending_damping = 1.
    cloth.settings.vertex_group_mass = pin.name
    cloth.settings.pin_stiffness = 1.
    cloth.collision_settings.use_collision = False
    cloth.collision_settings.use_self_collision = True
    cloth.collision_settings.self_distance_min = .002
    cloth.collision_settings.collision_quality = 3
    cloth.point_cache.frame_start = 1
    cloth.point_cache.frame_end = args.frames
    panels[side] = (obj, front, levels, initial, points, shell_faces, uvs)

for frame in range(1, args.frames+1):
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    # Force evaluation of both cloth modifiers at every consecutive frame.
    for obj, *_ in panels.values():
        obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh_clear()
    if frame % 12 == 0 or frame == 1:
        print('CLOTH_FRAME', frame, flush=True)

result = {'schema': 1, 'blenderVersion': bpy.app.version_string,
          'sourceBlendSha256': hashlib.sha256(args.base.read_bytes()).hexdigest(),
          'authoring': {'frames': args.frames, 'fps': 24, 'simulationRows': SIM_ROWS,
                        'columns': STRIDE, 'quality': 8, 'mass': args.mass,
                        'bending': args.bending, 'stiffness': args.stiffness,
                        'blend': args.blend, 'gravity': [0, 0, -9.81],
                        'method': 'Blender Cloth; pinned header; sampled static displacement'},
          'panels': {}}
comparison = []
for side, (obj, front, levels, initial, points, shell_faces, uvs) in panels.items():
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    simulated = [tuple(v.co) for v in evaluated.data.vertices]
    displacement = [tuple(b-a for a, b in zip(p, q)) for p, q in zip(initial, simulated)]
    uniform = [row/(SIM_ROWS-1) for row in range(SIM_ROWS)]
    offsets = [interpolate(displacement, uniform, *uv) for uv in uvs[:COUNT]]
    # Exact original header positions also keep all seven window hooks fixed.
    offsets[-STRIDE:] = [(0., 0., 0.)]*STRIDE
    offsets = [[round(x*args.blend, 8) for x in p] for p in offsets]
    relaxed = [tuple(p[a]+d[a] for a in range(3)) for p, d in zip(front, offsets)]
    maximum = [max(abs(p[a]) for p in offsets) for a in range(3)]
    if not all(math.isfinite(v) for p in relaxed for v in p):
        raise RuntimeError('Non-finite cloth result')
    result['panels'][side] = {'sourceSha256': fingerprint(front), 'offsets': offsets,
                             'maxDisplacement': maximum}
    print('CLOTH_RESULT', side, json.dumps(maximum), flush=True)
    body_faces = [face for face in shell_faces if all(i < COUNT for i in face)]
    before = mesh_object(side+' before', front, body_faces)
    after = mesh_object(side+' relaxed', relaxed, body_faces)
    center = (min(p[0] for p in front)+max(p[0] for p in front))*.5
    for item, x in ((before, -.48), (after, .48)):
        item.location.x = x-center
    comparison.append((side, before, after))
    bpy.data.objects.remove(obj, do_unlink=True)

(out/'linen-drape.json').write_text(json.dumps(result, separators=(',', ':'))+'\n')
material = bpy.data.materials.new('Neutral linen comparison')
material.diffuse_color = (.48, .43, .35, 1)
material.use_nodes = True
bsdf = material.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Base Color'].default_value = (.48, .43, .35, 1)
bsdf.inputs['Roughness'].default_value = .82
for _, before, after in comparison:
    for item in (before, after):
        item.data.materials.append(material)
camera_data = bpy.data.cameras.new('Comparison camera')
camera = bpy.data.objects.new('Comparison camera', camera_data)
scene.collection.objects.link(camera)
camera.location = (0, -7, 1.93)
camera.rotation_euler = (Vector((0, .65, 1.93))-camera.location).to_track_quat('-Z', 'Y').to_euler()
camera_data.type = 'ORTHO'
camera_data.ortho_scale = 4.6
scene.camera = camera
light_data = bpy.data.lights.new('Uniform comparison light', 'SUN')
light_data.energy = 2.
light_data.angle = .35
light = bpy.data.objects.new('Uniform comparison light', light_data)
scene.collection.objects.link(light)
light.location = (-3, -2, 4.5)
light.rotation_euler = (Vector((0, .65, 2))-light.location).to_track_quat('-Z', 'Y').to_euler()
scene.world.color = (.18, .18, .18)
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x = 900
scene.render.resolution_y = 1200
scene.render.resolution_percentage = 100
for side, before, after in comparison:
    for other_side, a, b in comparison:
        a.hide_render = b.hide_render = other_side != side
        a.hide_set(other_side != side)
        b.hide_set(other_side != side)
    if args.render:
        scene.render.filepath = str(out/(side.lower()+'-comparison.png'))
        bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'comparison.blend'))
