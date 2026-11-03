"""One desktop placement recipe for the authored scene and delivered GLB patch."""
import json
from pathlib import Path

import bpy
from mathutils import Matrix

LAYOUT_PATH = Path(__file__).with_name('desktop-layout.json')


def layout_recipe():
    return json.loads(LAYOUT_PATH.read_text())


def make_floppy_label(scene, ink, parent=None):
    spec = layout_recipe()['floppyLabel']
    curve = bpy.data.curves.new('Desk_Floppy_Print', 'FONT')
    curve.body = spec['text']
    curve.align_x = 'CENTER'
    curve.size = spec['size']
    curve.extrude = .00015
    obj = bpy.data.objects.new('Desk_Floppy_Print', curve)
    scene.collection.objects.link(obj)
    obj.parent = parent
    x, y, z = spec['position']
    obj.location = (x, -z, y)
    obj.data.materials.append(ink)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    obj['surface_role'] = 'print'
    obj['print_text'] = spec['text']
    return obj


def apply_desktop_layout(scene):
    recipe = layout_recipe()
    bpy.context.view_layer.update()
    for name, spec in recipe['objects'].items():
        base = scene.objects[name]
        x, y, z = spec['position']
        target = (Matrix.Translation((x, -z, y))
                  @ Matrix.Rotation(spec['rotationY'], 4, 'Z')
                  @ Matrix.Scale(spec['scale'], 4))
        delta = target @ base.matrix_world.inverted()
        family = [o for o in scene.objects if o.name == name or o.name.startswith(name + '_')]
        # Source children are parented; atlas separation later flattens most
        # of them. Transform only family roots to avoid moving labels twice.
        roots = [o for o in family if o.parent not in family]
        original = [(o, o.matrix_world.copy()) for o in roots]
        for obj, matrix in original:
            obj.matrix_world = delta @ matrix
        bpy.context.view_layer.update()
    return recipe
