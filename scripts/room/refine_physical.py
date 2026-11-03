"""Physical desktop construction: actual supports, seams, usable controls and scale.

Runs before atlas baking. Coordinates are metres in Blender's Z-up world.
The CRT screen and tape transport keep their established interaction anchors.
"""
import math
import bpy
from mathutils import Vector, Matrix
from aging import Surface
from refine_geometry import _box, _mesh, _replace, _lathe, _tube, _activate
from refine_equipment import finish, bounds, replace_world, replace_box, loft, subtract, cable
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
    operator_keys=finish('Calculator dark warm grey ABS keys',(.11,.105,.088),.43,grain=.018)
    dark=finish('Deep charcoal rubber',(.009,.013,.014),.74,grain=.025)
    charcoal=finish('Fine moulded graphite',(.028,.034,.036),.32,grain=.055)
    steel=finish('Satin folded steel',(.22,.25,.26),.32,.68,.025)
    silver=finish('Brushed aluminium',(.53,.56,.55),.26,.78,.035)
    ink=finish('Printed graphite ink',(.035,.040,.038),.72)
    pale=finish('Warm white print',(.76,.75,.68),.72)
    red=finish('Muted oxide red key',(.30,.039,.022),.49)
    blue=finish('Anodised midnight blue',(.025,.074,.105),.30,.55,.035)
    remove('Desk_Glasses')

    # White glaze retains the existing warm-white appearance under the lamp.
    # Its restrained orange peel is in gloss, not dark speckles in the colour.
    pot=scene.objects['Plant_Pot'];clay=finish('Warm white glazed stoneware',(.69,.68,.63),.22,grain=.025)
    s=Surface(clay);slow=s.noise(18)
    s.mix_color(s.math('MULTIPLY',slow,.035),(.62,.61,.57))
    s.p.inputs['Coat Weight'].default_value=.18
    s.p.inputs['Coat Roughness'].default_value=.19
    p=[(0,-.275),(.155,-.275),(.170,-.272),(.175,-.254),(.183,-.22),(.204,-.09),(.224,.09),(.237,.22),(.248,.23),(.254,.242),(.252,.257),(.244,.265),(.234,.266),(.225,.260),(.222,.245),(.220,.223),(.207,.08),(.187,-.09),(.166,-.24),(0,-.24)]
    vv,ff=_lathe(p,128);_replace(pot,vv,ff,clay);pot['ceramic_finish']=True;pot['surface_profile']='glazed-ceramic'
    bpy.context.view_layer.update();pc=pot.matrix_world.translation
    foot=lathe('Plant_Pot_Foot',pc,[(.157,-.275),(.170,-.275),(.173,-.263),(.170,-.255),(.157,-.255)],finish('Unglazed stoneware foot',(.39,.35,.28),.85),atlas='ceramic')
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
        curtain=scene.objects['Curtain_'+side]
        attachments=curtain['curtain_hangers']
        for i in range(0,len(attachments),3):
            attachment=curtain.matrix_world@Vector(attachments[i:i+3]);x=attachment.x
            bpy.ops.mesh.primitive_torus_add(major_radius=.028,minor_radius=.003,major_segments=28,minor_segments=8,location=(x,.58,4.14),rotation=(0,math.pi/2,0))
            o=bpy.context.object;o.name='Window_CurtainRing';o.data.materials.append(rodmat);mark(o,'window')
            wire('Window_CurtainHook',[(x,.58,4.113),(x,.60,4.080),
                 attachment,attachment+Vector((0,.003,-.009))],.0022,rodmat,'window')

    # Horizontal 486 chassis, tapered CRT on a tilt foot, keyboard and mouse
    # face the working seat at the inside corner. The diagonal position keeps
    # the screen reachable with a single Home turn, within its existing limits.
    remove('Computer')
    remove('Print_PC_Brand')
    remove('Print_PC_Model')
    cpu=box('Computer_Base',(0,.02,.786),(.86,.70,.185),ivory,.008,profile='abs')
    cpu_front=box('Computer_Base_Fascia',(0,-.339,.786),(.86,.025,.175),ivory,.006,profile='abs')
    for x in (-.31,.31):
        for y in (-.23,.24):box('Computer_Foot',(x,y,.691),(.052,.055,.012),dark,.004)
    box('Computer_Drive525',(.155,-.356,.817),(.32,.008,.054),charcoal,.002)
    box('Computer_Drive525_Slot',(.15,-.362,.824),(.265,.003,.007),dark,.001)
    box('Computer_Drive525_Latch',(.28,-.366,.800),(.025,.009,.020),ivory,.002)
    box('Computer_Drive35',(.155,-.356,.752),(.23,.008,.034),ivory,.002)
    box('Computer_Drive35_Slot',(.15,-.362,.758),(.187,.003,.006),dark,.0008)
    box('Computer_Drive35_Eject',(.247,-.365,.742),(.024,.008,.009),charcoal,.001)
    label('Computer_Print_CPU','486 DX2 / 66',(-.34,-.366,.814),.018,ink,rotation=(math.pi/2,0,0))
    for i in range(9):
        x=-.32+i*.023
        for shell in (cpu,cpu_front):
            subtract(shell,_box('Computer chassis vent cutter',(x,-.345,.755),(.011,.060,.026),dark,scene,bevel=.0015,segments=4))
    box('Computer_FrontVentBacking',(-.228,-.313,.755),(.21,.003,.035),dark,.001)
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
    for y,cx,cz,w,h,r in rings:vv.extend((cx+x,y,cz+z)for x,z in rounded_rect(w,h,r,steps=24))
    count=len(vv)//3
    for k in range(2):
        for i in range(count):j=(i+1)%count;ff.append((k*count+i,(k+1)*count+i,(k+1)*count+j,k*count+j))
    recess=mark(_mesh('Computer_Recess',vv,[tuple(reversed(f)) for f in ff],charcoal,scene,smooth=True))
    recess.data.set_sharp_from_angle(angle=math.radians(50))
    screen=box('Computer_Screen',(0,-.228,1.25),(.480,.008,.360),dark,.014)
    for i in range(3):box('Computer_MonitorButton',(.18+i*.033,-.251,1.012),(.022,.009,.014),ivory,.003)
    # Side vents are cut after the final front-lip reconstruction in
    # refine_control_layout; a row of raised dark bars cannot supply depth.
    # Increase the 486 monitor relative to the central television using one
    # uniform scale: glass stays 4:3, with its bezel, tilt foot and controls.
    monitor_scale=Matrix.Translation((0,.03,.8775))@Matrix.Scale(1.25,4)@Matrix.Translation((0,-.03,-.8775))
    for obj in set(scene.objects)-monitor_parts:
        if obj.parent is None:obj.matrix_world=monitor_scale@obj.matrix_world
    devices=refine_input_devices(scene,ivory,keys,dark,ink,text)
    keyboard,mouse=devices['keyboard'],devices['mouse']
    # The monitor takes power from the chassis' auxiliary IEC outlet. The
    # chassis mains flex rolls over the rear desk edge, with its plug seated
    # at the device rather than ending as a loose cord beside the case.
    flex=finish('Desktop electrical PVC flex',(.014,.015,.014),.47,grain=.010)
    for name,x,z in [('Mains',-.28,.79),('MonitorFeed',-.15,.81)]:
        box('Computer_'+name+'Socket',(x,.373,z),(.064,.008,.042),dark,.004)
        box('Computer_'+name+'Plug',(x,.394,z),(.044,.034,.029),flex,.005)
        box('Computer_'+name+'Boot',(x,.419,z),(.014,.021,.014),flex,.005)
    monitor_port=monitor_scale@Vector((-.14,.33,1.08))
    box('Computer_MonitorPowerSocket',monitor_port+Vector((0,.003,0)),(.065,.008,.045),dark,.004)
    box('Computer_MonitorPowerPlug',monitor_port+Vector((0,.025,0)),(.044,.036,.029),flex,.005)
    cable('Computer_MonitorPowerCable',[monitor_port+Vector((0,.045,0)),(-.175,.52,1.10),(-.17,.55,.98),(-.15,.51,.86),(-.15,.442,.81),(-.15,.429,.81)],.0037,flex,scene)
    cable('Computer_MainsCable',[(-.28,.429,.79),(-.28,.51,.75),(-.20,.70,.691),(.02,.95,.691),(.05,1.13,.691),(.05,1.175,.692),(.05,1.21,.64),(.05,1.23,.55)],.0043,flex,scene)
    matrix=assembly_transform('Computer',(3.05,0,0),math.radians(-35))
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
    parting=box('Desk_Walkman_Seam',(0,0,.738),(.181,.286,.003),dark,.007)
    door=box('Desk_Walkman_Door',(0,.008,.752),(.170,.250,.017),silver,.006,profile='satin-metal')
    bezel=box('Desk_Walkman_WindowBezel',(0,.025,.761),(.126,.129,.004),dark,.006)
    # Cut every layer in the viewing path. The cassette sits below the lid,
    # with real inner walls visible through its flush acrylic window.
    for shell in (player,parting,door,bezel):
        subtract(shell,_box('Walkman window opening',(0,.025,.761),(.116,.119,.042),dark,scene,bevel=.004,segments=8))
    box('Desk_Walkman_CassetteWell',(0,.025,.736),(.120,.123,.004),dark,.004)
    tape=box('Desk_Walkman_Tape',(0,.025,.743),(.113,.116,.007),charcoal,.003)
    tape_stock=finish('Cassette brown oxide tape',(.045,.027,.018),.46,grain=.006)
    reel_plastic=finish('Cassette ivory reel cores',(.54,.52,.43),.47,grain=.008)
    for x,radius in ((-.031,.023),(.031,.017)):
        bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=.025,depth=.014,location=(x,.028,.748))
        subtract(tape,bpy.context.object)
        # Unequal wound tape packs and recessed six-tooth hubs make a cassette,
        # instead of two white discs pasted on the exterior glass.
        lathe('Desk_Walkman_Reel',(x,.028,.742),[(.010,0),(radius,0),(radius,.003),(.010,.003)],tape_stock,segments=64)
        for band in range(3):
            r=.011+(radius-.011)*(band+1)/4
            lathe('Desk_Walkman_TapeWinding',(x,.028,.745),[(r-.00017,0),(r+.00017,0),(r+.00017,.00012),(r-.00017,.00012)],dark,segments=64)
        lathe('Desk_Walkman_Hub',(x,.028,.743),[(.005,0),(.010,0),(.010,.003),(.005,.003)],reel_plastic,segments=64)
        for i in range(6):
            angle=i*math.tau/6
            tooth=box('Desk_Walkman_HubTooth',(x+math.cos(angle)*.005,.028+math.sin(angle)*.005,.746),(.003,.002,.0015),reel_plastic,.0003)
            tooth.rotation_euler.z=angle
    for x in (-.048,.048):
        for y in (-.022,.072):
            lathe('Desk_Walkman_CassetteScrew',(x,y,.7465),[(0,0),(.0017,0),(.0017,.0004),(0,.0004)],silver,segments=24)
    acrylic=finish('Walkman clear acrylic window',(.17,.20,.19),.13,grain=0)
    # The live transparent profile supplies the reflection. Let bake rays reach
    # the cassette rather than storing an opaque window-shaped shadow on it.
    transparent=acrylic.node_tree.nodes.new('ShaderNodeBsdfTransparent')
    transparent.name='BakeShadowlessSurface'
    acrylic.node_tree.links.new(transparent.outputs[0],acrylic.node_tree.nodes.get('Material Output').inputs['Surface'])
    outline=rounded_rect(.120,.123,.005,steps=16)
    glass=mark(_mesh('Desk_Walkman_Window',[(x,.025+y,.762)for x,y in outline],
                    [tuple(range(len(outline)))],acrylic,scene),profile='tape-window')
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
    # The base is exposed brass with a thin oxide film, not a partly metallic
    # beige coating. Too much dielectric diffuse washed it into ivory under
    # the nearby bulb, breaking its relationship with the brass stem.
    vv,ff=_lathe(profile,128);replace_world(base,[(center.x+x,center.y+y,z)for x,y,z in vv],ff,finish('Satin aged brass base',(.30,.18,.080),.30,.94,.025),True)
    lathe('Lamp_Base_Felt',(center.x,center.y,lo.z),[(0,0),(.215,0),(.215,.003),(0,.003)],dark,atlas='lamp')
    lathe('Lamp_Base_Collar',(center.x,center.y,lo.z+.053),[(.019,0),(.034,0),(.035,.008),(.029,.018),(.020,.022)],silver,atlas='lamp')
    # A moulded rear grommet and flexible lead emerge from the base. The lead
    # rests behind the clock and ends in the wall outlet's third seated plug.
    box('Lamp_CableGrommet',(center.x,center.y+.229,lo.z+.015),(.025,.020,.018),dark,.006,profile='abs')
    cable('Lamp_MainsCable',[(center.x,center.y+.239,lo.z+.015),(center.x-.025,.40,.695),
          (center.x-.11,.58,.690),(center.x-.12,.78,.690),(center.x-.01,.885,.691),
          (-1.30,.895,.691),(-1.13,.908,.692),(-1.10,.946,.81),(-1.10,.956,.86)],.0037,flex,scene)

    # Bound FIELD NOTES notebook: the printed top remains at its original
    # height, with thin cover boards overhanging a recessed paper block.
    book=scene.objects['Desk_Book'];bl,bh=local_bounds(book)
    from refine_paper import paper_finish
    pages=paper_finish('Field notebook exposed paper edges',(.70,.67,.58),True)
    cover=paper_finish('Field notebook cream cover stock',(.75,.72,.63))
    cover.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.69
    spine=paper_finish('Field notebook woven spine',(.57,.54,.46),cloth=True)
    spine.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.87
    temp=_box('Notebook paper block',(bl+bh)/2+Vector((.002,0,0)),bh-bl-Vector((.014,.012,.0064)),pages,scene,bevel=.001,segments=3)
    bpy.context.view_layer.update();temp.data.transform(temp.matrix_world)
    book.data=temp.data;bpy.data.objects.remove(temp,do_unlink=True);mark(book,'paper','paper')
    for name,z in (('Lower',bl.z+.0012),('Upper',bh.z-.0012)):
        local_box('Desk_Book_Cover_'+name,((bl.x+bh.x)/2,(bl.y+bh.y)/2,z),(bh.x-bl.x,bh.y-bl.y,.0024),cover,book,.001,'paper','paper')
    # A half-round cloth spine closes the left side; the fore-edge stays paper.
    vv=[];ff=[];steps=20
    for y in (bl.y+.002,bh.y-.002):
        for i in range(steps+1):
            a=-math.pi/2+math.pi*i/steps
            vv.append((bl.x+.005-.007*math.cos(a),y,(bl.z+bh.z)/2+(bh.z-bl.z)*.48*math.sin(a)))
    for i in range(steps):ff.append((i,i+1,i+steps+2,i+steps+1))
    mark(_mesh('Desk_Book_Spine',vv,ff,spine,scene,parent=book,smooth=True),'paper','paper')

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
            calculator=obj.name.startswith('Desk_Calculator')
            index=int(obj.name.rsplit('.',1)[1]) if '.' in obj.name else 0
            keymat=operator_keys if calculator and index%4==3 else keys if calculator else red if obj.name=='Remote_Key'else charcoal
            casing(obj,keymat,.003,dish=.0007);mark(obj,profile='abs')
    # The pencil remains a real six-sided lacquered cedar barrel, not a shiny
    # generic rod. Its ferrule and sharpened wooden cone stay separate.
    pencil=scene.objects['Desk_Pencil'];pencil.data.materials.clear();pencil.data.materials.append(finish('Pencil ochre lacquer',(.42,.19,.025),.32,grain=.025))
    pencil['hero_atlas']='equipment';pencil['surface_profile']='abs'
    for obj in scene.objects:
        if obj.name.startswith('Desk_Pencil_Ferrule'):
            obj.data.materials.clear();obj.data.materials.append(silver);mark(obj,profile='satin-metal')
    # One recessed speaker band replaces both generations of floating bars.
    # The old seven long grooves crossed the later eighteen short strips and
    # cast several rows of black shadow across the bezel above the controls.
    for obj in list(scene.objects):
        if obj.name.startswith(('CRT_SpeakerGroove','CRT_SpeakerSlot')):
            bpy.data.objects.remove(obj,do_unlink=True)
    cutters=[]
    for i in range(18):
        cutters.append(_box('CRT speaker opening cutter',(-.46+i*.029,-.296,1.265),
                            (.016,.032,.003),dark,scene,bevel=.0007,segments=3))
    bpy.ops.object.select_all(action='DESELECT')
    for cutter in cutters:cutter.select_set(True)
    bpy.context.view_layer.objects.active=cutters[0]
    bpy.ops.object.join()
    case=scene.objects['CRT_Case'];subtract(case,bpy.context.object)
    box('CRT_SpeakerBacking',(-.2135,-.284,1.265),(.53,.002,.007),dark,.0006,profile='abs')
    # Boolean cutters transfer corner normals; rebuild before the final
    # manufactured-normal pass so slit returns never inherit the face normal.
    _activate(case)
    if case.data.has_custom_normals:bpy.ops.mesh.customdata_custom_splitnormals_clear()
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
    # Feet occupy a recessed underside; they must not intersect the case.
    vcr=scene.objects['VCR_Body'];inv=vcr.matrix_world.inverted()
    for vertex in vcr.data.vertices:
        p=vcr.matrix_world@vertex.co
        if p.z<.710:p.z=.703+(p.z-.685)*.39;vertex.co=inv@p
    for x in (-.55,.55):
        for y in (-.34,.31):box('VCR_Foot',(x,y,.694),(.075,.085,.018),dark,.006)
    vcr=scene.objects['VCR_Body'];vcr.data.materials.clear();vcr.data.materials.append(finish('VCR folded graphite enamel',(.055,.063,.067),.29,0,.045));vcr['surface_profile']='painted-metal'
    bpy.context.view_layer.update()
    return {'computerSurface':[[p.x,p.z,-p.y]for p in screen_corners],
            'computerPosition':[3.05,0,0],'computerYawDegrees':-35,
            'computerMonitorScale':1.25,'computerScreenWidth':.60,'televisionScreenWidth':.90,
            'inputDevices':{k:v for k,v in devices.items()if k not in ('keyboard','mouse')},
            'curtainRodHeight':4.14,'glassesRemoved':True,'phoneHandset':'continuous cradled receiver',
            'walkmanSize':[.18,.285,.064],'potFinish':'warm white glazed stoneware',
            'notebookCoverThickness':.0024,'notebookPaperInset':.006}
