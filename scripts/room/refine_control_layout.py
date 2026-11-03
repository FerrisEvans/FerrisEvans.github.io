"""Local hardware/layout corrections on the accepted physical desktop.

Runs after refine_physical and before atlas baking. Coordinates below are
Blender Z-up metres; slider metadata is explicitly glTF Y-up world space.
"""
import math
import bpy
import bmesh
from mathutils import Matrix, Vector
from refine_geometry import _box, _mesh, _activate
from refine_equipment import finish, bounds, subtract, loft, rounded_rect, planar_front_normals
from refine_telephone import refine_telephone


SLIDERS = (
    ('Volume', 'volume', 1.195, 0., 1., .6),
    ('Tracking', 'tracking', 1.135, 0., 1., 0.),
    ('Chroma', 'chroma', 1.075, 0., 1.6, 1.),
)


def monitor_front_lip(obj, text):
    """Round the actual front/side junction, not just the bezel's silhouette.

    The loft has rounded rectangles in its front plane but originally joins
    that plane to the side with a sharp edge. Insert a tangent circular profile
    before the unchanged side/rear rings. A modifier on the boolean cap's
    concave n-gons can fold its corner triangles; an explicit profile avoids
    that ambiguity. A 4.4 mm assembled lip and recessed ABS reveal distinguish
    the fascia from the much thinner rubber seal against the glass.
    """
    radius = .0035
    front = -.257
    slope = .005/.057
    stop = math.atan(1/slope)
    setback = radius*(math.sqrt(1+slope*slope)-slope)
    layers = []
    for i in range(17):
        angle = stop*i/16
        depth = radius*(1-math.cos(angle))
        inset = -setback+radius*math.sin(angle)
        # Preserve the existing rounded-rectangle corner centre as the lip
        # rolls from the front plane onto the original tapered side wall.
        corner = .018+(.007/.057)*depth+inset-slope*depth
        layers.append((front+depth,0,1.228,.656+2*inset,.534+2*inset,corner))
    layers.extend([(-.20,0,1.228,.666,.544,.025),(-.12,0,1.228,.658,.535,.023),
                   (.23,0,1.236,.49,.40,.038),(.33,0,1.236,.46,.37,.035)])
    vertices, faces = loft(layers)
    material = obj.data.materials[0]
    mesh = bpy.data.meshes.new('Monitor shell with continuous front lip')
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj.data = mesh
    # Advance only the moulded front cover. The glass/4:3 display and its
    # interaction corners remain fixed, now genuinely recessed behind it.
    cutter = _box('Monitor unchanged aperture', (0,-.235,1.25), (.526,.18,.406),
                  material, bpy.context.scene, bevel=.021, segments=6)
    cutter.matrix_world = obj.matrix_world @ cutter.matrix_world
    bpy.context.view_layer.update()
    subtract(obj, cutter)
    # Pierce the final shell, after its front-lip replacement. Recessed dark
    # inserts provide depth behind the wall, instead of painted-on vent bars.
    dark=finish('Computer internal vent darkness',(.008,.010,.010),.83,grain=.008)
    def local_box(name,position,size,mat,bevel=.001):
        part=_box(name,position,size,mat,bpy.context.scene,bevel=bevel,segments=4)
        part.matrix_world=obj.matrix_world@part.matrix_world
        part['hero_atlas']='equipment';part['surface_profile']='abs'
        return part
    def reveal(name, rings, mat):
        vertices=[];faces=[]
        for y,width,height,radius in rings:
            vertices.extend((x,y,1.25+z) for x,z in rounded_rect(width,height,radius,steps=24))
        count=len(vertices)//len(rings)
        for ring in range(len(rings)-1):
            for i in range(count):
                j=(i+1)%count
                faces.append((ring*count+j,(ring+1)*count+j,(ring+1)*count+i,ring*count+i))
        part=_mesh(name,vertices,faces,mat,bpy.context.scene,smooth=True)
        part.matrix_world=obj.matrix_world.copy()
        part['hero_atlas']='equipment';part['surface_profile']='abs'
        part.data.set_sharp_from_angle(angle=math.radians(35))
        return part
    old_recess=bpy.data.objects.get('Computer_Recess')
    bpy.data.objects.remove(old_recess,do_unlink=True)
    # The previous graphite reveal stood 20 mm proud of the front cover and
    # made the glass read as a black applique. The ABS funnel is now behind
    # the fascia; only a 2.5 mm gasket borders the existing glass plane.
    # Bury the outer attachment land behind the fascia. Letting even a
    # submillimetre of it cross the front plane creates a second raised ring
    # and self-shadow around what should be one continuous moulded opening.
    reveal('Computer_Recess',[(front+.0008,.538,.418,.026),
            (front+.0015,.525,.405,.021),(-.237,.487,.367,.017),
            (-.229,.483,.363,.016)],material)
    seal=finish('Computer graphite glass gasket',(.009,.012,.011),.69,grain=.008)
    reveal('Computer_GlassSeal',[(-.235,.486,.366,.017),
            (-.233,.480,.360,.015),(-.227,.479,.359,.015)],seal)
    # Separate caps seat in actual pockets; pad-printed legends remain vector
    # meshes, so close views do not depend on their share of the 4K atlas.
    for part in list(bpy.context.scene.objects):
        if part.name.startswith('Computer_MonitorButton'):
            bpy.data.objects.remove(part,do_unlink=True)
    ink=finish('Computer fascia pad-print graphite',(.055,.060,.056),.64,grain=0)
    cap=finish('Computer monitor control ABS',(.49,.49,.44),.43,grain=.012)
    def print_label(name,body,position,size,align='LEFT'):
        label=text(name,body,position,size,ink,rotation=(math.pi/2,0,0),align=align)
        label.matrix_world=obj.matrix_world@label.matrix_world
        label.visible_shadow=False
        return label
    print_label('Computer_Print_MonitorBrand','PRAXIS',(-.267,front-.0008,1.005),.013)
    print_label('Computer_Print_MonitorModel','COLOR DISPLAY / 14',(-.267,front-.0008,.988),.006)
    for title,x in [('BRIGHT',.115),('CONTRAST',.179)]:
        subtract(obj,local_box('Monitor control pocket',(x,front+.001,1.007),(.036,.013,.019),dark,.002))
        local_box('Computer_MonitorButton_'+title,(x,front-.002,1.007),(.030,.010,.013),cap,.0018)
        print_label('Computer_Print_'+title,title,(x,front-.0008,.987),.0052,'CENTER')
    subtract(obj,local_box('Monitor power pocket',(.263,front+.001,1.007),(.023,.014,.023),dark,.002))
    local_box('Computer_MonitorButton_Power',(.263,front-.003,1.007),(.018,.011,.018),cap,.002)
    print_label('Computer_Print_Power','POWER',(.263,front-.0008,.987),.0052,'CENTER')
    lens=finish('Monitor power indicator green resin',(.045,.18,.073),.22,grain=0)
    local_box('Computer_MonitorLED',(.231,front-.001,1.007),(.005,.003,.004),lens,.001)
    for side in (-1,1):
        # Hollow the vent bank parallel to the tapered shell, leaving a 3 mm
        # wall. The previous 30 mm blind bore hid its backing behind a pale
        # return wall from every ordinary side/front viewing angle.
        cavity=local_box('Computer vent air cavity',(0,.0735,1.36),(.057,.265,.110),dark,.001)
        for vertex in cavity.data.vertices:
            y=.0735+vertex.co.y
            half_width=(.658+(.49-.658)*(y+.12)/.35)/2
            vertex.co.x+=side*(half_width-.0315)
        subtract(obj,cavity)
        for i in range(8):
            y=-.035+i*.031
            half_width=(.658+(.49-.658)*(y+.12)/.35)/2
            subtract(obj,local_box('Computer vent cutter',(side*half_width,y,1.36),(.060,.014,.076),dark,.002))
            local_box('Computer_VentBacking',(side*(half_width-.026),y,1.36),(.002,.019,.082),dark)
        subtract(obj,local_box('Computer parting groove',(side*.329,-.118,1.228),(.014,.0020,.435),dark,.0005))
        local_box('Computer_CaseJoint',(side*.323,-.118,1.228),(.002,.0016,.433),dark,.0004)
    subtract(obj,local_box('Computer upper parting groove',(0,-.118,1.4935),(.59,.002,.012),dark,.0005))
    local_box('Computer_CaseJoint_Top',(0,-.118,1.488),(.59,.0016,.002),dark,.0004)
    # Boolean cutters carry their own custom corner normals. Discard those
    # transferred values before rebuilding the shell's sharp edges; otherwise
    # the broad side-panel normal leaks across the narrow vent return lips.
    _activate(obj)
    if obj.data.has_custom_normals:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    bm = bmesh.new()
    try:
        bm.from_mesh(obj.data)
        # Intersecting rounded vent cutters can leave a sub-micron triangular
        # sliver at the final slot. Its winding becomes unstable after the
        # float32 world/local export round trip. Dissolve only vent-bank
        # degeneracies below 0.5 micrometres (the smallest lip is 2 mm), before
        # assigning corner normals; keep every visible opening and bevel.
        vent_edges = [edge for edge in bm.edges if all(
            .22 < abs(vertex.co.x) < .34 and -.065 < vertex.co.y < .215
            and 1.300 < vertex.co.z < 1.420 for vertex in edge.verts)]
        bmesh.ops.dissolve_degenerate(bm, dist=.0000005, edges=vent_edges)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(obj.data)
    finally:
        bm.free()
    return {'localRadiusMeters':radius, 'segments':16, 'sideTangentSlope':slope,
            'screenApertureChanged':False,'recessedSideVents':16,
            'frontPlaneMeters':front,'glassPlaneMeters':-.234,'glassSealWidthMeters':.0025,
            'recessedControlCaps':3,'vectorControlLegends':True}


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
    if obj.name in ('CRT_Case','Computer_Monitor'):
        planar_front_normals(obj)


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
    move('Retro_Phone', (-2.78, -.34, .685))
    move('Desk_Clock', (-1.44, .62, .815))
    monitor_lip = monitor_front_lip(scene.objects['Computer_Monitor'],text)

    # Broad panels need controlled edge normals and differentiated finishes,
    # not stronger procedural noise. Painted steel has a dielectric coating;
    # its underlying metal must not leak into the baked metallic channel.
    shell = surface('CRT satin graphite ABS', (.042, .047, .048), .34)
    fascia = surface('Equipment fine matte fascia', (.026, .031, .032), .43)
    enamel = surface('VCR graphite enamel coating', (.036, .038, .039), .29, grain=.012)
    ivory = surface('Computer satin warm grey ABS', (.57, .55, .49), .36)
    monitor_abs = surface('Monitor fine satin ivory ABS', (.55,.54,.485), .30, grain=.012)
    # Moulded ABS and enamel vary gently in gloss across a panel. This is a
    # finish change, not a dirt mask: colour stays clean and the pores remain
    # finer than the close-up silhouette detail.
    from aging import Surface
    for material,variation in ((shell,.025),(fascia,.020),(enamel,.035),(ivory,.025),(monitor_abs,.022)):
        surface_nodes=Surface(material)
        broad=surface_nodes.math('SUBTRACT',surface_nodes.noise(24),.5)
        surface_nodes.roughness(surface_nodes.math('MULTIPLY',broad,variation))
    for material in (shell,ivory,monitor_abs):
        surface_nodes=Surface(material)
        # Small mould-flow pigment variation over centimetres; preserve the
        # established colours and leave metal/enamel/paper on their own finish.
        pigment=surface_nodes.noise(32)
        surface_nodes.mix_color(surface_nodes.math('MULTIPLY',pigment,.06),(.92,.92,.92),'MULTIPLY')
    keyboard = surface('Keyboard fine texture ABS', (.57, .55, .49), .42, grain=.018)
    mouse = surface('Mouse smooth warm grey ABS', (.57, .55, .49), .32, grain=.010)
    assignments = {'CRT_Case':(shell,'abs'), 'CRT_ControlPanel':(fascia,'abs'),
                   'VCR_Body':(enamel,'painted-metal'), 'VCR_Front':(fascia,'abs'),
                   'Computer_Monitor':(monitor_abs,'abs'), 'Computer_Recess':(monitor_abs,'abs'), 'Computer_Base':(ivory,'abs'),
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
