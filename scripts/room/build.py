"""Build Mainloop's original room assets. Run with Blender --background --python.
Coordinates: Blender Z-up, window at +Y. glTF exports Y-up for Three.js.
No reference-site code, models, textures or audio are bundled.
"""
import bpy, math, random, os, sys
from mathutils import Vector
from pathlib import Path
random.seed(24)
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'room'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 5
scene.render.threads_mode = 'AUTO'
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.22,.28,.43,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .24
scene.view_settings.view_transform = 'AgX'
groups = {'architecture': [], 'desk': [], 'objects': []}
current = 'objects'

def mat(name, color, rough=.5, emission=0):
    m = bpy.data.materials.new(name); m.diffuse_color = (*color,1); m.use_nodes = True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=rough
    if emission: p.inputs['Emission Color'].default_value=(*color,1); p.inputs['Emission Strength'].default_value=emission
    return m

def textured(name, lo, hi, scale, rough=.65, bump=.07):
    m=mat(name,lo,rough); n=m.node_tree.nodes; l=m.node_tree.links; p=n.get('Principled BSDF')
    g=n.new('ShaderNodeNewGeometry'); v=n.new('ShaderNodeVectorMath'); v.operation='MULTIPLY'; v.inputs[1].default_value=scale; l.new(g.outputs['Position'],v.inputs[0])
    tex=n.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value=3; tex.inputs['Detail'].default_value=3; l.new(v.outputs[0],tex.inputs['Vector'])
    ramp=n.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color=(*lo,1); ramp.color_ramp.elements[1].color=(*hi,1); l.new(tex.outputs['Fac'],ramp.inputs[0]); l.new(ramp.outputs[0],p.inputs['Base Color'])
    b=n.new('ShaderNodeBump'); b.inputs['Strength'].default_value=bump; b.inputs['Distance'].default_value=.015; l.new(tex.outputs['Fac'],b.inputs['Height']); l.new(b.outputs[0],p.inputs['Normal'])
    return m
wood=textured('Walnut · long grain',(.075,.025,.012),(.3,.135,.048),(.7,30,40),.4,.16)
plaster=textured('Warm plaster',(.24,.19,.125),(.42,.34,.23),(45,45,45),.9,.12)
black=textured('Graphite ABS',(.012,.014,.016),(.035,.039,.043),(100,100,100),.45,.04)
cream=mat('Warm ivory',(.64,.58,.43),.42)
metal=mat('Brushed brass',(.25,.16,.067),.29)
green=mat('Forest green enamel',(.028,.12,.083),.25)
paper=mat('Ageing paper',(.76,.7,.51),.87)
dark=mat('Recesses',(.003,.005,.007),.85)
leaf=mat('Leaf',(.045,.12,.028),.5)
terracotta=textured('Terracotta',(.18,.055,.023),(.38,.14,.055),(30,30,30),.86,.12)
led=mat('Power green',(.2,.9,.37),.3,2)
blue=mat('CRT standby',(.025,.09,.42),.4,1.7)
city=mat('Night sky',(.014,.022,.052),1,.55)
lightwin=mat('Windows amber',(.9,.53,.21),.6,1.2)
coolwin=mat('Windows cool',(.33,.58,.77),.6,.8)

def finish(o, name, material, bevel=0):
    o.name=name
    if material: o.data.materials.append(material)
    if bevel:
        mod=o.modifiers.new('Soft manufactured edges','BEVEL'); mod.width=bevel; mod.segments=2
        bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier=mod.name)
        mod=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL'); bpy.ops.object.modifier_apply(modifier=mod.name)
    groups[current].append(o)
    return o

def box(name, loc, size, material, bevel=.008):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object; o.dimensions=size; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,material,bevel)

def cyl(name,loc,radius,depth,material,vertices=24,rotation=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc); o=bpy.context.object
    if rotation: o.rotation_euler=rotation
    return finish(o,name,material,.003)

def sphere(name,loc,scale,material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=10,location=loc); o=bpy.context.object; o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for p in o.data.polygons:p.use_smooth=True
    return finish(o,name,material)

def rod(name,a,b,r,material):
    a,b=Vector(a),Vector(b); o=cyl(name,(a+b)/2,r,(b-a).length,material,12)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler(); return o

def text(name,body,loc,size,material,rotation=(math.pi/2,0,0),align='LEFT'):
    c=bpy.data.curves.new(name,'FONT'); c.body=body; c.size=size; c.extrude=.0001; c.align_x=align
    o=bpy.data.objects.new(name,c); scene.collection.objects.link(o); o.location=loc; o.rotation_euler=rotation
    bpy.context.view_layer.objects.active=o; o.select_set(True); bpy.ops.object.convert(target='MESH'); o.select_set(False)
    return finish(o,name,material)

def light(name,loc,target,power,color,size):
    d=bpy.data.lights.new(name,'AREA'); d.energy=power; d.color=color; d.shape='DISK'; d.size=size
    o=bpy.data.objects.new(name,d); scene.collection.objects.link(o); o.location=loc; o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()

# Enclosing room, full wooden sash window, city diorama outside.
current='architecture'
box('Floor',(0,0,-.06),(6,7,.12),wood)
box('Left wall',(-2.9,0,1.9),(.16,6,4),plaster)
box('Right wall',(2.9,0,1.9),(.16,6,4),plaster)
box('Wall below window',(0,1.15,.4),(5.8,.15,.8),plaster)
box('Wall above window',(0,1.15,3.4),(5.8,.15,.8),plaster)
for x in [-2.5,2.5]: box('Window side wall',(x,1.15,1.9),(1,.15,2.2),plaster)
for x in [-2.03,0,2.03]: box('Window vertical oak',(x,1.04,1.94),(.09,.15,2.25),wood)
for z in [.85,2.15,3.05]: box('Window horizontal oak',(0,1.04,z),(4.16,.15,.075),wood)
box('Window sill',(0,.94,.84),(4.35,.46,.07),wood)
for x in [-.09,.09]: rod('Window latch',(x,.92,1.68),(x,.92,1.84),.016,metal)
box('Sky',(0,4.8,2.4),(14,.08,8),city,0)
# Layered skyline. Windows are emissive geometry and remain crisp under close inspection.
for layer in range(2):
    for i in range(15):
        x=-6+i*.85+random.uniform(-.16,.16); h=random.uniform(.7,2.3); y=3.6-layer*.9
        building=mat(f'Building {layer}-{i}',(.018+layer*.008,.027+layer*.008,.038+layer*.01),.9)
        box('City block',(x,y,h/2),(.73,.45,h),building,.005)
        for col in range(3):
            for row in range(int(h/.2)-1):
                if random.random()<.48:
                    box('Distant lit window',(x-.24+col*.22,y-.233,.18+row*.2),(.07,.008,.085),lightwin if random.random()<.65 else coolwin,0)
rod('Aerial mast',(-1.35,3.4,1.8),(-1.35,3.4,3.4),.014,metal)
sphere('Tower observation deck',(-1.35,3.4,2.7),(.12,.12,.1),cream)
# Radiator under window.
for i in range(22):box('Radiator rib',(-1.7+i*.16,.91,.44),(.09,.16,.56),cream,.035)
# Desk and joinery.
current='desk'
box('Solid walnut desktop',(0,-.02,.77),(5.45,1.95,.105),wood,.025)
for x in [-2.4,2.4]:
    for y in [-.75,.65]:box('Desk leg',(x,y,.36),(.1,.1,.72),wood)
for z in [.62,.43,.24]:
    box('Drawer',(-2,.0,z),(.78,1.55,.16),wood)
    rod('Drawer handle',(-2.16,-.79,z),(-1.84,-.79,z),.015,metal)
# TV shell. Meshes form an actual opening around the independently animated screen.
current='objects'
box('VCR body',(0,-.04,.94),(1.35,.78,.23),black,.025)
box('VCR fascia',(0,-.445,.94),(1.29,.045,.19),black)
box('Tape slot',(-.19,-.476,.97),(.72,.012,.072),dark,.005)
box('VCR screen',(.43,-.474,.975),(.27,.015,.073),dark,.005)
text('VCR digits','00 : 24',(.315,-.485,.959),.038,led)
for i in range(5):box('VCR control',(.27+i*.055,-.482,.908),(.033,.012,.018),cream,.003)
text('VHS','VHS  /  STEREO',(-.6,-.48,.894),.017,cream)
# TV front spans z1.09..2.12, screen is x +/-.43 z1.38..2.00.
box('TV rear',(0,.08,1.6),(1.15,.64,1.06),black,.055)
box('TV top bezel',(0,-.277,2.073),(1.15,.17,.12),black,.018)
box('TV bottom panel',(0,-.277,1.22),(1.15,.17,.27),black,.018)
for x in [-.51,.51]:box('TV side bezel',(x,-.277,1.69),(.13,.17,.72),black,.02)
# Inner bezel and glass back. Front screen will be replaced in the browser.
box('Screen bevel',(0,-.368,1.70),(.91,.03,.66),dark,.025)
screen=box('Preview display',(0,-.391,1.70),(.865,.008,.615),blue,.025)
groups[current].remove(screen)
text('TV manufacturer','MAINLOOP',(-.48,-.372,2.053),.025,cream)
text('TV model','COLOR MONITOR',(.24,-.372,2.05),.012,cream)
for i in range(5):
    box('TV key',(-.36+i*.13,-.377,1.22),(.055,.026,.045),cream,.005)
    text('TV key label',str(i+1),(-.35+i*.13,-.395,1.17),.014,cream)
cyl('Power light',(-.46,-.386,1.3),.012,.008,led,12,(math.pi/2,0,0))
for x in [.29,.43]:cyl('TV knob',(x,-.39,1.235),.036,.035,black,24,(math.pi/2,0,0))
for i in range(10):box('TV speaker',(.29+i*.019,-.369,1.32),(.006,.006,.04),dark,0)
# Lamp: heavy base, articulated brass stem, green shade and warm interior.
cyl('Lamp base',(-1.28,.05,.85),.23,.065,green,40)
rod('Lamp stem',(-1.28,.05,.87),(-1.18,.16,1.68),.018,metal)
rod('Lamp arm',(-1.18,.16,1.68),(-.99,.12,1.78),.018,metal)
bpy.ops.mesh.primitive_cone_add(vertices=40,radius1=.26,radius2=.12,depth=.22,location=(-1.05,.1,1.77))
finish(bpy.context.object,'Enamel lamp shade',green,.009)
cyl('Lamp warm diffuser',(-1.05,.1,1.656),.245,.009,mat('Warm diffuser',(1,.65,.26),.5,3),40)
# Potted plant, individually shaped leaves.
cyl('Pot rim',(-2.12,.3,1.03),.23,.04,terracotta,36)
bpy.ops.mesh.primitive_cone_add(vertices=32,radius1=.16,radius2=.23,depth=.31,location=(-2.12,.3,.94));finish(bpy.context.object,'Plant pot',terracotta)
cyl('Pot soil',(-2.12,.3,1.045),.205,.012,dark,24)
for i in range(12):
    angle=i*2.4; h=random.uniform(.38,.92); end=Vector((-2.12+math.cos(angle)*.31,.3+math.sin(angle)*.25,1.07+h))
    rod('Plant stem',(-2.12,.3,1.04),end,.007,leaf)
    o=sphere('Leaf',end,(.095,.025,.23),leaf);o.rotation_euler=(random.uniform(-.7,.7),math.cos(angle)*.85,angle)
# Notebook, pencil and coffee.
notebook=box('Notebook',(1.19,-.61,.842),(.65,.47,.035),paper,.008);notebook.rotation_euler.z=-.11
for i in range(9):box('Notebook ruled line',(1.19,-.78+i*.039,.862),(.54,.0015,.001),cream,0)
text('Notebook heading','NOTES TO SELF',(1,-.6,.866),.038,black,(0,0,-.11))
rod('Pencil',(.85,-.55,.88),(1.46,-.38,.88),.009,mat('Pencil ochre',(.7,.35,.02)))
# Mug with dark coffee surface and torus handle.
cyl('Coffee cup',(-.83,-.65,.98),.12,.29,cream,40)
cyl('Coffee',(-.83,-.65,1.129),.102,.006,mat('Coffee',(.022,.009,.004),.18),36)
bpy.ops.mesh.primitive_torus_add(major_radius=.077,minor_radius=.019,major_segments=24,minor_segments=8,location=(-.98,-.65,1.0),rotation=(math.pi/2,0,0));finish(bpy.context.object,'Cup handle',cream)
# Remote, buttons, cables.
box('Remote',(.08,-.75,.858),(.24,.36,.055),black,.02)
for row in range(5):
    for col in range(3):box('Remote button',(.015+col*.06,-.85+row*.055,.892),(.028,.024,.014),cream,.004)
# Cassette cases stacked; actual selectable cassettes are authored in Three.js.
for i,(color,title) in enumerate([((.3,.13,.055),'COMPUTER SCIENCE'),((.17,.21,.1),'A FIELD GUIDE'),((.12,.13,.2),'THE ART OF SYSTEMS')]):
    m=mat(title,color,.7);box(title,(-1.63,-.49,.85+i*.047),(.52,.35,.039),m,.004)
    text('Book spine',title,(-1.87,-.674,.846+i*.047),.018,paper)
# Vintage PC at right; screen luminous green.
box('PC base',(2.13,.17,.92),(.72,.63,.19),cream,.025)
box('PC monitor',(2.13,.25,1.32),(.63,.46,.55),cream,.04)
box('PC bezel',(2.13,.002,1.34),(.51,.025,.37),dark,.02)
box('PC glass',(2.13,-.015,1.34),(.45,.008,.31),mat('Green phosphor',(.016,.07,.028),.5,1),.015)
text('PC terminal','> mainloop\n\n  while (learning)\n    build();\n\n_',(1.94,-.026,1.43),.027,led)
box('Keyboard',(2.1,-.33,.859),(.72,.27,.045),cream,.01)
for row in range(4):
    for col in range(12):box('Keycap',(1.785+col*.055,-.42+row*.055,.892),(.043,.039,.018),cream,.004)
# Framed wall poster.
box('Poster frame',(2.54,1.045,2.03),(.51,.07,.75),wood)
box('Poster paper',(2.54,1.0,2.03),(.45,.008,.69),mat('Poster blue',(.025,.07,.13),.7))
text('Poster title','STAY\nCURIOUS.',(2.35,.988,2.17),.071,paper)
text('Poster subtitle','BUILD / LEARN / REPEAT',(2.35,.987,1.79),.017,paper)
# Lighting is calculated offline; no dozens of real-time shadow lights.
light('Desk lamp',(-1.05,.1,1.64),(-1.1,-.2,.78),70,(1,.63,.3),.28)
light('Window moon',(0,1.8,2.8),(0,-.5,.7),140,(.34,.51,1),2.4)
light('Warm room bounce',(-2,-2,2.7),(0,0,1),45,(1,.72,.43),2)
light('TV blue bounce',(0,-.46,1.65),(0,-1,.8),12,(.18,.32,1),.6)
# Camera used only for preview; runtime has its own responsive camera rig.
d=bpy.data.cameras.new('Camera');cam=bpy.data.objects.new('Camera',d);scene.collection.objects.link(cam)
cam.location=(.35,-4.3,2.35);cam.rotation_euler=(Vector((0,.15,1.55))-cam.location).to_track_quat('-Z','Y').to_euler();d.lens=35;scene.camera=cam
scene.render.resolution_x=1440;scene.render.resolution_y=960;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='JPEG';scene.render.image_settings.quality=88
scene.render.filepath=str(OUT/'room-preview.jpg')
# A reference render makes art changes reviewable before baking.
bpy.ops.wm.save_as_mainfile(filepath='/private/tmp/mainloop-room.blend')
bpy.ops.render.render(write_still=True)
# Remove browser-owned preview display from the baked geometry.
bpy.data.objects.remove(screen,do_unlink=True)
# Bake each atlas with complete scene lighting. Preserve generated coordinates by using world Position.
for name,objects in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.008,area_weight=.5)
    bpy.ops.object.mode_set(mode='OBJECT')
    resolution=2048 if name!='desk' else 1024
    img=bpy.data.images.new(name+' baked light',width=resolution,height=resolution)
    materials=set(o.data.materials)
    for m in materials:
        node=m.node_tree.nodes.new('ShaderNodeTexImage');node.image=img;m.node_tree.nodes.active=node
    print('BAKING',name,len(o.data.polygons),flush=True)
    bpy.ops.object.bake(type='COMBINED',pass_filter={'DIRECT','INDIRECT','COLOR','DIFFUSE','GLOSSY','EMIT'},margin=8)
    img.filepath_raw=str(OUT/(name+'.jpg'));img.file_format='JPEG';img.save()
    baked=bpy.data.materials.new(name+' baked');baked.use_nodes=True;n=baked.node_tree.nodes;n.clear();l=baked.node_tree.links
    tex=n.new('ShaderNodeTexImage');tex.image=img;emit=n.new('ShaderNodeEmission');output=n.new('ShaderNodeOutputMaterial');l.new(tex.outputs['Color'],emit.inputs[0]);l.new(emit.outputs[0],output.inputs[0])
    o.data.materials.clear();o.data.materials.append(baked)
    for p in o.data.polygons:p.material_index=0
    groups[name]=[o]
bpy.ops.object.select_all(action='DESELECT')
for objects in groups.values():
    for o in objects:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'room.glb'),export_format='GLB',use_selection=True,export_yup=True,export_image_format='JPEG',export_image_quality=88,export_extras=True)
print('DONE',str(OUT/'room.glb'),flush=True)
