"""Stage 3: PBR surfaces + separate Cycles room/white-TV irradiance atlases.

Loads the accepted greybox; never changes its camera. Pass --draft for a fast
pipeline check, --render-only to inspect physical lighting before baking.
"""
import argparse
import json
import math
import sys
import struct
import zlib
from contextlib import contextmanager
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).parent))
from surfaces import curve_crt_screen
from refine_lamp import refine_lamp
from aging import age_wood, age_plastic, age_paper
from refine_geometry import refine_geometry
from refine_curtains import refine_curtains, linen_material
from refine_plant import refine_plant
from refine_room import refine_room
from refine_window import refine_window
from preserve_architecture_uv import preserve_architecture_uv
from refine_desk import refine_desk, repair_back_wall
from preserve_props_uv import preserve_props_uv
from refine_ceramic import refine_ceramic
from refine_equipment import refine_equipment
from refine_foliage import refine_foliage
from refine_paper import refine_paper
from refine_tapes import refine_tapes
from refine_accessories import refine_accessories
from refine_physical import refine_physical

ROOT = Path(__file__).resolve().parents[2]
args = argparse.ArgumentParser()
args.add_argument("--draft", action="store_true")
args.add_argument("--render-only", action="store_true")
args.add_argument("--skip-render", action="store_true")
args.add_argument('--geometry-only', action='store_true')
args.add_argument('--light-only-atlases', help='Comma-separated receiver atlases; keeps geometry and material channels unchanged')
args.add_argument('--output', type=Path, default=ROOT / 'public/room/materials')
args.add_argument('--build-dir', type=Path, default=ROOT / '.room-build')
args.add_argument('--base', type=Path, default=ROOT / '.room-build/study-greybox.blend')
args.add_argument('--city', type=Path, default=ROOT / 'public/room/city-night-v3.png')
args.add_argument('--build-id', default='development')
options = args.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
OUT, BUILD = options.output.resolve(), options.build_dir.resolve()
OUT.mkdir(parents=True, exist_ok=True)
BUILD.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(options.base.resolve()))
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 12 if options.draft else 48
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 6
scene.cycles.diffuse_bounces = 4
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "METAL"
prefs.get_devices()
for device in prefs.devices:
    device.use = device.type == "METAL"
if not any(device.type == "METAL" for device in prefs.devices):
    raise RuntimeError("Metal device unavailable; refusing an unexpectedly slow bake")
scene.cycles.device = "GPU"
scene.render.bake.margin = 12
scene.world.use_nodes = True
world = scene.world.node_tree.nodes.get("Background")
world.inputs["Color"].default_value = (0.19, 0.25, 0.38, 1)
world.inputs["Strength"].default_value = 0.18
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = 0


def mat(name, color, roughness=0.6, metallic=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Roughness"].default_value = roughness
    p.inputs["Metallic"].default_value = metallic
    m.diffuse_color = (*color, 1)
    return m


def textured(name, low, high, scale, roughness=0.6, bump=0.05, metallic=0):
    m = mat(name, low, roughness, metallic)
    n, links = m.node_tree.nodes, m.node_tree.links
    p = n.get("Principled BSDF")
    coords = n.new("ShaderNodeNewGeometry")
    vector = n.new("ShaderNodeVectorMath")
    vector.operation = "MULTIPLY"
    vector.inputs[1].default_value = scale
    links.new(coords.outputs["Position"], vector.inputs[0])
    noise = n.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 3
    noise.inputs["Detail"].default_value = 3
    noise.inputs["Roughness"].default_value = 0.7
    links.new(vector.outputs[0], noise.inputs["Vector"])
    ramp = n.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.20
    ramp.color_ramp.elements[0].color = (*low, 1)
    ramp.color_ramp.elements[1].position = 0.80
    ramp.color_ramp.elements[1].color = (*high, 1)
    links.new(noise.outputs["Fac"], ramp.inputs[0])
    links.new(ramp.outputs[0], p.inputs["Base Color"])
    rough = n.new("ShaderNodeMapRange")
    rough.inputs["To Min"].default_value = roughness * .86
    rough.inputs["To Max"].default_value = min(roughness * 1.14, 1)
    links.new(noise.outputs["Fac"], rough.inputs["Value"])
    links.new(rough.outputs["Result"], p.inputs["Roughness"])
    micro = n.new("ShaderNodeBump")
    micro.inputs["Strength"].default_value = bump
    micro.inputs["Distance"].default_value = 0.005
    links.new(noise.outputs["Fac"], micro.inputs["Height"])
    links.new(micro.outputs[0], p.inputs["Normal"])
    return m


wood = mat("Oiled walnut", (.17,.08,.03), .44)
# Independently authored, flat-lit grain. One complete map covers the main
# board; its front edge samples the same material along the board's thickness.
wn, wl = wood.node_tree.nodes, wood.node_tree.links
wp = wn.get('Principled BSDF')
coords = wn.new('ShaderNodeNewGeometry')
normal = wn.new('ShaderNodeSeparateXYZ'); wl.new(coords.outputs['Normal'],normal.inputs[0])
top_weight = wn.new('ShaderNodeMath'); top_weight.operation='ABSOLUTE'; wl.new(normal.outputs['Z'],top_weight.inputs[0])
def wood_coordinate(scale, offset):
    multiply=wn.new('ShaderNodeVectorMath');multiply.operation='MULTIPLY';multiply.inputs[1].default_value=scale
    wl.new(coords.outputs['Position'],multiply.inputs[0])
    add=wn.new('ShaderNodeVectorMath');add.operation='ADD';add.inputs[1].default_value=offset
    wl.new(multiply.outputs[0],add.inputs[0]);return add.outputs[0]
top_uv=wood_coordinate((1/6.4,1/1.875,0),(.5,.95/1.875,0))
# Swap Y/Z so grain on the desk's front does not collapse to one pixel row.
edge_axes=wn.new('ShaderNodeSeparateXYZ');wl.new(coords.outputs['Position'],edge_axes.inputs[0])
edge=wn.new('ShaderNodeCombineXYZ');wl.new(edge_axes.outputs['X'],edge.inputs['X']);wl.new(edge_axes.outputs['Z'],edge.inputs['Y'])
edge_scale=wn.new('ShaderNodeVectorMath');edge_scale.operation='MULTIPLY';edge_scale.inputs[1].default_value=(1/6.4,-1.2,0);wl.new(edge.outputs[0],edge_scale.inputs[0])
edge_offset=wn.new('ShaderNodeVectorMath');edge_offset.operation='ADD';edge_offset.inputs[1].default_value=(.5,1.18,0);wl.new(edge_scale.outputs[0],edge_offset.inputs[0])
blend=wn.new('ShaderNodeMixRGB');wl.new(top_weight.outputs[0],blend.inputs[0]);wl.new(edge_offset.outputs[0],blend.inputs[1]);wl.new(top_uv,blend.inputs[2])
grain=wn.new('ShaderNodeTexImage');grain.image=bpy.data.images.load(str(ROOT/'public/room/walnut-grain-v1.png'));grain.extension='REPEAT'
wl.new(blend.outputs[0],grain.inputs['Vector']);wl.new(grain.outputs['Color'],wp.inputs['Base Color'])
height=wn.new('ShaderNodeRGBToBW');wl.new(grain.outputs['Color'],height.inputs[0])
rough=wn.new('ShaderNodeMapRange');rough.inputs['From Min'].default_value=.03;rough.inputs['From Max'].default_value=.30
rough.inputs['To Min'].default_value=.45;rough.inputs['To Max'].default_value=.56;wl.new(height.outputs[0],rough.inputs['Value']);wl.new(rough.outputs[0],wp.inputs['Roughness'])
grain_bump=wn.new('ShaderNodeBump');grain_bump.inputs['Strength'].default_value=.08;grain_bump.inputs['Distance'].default_value=.001
wl.new(height.outputs[0],grain_bump.inputs['Height']);wl.new(grain_bump.outputs[0],wp.inputs['Normal'])
frame = textured("Old oak", (0.13, 0.070, 0.025), (0.30, 0.19, 0.083), (22, 25, 1.5), 0.62, 0.05)
horizontal_oak = textured('Sash oak along horizontal timber', (.12,.075,.032), (.22,.15,.075), (.65,38,38), .57, .025)
vertical_oak = textured('Jamb oak along vertical timber', (.12,.075,.032), (.22,.15,.075), (38,38,.65), .57, .025)
plaster = textured("Warm plaster", (0.29, 0.255, 0.20), (0.37, 0.32, 0.25), (70, 70, 70), 0.95, 0.08)
cloth = linen_material()
abs_plastic = textured("Charcoal ABS", (0.018, 0.020, 0.022), (0.040, 0.044, 0.046), (240, 240, 240), 0.39, 0.035)
crt_plastic = textured("Graphite grey molded ABS", (.021, .023, .024), (.043, .047, .047), (210, 210, 210), .48, .012, .025)
black = mat("Black recess", (0.003, 0.0035, 0.004), 0.68)
copper = textured("Copper enamel", (0.23, 0.057, 0.026), (0.37, 0.123, 0.062), (70, 70, 70), 0.25, 0.005, 0.72)
brass = mat("Brushed brass", (0.26, 0.15, 0.055), 0.36, 1.0)
ivory = mat("Glazed stoneware", (0.73, 0.69, 0.57), 0.19)
coffee = mat("Coffee", (0.018, 0.009, 0.004), 0.12)
paper = textured("Paper fibres", (0.63, 0.56, 0.38), (0.79, 0.73, 0.55), (65, 65, 65), 0.92, 0.035)
label_paper = mat("Tape label paper", (0.76, 0.72, 0.59), 0.86)
terracotta = textured("Terracotta", (0.12, 0.050, 0.025), (0.24, 0.12, 0.064), (100, 100, 100), 0.84, 0.08)
leaf_mat = textured("Leaves", (0.012, 0.036, 0.009), (0.055, 0.14, 0.025), (22, 5, 2), 0.44, 0.03)
computer = textured("Aged ivory ABS", (0.48, 0.43, 0.32), (0.57, 0.52, 0.40), (200, 200, 200), 0.45, 0.02)
cd_metal = textured("CD player satin aluminium", (.30, .32, .32), (.39, .41, .40), (2, 150, 90), .31, .008, .64)
floppy_plastic = textured("Archive disk blue ABS", (.020, .053, .082), (.031, .072, .110), (180, 180, 180), .48, .012)
pencil_enamel = mat("Pencil ochre lacquer", (.38, .15, .035), .33)
glasses_metal = mat("Spectacle dark nickel", (.075, .085, .08), .28, .72)
ink = mat("Printed ink", (0.025, 0.030, 0.023), 0.8)
screen_mat = mat("TV test screen", (0.003, 0.008, 0.03), 0.15)
screen_shader = screen_mat.node_tree.nodes.get("Principled BSDF")
screen_shader.inputs["Emission Color"].default_value = (0.025, 0.09, 0.55, 1)
screen_shader.inputs["Emission Strength"].default_value = 0.9
age_wood(wood)
for plastic in (abs_plastic, crt_plastic):
    age_plastic(plastic)
age_plastic(computer, light=True)
age_paper(paper)
age_paper(label_paper)


def assign(obj, material):
    obj.data.materials.clear()
    obj.data.materials.append(material)


for obj in list(scene.objects):
    if obj.type != "MESH":
        continue
    name = obj.name
    m = abs_plastic
    if name.startswith("CRT_"):
        m = crt_plastic
    if name.startswith("Room_") or name.startswith("Window_"):
        m = plaster
    if name.startswith(("Window_Upright", "Window_Rail", "Window_Sill")):
        m = frame
    if name.startswith("Curtain_"):
        m = cloth
    if name.startswith(("Desk_Top", "Desk_Return", "Desk_Leg", "Room_Floor")):
        m = wood
    if name.startswith(("Lamp_Base", "Lamp_Shade")):
        m = copper
    if name.startswith(("Lamp_Stem", "Window_Handle")):
        m = brass
    if name.startswith("Mug_"):
        m = ivory if name != "Mug_Opening" else coffee
    if name.startswith(("Desk_Book", "Work_Notepad")):
        m = paper
    if name.startswith("Plant_"):
        m = terracotta if name == "Plant_Pot" else leaf_mat
        if name.startswith("Plant_Leaf"):
            for polygon in obj.data.polygons:
                polygon.use_smooth = True
    if name.startswith("Computer_"):
        m = black if "Recess" in name or "Screen" in name else computer
    if name == "Retro_Phone":
        m = computer
    if name == "Desk_Walkman":
        m = computer
    if name == "Desk_ReplyCard":
        m = paper
    if name == "Desk_Floppy":
        m = floppy_plastic
    if name == "Desk_Pencil":
        m = pencil_enamel
    if name == "Desk_Glasses":
        m = glasses_metal
    if name == "Desk_CD":
        m = cd_metal
    if name in ("CRT_Recess", "VCR_TapeSlot"):
        m = black
    if name == "CRT_Screen":
        m = screen_mat
    assign(obj, m)

lamp_copper = textured("Lamp satin spun bronze", (.23,.075,.035), (.30,.115,.058), (140,140,16), .30, .002, .85)
lamp_base = textured("Lamp satin enamel base", (.18,.055,.034), (.21,.075,.046), (110,110,110), .48, .002, .18)
lamp_brass = mat("Lamp satin brass tube", (.24,.16,.080), .31, .85)
lining = mat("Lamp warm ivory lining", (.72,.61,.45), .64)
lamp_bulb_material = mat("Lamp frosted glass", (.85,.78,.61), .48)
lamp_socket = mat("Lamp socket aged brass", (.09,.063,.028), .42, .65)
shade, lamp_bottom, lamp_bulb, shade_bounds = refine_lamp(scene, {
    'shade':lamp_copper, 'base':lamp_base, 'stem':lamp_brass,
    'lining':lining, 'bulb':lamp_bulb_material, 'socket':lamp_socket,
})
curve_crt_screen(scene)
stem = bpy.data.objects['Lamp_Stem']
for polygon in stem.data.polygons:
    if len(polygon.vertices) == 4:
        polygon.use_smooth = True
handle = bpy.data.objects['Mug_Handle']
for polygon in handle.data.polygons:
    polygon.use_smooth = True


def text_object(name, body, location, size, material, parent=None, rotation=(math.pi / 2, 0, 0), align="LEFT"):
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = body
    curve.align_x = align
    curve.size = size
    curve.extrude = 0.00015
    obj = bpy.data.objects.new(name, curve)
    scene.collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    obj.rotation_euler = rotation
    obj.data.materials.append(material)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    obj["surface_role"] = "print"
    return obj


def label_box(name, location, dimensions, material, parent):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    obj.location = location
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, material)
    return obj


def detail_box(name, location, dimensions, material, parent):
    obj = label_box(name, location, dimensions, material, parent)
    bevel = obj.modifiers.new("Manufactured edge", "BEVEL")
    bevel.width = min(dimensions) * .20
    bevel.segments = 2
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return obj


def detail_cylinder(name, location, radius, depth, material, parent):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=radius, depth=depth)
    obj = bpy.context.object
    obj.name, obj.parent, obj.location = name, parent, location
    assign(obj, material)
    mod = obj.modifiers.new("Soft machined edge", "BEVEL")
    mod.width, mod.segments = min(.003, depth * .2), 2
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def detail_wire(name, points, radius, material, parent):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions, curve.bevel_depth, curve.bevel_resolution = "3D", radius, 2
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for target, point in zip(spline.points, points):
        target.co = (*point, 1)
    obj = bpy.data.objects.new(name, curve)
    scene.collection.objects.link(obj)
    obj.parent = parent
    curve.materials.append(material)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    return obj


# A corded telephone, small calculator and portable CD player provide the
# reference's secondary interaction silhouettes without displacing hero props.
phone = bpy.data.objects["Retro_Phone"]
handset = detail_box("Retro_Phone_Handset", (.146, .015, .153), (.108, .37, .065), computer, phone)
for y in (-.17, .17):
    detail_box("Retro_Phone_Earpiece", (0, y, -.012), (.125, .105, .075), computer, handset)
    detail_box("Retro_Phone_Cradle", (.146, y, .086 + y * .12), (.070, .050, .035), abs_plastic, phone)
    for i in range(5):
        detail_box("Retro_Phone_Grille", (-.035 + i * .017, y, .027), (.003, .055, .002), black, handset)
for row in range(4):
    for col in range(3):
        x, y = -.135 + col * .061, -.16 + row * .068
        key = detail_box("Retro_Phone_Key", (x, y, .071 + y * .12), (.045, .050, .015), ivory, phone)
        key.rotation_euler.x = .12
        character = "123456789*0#"[row * 3 + col]
        text_object("Retro_Phone_Print_Key", character, (-.012, -.012, .008), .022, ink, key, (0, 0, 0))
detail_box("Retro_Phone_Label", (-.073, .17, .082), (.20, .065, .003), label_paper, phone)
text_object("Retro_Phone_Print", "LINE 01", (-.159, .156, .085), .014, ink, phone, (0, 0, 0))
coil = []
for i in range(301):
    t = i / 300
    angle = t * math.tau * 25
    coil.append((.26 + .018 * math.cos(angle), -.14 + .32 * t, .027 + .018 * math.sin(angle)))
detail_wire("Retro_Phone_Cord", coil, .0035, computer, phone)

calculator = bpy.data.objects["Desk_Calculator"]
lcd = mat("Calculator LCD", (.14, .19, .115), .36)
detail_box("Desk_Calculator_DisplayBezel", (0, .124, .032), (.238, .076, .012), black, calculator)
detail_box("Desk_Calculator_Display", (0, .124, .039), (.215, .054, .003), lcd, calculator)
text_object("Desk_Calculator_Print_Digits", "0.000", (.018, .106, .041), .030, ink, calculator, (0, 0, 0))
solar = mat("Calculator solar cells", (.052, .026, .019), .28, .15)
detail_box("Desk_Calculator_Solar", (-.061, .062, .033), (.10, .025, .004), solar, calculator)
for x in (-.092, -.068, -.044):
    detail_box("Desk_Calculator_SolarDivider", (x, .062, .036), (.0015, .023, .001), brass, calculator)
characters = ("MC", "MR", "C", "/", "7", "8", "9", "x", "4", "5", "6", "-", "1", "2", "3", "+", "0", ".", "%", "=")
for row in range(5):
    for col in range(4):
        key = detail_box("Desk_Calculator_Key", (-.094 + col * .063, .015 - row * .039, .039), (.047, .029, .016), computer if col < 3 else copper, calculator)
        text_object("Desk_Calculator_Print_Key", characters[row * 4 + col], (-.012, -.009, .009), .017, ink, key, (0, 0, 0))

cd = bpy.data.objects["Desk_CD"]
detail_cylinder("Desk_CD_Seam", (0, 0, .025), .169, .009, black, cd)
lid = detail_cylinder("Desk_CD_Lid", (0, 0, .035), .163, .014, cd_metal, cd)
detail_cylinder("Desk_CD_Window", (0, .023, .043), .10, .003, black, cd)
disc = mat("CD satin disc", (.29, .34, .36), .24, .82)
detail_cylinder("Desk_CD_Disc", (0, .023, .046), .085, .002, disc, cd)
detail_cylinder("Desk_CD_Hub", (0, .023, .048), .018, .004, black, cd)
detail_box("Desk_CD_Display", (0, -.113, .045), (.088, .027, .004), lcd, cd)
text_object("Desk_CD_Print_Digits", "01  00:00", (-.040, -.120, .048), .014, ink, cd, (0, 0, 0))
for i in range(3):
    detail_cylinder("Desk_CD_Button", (-.058 + i * .058, -.143, .045), .012, .007, abs_plastic, cd)


# The remaining reference hotspots have their own complete naming prefixes.
pager = bpy.data.objects["Desk_Pager"]
detail_box("Desk_Pager_DisplayBezel", (-.026, .006, .036), (.155, .091, .006), black, pager)
detail_box("Desk_Pager_LCD", (-.026, .006, .040), (.130, .064, .003), lcd, pager)
text_object("Desk_Pager_Print_Digits", "01  00:01", (-.083, -.004, .043), .018, ink, pager, (0, 0, 0))
for y in (-.027, .027):
    detail_box("Desk_Pager_Button", (.084, y, .039), (.026, .027, .011), computer, pager)
detail_box("Desk_Pager_Clip", (0, .070, -.005), (.14, .022, .060), abs_plastic, pager)

floppy = bpy.data.objects["Desk_Floppy"]
detail_box("Desk_Floppy_Label", (0, -.040, .0067), (.180, .133, .001), label_paper, floppy)
text_object("Desk_Floppy_Print", "FIELD NOTES", (-.077, -.025, .0077), .014, ink, floppy, (0, 0, 0))
for y in (-.05, -.075):
    detail_box("Desk_Floppy_LabelRule", (0, y, .0076), (.145, .0015, .0006), ink, floppy)
detail_box("Desk_Floppy_ReadSlot", (.026, .076, .0067), (.045, .065, .001), black, floppy)
shutter = detail_box("Desk_Floppy_Shutter", (-.025, .079, .009), (.132, .075, .003), cd_metal, floppy)
detail_box("Desk_Floppy_ShutterOpening", (.008, .079, .011), (.034, .056, .001), black, floppy)
for x in (-.093, .093):
    detail_box("Desk_Floppy_WriteProtect", (x, .089, .0068), (.018, .026, .0015), black, floppy)
detail_box("Desk_Floppy_EdgeSeam", (0, -.123, 0), (.194, .0015, .002), black, floppy)

pencil = bpy.data.objects["Desk_Pencil"]
raw_wood = mat("Pencil exposed cedar", (.48, .28, .12), .68)
bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=.006, radius2=.0009, depth=.032)
tip = bpy.context.object
tip.name, tip.parent, tip.location = "Desk_Pencil_WoodTip", pencil, (0, 0, .216)
assign(tip, raw_wood)
bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=.0015, radius2=.00015, depth=.009)
tip = bpy.context.object
tip.name, tip.parent, tip.location = "Desk_Pencil_Graphite", pencil, (0, 0, .235)
assign(tip, ink)
detail_cylinder("Desk_Pencil_Ferrule", (0, 0, -.204), .0063, .017, cd_metal, pencil)
rubber = mat("Muted eraser rubber", (.37, .16, .115), .86)
detail_cylinder("Desk_Pencil_Eraser", (0, 0, -.218), .0058, .013, rubber, pencil)

rolodex = bpy.data.objects["Desk_Rolodex"]
for x in (-.17, .17):
    detail_box("Desk_Rolodex_Support", (x, .025, .10), (.026, .11, .19), abs_plastic, rolodex)
    knob = detail_cylinder("Desk_Rolodex_Knob", (x * 1.10, .025, .16), .040, .025, black, rolodex)
    knob.rotation_euler.y = math.pi / 2
for i in range(13):
    angle = -.42 + i * .070
    sheet = detail_box("Desk_Rolodex_Card", (0, .025 + math.sin(angle) * .079, .151 + math.cos(angle) * .079), (.29, .0025, .13), paper, rolodex)
    sheet.rotation_euler.x = angle
    if i in (0, 4, 8, 12):
        detail_box("Desk_Rolodex_Tab", (-.108 + i / 4 * .072, 0, .071), (.048, .003, .020), label_paper, sheet)
front = detail_box("Desk_Rolodex_Index", (0, -.040, .176), (.28, .003, .11), label_paper, rolodex)
front.rotation_euler.x = -.35
text_object("Desk_Rolodex_Print_Sub", "PEOPLE / NOTES", (-.106, -.0025, -.026), .018, ink, front)

walkman = bpy.data.objects["Desk_Walkman"]
detail_box("Desk_Walkman_Door", (0, -.063, .017), (.206, .008, .216), cd_metal, walkman)
detail_box("Desk_Walkman_Window", (0, -.069, .028), (.170, .004, .129), black, walkman)
detail_box("Desk_Walkman_Tape", (0, -.073, .028), (.150, .002, .105), abs_plastic, walkman)
for x in (-.047, .047):
    reel = detail_cylinder("Desk_Walkman_Reel", (x, -.076, .028), .026, .003, ivory, walkman)
    reel.rotation_euler.x = math.pi / 2
    hub = detail_cylinder("Desk_Walkman_ReelHub", (x, -.078, .028), .009, .003, black, walkman)
    hub.rotation_euler.x = math.pi / 2
detail_box("Desk_Walkman_TapePath", (0, -.076, -.016), (.105, .002, .009), black, walkman)
for i in range(5):
    detail_box("Desk_Walkman_Key", (-.080 + i * .040, -.01, .164), (.029, .049, .014), abs_plastic if i != 4 else copper, walkman)
text_object("Desk_Walkman_Print_Sub", "PORTABLE STEREO", (-.080, -.069, -.141), .012, ink, walkman)
detail_wire("Desk_Walkman_Cord", [(.114 + math.sin(t * math.tau) * .025, .03 + t * .075, .12 - t * .24) for t in [i / 32 for i in range(33)]], .0025, black, walkman)

clock = bpy.data.objects["Desk_Clock"]
for name, radius, y, material in (("Bezel", .101, -.064, cd_metal), ("Dial", .092, -.069, label_paper)):
    disc = detail_cylinder("Desk_Clock_" + name, (0, y, .013), radius, .006, material, clock)
    disc.rotation_euler.x = math.pi / 2
for i in range(12):
    angle = i * math.tau / 12
    tick = detail_box("Desk_Clock_Tick", (math.sin(angle) * .077, -.074, .013 + math.cos(angle) * .077), (.003, .002, .012 if i % 3 else .018), ink, clock)
    tick.rotation_euler.y = angle
for name, length, width, angle in (("Hour", .047, .006, -.70), ("Minute", .070, .0035, 1.05)):
    hand = detail_box("Desk_Clock_Hand_" + name, (0, -.078, .013), (width, .003, length), ink, clock)
    for vertex in hand.data.vertices:
        vertex.co.z += length / 2
    hand.rotation_euler.y = angle
hub = detail_cylinder("Desk_Clock_Hand_Hub", (0, -.080, .013), .006, .004, copper, clock)
hub.rotation_euler.x = math.pi / 2

glasses = bpy.data.objects["Desk_Glasses"]
bpy.ops.mesh.primitive_torus_add(major_radius=.048, minor_radius=.003, major_segments=40, minor_segments=6)
rim = bpy.context.object
rim.name, rim.parent, rim.location = "Desk_Glasses_RightRim", glasses, (.12, 0, 0)
assign(rim, glasses_metal)
detail_wire("Desk_Glasses_Bridge", [(.047, 0, 0), (.052, .007, .004), (.068, .007, .004), (.073, 0, 0)], .0025, glasses_metal, glasses)
for side, x in (("Left", -.049), ("Right", .169)):
    inward = 1 if x < 0 else -1
    detail_wire("Desk_Glasses_Temple_" + side, [(x, .002, 0), (x + inward * .01, .032, .008), (x + inward * .13, .040, .008)], .0025, glasses_metal, glasses)
    detail_box("Desk_Glasses_NosePad", (.043 if x < 0 else .077, -.004, -.004), (.008, .013, .004), computer, glasses)
clear_glass = mat("Spectacle clear glass", (.96, .98, 1), .045)
clear_glass.node_tree.nodes.get("Principled BSDF").inputs["Transmission Weight"].default_value = 1
clear_glass.node_tree.nodes.get("Principled BSDF").inputs["IOR"].default_value = 1.48
for x in (0, .12):
    lens = detail_cylinder("Desk_Glasses_Lens", (x, 0, 0), .045, .0012, clear_glass, glasses)
    lens["surface_role"] = "glass"

card = bpy.data.objects["Desk_ReplyCard"]
text_object("Desk_ReplyCard_Print_RSS", "RSS", (-.090, .018, .0017), .042, ink, card, (0, 0, 0))
text_object("Desk_ReplyCard_Print_Notes", "NOTES", (-.090, -.040, .0017), .022, ink, card, (0, 0, 0))
detail_box("Desk_ReplyCard_Rule", (.003, -.004, .0015), (.184, .002, .0006), ink, card)


# Refine the existing silhouettes: a real paper pad rather than a thick slab,
# and thin folded leaves rather than inflated ellipsoids.
pad = bpy.data.objects["Work_Notepad"]
base = min(v.co.z for v in pad.data.vertices)
for vertex in pad.data.vertices:
    vertex.co.z = base + (vertex.co.z-base)*.32
for leaf in [o for o in scene.objects if o.name.startswith("Plant_Leaf")]:
    for vertex in leaf.data.vertices:
        x,y,z = vertex.co
        vertex.co.y = y*.12 + .32*(1-z*z)*(abs(x)-.35)
book = bpy.data.objects["Desk_Book"]
text_object("Print_Notebook", "FIELD NOTES", (-.24,.13,.0255), .042, ink, book, (0,0,0))
text_object("Print_Notebook_Subtitle", "FERRIS", (-.24,.075,.0255), .020, ink, book, (0,0,0))

tape_titles = {item["object"]: item["label"] for item in json.loads((ROOT / "src/data/room-tapes.json").read_text())}
tapes = sorted([o for o in scene.objects if o.name.startswith("VHS_")], key=lambda o: o.name)
assert len(tapes) == 12 and {obj.name for obj in tapes} == set(tape_titles), "VHS labels and twelve modeled tapes must match"
for stack, thickness in [('A', [.82,1.10,.94,1.12,1.02]), ('B', [.90,1.17,.84,1.08,.93,1.12,.96])]:
    members = [o for o in tapes if o.name.startswith('VHS_'+stack)]
    floor = min(members[0].location.z + v.co.z for v in members[0].data.vertices)
    for j, (obj, factor) in enumerate(zip(members, thickness)):
        for vertex in obj.data.vertices:
            vertex.co.z *= factor
        low = min(v.co.z for v in obj.data.vertices)
        high = max(v.co.z for v in obj.data.vertices)
        obj.location.z = floor-low
        floor += high-low+.007
        obj.location.x += [0,.022,-.015,.032,-.012,.014,-.020][j]
        obj.location.y += [.005,-.018,.028,-.010,.020,-.025,.014][j]
        obj.rotation_euler.z += [.012,-.024,.031,-.018,.025,-.016,.010][j]
bpy.context.view_layer.update()
tape_colors = [(.20,.065,.035),(.12,.038,.24),(.31,.27,.18),(.035,.18,.15),(.045,.12,.25),
               (.32,.12,.046),(.20,.25,.14),(.28,.15,.11),(.15,.20,.29),(.24,.20,.12),(.026,.13,.14),(.15,.18,.21)]
label_colors = [(.67,.53,.34),(.28,.12,.45),(.72,.66,.49),(.10,.28,.20),(.12,.28,.45),
                (.60,.22,.08),(.55,.66,.42),(.68,.38,.26),(.29,.44,.59),(.73,.67,.49),(.035,.27,.28),(.57,.64,.63)]
for i, obj in enumerate(tapes):
    sleeve = mat("Tape sleeve " + obj.name, tape_colors[i], .74)
    age_paper(sleeve)
    assign(obj, sleeve)
    width, _, height = obj.dimensions
    label_mat = mat("Printed sleeve " + obj.name, label_colors[i], .85)
    age_paper(label_mat)
    light_title = i in (1,3,4,5,10)
    title_ink = label_paper if light_title else ink
    label_box("Label_" + obj.name, (-width*.025, -0.183, 0), (width * .92, 0.004, height * .77), label_mat, obj)
    # Printed colour bands and catalogue tabs make twelve distinct jackets,
    # while every title still corresponds to its own playable programme.
    label_box("Tape_Tab_"+obj.name, (-width*.43,-.186,0), (width*.065,.002,height*.72), title_ink, obj)
    if i % 3 == 0:
        label_box("Tape_Stripe_"+obj.name, (0,-.186,height*.23), (width*.72,.002,.002), title_ink, obj)
    detail_box("Tape_End_"+obj.name, (width*.5+.001,0,0), (.007,.34,height*.83), abs_plastic, obj)
    for z in [-height*.43,height*.43]:
        label_box("Tape_Seam_"+obj.name, (0,-.181,z), (width*.96,.003,.0015), black, obj)
    text_object("Print_Format_"+obj.name, "VHS", (width*.38,-.187,-height*.10), .012, label_paper, obj)
    text_object("Print_" + obj.name, tape_titles[obj.name], (-width * 0.365, -0.188, -height * 0.16), .030 if len(tape_titles[obj.name])<13 else .027, title_ink, obj)
assembly = bpy.data.objects["DeskAssembly"]
text_object("CRT_Model", "COLOR MONITOR", (0.25, -0.309, 2.225), 0.017, label_paper, assembly)
text_object("VCR_Brand", "VHS  /  STEREO", (-0.61, -0.507, 0.872), 0.017, label_paper, assembly)
# The work page is runtime ink. Baking a temporary 3D title leaves its shadow
# underneath later content even after the exported text mesh is hidden.

# Readable manufacturing details on existing hero objects, not extra props.
crt_z = lambda z: 1.08 + (z - 1.08) * 1.055
for i in range(7):
    detail_box("CRT_SpeakerGroove", (-.26, -.304, crt_z(1.36 + i * .011)), (.38, .004, .0035), black, assembly)
for i, button in enumerate(sorted([o for o in scene.objects if o.name.startswith("CRT_Button")], key=lambda o: o.name)):
    button.scale.x *= .72
    button.scale.z *= .68
    text_object("Print_CRT_Button", ("HOME", "WORK", "POSTS", "UNDERSCAN", "H-V", "BLUE")[i], (button.location.x, -.328, crt_z(1.20)), .010, label_paper, assembly, align="CENTER")
for label, x in (("VOLUME", .29), ("TRACKING", .40), ("CHROMA", .49)):
    text_object("Print_CRT_" + label, label, (x, -.329, crt_z(1.30)), .009, label_paper, assembly, align="CENTER")
text_object("Print_CRT_Power", "POWER", (-.45, -.329, crt_z(1.20)), .010, label_paper, assembly, align="CENTER")
detail_box("CRT_PowerLED", (-.45, -.335, crt_z(1.30)), (.016, .012, .012), mat("Power LED", (.08, .60, .12), .24), assembly)["surface_role"] = "led"
trim = mat("Dark brushed trim", (.08, .09, .08), .38, .7)
detail_box("VCR_EdgeTrim", (.01, -.508, 1.055), (1.30, .004, .003), trim, assembly)
display = bpy.data.objects["VCR_Display"]
display.location.x = .38
display.location.z = 1.015
display.scale.x *= 1.45
display.scale.z *= .9
slot = bpy.data.objects['VCR_TapeSlot']
slot.scale.x *= 1.12
detail_box('VCR_SlotFlap', (-.22,-.515,.981), (.69,.008,.035), abs_plastic, assembly)
detail_box('VCR_SlotLip', (-.22,-.521,1.003), (.70,.008,.0025), trim, assembly)
for x in (-.62,.64):
    detail_box('VCR_FasciaJoint', (x,-.506,.950), (.002,.004,.182), black, assembly)
detail_box('VCR_LowerJoint', (.01,-.507,.854), (1.30,.003,.003), black, assembly)
detail_box('VCR_DisplayBezel', (.38,-.510,1.015), (.374,.005,.087), black, assembly)
# Recess the illuminated readout inside its independently bevelled surround.
display.location.y = -.518
for i in range(6):
    key_mat = mat('VCR record red', (.24,.025,.015), .42) if i==5 else abs_plastic
    detail_box("VCR_Key", (.26 + i * .065, -.515, .893), (.045, .014, .022), key_mat, assembly)
text_object("Print_VCR_Controls", "REW   PLAY   FWD   STOP   REC", (.20, -.520, .925), .012, label_paper, assembly)
text_object("Print_VCR_Stereo", "STEREO / HQ", (-.60, -.513, .90), .012, label_paper, assembly)
text_object("Print_VCR_Slot", "VIDEO CASSETTE RECORDER", (-.52, -.515, 1.025), .013, label_paper, assembly)
remote = bpy.data.objects["Desk_Remote"]
remote.location.x -= .17  # Keep the actual object clear of the interactive paper.
for row in range(3):
    for col in range(6):
        key_mat = mat("Remote power red", (.22, .018, .010), .6) if row == col == 0 else abs_plastic
        detail_box("Remote_Key", (-.22 + col * .081, -.053 + row * .052, .041), (.042, .033, .014), key_mat, remote)

monitor = bpy.data.objects["Computer_Monitor"]
text_object("Print_PC_Model", "MONOCHROME  /  PERSONAL COMPUTER", (.06, -.283, -.29), .007, ink, monitor)
detail_box("Computer_PowerSocket", (.30, -.283, -.29), (.064, .012, .052), black, monitor)
detail_box("Computer_PowerButton", (.30, -.295, -.29), (.050, .023, .038), ivory, monitor)
detail_box("Computer_PowerLED", (.24, -.286, -.29), (.016, .008, .016), mat("Computer LED", (.08,.55,.18), .3), monitor)["surface_role"] = "led"
keyboard = bpy.data.objects["Computer_Keyboard"]
for row in range(5):
    for col in range(12):
        detail_box("Computer_Key", (-.33 + col*.060, .105 - row*.044, .036), (.050,.034,.013), ivory, keyboard)
detail_box("Computer_Spacebar", (0, -.118, .036), (.28,.030,.013), ivory, keyboard)

geometry_report = refine_geometry(scene, {'pot':terracotta,'leaf':leaf_mat,'wood':frame,'crt':crt_plastic,'dark':black})
geometry_report['plantRound7'] = refine_plant(scene, terracotta)
curtain_report = refine_curtains(scene)
geometry_report['roomRound7'] = refine_room(scene, plaster, wood, cloth, horizontal_oak, vertical_oak)
geometry_report['architectureUV'] = preserve_architecture_uv(scene)
geometry_report['windowRound9'] = refine_window(scene, brass, grain.image)
geometry_report['propsUV'] = preserve_props_uv(scene)
geometry_report['wallRound10'] = repair_back_wall(scene, plaster)
geometry_report['deskRound10'] = refine_desk(scene, grain.image)
geometry_report['ceramicRound11'] = refine_ceramic(scene)
geometry_report['equipmentHQ'] = refine_equipment(scene)
geometry_report['foliageHQ'] = refine_foliage(scene)
geometry_report['paperHQ'] = refine_paper(scene)
geometry_report['tapeHQ'] = refine_tapes(scene)
geometry_report['accessoriesHQ'] = refine_accessories(scene)
geometry_report['physicalDesktop'] = refine_physical(scene, text_object)
(BUILD / 'round3-geometry.json').write_text(json.dumps({'objects':geometry_report,'curtains':curtain_report}, indent=2)+'\n')

# A static photographic backdrop will be supplied independently; a camera-only
# material prevents counting it as an extra source on top of the window light.
bpy.data.objects.remove(bpy.data.objects["Window_Backdrop"], do_unlink=True)
bpy.ops.mesh.primitive_plane_add(size=1, location=(-0.25, 1.30, 2.65), rotation=(math.pi / 2, 0, 0))
backdrop = bpy.context.object
backdrop.name = "City_Backdrop"
backdrop.location.x = 0.05
backdrop.scale = (5.60, 3.15, 1)
# A homothety about HomeCamera preserves every Home projection coordinate,
# but places the exterior beyond the room instead of 41 cm behind the glass.
# Window inspection can then approach the glass without magnifying a nearby card.
backdrop.location = scene.camera.location + (backdrop.location-scene.camera.location)*2.6
backdrop.scale *= 2.6
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
# Put the low industrial horizon below the sash. The extra top area samples
# the overcast sky edge, rather than lifting foreground railway above the TV.
for loop in backdrop.data.uv_layers.active.data:
    loop.uv.y += .40
# Extend the physical plate beyond oblique window rays. Keep original central
# UVs/projection unchanged; the renderer continues only its distant edge haze.
for vertex in backdrop.data.vertices:
    vertex.co.x *= 2
    vertex.co.y *= 1.6
for loop in backdrop.data.uv_layers.active.data:
    loop.uv.x = (loop.uv.x-.5)*2+.5
    loop.uv.y = (loop.uv.y-.9)*1.6+.9
city_mat = mat("City camera plate", (0.1, 0.14, 0.19), 1)
assign(backdrop, city_mat)
city_path = options.city.resolve()
if city_path.exists():
    n, l = city_mat.node_tree.nodes, city_mat.node_tree.links
    tex = n.new("ShaderNodeTexImage")
    tex.extension = 'EXTEND'
    tex.image = bpy.data.images.load(str(city_path))
    emit = n.new("ShaderNodeEmission")
    uv = n.new('ShaderNodeTexCoord')
    axes = n.new('ShaderNodeSeparateXYZ')
    l.new(uv.outputs['UV'], axes.inputs[0])
    sky_mask = n.new('ShaderNodeMapRange')
    sky_mask.inputs['From Min'].default_value = 1.0
    sky_mask.inputs['From Max'].default_value = 1.09
    sky_mask.clamp = True
    l.new(axes.outputs['Y'], sky_mask.inputs['Value'])
    sky_mix = n.new('ShaderNodeMixRGB')
    l.new(sky_mask.outputs[0], sky_mix.inputs[0])
    l.new(tex.outputs['Color'], sky_mix.inputs[1])
    sky_mix.inputs[2].default_value = (.045,.060,.085,1)
    l.new(sky_mix.outputs[0], emit.inputs["Color"])
    light_path = n.new("ShaderNodeLightPath")
    mix = n.new("ShaderNodeMixShader")
    l.new(light_path.outputs["Is Camera Ray"], mix.inputs[0])
    l.new(n.get("Principled BSDF").outputs["BSDF"], mix.inputs[1])
    l.new(emit.outputs[0], mix.inputs[2])
    l.new(mix.outputs[0], n.get("Material Output").inputs["Surface"])


def area(name, location, target, power, color, width, height=None):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = power
    data.color = color
    data.shape = "RECTANGLE" if height else "DISK"
    data.size = width
    if name == 'Lamp':
        data.spread = math.radians(100)
    if height:
        data.size_y = height
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()
    # Analytic sources have no visible emitter geometry in the web renderer.
    # Keep Cycles reference renders consistent, especially for bounce cards.
    obj.visible_camera = False
    return obj


bpy.context.view_layer.update()
room_lights = [
    area("Lamp", lamp_bottom.lerp(lamp_bulb, .65), (-1.65, -0.30, 0.65), 160, (1.0, 0.69, 0.43), 0.20),
    area("Window", (-0.3, 1.08, 2.6), (0, -0.5, 0.7), 50, (0.58, 0.68, 0.82), 3.6, 2.1),
    area("Room bounce", (-2.3, -3.0, 2.8), (0, 0, 1.2), 60, (1.0, 0.75, 0.51), 3.0, 2.0),
    area("Curtain bounce", (1.3, 0, 2.1), (2.2, .7, 2.7), 18, (1.0, .78, .57), .5, 1.0),
    area("Overhead reflection", (-.89, -.35, 3.67), (-1.40, -.17, 1.96), 24, (1.0, .83, .67), .35, 1.0),
    area("Computer phosphor", (3.20, -1.25, 1.343), (2.84, -1.25, .72), 3, (.30,.75,.42), .58, .44),
]
bulb_data = bpy.data.lights.new("Lamp interior", "POINT")
bulb_data.energy = .8
bulb_data.color = (1, .66, .40)
bulb_data.shadow_soft_size = .045
bulb = bpy.data.objects.new("Lamp interior", bulb_data)
scene.collection.objects.link(bulb)
bulb.location = lamp_bulb
room_lights.append(bulb)
lamp_controlled = [light for light in room_lights if light.name in {"Lamp", "Lamp interior", "Room bounce", "Desk reflection", "Curtain bounce", "Overhead reflection"}]
tv_light = area("TV white illumination", (0, -0.37, 1.67), (0, -1.2, 1.2), 18, (1, 1, 1), 0.86, 0.63)
tv_light.data.color = (0.04, 0.13, 0.65)
scene.render.resolution_percentage = 50 if options.draft else 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(BUILD / "materials-cycles.png")
bpy.ops.wm.save_as_mainfile(filepath=str(BUILD / "study-materials.blend"))
if options.geometry_only:
    print('GEOMETRY_DONE', options.build_id, flush=True)
    sys.exit(0)
if not options.skip_render:
    print("RENDER_START", flush=True)
    bpy.ops.render.render(write_still=True)
    print("RENDER_DONE", scene.render.filepath, flush=True)
    render_lamp_powers = [light.data.energy for light in lamp_controlled]
    for light in lamp_controlled:
        light.data.energy = 0
    scene.render.filepath = str(BUILD / "materials-cycles-lamp-off.png")
    bpy.ops.render.render(write_still=True)
    print("LAMP_OFF_RENDER_DONE", scene.render.filepath, flush=True)
    for light, power in zip(lamp_controlled, render_lamp_powers):
        light.data.energy = power
if options.render_only:
    sys.exit(0)

# The receiver light maps exclude albedo. Keep colour on bounce surfaces but use
# diffuse receivers, rather than baking their metalness into the illumination.
screen_shader.inputs["Emission Strength"].default_value = 0
tv_light.data.color = (1, 1, 1)
for m in bpy.data.materials:
    if m.use_nodes and (p := m.node_tree.nodes.get("Principled BSDF")):
        m["restore_metallic"] = p.inputs["Metallic"].default_value
        p.inputs["Metallic"].default_value = 0

excluded = {"CRT_Screen", "Computer_Screen", "VCR_Display", "City_Backdrop"}
groups = {"architecture": [], "desk": [], "props": [], "lamp": [], "curtains": [], "window": [], "walls": [], "ceramic": [], "equipment": [], "foliage": [], "paper": [], "tape": []}
for obj in scene.objects:
    if obj.type != "MESH" or obj.name in excluded or obj.get("surface_role"):
        continue
    group = "ceramic" if obj.get("ceramic_finish") else "walls" if obj.get("wall_finish") else "desk" if obj.get("desk_finish") else "window" if obj.get("window_finish") else "curtains" if obj.name.startswith("Curtain_") else "architecture" if obj.name.startswith(("Room_", "Window_")) else "lamp" if obj.name.startswith("Lamp_") else "props"
    group = obj.get('hero_atlas', group)
    groups[group].append(obj)

manifest = {"version": 18, "buildId": options.build_id, "quality": "draft" if options.draft else "final", "encoding": "RGBM8",
            "city": '/room/' + city_path.with_suffix('.webp').name,
            "refinement": "high-quality-hero-assets", "shadeBounds": list(shade_bounds),
            "camera": "HomeCamera", "atlases": {}, "lighting": {"lampWatts": 160, "lampSpreadDegrees": 100, "windowWatts": 50, "tvWhiteWatts": 18,
            "lampControlledSources": [light.name for light in lamp_controlled], "lampOffPreserves": ["Window", "Computer phosphor", "World"],
            "deskShadowExclusions": [o.name for o in scene.objects if o.name.startswith(("Work_Notepad", "Mug_", "Desk_Calculator"))]},
            "geometry": {"curtainRows": 41, "curtainThickness": .0014, "curtainHem": .048, "tapes": len(tapes), "interactiveProps": ["Retro_Phone", "Desk_CD", "Desk_Calculator",
            "Desk_Pager", "Desk_Floppy", "Desk_Pencil", "Desk_Rolodex", "Desk_Walkman", "Desk_Clock", "Desk_ReplyCard"]}}
originals = {}
joined_groups = {}
detached_prints = []
# Joining baked parents would otherwise move their unbaked labels to the origin.
for obj in scene.objects:
    if obj.get("surface_role") and obj.parent and obj.parent.type == "MESH":
        parent_name, transform = obj.parent.name, obj.matrix_world.copy()
        detached_prints.append((obj, parent_name, transform))
        obj.parent = None
        obj.matrix_world = transform

# Unique material slots preserve object identity across a joint unwrap/bake.
for group, objects in groups.items():
    for obj in objects:
        originals[obj.name] = obj.matrix_world.copy()
        unique = obj.data.materials[0].copy()
        unique.name = "Source_" + obj.name
        unique["source_object"] = obj.name
        for key in ('leaf_base','leaf_tip','leaf_phase','leaf_flex','paper_bend','tape_master_part','tape_reel_origin'):
            if key in obj: unique[key] = list(obj[key]) if key in ('leaf_base','leaf_tip','paper_bend','tape_reel_origin') else obj[key]
        if 'surface_profile' in obj:
            unique['surface_profile'] = obj['surface_profile']
        assign(obj, unique)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    active_world = objects[0].matrix_world.copy()
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = "Atlas_" + group
    joined.parent = None
    # Join keeps the active object's world transform; preserve it explicitly.
    joined.matrix_world = active_world
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if group not in ('curtains', 'architecture', 'props'):
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=1.1, island_margin=0.012, area_weight=0.5)
        bpy.ops.object.mode_set(mode="OBJECT")
    joined.data.uv_layers.active.name = "MaterialUV"
    while len(joined.data.uv_layers) > 1:
        joined.data.uv_layers.remove(joined.data.uv_layers[-1])
    joined.data.uv_layers.new(name="LightUV", do_init=True)
    joined.data.uv_layers.active_index = 0
    joined_groups[group] = joined


def activate(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def denoise_illumination(image):
    """Denoise linear irradiance before RGBM encoding, using Blender's OIDN node.

    A separate empty render scene evaluates only the image compositor. EXR keeps
    HDR values intact and avoids a display transform in the data path.
    """
    clean = bpy.data.scenes.new("Lightmap denoise")
    clean.render.engine = "BLENDER_WORKBENCH"
    clean.render.resolution_x, clean.render.resolution_y = image.size
    clean.render.resolution_percentage = 100
    camera_data = bpy.data.cameras.new("Denoise camera")
    camera = bpy.data.objects.new("Denoise camera", camera_data)
    clean.collection.objects.link(camera)
    clean.camera = camera
    tree = bpy.data.node_groups.new("Denoise irradiance", "CompositorNodeTree")
    clean.compositing_node_group = tree
    tree.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    source = tree.nodes.new("CompositorNodeImage")
    source.image = image
    denoise = tree.nodes.new("CompositorNodeDenoise")
    output = tree.nodes.new("NodeGroupOutput")
    tree.links.new(source.outputs["Image"], denoise.inputs["Image"])
    tree.links.new(denoise.outputs["Image"], output.inputs["Image"])
    clean.render.image_settings.file_format = "OPEN_EXR"
    clean.render.image_settings.color_depth = "32"
    clean.render.filepath = str(BUILD / (image.name + "-denoised.exr"))
    bpy.ops.render.render(write_still=True, scene=clean.name)
    result = bpy.data.images.load(clean.render.filepath, check_existing=False)
    result.colorspace_settings.name = "Non-Color"
    bpy.data.objects.remove(camera, do_unlink=True)
    bpy.data.cameras.remove(camera_data)
    bpy.data.scenes.remove(clean)
    bpy.data.node_groups.remove(tree)
    return result


def bake_image(obj, name, resolution, kind, filters=None, uv="MaterialUV", data=False):
    image = bpy.data.images.new(name, width=resolution, height=resolution, alpha=True, float_buffer=True)
    image.colorspace_settings.name = "Non-Color"
    for m in obj.data.materials:
        target = m.node_tree.nodes.new("ShaderNodeTexImage")
        target.name = "BakeTarget"
        target.image = image
        m.node_tree.nodes.active = target
    activate(obj)
    margin = 4 if obj.name == 'Atlas_curtains' else 12
    kwargs = {"type": kind, "uv_layer": uv, "margin": margin}
    if filters:
        kwargs["pass_filter"] = filters
    scene.cycles.samples = (48 if options.draft else 128) if kind == "DIFFUSE" else 12
    print("BAKE_START", name, resolution, flush=True)
    bpy.ops.object.bake(**kwargs)
    for m in obj.data.materials:
        m.node_tree.nodes.remove(m.node_tree.nodes["BakeTarget"])
    print("BAKE_DONE", name, flush=True)
    return denoise_illumination(image) if kind == "DIFFUSE" else image


def save_png(image, name, rgbm=False, srgb=False):
    values = np.empty(len(image.pixels), dtype=np.float32)
    image.pixels.foreach_get(values)
    pixels = values.reshape((-1, 4))
    if not np.isfinite(pixels).all():
        raise RuntimeError("Non-finite bake pixels: " + name)
    if rgbm:
        rgb = np.maximum(pixels[:, :3], 0)
        peak = float(rgb.max())
        scale = 2 ** math.ceil(math.log2(max(peak, 1)))
        multiplier = np.maximum(np.ceil(rgb.max(axis=1) / scale * 255) / 255, 1 / 255)
        pixels[:, :3] = rgb / (multiplier[:, None] * scale)
        pixels[:, 3] = multiplier
        print("IRRADIANCE_PEAK", name, peak, flush=True)
    elif srgb:
        rgb = np.clip(pixels[:, :3], 0, 1)
        pixels[:, :3] = np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * rgb ** (1 / 2.4) - 0.055)
        pixels[:, 3] = 1
    else:
        pixels[:, 3] = 1
    # Encode exact bytes without applying Blender's display transform to data.
    width, height = image.size
    raster = np.rint(np.clip(pixels, 0, 1) * 255).astype(np.uint8).reshape((height, width, 4))[::-1]
    def chunk(kind, payload):
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xffffffff)
    raw = b"".join(b"\0" + row.tobytes() for row in raster)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b"")
    (OUT / (name + ".png")).write_bytes(data)
    return {"file": name + ".png", "range": scale, "peak": peak} if rgbm else name + ".png"


def emission_channel(obj, packed=False, opacity=False):
    for m in obj.data.materials:
        n, l = m.node_tree.nodes, m.node_tree.links
        p = n.get("Principled BSDF")
        emit = n.new("ShaderNodeEmission")
        emit.name = "BakeEmission"
        if opacity:
            alpha=p.inputs['Alpha']
            if alpha.is_linked:l.new(alpha.links[0].from_socket,emit.inputs['Color'])
            else:emit.inputs['Color'].default_value=(*([alpha.default_value]*3),1)
        elif packed:
            combine = n.new("ShaderNodeCombineColor")
            combine.name = "BakePack"
            combine.inputs[0].default_value = 1
            combine.inputs[1].default_value = p.inputs["Roughness"].default_value
            if p.inputs["Roughness"].is_linked:
                l.new(p.inputs["Roughness"].links[0].from_socket, combine.inputs[1])
            combine.inputs[2].default_value = m.get("restore_metallic", 0)
            l.new(combine.outputs[0], emit.inputs["Color"])
        elif p.inputs["Base Color"].is_linked:
            l.new(p.inputs["Base Color"].links[0].from_socket, emit.inputs["Color"])
        else:
            emit.inputs["Color"].default_value = p.inputs["Base Color"].default_value
        l.new(emit.outputs[0], n.get("Material Output").inputs["Surface"])


def restore_surface(obj):
    for m in obj.data.materials:
        n, l = m.node_tree.nodes, m.node_tree.links
        l.new(n.get("Principled BSDF").outputs[0], n.get("Material Output").inputs["Surface"])
        for name in ("BakeEmission", "BakePack"):
            if name in n:
                n.remove(n[name])


@contextmanager
def receiver_shadow_policy(group):
    """Moving objects leave no baked silhouette on the desk or memo-book.

    Their small contact cues are attached to the receiver at runtime and fade
    with height. Delete occluder faces temporarily, keeping every remaining UV
    coordinate intact; transparent materials can still exhaust ray bounces.
    """
    if group not in ('desk', 'props'):
        yield
        return
    import bmesh
    prefixes=('Work_Notepad', 'Mug_', 'Desk_Calculator')
    replaced=[];hidden=[]
    for obj in joined_groups.values():
        excluded={i for i,m in enumerate(obj.data.materials) if m.get('source_object','').startswith(prefixes)}
        if not excluded:continue
        original=obj.data;mesh=original.copy();obj.data=mesh;replaced.append((obj,original,mesh))
        bm=bmesh.new();bm.from_mesh(mesh)
        bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.material_index in excluded],context='FACES')
        bm.to_mesh(mesh);bm.free();mesh.update()
    for obj in scene.objects:
        if obj.name.startswith(prefixes):hidden.append((obj,obj.hide_render));obj.hide_render=True
    print('RECEIVER_SHADOW_POLICY',group,'paper, cup and calculator excluded',flush=True)
    try:yield
    finally:
        for obj,previous in hidden:obj.hide_render=previous
        for obj,original,mesh in replaced:obj.data=original;bpy.data.meshes.remove(mesh)


for group, obj in joined_groups.items():
    if options.light_only_atlases and group not in options.light_only_atlases.split(','):continue
    # Very high bulb irradiance must not quantize every dark plastic surface.
    # A separate small lamp atlas keeps RGBM precision local to each range.
    resolution = 512 if options.draft or group == "lamp" else 4096 if group == "desk" else 1024 if group in ("architecture", "curtains", "ceramic", "paper") else 2048
    light_resolution = min(resolution, 2048)
    scene.cycles.samples = 12 if options.draft else 96 if group in ('desk','walls') else 48
    atlas = {"size": resolution}
    if not options.light_only_atlases:
        emission_channel(obj)
        atlas["albedo"] = save_png(bake_image(obj, group + "_albedo", resolution, "EMIT"), group + "-albedo", srgb=True)
        restore_surface(obj)
        if group == "foliage":
            emission_channel(obj, opacity=True)
            atlas["opacity"] = save_png(bake_image(obj, group + "_opacity", resolution, "EMIT", data=True), group + "-opacity")
            restore_surface(obj)
        emission_channel(obj, packed=True)
        atlas["orm"] = save_png(bake_image(obj, group + "_orm", resolution, "EMIT", data=True), group + "-orm")
        restore_surface(obj)
        atlas["normal"] = save_png(bake_image(obj, group + "_normal", resolution, "NORMAL", data=True), group + "-normal")
    with receiver_shadow_policy(group):
        tv_light.data.energy = 0
        atlas["room"] = save_png(bake_image(obj, group + "_room", light_resolution, "DIFFUSE", {"DIRECT", "INDIRECT"}, "LightUV", True), group + "-room", True)
        lamp_powers = [light.data.energy for light in lamp_controlled]
        for light in lamp_controlled:
            light.data.energy = 0
        atlas["lampOff"] = save_png(bake_image(obj, group + "_lamp_off", light_resolution, "DIFFUSE", {"DIRECT", "INDIRECT"}, "LightUV", True), group + "-lamp-off", True)
        for light, power in zip(lamp_controlled, lamp_powers):
            light.data.energy = power
        saved_powers = [light.data.energy for light in room_lights]
        for light in room_lights:
            light.data.energy = 0
        world.inputs["Strength"].default_value = 0
        tv_light.data.energy = 18
        atlas["tv"] = save_png(bake_image(obj, group + "_tv", light_resolution, "DIFFUSE", {"DIRECT", "INDIRECT"}, "LightUV", True), group + "-tv", True)
        for light, power in zip(room_lights, saved_powers):
            light.data.energy = power
        world.inputs["Strength"].default_value = 0.18
    manifest["atlases"][group] = atlas

if options.light_only_atlases:
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('LIGHT_ONLY_DONE',options.light_only_atlases,flush=True)
    sys.exit(0)

# Two tiny embedded placeholder textures force both named UV sets into glTF.
white = bpy.data.images.new("UV0 placeholder", 1, 1)
white.pixels[:] = (1, 1, 1, 1)
white.filepath_raw = str(BUILD / "white.png")
white.file_format = "PNG"
white.save()
empty = bpy.data.images.new("UV1 placeholder", 1, 1)
empty.pixels[:] = (0, 0, 0, 1)
empty.filepath_raw = str(BUILD / "black.png")
empty.file_format = "PNG"
empty.save()
for group, obj in joined_groups.items():
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="MATERIAL")
    bpy.ops.object.mode_set(mode="OBJECT")
    parts = list(bpy.context.selected_objects)
    for part in parts:
        source = part.data.materials[part.data.polygons[0].material_index]
        original_name = source["source_object"]
        previous = part.matrix_world.copy()
        part.data.transform(originals[original_name].inverted() @ previous)
        part.matrix_world = originals[original_name]
        part.name = original_name
        part["atlas"] = group
        if group == 'ceramic':part['ceramicInterior']=True
        for key in ('leaf_base','leaf_tip','leaf_phase','leaf_flex','paper_bend','tape_master_part','tape_reel_origin'):
            if key in source: part[key] = list(source[key]) if key in ('leaf_base','leaf_tip','paper_bend','tape_reel_origin') else source[key]
        if 'surface_profile' in source:
            part['surface_profile'] = source['surface_profile']
        m = mat("Baked " + group, (1, 1, 1), 1, 1)
        p = m.node_tree.nodes.get("Principled BSDF")
        for uv_name, image, input_name in (("MaterialUV", white, "Base Color"), ("LightUV", empty, "Emission Color")):
            n, l = m.node_tree.nodes, m.node_tree.links
            uv = n.new("ShaderNodeUVMap")
            uv.uv_map = uv_name
            tex = n.new("ShaderNodeTexImage")
            tex.image = image
            l.new(uv.outputs[0], tex.inputs[0])
            l.new(tex.outputs["Color"], p.inputs[input_name])
        p.inputs["Emission Strength"].default_value = 1
        assign(part, m)
        for polygon in part.data.polygons:
            polygon.material_index = 0

# Keep the backdrop GLB small; the separately loaded, local photo replaces this.
bpy.context.view_layer.update()
for obj, parent_name, transform in detached_prints:
    obj.parent = bpy.data.objects[parent_name]
    obj.matrix_world = transform
bpy.context.view_layer.update()
plate = mat("City_Backdrop", (1, 1, 1), 1)
tex = plate.node_tree.nodes.new("ShaderNodeTexImage")
tex.image = white
plate.node_tree.links.new(tex.outputs["Color"], plate.node_tree.nodes.get("Principled BSDF").inputs["Base Color"])
assign(backdrop, plate)

# Lights are runtime analytic specular sources; diffuse illumination is baked.
for obj in list(scene.objects):
    if obj.type == "LIGHT":
        bpy.data.objects.remove(obj, do_unlink=True)
scene.render.resolution_percentage = 100
bpy.ops.export_scene.gltf(filepath=str(OUT / "study.glb"), export_format="GLB", export_cameras=True,
                          export_extras=True, export_yup=True, export_texcoords=True)
(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print("MATERIALS_DONE", json.dumps(manifest), flush=True)
