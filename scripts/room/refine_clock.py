"""A recessed clock dial and thin crystal within the existing clock footprint.

Call after refine_control_layout. The root transform, hand pivots and authored
hand rotations survive, so the runtime clock continues to own the time.
"""
import math

import bpy
from mathutils import Vector

from refine_equipment import finish
from refine_geometry import _activate, _box, _lathe, _mesh, _replace


def refine_clock(scene):
    root = scene.objects['Desk_Clock']
    before = root.matrix_world.copy()
    hand_transforms = {obj.name: obj.matrix_world.copy() for obj in scene.objects
                       if obj.name in ('Desk_Clock_Hand_Hour', 'Desk_Clock_Hand_Minute',
                                       'Desk_Clock_Hand_Second')}
    lo = Vector(tuple(min(v.co[i] for v in root.data.vertices) for i in range(3)))
    hi = Vector(tuple(max(v.co[i] for v in root.data.vertices) for i in range(3)))
    shell = finish('Clock fine graphite ABS', (.031, .036, .034), .38, grain=.025)
    nickel = finish('Clock satin nickel rolled bezel', (.43, .46, .44), .27, .88, grain=.008)
    dial = finish('Clock warm enamel dial', (.70, .68, .60), .69, grain=.006)
    ink = finish('Clock printed charcoal indices', (.014, .016, .014), .68, grain=0)
    hands = finish('Clock lacquered metal hands', (.014, .018, .016), .31, .12, grain=.006)
    glass = finish('Clock clear instrument crystal', (.96, .98, .97), .07, grain=0)
    glass.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value = .12
    glass.node_tree.nodes.get('Principled BSDF').inputs['IOR'].default_value = 1.48
    # A transparent shadow branch keeps the dial's irradiance intact when the
    # equipment objects are joined for baking. The WebGL instrument-glass
    # profile supplies the view-dependent reflection on the thin crystal.
    nodes, links = glass.node_tree.nodes, glass.node_tree.links
    light_path = nodes.new('ShaderNodeLightPath')
    transparent = nodes.new('ShaderNodeBsdfTransparent')
    mix = nodes.new('ShaderNodeMixShader')
    mix.name = 'BakeShadowlessSurface'
    links.new(light_path.outputs['Is Shadow Ray'], mix.inputs[0])
    links.new(nodes.get('Principled BSDF').outputs[0], mix.inputs[1])
    links.new(transparent.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], nodes.get('Material Output').inputs['Surface'])

    def tag(obj, profile='abs'):
        obj['hero_atlas'] = 'equipment'
        obj['surface_profile'] = profile
        return obj

    def smooth_edges(obj):
        for face in obj.data.polygons:
            face.use_smooth = True
        obj.data.set_sharp_from_angle(angle=math.radians(45))
        _activate(obj)
        modifier = obj.modifiers.new('Clock manufactured surface normals', 'WEIGHTED_NORMAL')
        modifier.keep_sharp = True
        modifier.weight = 40
        bpy.ops.object.modifier_apply(modifier=modifier.name)

    # Preserve the casing's measured local extents and replace its three-step
    # corner chamfers with a continuous manufactured rollover.
    replacement = _box('Clock casing construction', (0, 0, 0), hi-lo, shell,
                       scene, bevel=.025, segments=16)
    for vertex in replacement.data.vertices:
        vertex.co += (lo+hi)/2
    root.data = replacement.data
    bpy.data.objects.remove(replacement, do_unlink=True)
    tag(root)
    smooth_edges(root)

    for name in ('Desk_Clock_Bezel', 'Desk_Clock_Dial', 'Desk_Clock_Crystal'):
        if name in scene.objects:
            bpy.data.objects.remove(scene.objects[name], do_unlink=True)

    def radial(name, profile, material, surface='abs'):
        vertices, faces = _lathe(profile, 160)
        # The original face points along local -Y, with its pivot at z=.013.
        obj = _mesh(name, [(x, -depth, .013+z) for x, z, depth in vertices],
                    faces, material, scene, parent=root, smooth=True)
        return tag(obj, surface)

    # A closed annular section makes an actual metal lip and inward return.
    # Its front sits beyond the hands rather than leaving the hands exposed
    # in front of the previous flat disc bezel.
    radial('Desk_Clock_Bezel', [
        (.0930, .0630), (.0990, .0630), (.1005, .0645), (.1010, .0670),
        (.1010, .0770), (.1006, .0800), (.0996, .0820), (.0970, .0832),
        (.0935, .0832), (.0924, .0823), (.0924, .0790), (.0930, .0740),
        (.0930, .0630),
    ], nickel, 'satin-metal')
    radial('Desk_Clock_Dial', [
        (0, .0680), (.0900, .0680), (.0920, .0690), (.0920, .0708),
        (.0910, .0716), (0, .0716),
    ], dial, 'paper')

    # The closed crystal is 0.8 mm thick. Its back stays at least 1.2 mm in
    # front of the hub, even in the shallow outer portion of its convex face.
    crystal = radial('Desk_Clock_Crystal', [
        (0, .0840), (.0230, .08395), (.0460, .08380), (.0690, .08355),
        (.0918, .08320), (.0918, .08400), (.0690, .08435),
        (.0460, .08460), (.0230, .08475), (0, .08480),
    ], glass, 'instrument-glass')
    crystal['clock_crystal_thickness'] = .0008

    # Printed indices sit almost flush with enamel; they do not read as tall
    # black blocks. The twelve original names and positions remain available.
    for obj in list(scene.objects):
        if obj.name == 'Desk_Clock_Tick' or obj.name.startswith('Desk_Clock_Tick.'):
            length = max(v.co.z for v in obj.data.vertices)-min(v.co.z for v in obj.data.vertices)
            temp = _box('Clock index construction', (0, 0, 0), (.0024, .00045, length),
                        ink, scene, bevel=.00020, segments=3)
            obj.data = temp.data
            bpy.data.objects.remove(temp, do_unlink=True)
            obj.location.y = -.0722
            tag(obj, 'paper')
    for i in range(60):
        if i % 5 == 0:
            continue
        angle = i*math.tau/60
        obj = _box('Desk_Clock_MinuteIndex',
                   (math.sin(angle)*.0825, -.0722, .013+math.cos(angle)*.0825),
                   (.00075, .00040, .0032), ink, scene, parent=root,
                   bevel=.00012, segments=2)
        obj.rotation_euler.y = angle
        tag(obj, 'paper')
    for name in hand_transforms:
        obj = scene.objects[name]
        obj.data.materials.clear()
        obj.data.materials.append(hands)
        tag(obj, 'satin-metal')
        obj['roomDynamic'] = True
        obj['keepIndependent'] = True
    hub = scene.objects['Desk_Clock_Hand_Hub']
    vertices, faces = _lathe([(0, -.002), (.005, -.002), (.006, -.001),
                              (.006, .001), (.005, .002), (0, .002)], 80)
    _replace(hub, vertices, faces, nickel, smooth=True)
    tag(hub, 'satin-metal')

    bpy.context.view_layer.update()
    assert root.matrix_world == before, 'Clock root transform changed'
    for name, transform in hand_transforms.items():
        assert scene.objects[name].matrix_world == transform, name+' pivot changed'
    return {'bezelSegments': 160, 'caseBevelSegments': 16, 'minuteIndices': 60,
            'crystalThicknessMeters': .0008, 'handTransformsPreserved': True,
            'rootDimensionsPreserved': list(hi-lo), 'glassProfile': 'instrument-glass'}
