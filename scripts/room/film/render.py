"""Original NIGHT LOG miniature cinematography. No reference-site assets.

Blender --background --python scripts/room/film/render.py -- --shot train --frame 192
Full shots: --start 1 --end 384. Builds and frames stay outside public until reviewed.
"""
import argparse, math, random, sys, time, json
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
BUILD = ROOT / '.room-build/high-quality/film'
FONT = ROOT / 'public/room/fonts/VT323-Regular.ttf'
args = argparse.ArgumentParser()
args.add_argument('--shot', choices=['train','idea','world'], required=True)
args.add_argument('--frame', type=int)
args.add_argument('--start', type=int, default=1)
args.add_argument('--end', type=int, default=384)
args.add_argument('--samples', type=int, default=48)
args.add_argument('--engine', choices=['CYCLES','BLENDER_EEVEE'], default='CYCLES')
args.add_argument('--width', type=int, default=960)
args.add_argument('--resume', action='store_true')
args.add_argument('--build-dir', type=Path, default=BUILD)
args.add_argument('--patch-source', type=Path, help='Existing native frames; render only changed lettering regions')
opts = args.parse_args(sys.argv[sys.argv.index('--')+1:])
BUILD=opts.build_dir.resolve()
BUILD.mkdir(parents=True,exist_ok=True)
random.seed(219)

if opts.shot=='idea':
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'scripts/room/film/source/idea-room.blend'))
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.render.engine=opts.engine
scene.render.resolution_x=opts.width;scene.render.resolution_y=round(opts.width*.75)
scene.render.resolution_percentage=100;scene.render.fps=24
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
scene.render.image_settings.color_depth='8';scene.render.film_transparent=False
scene.render.use_motion_blur=True;scene.render.motion_blur_shutter=.35
scene.frame_start=1;scene.frame_end=384
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=0
if opts.engine=='CYCLES':
    scene.cycles.samples=opts.samples;scene.cycles.use_denoising=True
    scene.cycles.max_bounces=5;scene.cycles.diffuse_bounces=3;scene.cycles.glossy_bounces=3
    scene.cycles.transmission_bounces=4;scene.cycles.use_adaptive_sampling=True
    prefs=bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type='METAL';prefs.get_devices()
    for d in prefs.devices:d.use=d.type=='METAL'
    scene.cycles.device='GPU' if any(d.type=='METAL' for d in prefs.devices) else 'CPU'
else:
    scene.eevee.taa_render_samples=opts.samples
    scene.eevee.use_raytracing=True
    scene.eevee.ray_tracing_options.resolution_scale='1'
    scene.eevee.ray_tracing_options.screen_trace_quality=1
    scene.eevee.use_fast_gi=True
scene.world=scene.world or bpy.data.worlds.new('Night atmosphere')
scene.world.use_nodes=True
bg=scene.world.node_tree.nodes.get('Background')
bg.inputs[0].default_value=(.08,.12,.18,1);bg.inputs[1].default_value=.25
retro_font=bpy.data.fonts.load(str(FONT))
sans_path=Path('/System/Library/Fonts/Supplemental/Arial.ttf')
font=bpy.data.fonts.load(str(sans_path)) if sans_path.exists() else bpy.data.fonts.get('Bfont')

def mat(name,color,rough=.4,metal=0,emission=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
    return m

def textured(name,lo,hi,scale,rough=.45,bump=.025,metal=0):
    m=mat(name,lo,rough,metal);n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF')
    coord=n.new('ShaderNodeTexCoord');v=n.new('ShaderNodeVectorMath');v.operation='MULTIPLY';v.inputs[1].default_value=scale;l.new(coord.outputs['Object'],v.inputs[0])
    noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=1;noise.inputs['Detail'].default_value=3;l.new(v.outputs[0],noise.inputs[0])
    ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(*lo,1);ramp.color_ramp.elements[1].color=(*hi,1);l.new(noise.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs[0],p.inputs['Base Color'])
    b=n.new('ShaderNodeBump');b.inputs['Strength'].default_value=.2;b.inputs['Distance'].default_value=bump;l.new(noise.outputs['Fac'],b.inputs['Height']);l.new(b.outputs[0],p.inputs['Normal'])
    return m

def finish(o,name,m,bevel=0):
    o.name=name
    if m:o.data.materials.append(m)
    if bevel:
        b=o.modifiers.new('Manufactured radius','BEVEL');b.width=bevel;b.segments=3
        b.limit_method='ANGLE';w=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
    return o

box_meshes={}
def box(name,loc,size,m,bevel=.01,parent=None):
    # Direct datablock construction avoids quadratic depsgraph updates from
    # thousands of operator calls; repeated architectural parts share meshes.
    key=(tuple(size),m.name if m else '')
    mesh=box_meshes.get(key)
    if mesh is None:
        x,y,z=(v/2 for v in size);mesh=bpy.data.meshes.new(name)
        mesh.from_pydata([(-x,-y,-z),(-x,-y,z),(-x,y,-z),(-x,y,z),(x,-y,-z),(x,-y,z),(x,y,-z),(x,y,z)],[],[(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)])
        if m:mesh.materials.append(m)
        box_meshes[key]=mesh
    o=bpy.data.objects.new(name,mesh);scene.collection.objects.link(o);o.location=loc
    finish(o,name,None,bevel)
    if parent:o.parent=parent
    return o

def cyl(name,loc,r,depth,m,rot=None,parent=None,vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=loc);o=bpy.context.object
    if rot:o.rotation_euler=rot
    finish(o,name,m,.001 if r<.1 else .015)
    for p in o.data.polygons:p.use_smooth=True
    if parent:o.parent=parent
    return o

def sphere(name,loc,scale,m,parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,location=loc);o=bpy.context.object;o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for p in o.data.polygons:p.use_smooth=True
    finish(o,name,m)
    if parent:o.parent=parent
    return o

def rod(name,a,b,r,m,parent=None):
    a,b=Vector(a),Vector(b);o=cyl(name,(a+b)/2,r,(b-a).length,m,parent=parent)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o

def line(name,points,r,m,parent=None):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=16;c.bevel_depth=r;c.bevel_resolution=3
    sp=c.splines.new('BEZIER');sp.bezier_points.add(len(points)-1)
    for p,co in zip(sp.bezier_points,points):p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,c);scene.collection.objects.link(o);o.data.materials.append(m)
    if parent:o.parent=parent
    return o

def text(name,body,loc,size,m,rot=(math.pi/2,0,0),parent=None,retro=False):
    c=bpy.data.curves.new(name,'FONT');c.body=body;c.size=size;c.font=retro_font if retro else font;c.extrude=.0001
    o=bpy.data.objects.new(name,c);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=rot;o.data.materials.append(m)
    if parent:o.parent=parent
    return o

def light(name,loc,target,power,color,size,shape='DISK',size_y=None):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape=shape;d.size=size
    if size_y:d.size_y=size_y
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o

def camera(loc,target,lens,aperture=5.6):
    d=bpy.data.cameras.new('FilmCamera');o=bpy.data.objects.new('FilmCamera',d);scene.collection.objects.link(o);scene.camera=o
    o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();d.lens=lens
    d.dof.use_dof=True;d.dof.focus_distance=(Vector(target)-o.location).length;d.dof.aperture_fstop=aperture
    return o

def empty(name):
    o=bpy.data.objects.new(name,None);scene.collection.objects.link(o);return o

update=lambda t:None

def train_scene():
    global update
    scene.view_settings.exposure=.15
    bg.inputs[0].default_value=(.045,.075,.12,1);bg.inputs[1].default_value=.055
    metal=textured('Brushed aluminium',(.28,.33,.34),(.53,.57,.56),(2,80,130),.26,.0007,.85)
    dark=mat('Rubber and recessed housings',(.009,.014,.018),.58)
    teal=mat('Deep petrol enamel',(.018,.10,.115),.23,.45)
    steel=mat('Rail steel',(.15,.19,.20),.23,.9)
    cream=mat('Ivory print',(.75,.72,.58),.48)
    warm=mat('Carriage opal interior',(.96,.65,.30),.32,0,2.4)
    cool=mat('Platform opal luminaires',(.61,.78,.85),.25,0,3)
    red=mat('Rear lamps',(.7,.015,.004),.22,0,3)
    glass=mat('Slightly tinted curved glass',(.91,.96,.97),.045,0)
    glass.node_tree.nodes.get('Principled BSDF').inputs['Transmission Weight'].default_value=1
    glass.node_tree.nodes.get('Principled BSDF').inputs['IOR'].default_value=1.46
    wet=textured('Wet basalt slabs',(.021,.034,.044),(.10,.13,.14),(12,12,15),.23,.012)
    grit=textured('Track crushed granite',(.025,.029,.032),(.12,.13,.13),(30,30,30),.95,.07)
    concrete=textured('Board formed concrete',(.18,.20,.19),(.28,.30,.28),(4,4,12),.86,.02)
    paint=textured('Platform safety paint',(.38,.22,.045),(.69,.50,.18),(90,90,20),.51,.001)
    box('Track ballast',(0,1,-.08),(90,4,.3),grit,0)
    for x in range(-40,41):box('Creosoted sleeper',(x*.65,1,.05),(.2,2.6,.14),dark,.02)
    for y in [.25,1.75]:
        box('Rail head',(0,y,.23),(90,.08,.1),steel,.025);box('Rail foot',(0,y,.10),(90,.18,.05),steel,.008)
    # Individually jointed slabs are physical surfaces, not a flat tiled graphic.
    for ix in range(-18,19):
        for iy in range(4):box('Jointed wet paving',(ix*1.25,-1.2-iy*.9,.08),(1.242,.892,.25),wet,.012)
    box('Platform concrete edge',(0,-.65,-.04),(50,.25,.65),concrete,.03)
    box('Safety line',(0,-.96,.214),(50,.09,.003),paint,.001)
    for x in range(-22,23):
        for y in [-1.10,-1.18]:
            cyl('Tactile brass stud',(x*.18,y,.222),.024,.008,paint,vertices=12)
    for x in [-13,-8,5,14]:
        box('Canopy post',(x,-4,2.1),(.14,.16,4.2),teal,.018)
        box('Canopy rafter',(x,-2.2,4.12),(.12,4.2,.20),teal,.012)
        rod('Diagonal canopy brace',(x,-4,3.0),(x,-2.6,4.0),.045,steel)
    box('Canopy underside',(0,-2.5,4.35),(42,4,.12),concrete,.03)
    for x in range(-16,18,4):
        box('Luminaires',(x,-2.45,4.23),(1.8,.12,.07),dark,.015)
        box('Luminous diffusers',(x,-2.45,4.18),(1.65,.09,.015),cool,.012)
        light('Platform light',(x,-2.45,4.1),(x,-2.45,0),40,(.62,.76,1),1.7,'RECTANGLE',.16)
    # Credible carriage shell: separate frames, glazed openings, doors and undercarriage.
    train=empty('Last service')
    for car in range(3):
        cx=car*11.5
        box('Rounded lower carriage shell',(cx,1,1.12),(10.9,2.65,1.16),metal,.18,train)
        box('Roof crown',(cx,1,3.12),(10.25,2.45,.35),metal,.22,train)
        box('Carriage ceiling',(cx,1,2.91),(10.4,2.5,.14),cream,.03,train)
        for ex in [-5.32,5.32]:box('Closed carriage end bulkhead',(cx+ex,1,1.88),(.08,2.50,2.28),metal,.025,train)
        box('Interior floor',(cx,1,1.70),(10.2,2.4,.06),dark,.015,train)
        box('Continuous interior light',(cx,1,2.81),(9.8,.28,.03),warm,.015,train)
        inside=light('Warm carriage ceiling light',(cx,.8,2.76),(cx,.8,1.7),65,(1,.63,.31),8.5,'RECTANGLE',.3);inside.parent=train
        box('Far interior back wall',(cx,2.24,2.23),(10.25,.06,1.02),cream,.02,train)
        for j in range(14):
            box('Upholstered seat back',(cx-4.5+j*.68,1.93,2.06),(.52,.14,.58),teal,.065,train)
            box('Upholstered seat cushion',(cx-4.5+j*.68,1.69,1.80),(.52,.50,.13),teal,.05,train)
        for j in range(5):rod('Interior grab pole',(cx-4+j*2,1.25,1.72),(cx-4+j*2,1.25,2.83),.023,steel,train)
        box('Enamel waist band',(cx,-.335,1.48),(10.35,.035,.24),teal,.012,train)
        box('Lower sill shadow',(cx,-.34,.83),(10.2,.05,.06),dark,.006,train)
        for side in [-1,1]:
            y=1+side*1.335
            box('Window header rail',(cx,y,2.86),(10.5,.12,.19),metal,.04,train)
            box('Window sill skin',(cx,y,1.73),(10.5,.12,.17),metal,.025,train)
            box('Carriage end side panel',(cx-4.98,y,2.26),(.97,.12,1.22),metal,.045,train)
            box('Door end jamb',(cx+5.29,y,2.26),(.26,.12,1.22),metal,.035,train)
            for j in range(7):
                wx=cx-3.9+j*1.3
                box('Sidewall pillar',(wx+.65,y,2.27),(.22,.12,1.18),metal,.045,train)
                for dx in [-.53,.53]:box('Window side seal',(wx+dx,y,2.27),(.034,.065,.89),dark,.016,train)
                for z in [1.82,2.72]:box('Window horizontal seal',(wx,y,z),(1.08,.065,.035),dark,.015,train)
                box('Window glass',(wx,y+side*.065,2.27),(.99,.012,.85),glass,.07,train)
                # Interior dividers and seats interrupt the emissive windows naturally.
                box('Window vertical frame',(wx+.24,y+side*.08,2.27),(.025,.02,.83),metal,.002,train)
            box('Door surround',(cx+4.88,y,1.85),(.66,.07,2.05),dark,.05,train)
            box('Door steel skin',(cx+4.88,y+side*.03,1.85),(.57,.03,1.96),metal,.045,train)
            box('Door window',(cx+4.88,y+side*.053,2.30),(.36,.02,.68),glass,.04,train)
            rod('Door grab rail',(cx+4.5,y+side*.09,1.3),(cx+4.5,y+side*.09,2.35),.017,steel,train)
            for sx in [-4.65,-1.95,.65,3.25]:
                box('Panel assembly seam',(cx+sx,y+side*.028,1.10),(.004,.005,.52),dark,.001,train)
            text('Fleet identification','003',(cx-5.2,y+side*.10,2.1),.18,cream,parent=train)
        for bx in [cx-3.1,cx+3.1]:
            box('Bogie frame',(bx,1,.48),(1.9,1.9,.28),dark,.035,train)
            for xx in [bx-.6,bx+.6]:
                for yy in [.12,1.88]:cyl('Machined wheel',(xx,yy,.39),.34,.17,steel,(math.pi/2,0,0),train)
        box('Between-car gangway',(cx+5.75,1,1.8),(.65,2.3,2.25),dark,.045,train)
        for j in range(8):box('Gangway bellows',(cx+5.45+j*.085,1,1.8),(.04,2.48,2.3),dark,.015,train)
        text('Service livery','NIGHT LINE',(cx-3.9,-.38,1.08),.17,cream,parent=train)
    # Background is built architecture, kept subordinate by distance and exposure.
    for i in range(18):
        x=-32+i*4.1;h=random.uniform(5,12);y=13+random.uniform(0,5)
        box('Distant masonry',(x,y,h/2),(3.5,3.5,h),concrete,.05)
        for row in range(2,int(h/.85)):
            for col in range(3):
                if random.random()<.45:box('Occupied room',(x-1+col,y-1.76,row*.85),(.42,.01,.55),warm if random.random()<.6 else cool,.005)
    light('Cold sky',(0,3,12),(0,0,0),150,(.35,.50,.78),18)
    light('Train sidelight',(-2,-3,3),(0,1,1.5),50,(1,.62,.30),3)
    cam=camera((-8.3,-7.1,1.17),(1.4,1,1.9),46,5.6)
    def animate(t):
        train.location.x=5.4-t*1.3
        cam.location=(-8.3+t*.055,-7.1+t*.035,1.17+t*.007)
        cam.rotation_euler=(Vector((1.4+t*.04,1,1.9))-cam.location).to_track_quat('-Z','Y').to_euler()
    update=animate

def idea_scene():
    global update
    # Existing Blender-authored physical room, read from our immutable snapshot.
    bg.inputs[0].default_value=(.07,.10,.14,1);bg.inputs[1].default_value=.12
    for o in list(scene.objects):
        if o.type=='CAMERA':o.hide_render=True
    screen=bpy.data.objects.get('Computer_Screen')
    screen.data.materials.clear();screen.data.materials.append(mat('Dark phosphor glass',(.008,.028,.020),.18,0,.5))
    phosphor=mat('Original typed phosphor',(.38,.72,.52),.45,0,2.1)
    # Text lies on the physical curved-screen front, no Canvas texture or bitmap film.
    header=text('Studio title','STUDIO',(3.05,-.149,1.485),.030,phosphor,retro=True)
    code=text('Running idea','',(3.05,-.151,1.42),.025,phosphor,retro=True);code.data.space_line=1.18
    # A typed glyph changes topology; it should appear crisply rather than ask
    # Cycles to interpolate between two different font meshes.
    code.cycles.use_motion_blur=False
    line('Under the glass',[(3.05,-.151,1.46),(3.54,-.151,1.46)],.0006,phosphor)
    for o in scene.objects:
        if o.type=='LIGHT' and o.name=='Computer phosphor':o.data.energy=5
    light('Soft desk edge',(2.5,-1.2,2.0),(3.3,0,1.0),8,(1,.67,.36),.65)
    cam=camera((3.92,-2.35,1.68),(3.25,-.18,1.15),55,5.6)
    keys=[o for o in scene.objects if o.name.startswith('Computer_Key')]
    rests={o.name:o.location.copy() for o in keys}
    for o in keys:
        if o.type=='MESH':
            b=o.modifiers.new('Film keycap radius','BEVEL');b.width=.0025;b.segments=3
    script='> one small idea\n\nwhile (night) {\n  observe();\n  build();\n}\n\nworld.ready = true;'
    def animate(t):
        code.data.body=script[:int(max(0,t-1)*7.2)]+('|' if t%1<.5 and t<13 else '')
        cam.location=(3.92-t*.010,-2.35+t*.012,1.68+t*.003)
        cam.rotation_euler=(Vector((3.25,-.18,1.15))-cam.location).to_track_quat('-Z','Y').to_euler()
        for i,o in enumerate(keys):
            o.location=rests[o.name].copy()
            if 1<t<12 and i==int(t*7)%len(keys):o.location.z-=.003
    update=animate

def world_scene():
    global update
    scene.view_settings.exposure=.25;bg.inputs[0].default_value=(.11,.14,.17,1);bg.inputs[1].default_value=.2
    walnut=textured('Walnut drafting table',(.045,.018,.008),(.20,.105,.045),(.6,90,95),.38,.002)
    paper=textured('Uncoated ivory model card',(.63,.61,.52),(.83,.79,.66),(160,160,160),.79,.0003)
    edge=mat('Cut card edge',(.34,.27,.18),.85)
    graphite=mat('Graphite drafting lines',(.20,.23,.22),.78)
    teal=mat('Oxidised model roof',(.045,.16,.17),.48,.35)
    amber=mat('Warm miniature windows',(.94,.48,.12),.35,0,2.8)
    glass=mat('Dark miniature glazing',(.015,.043,.05),.22,.4)
    road=textured('Model asphalt',(.08,.10,.10),(.15,.18,.17),(180,180,180),.8,.0008)
    wood=mat('Pencil cedar',(.44,.24,.085),.55)
    box('Drafting table',(0,0,-.065),(6,5,.13),walnut,.035)
    box('Model card base',(0,0,.008),(1.85,1.55,.016),paper,.002)
    # Visible cut laminations make the miniature's scale intentional and physical.
    for z in [.002,.006,.010]:box('Layered card edge',(0,-.776,z),(1.85,.002,.0009),edge,.0002)
    for x in [-.6,0,.6]:box('Street',(x,0,.018),(.12,1.22,.003),road,.001)
    for y in [-.36,.31]:box('Cross street',(0,y,.019),(1.75,.10,.003),road,.001)
    for x in [-.8+i*.1 for i in range(17)]:
        for y in [-.36,.31]:box('Street centre line',(x,y,.022),(.025,.004,.0007),paper,0)
    buildings=[]
    for ix,x in enumerate([-.77,-.37,-.2,.22,.38,.77]):
        for iy,y in enumerate([-.50,-.05,.47]):
            h=random.uniform(.13,.44);w=.13 if ix in [1,2,3,4] else .22;d=.20
            root=empty('Folded architectural model');root.location=(x,y,.02)
            box('Card building volume',(0,0,h/2),(w,d,h),paper,.0025,root)
            # Four relief facades with recessed glass, jambs, floor courses and lintels.
            for side in [-1,1]:
                for floor in range(max(1,int(h/.055))):
                    for j in range(3):
                        wx=-w*.32+j*w*.32;z=.035+floor*.052
                        box('Inset opening',(wx,side*(d/2+.001),z),(w*.22,.0018,.029),glass,.001,root)
                        if random.random()<.45:box('Lit model room',(wx,side*(d/2+.0022),z),(w*.18,.001,.025),amber,.0006,root)
                        box('Card window sill',(wx,side*(d/2+.003),z-.018),(w*.25,.005,.002),edge,.0004,root)
                for floor in range(1,max(2,int(h/.055))):box('Façade floor course',(0,side*(d/2+.002),floor*.052),(w+.004,.004,.002),paper,.0004,root)
            for side in [-1,1]:
                for floor in range(max(1,int(h/.055))):
                    for j in range(3):
                        wy=-d*.32+j*d*.32;z=.035+floor*.052
                        box('Side elevation opening',(side*(w/2+.001),wy,z),(.0018,d*.20,.029),glass,.001,root)
                        if random.random()<.25:box('Side occupied room',(side*(w/2+.0022),wy,z),(.001,d*.16,.025),amber,.0006,root)
                        box('Side elevation sill',(side*(w/2+.003),wy,z-.018),(.005,d*.23,.002),edge,.0004,root)
            # Three recognizable roof types, with physically cut card margins.
            if (ix+iy)%3==0:
                for side in [-1,1]:
                    roof=box('Pitched folded roof',(side*w*.25,0,h+.022),(w*.56,d+.012,.005),teal,.001,root)
                    roof.rotation_euler.y=side*-.40
                line('Roof ridge',[(0,-d*.53,h+.045),(0,d*.53,h+.045)],.002,edge,root)
                box('Brick chimney',(-w*.2,d*.2,h+.050),(.020,.028,.055),edge,.001,root)
            elif (ix+iy)%3==1:
                box('Flat roof rim',(0,0,h+.004),(w+.01,d+.01,.008),paper,.002,root)
                box('Recessed flat roof',(0,0,h+.009),(w-.012,d-.012,.004),teal,.001,root)
                box('Roof access',(w*.2,.015,h+.024),(.035,.05,.04),paper,.002,root)
                box('Roof skylight',(-w*.22,-.025,h+.012),(.035,.055,.012),glass,.002,root)
            else:
                box('Stepped cornice',(0,0,h+.003),(w+.016,d+.016,.006),edge,.001,root)
                box('Raised roof pavilion',(0,0,h+.022),(w*.65,d*.72,.038),paper,.002,root)
                box('Pavilion metal cap',(0,0,h+.043),(w*.7,d*.77,.006),teal,.001,root)
                rod('Fine aerial',(w*.25,d*.1,h+.043),(w*.25,d*.1,h+.09),.0008,graphite,root)
            buildings.append((root,random.uniform(.2,7)))
    # Draughtsman's tools make the city clearly the physical result of an idea.
    p=cyl('Cedar pencil',(.63,-.86,.014),.014,.78,wood,(0,math.pi/2,0),vertices=6)
    cyl('Graphite lead',(.226,-.86,.014),.003,.04,graphite,(0,math.pi/2,0),vertices=12)
    for i in range(20):box('Ruler ticks',(-.92+i*.025,-.79,.008),(.001,.015 if i%5 else .025,.001),graphite,0)
    box('Steel drafting ruler',(-.68,-.82,.004),(.58,.10,.006),mat('Brushed drafting steel',(.34,.39,.40),.32,.8),.002)
    text('Plan label','WORLD STUDY 003',(-.85,.70,.018),.045,graphite,rot=(0,0,0))
    text('Plan subtitle','a place to return to',(-.85,.64,.018),.027,graphite,rot=(0,0,0))
    for y in [-.62,.62]:line('Drafting datum',[(-.87,y,.021),(.87,y,.021)],.0005,graphite)
    light('Warm workshop source',(-1.5,-.5,2.1),(0,0,0),100,(1,.68,.36),1.25)
    light('Cool workshop window',(1.8,1.2,1.8),(0,0,.1),65,(.42,.62,1),1.5)
    light('Front card bounce',(0,-2,.8),(0,0,.2),20,(.68,.83,1),1.6)
    cam=camera((1.9,-2.5,1.8),(0,-.05,.16),48,6.3)
    def animate(t):
        for o,delay in buildings:
            v=max(0,min(1,(t-delay)/2));v=v*v*(3-2*v);o.scale.z=.015+.985*v
        cam.location=(1.9-t*.020,-2.5+t*.012,1.8+t*.008)
        cam.rotation_euler=(Vector((0,-.05,.16))-cam.location).to_track_quat('-Z','Y').to_euler()
    update=animate

{'train':train_scene,'idea':idea_scene,'world':world_scene}[opts.shot]()

# The immutable studio snapshot also contains lettering converted to meshes.
# Hide those printed marks without changing its cinematography or geometry.
snapshot_marks={'CRT_Brand','Print_PC_Brand','Retro_Phone_Print','Desk_CD_Print_Brand',
    'Desk_Pager_Print_Brand','Desk_Floppy_Print','Desk_Rolodex_Print',
    'Desk_Walkman_Print','Desk_Clock_Print','Print_Notebook_Subtitle'}
changed=[]
for o in scene.objects:
    if o.name in snapshot_marks:
        changed.append(o);o.hide_render=True
    elif o.name.startswith(('Service livery','Studio title','Plan label')):
        changed.append(o)

def patch_bounds():
    previous={'Service livery':'MAINLOOP  /  NIGHT LINE','Studio title':'MAINLOOP / STUDIO',
        'Plan label':'MAINLOOP  /  WORLD STUDY 003'}
    points=[]
    projection=scene.camera.calc_matrix_camera(bpy.context.evaluated_depsgraph_get(),
        x=scene.render.resolution_x,y=scene.render.resolution_y)@scene.camera.matrix_world.inverted()
    faces=[(0,1,2,3),(4,7,6,5),(0,4,5,1),(3,2,6,7),(0,3,7,4),(1,5,6,2)]
    def clipped(corners):
        # Clip before dividing by W: carriage lettering can pass behind the
        # camera, where an unclipped projected box incorrectly covers the film.
        for face in faces:
            polygon=[corners[i] for i in face]
            for axis,sign in [(0,1),(0,-1),(1,1),(1,-1),(2,1),(2,-1)]:
                if not polygon:break
                result=[];a=polygon[-1];da=a.w+sign*a[axis]
                for b in polygon:
                    db=b.w+sign*b[axis]
                    if (da>=0)!=(db>=0):result.append(a.lerp(b,da/(da-db)))
                    if db>=0:result.append(b)
                    a,da=b,db
                polygon=result
            for v in polygon:
                if v.w>0:yield Vector((v.x/v.w*.5+.5,v.y/v.w*.5+.5,1))
    for o in changed:
        body=o.data.body if o.type=='FONT' else None
        if body is not None:
            o.data.body=next(v for k,v in previous.items() if o.name.startswith(k))
            bpy.context.view_layer.update()
        projected=list(clipped([projection@(o.matrix_world@Vector(v)).to_4d() for v in o.bound_box]))
        if body is not None:o.data.body=body
        if not projected or max(p.z for p in projected)<=0:continue
        left,right=min(p.x for p in projected),max(p.x for p in projected)
        bottom,top=min(p.y for p in projected),max(p.y for p in projected)
        if right<0 or left>1 or top<0 or bottom>1:continue
        points.extend(projected)
    bpy.context.view_layer.update()
    if not points:return None
    w,h=scene.render.resolution_x,scene.render.resolution_y
    # Padding covers depth of field and motion blur; the final 12 px overlap
    # blends denoiser noise into unchanged pixels of the original native frame.
    return [max(0,math.floor(min(p.x for p in points)*w)-32),
        max(0,math.floor((1-max(p.y for p in points))*h)-32),
        min(w,math.ceil(max(p.x for p in points)*w)+32),
        min(h,math.ceil((1-min(p.y for p in points))*h)+32)]

@bpy.app.handlers.persistent
def frame_change(sc): update((sc.frame_current+sc.frame_subframe-1)/24)
bpy.app.handlers.frame_change_pre.clear();bpy.app.handlers.frame_change_pre.append(frame_change)
scene.render.use_persistent_data=True
out=BUILD/(opts.shot if opts.engine=='CYCLES' else opts.shot+'-eevee');out.mkdir(exist_ok=True)
frames=[opts.frame] if opts.frame else range(opts.start,opts.end+1)
stats=[]
for frame in frames:
    if (BUILD/'pause-render').exists():
        print('FILM_PAUSED before frame',frame,flush=True);break
    target=out/f'{frame:04d}.png'
    if opts.resume and target.exists():continue
    if opts.resume and opts.patch_source:
        prior=BUILD/'patches'/opts.shot/f'{frame:04d}.png'
        if prior.exists() and prior.with_suffix('.json').exists():continue
    scene.frame_set(frame);frame_change(scene)
    bpy.context.view_layer.update()
    region=patch_bounds() if opts.patch_source else None
    if opts.patch_source:
        patches=BUILD/'patches'/opts.shot;patches.mkdir(parents=True,exist_ok=True)
        if region is None:
            import shutil
            shutil.copy2(opts.patch_source/opts.shot/f'{frame:04d}.png',target)
            continue
        left,top,right,bottom=region;w,h=scene.render.resolution_x,scene.render.resolution_y
        scene.render.use_border=True;scene.render.use_crop_to_border=True
        scene.render.border_min_x=left/w;scene.render.border_max_x=right/w
        scene.render.border_min_y=(h-bottom)/h;scene.render.border_max_y=(h-top)/h
        target=patches/f'{frame:04d}.png'
    scene.render.filepath=str(target)
    before=time.monotonic();bpy.ops.render.render(write_still=True)
    stats.append({'frame':frame,'seconds':time.monotonic()-before,'region':region})
    if opts.patch_source:(target.with_suffix('.json')).write_text(json.dumps({'region':region}))
    print('FILM_FRAME',json.dumps(stats[-1]),flush=True)
(out/'render-statistics.json').write_text(json.dumps(stats,indent=2))
