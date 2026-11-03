"""Baked portable CD housing, with a recessed window and separate lid hardware."""
from refine_geometry import _lathe, _replace, _box
from refine_equipment import finish, subtract


def refine_cd(scene):
    player=scene.objects['Desk_CD']
    graphite=finish('CD lower moulded graphite',(.045,.052,.055),.45,grain=.025)
    silver=finish('CD satin aluminium lid',(.38,.41,.41),.33,.65,.018)
    rubber=finish('CD gasket elastomer',(.008,.012,.013),.73,grain=.01)
    well=finish('CD interior charcoal',(.018,.022,.023),.58,grain=.012)

    def mark(obj,profile='abs'):
        obj['hero_atlas']='equipment';obj['surface_profile']=profile
        return obj

    def recut(name,profile,material):
        obj=scene.objects[name];vv,ff=_lathe(profile,160)
        _replace(obj,vv,ff,material);mark(obj,'satin-metal' if material==silver else 'abs')
        return obj

    # Keep the existing envelope and control positions. The lower wall rolls
    # into a recessed sole instead of ending in a sharp, straight cylinder.
    recut('Desk_CD',[(0,-.030),(.148,-.030),(.160,-.028),(.168,-.022),
                    (.174,-.012),(.175,.012),(.173,.022),(.169,.027),(0,.027)],graphite)
    recut('Desk_CD_Seam',[(0,-.0045),(.166,-.0045),(.169,-.002),
                         (.169,.002),(.166,.0045),(0,.0045)],rubber)
    lid=recut('Desk_CD_Lid',[(0,-.007),(.154,-.007),(.161,-.005),
                           (.164,0),(.163,.005),(.159,.007),(0,.007)],silver)
    # Open the lid above a dark well. The old disc sat on a solid slab.
    import bpy
    bpy.ops.mesh.primitive_cylinder_add(vertices=160,radius=.094,depth=.035)
    cutter=bpy.context.object;cutter.name='CD lid window cutter'
    cutter.parent=player;cutter.location=(0,.023,.044)
    bpy.context.view_layer.update();subtract(lid,cutter)
    recut('Desk_CD_Window',[(0,-.010),(.092,-.010),(.098,-.008),
                                  (.100,-.004),(.100,.0015),(.096,.003),
                                  (.092,.0015),(.092,-.006),(0,-.006)],well)
    # Move media into the recess, leaving clearance beneath the glass.
    scene.objects['Desk_CD_Disc'].location.z=.040
    scene.objects['Desk_CD_Hub'].location.z=.041
    for name in ['Desk_CD_Disc','Desk_CD_Hub','Desk_CD_Display']:
        mark(scene.objects[name])
    for i in range(3):
        name='Desk_CD_Button'+('.%03d'%i if i else '')
        recut(name,[(0,-.0035),(.010,-.0035),(.012,-.001),(.012,.001),(.010,.0035),(0,.0035)],graphite)

    def box(name,p,size,material,bevel=.0015):
        obj=_box(name,p,size,material,scene,parent=player,bevel=bevel,segments=8)
        return mark(obj)
    # A thin recessed LCD surround and actual lid hinge/latch explain assembly.
    box('Desk_CD_DisplaySeat',(0,-.113,.043),(.096,.035,.005),rubber,.003)
    for x in (-.063,.063):
        box('Desk_CD_Hinge',(x,.144,.029),(.032,.018,.012),graphite,.004)
    box('Desk_CD_Latch',(0,-.172,.012),(.044,.012,.014),rubber,.004)
    for i in range(5):box('Desk_CD_LatchGrip',(-.013+i*.0065,-.1783,.012),(.001,.0008,.008),graphite,.0003)
    for x in (-.095,.095):
        box('Desk_CD_Foot',(x,0,-.029),(.026,.090,.004),rubber,.004)
    return {'bakedHousing':True,'recessedMedia':True,'roundedSegments':160,'controlsPreserved':True}
