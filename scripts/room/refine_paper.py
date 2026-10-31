"""A bound memo pad with several loose, thin top sheets and readable centre.

The two curl coefficients are exported with Work_Notepad. Runtime ink and each
native hit target use the same surface equation instead of a floating quad.
"""
import json
import math
from pathlib import Path
import bpy
from mathutils import Vector
from aging import Surface
from refine_geometry import _mesh, _activate, _box

BEND=(.006,.014)


def paper_finish(name,color,edges=False):
    mat=bpy.data.materials.new(name);mat.use_nodes=True;s=Surface(mat)
    s.p.inputs['Base Color'].default_value=(*color,1)
    s.p.inputs['Roughness'].default_value=.91
    s.p.inputs['Specular IOR Level'].default_value=.18
    fine=s.noise(850,s.vector('MULTIPLY',s.position,(1,3.8,1)))
    s.mix_color(s.math('MULTIPLY',fine,.035),(.70,.66,.56))
    bump=s.n.new('ShaderNodeBump');bump.inputs['Distance'].default_value=.000035;bump.inputs['Strength'].default_value=.22
    s.l.new(fine,bump.inputs['Height']);s.l.new(bump.outputs[0],s.p.inputs['Normal'])
    if edges:
        xyz=s.n.new('ShaderNodeSeparateXYZ');s.l.new(s.position,xyz.inputs[0])
        lines=s.math('SINE',s.math('MULTIPLY',xyz.outputs['Z'],math.tau/.00027))
        s.mix_color(s.math('MULTIPLY',s.math('MAXIMUM',lines,0),.12),(.48,.43,.34))
    return mat


def refine_paper(scene):
    pad=scene.objects['Work_Notepad']
    matrix=pad.matrix_world.copy();inverse=matrix.inverted()
    anchors=json.loads((Path(__file__).parents[2]/'src/scripts/room/anchors.json').read_text())['surfaces']['work']
    corners=[Vector((p[0],-p[2],p[1]-.001))for p in anchors]
    face=paper_finish('Warm uncoated memo paper',(.79,.76,.66))
    edge=paper_finish('Exposed paper stack edges',(.69,.65,.55),True)
    backing=paper_finish('Thin kraft memo backing',(.24,.18,.11))
    def point(u,v,z=0,curve=1):
        p=corners[0].lerp(corners[1],u).lerp(corners[3].lerp(corners[2],u),v)
        p.z+=z+curve*(BEND[0]*u*u*(1-v)**2+BEND[1]*v**7*(.6+.4*u))
        return p
    for i,offset in enumerate([-.0016,-.0008,0]):
        vertices=[point(x/24,y/18,offset,.86+i*.07)for y in range(19)for x in range(25)]
        faces=[(y*25+x,y*25+x+25,y*25+x+26,y*25+x+1)for y in range(18)for x in range(24)]
        obj=_mesh('Work_Notepad_Loose_%d'%i,vertices,faces,face,scene,smooth=True)
        _activate(obj);solid=obj.modifiers.new('Paper caliper 0.24mm','SOLIDIFY');solid.thickness=.00024;solid.offset=-1
        bpy.ops.object.modifier_apply(modifier=solid.name)
        if i==2:
            pad.data=obj.data;pad.data.transform(inverse);bpy.data.objects.remove(obj,do_unlink=True);obj=pad
            obj['paper_bend']=list(BEND)
        obj['hero_atlas']='paper';obj['surface_profile']='paper'
    # The paper block meets the desk through a thin card backing. This follows
    # the existing footprint/rotation; it does not raise the surface or camera.
    center=sum(corners,Vector())/4
    angle=math.atan2((corners[1]-corners[0]).y,(corners[1]-corners[0]).x)
    for name,z,h,material in [('Block',.6930,.0132,edge),('Backing',.6860,.0008,backing)]:
        obj=_box('Work_Notepad_'+name,(center.x,center.y,z),(1.05,.66,h),material,scene,bevel=.00045,segments=3)
        obj.rotation_euler.z=angle;obj['hero_atlas']='paper';obj['surface_profile']='paper'
    return {'topSheetCaliper':.00024,'curl':list(BEND),'backingContactZ':.6856,
            'inkSurface':'shared exported coefficients','looseSheets':3}
