"""Local hardware/layout corrections on the accepted physical desktop.

Runs after refine_physical and before atlas baking. Coordinates below are
Blender Z-up metres; slider metadata is explicitly glTF Y-up world space.
"""
import math
import bpy
import bmesh
from mathutils import Matrix, Vector
from refine_geometry import _box, _activate
from refine_equipment import finish, bounds, subtract, loft
from refine_telephone import refine_telephone


SLIDERS = (
    ('Volume', 'volume', 1.195, 0., 1., .6),
    ('Tracking', 'tracking', 1.135, 0., 1., 0.),
    ('Chroma', 'chroma', 1.075, 0., 1.6, 1.),
)


def monitor_front_lip(obj):
    """Round the actual front/side junction, not just the bezel's silhouette.

    The loft has rounded rectangles in its front plane but originally joins
    that plane to the side with a sharp edge. Insert a tangent circular profile
    before the unchanged side/rear rings. A modifier on the boolean cap's
    concave n-gons can fold its corner triangles; an explicit profile avoids
    that ambiguity. The existing assembly scale makes this a 7.5 mm lip.
    """
    radius = .006
    slope = .005/.035
    stop = math.atan(1/slope)
    setback = radius*(math.sqrt(1+slope*slope)-slope)
    layers = []
    for i in range(9):
        angle = stop*i/8
        depth = radius*(1-math.cos(angle))
        inset = -setback+radius*math.sin(angle)
        # Preserve the existing rounded-rectangle corner centre as the lip
        # rolls from the front plane onto the original tapered side wall.
        corner = .023+(.002/.035)*depth+inset-slope*depth
        layers.append((-.235+depth,0,1.228,.656+2*inset,.534+2*inset,corner))
    layers.extend([(-.20,0,1.228,.666,.544,.025),(-.12,0,1.228,.658,.535,.023),
                   (.23,0,1.236,.49,.40,.038),(.33,0,1.236,.46,.37,.035)])
    vertices, faces = loft(layers)
    material = obj.data.materials[0]
    mesh = bpy.data.meshes.new('Monitor shell with continuous front lip')
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj.data = mesh
    # The same aperture in the same assembly space preserves the screen's
    # recessed seat, seal, display surface and native control projection.
    cutter = _box('Monitor unchanged aperture', (0,-.235,1.25), (.526,.15,.406),
                  material, bpy.context.scene, bevel=.021, segments=6)
    cutter.matrix_world = obj.matrix_world @ cutter.matrix_world
    bpy.context.view_layer.update()
    subtract(obj, cutter)
    bm = bmesh.new()
    try:
        bm.from_mesh(obj.data)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(obj.data)
    finally:
        bm.free()
    return {'localRadiusMeters':radius, 'segments':8, 'sideTangentSlope':slope,
            'screenApertureChanged':False}


def manufactured_normals(obj):
    """Smooth short bevel bands, keeping manufactured panel breaks sharp.

    Recompute after the keyboard's sloping deck and all boolean work. Existing
    custom normals from a pre-deformation box must not survive that edit.
    """
    mesh = obj.data
    for face in mesh.polygons:
        face.use_smooth = True
    mesh.set_sharp_from_angle(angle=math.radians(45))
    _activate(obj)
    modifier = obj.modifiers.new('Final manufactured surface normals', 'WEIGHTED_NORMAL')
    modifier.keep_sharp = True
    modifier.weight = 50
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def shadowless_surface(material):
    """Receive the room bake without stamping a movable thumb onto its track.

    Object ray visibility would be lost when equipment meshes join for baking.
    A material-local shadow-ray branch survives that join and is restored after
    albedo/ORM extraction by materials.py. Ordinary camera/diffuse rays retain
    the original surface, so the thumb still receives its own irradiance.
    """
    nodes, links = material.node_tree.nodes, material.node_tree.links
    paths = nodes.new('ShaderNodeLightPath')
    transparent = nodes.new('ShaderNodeBsdfTransparent')
    mix = nodes.new('ShaderNodeMixShader')
    mix.name = 'BakeShadowlessSurface'
    links.new(paths.outputs['Is Shadow Ray'], mix.inputs[0])
    links.new(nodes.get('Principled BSDF').outputs[0], mix.inputs[1])
    links.new(transparent.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], nodes.get('Material Output').inputs['Surface'])


def refine_control_layout(scene, text):
    def matches(obj, prefix):
        return obj.name == prefix or obj.name.startswith(prefix + '_') or obj.name.startswith(prefix + '.')

    def remove(prefix):
        objects = {obj for obj in scene.objects if matches(obj, prefix)}
        for obj in list(objects):
            objects.update(obj.children_recursive)
        for obj in objects:
            bpy.data.objects.remove(obj, do_unlink=True)

    def move(prefix, center, yaw_delta=0):
        root = scene.objects[prefix]
        before = root.matrix_world.translation.copy()
        delta = Matrix.Translation(Vector(center)) @ Matrix.Rotation(yaw_delta, 4, 'Z') @ Matrix.Translation(-before)
        objects = {obj for obj in scene.objects if matches(obj, prefix)}
        for obj in objects:
            if obj.parent not in objects:
                obj.matrix_world = delta @ obj.matrix_world
        bpy.context.view_layer.update()

    def surface(name, color, roughness, metallic=0, grain=.014):
        material = finish(name, color, roughness, metallic, grain)
        for node in material.node_tree.nodes:
            if node.type == 'BUMP':
                node.inputs['Distance'].default_value = .000025
                node.inputs['Strength'].default_value = .065
        return material

    def box(name, center, size, material, bevel=.0015, profile='abs'):
        obj = _box(name, center, size, material, scene, bevel=bevel, segments=5)
        obj['hero_atlas'] = 'equipment'
        obj['surface_profile'] = profile
        manufactured_normals(obj)
        return obj

    # Remove the complete physical remote, not only its runtime hit target.
    remove('Desk_Remote')
    remove('Remote_Key')
    remove('CRT_Knob')
    for name in ('Print_CRT_VOLUME', 'Print_CRT_TRACKING', 'Print_CRT_CHROMA'):
        remove(name)

    graphite = surface('Moulded graphite control caps', (.052, .057, .054), .31)
    shadowless_surface(graphite)
    rubber = surface('Slider recess black rubber', (.007, .009, .010), .73, grain=.008)
    scale_ink = surface('Slider warm white scale', (.71, .72, .67), .62, grain=0)
    nickel = surface('Slider brushed nickel rail', (.30, .32, .31), .29, .82, grain=.008)
    slider_report = []
    for title, identifier, height, value_min, value_max, default in SLIDERS:
        # The rail is cut through the existing inset fascia, backed by a dark
        # well. The thumb protrudes only 20 mm beyond the fascia front.
        cutter = _box('Slider aperture cutter', (.35, -.281, height), (.29, .05, .014), rubber, scene, bevel=.004, segments=5)
        subtract(scene.objects['CRT_ControlPanel'], cutter)
        box('CRT_SliderTrack_' + title, (.35, -.275, height), (.294, .008, .019), rubber, .004)
        for z in (height-.0095, height+.0095):
            box('CRT_SliderRail_' + title, (.35, -.290, z), (.290, .003, .002), nickel, .0006, 'satin-metal')
        x = .225 + .250 * (default-value_min)/(value_max-value_min)
        thumb = box('CRT_Slider_' + title, (x, -.304, height), (.030, .020, .024), graphite, .003)
        thumb['roomDynamic'] = True
        thumb['keepIndependent'] = True
        thumb['slider_id'] = identifier
        thumb['slider_coordinate_space'] = 'gltf-world-x'
        thumb['slider_min_x'], thumb['slider_max_x'] = .225, .475
        thumb['slider_value_min'], thumb['slider_value_max'] = value_min, value_max
        thumb['slider_default'], thumb['slider_origin_x'] = default, x
        thumb['slider_surface'] = [[.205,height+.022,.315],[.495,height+.022,.315],
                                   [.495,height-.022,.315],[.205,height-.022,.315]]
        # The vertical index stripe is part of the moving thumb so it cannot
        # stay behind when runtime updates the slider's x position.
        stripe = box('CRT_SliderIndex_' + title, (0, -.0104, 0), (.0016, .001, .015), scale_ink, .0003)
        stripe.parent = thumb
        # Printed children stay independent of the joint atlas and are restored
        # to their original parent after the thumb's baked mesh is separated.
        stripe['surface_role'] = 'print'
        stripe.visible_shadow = False
        stripe['roomDynamic'] = True
        stripe['keepIndependent'] = True
        for i in range(11):
            box('CRT_SliderTick_' + title, (.225+i*.025, -.291, height-.017),
                (.0012, .0015, .005 if i % 5 else .008), scale_ink, .0002)
        text('CRT_SliderLabel_' + title, title.upper(), (.205, -.292, height+.017), .009,
             scale_ink, rotation=(math.pi/2, 0, 0))
        slider_report.append({'object':thumb.name, 'id':identifier, 'default':default,
                              'worldX':[.225,.475], 'originX':x, 'gltfHeight':height,
                              'surface':[list(point) for point in thumb['slider_surface']]})

    # Preserve each object's entire hierarchy, including labels and cord.
    move('Desk_Rolodex', (-1.02, .35, .707))
    telephone = refine_telephone(scene, text)
    telephone.pop('root')
    move('Retro_Phone', (-1.00, -.10, .685))
    move('Desk_Clock', (-1.44, .62, .815))
    monitor_lip = monitor_front_lip(scene.objects['Computer_Monitor'])

    # Broad panels need controlled edge normals and differentiated finishes,
    # not stronger procedural noise. Painted steel has a dielectric coating;
    # its underlying metal must not leak into the baked metallic channel.
    shell = surface('CRT satin graphite ABS', (.042, .047, .048), .34)
    fascia = surface('Equipment fine matte fascia', (.026, .031, .032), .43)
    enamel = surface('VCR graphite enamel coating', (.055, .063, .067), .29, grain=.008)
    ivory = surface('Computer satin warm grey ABS', (.57, .55, .49), .36)
    keyboard = surface('Keyboard fine texture ABS', (.57, .55, .49), .42, grain=.018)
    mouse = surface('Mouse smooth warm grey ABS', (.57, .55, .49), .32, grain=.010)
    assignments = {'CRT_Case':(shell,'abs'), 'CRT_ControlPanel':(fascia,'abs'),
                   'VCR_Body':(enamel,'painted-metal'), 'VCR_Front':(fascia,'abs'),
                   'Computer_Monitor':(ivory,'abs'), 'Computer_Base':(ivory,'abs'),
                   'Computer_Base_Fascia':(ivory,'abs'), 'Computer_Keyboard':(keyboard,'abs'),
                   'Computer_Mouse':(mouse,'abs')}
    for name, (material, profile) in assignments.items():
        obj = scene.objects[name]
        obj.data.materials.clear()
        obj.data.materials.append(material)
        obj['surface_profile'] = profile
        manufactured_normals(obj)
    pbt = surface('PBT letter keys fine moulding', (.72, .70, .63), .46, grain=.012)
    pbt_modifier = surface('PBT modifier keys fine moulding', (.57, .55, .49), .46, grain=.012)
    mouse_button = surface('Mouse button smooth ABS', (.72, .70, .63), .34, grain=.010)
    key_count = 0
    for obj in scene.objects:
        if obj.type != 'MESH' or obj.get('surface_role'):
            continue
        if matches(obj, 'Computer_Key'):
            # Keep the 101-key layout, legends, dishes and smooth cap geometry.
            # Modifiers retain their darker pigment; only the physical finish
            # differs from the glossier mouse and monitor housing.
            material = pbt if obj.data.materials[0].name.startswith('PBT keycaps') else pbt_modifier
            obj.data.materials.clear()
            obj.data.materials.append(material)
            obj['surface_profile'] = 'pbt'
            key_count += 1
        elif matches(obj, 'Computer_Mouse_Button'):
            obj.data.materials.clear()
            obj.data.materials.append(mouse_button)
            obj['surface_profile'] = 'abs'
    assert key_count == 101, ('Expected physical 101-key keyboard', key_count)
    bpy.context.view_layer.update()
    assert not any(matches(obj, prefix) for obj in scene.objects for prefix in ('Desk_Remote','Remote_Key','CRT_Knob'))
    return {'remoteRemoved':True, 'sliders':slider_report, 'telephone':telephone,
            'positionsBlender':{name:list(scene.objects[name].matrix_world.translation) for name in ('Desk_Rolodex','Desk_Clock','Retro_Phone')},
            'finishNormalsRebuilt':list(assignments), 'monitorFrontLip':monitor_lip,
            'pbtKeyCount':key_count, 'enamelMetallic':0}
