"""Original Ferris bear and coordinated clips, preserved from the approved character.
Executed by build_scene.py in its authoring context.
"""
# Main character: broad cheeks, short seated legs, articulated upper body.
# Every face detail follows the head pivot; eyes can squash for blinks.
X,Y=.08,-1.63
body=group('Bear_Body',(X,Y,1.02),BEAR)
ellipsoid('Bear torso',(X,Y,1.11),(.52,.38,.59),'clay',body,28,16)
ellipsoid('Bear belly',(X,Y-.31,1.06),(.32,.11,.38),'muzzle',body,24,14)
for side in [-1,1]:
    ellipsoid('Bear seated leg',(X+side*.33,Y-.08,.66),(.29,.36,.24),'clay',BEAR,24,12,(0,side*.15,side*.15))
    ellipsoid('Bear foot pad',(X+side*.33,Y-.35,.68),(.14,.045,.105),'ear',BEAR,20,10)
# small stool peeking out
cylinder('Reading stool',(X,Y,.55),.43,.17,'wood',BEAR)
for angle in [0,2.1,4.2]:
    x=X+.29*math.cos(angle);y=Y+.29*math.sin(angle)
    tube('Stool leg',[(x,y,.54),(x+.04*math.cos(angle),y+.04*math.sin(angle),.43)],.065,'wooddark',BEAR,2)
head=group('Bear_Head',(X,Y,1.62),body)
ellipsoid('Bear head',(X,Y-.015,1.96),(.64,.46,.58),'clay',head,32,20)
# cheeks subtly broaden silhouette and a tuft breaks perfect symmetry
ellipsoid('Bear cheek left',(X-.34,Y-.09,1.82),(.33,.37,.35),'clay',head,24,14)
ellipsoid('Bear cheek right',(X+.34,Y-.09,1.82),(.33,.37,.35),'clay',head,24,14)
for side in [-1,1]:
    ellipsoid('Bear ear',(X+side*.47,Y,2.36),(.255,.17,.26),'clay',head,24,14, (0,side*.2,0))
    ellipsoid('Bear inner ear',(X+side*.47,Y-.145,2.36),(.15,.035,.16),'muzzle',head,24,12)
ellipsoid('Bear forelock',(X+.06,Y-.09,2.48),(.18,.19,.16),'clay',head,20,12,(0,-.25,0))
ellipsoid('Bear muzzle',(X,Y-.435,1.79),(.27,.075,.24),'muzzle',head,28,16)
ellipsoid('Bear nose',(X,Y-.519,1.91),(.10,.045,.065),'ink',head,20,12)
tube('Bear gentle smile',[(X-.11,Y-.51,1.77),(X-.055,Y-.53,1.72),(X,Y-.54,1.715),(X+.065,Y-.53,1.735),(X+.11,Y-.51,1.78)],.015,'ink',head,2)
for side,label in [(-1,'L'),(1,'R')]:
    eye=group('Bear_Eye_'+label,(X+side*.25,Y-.454,2.045),head)
    ellipsoid('Bear eye',(X+side*.25,Y-.454,2.045),(.061,.031,.088),'eye',eye,20,12)
    ellipsoid('Eye sparkle',(X+side*.25-.012,Y-.484,2.079),(.016,.009,.022),'shine',eye,12,8)
    ellipsoid('Bear blush',(X+side*.43,Y-.383,1.86),(.085,.025,.065),'blush',head,20,10)
    torus('Round glasses',(X+side*.265,Y-.49,2.045),.255,.024,'ink',head,(math.pi/2,0,0),40)
    tube('Glasses temple',[(X+side*.52,Y-.48,2.08),(X+side*.60,Y-.29,2.1),(X+side*.60,Y-.18,2.05)],.021,'ink',head,2)
tube('Glasses bridge',[(X-.023,Y-.50,2.09),(X,Y-.52,2.115),(X+.023,Y-.50,2.09)],.022,'ink',head,2)
# Sprout: two flattened tapered leaves, a curved little stem above forehead.
tube('Sprout stem',[(X+.12,Y-.02,2.48),(X+.17,Y-.025,2.65),(X+.23,Y-.02,2.82)],.027,'leafdark',head,2)
leaf('Sprout leaf left',(X+.07,Y-.035,2.76),(.16,.055,.09),'leaflight',head,(0,.58,0))
leaf('Sprout leaf right',(X+.30,Y-.02,2.84),(.17,.06,.10),'leaflight',head,(0,-.57,0))
# Hands hold an open green notebook. Separate shoulder pivots enable looking/wave.
for side,label in [(-1,'L'),(1,'R')]:
    arm=group('Bear_Arm_'+label,(X+side*.39,Y-.04,1.46),body)
    ellipsoid('Bear upper arm',(X+side*.43,Y-.15,1.29),(.23,.26,.32),'clay',arm,24,14,(0,side*.25,side*.12))
    ellipsoid('Bear paw',(X+side*.37,Y-.38,1.19),(.22,.205,.20),'clay',arm,24,14)
book=group('Bear_Book',(X,Y-.46,1.22),body)
# Held book angled back so the sprout cover can be seen from front.
box('Green notebook cover',(X,Y-.505,1.18),(.60,.09,.57),'roof',book,.045,(-.16,0,0))
box('Notebook paper edge',(X,Y-.46,1.21),(.53,.075,.51),'paper',book,.025,(-.16,0,0))
box('Green notebook spine',(X-.285,Y-.50,1.18),(.055,.12,.56),'leafdark',book,.02,(-.16,0,0))
tube('Book sprout stem',[(X,Y-.57,1.08),(X+.02,Y-.56,1.20)],.012,'paper',book,2)
leaf('Book sprout leaf',(X-.035,Y-.565,1.20),(.065,.012,.034),'paper',book,(0,.5,0))
leaf('Book sprout leaf',(X+.062,Y-.565,1.24),(.073,.012,.035),'paper',book,(0,-.5,0))

# Bake a 25% deeper silhouette into the original character geometry, keeping
# every pivot unscaled so authored arm/head rotations remain well behaved.
# The face, spectacles and held notebook move with their supporting surfaces.
from mathutils import Matrix, Quaternion
bpy.context.view_layer.update()
bear_objects=list(BEAR.children_recursive)
old_world={o:o.matrix_world.copy() for o in bear_objects}
stretch=Matrix.Translation((0,Y,0)) @ Matrix.Diagonal((1,1.25,1,1)) @ Matrix.Translation((0,-Y,0))
def bear_depth(o):
    n=0
    while o.parent and o.parent!=BEAR:n+=1;o=o.parent
    return n
for o in sorted(bear_objects,key=bear_depth):
    old=old_world[o];new=old.copy();new.translation=stretch@old.translation
    if o.type=='MESH':
        o.data=o.data.copy();o.data.transform(new.inverted() @ stretch @ old);o.data.update()
    o.matrix_world=new

# Join the cheeks into the head's actual volume. Overlapping ellipsoids leave
# a visible horizontal step under the glasses temple when viewed from the side.
# The face fittings stay independent on the same articulated head pivot.
bpy.ops.object.select_all(action='DESELECT')
head_surface=bpy.data.objects['Bear head']
for name in ['Bear head','Bear cheek left','Bear cheek right']:
    bpy.data.objects[name].select_set(True)
bpy.context.view_layer.objects.active=head_surface;bpy.ops.object.join()
head_surface.name='Bear continuous head'
remesh=head_surface.modifiers.new('Continuous cheek volume','REMESH')
remesh.mode='VOXEL';remesh.voxel_size=.04;remesh.use_smooth_shade=True
bpy.ops.object.modifier_apply(modifier=remesh.name)
smooth=head_surface.modifiers.new('Rounded cheek transition','SMOOTH');smooth.factor=.45;smooth.iterations=4
bpy.ops.object.modifier_apply(modifier=smooth.name)
head_surface.data.calc_loop_triangles()
tri_count=len(head_surface.data.loop_triangles)
if tri_count>3600:
    simplify=head_surface.modifiers.new('Curvature-preserving head budget','DECIMATE');simplify.ratio=3600/tri_count
    bpy.ops.object.modifier_apply(modifier=simplify.name)
for polygon in head_surface.data.polygons:polygon.use_smooth=True
head_surface['construction']='Continuous voxel-union head and cheeks; original face fittings retained'

# An open green cloth notebook sits in the two paws. Keeping its spread below
# the chin allows a readable leaf turn without cutting into the face.
for old in list(book.children_recursive):
    if old.type=='MESH':bpy.data.objects.remove(old,do_unlink=True)
book.matrix_world.translation=(X,Y-.76,1.18)
box('Green reading notebook cover',(X,Y-.76,1.155),(.82,.50,.055),'roof',book,.018,(.18,0,0))
box('Green notebook central spine',(X,Y-.76,1.19),(.035,.48,.035),'leafdark',book,.01,(.18,0,0))
for side in [-1,1]:
    box('Reading paper block',(X+side*.205,Y-.76,1.194),(.372,.446,.025),'paper',book,.008,(.18,0,0))
page_origin=(X,Y-.975,1.17);page_tilt=.18
spread=group('Bear_ReadingSpread',page_origin,book);spread.rotation_euler.x=page_tilt
def bear_sheet(name,side,parent,z=.0):
    vs=[];fs=[]
    for j in range(4):
        for i in range(6):
            u=i/5;vs.append((side*(.012+.375*u),j*.143,z+.009*u*u))
    for j in range(3):
        for i in range(5):
            a=j*6+i;fs.append((a,a+1,a+7,a+6) if side>0 else (a+6,a+7,a+1,a))
    data=bpy.data.meshes.new(name);data.from_pydata(vs,[],fs);data.materials.append(MATS['paper']);data.update()
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.parent=parent
    solid=o.modifiers.new('Paper thickness','SOLIDIFY');solid.thickness=.003
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=solid.name)
    return o
for side in [-1,1]:
    for level in range(3):bear_sheet('Bear reading paper',side,spread,.003*level)
page=group('Bear_Book_Page',page_origin,book);page.rotation_mode='QUATERNION'
page.rotation_quaternion=Quaternion((1,0,0),page_tilt)
bear_sheet('Bear turning page',1,page,.012)
page['effectRole']='Mixer-owned reading page; local Three +Z raises the right leaf'
book['effectRole']='Mixer-owned held book, coordinated with both hands'

# Editable animation source: three coordinated NLA clips. Runtime may blend
# these or use these same pivots procedurally. Each object gets matching tracks.
# Animation is keyed in authored Blender axes: Z=up, X=pitch, Z=yaw.
def animate_object(obj,clip,keys,property='rotation_euler'):
    obj.animation_data_create()
    act=bpy.data.actions.new(obj.name+'_'+clip)
    obj.animation_data.action=act
    for f,val in keys:
        setattr(obj,property,val)
        obj.keyframe_insert(data_path=property,frame=f,group=clip)
    # Blender 5 action slots are assigned automatically by keyframe_insert.
    slot=obj.animation_data.action_slot
    track=obj.animation_data.nla_tracks.new();track.name=clip
    strip=track.strips.new(clip,1,act)
    if slot:strip.action_slot=slot
    obj.animation_data.action=None
    track.mute=True
    return track

head=bpy.data.objects['Bear_Head'];body=bpy.data.objects['Bear_Body']
armL=bpy.data.objects['Bear_Arm_L'];armR=bpy.data.objects['Bear_Arm_R']
# A six-second reading loop: scan the spread, lift the right paw, turn one
# page, then settle. Body, book and supporting left hand share the same timing.
animate_object(body,'Idle',[(1,(1,1,1)),(90,(1.012,1.012,1.02)),(180,(1,1,1))],'scale')
animate_object(head,'Idle',[(1,(.16,0,-.025)),(35,(.22,0,.035)),(65,(.19,0,-.02)),
    (82,(.25,0,.02)),(112,(.23,0,.025)),(145,(.20,0,-.02)),(180,(.16,0,-.025))])
animate_object(book,'Idle',[(1,(.015,0,0)),(75,(.025,0,0)),(100,(-.018,0,0)),(125,(.015,0,0)),(180,(.015,0,0))])
animate_object(armL,'Idle',[(1,(-.015,.025,.025)),(80,(-.035,.035,.04)),(120,(-.015,.025,.025)),(180,(-.015,.025,.025))])
animate_object(armR,'Idle',[(1,(0,0,0)),(70,(0,0,0)),(86,(-.10,.03,-.015)),
    (102,(-.14,.04,-.025)),(120,(-.08,.02,-.015)),(138,(0,0,0)),(180,(0,0,0))])
page_keys=[]
for f,angle in [(1,0),(78,0),(90,-.25),(104,-.70),(116,-.25),(128,0),(180,0)]:
    page_keys.append((f,tuple(Quaternion((1,0,0),page_tilt) @ Quaternion((0,1,0),angle))))
animate_object(page,'Idle',page_keys,'rotation_quaternion')
for n in ['Bear_Eye_L','Bear_Eye_R']:
    animate_object(bpy.data.objects[n],'Idle',[(1,(1,1,1)),(48,(1,1,1)),(51,(1,1,.10)),(54,(1,1,1)),
        (147,(1,1,1)),(150,(1,1,.10)),(153,(1,1,1)),(180,(1,1,1))],'scale')
animate_object(head,'Attention',[(1,(.04,0,0)),(12,(-.10,0,-.10)),(32,(-.10,0,-.10)),(45,(.04,0,0))])
animate_object(body,'Attention',[(1,(1,1,1)),(12,(1,1,1.035)),(32,(1,1,1.035)),(45,(1,1,1))],'scale')
animate_object(head,'Wave',[(1,(.16,0,-.025)),(16,(-.10,.05,-.12)),(55,(-.10,.05,-.12)),(75,(.16,0,-.025))])
animate_object(armR,'Wave',[(1,(0,0,0)),(16,(.05,-1.55,.1)),(24,(.05,-1.8,.1)),(32,(.05,-1.4,.1)),(40,(.05,-1.8,.1)),(48,(.05,-1.4,.1)),(58,(.05,-1.55,.1)),(75,(0,0,0))])
animate_object(armL,'Wave',[(1,(0,0,0)),(16,(.10,.06,-.08)),(58,(.10,.06,-.08)),(75,(0,0,0))])
animate_object(body,'Wave',[(1,(0,0,0)),(16,(0,.035,-.035)),(58,(0,.035,-.035)),(75,(0,0,0))])
animate_object(book,'Wave',[(1,(.015,0,0)),(16,(.020,0,0)),(58,(.020,0,0)),(75,(.015,0,0))])
animate_object(page,'Wave',[(1,tuple(Quaternion((1,0,0),page_tilt))),
    (16,tuple(Quaternion((1,0,0),page_tilt) @ Quaternion((0,1,0),-.008))),
    (58,tuple(Quaternion((1,0,0),page_tilt) @ Quaternion((0,1,0),-.008))),
    (75,tuple(Quaternion((1,0,0),page_tilt)))],'rotation_quaternion')
# Explicit rest poses are also used for the saved source and modeling renders.
for o in [body,head,armL,armR,book]:
    rotation=(.16,0,-.025) if o==head else ((.015,0,0) if o==book else (0,0,0))
    o.rotation_euler=rotation;o.scale=(1,1,1);o['restRotation']=rotation;o['restScale']=(1,1,1)
page.rotation_quaternion=Quaternion((1,0,0),page_tilt)
page['restQuaternion']=list(page.rotation_quaternion)
for n in ['Bear_Eye_L','Bear_Eye_R']:
    bpy.data.objects[n].scale=(1,1,1);bpy.data.objects[n]['restScale']=(1,1,1)
