"""Physical desktop construction: actual supports, seams, usable controls and scale.

Runs before atlas baking. Coordinates are metres in Blender's Z-up world.
The CRT screen and tape transport keep their established interaction anchors.
"""
import math
import bpy
from mathutils import Vector, Matrix
from aging import Surface
from refine_geometry import _box, _mesh, _replace, _lathe, _tube, _activate
from refine_equipment import finish, bounds, replace_world, replace_box, loft, subtract
from refine_accessories import casing, local_bounds
from refine_input_devices import refine_input_devices


def refine_physical(scene, text):
    def remove(prefix):
        for obj in list(scene.objects):
            if obj.name == prefix or obj.name.startswith(prefix+'_'):
                bpy.data.objects.remove(obj, do_unlink=True)
    def mark(obj, atlas='equipment', profile=None):
        obj['hero_atlas']=atlas
        if profile:obj['surface_profile']=profile
        return obj
    def box(name,p,size,mat,r=.002,atlas='equipment',profile=None):
        return mark(_box(name,p,size,mat,scene,bevel=r,segments=4),atlas,profile)
    def lathe(name,p,profile,mat,atlas='equipment',segments=64):
        vv,ff=_lathe(profile,segments)
        return mark(_mesh(name,[Vector(p)+Vector(v)for v in vv],ff,mat,scene,smooth=True),atlas)
    def wire(name,points,r,mat,atlas='equipment'):
        vv,ff=_tube([Vector(p)for p in points],r,10)
        return mark(_mesh(name,vv,ff,mat,scene,smooth=True),atlas)
    def local_box(name,p,size,mat,parent,r=.002,atlas='equipment',profile=None):
        obj=box(name,p,size,mat,r,atlas,profile);obj.parent=parent;return obj
    def label(name,body,p,size,mat,parent=None,rotation=(0,0,0),align='LEFT'):
        return text(name,body,p,size,mat,parent,rotation,align)
    def assembly_transform(prefix,center,angle):
        matrix=Matrix.Translation(Vector(center))@Matrix.Rotation(angle,4,'Z')
        for obj in list(scene.objects):
            if (obj.name==prefix or obj.name.startswith(prefix+'_')) and obj.parent is None:
                obj.matrix_world=matrix@obj.matrix_world
        return matrix
    def seam(name,points,r=.0008):return wire(name,points,r,dark)

    ivory=finish('Warm grey computer ABS',(.57,.55,.49),.44,grain=.045)
    keys=finish('PBT keycaps',(.72,.70,.63),.42,grain=.035)
    dark=finish('Deep charcoal rubber',(.009,.013,.014),.74,grain=.025)
    charcoal=finish('Fine moulded graphite',(.028,.034,.036),.32,grain=.055)
    steel=finish('Satin folded steel',(.22,.25,.26),.32,.68,.025)
    silver=finish('Brushed aluminium',(.53,.56,.55),.26,.78,.035)
    ink=finish('Printed graphite ink',(.035,.040,.038),.72)
    pale=finish('Warm white print',(.76,.75,.68),.72)
    red=finish('Muted oxide red key',(.30,.039,.022),.49)
    blue=finish('Anodised midnight blue',(.025,.074,.105),.30,.55,.035)
    remove('Desk_Glasses')

    # The pot has an unglazed foot, a distinct rolled rim and a mottled fired
    # glaze, rather than a uniformly orange plastic-looking frustum.
    pot=scene.objects['Plant_Pot'];clay=finish('Olive ash stoneware',(.21,.23,.17),.30,grain=.11)
    s=Surface(clay);slow=s.noise(9);s.mix_color(s.math('MULTIPLY',slow,.24),(.33,.32,.23))
    pores=s.ramp(s.noise(620),.69,.80);s.mix_color(s.math('MULTIPLY',pores,.38),(.065,.056,.039))
    p=[(0,-.275),(.155,-.275),(.170,-.272),(.175,-.254),(.183,-.22),(.204,-.09),(.224,.09),(.237,.22),(.248,.23),(.254,.242),(.252,.257),(.244,.265),(.234,.266),(.225,.260),(.222,.245),(.220,.223),(.207,.08),(.187,-.09),(.166,-.24),(0,-.24)]
    vv,ff=_lathe(p,128);_replace(pot,vv,ff,clay);pot['ceramic_finish']=True
    bpy.context.view_layer.update();pc=pot.matrix_world.translation
    foot=lathe('Plant_Pot_Foot',pc,[(.157,-.275),(.170,-.275),(.173,-.263),(.170,-.255),(.157,-.255)],finish('Unglazed clay foot',(.21,.16,.10),.85),atlas='ceramic')
    foot['ceramic_finish']=True

    # A real rod sits below the ceiling, with brackets and rings. The cloth
    # header meets the lower arc of the rings instead of penetrating plaster.
    rodmat=finish('Curtain rod dark bronze',(.11,.085,.053),.38,.68)
    wire('Window_CurtainRod',[(-3.18,.58,4.14),(2.69,.58,4.14)],.018,rodmat,'window')
    for x in (-3.10,-.25,2.61):
        box('Window_CurtainBracket',(x,.91,4.14),(.075,.055,.12),rodmat,.008,'window')
        wire('Window_CurtainBracketArm',[(x,.91,4.14),(x,.64,4.14),(x,.58,4.12)],.010,rodmat,'window')
    for x in (-3.21,2.72):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=.032,location=(x,.58,4.14))
        o=bpy.context.object;o.name='Window_CurtainFinial';o.data.materials.append(rodmat);mark(o,'window')
    for side in ('Left','Right'):
        curtain=scene.objects['Curtain_'+side];lo,hi=bounds(curtain)
        for i in range(7):
            x=lo.x+(hi.x-lo.x)*(i+.15)/6.3
            bpy.ops.mesh.primitive_torus_add(major_radius=.028,minor_radius=.003,major_segments=28,minor_segments=8,location=(x,.58,4.14),rotation=(0,math.pi/2,0))
            o=bpy.context.object;o.name='Window_CurtainRing';o.data.materials.append(rodmat);mark(o,'window')
            wire('Window_CurtainHook',[(x,.58,4.113),(x,.60,4.080),(x,.64,4.075)],.0022,rodmat,'window')

    # Horizontal 486 chassis, tapered CRT on a tilt foot, keyboard and mouse
    # face the working seat at the inside of the desk return.
    remove('Computer')
    remove('Print_PC_Brand')
    remove('Print_PC_Model')
    cpu=box('Computer_Base',(0,.02,.786),(.86,.70,.185),ivory,.008,profile='abs')
    box('Computer_Base_Fascia',(0,-.339,.786),(.86,.025,.175),ivory,.006,profile='abs')
    for x in (-.31,.31):
        for y in (-.23,.24):box('Computer_Foot',(x,y,.691),(.052,.055,.012),dark,.004)
    box('Computer_Drive525',(.155,-.356,.817),(.32,.008,.054),charcoal,.002)
    box('Computer_Drive525_Slot',(.15,-.362,.824),(.265,.003,.007),dark,.001)
    box('Computer_Drive525_Latch',(.28,-.366,.800),(.025,.009,.020),ivory,.002)
    box('Computer_Drive35',(.155,-.356,.752),(.23,.008,.034),ivory,.002)
    box('Computer_Drive35_Slot',(.15,-.362,.758),(.187,.003,.006),dark,.0008)
    box('Computer_Drive35_Eject',(.247,-.365,.742),(.024,.008,.009),charcoal,.001)
    label('Computer_Print_CPU','486 DX2 / 66',(-.34,-.366,.814),.018,ink,rotation=(math.pi/2,0,0))
    for i in range(9):box('Computer_FrontVent',(-.32+i*.023,-.354,.755),(.011,.004,.026),dark,.001)
    box('Computer_Power',( -.337,-.366,.787),(.026,.009,.019),ivory,.003)
    for x in (-.27,-.235):
        led=box('Computer_StatusLED',(x,-.360,.787),(.008,.003,.005),pale,.001);led['surface_role']='led'
    seam('Computer_ChassisSeam',[(-.427,-.31,.868),(.427,-.31,.868)])
    monitor_parts=set(scene.objects)
    box('Computer_Stand_Foot',(0,.03,.895),(.29,.26,.035),ivory,.013)
    box('Computer_Stand_Neck',(0,.075,.937),(.14,.13,.065),ivory,.020)
    vv,ff=loft([(-.235,0,1.228,.656,.534,.023),(-.20,0,1.228,.666,.544,.025),(-.12,0,1.228,.658,.535,.023),(.23,0,1.236,.49,.40,.038),(.33,0,1.236,.46,.37,.035)])
    monitor=mark(_mesh('Computer_Monitor',vv,ff,ivory,scene),profile='abs')
    subtract(monitor,_box('Computer aperture',(0,-.235,1.25),(.526,.15,.406),dark,scene,bevel=.021,segments=6))
    # Recess sides have their own sloping depth; the display is not painted on
    # the outer bezel. Use a fine seal between glass and moulded aperture.
    rings=[(-.249,0,1.25,.542,.422,.024),(-.251,0,1.25,.507,.387,.020),(-.223,0,1.25,.482,.362,.018)]
    vv=[];ff=[]
    from refine_equipment import rounded_rect
    for y,cx,cz,w,h,r in rings:vv.extend((cx+x,y,cz+z)for x,z in rounded_rect(w,h,r))
    count=len(vv)//3
    for k in range(2):
        for i in range(count):j=(i+1)%count;ff.append((k*count+i,(k+1)*count+i,(k+1)*count+j,k*count+j))
    mark(_mesh('Computer_Recess',vv,[tuple(reversed(f)) for f in ff],charcoal,scene))
    screen=box('Computer_Screen',(0,-.228,1.25),(.480,.008,.360),dark,.014)
    for i in range(3):box('Computer_MonitorButton',(.18+i*.033,-.251,1.012),(.022,.009,.014),ivory,.003)
    for side in (-1,1):
        for i in range(8):
            y=-.04+i*.031
            half_width=(.658+(.49-.658)*(y+.12)/.35)/2
            box('Computer_CaseVent',(side*(half_width+.0004),y,1.36),(.003,.018,.082),dark,.001)
    # Increase the 486 monitor relative to the central television using one
    # uniform scale: glass stays 4:3, with its bezel, tilt foot and controls.
    monitor_scale=Matrix.Translation((0,.03,.8775))@Matrix.Scale(1.25,4)@Matrix.Translation((0,-.03,-.8775))
    for obj in set(scene.objects)-monitor_parts:
        if obj.parent is None:obj.matrix_world=monitor_scale@obj.matrix_world
    devices=refine_input_devices(scene,ivory,keys,dark,ink,text)
    keyboard,mouse=devices['keyboard'],devices['mouse']
    matrix=assembly_transform('Computer',(3.53,-1.25,0),math.radians(-90))
    bpy.context.view_layer.update()
    tops=[bounds(scene.objects[name])for name in ('Desk_Top','Desk_Return')]
    for obj in (keyboard,mouse):
        for vertex in obj.data.vertices:
            p=obj.matrix_world@vertex.co
            assert any(lo.x-.001<=p.x<=hi.x+.001 and lo.y-.001<=p.y<=hi.y+.001 for lo,hi in tops),obj.name+' overhangs the desk return'
    screen_corners=[matrix@monitor_scale@Vector(p)for p in [(-.240,-.234,1.430),(.240,-.234,1.430),(.240,-.234,1.070),(-.240,-.234,1.070)]]

    # A corded desk phone: the receiver sits on two cradles at the left, and
    # the sloped keypad remains usable with the receiver resting in place.
    remove('Retro_Phone')
    phone=box('Retro_Phone',(0,0,.736),(.34,.40,.10),ivory,.022,profile='abs')
    for v in phone.data.vertices:
        if v.co.z>0:v.co.z+=v.co.y*.16
    for x in (-.128,.128):
        for y in (-.155,.155):box('Retro_Phone_Foot',(x,y,.689),(.035,.038,.008),dark,.004)
    for y in (-.135,.135):box('Retro_Phone_Cradle',(-.098,y,.81+y*.16),(.082,.052,.045),ivory,.009)
    vv=[];ff=[];segments=28
    for t,w,h,z in [(0,.063,.043,.805),(.06,.078,.052,.810),(.22,.075,.047,.818),(.34,.044,.032,.840),(.66,.044,.032,.856),(.80,.075,.047,.864),(.94,.078,.052,.868),(1,.063,.043,.865)]:
        y=-.182+t*.364
        vv.extend((-.098+x,y,z+a)for x,a in rounded_rect(w,h,.012,steps=6))
    count=len(vv)//8
    for k in range(7):
        for i in range(count):j=(i+1)%count;ff.append((k*count+i,(k+1)*count+i,(k+1)*count+j,k*count+j))
    ff += [tuple(range(count)),tuple(reversed(range(7*count,8*count)))]
    mark(_mesh('Retro_Phone_Handset',vv,ff,ivory,scene,smooth=True),profile='abs')
    for row in range(4):
        for col in range(3):
            x=.000+col*.044;y=.075-row*.052
            key=box('Retro_Phone_Key',(x,y,.794+y*.16),(.036,.039,.013),keys,.004)
            key.rotation_euler.x=math.atan(.16)
            label('Retro_Phone_Print_Key','123456789*0#'[row*3+col],(-.009,-.008,.007),.017,ink,key)
    box('Retro_Phone_NumberLabel',(.045,.139,.818),(.16,.045,.002),pale,.001)
    pts=[]
    for i in range(281):
        t=i/280;angle=t*math.tau*22
        pts.append((-.192+.010*math.cos(angle),-.18+t*.32,.709+.010*math.sin(angle)))
    wire('Retro_Phone_Cord',pts,.0025,dark)
    assembly_transform('Retro_Phone',(2.75,.40,0),math.radians(-12))

    # A pocket cassette player lies on the desk, with a thin metal cover,
    # recessed viewing window, cassette inside and mechanical side keys.
    remove('Desk_Walkman')
    player=box('Desk_Walkman',(0,0,.719),(.18,.285,.064),blue,.009,profile='satin-metal')
    box('Desk_Walkman_Seam',(0,0,.738),(.181,.286,.003),dark,.007)
    box('Desk_Walkman_Door',(0,.008,.752),(.170,.250,.017),silver,.006,profile='satin-metal')
    box('Desk_Walkman_WindowBezel',(0,.025,.762),(.126,.129,.004),dark,.006)
    box('Desk_Walkman_Tape',(0,.025,.764),(.116,.118,.0015),charcoal,.004)
    for x in (-.031,.031):
        lathe('Desk_Walkman_Reel',(x,.028,.765),[(.008,0),(.021,0),(.021,.001),(.008,.001)],ivory,segments=32)
        lathe('Desk_Walkman_Hub',(x,.028,.766),[(0,0),(.006,0),(.006,.001),(0,.001)],dark,segments=24)
        for i in range(6):
            angle=i*math.tau/6
            tooth=box('Desk_Walkman_HubTooth',(x+math.cos(angle)*.007,.028+math.sin(angle)*.007,.767),(.004,.003,.0015),ivory,.0003)
            tooth.rotation_euler.z=angle
    glass=box('Desk_Walkman_Window',(0,.025,.768),(.120,.123,.001),dark,.005,profile='tape-window')
    for i in range(4):
        key=box('Desk_Walkman_Key',(.096,-.060+i*.044,.743),(.015,.033,.012),charcoal,.003)
    box('Desk_Walkman_Stop',(.096,.112,.744),(.016,.028,.014),red,.003)
    label('Desk_Walkman_Print','STEREO',(-.068,-.087,.763),.019,ink)
    label('Desk_Walkman_Print_Sub','CASSETTE PLAYER',(-.067,-.110,.763),.010,ink)
    # An unoccupied headphone socket avoids a loose cable ending in mid-air.
    socket=lathe('Desk_Walkman_HeadphoneSocket',(0,0,0),[(.002,0),(.004,0),(.004,.004),(.002,.004)],silver,segments=24)
    socket.location=(.075,.141,.726);socket.rotation_euler.x=math.pi/2
    assembly_transform('Desk_Walkman',(2.34,.13,0),math.radians(-16))

    # The lamp base is a weighted spun-metal dome with a felt sole, shaft
    # collar and a restrained highlight around the rolled edge.
    base=scene.objects['Lamp_Base'];lo,hi=bounds(base);center=(lo+hi)/2
    profile=[(0,lo.z),(.205,lo.z),(.230,lo.z+.004),(.238,lo.z+.012),(.238,lo.z+.020),(.231,lo.z+.025),(.20,lo.z+.035),(.13,lo.z+.048),(.045,lo.z+.055),(0,lo.z+.055)]
    vv,ff=_lathe(profile,128);replace_world(base,[(center.x+x,center.y+y,z)for x,y,z in vv],ff,finish('Satin aged brass base',(.30,.18,.080),.28,.72,.035),True)
    lathe('Lamp_Base_Felt',(center.x,center.y,lo.z),[(0,0),(.215,0),(.215,.003),(0,.003)],dark,atlas='lamp')
    lathe('Lamp_Base_Collar',(center.x,center.y,lo.z+.053),[(.019,0),(.034,0),(.035,.008),(.029,.018),(.020,.022)],silver,atlas='lamp')

    # Recut calculator/remote shells with a genuine parting line. The labels,
    # LCD and individual key IDs stay attached to their existing transforms.
    for name in ('Desk_Calculator','Desk_Remote'):
        obj=scene.objects[name];lo,hi=local_bounds(obj)
        casing(obj,charcoal,.009 if name.endswith('Calculator')else .012)
        mark(obj,profile='abs')
        z=lo.z+(hi.z-lo.z)*.37
        outline=[(x,y,z)for x,y in rounded_rect(hi.x-lo.x,hi.y-lo.y,.010,steps=6)]
        outline.append(outline[0]);seam(name+'_CaseSeam',[obj.matrix_world@Vector(p)for p in outline],.00065)
    for obj in list(scene.objects):
        if obj.name.startswith(('Desk_Calculator_Key','Remote_Key')) and not obj.get('surface_role'):
            keymat=keys if obj.name.startswith('Desk_Calculator')else red if obj.name=='Remote_Key'else charcoal
            casing(obj,keymat,.003,dish=.0007);mark(obj,profile='abs')
    # The pencil remains a real six-sided lacquered cedar barrel, not a shiny
    # generic rod. Its ferrule and sharpened wooden cone stay separate.
    pencil=scene.objects['Desk_Pencil'];pencil.data.materials.clear();pencil.data.materials.append(finish('Pencil ochre lacquer',(.42,.19,.025),.32,grain=.025))
    pencil['hero_atlas']='equipment';pencil['surface_profile']='abs'
    for obj in scene.objects:
        if obj.name.startswith('Desk_Pencil_Ferrule'):
            obj.data.materials.clear();obj.data.materials.append(silver);mark(obj,profile='satin-metal')
    # Relieve the overly uniform TV control strip with a recessed speaker
    # grille, and add the folded cover lips/feet a VCR needs to carry a CRT.
    for i in range(18):box('CRT_SpeakerSlot',(-.46+i*.029,-.327,1.265),(.016,.003,.003),dark,.0007)
    # Feet occupy a recessed underside; they must not intersect the case.
    vcr=scene.objects['VCR_Body'];inv=vcr.matrix_world.inverted()
    for vertex in vcr.data.vertices:
        p=vcr.matrix_world@vertex.co
        if p.z<.710:p.z=.703+(p.z-.685)*.39;vertex.co=inv@p
    for x in (-.55,.55):
        for y in (-.34,.31):box('VCR_Foot',(x,y,.694),(.075,.085,.018),dark,.006)
    vcr=scene.objects['VCR_Body'];vcr.data.materials.clear();vcr.data.materials.append(finish('VCR folded graphite enamel',(.055,.063,.067),.28,.48,.045));vcr['surface_profile']='satin-metal'
    bpy.context.view_layer.update()
    return {'computerSurface':[[p.x,p.z,-p.y]for p in screen_corners],
            'computerPosition':[3.53,-1.25,0],'computerYawDegrees':-90,
            'computerMonitorScale':1.25,'computerScreenWidth':.60,'televisionScreenWidth':.90,
            'inputDevices':{k:v for k,v in devices.items()if k not in ('keyboard','mouse')},
            'curtainRodHeight':4.14,'glassesRemoved':True,'phoneHandset':'continuous cradled receiver',
            'walkmanSize':[.18,.285,.064],'potFinish':'ash glazed stoneware'}
