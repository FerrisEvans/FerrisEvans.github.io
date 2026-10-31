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
    bump=s.n.new('ShaderNodeBump');bump.inputs['Distance'].default_value=.000055;bump.inputs['Strength'].default_value=.12
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


def loft(layers):
    vertices=[];faces=[]
    for y,cx,cz,w,h,r in layers:
        vertices.extend((cx+x,y,cz+z)for x,z in rounded_rect(w,h,r))
    count=len(vertices)//len(layers)
    for k in range(len(layers)-1):
        for i in range(count):
            j=(i+1)%count;a=k*count;b=(k+1)*count
            faces.append((a+i,b+i,b+j,a+j))
    faces.extend([tuple(range(count)),tuple(reversed(range((len(layers)-1)*count,len(vertices))))])
    return vertices,faces


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
            (.325,cx,cz+.016,w-.125,h-.10,.047),
            (hi.y+.15,cx,cz+.016,w-.145,h-.12,.049)]
    vv,ff=loft(layers);replace_world(case,vv,ff,abs_mat);tag(case)
    for name,center,size,radius in [
        ('CRT screen aperture',(0,-.29,1.6729),(.948,.16,.748),.041),
        ('CRT control cavity',(0,-.305,1.119), (1.060,.076,.251),.013)]:
        subtract(case,_box(name,center,size,dark,scene,bevel=radius,segments=8))
    # Each gasket is a true ring with a shallow return into the opening.
    recess=scene.objects['CRT_Recess']
    rings=[(-.326,0,1.6729,.978,.785,.047),(-.339,0,1.6729,.923,.724,.039),(-.3395,0,1.6729,.902,.704,.036),(-.310,0,1.6729,.902,.704,.036)]
    vv=[];ff=[]
    for y,x,z,rw,rh,rad in rings:vv.extend((x+a,y,z+b)for a,b in rounded_rect(rw,rh,rad))
    count=len(vv)//4
    for k in range(3):
        for i in range(count):j=(i+1)%count;ff.append((k*count+i,(k+1)*count+i,(k+1)*count+j,k*count+j))
    replace_world(recess,vv,ff,dark);tag(recess)
    panel=scene.objects['CRT_ControlPanel'];pl,ph=bounds(panel);replace_box(panel,pl,ph,panel_mat,scene,.006);tag(panel)
    # Remove the previous painted-on side vent bars. Recesses cut into the shell
    # now reveal a black backing with a bevelled lip, without floating stripes.
    for obj in list(scene.objects):
        if obj.name.startswith(('CRT_Case_Split','CRT_Case_SideVent')):bpy.data.objects.remove(obj,do_unlink=True)
    for side in (-1,1):
        for i in range(8):
            cutter=_box('CRT vent cutter',(side*.565,.19,1.48+i*.035),(.09,.145,.009),dark,scene,bevel=.003,segments=3)
            subtract(case,cutter)
        backing=_box('CRT_VentBacking', (side*.518,.19,1.605),(.003,.16,.30),dark,scene,bevel=.001);tag(backing)
        tag(_box('CRT_AssemblySeam',(side*.570,.136,1.54),(.004,.004,1.045),dark,scene,bevel=.001))
    tag(_box('CRT_AssemblySeam_Top',(cx,.136,hi.z-.007),(w-.085,.004,.004),dark,scene,bevel=.001))
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
    vcr=scene.objects['VCR_Body'];vl,vh=bounds(vcr);replace_box(vcr,vl,vh,hood_mat,scene,.007,5);tag(vcr,'satin-metal')
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
    for obj in scene.objects:
        if obj.type!='MESH' or obj.get('surface_role') or obj.name in ('CRT_Screen','VCR_Display'):continue
        if obj.name.startswith(('CRT_','VCR_')) and not obj.get('hero_atlas'):tag(obj)
    # Recompute winding after boolean/loft construction, keep planar faces flat.
    for obj in [case,recess,vcr,front]:
        _activate(obj);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.view_layer.update()
    return {'screenAndControlsPreserved':True,'caseBounds':[list(lo),list(hi)],'equipmentMeshes':sum(o.get('hero_atlas')=='equipment'for o in scene.objects),'materials':['ABS','rubber','enamel steel','nickel']}
