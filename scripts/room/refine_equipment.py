"""Manufactured CRT/VCR shells. Keep screen, control names and camera anchors."""
import math
import bpy
from mathutils import Vector
from aging import Surface
from refine_geometry import _box, _mesh, _replace, _activate, _lathe


def bounds(obj):
    points=[obj.matrix_world@v.co for v in obj.data.vertices]
    return Vector(tuple(min(p[i] for p in points) for i in range(3))),Vector(tuple(max(p[i] for p in points) for i in range(3)))


def finish(name,color,roughness,metalness=0,grain=.025):
    material=bpy.data.materials.new(name);material.use_nodes=True;s=Surface(material)
    s.p.inputs['Base Color'].default_value=(*color,1)
    s.p.inputs['Metallic'].default_value=metalness
    noise=s.noise(700)
    s.l.new(s.math('ADD',roughness,s.math('MULTIPLY',noise,grain)),s.p.inputs['Roughness'])
    # Submillimetre mould grain must not become centimetre blotches after
    # atlas filtering/irradiance denoising. The runtime adds filtered grain at
    # physical scale; this bake only carries a very small residual slope.
    bump=s.n.new('ShaderNodeBump');bump.inputs['Distance'].default_value=.000025;bump.inputs['Strength'].default_value=.035
    s.l.new(noise,bump.inputs['Height']);s.l.new(bump.outputs[0],s.p.inputs['Normal'])
    return material


def tag(obj,profile='abs'):
    obj['hero_atlas']='equipment';obj['surface_profile']=profile
    return obj


def replace_world(obj,vertices,faces,material,smooth=False):
    inverse=obj.matrix_world.inverted()
    _replace(obj,[inverse@Vector(p) for p in vertices],faces,material,smooth)


def replace_box(obj,lo,hi,material,scene,radius=.006,segments=5):
    temp=_box('Equipment construction solid',(lo+hi)/2,hi-lo,material,scene,bevel=radius,segments=segments)
    bpy.context.view_layer.update()
    replace_world(obj,[temp.matrix_world@v.co for v in temp.data.vertices],[tuple(f.vertices)for f in temp.data.polygons],material)
    bpy.data.objects.remove(temp,do_unlink=True)


def planar_front_normals(obj):
    """Keep a punched front panel flat, with tangent bevel support normals.

    Weighted normals on the boolean's large concave n-gons tilt two corners
    towards the aperture. Interpolation then draws a diagonal highlight across
    the flat bezel. Correct only the front-plane corners and the adjacent
    shallow bevel endpoints; retain the rounded shell and recessed side walls.
    """
    mesh=obj.data;front=Vector((0,-1,0))
    plane=min(vertex.co.y for vertex in mesh.vertices)
    panels=[face for face in mesh.polygons if face.normal.dot(front)>.9999 and
            all(abs(mesh.vertices[i].co.y-plane)<1e-5 for i in face.vertices)]
    assert panels, obj.name+' front plane missing'
    boundary={i for face in panels for i in face.vertices}
    normals=[corner.vector.copy()for corner in mesh.corner_normals]
    for face in mesh.polygons:
        if face.normal.dot(front)<.5:continue
        for loop in face.loop_indices:
            if mesh.loops[loop].vertex_index in boundary:normals[loop]=front.copy()
    mesh.normals_split_custom_set(normals)
    mesh.update()


def subtract(obj,cutter):
    _activate(obj);mod=obj.modifiers.new('Manufactured opening','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
    bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)


def rounded_rect(width,height,radius,steps=8):
    points=[]
    for cx,cz,start in [(width/2-radius,height/2-radius,0),(-width/2+radius,height/2-radius,90),(-width/2+radius,-height/2+radius,180),(width/2-radius,-height/2+radius,270)]:
        for i in range(steps+1):
            a=math.radians(start+90*i/steps)
            points.append((cx+radius*math.cos(a),cz+radius*math.sin(a)))
    return points


def loft(layers,steps=20):
    vertices=[];faces=[]
    for y,cx,cz,w,h,r in layers:
        vertices.extend((cx+x,y,cz+z)for x,z in rounded_rect(w,h,r,steps=steps))
    count=len(vertices)//len(layers)
    for k in range(len(layers)-1):
        for i in range(count):
            j=(i+1)%count;a=k*count;b=(k+1)*count
            faces.append((a+i,b+i,b+j,a+j))
    faces.extend([tuple(range(count)),tuple(reversed(range((len(layers)-1)*count,len(vertices))))])
    return vertices,faces


def cable(name,points,radius,material,scene):
    """A round constant-gauge flex, with smooth bends and capped ends."""
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D'
    curve.resolution_u=10;curve.bevel_depth=radius;curve.bevel_resolution=2
    curve.use_fill_caps=True
    spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
    for point,position in zip(spline.bezier_points,points):
        point.co=position;point.handle_left_type=point.handle_right_type='AUTO'
    obj=bpy.data.objects.new(name,curve);scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    bpy.context.view_layer.update()
    handles=[(point.handle_left.copy(),point.handle_right.copy())for point in spline.bezier_points]
    for i,point in enumerate(spline.bezier_points):
        # Free auto tangents can sag below a supported, horizontal desk run.
        # Bound each handle by its segment's endpoint heights, while retaining
        # the smooth plan-view bend and constant circular cross-section.
        left,right=handles[i];before=Vector(points[max(0,i-1)]);after=Vector(points[min(len(points)-1,i+1)])
        left.z=max(min(point.co.z,before.z),min(max(point.co.z,before.z),left.z))
        right.z=max(min(point.co.z,after.z),min(max(point.co.z,after.z),right.z))
        point.handle_left_type=point.handle_right_type='FREE'
        point.handle_left=left;point.handle_right=right
    _activate(obj)
    bpy.ops.object.convert(target='MESH')
    return tag(obj)


def refine_equipment(scene):
    bpy.context.view_layer.update();case=scene.objects['CRT_Case'];lo,hi=bounds(case)
    abs_mat=finish('CRT warm graphite ABS',(.042,.047,.048),.42,grain=.045)
    panel_mat=finish('Control fascia fine ABS',(.026,.031,.032),.49,grain=.035)
    hood_mat=finish('VCR charcoal enamel steel',(.066,.075,.077),.30,.52,.025)
    button_mat=finish('Satin injection molded buttons',(.052,.057,.054),.28,grain=.025)
    dark=finish('Equipment recess rubber',(.004,.005,.005),.79,grain=.035)
    bright=finish('Nickel screw heads',(.28,.29,.27),.28,.82,.01)
    # Front collar stays at its accepted bounds. The rear contracts to a CRT
    # tube housing instead of retaining a bevelled cuboid all the way back.
    cx,cz=(lo.x+hi.x)/2,(lo.z+hi.z)/2;w,h=hi.x-lo.x,hi.z-lo.z
    layers=[(lo.y,cx,cz,w-.020,h-.020,.025),
            (lo.y+.0035,cx,cz,w-.008,h-.008,.029),
            (lo.y+.010,cx,cz,w,h,.030),
            (lo.y+.085,cx,cz,w,h,.030),
            (.135,cx,cz,w-.012,h-.012,.036),
            (.185,cx,cz+.006,w-.038,h-.032,.041),
            (.255,cx,cz+.017,w-.115,h-.097,.051),
            (.340,cx,cz+.030,w-.250,h-.212,.064),
            (.425,cx,cz+.040,w-.350,h-.294,.073),
            (hi.y+.125,cx,cz+.043,w-.385,h-.323,.078),
            (hi.y+.15,cx,cz+.043,w-.390,h-.330,.075)]
    vv,ff=loft(layers);replace_world(case,vv,ff,abs_mat);tag(case)
    for name,center,size,radius in [
        ('CRT screen aperture',(0,-.29,1.6729),(.948,.16,.748),.041),
        ('CRT control cavity',(0,-.305,1.119), (1.060,.076,.251),.013)]:
        subtract(case,_box(name,center,size,dark,scene,bevel=radius,segments=8))
    # Each gasket is a true ring with a shallow return into the opening.
    recess=scene.objects['CRT_Recess']
    rings=[(-.326,0,1.6729,.978,.785,.047),(-.339,0,1.6729,.923,.724,.039),(-.3395,0,1.6729,.902,.704,.036),(-.310,0,1.6729,.902,.704,.036)]
    vv=[];ff=[]
    for y,x,z,rw,rh,rad in rings:vv.extend((x+a,y,z+b)for a,b in rounded_rect(rw,rh,rad,steps=24))
    count=len(vv)//4
    for k in range(3):
        for i in range(count):j=(i+1)%count;ff.append((k*count+i,(k+1)*count+i,(k+1)*count+j,k*count+j))
    replace_world(recess,vv,ff,dark,True);tag(recess)
    panel=scene.objects['CRT_ControlPanel'];pl,ph=bounds(panel);replace_box(panel,pl,ph,panel_mat,scene,.006);tag(panel)
    # Remove the previous painted-on side vent bars. Recesses cut into the shell
    # now reveal a black backing with a bevelled lip, without floating stripes.
    for obj in list(scene.objects):
        if obj.name.startswith(('CRT_Case_Split','CRT_Case_SideVent')):bpy.data.objects.remove(obj,do_unlink=True)
    for side in (-1,1):
        # The slot bank is cut through a thin moulded wall into a shared air
        # cavity. A 26 mm blind slot presents its upward ABS floor to the
        # elevated room camera, completely hiding the dark inner backing.
        subtract(case,_box('CRT vent air cavity',(cx+side*.518,-.005,1.605),
                           (.104,.224,.310),dark,scene,bevel=.001,segments=3))
        for i in range(8):
            # Keep the accepted aperture positions and sizes. Only the wall
            # behind the opening changes; the outer shell silhouette stays.
            cutter=_box('CRT vent cutter',(side*.578,-.005,1.48+i*.035),(.055,.185,.009),dark,scene,bevel=.003,segments=3)
            subtract(case,cutter)
        backing=_box('CRT_VentBacking', (side*.551,-.005,1.605),(.003,.198,.30),dark,scene,bevel=.001);tag(backing)
        subtract(case,_box('CRT shell joint cutter',(side*.574,.136,cz),(.017,.0024,h-.085),dark,scene,bevel=.0006,segments=3))
        tag(_box('CRT_AssemblySeam',(side*.567,.136,cz),(.002,.0018,h-.088),dark,scene,bevel=.0005))
    subtract(case,_box('CRT top joint cutter',(cx,.136,hi.z-.006),(w-.085,.0024,.014),dark,scene,bevel=.0006,segments=3))
    tag(_box('CRT_AssemblySeam_Top',(cx,.136,hi.z-.012),(w-.085,.0018,.002),dark,scene,bevel=.0005))
    # Retain the controls' transforms, names, centers and hit areas. Their rim,
    # stem and dished front are continuous manufactured surfaces.
    for obj in list(scene.objects):
        if obj.name.startswith('CRT_Knob'):
            a,b=bounds(obj);center=(a+b)/2;r=(b.x-a.x)/2;depth=b.y-a.y
            profile=[(0,-depth/2),(.65*r,-depth/2),(r*.94,-depth/2+.002),(r,-depth/2+.004),(r,depth/2-.004),(.91*r,depth/2),(0,depth/2-.001)]
            vv,ff=_lathe(profile,64)
            # Lathe Z points towards the viewer (-Y in Blender).
            replace_world(obj,[center+Vector((x,-z,y))for x,y,z in vv],ff,button_mat,True);tag(obj)
        elif obj.name.startswith('CRT_Button') or obj.name=='CRT_Power':
            a,b=bounds(obj);replace_box(obj,a,b,button_mat,scene,.004,5);tag(obj)
    # Folded steel hood, separate plastic front, exact existing tabletop contact.
    vcr=scene.objects['VCR_Body'];vl,vh=bounds(vcr);replace_box(vcr,vl,vh,hood_mat,scene,.0035,8);tag(vcr,'satin-metal')
    # A stamped cover has millimetre walls and visible returns at its slots.
    # Hollow the case before piercing it; a dark inner chassis supplies depth
    # behind the vents instead of pretending that a painted stripe is a hole.
    inner_lo=vl+Vector((.0024,.003,.005))
    inner_hi=vh-Vector((.0024,.003,.0022))
    subtract(vcr,_box('VCR cover interior',(inner_lo+inner_hi)/2,inner_hi-inner_lo,dark,scene,bevel=.001,segments=4))
    tag(_box('VCR_InternalChassis',((vl.x+vh.x)/2,.02,vh.z-.019),
             (vh.x-vl.x-.025,vh.y-vl.y-.045,.006),dark,scene,bevel=.001))
    # The exposed shoulders carry two small ventilation banks. Their narrow
    # rolled lips catch light at grazing angles, while the broad top stays calm.
    for side in (-1,1):
        x=vl.x+.059 if side<0 else vh.x-.059
        for i in range(7):
            y=-.285+i*.068
            subtract(vcr,_box('VCR top vent cutter',(x,y,vh.z-.001),
                             (.054,.013,.020),dark,scene,bevel=.002,segments=6))
    front=scene.objects['VCR_Front'];fl,fh=bounds(front);replace_box(front,fl,fh,panel_mat,scene,.005,5);tag(front)
    subtract(front,_box('VCR real tape opening',(-.22,-.49,.850),(.739,.08,.059),dark,scene,bevel=.006,segments=5))
    # Narrow shoulder seam distinguishes a sheet-metal cover from the fascia.
    tag(_box('VCR_CoverJoint',(.01,-.471,.938),(1.375,.004,.003),dark,scene,bevel=.0007))
    for side in (-1,1):
        x=vl.x+.012 if side<0 else vh.x-.012
        tag(_box('VCR_FoldedEdge',(x,.015,.804),(.003,.78,.005),dark,scene,bevel=.001))
        for i in range(8):
            cut=_box('VCR vent cutter',(x,-.10+i*.041,.912),(.055,.021,.007),dark,scene,bevel=.002,segments=3);subtract(vcr,cut)
        # A small recessed screw at a plausible case attachment, not a raised stud.
        screw=_box('VCR_CaseScrew',(x,-.446,.919),(.009,.003,.009),bright,scene,bevel=.003,segments=5);tag(screw,'satin-metal')
    # Short, connected rear wiring: one 75-ohm video link and two mains flexes.
    # The leads run behind the equipment and rest on the desk before rising
    # into a wall outlet; no loose endpoints or decorative front-facing loops.
    flex=finish('Equipment flexible PVC cable',(.012,.014,.014),.47,grain=.010)
    plate=finish('Wall outlet aged ivory ABS',(.48,.47,.42),.48,grain=.014)
    rear=layers[-1][0]
    for prefix,x,y,z in [('CRT',-.23,rear,1.25),('VCR',-.38,vh.y,.79)]:
        tag(_box(prefix+'_PowerSocket',(x,y+.003,z),(.066,.007,.045),dark,scene,bevel=.004))
        tag(_box(prefix+'_PowerPlug',(x,y+.024,z),(.046,.040,.029),flex,scene,bevel=.005))
        tag(_box(prefix+'_PowerStrainRelief',(x,y+.050,z),(.015,.021,.015),flex,scene,bevel=.006))
    for prefix,x,y,z in [('CRT',.22,rear,1.28),('VCR',.26,vh.y,.81)]:
        tag(_box(prefix+'_VideoSocketPlate',(x,y+.003,z),(.050,.007,.042),dark,scene,bevel=.003))
        vv,ff=_lathe([(0,0),(.011,0),(.012,.003),(.012,.012),(.010,.014),(.010,.030),(.006,.035),(0,.035)],32)
        tag(_mesh(prefix+'_VideoConnector',[(x+a,y+b+.007,z-c)for a,c,b in vv],ff,bright,scene,smooth=True),'satin-metal')
    cable('Equipment_VCRToCRT_Coax',[(.22,rear+.041,1.28),(.22,rear+.080,1.26),(.25,.63,1.15),(.32,.62,.98),(.31,.55,.86),(.26,vh.y+.075,.81),(.26,vh.y+.041,.81)],.0045,flex,scene)
    tag(_box('Equipment_WallOutlet',(-.94,1.030,.86),(.44,.020,.15),plate,scene,bevel=.006))
    for x in (-.94,-.78,-1.10):
        tag(_box('Equipment_OutletInset',(x,1.016,.86),(.066,.010,.071),dark,scene,bevel=.008))
        prefix='Lamp' if x==-1.10 else 'Equipment'
        tag(_box(prefix+'_MainsPlug',(x,.992,.86),(.055,.043,.058),flex,scene,bevel=.008))
        tag(_box(prefix+'_PlugBoot',(x,.966,.86),(.018,.020,.018),flex,scene,bevel=.007))
    cable('CRT_MainsCable',[(-.23,rear+.061,1.25),(-.25,.64,1.17),(-.40,.73,.94),(-.51,.78,.72),(-.68,.80,.691),(-.90,.84,.691),(-.97,.90,.72),(-.94,.946,.81),(-.94,.956,.86)],.0052,flex,scene)
    cable('VCR_MainsCable',[(-.38,vh.y+.061,.79),(-.42,.56,.76),(-.54,.65,.70),(-.67,.74,.691),(-.76,.86,.695),(-.80,.92,.74),(-.78,.946,.82),(-.78,.956,.86)],.0043,flex,scene)
    for obj in scene.objects:
        if obj.type!='MESH' or obj.get('surface_role') or obj.name in ('CRT_Screen','VCR_Display'):continue
        if obj.name.startswith(('CRT_','VCR_')) and not obj.get('hero_atlas'):tag(obj)
    # Recompute winding after boolean/loft construction, keep planar faces flat.
    for obj in [case,recess,vcr,front]:
        _activate(obj)
        if obj.data.has_custom_normals:bpy.ops.mesh.customdata_custom_splitnormals_clear()
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
    # Preserve the broad gasket slopes while smoothing their corner arcs.
    recess.data.set_sharp_from_angle(angle=math.radians(50))
    bpy.context.view_layer.update()
    return {'screenAndControlsPreserved':True,'caseBounds':[list(lo),list(hi)],'equipmentMeshes':sum(o.get('hero_atlas')=='equipment'for o in scene.objects),'materials':['ABS','rubber','enamel steel','nickel']}
