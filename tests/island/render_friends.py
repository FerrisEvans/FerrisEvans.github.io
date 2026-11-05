"""Independent reference-character proof; does not mutate the garden or delivery.

Blender --background --factory-startup --python tests/island/render_friends.py
Output: /tmp/weijin-friends/{front,three-quarter,top,side,back}.png and friends.blend.
"""
import bpy
import math
import json
import struct
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = Path('/tmp/weijin-friends')
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def rgb(value):
    values = [int(value[i:i+2],16)/255 for i in (1,3,5)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in values)


MATS = {}
exec((ROOT/'scripts/island/geometry.py').read_text(), globals())
exec((ROOT/'scripts/island/friends.py').read_text(), globals())
dog = make_dog(loc=(-.95,0,0))
rabbit = make_rabbit(loc=(.95,0,0))

ground_mat = bpy.data.materials.new('Warm studio paper')
ground_mat.diffuse_color = (*rgb('#E4D6BD'),1)
ground_mat.use_nodes = True
ground_mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*rgb('#E4D6BD'),1)
ground_mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1
bpy.ops.mesh.primitive_plane_add(size=200)
floor = bpy.context.object
floor.name = 'Preview floor'
floor.data.materials.append(ground_mat)

world = bpy.data.worlds.new('Warm daylight')
bpy.context.scene.world=world
world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(*rgb('#F9F3E9'),1)
world.node_tree.nodes['Background'].inputs[1].default_value=.55
for label,loc,power,size in [('Large softbox',(-3,-4,7),700,5),('Soft fill',(4,-1,4),350,4),('Ear rim',(0,3,5),500,3)]:
    bpy.ops.object.light_add(type='AREA',location=loc)
    light=bpy.context.object;light.name=label
    light.data.energy=power;light.data.size=size
    light.rotation_euler=(Vector((0,0,1.2))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(0,-8,3.1))
camera=bpy.context.object;camera.name='Friends close-up'
camera.data.type='ORTHO';camera.data.ortho_scale=4.1
scene=bpy.context.scene;scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=True
scene.render.resolution_x=1500;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'friends.blend'),compress=True)
for label,eye in [('front',(0,-8,2.8)),('three-quarter',(4,-8,3.3)),('top',(2,-4,8)),
                  ('side',(7,-3,3.0)),('back',(3.8,7,3.4))]:
    camera.location=eye
    camera.rotation_euler=(Vector((0,0,1.17))-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(OUT/(label+'.png'))
    bpy.ops.render.render(write_still=True)
    print('FRIENDS_RENDER',scene.render.filepath,flush=True)
meshes=[obj for obj in bpy.context.scene.objects if obj.type=='MESH' and obj != floor]
print('FRIENDS_GEOMETRY',sum(sum(len(poly.vertices)-2 for poly in obj.data.polygons) for obj in meshes),'triangles',len(meshes),'meshes',flush=True)
bpy.ops.object.select_all(action='DESELECT')
for obj in scene.objects:
    ancestor=obj
    while ancestor and ancestor not in (dog,rabbit):
        ancestor=ancestor.parent
    if ancestor:
        obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'friends.glb'),export_format='GLB',use_selection=True,
    export_cameras=False,export_lights=False,export_animations=False,export_extras=True,
    export_yup=True,export_materials='EXPORT',export_image_format='AUTO')
raw=(OUT/'friends.glb').read_bytes()
gltf=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
names={node.get('name') for node in gltf['nodes']}
assert 'Rabbit_WateringCanGrip' in names, 'Watering prop attachment must survive export'
assert 'Dog_SnoutCloth' not in names and 'Dog_WovenNose' not in names, 'Nose must be part of the continuous face'
assert 'Rabbit_ClothCollar' in names and 'Rabbit_SquareCollar' not in names, 'Collar must be the open-neck cloth surface'
for prefix in ('Dog','Rabbit'):
    for part in ('Body','Head','Ear_L','Ear_R','Arm_L','Arm_R','Leg_L','Leg_R','Tail','Eye_L','Eye_R'):
        assert prefix+'_'+part in names, (prefix,part,'missing exported pivot')
normal_materials=[mat['name'] for mat in gltf['materials'] if 'normalTexture' in mat]
assert len(normal_materials)>=7,normal_materials
assert len(gltf.get('images',[]))==5, 'Expected three shared normal maps, a floral color map and the dog eye texture'
print('FRIENDS_GLTF',len(raw),'bytes;',len(gltf['nodes']),'nodes;',len(normal_materials),'fabric materials with exported normal maps',flush=True)
