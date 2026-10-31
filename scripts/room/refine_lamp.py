"""A physically assembled spun-metal desk lamp; no camera-plane deformation.

The silhouette is authored against the 1440x900 Home reference. Existing action
names survive. All lamp parts are included in the lamp atlas except the small
bulb, whose runtime emission follows the existing lamp control.
"""
import math
import bpy
from mathutils import Vector, Matrix
from surfaces import screen_bounds


def _lathe(profile, segments=64):
    vertices, rings, faces = [], [], []
    for radius, z in profile:
        ring=[]
        for i in range(segments if radius else 1):
            ring.append(len(vertices));a=i*math.tau/segments
            vertices.append((radius*math.cos(a),radius*math.sin(a),z))
        rings.append(ring)
    for low, high in zip(rings,rings[1:]):
        for i in range(segments):
            j=(i+1)%segments
            if len(low)==1: faces.append((low[0],high[j],high[i]))
            elif len(high)==1: faces.append((low[i],low[j],high[0]))
            else: faces.append((low[i],low[j],high[j],high[i]))
    return vertices,faces


def _part(scene,name,vertices,faces,material,location=(0,0,0),rotation=(0,0,0)):
    mesh=bpy.data.meshes.new(name+' round6 mesh');mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.get(name)
    if not obj:
        obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj)
    mesh.materials.append(material)
    for face in mesh.polygons: face.use_smooth=True
    obj.data=mesh;obj.parent=None;obj.matrix_world=Matrix.Identity(4)
    obj.location=location;obj.rotation_euler=rotation
    obj.modifiers.clear();obj['lamp_revision']='round6-curved-stem-thin-shell'
    return obj


def _tube(points,radius=.0135,sides=12):
    vertices,faces=[],[]
    for i,p in enumerate(points):
        tangent=(points[min(i+1,len(points)-1)]-points[max(0,i-1)]).normalized()
        u=Vector((0,1,0));v=tangent.cross(u).normalized()
        for j in range(sides):
            a=j*math.tau/sides;vertices.append(p+radius*(math.cos(a)*u+math.sin(a)*v))
    for i in range(len(points)-1):
        for j in range(sides):
            a=i*sides+j;b=i*sides+(j+1)%sides;faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(reversed(range(sides))),tuple((len(points)-1)*sides+j for j in range(sides))])
    return vertices,faces


def refine_lamp(scene,materials):
    # Keep the foot in front of the existing card file, on the desk surface.
    base=Vector((-1.60,.10,.685))
    v,f=_lathe([(0,0),(.216,0),(.239,.004),(.247,.010),(.248,.018),
                (.245,.025),(.234,.033),(.190,.038),(.100,.041),(0,.042)])
    _part(scene,'Lamp_Base',v,f,materials['base'],base)
    v,f=_lathe([(0,0),(.031,0),(.033,.004),(.030,.018),(.023,.023),(0,.023)],48)
    _part(scene,'Lamp_FootCollar',v,f,materials['stem'],base+Vector((0,0,.040)))

    # A mostly upright lower section and a continuous bend at the neck.
    p0=Vector((base.x,base.y,1.12));p1=Vector((base.x,base.y,1.48))
    p2=Vector((-1.54,.30,1.71));p3=Vector((-1.495,.486,1.86))
    points=[Vector((base.x,base.y,.738+(1.12-.738)*i/10)) for i in range(11)]
    for i in range(1,25):
        t=i/24;points.append((1-t)**3*p0+3*(1-t)**2*t*p1+3*(1-t)*t*t*p2+t**3*p3)
    v,f=_tube(points);_part(scene,'Lamp_Stem',v,f,materials['stem'])

    center=Vector((-1.475,.486,1.867));rotation=(math.radians(-21),math.radians(13),0)
    # Constant-thickness shell with a rolled 2.5 mm lip and a rounded shoulder.
    profile=[(.281,-.172),(.284,-.171),(.286,-.168),(.285,-.164),
             (.268,-.137),(.207,-.034),(.143,.075),(.098,.158),
             (.094,.175),(.085,.187),(.068,.194),(.035,.198),(0,.199)]
    v,f=_lathe(profile);shade=_part(scene,'Lamp_Shade',v,f,materials['shade'],center,rotation)
    inside=[(max(0,r-.0025),z+.0025 if z<-.16 else z-.0025) for r,z in profile]
    v,f=_lathe(inside);_part(scene,'Lamp_Interior',v,[tuple(reversed(face)) for face in f],materials['lining'],center,rotation)
    bpy.context.view_layer.update()
    bottom=shade.matrix_world@Vector((0,0,-.166))
    bulb_position=shade.matrix_world@Vector((0,0,-.075))
    # The small frosted bulb sits above the lip, partly occluded by the shade.
    v,f=_lathe([(0,-.036),(.021,-.033),(.037,-.019),(.042,0),(.036,.021),(.022,.034),(0,.039)],48)
    bulb=_part(scene,'Lamp_Bulb',v,f,materials['bulb'],bulb_position)
    bulb['surface_role']='lamp-bulb';bulb.visible_shadow=False
    # Compact socket at the end of the curved stem, hidden behind the bulb.
    v,f=_lathe([(0,0),(.026,0),(.026,.045),(.022,.050),(0,.050)],32)
    _part(scene,'Lamp_Socket',v,f,materials['socket'],p3-Vector((0,0,.025)))
    bpy.context.view_layer.update()
    return shade,bottom,bulb_position,screen_bounds(shade,scene)
