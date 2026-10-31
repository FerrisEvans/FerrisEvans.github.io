"""Manufactured phone/remote/keycaps without changing controls or staging."""
import math
import bpy
from mathutils import Vector
from refine_geometry import _replace, _box
from refine_equipment import finish, rounded_rect, replace_world, bounds


def local_bounds(obj):
    return (Vector(tuple(min(v.co[i]for v in obj.data.vertices)for i in range(3))),
            Vector(tuple(max(v.co[i]for v in obj.data.vertices)for i in range(3))))


def casing(obj,material,radius=.008,pitch=0,dish=0):
    lo,hi=local_bounds(obj);center=(lo+hi)/2;w,d,h=hi-lo
    rings=[(lo.z,w*.94,d*.94,radius*.75),(lo.z+h*.22,w,d,radius),
           (hi.z-h*.16,w,d,radius),(hi.z,w*.94,d*.94,radius*.90)]
    vertices=[];faces=[]
    for k,(z,rw,rd,r) in enumerate(rings):
        tilt=pitch if k>=2 else 0
        vertices.extend((center.x+x,center.y+y,z+tilt*(y-d/2))for x,y in rounded_rect(rw,rd,min(r,min(rw,rd)/3),steps=6))
    count=len(vertices)//len(rings)
    for k in range(len(rings)-1):
        for i in range(count):j=(i+1)%count;faces.append((k*count+i,k*count+j,(k+1)*count+j,(k+1)*count+i))
    faces.append(tuple(reversed(range(count))))
    # Several concentric quads describe the very shallow finger dish. A single
    # centre fan made four large pyramidal highlights on every keycap.
    last=(len(rings)-1)*count
    if dish:
        for step in range(1,9):
            fraction=1-step/9;start=len(vertices)
            for x,y in rounded_rect(w*.94*fraction,d*.94*fraction,radius*.90*fraction,steps=6):
                vertices.append((center.x+x,center.y+y,hi.z-dish*(1-fraction*fraction)-pitch*d/2))
            for i in range(count):j=(i+1)%count;faces.append((last+i,last+j,start+j,start+i))
            last=start
    top=len(vertices);vertices.append((center.x,center.y,hi.z-dish-pitch*d/2))
    for i in range(count):faces.append((top,last+i,last+(i+1)%count))
    _replace(obj,vertices,faces,material,smooth=True)
    obj['hero_atlas']='equipment';obj['surface_profile']='abs'


def refine_accessories(scene):
    ivory=finish('Aged warm ivory ABS',(.61,.59,.50),.34,grain=.055)
    key=finish('Ivory double-shot keycaps',(.67,.65,.56),.39,grain=.035)
    dark=finish('Remote charcoal shell',(.021,.026,.025),.42,grain=.06)
    rubber=finish('Remote soft key rubber',(.055,.064,.060),.67,grain=.02)
    red=finish('Muted red power key',(.19,.023,.014),.57,grain=.02)
    for name,mat,radius in [('Retro_Phone',ivory,.022),('Desk_Remote',dark,.013),('Computer_Keyboard',ivory,.009)]:
        casing(scene.objects[name],mat,radius,pitch=.12 if name=='Retro_Phone'else 0)
    handset=scene.objects['Retro_Phone_Handset'];lo,hi=bounds(handset);center=(lo+hi)/2
    # One continuous receiver: narrowed bridge, arched underside, rounded ends.
    vertices=[];faces=[]
    for t,w,h,z in [(0,.098,.062,-.014),(.06,.122,.073,-.015),(.22,.112,.068,-.013),(.34,.071,.043,.004),(.66,.071,.043,.004),(.78,.112,.068,-.013),(.94,.122,.073,-.015),(1,.098,.062,-.014)]:
        y=lo.y+(hi.y-lo.y)*t
        vertices.extend((center.x+x,y,center.z+z+a)for x,a in rounded_rect(w,h,.015,steps=8))
    count=len(vertices)//8
    for k in range(7):
        for i in range(count):j=(i+1)%count;faces.append((k*count+i,(k+1)*count+i,(k+1)*count+j,k*count+j))
    faces.extend([tuple(range(count)),tuple(reversed(range(count*7,count*8)))])
    replace_world(handset,vertices,faces,ivory,True);handset['hero_atlas']='equipment';handset['surface_profile']='abs'
    normal_matrix=handset.matrix_world.to_3x3().inverted().transposed()
    front=min(handset.data.polygons,key=lambda p:(handset.matrix_world@p.center).y)
    back=max(handset.data.polygons,key=lambda p:(handset.matrix_world@p.center).y)
    assert (normal_matrix@front.normal).y<-.99 and (normal_matrix@back.normal).y>.99,'Handset end caps must face outward'
    for obj in list(scene.objects):
        if obj.name.startswith(('Retro_Phone_Earpiece','Retro_Phone_Grille')):bpy.data.objects.remove(obj,do_unlink=True)
    # Small perforations sit on the end caps, within their actual top envelope.
    for t in (.12,.88):
        y=lo.y+(hi.y-lo.y)*t
        for i in range(5):
            obj=_box('Retro_Phone_ReceiverGrille',(center.x+(i-2)*.013,y,center.z+.021),(.003,.040,.0007),dark,scene,bevel=.001,segments=3)
            obj['hero_atlas']='equipment';obj['surface_profile']='abs'
    keys=0
    for obj in list(scene.objects):
        if obj.name.startswith(('Computer_Key','Computer_Spacebar','Retro_Phone_Key','Remote_Key')) and obj.name!='Computer_Keyboard':
            mat=key if not obj.name.startswith('Remote_') else red if obj.name=='Remote_Key' else rubber
            casing(obj,mat,.004,dish=.0011);keys+=1
        if obj.type=='MESH' and not obj.get('surface_role') and obj.name.startswith(('Retro_Phone','Remote_Key','Computer_Key','Computer_Spacebar')):
            obj['hero_atlas']='equipment';obj['surface_profile']='abs'
    return {'continuousHandset':True,'dishedKeycaps':keys,'controlNamesAndTransformsPreserved':True}
