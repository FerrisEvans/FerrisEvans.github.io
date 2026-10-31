"""Stage 2: reproducible, untextured study. No baking or reference-site assets.

Blender coordinates: Z up, window towards +Y. The GLB includes its camera.
Run: Blender --background --factory-startup --python scripts/room/greybox.py
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=ROOT / 'public/room')
parser.add_argument('--build-dir', type=Path, default=ROOT / '.room-build')
options = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT = options.output.resolve()
BUILD = options.build_dir.resolve()
OUT.mkdir(parents=True, exist_ok=True)
BUILD.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.resolution_x = 1440
scene.render.resolution_y = 960
scene.render.resolution_percentage = 100


def material(name, value):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.diffuse_color = (value, value, value, 1)
    shader = m.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = m.diffuse_color
    shader.inputs["Roughness"].default_value = 0.78
    return m


clay = material("Clay", 0.42)
wall = material("Wall clay", 0.55)
desk = material("Desk clay", 0.32)
case = material("Equipment clay", 0.22)
recess = material("Recess clay", 0.08)
glass = material("Screen placeholder", 0.32)
paper = material("Paper clay", 0.72)


def finish(obj, name, mat, bevel=0):
    obj.name = name
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("Edge radius", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod = obj.modifiers.new("Face normals", "WEIGHTED_NORMAL")
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def box(name, location, size, mat=clay, bevel=0.008):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, bevel)


def cylinder(name, location, radius, depth, mat=clay):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=depth, location=location)
    return finish(bpy.context.object, name, mat, 0.004)


def rod(name, start, end, radius, mat=clay):
    start, end = Vector(start), Vector(end)
    obj = cylinder(name, (start + end) / 2, radius, (end - start).length, mat)
    obj.rotation_euler = (end - start).to_track_quat("Z", "Y").to_euler()
    return obj


# Main masses. Keep a clear window aperture; the backdrop is deliberately plain.
box("Room_Floor", (0, 0, -0.05), (9, 10, 0.1), desk)
box("Room_LeftWall", (-3.6, 1, 2.2), (0.15, 8, 4.4), wall)
box("Room_RightWall", (4.2, 1, 2.2), (0.15, 8, 4.4), wall)
box("Window_WallBelow", (-0.3, 1.12, 0.575), (7.2, 0.16, 1.15), wall)
box("Window_LeftPier", (-3.05, 1.12, 2.7), (1.3, 0.16, 3.5), wall)
box("Window_RightPier", (2.74, 1.12, 2.7), (1.9, 0.16, 3.5), wall)
box("Window_Backdrop", (-0.3, 3.8, 2.5), (9, 0.1, 5), wall, 0)
for x in (-2.25, -0.24, 1.75):
    box("Window_Upright", (x, 1.0, 2.53), (0.10, 0.17, 2.65))
for z in (1.23, 3.05, 3.83):
    box("Window_Rail", (-0.25, 1.0, z), (4.1, 0.17, 0.09))
box("Window_Sill", (-0.25, 0.86, 1.18), (4.24, 0.43, 0.075))
rod("Window_Handle", (-0.16, 0.89, 2.71), (-0.16, 0.89, 2.90), 0.018)

# Curtain silhouette, without simulating fabric or adding texture detail.
for side, x0, width in (("Left", -2.77, 0.64), ("Right", 2.15, 0.72)):
    vertices, faces = [], []
    segments = 24
    rows = 21
    for row in range(rows):
        z = 0.98 + (4.4 - 0.98) * row / (rows - 1)
        for i in range(segments + 1):
            x = x0 + width * (i / segments - 0.5)
            y = 0.70 + math.cos(i / segments * math.pi * 8) * 0.065
            vertices.append((x, y, z + (0.018 * math.cos(i) if row == 0 else 0)))
    for row in range(rows - 1):
        for i in range(segments):
            a = row * (segments + 1) + i
            faces.append((a, a + 1, a + segments + 2, a + segments + 1))
    mesh = bpy.data.meshes.new(f"{side} curtain mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(f"Curtain_{side}", mesh)
    scene.collection.objects.link(obj)
    finish(obj, obj.name, wall)
    for polygon in mesh.polygons:
        polygon.use_smooth = True

architecture = set(scene.objects)
box("Desk_Top", (0, -0.0125, 0.765), (6.4, 1.875, 0.11), desk, 0.018)
box("Desk_Return", (3.25, -0.55, 0.765), (1.1, 2.95, 0.11), desk, 0.018)
for x in (-2.7, 2.7):
    for y in (-0.8, 0.65):
        box("Desk_Leg", (x, y, 0.4175), (0.11, 0.11, 0.565), desk)

# CRT, VCR and screen are separate nodes for subsequent CanvasTexture work.
box("VCR_Body", (0.01, -0.03, 0.95), (1.43, 0.91, 0.26), case, 0.018)
box("VCR_Front", (0.01, -0.49, 0.95), (1.39, 0.025, 0.23), case)
box("VCR_TapeSlot", (-0.22, -0.507, 0.985), (0.65, 0.012, 0.055), recess)
box("VCR_Display", (0.45, -0.51, 0.98), (0.24, 0.012, 0.07), glass)
box("CRT_Case", (0, 0.03, 1.64), (1.16, 0.66, 1.12), case, 0.035)
box("CRT_Recess", (0, -0.309, 1.77), (0.98, 0.032, 0.75), recess, 0.05)
box("CRT_Screen", (0, -0.33, 1.77), (0.90, 0.020, 0.665), glass, 0.045)
box("CRT_ControlPanel", (0, -0.312, 1.245), (1.04, 0.02, 0.22), case)
for i in range(6):
    box("CRT_Button", (-0.34 + i * 0.088, -0.335, 1.25), (0.06, 0.025, 0.045), clay, 0.003)
box("CRT_Power", (-.45, -.335, 1.25), (.048, .025, .040), clay, .003)
for x in (0.29, 0.40, 0.49):
    knob = cylinder("CRT_Knob", (x, -0.35, 1.25), 0.025, 0.03, clay)
    knob.rotation_euler.x = math.pi / 2

# Left lamp: wide low base, slender stem, tilted conical shade.
cylinder("Lamp_Base", (-1.62, -0.15, 0.85), 0.24, 0.06)
rod("Lamp_Stem", (-1.62, -0.15, 0.88), (-1.46, 0.01, 1.96), 0.019)
bpy.ops.mesh.primitive_cone_add(vertices=40, radius1=0.27, radius2=0.105,
                                depth=0.33, location=(-1.45, 0.01, 2.05))
shade = finish(bpy.context.object, "Lamp_Shade", clay, 0.012)
shade.rotation_euler.y = 0.3

# A few supporting masses establish foreground depth, without small-prop detail.
cylinder("Mug_Body", (-0.70, -0.81, 1.025), 0.135, 0.32, paper)
cylinder("Mug_Opening", (-0.70, -0.81, 1.189), 0.114, 0.008, recess)
bpy.ops.mesh.primitive_torus_add(major_radius=0.092, minor_radius=0.022,
                                major_segments=24, minor_segments=10,
                                location=(-0.865, -0.81, 1.04), rotation=(math.pi / 2, 0, 0))
finish(bpy.context.object, "Mug_Handle", paper)
for obj in scene.objects:
    if obj.name.startswith("Mug_"):
        obj.location.z -= .045
pad = box("Work_Notepad", (1.46, -0.58, 0.845), (1.05, 0.66, 0.045), paper)
pad.rotation_euler.z = -0.11
book = box("Desk_Book", (-1.42, -0.63, 0.85), (0.70, 0.55, 0.05), paper)
book.rotation_euler.z = -0.1
remote = box("Desk_Remote", (0.69, -0.82, 0.865), (0.62, 0.19, 0.07), case)
remote.rotation_euler.z = -0.05

# Secondary interactive props occupy the existing gaps in the composition.
# Keep the roots independent so their details can follow runtime transforms.
phone = box("Retro_Phone", (2.49, 0.31, 0.88), (0.48, 0.50, 0.12), paper, 0.025)
for vertex in phone.data.vertices:
    if vertex.co.z > 0:
        vertex.co.z += vertex.co.y * 0.12
calculator = box("Desk_Calculator", (-1.55, -0.72, 0.905), (0.28, 0.38, 0.06), case, 0.014)
calculator.rotation_euler.z = -0.12
cd = cylinder("Desk_CD", (2.40, -0.68, 0.85), 0.175, 0.06, case)
cd.rotation_euler.z = 0.10

# Reference interaction props, fitted into gaps without moving the hero masses.
pager = box("Desk_Pager", (.86, -.19, .855), (.23, .13, .07), case, .012)
pager.rotation_euler.z = .08
floppy = box("Desk_Floppy", (2.24, -.27, .826), (.23, .245, .012), case, .004)
floppy.rotation_euler.z = -.15
bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=.006, depth=.40, location=(2.08, -.58, .826))
pencil = finish(bpy.context.object, "Desk_Pencil", clay, .0005)
pencil.rotation_euler = (math.pi / 2, 0, .08)
rolodex = box("Desk_Rolodex", (-1.67, .37, .842), (.40, .30, .044), case, .018)
walkman = box("Desk_Walkman", (2.30, -.03, .98), (.24, .12, .32), paper, .020)
clock = box("Desk_Clock", (2.48, .70, .95), (.22, .12, .26), case, .025)
card = box("Desk_ReplyCard", (-1.18, -.70, .876), (.235, .19, .002), paper, .0008)
card.rotation_euler.z = -.10
# The first lens rim is the independently named root; the second rim, bridge
# and folded temples are attached in the material pass, with no opaque lens.
bpy.ops.mesh.primitive_torus_add(major_radius=.048, minor_radius=.003,
                                major_segments=40, minor_segments=6,
                                location=(2.18, -.90, .826))
finish(bpy.context.object, "Desk_Glasses", case)

# Two VHS stacks, sized as compositions rather than piles of tiny props.
for stack, x, y, count, step in (("A", 1.10, 0.12, 5, 0.092), ("B", 1.82, 0.30, 7, 0.080)):
    for i in range(count):
        obj = box(f"VHS_{stack}_{i + 1}", (x + (i % 3 - 1) * 0.018, y, 0.82 + step / 2 + i * step),
                  (0.60 if stack == "A" else 0.72, 0.36, step - 0.007), paper if i % 3 == 1 else clay, 0.004)
        obj.rotation_euler.z = (i % 3 - 1) * 0.04

# Plant occupies the far-left edge; individual leaves remain low-detail silhouettes.
cylinder("Plant_Pot", (-2.20, 0.15, 1.10), 0.25, 0.55)
for i in range(7):
    angle = i * 2.4
    tip = Vector((-2.20 + math.cos(angle) * 0.26, 0.15 + math.sin(angle) * 0.16, 1.69 + (i % 3) * 0.24))
    rod("Plant_Stem", (-2.20, 0.15, 1.37), tip, 0.008)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, location=tip)
    leaf = bpy.context.object
    leaf.scale = (0.13, 0.025, 0.30)
    leaf.rotation_euler.y = (i % 3 - 1) * 0.6
    leaf.rotation_euler.z = angle
    finish(leaf, "Plant_Leaf", clay)

# The computer lives on the right return of the desk, outside the main focal area.
box("Computer_Base", (2.91, 0.02, 0.94), (0.82, 0.69, 0.24), clay, 0.02)
box("Computer_Monitor", (2.91, 0.17, 1.43), (0.77, 0.55, 0.74), paper, 0.04)
box("Computer_Recess", (2.91, -0.115, 1.47), (0.64, 0.025, 0.53), recess, 0.04)
box("Computer_Screen", (2.91, -0.132, 1.47), (0.56, 0.018, 0.43), glass, 0.03)
box("Computer_Keyboard", (2.91, -0.49, 0.855), (0.77, 0.29, 0.06), paper)
for obj in scene.objects:
    if obj.name.startswith("Computer_"):
        obj.location.x += 0.39

# Fit the foreground independently of the already aligned window and camera.
assembly = bpy.data.objects.new("DeskAssembly", None)
scene.collection.objects.link(assembly)
assembly.location.z = -0.135
for obj in list(scene.objects):
    if obj not in architecture and obj.type == "MESH":
        if obj.name.startswith("CRT_"):
            obj.location.z = 1.08 + (obj.location.z - 1.08) * 1.055
            obj.scale.z *= 1.055
        obj.parent = assembly

camera_data = bpy.data.cameras.new("HomeCamera")
camera = bpy.data.objects.new("HomeCamera", camera_data)
scene.collection.objects.link(camera)
camera.location = (0.078, -5.43, 2.29)
camera.rotation_euler = Vector((0, 1, -math.tan(0.09))).to_track_quat("-Z", "Y").to_euler()
camera_data.lens = 40
camera_data.sensor_width = 36
camera_data.sensor_fit = "HORIZONTAL"
scene.camera = camera
bpy.context.view_layer.update()

# Exact projection metadata lets browser screenshots be compared with this camera.
def projected(point):
    result = world_to_camera_view(scene, camera, Vector(point))
    return [round(result.x, 5), round(1 - result.y, 5)]

anchors = {
    "tvTopLeft": (-0.58, -0.30, 1.08 + 1.12 * 1.055 - 0.135),
    "tvBottomRight": (0.58, -0.30, 1.08 - 0.135),
    "screenCenter": (0, -0.35, 1.08 + 0.69 * 1.055 - 0.135),
    "windowLeft": (-2.25, 0.915, 2.5),
    "windowRight": (1.75, 0.915, 2.5),
    "windowCrossbar": (-0.24, 0.915, 3.05),
    "windowBottom": (-0.24, 0.915, 1.23),
    "lampBase": (-1.62, -0.15, 0.88 - 0.135),
    "deskFront": (0, -0.95, 0.82 - 0.135),
}
metadata = {"stage": "greybox", "viewport": [1440, 960],
            "camera": "HomeCamera", "anchors": {key: projected(value) for key, value in anchors.items()}}
(OUT / "greybox.json").write_text(json.dumps(metadata, indent=2) + "\n")
bpy.ops.wm.save_as_mainfile(filepath=str(BUILD / "study-greybox.blend"))
bpy.ops.export_scene.gltf(filepath=str(OUT / "greybox.glb"), export_format="GLB",
                          export_cameras=True, export_extras=True, export_yup=True)
print("GREYBOX", json.dumps(metadata), flush=True)
print("GLB_BYTES", (OUT / "greybox.glb").stat().st_size, flush=True)
