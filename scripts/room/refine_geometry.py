"""Round 3 shape corrections, applied to the assembled unbaked material scene.

Usage (after the old leaf-thinning loop and small-prop construction):
    from refine_geometry import refine_geometry
    geometry_report = refine_geometry(scene, {
        'pot': terracotta, 'leaf': leaf_mat, 'wood': frame,
        'crt': crt_plastic, 'dark': black,
    })

The function writes no files and changes no cameras, lighting or interaction IDs.
New leaf/stem details retain their runtime animation prefixes. Existing mesh
transforms survive replacement; every new part is a separate single-material
mesh, compatible with materials.py's source-object atlas separation.
"""
import math
import random

import bpy
from mathutils import Vector

from surfaces import fit_projection, screen_bounds

TAG = 'round3-shape-v1'


def _material(name, color, roughness=.7):
    result = bpy.data.materials.get(name)
    if result:
        return result
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    p = result.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    return result


def _mesh(name, vertices, faces, material, scene, parent=None, smooth=False):
    mesh = bpy.data.meshes.new(name + ' mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    for face in mesh.polygons:
        face.use_smooth = smooth
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj.parent = parent
    obj['geometry_refinement'] = TAG
    return obj


def _replace(obj, vertices, faces, material, smooth=True):
    mesh = bpy.data.meshes.new(obj.name + ' refined mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    for face in mesh.polygons:
        face.use_smooth = smooth
    obj.data = mesh


def _activate(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def _box(name, location, dimensions, material, scene, parent=None, bevel=.001, segments=3):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.object
    obj.name, obj.parent, obj.location = name, parent, location
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    obj['geometry_refinement'] = TAG
    if bevel:
        mod = obj.modifiers.new('Manufactured edge', 'BEVEL')
        mod.width, mod.segments = bevel, segments
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod = obj.modifiers.new('Planar face normals', 'WEIGHTED_NORMAL')
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def _lathe(profile, segments=96):
    vertices, rings, faces = [], [], []
    for radius, z in profile:
        ring = []
        for i in range(segments if radius else 1):
            ring.append(len(vertices))
            angle = i * math.tau / segments
            vertices.append((radius * math.cos(angle), radius * math.sin(angle), z))
        rings.append(ring)
    for low, high in zip(rings, rings[1:]):
        for i in range(segments):
            j = (i + 1) % segments
            if len(low) == 1:
                faces.append((low[0], high[j], high[i]))
            elif len(high) == 1:
                faces.append((low[i], low[j], high[0]))
            else:
                faces.append((low[i], low[j], high[j], high[i]))
    return vertices, faces


def _tube(points, radius, segments=8):
    vertices, faces = [], []
    for i, point in enumerate(points):
        direction = (points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]).normalized()
        tangent = direction.cross(Vector((0, 1, 0)))
        if tangent.length < .01:
            tangent = direction.cross(Vector((1, 0, 0)))
        tangent.normalize()
        normal = direction.cross(tangent).normalized()
        taper = 1 - .40 * i / max(1, len(points) - 1)
        for j in range(segments):
            angle = j * math.tau / segments
            vertices.append(point + radius * taper * (tangent * math.cos(angle) + normal * math.sin(angle)))
    for i in range(len(points) - 1):
        for j in range(segments):
            a, b = i * segments + j, i * segments + (j + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    faces.append(tuple(reversed(range(segments))))
    faces.append(tuple((len(points) - 1) * segments + j for j in range(segments)))
    return vertices, faces


def _group_bounds(objects, scene):
    bounds = [screen_bounds(obj, scene) for obj in objects]
    return (min(b[0] for b in bounds), min(b[1] for b in bounds),
            max(b[2] for b in bounds), max(b[3] for b in bounds))


def _leaf_surface(source):
    """A soft midrib baked into the blade, independent of atlas UV packing.

    Smart-project later replaces all UV layers. The named point attribute is
    instead interpolated on the leaf and survives solidify/join/separation.
    """
    result = source.copy()
    result.name = 'Leaves with subtle baked midrib'
    nodes, links = result.node_tree.nodes, result.node_tree.links
    shader = nodes.get('Principled BSDF')
    attribute = nodes.new('ShaderNodeAttribute')
    attribute.attribute_name = 'LeafCoordinates'
    attribute.attribute_type = 'GEOMETRY'
    axes = nodes.new('ShaderNodeSeparateXYZ')
    links.new(attribute.outputs['Vector'], axes.inputs[0])
    absolute = nodes.new('ShaderNodeMath'); absolute.operation = 'ABSOLUTE'
    links.new(axes.outputs['X'], absolute.inputs[0])
    def ramp(value, start, end, low, high):
        node = nodes.new('ShaderNodeMapRange')
        node.clamp = True; node.interpolation_type = 'SMOOTHSTEP'
        for key, number in [('From Min', start), ('From Max', end), ('To Min', low), ('To Max', high)]:
            node.inputs[key].default_value = number
        links.new(value, node.inputs['Value'])
        return node.outputs[0]
    def multiply(left, right):
        node = nodes.new('ShaderNodeMath'); node.operation = 'MULTIPLY'
        links.new(left, node.inputs[0])
        if isinstance(right, (float, int)):
            node.inputs[1].default_value = right
        else:
            links.new(right, node.inputs[1])
        return node.outputs[0]
    mask = ramp(absolute.outputs[0], .002, .020, 1, 0)
    mask = multiply(mask, ramp(axes.outputs['Y'], .03, .15, 0, 1))
    mask = multiply(mask, ramp(axes.outputs['Y'], .72, .97, 1, 0))
    color = shader.inputs['Base Color']
    original = color.links[0].from_socket if color.is_linked else None
    mix = nodes.new('ShaderNodeMixRGB')
    links.new(multiply(mask, .10), mix.inputs[0])
    if original:
        links.new(original, mix.inputs[1])
    else:
        mix.inputs[1].default_value = color.default_value
    mix.inputs[2].default_value = (.065, .125, .025, 1)
    links.new(mix.outputs[0], color)
    roughness = shader.inputs['Roughness']
    original = roughness.links[0].from_socket if roughness.is_linked else None
    addition = nodes.new('ShaderNodeMath'); addition.operation = 'ADD'
    if original:
        links.new(original, addition.inputs[0])
    else:
        addition.inputs[0].default_value = roughness.default_value
    links.new(multiply(mask, .025), addition.inputs[1])
    links.new(addition.outputs[0], roughness)
    return result


def refine_geometry(scene, materials=None):
    """Return geometric evidence; safe to call once per fresh materials scene.

    Optional material keys: pot, leaf, stem, wood, crt, dark, soil. Caller-owned
    materials are reused; newly needed soil/vein materials are deterministic.
    """
    supplied = materials or {}
    for obj in list(scene.objects):
        if obj.get('geometry_refinement') == TAG:
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.context.view_layer.update()
    objects = bpy.data.objects
    pot, case, panel = objects['Plant_Pot'], objects['CRT_Case'], objects['CRT_ControlPanel']
    leaves = sorted([o for o in scene.objects if o.type == 'MESH' and (o.name == 'Plant_Leaf' or o.name.startswith('Plant_Leaf.'))], key=lambda o: o.name)
    stems = sorted([o for o in scene.objects if o.type == 'MESH' and (o.name == 'Plant_Stem' or o.name.startswith('Plant_Stem.'))], key=lambda o: o.name)
    assert len(leaves) == len(stems) == 7, 'Expected the original seven leaf/stem pairs'
    material = lambda key, obj: supplied.get(key, obj.data.materials[0])
    pot_mat, leaf_mat = material('pot', pot), material('leaf', leaves[0])
    wood = material('wood', objects['Window_Sill'])
    crt, dark = material('crt', case), supplied.get('dark', objects['CRT_Recess'].data.materials[0])
    soil = supplied.get('soil') or _material('Refined organic potting soil', (.023, .013, .006), .97)
    leaf_mat = _leaf_surface(leaf_mat)
    report = {'before': {'pot': screen_bounds(pot, scene), 'plant': _group_bounds(leaves, scene), 'crt': screen_bounds(case, scene)}, 'parts': {}}
    camera_matrix, lens = scene.camera.matrix_world.copy(), scene.camera.data.lens

    # A closed ceramic vessel: narrower foot and mouth, rounded belly, rolled
    # lip and an actual inside wall/floor. Its maximum radius/height stay fixed.
    profile = [(0, -.275), (.142, -.275), (.162, -.267), (.193, -.235),
               (.225, -.177), (.246, -.095), (.250, -.015), (.243, .080),
               (.226, .165), (.212, .215), (.213, .246), (.226, .257),
               (.230, .266), (.225, .275), (.202, .275), (.195, .266),
               (.196, .245), (.196, .214), (.211, .154), (.226, .070),
               (.232, -.014), (.228, -.090), (.207, -.172), (.177, -.225),
               (.151, -.242), (0, -.242)]
    vertices, faces = _lathe(profile)
    _replace(pot, vertices, faces, pot_mat)
    soil_vertices, soil_faces = [(0, 0, .218)], []
    rng = random.Random(311)
    for ring in range(1, 5):
        for i in range(64):
            angle, radius = i * math.tau / 64, .188 * ring / 4
            soil_vertices.append((radius * math.cos(angle), radius * math.sin(angle), .217 + rng.uniform(-.004, .003)))
    for i in range(64):
        soil_faces.append((0, 1 + i, 1 + (i + 1) % 64))
    for ring in range(3):
        for i in range(64):
            a, b = 1 + ring * 64 + i, 1 + ring * 64 + (i + 1) % 64
            soil_faces.append((a, a + 64, b + 64, b))
    _mesh('Plant_Pot_Soil', soil_vertices, soil_faces, soil, scene, pot, True)

    # Broad ovate blades with asymmetric taper, folding, twist and droop. The
    # input object transforms survive, so established animation names stay valid.
    lengths = [.57, .49, .60, .51, .55, .47, .50]
    widths = [.32, .27, .31, .30, .33, .26, .28]
    directions = [(.70, -.20, .50), (-.55, -.25, .90), (.12, .25, 1),
                  (-.85, .05, .40), (.80, -.10, .28), (-.15, -.35, 1), (-.60, .25, .65)]
    leaf_bases = []
    for index, obj in enumerate(leaves):
        length, width = lengths[index], widths[index]
        axis = Vector(directions[index]).normalized()
        lateral = axis.cross(Vector((-.10, -1, .07))).normalized()
        normal = lateral.cross(axis).normalized()
        center = obj.matrix_world.translation.copy()
        base = center - axis * length * .43
        inverse = obj.matrix_world.inverted()
        phase = index * 1.73
        def point(t, u):
            taper = max(0, math.sin(math.pi * t)) ** .70
            edge = width * .5 * taper * (1 + .055 * math.sin(phase + t * 21))
            edge *= 1 + .09 * u * math.sin(phase + t * 5)
            centerline = base + axis * length * t + lateral * math.sin(math.pi * t) * (.016 * math.sin(phase))
            bend = normal * ((.045 + .015 * (index % 3)) * t * t - .018 * math.sin(math.pi * t))
            fold = normal * (.017 * abs(u) ** 1.6 * math.sin(math.pi * t) + u * .015 * t * math.sin(phase))
            ridge = normal * .0012 * math.exp(-abs(u) * 12) * math.sin(math.pi * t)
            return centerline + bend + lateral * edge * u + fold + ridge
        verts, quads = [], []
        for row in range(25):
            t = .001 + .998 * row / 24
            for col in range(9):
                verts.append(inverse @ point(t, -1 + col / 4))
        for row in range(24):
            for col in range(8):
                a = row * 9 + col
                quads.append((a, a + 9, a + 10, a + 1))
        temporary = _mesh('Temporary leaf blade', [obj.matrix_world @ p for p in verts], quads, leaf_mat, scene, smooth=True)
        coordinates = temporary.data.attributes.new('LeafCoordinates', 'FLOAT_VECTOR', 'POINT')
        for row in range(25):
            for col in range(9):
                coordinates.data[row * 9 + col].vector = (-1 + col / 4, .001 + .998 * row / 24, 0)
        _activate(temporary)
        shell = temporary.modifiers.new('Thin leathery blade', 'SOLIDIFY')
        # Apply thickness in world units before restoring the original scaled
        # object frame; the old ellipsoid scales are strongly anisotropic.
        shell.thickness, shell.offset = .0007, 0
        bpy.ops.object.modifier_apply(modifier=shell.name)
        obj.data = temporary.data
        obj.data.transform(inverse)
        bpy.data.objects.remove(temporary, do_unlink=True)
        leaf_bases.append((obj, inverse @ point(.001, 0)))

    # Keep the previous whole-plant camera footprint while changing its shape.
    bpy.context.view_layer.update()
    target, current = report['before']['plant'], _group_bounds(leaves, scene)
    for obj in [part for leaf, _ in leaf_bases for part in [leaf, *leaf.children] if part.type == 'MESH']:
        bounds = screen_bounds(obj, scene)
        projected_target = (target[0] + (bounds[0] - current[0]) / (current[2] - current[0]) * (target[2] - target[0]),
                            target[1] + (bounds[1] - current[1]) / (current[3] - current[1]) * (target[3] - target[1]),
                            target[0] + (bounds[2] - current[0]) / (current[2] - current[0]) * (target[2] - target[0]),
                            target[1] + (bounds[3] - current[1]) / (current[3] - current[1]) * (target[3] - target[1]))
        fit_projection(obj, projected_target, scene)
    # Petioles join the soil to each blade's actual lower edge, not its centre.
    soil_origin = pot.matrix_world @ Vector((0, 0, .218))
    for index, (leaf, stem) in enumerate(zip(leaves, stems)):
        bottom = sum((leaf.matrix_world @ leaf.data.vertices[j].co for j in range(9)), Vector()) / 9
        start = soil_origin + Vector((math.cos(index * 2.4) * .024, math.sin(index * 2.4) * .024, 0))
        points = [start.lerp(bottom, t) + Vector((.015 * math.sin(index) * math.sin(t * math.pi), 0, .012 * math.sin(t * math.pi))) for t in [j / 12 for j in range(13)]]
        vv, ff = _tube(points, .0045, 8)
        inverse = stem.matrix_world.inverted()
        _replace(stem, [inverse @ p for p in vv], ff, material('stem', stem))

    # Restore the reference's broad central mullion and split upper crossrail.
    upright = min([o for o in scene.objects if o.name.startswith('Window_Upright')], key=lambda o: abs(o.location.x + .24))
    substitute = _box('Temporary central mullion', (-.267, 1, 2.53), (.285, .17, 2.65), wood, scene, bevel=.005)
    upright.data = substitute.data; upright.location = substitute.location.copy()
    bpy.data.objects.remove(substitute, do_unlink=True)
    rail = min([o for o in scene.objects if o.name.startswith('Window_Rail')], key=lambda o: abs(o.location.z - 3.05))
    substitute = _box('Temporary upper crossrail', (-.25, 1, 3.078), (4.10, .17, .055), wood, scene, bevel=.004)
    rail.data = substitute.data; rail.location = substitute.location.copy()
    bpy.data.objects.remove(substitute, do_unlink=True)
    _box('Window_Rail_SashLower', (-.25, .99, 2.94), (4.10, .15, .055), wood, scene, bevel=.004)
    for post in [o for o in scene.objects if o.name.startswith('Window_Upright')]:
        half = max(abs(v.co.x) for v in post.data.vertices)
        for side in (-1, 1):
            _box('Window_GlazingBead', (post.location.x + side * (half - .006), .899, 2.53), (.014, .021, 2.60), wood, scene, bevel=.002)
    for z in (3.078, 2.94):
        _box('Window_GlazingBead_Horizontal', (-.25, .897, z - .024), (4.03, .020, .014), wood, scene, bevel=.0018)
    join_mat = _material('Oak recessed joints', (.055, .031, .011), .72)
    _box('Window_Sill_Joint', (-.25, .782, 1.218), (4.15, .002, .001), join_mat, scene, bevel=0)
    _box('Window_Sill_FrontBead', (-.25, .642, 1.192), (4.19, .012, .017), wood, scene, bevel=.002)

    # Tighter case corners and a genuine shallow control recess. World-space
    # controls move into the inset by millimetres; their names/order survive.
    target = report['before']['crt']
    mins = Vector(tuple(min(v.co[i] for v in case.data.vertices) for i in range(3)))
    maxs = Vector(tuple(max(v.co[i] for v in case.data.vertices) for i in range(3)))
    substitute = _box('Temporary CRT shell', (0, 0, 0), maxs - mins, crt, scene, bevel=.018)
    case.data = substitute.data
    for v in case.data.vertices:
        v.co += (mins + maxs) / 2
    bpy.data.objects.remove(substitute, do_unlink=True)
    panel_points = [panel.matrix_world @ v.co for v in panel.data.vertices]
    pmin = Vector(tuple(min(v[i] for v in panel_points) for i in range(3)))
    pmax = Vector(tuple(max(v[i] for v in panel_points) for i in range(3)))
    cutter = _box('Temporary control cavity', ((pmin.x + pmax.x) / 2, -.295, (pmin.z + pmax.z) / 2), (pmax.x - pmin.x + .022, .10, pmax.z - pmin.z + .024), dark, scene, bevel=.009)
    _activate(case)
    cut = case.modifiers.new('Inset control cavity', 'BOOLEAN'); cut.operation = 'DIFFERENCE'; cut.solver = 'EXACT'; cut.object = cutter
    bpy.ops.object.modifier_apply(modifier=cut.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    panel.location.y += .035
    for obj in scene.objects:
        if obj.name.startswith('CRT_Button') or obj.name == 'CRT_Power':
            obj.location.y += .033
        elif obj.name.startswith('CRT_Knob'):
            obj.location.y += .060
        elif obj.name == 'CRT_PowerLED':
            obj.location.y += .046
        elif obj.name.startswith(('Print_CRT_Button', 'Print_CRT_VOLUME', 'Print_CRT_TRACKING', 'Print_CRT_CHROMA', 'Print_CRT_Power')):
            obj.location.y += .037
    fit_projection(case, target, scene)
    # Boolean interpolation and the projection fit must not retain the weighted
    # corner normals from the temporary cube. They can turn a large front-face
    # triangle into a false silver highlight. Rebuild a clean, flat-shaded mesh:
    # broad shell planes stay planar, while the three bevel bands shade locally.
    clean_vertices = [v.co.copy() for v in case.data.vertices]
    clean_faces = [tuple(face.vertices) for face in case.data.polygons]
    _replace(case, clean_vertices, clean_faces, crt, smooth=False)
    case.data.calc_loop_triangles()
    for side in (-1, 1):
        _box('CRT_Case_SplitSide', (side * .578, .13, 1.535), (.0015, .0025, 1.10), dark, scene, bevel=.0004)
        for i in range(9):
            _box('CRT_Case_SideVent', (side * .578, .205, 1.56 + i * .029), (.0015, .16, .006), dark, scene, bevel=.0005)
    _box('CRT_Case_SplitTop', (0, .13, 2.125), (1.10, .0025, .0015), dark, scene, bevel=.0004)
    # The computer fills most of the About view; three bevel facets are clearly
    # visible there even though they disappear in the Home composition.
    for name, radius in [('Computer_Monitor', .04), ('Computer_Recess', .04)]:
        obj = objects[name]
        low = Vector(tuple(min(v.co[i] for v in obj.data.vertices) for i in range(3)))
        high = Vector(tuple(max(v.co[i] for v in obj.data.vertices) for i in range(3)))
        rounded = _box('Temporary close-view computer', (0,0,0), high-low, obj.data.materials[0], scene, bevel=radius, segments=8)
        obj.data = rounded.data
        for vertex in obj.data.vertices:
            vertex.co += (low+high)/2
        bpy.data.objects.remove(rounded, do_unlink=True)
    bpy.context.view_layer.update()
    assert scene.camera.matrix_world == camera_matrix and scene.camera.data.lens == lens
    report['after'] = {'pot': screen_bounds(pot, scene), 'plant': _group_bounds(leaves, scene), 'crt': screen_bounds(case, scene), 'centralMullion': screen_bounds(upright, scene)}
    report['parts'] = {'leaves': [obj.name for obj in leaves], 'stems': [obj.name for obj in stems], 'newMeshes': sum(o.get('geometry_refinement') == TAG for o in scene.objects), 'potWallNominalMillimeters': 18, 'potLipThicknessMillimeters': 23, 'caseCornerRadiusMillimeters': 18, 'caseCustomNormals': case.data.has_custom_normals, 'leafVeinTubes': 0, 'leafMidribAttribute': 'LeafCoordinates'}
    return report
