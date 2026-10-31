"""One exposed VHS master supplies both the static cassette and moving clone."""
import math
import bpy
from mathutils import Matrix, Vector
from refine_geometry import _box, _mesh, _lathe, _activate
from refine_equipment import finish, subtract, bounds


def refine_tapes(scene):
    shell=finish('VHS injection molded shell',(.018,.021,.020),.40,grain=.07)
    seam=finish('VHS shell seam rubber',(.003,.004,.004),.77,grain=.015)
    reel=finish('VHS ivory reel hubs',(.52,.51,.43),.33,grain=.015)
    oxide=finish('VHS wound magnetic tape',(.028,.019,.012),.29,grain=.02)
    paper=finish('VHS paper identification label',(.73,.72,.63),.88,grain=.02)
    glass=finish('VHS smoked reel windows',(.19,.23,.22),.16,grain=.004)
    glass.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=.24
    glass.node_tree.nodes.get('Principled BSDF').inputs['IOR'].default_value=1.46
    anchor=bpy.data.objects.new('VHS_Master',None);scene.collection.objects.link(anchor)
    top=scene.objects['VHS_A_5'];lo,hi=bounds(top)
    anchor.location=((lo.x+hi.x)/2,(lo.y+hi.y)/2,hi.z+.0216)
    anchor.rotation_euler.z=top.rotation_euler.z-.025
    parts=[]
    def add(obj,profile='tape-shell'):
        obj['hero_atlas']='tape';obj['surface_profile']=profile
        obj['tape_master_part']=obj.name
        parts.append(obj);return obj
    body=add(_box('VHS_Master_Shell',(0,0,0),(.57,.32,.041),shell,scene,bevel=.0042,segments=5))
    for side,x in [('Left',-.145),('Right',.145)]:
        subtract(body,_box('VHS window cutter',(x,.047,.020),(.146,.141,.028),seam,scene,bevel=.014,segments=6))
        add(_box('VHS_Master_Window_'+side,(x,.047,.0215),(.143,.138,.001),glass,scene,bevel=.012,segments=5),'tape-window')
        vv,ff=_lathe([(.018,-.003),(.060,-.003),(.063,0),(.061,.002),(.026,.002),(.021,.003),(.018,.003)],64)
        hub=add(_mesh('VHS_Master_Reel_'+side,[(x+a,.047+b,.013+z)for a,b,z in vv],ff,reel,scene,smooth=True))
        hub['tape_reel_origin']=[x,.013,-.047]
        # Concentric wound tape is visible through each smoked window.
        vv,ff=_lathe([(.063,-.003),(.070,-.003),(.071,.001),(.063,.001)],64)
        add(_mesh('VHS_Master_Winding_'+side,[(x+a,.047+b,.012+z)for a,b,z in vv],ff,oxide,scene,smooth=True))
        for n in range(6):
            a=n*math.tau/6
            add(_box('VHS_Master_ReelCut_'+side,(x+math.cos(a)*.035,.047+math.sin(a)*.035,.016),(.008,.013,.001),seam,scene,bevel=.002,segments=3))
    add(_box('VHS_Master_Label',(0,-.095,.0212),(.43,.073,.0005),paper,scene,bevel=.002,segments=3),'paper')
    for name,body,x,y,size in [('Title','VIDEO ARCHIVE',-.196,-.091,.017),('Format','T-120   SP   /   FIELD NOTES',-.196,-.116,.010)]:
        bpy.ops.object.text_add(location=(x,y,.0218))
        obj=bpy.context.object;obj.name='VHS_Master_Print_'+name;obj.data.body=body;obj.data.size=size
        obj.data.materials.append(seam);bpy.ops.object.convert(target='MESH');obj=bpy.context.object
        obj['surface_role']='print';add(obj,'paper')
    add(_box('VHS_Master_Flap',(0,.157,.001),(.51,.010,.034),shell,scene,bevel=.0025,segments=4))
    for y in (-.158,.158):add(_box('VHS_Master_Seam',(0,y,-.002),(.548,.0014,.0012),seam,scene,bevel=.0004))
    for x in (-.263,.263):
        for n in range(7):add(_box('VHS_Master_Grip',(x,-.085+n*.017,.021),(.018,.0013,.0012),seam,scene,bevel=.0003))
    # Source geometry is shared by clones at runtime. No per-tape high-res mesh.
    bpy.context.view_layer.update()
    for obj in parts:
        obj.data.transform(anchor.matrix_world @ obj.matrix_world)
        obj.location=(0,0,0);obj.rotation_euler=(0,0,0)
    for obj in scene.objects:
        if obj.type!='MESH' or obj.get('surface_role') or obj in parts:continue
        if obj.name.startswith(('VHS_','Label_VHS_','Tape_Tab_','Tape_Stripe_','Tape_End_','Tape_Seam_')):
            obj['hero_atlas']='tape';obj['surface_profile']='paper' if obj.name.startswith(('VHS_','Label_','Tape_Tab_'))else 'tape-shell'
    return {'master':'VHS_Master','parts':len(parts),'movingCloneSharesGeometry':True,
            'dimensions':[.57,.32,.041],'windowThickness':.001,'cassetteRestOnSleeve':True}
