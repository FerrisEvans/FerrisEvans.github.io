"""GPO 332-inspired telephone, constructed in its own unrotated local frame.

Reference: Science Museum Group 1983-517 (130 x 240 x 220 mm overall),
https://collection.sciencemuseumgroup.org.uk/objects/co33712/post-office-332-telephone-1938
Form reference: Paul Follet's photographs of a 1947 Siemens Brothers 332,
https://www.britishtelephones.com/t332pics.htm (front, rear, handset removed).
The photos are references only; no downloaded image enters the asset pipeline.

The room's keyboard pitch is twice life size. All parts, including lettering
and cord, therefore use one SCALE=2 assembly transform about base z=.685.
The root is a real mesh named Retro_Phone at (0,0,.685), facing Blender -Y.
Invoke after the old phone has been made, then position the returned root.
No file, camera, light, render setting or asset manifest is changed here.
"""
import math
import bpy
import bmesh
from mathutils import Matrix, Vector
from aging import Surface
from refine_geometry import _mesh, _box, _lathe, _activate
from refine_equipment import finish, subtract

BASE_Z = .685
SCALE = 2.


def _smooth_path(values, steps=6):
    """Catmull-Rom samples, with mirrored end tangents instead of flat caps."""
    result = []
    points = [Vector(value) for value in values]
    for i in range(len(points)-1):
        a, b = points[i], points[i+1]
        before = points[i-1] if i else a+(a-b)
        after = points[i+2] if i+2<len(points) else b+(b-a)
        for j in range(steps):
            t = j/steps
            result.append(.5*((2*a)+(-before+b)*t+(2*before-5*a+4*b-after)*t*t+(-before+3*a-3*b+after)*t*t*t))
    result.append(points[-1])
    return result


def _closed_loft(rings):
    count = len(rings[0])
    vertices = [point for ring in rings for point in ring]
    faces = []
    for row in range(len(rings)-1):
        for i in range(count):
            j = (i+1)%count
            faces.append((row*count+i,row*count+j,(row+1)*count+j,(row+1)*count+i))
    faces += [tuple(reversed(range(count))), tuple(range((len(rings)-1)*count,len(vertices)))]
    return vertices, faces


def _outward(obj):
    bm = bmesh.new()
    try:
        bm.from_mesh(obj.data)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(obj.data)
    finally:
        bm.free()
    obj.data.update()


def _panel_normals(obj):
    """Keep broad moulded planes flat without faceting their short rollovers."""
    previous=obj.data.attributes.get('custom_normal')
    if previous is not None:
        obj.data.attributes.remove(previous)
    obj.data.set_sharp_from_angle(angle=math.radians(45))
    _activate(obj)
    modifier=obj.modifiers.new('Telephone manufactured face normals','WEIGHTED_NORMAL')
    modifier.keep_sharp=True
    modifier.weight=35
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def refine_telephone(scene, text):
    """Return the root Object3D and measured local/world bounds for placement."""
    old = {obj for obj in scene.objects if obj.name=='Retro_Phone' or obj.name.startswith(('Retro_Phone_', 'Retro_Phone.'))}
    for obj in list(old):
        old.update(obj.children_recursive)
    for obj in old:
        bpy.data.objects.remove(obj, do_unlink=True)

    def polish(name, roughness):
        material = finish(name, (.012,.0105,.009), roughness, grain=.012)
        for node in material.node_tree.nodes:
            if node.type=='BUMP':
                node.inputs['Distance'].default_value=.000012
                node.inputs['Strength'].default_value=.045
        return material
    bakelite = polish('Telephone polished black phenolic', .245)
    grip_finish = polish('Telephone handled phenolic', .205)
    rubber = finish('Telephone vulcanised rubber', (.008,.009,.008), .75, grain=.012)
    nickel = finish('Telephone polished nickel dial', (.60,.62,.59), .22, .92, grain=.008)
    dark_metal = finish('Telephone painted steel bottom plate', (.012,.014,.012), .46, grain=.01)
    paper = finish('Telephone ivory dial card', (.77,.73,.60), .88, grain=.014)
    ink = finish('Telephone dial ink', (.012,.009,.007), .76, grain=0)
    cord_material = finish('Telephone brown woven cord', (.068,.039,.022), .86, grain=.035)
    cord_surface = Surface(cord_material)
    fine = cord_surface.noise(1600)
    bump = cord_surface.n.new('ShaderNodeBump')
    bump.inputs['Distance'].default_value=.000055
    bump.inputs['Strength'].default_value=.16
    cord_surface.l.new(fine,bump.inputs['Height'])
    cord_surface.l.new(bump.outputs[0],cord_surface.p.inputs['Normal'])
    handset_cord=finish('Telephone flexible charcoal handset cord',(.017,.015,.013),.48,grain=.010)

    def tag(obj, profile='abs', parent=None):
        obj['hero_atlas']='equipment'
        obj['surface_profile']=profile
        if parent is not None:
            obj.parent=parent
        return obj

    # Sections of the actual moulded shell: broad lower skirt, narrower waist,
    # sloping dial shelf, and rounded shoulders returning to the rear wings.
    # The dial's working area follows z=.060+.5*y, so its bezel cannot float.
    stations = [(-.094,.080,.077,.022),(-.088,.088,.081,.023),
                (-.073,.089,.078,.0235),(-.050,.089,.073,.035),
                (-.020,.089,.069,.050),(.010,.089,.066,.065),
                (.040,.089,.067,.080),(.060,.088,.071,.088),
                (.078,.086,.075,.088),(.090,.080,.074,.085)]
    rings = []
    for y, lower, upper, height in _smooth_path(stations):
        # A single closed cross-section, with several shoulder samples rather
        # than a beveled rectangular block with a tilted top face.
        # A convex cubic section joins the upright skirt to the dial shelf.
        # The previous clamped shoulder collapsed abruptly on the low front
        # stations, leaving a concave pinch that looked like crumpled foil.
        right=[(lower-.002,.008)]
        for i in range(1,5):
            a=math.pi*.5*i/4
            right.append((lower-.002+.002*math.sin(a),.010-.002*math.cos(a)))
        control=((lower,.010),(lower,.010+.45*(height-.010)),
                 (upper,height),(upper-.004,height))
        for i in range(1,13):
            t=i/12;s=1-t
            right.append(tuple(s**3*control[0][axis]+3*s*s*t*control[1][axis]
                         +3*s*t*t*control[2][axis]+t**3*control[3][axis]for axis in (0,1)))
        cross = [(-right[0][0],right[0][1]),*right,(upper*.55,height),(0,height),
                 (-upper*.55,height),*[(-x,z)for x,z in reversed(right[1:])]]
        rings.append([(x,y,z) for x,z in cross])
    vertices, faces = _closed_loft(rings)
    root = tag(_mesh('Retro_Phone',vertices,faces,bakelite,scene,smooth=True))
    root.location=(0,0,BASE_Z)
    _outward(root)
    _activate(root)
    rounded=root.modifiers.new('Continuous phenolic shell rollovers','SUBSURF')
    rounded.levels=1
    bpy.ops.object.modifier_apply(modifier=rounded.name)
    for polygon in root.data.polygons:
        if len(polygon.vertices)>4:
            polygon.use_smooth=False
    # The loft already contains the curved shoulder and skirt. Face-area
    # weighting pulled its narrow rollover normals towards the broad shelf,
    # producing pinched, foil-like highlights at the front corners.
    root.data.set_sharp_from_angle(angle=math.radians(60))

    def mesh(name, vertices, faces, material, profile='abs', smooth=True):
        obj=tag(_mesh('Retro_Phone_'+name,vertices,faces,material,scene,smooth=smooth),profile,root)
        _outward(obj)
        return obj
    def box(name, center, size, material, radius=.001, profile='abs'):
        return tag(_box('Retro_Phone_'+name,center,size,material,scene,parent=root,bevel=radius,segments=5),profile)
    def lathe(name, center, profile_points, material, profile='abs', transform=None, segments=64):
        closed_ring=profile_points[0][0]>0 and profile_points[-1][0]>0
        if closed_ring and profile_points[-1]!=profile_points[0]:
            profile_points=[*profile_points,profile_points[0]]
        vertices,faces=_lathe(profile_points,segments)
        rotation=transform or Matrix.Identity(3)
        obj=mesh(name,[Vector(center)+rotation@Vector(p) for p in vertices],faces,material,profile)
        if closed_ring:
            bm=bmesh.new()
            try:
                bm.from_mesh(obj.data)
                bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
                bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
                bm.to_mesh(obj.data)
            finally:
                bm.free()
        return obj
    def cylinder(name, center, radius, depth, material, profile='abs', rotation=None, vertices=64):
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth)
        obj=bpy.context.object;obj.name='Retro_Phone_'+name;obj.parent=root;obj.location=center
        if rotation is not None:obj.rotation_euler=rotation
        obj.data.materials.append(material)
        return tag(obj,profile)
    def wire(name, points, radius, material, profile='abs', poly=False):
        # Keep the flex gauge constant, including a sampled helical lead.
        curve=bpy.data.curves.new('Retro_Phone_'+name,'CURVE')
        curve.dimensions='3D';curve.resolution_u=12;curve.bevel_depth=radius;curve.bevel_resolution=2;curve.use_fill_caps=True
        spline=curve.splines.new('POLY' if poly else 'BEZIER')
        if poly:
            spline.points.add(len(points)-1)
            for point,position in zip(spline.points,points):point.co=(*position,1)
        else:
            spline.bezier_points.add(len(points)-1)
            for point,position in zip(spline.bezier_points,points):
                point.co=position;point.handle_left_type=point.handle_right_type='AUTO'
        obj=bpy.data.objects.new('Retro_Phone_'+name,curve);scene.collection.objects.link(obj)
        obj.parent=root;obj.data.materials.append(material);_activate(obj)
        bpy.ops.object.convert(target='MESH')
        if 'Cord' in name:
            for vertex in obj.data.vertices:
                vertex.co.z=max(0,vertex.co.z)
        return tag(obj,profile)

    box('BasePlate',(0,-.002,.007),(.174,.182,.009),dark_metal,.004,'painted-metal')
    for x in (-.067,.067):
        for y in (-.071,.069):
            lathe('Foot',(x,y,0),[(0,0),(.010,0),(.011,.002),(.010,.006),(0,.006)],rubber)
    # The slightly inset real steel bottom plate makes the parting line. A
    # separate outline tube would hover where the curved body narrows.
    box('DirectoryTray',(0,-.0945,.0145),(.120,.002,.009),bakelite,.001)
    box('TrayPull',(0,-.097,.0135),(.023,.006,.005),bakelite,.0018)

    # Thick moulded cradle cheeks with a true open saddle, not two thin posts.
    for x in (-.055,.055):
        # Bury the lower rollover inside the case, so the exposed shoulder is
        # one upright moulded wall rather than a rounded block perched on it.
        cheek=box('Cradle',(x,.055,.101),(.014,.047,.049),bakelite,.003)
        cutter=cylinder('CradleCut',(x,.055,.1235),.014,.032,rubber,rotation=(0,math.pi/2,0),vertices=64)
        bpy.context.view_layer.update();subtract(cheek,cutter)
        for polygon in cheek.data.polygons:polygon.use_smooth=True
        _outward(cheek);_panel_normals(cheek)
        cylinder('SwitchHook',(x,.055,.1085),.0022,.012,nickel,'satin-metal',rotation=(0,math.pi/2,0),vertices=32)

    # A continuous, variable-section phenolic moulding joins both end housings.
    # The middle is broad and flattened for a palm; it is not a cylinder or bar.
    handset_sections=[(-.119,.003,.003,.102),(-.114,.014,.011,.105),
                      (-.105,.024,.017,.108),(-.093,.027,.019,.110),
                      (-.079,.024,.016,.112),(-.066,.018,.011,.116),
                      (-.049,.014,.009,.120),(-.026,.013,.009,.121),
                      (0,.014,.009,.121),(.026,.013,.009,.121),
                      (.049,.014,.009,.120),(.066,.018,.011,.116),
                      (.079,.024,.016,.112),(.093,.027,.019,.110),
                      (.105,.024,.017,.108),(.114,.014,.011,.105),(.119,.003,.003,.102)]
    rings=[]
    for x,half_y,half_z,z in _smooth_path(handset_sections,5):
        rings.append([(x,.055+half_y*math.cos(a),z+half_z*math.sin(a))for a in [math.tau*i/40 for i in range(40)]])
    vertices,faces=_closed_loft(rings)
    handset=mesh('Handset',vertices,faces,grip_finish)
    # Distinct receiver and deeper transmitter cap, with real threaded parting
    # lips. A shallow open mouth bowl remains visible from the front/underside.
    lathe('ReceiverCap',(-.093,.055,0),[(0,.101),(.023,.101),(.027,.098),(.0285,.092),
          (.0285,.088),(.027,.084),(.020,.082),(0,.082)],grip_finish)
    lathe('Mouthpiece',(.093,.055,0),[(0,.101),(.024,.101),(.028,.097),(.029,.090),
          (.028,.084),(.024,.077),(.021,.076),(.020,.080),(.016,.087),(0,.089)],grip_finish)
    for x in (-.093,.093):
        lathe('HandsetCapSeam',(x,.055,0),[(.0265,.0978),(.0273,.0978),(.0273,.0985),(.0265,.0985)],rubber)
    lathe('ReceiverDiaphragm',(-.093,.055,0),[(0,.0817),(.017,.0817),(.017,.0821),(0,.0821)],rubber)
    lathe('TransmitterMesh',(.093,.055,0),[(0,.0885),(.014,.0885),(.014,.089),(0,.089)],rubber)

    tilt=math.atan(.5)
    rotation=Matrix.Rotation(tilt,3,'X')
    center=Vector((0,-.018,.051))
    def dial_point(x,y,z):return center+rotation@Vector((x,y,z))
    # The ivory number plate sits in a real recess. A full bezel cap at .006
    # occupied exactly the same plane as the paper and caused torn black/ivory
    # stripes inside every finger hole in both Cycles and the delivered GLB.
    lathe('DialBezel',center,[(0,.0005),(.042,.0005),(.046,.002),(.046,.004),
          (.044,.006),(.0435,.006),(.0435,.0045),(0,.0045)],bakelite,transform=rotation,segments=96)
    lathe('DialNumberPlate',center,[(0,.005),(.043,.005),(.043,.006),(0,.006)],paper,'paper',rotation,96)
    wheel=lathe('DialWheel',center,[(.018,.008),(.0425,.008),(.044,.0087),(.044,.010),
          (.0425,.011),(.018,.011)],nickel,'satin-metal',rotation,128)
    for number in range(10):
        angle=math.radians(38+number*29)
        x,y=.033*math.cos(angle),.033*math.sin(angle)
        cutter=cylinder('FingerHoleCut',dial_point(x,y,.0095),.0073,.014,rubber,rotation=(tilt,0,0),vertices=48)
        bpy.context.view_layer.update();subtract(wheel,cutter)
        label=text('Retro_Phone_DialNumber_'+str((number+1)%10),str((number+1)%10),
                   dial_point(x,y-.0032,.00625),.0084,ink,root,rotation=(tilt,0,0),align='CENTER')
        label['hero_atlas']='equipment';label['surface_role']='print'
    # Boolean intersections on a curved wall can leave almost-collinear
    # slivers at nanometre scale. Remove those before normals/export instead
    # of retaining triangles whose winding changes with float rounding.
    bm=bmesh.new()
    try:
        bm.from_mesh(wheel.data)
        bmesh.ops.triangulate(bm,faces=list(bm.faces),quad_method='BEAUTY',ngon_method='EAR_CLIP')
        bmesh.ops.dissolve_degenerate(bm,dist=1e-7,edges=list(bm.edges))
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(wheel.data)
    finally:
        bm.free()
    for polygon in wheel.data.polygons:polygon.use_smooth=True
    _panel_normals(wheel)
    lathe('DialCardRim',center,[(.0158,.0105),(.019,.0105),(.0197,.012),
          (.019,.013),(.0158,.013)],nickel,'satin-metal',rotation,96)
    lathe('DialCard',center,[(0,.0108),(.0163,.0108),(.0163,.0113),(0,.0113)],paper,'paper',rotation)
    label=text('Retro_Phone_DialCardText','TELEPHONE',dial_point(0,-.001,.0115),.0037,ink,root,rotation=(tilt,0,0),align='CENTER')
    label['hero_atlas']='equipment';label['surface_role']='print'
    # Fixed stop at the end of the sweep. Its curved tongue stands above the
    # finger wheel and is attached outside it, rather than blocking a hole.
    stop_angle=math.radians(315)
    stop_points=[dial_point(r*math.cos(stop_angle),r*math.sin(stop_angle),h) for r,h in [(.047,.002),(.047,.014),(.042,.017),(.035,.017)]]
    wire('FingerStop',stop_points,.0021,nickel,'satin-metal')

    # A replacement coiled handset flex follows a relaxed, supported loop.
    # Sample the centreline by arc length: uniform parameter steps on the
    # curved path would bunch the turns at corners and stretch them elsewhere.
    path=_smooth_path([(.145,.033,.055),(.153,-.006,.018),(.147,-.063,.009),
          (.117,-.108,.009),(.070,-.116,.009),(.057,-.092,.009),
          (.099,-.077,.009),(.134,-.044,.009),(.132,.035,.010),(.103,.100,.018)],10)
    distances=[0.]
    for a,b in zip(path,path[1:]):distances.append(distances[-1]+(b-a).length)
    coil=[];index=0;turns=32;samples=turns*16
    for i in range(samples+1):
        t=i/samples;distance=t*distances[-1]
        while index<len(path)-2 and distances[index+1]<distance:index+=1
        f=(distance-distances[index])/(distances[index+1]-distances[index])
        center=path[index].lerp(path[index+1],f)
        tangent=(path[min(index+2,len(path)-1)]-path[max(index-1,0)]).normalized()
        side=tangent.cross(Vector((0,0,1))).normalized();up=side.cross(tangent).normalized()
        envelope=min(1,t/.055,(1-t)/.055)
        envelope=envelope*envelope*(3-2*envelope)
        angle=math.tau*(turns*t+.10*math.sin(t*math.tau))
        coil.append(center+.0052*envelope*(side*math.cos(angle)+up*math.sin(angle)))
    lead=_smooth_path([(.117,.055,.105),(.133,.052,.098),tuple(path[0])],10)[:-1]
    tail=_smooth_path([tuple(path[-1]),(.081,.102,.023),(.060,.094,.030)],8)[1:]
    wire('HandsetCord',[*lead,*coil,*tail],.00135,handset_cord,poly=True)
    box('HandsetCordBoot',(.119,.055,.104),(.011,.008,.009),handset_cord,.003)
    wire('LineCord',[(-.035,.091,.021),(-.039,.113,.010),(-.060,.134,.0027),
         (-.112,.137,.0027),(-.143,.115,.0027)],.0024,cord_material)
    for x in (-.035,.060):
        box('CordGrommet',(x,.091,.024 if x<0 else .030),(.011,.006,.010),rubber,.003)
    root.scale=(SCALE,)*3
    root['telephone_reference']='GPO 332 / No.164 handset'
    root['telephone_real_dimensions']=[.240,.220,.130]
    root['telephone_scene_scale']=SCALE
    bpy.context.view_layer.update()
    family=[root]+list(root.children_recursive)
    def measured(objects):
        points=[obj.matrix_world@v.co for obj in objects if obj.type=='MESH' for v in obj.data.vertices]
        return [[min(point[i]for point in points)for i in range(3)],
                [max(point[i]for point in points)for i in range(3)]]
    body=[obj for obj in family if not any(word in obj.name for word in ('Cord','Grommet'))]
    return {'root':root,'rootName':root.name,'rootOrigin':list(root.location),
            'frontBlender':[0,-1,0], 'bodyBounds':measured(body),'familyBounds':measured(family),
            'meshCount':sum(obj.type=='MESH'for obj in family),
            'vertexCount':sum(len(obj.data.vertices)for obj in family if obj.type=='MESH'),
            'dialFingerHoles':10, 'sceneScale':SCALE,'baseZ':BASE_Z,
            'source':'Science Museum Group 1983-517; Paul Follet 1947 Siemens 332 photographs'}
