"""Weijin: an open woodland reading garden assembled from verified CC0 assets.

Run with Blender 5.2+: blender --background --factory-startup --python
scripts/island/build_scene.py. Does not access or overwrite an interactive scene.
All dimensions are metres. Blender front is -Y; exported glTF front is +Z.
"""
import bpy, math, json, random, os, sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/island'
SOURCE = OUT
OUT.mkdir(parents=True, exist_ok=True)
random.seed(26)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for data in list(bpy.data.materials):
    bpy.data.materials.remove(data)

# Original character and connecting timber materials. Downloaded assets retain their atlases.
COLORS = {
 'clay': ('#BD8656', .88), 'muzzle': ('#FFDEAB', .92), 'ear': ('#E9B382', .92),
 'ink': ('#68422A', .8), 'eye': ('#412E20', .55), 'shine': ('#FFF5DD', .6),
 'blush': ('#E9A58D', .95), 'cream': ('#FFF0D5', .91), 'trim': ('#EACFA0', .9),
 'roof': ('#75AD94', .82), 'roofedge': ('#598F7D', .85), 'leaf': ('#88AE65', .94),
 'leaflight': ('#B6CC7E', .94), 'leafdark': ('#6E9966', .96),
 'grass': ('#BBCF92', .98), 'sand': ('#EAD6AB', .98), 'earth': ('#C6A375', .98),
 'wood': ('#B98B60', .93), 'woodlight': ('#D5AC7C', .94), 'wooddark': ('#99704A', .94),
 'paper': ('#FFF7DE', .98), 'teal': ('#458D83', .86), 'coral': ('#D9997D', .9),
 'yellow': ('#E5BB69', .92), 'blue': ('#87AAA8', .92), 'flower': ('#F3C3AF', .96),
 'water': ('#A7D9CF', .68), 'ripple': ('#DAECE0', .8), 'stone': ('#DCD4BB', .98),
 'window': ('#DFBC72', .65), 'nightwindow': ('#FFDC95', .72), 'soil': ('#7B6041', .98),
}
def rgb(h):
    v=[int(h[i:i+2],16)/255 for i in (1,3,5)]
    return tuple(x/12.92 if x<.04045 else ((x+.055)/1.055)**2.4 for x in v)
MATS={}
for n,(h,rough) in COLORS.items():
    m=bpy.data.materials.new(n)
    m.diffuse_color=(*rgb(h),1)
    m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*rgb(h),1)
    p.inputs['Roughness'].default_value=rough
    p.inputs['Specular IOR Level'].default_value=.24
    if n=='nightwindow':
        p.inputs['Emission Color'].default_value=(*rgb(h),1)
        p.inputs['Emission Strength'].default_value=.22
    MATS[n]=m


# The original bear is the only preserved scene character. The garden around
# it is assembled from the five verified free packs, not the previous cottage.
for module in ['geometry.py']:
    exec(compile((ROOT/'scripts/island'/module).read_text(), module, 'exec'), globals())
ENV=group('Environment'); LIB=group('Library'); BEAR=group('Bear')
BOARD=group('Noticeboard'); SIGN=group('Categories'); TAGS=group('Tags'); MAIL=group('Mailbox')
def leaf(name,loc,scale,mat='leaf',parent=ENV,rot=None):
    return ellipsoid(name,loc,scale,mat,parent,16,8,rot)
exec(compile((ROOT/'scripts/island/character.py').read_text(), 'character.py', 'exec'), globals())
exec(compile((ROOT/'scripts/island/vendor.py').read_text(), 'vendor.py', 'exec'), globals())

# Modular park ground, a broad rounded island with a quieter central clearing.
# The nine authored slices keep the source grass pattern and bevelled perimeter.
for row, names in enumerate(['ABC','DEF','GHI']):
    for col, letter in enumerate(names):
        asset('park','floor_grass_sliced_'+letter,((col-1)*4.32,(1-row)*3.24,-.05),(2.16,1.62,1))
GROUND=.45
# A shallow connecting timber plinth gives the open reading corner a place.
for i in range(14):
    box('Reading deck plank',(-2.9+i*.31,.70,.505),(.30,3.55,.11),'woodlight',ENV,.018)
for x in [-2.78,1.02]:box('Deck bearer',(x,.70,.43),(.14,3.52,.12),'wooddark',ENV,.02)

# Fit the actual CC0 shelf to the frame. Its source width is 2.0 m, and its
# bearing surface is 0.20 m above the imported bottom, not the visible lip.
# Derive those dimensions from the imported mesh instead of guessing book Z.
def library_bounds(objects):
    bpy.context.view_layer.update()
    points=[obj.matrix_world@vertex.co for obj in objects for vertex in obj.data.vertices]
    return (Vector(tuple(min(point[i] for point in points) for i in range(3))),
            Vector(tuple(max(point[i] for point in points) for i in range(3))))

def library_support_surface(objects):
    bpy.context.view_layer.update()
    levels={}
    for obj in objects:
        for face in obj.data.polygons:
            points=[obj.matrix_world@obj.data.vertices[i].co for i in face.vertices]
            if max(p.z for p in points)-min(p.z for p in points)>.00001:continue
            area=sum(a.x*b.y-b.x*a.y for a,b in zip(points,points[1:]+points[:1]))/2
            if area<=0:continue
            key=round(points[0].z,4)
            record=levels.setdefault(key,{'area':0,'top':points[0].z})
            record['area']+=area;record['top']=max(record['top'],*(p.z for p in points))
    if not levels:raise RuntimeError('The sourced shelf has no horizontal bearing surface')
    return max(levels.values(),key=lambda level:level['area'])['top']

BOOKCASE_POST_X=(-2.15,.15)
BOOKCASE_SHELF_BOTTOMS=(.63,1.38,2.13)
BOOK_CONTACT_GAP=.002
library_posts=[]
for x in BOOKCASE_POST_X:
    library_posts.append(box('Bookcase upright',(x,2.04,1.79),(.13,.25,2.48),'wooddark',LIB,.025))
    for z in [.70,1.45,2.20,2.96]:
        cylinder('Bookcase recessed dowel',(x,1.917,z),.023,.008,'wood',LIB,12,(math.pi/2,0,0))
box('Bookcase top cap',(-1,2.02,3.08),(2.54,.42,.13),'wood',LIB,.025)
box('Bookcase lower stretcher',(-1,2.10,.64),(2.32,.11,.16),'wooddark',LIB,.02)
for lean in [-.77,.77]:
    box('Bookcase back brace',(-1,2.17,1.79),(.075,.055,3.13),'wood',LIB,.013,(0,lean,0))
_,shelf_bounds,_=template('furniture','shelf_B_large')
shelf_width=max(p.x for p in shelf_bounds)-min(p.x for p in shelf_bounds)
shelf_scale_x=(BOOKCASE_POST_X[1]-BOOKCASE_POST_X[0])/shelf_width
library_shelves=[asset('furniture','shelf_B_large',(-1.0,1.91,z),(shelf_scale_x,1,1),parent=LIB)
                 for z in BOOKCASE_SHELF_BOTTOMS]
library_surfaces=[library_support_surface(objects) for objects in library_shelves]
LIB['shelfSupportHeights']=library_surfaces
LIB_BOOKS=group('Library_Books',(-1,1.85,library_surfaces[1]+BOOK_CONTACT_GAP),LIB)
library_books=[]
for x,level,scale,yaw in [(-1.60,0,.65,.015),(-.37,0,.61,-.025),
    (-1.60,1,.66,-.02),(-1.59,2,.68,.015),(-.53,2,.57,-.04)]:
    objects=asset('furniture','book_set',(x,1.86,library_surfaces[level]+BOOK_CONTACT_GAP),scale,yaw=yaw,parent=LIB_BOOKS)
    library_books.append((objects,level))
feature_bottom=library_surfaces[1]+BOOK_CONTACT_GAP
FEATURE_BOOK=group('Library_FeatureBook',(-.94,1.85,feature_bottom),LIB_BOOKS)
FEATURE_BOOK['effectRole']='pull toward Three local +Z by <=0.16, lift +Y <=0.008, tilt Z >=-0.075, then return'
feature_objects=asset('furniture','book_single',(-.94,1.85,feature_bottom),(.62,.74,.90),parent=FEATURE_BOOK)
library_books.append((feature_objects,1))
stack_bottom=library_surfaces[1]+BOOK_CONTACT_GAP
for x,y,ang in [(-.37,1.87,.04),(-.35,1.88,-.09)]:
    objects=asset('furniture','book_single',(x,y,stack_bottom),(.22,.78,.78),rotation=(0,math.pi/2,ang),parent=LIB_BOOKS)
    library_books.append((objects,1))
    stack_bottom=library_bounds(objects)[1].z+BOOK_CONTACT_GAP
asset('plants','pothos_plant_small_potted',(0,1.90,3.145),.38,yaw=math.pi/2,parent=LIB,contact_z=0)

# The desk reads as a place in use: open pages, a pencil, a cup on a coaster,
# closed books and a real table lamp, with clear support/contact surfaces.
asset('furniture','table_medium_long',(-.85,.20,.56),.72,parent=BOARD)
asset('furniture','chair_B_wood',(-.86,1.13,.56),.79,yaw=-.10,parent=ENV)
DESK_LAMP=group('Desk_Lamp',(-.10,.49,1.28),BOARD)
asset('furniture','lamp_table',(-.10,.49,1.28),.44,parent=DESK_LAMP)
for x,y,z,ang in [(-1.47,.32,1.28,.12),(-1.45,.34,1.338,-.12)]:
    asset('furniture','book_single',(x,y,z),(.22,.76,.76),rotation=(0,math.pi/2,ang),parent=BOARD)
cylinder('Cup cork coaster',(-.27,-.18,1.291),.135,.018,'woodlight',BOARD,24)
asset('picnic','mug',(-.27,-.18,1.301),.46,yaw=.36,parent=BOARD)
asset('plants','cacti_plant_pot_small',(-1.64,.66,1.28),.28,parent=BOARD)
OPEN_BOOK=group('Desk_OpenBook',(-.91,-.18,1.31),BOARD)
box('Open journal cloth cover',(-.91,-.18,1.299),(.73,.46,.028),'roof',OPEN_BOOK,.012)
# Curved sheets follow a shallow central gutter; the top right page alone can turn.
def journal_sheet(name,side,height,parent):
    verts=[];faces=[]
    for j in range(3):
        y=-.18+(j-1)*.204
        for i in range(7):
            u=i/6;verts.append((-.91+side*(.016+.329*u),y,height+.025*(1-u)**2+.011*u*u))
    for j in range(2):
        for i in range(6):
            a=j*7+i;faces.append((a,a+1,a+8,a+7) if side>0 else (a+7,a+8,a+1,a))
    o=mesh(name,verts,faces,'paper',parent);solid=o.modifiers.new('Thin paper','SOLIDIFY');solid.thickness=.003
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=solid.name)
    return o
for side in [-1,1]:
    for layer in range(3):journal_sheet('Journal page edge',side,1.316+layer*.004,OPEN_BOOK)
DESK_PAGE=group('Desk_Page',(-.91,-.18,1.335),OPEN_BOOK)
DESK_PAGE['effectRole']='right page hinge: Three local Z, positive up to 1.05 rad'
journal_sheet('Turnable journal page',1,1.330,DESK_PAGE)
tube('Journal bookmark',[(-.93,.035,1.337),(-.93,-.18,1.337),(-.93,-.45,1.289)],.008,'coral',OPEN_BOOK,1)
tube('Pencil lacquer',[(-1.27,-.44,1.30),(-.93,-.48,1.30)],.013,'yellow',BOARD,1)
tube('Pencil graphite',[(-1.30,-.437,1.30),(-1.27,-.44,1.30)],.008,'ink',BOARD,1)

# Three friends share the reading corner. The familiar bear remains seated
# beside the picnic; the new dog is the central host and the rabbit a companion.
BEAR.matrix_world = Matrix.Translation((-2.70,-1.45,.46)) @ Matrix.Rotation(.09,4,'Z') @ Matrix.Scale(.78,4) @ Matrix.Translation((-.08,1.63,-.43))
exec(compile((ROOT/'scripts/island/friends.py').read_text(), 'friends.py', 'exec'), globals())
DOG=make_dog(name='Dog',loc=(-1.05,-1.55,.45),scale=.82)
RABBIT=make_rabbit(name='Rabbit',loc=(4.65,-2.10,.45),scale=.72)

# A flower at the host's nose height gives the dog's curious bow a real object.
asset('furniture','chair_stool_wood',(-1.0,-2.48,GROUND),(.70,.70,1.10))
asset('plants','pot_A_medium',(-1.0,-2.48,1.00),.56)
for i,(dx,dy,h) in enumerate([(-.11,.04,1.58),(.08,-.02,1.65),(.02,.13,1.60)]):
    tube('Host flower stem',[(-1+dx,-2.48+dy,1.31),(-1+dx-.025,-2.48+dy,h)],.014,'leafdark',ENV,1)
    asset('park','flower_A' if i!=1 else 'flower_B',(-1+dx,-2.48+dy,h),.78,yaw=i*.7)
    leaf('Host flower leaf',(-1+dx+.055,-2.48+dy,1.45),(.085,.028,.045),'leaf',ENV,(0,-.45,.3))
DOG_FLOWER=group('Dog_FlowerAnchor',(-1.0,-2.39,1.68),ENV)
DOG_FLOWER['effectRole']='fixed flower crown for host sniffing'

# The rabbit holds a real CC0 watering can by its top handle. The prop pivot
# stays at the grip, so tilting never makes its handle slide out of the paw.
bpy.context.view_layer.update()
grip=bpy.data.objects['Rabbit_WateringCanGrip'];grip_world=grip.matrix_world.translation.copy()
CAN=bpy.data.objects.new('Rabbit_WateringCan',None);bpy.context.collection.objects.link(CAN)
CAN.parent=grip;CAN.location=(0,0,0);CAN.rotation_euler=(0,0,-math.pi/2)
CAN['pour_axis']='z';CAN['pour_angle']=-.95
CAN['effectRole']='Three local -Z tilt about hand grip, -0.95 rad points the real nozzle downward'
bpy.context.view_layer.update()
can_scale=.38;source_handle=Vector((0,0,.733));source_nozzle=Vector((.591116786,0,.410485834))
can_yaw=Matrix.Rotation(-math.pi/2,3,'Z')
source_center_x=.1524273
can_location=(grip_world.x,grip_world.y-source_center_x*can_scale,grip_world.z-(.733-.0007982)*can_scale)
asset('plants','watering_can_A',can_location,can_scale,yaw=-math.pi/2,parent=CAN)
nozzle_world=grip_world+can_yaw@((source_nozzle-source_handle)*can_scale)
CAN_NOZZLE=group('Rabbit_WaterNozzleAnchor',nozzle_world,CAN)
CAN_NOZZLE['effectRole']='measured nozzle face centre; follows can and hand'
source_flow=Vector((.8593313694,0,.5114191771)).normalized()
# This anchor has identity world rotation at rest. Exported Three local axes
# are X=Blender X, Y=Blender Z, Z=-Blender Y; extras are converted explicitly.
flow_world=can_yaw@source_flow
CAN_NOZZLE['flow_axis']=[flow_world.x,flow_world.z,-flow_world.y]

# A low raised flower bed gives the companion a distinct activity without
# blocking the fountain or the central stepping path.
bed_x,bed_y=5.04,-3.18
box('Nursery soil',(bed_x,bed_y,GROUND+.055),(1.45,.91,.105),'soil',ENV,.035)
for y in [bed_y-.51,bed_y+.51]:box('Nursery long edging',(bed_x,y,GROUND+.085),(1.65,.09,.17),'wood',ENV,.025)
for x in [bed_x-.78,bed_x+.78]:box('Nursery short edging',(x,bed_y,GROUND+.085),(.09,.98,.17),'wood',ENV,.025)
for x in [bed_x-.78,bed_x+.78]:
    for y in [bed_y-.51,bed_y+.51]:cylinder('Nursery corner peg',(x,y,GROUND+.10),.065,.20,'wooddark',ENV,12)
for i,(dx,dy,h) in enumerate([(-.49,-.22,.20),(-.25,.17,.23),(.02,-.14,.27),(.27,.19,.20),(.49,-.18,.24)]):
    x=bed_x+dx;y=bed_y+dy
    tube('Nursery flower stem',[(x,y,GROUND+.10),(x+.025,y,GROUND+.10+h)],.012,'leafdark',ENV,1)
    asset('park','flower_A' if i%2 else 'flower_B',(x+.025,y,GROUND+.10+h),.75,yaw=.65*i)
    asset('forest','Grass_1_A_Color1',(x-.04,y+.035,GROUND+.10),.31,yaw=.45*i)
WATER_TARGET=group('Rabbit_WaterTargetAnchor',(5.04,-3.07,GROUND+.112),ENV)
WATER_TARGET['effectRole']='fixed nursery soil surface; water lands here'

# A fountain clearing on the right is where paths (and categories) meet.
asset('park','fountain',(2.65,-1.35,GROUND),.71,yaw=.05,parent=SIGN)
FOUNTAIN_WATER=group('Fountain_WaterAnchor',(2.65,-1.35,1.4691),SIGN)
FOUNTAIN_WATER['effectRole']='upper water surface; Three +Y up; jets remain within 1.08 radius'
FOUNTAIN_BASIN=group('Fountain_BasinAnchor',(2.65,-1.35,.805),SIGN)
FOUNTAIN_BASIN['effectRole']='lower water surface; add .005 for ripples'
# Garden bench and lanterns, with room to see the bear from the overview.
asset('park','bench',(-4.45,.12,GROUND),1.03,yaw=-.22)
asset('park','bench',(2.10,2.65,GROUND),.86,yaw=.02)
for i,(x,y,s) in enumerate([(-4.8,1.45,.69),(3.02,2.75,.68)]):
    asset('park','street_lantern',(x,y,GROUND),s)
    group('GardenLight_'+str(i),(x,y,GROUND+4.0*s),ENV)

# Pot feet stay supported while original connected leaf/stem islands sway.
asset('furniture','table_low',(4.13,1.04,GROUND),.80,parent=TAGS)
foliage_asset('monstera_plant_medium_potted','Plants_Monstera',(5.02,2.30,GROUND),.76,yaw=-.10,parent=TAGS,soil_height=.56)
foliage_asset('sansevieria_plant_medium_potted','Plants_Sansevieria',(3.05,1.86,GROUND),.72,yaw=.14,parent=TAGS,soil_height=.55)
foliage_asset('pothos_plant_small_potted','Plants_Pothos',(4.94,.56,.85),.61,yaw=math.pi/2,parent=TAGS,soil_height=.30)
asset('plants','succulent_plant_pot_small',(3.70,1.05,.85),.50,parent=TAGS)
asset('plants','cacti_plant_pot_small',(4.05,.67,.85),.40,parent=TAGS)
asset('plants','watering_can_A',(3.29,.35,GROUND),.62,yaw=.40,parent=TAGS)
asset('plants','pots_stacked',(4.95,.30,GROUND),.68,parent=TAGS)
asset('plants','shovel',(4.77,.28,GROUND),.58,rotation=(math.pi,.22,-.22),parent=TAGS)
asset('plants','pot_A_medium',(3.64,.28,GROUND),.27,parent=TAGS)

# Picnic cushions lie on the blanket; food sits on crockery, and the radio has
# its own little side stool instead of being hidden behind an upright cushion.
asset('picnic','picnic_blanket_green',(-3.55,-2.82,GROUND+.015),.46,yaw=-.12)
asset('picnic','pillow_large_green',(-4.27,-2.54,GROUND+.085),.50,rotation=(1.28,0,.14))
asset('picnic','pillow_small_blue',(-3.01,-3.35,GROUND+.085),.48,rotation=(1.38,0,-.17))
asset('picnic','picnic_basket_square',(-4.65,-3.27,GROUND+.01),.50,yaw=.08)
asset('picnic','serving_tray_round',(-3.52,-2.55,GROUND+.09),.62)
asset('picnic','teapot',(-3.57,-2.54,GROUND+.153),.48,yaw=.18)
asset('picnic','mug',(-3.03,-2.64,GROUND+.09),.47,yaw=.30)
asset('picnic','grapes_bowl',(-3.92,-2.94,GROUND+.09),.67)
asset('picnic','plate_A',(-3.25,-3.04,GROUND+.09),.55)
asset('picnic','sandwich',(-3.25,-3.04,GROUND+.145),.46,yaw=.13)
asset('picnic','spoon',(-3.23,-2.51,GROUND+.09),.42,yaw=.32)
asset('furniture','chair_stool_wood',(-4.62,-1.76,GROUND),.58)
RADIO=group('Radio',(-4.62,-1.76,GROUND+.29),MAIL)
asset('picnic','radio',(-4.62,-1.76,GROUND+.29),.78,yaw=.12,parent=RADIO)
RADIO_NOTES=group('Radio_NoteAnchor',(-4.57,-1.76,GROUND+.98),MAIL)
RADIO_NOTES['effectRole']='note source; Three +Y up'

# Trees create an asymmetric canopy around the clearing. Their branches and
# crowns are the source meshes, with small scale variation rather than copies.
for name,loc,scale,rot in [
    ('Tree_1_C_Color1',(-4.45,2.95,GROUND),.53,-.16),
    ('Tree_3_A_Color1',(-5.10,-1.13,GROUND),.71,.40),
    ('Tree_4_A_Color1',(0.83,3.65,GROUND),.80,-.18),
    ('Tree_1_B_Color1',(4.28,3.19,GROUND),.86,.47),
]:asset('forest',name,loc,scale,yaw=rot)
asset('park','tree',(-2.95,3.58,GROUND),.66,yaw=.20)
# Low edging leaves the foreground open and clearly displays ground access.
for stem,loc,s,angle in [
 ('hedge_straight_long',(-2.50,3.85,GROUND),(.70,.44,.49),0),
 ('hedge_straight_long',(2.05,3.97,GROUND),(.62,.46,.50),0),
 ('hedge_straight',(-5.55,1.47,GROUND),(.62,.45,.45),math.pi/2),
 ('hedge_straight',(5.60,1.57,GROUND),(.65,.42,.46),math.pi/2),
]:asset('park',stem,loc,s,yaw=angle)

# Cobbles connect the shared reading deck, fountain and picnic. No text is
# embedded: these paths lead to accessible HTML content views.
for i,(x,y,s,angle) in enumerate([
 (.02,-3.82,.75,-.10),(-.20,-3.14,.65,.16),(-.15,-2.48,.63,.25),
 (.22,-1.84,.62,-.16),(.48,-1.08,.62,.15),(.75,-.30,.65,-.1),
 (1.0,.56,.63,.18),(1.35,1.27,.65,.05),(1.53,1.99,.56,.13),
 (1.15,-2.58,.63,.05),(1.96,-2.83,.67,-.13),(3.0,-2.96,.60,.1),
 (-1.15,-3.33,.58,.13),(-2.1,-3.63,.56,-.2),
]):asset('park','cobble_stones',(x,y,GROUND+.01),s,yaw=angle)

# Clusters, not a uniform carpet: grasses, flowers and exposed forest stones.
random.seed(42)
for j,(x,y,rad) in enumerate([(-5.03,-3.95,.55),(-1.72,-3.84,.45),(1.18,-3.74,.40),
 (5.95,-1.15,.42),(5.07,.09,.46),(-3.2,3.14,.42),(1.50,3.23,.38)]):
    for k in range(5):
        angle=random.random()*math.tau;r=random.random()*rad
        xx=x+math.cos(angle)*r;yy=y+math.sin(angle)*r
        asset('park','flower_A' if k%2 else 'flower_B',(xx,yy,GROUND+.03),.62+random.random()*.36,yaw=angle)
    asset('forest','Grass_1_A_Color1',(x+.12,y+.18,GROUND),.63,yaw=.2*j)
    asset('forest','Grass_2_A_Color1',(x-.18,y-.08,GROUND),.52,yaw=.7*j)
for i,(x,y,s) in enumerate([(-5.46,-2.85,.40),(-5.08,2.18,.5),(-3.08,3.95,.65),
 (1.92,3.72,.63),(5.3,2.7,.65),(5.98,-2.28,.49),(3.72,-3.63,.6),(1.52,-4.0,.48)]):
    asset('forest','Rock_3_A_Color1' if i%2 else 'Rock_2_C_Color1',(x,y,GROUND-.035),s,yaw=.61*i)
for i,(x,y,s) in enumerate([(-5.38,2.88,.68),(-3.52,3.54,.61),(4.90,2.94,.68),(5.85,-1.70,.48)]):
    asset('park','bush_large',(x,y,GROUND),s,yaw=.36*i)

# Three small birds from Pretty Park, grounded and independent of the hero.
for i,(x,y,z,s,angle) in enumerate([(3.42,-2.25,.79,.77,-.35),(1.66,-3.10,GROUND,.84,.20),(-4.60,.12,1.13,.73,-.20)]):
    perch=group('GardenBird_'+str(i),(x,y,z),ENV)
    asset('park','bird',(x,y,z),s,yaw=angle,parent=perch)

# Two understated planted pockets soften the edge between path and lawn.
# Reused grasses, flat stones and flowers make a planted bed rather than loose
# ornaments. They stay outside the three friends' central foreground space.
for bx,by,sx,sy in [(5.91,-.94,.43,.27),(-4.92,-3.86,.45,.25)]:
    points=[]
    for i in range(24):
        a=i*math.tau/24;r=1+.06*math.sin(i*2.7)
        points.append((bx+sx*r*math.cos(a),by+sy*r*math.sin(a),GROUND+.012))
    mesh('Planted pocket soil',[(bx,by,GROUND+.012)]+points,[(0,i+1,(i+1)%24+1)for i in range(24)],'soil',ENV)
    for i,a in enumerate([.25,1.25,2.3,3.8,5.2]):
        asset('forest','Rock_3_A_Color1',(bx+sx*math.cos(a),by+sy*math.sin(a),GROUND),(.15,.18,.07),yaw=a)
    asset('park','grass_B',(bx+.12,by-.06,GROUND+.02),.45,yaw=.25)
    asset('park','flower_A',(bx-.13,by+.03,GROUND+.025),.63,yaw=.4)
    asset('park','flower_B',(bx+.10,by-.10,GROUND+.025),.71,yaw=-.7)

# Every pendant now lands exactly on the same sagging cable curve.
def cord_point(x):return (x,2.61,2.78+.032*(x+.4)**2)
light_points=[cord_point(-3.65+i*6.30/16)for i in range(17)]
tube('Reading lights cable',light_points,.014,'wooddark',ENV,1)
for i in range(10):
    x=-3.5+i*.65;_,y,z=cord_point(x)
    tube('Light pendant',[(x,y,z),(x,y,z-.12)],.011,'wooddark',ENV,1)
    ellipsoid('Reading light',(x,y,z-.18),(.055,.055,.075),'nightwindow',ENV,12,6)

exec(compile((ROOT/'scripts/island/export_scene.py').read_text(), 'export_scene.py', 'exec'), globals())
