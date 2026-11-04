"""Batch static assets without losing their provenance, save editable source,
and export the same complete scene and original character clips to glTF."""
import struct

bpy.context.view_layer.update()
mesh_groups = {}
for obj in list(bpy.context.scene.objects):
    if obj.type == 'MESH':
        key = (obj.parent.name if obj.parent else '', tuple(m.name for m in obj.data.materials))
        mesh_groups.setdefault(key, []).append(obj)
for (parent_name, material_names), objects in mesh_groups.items():
    if len(objects) < 2:
        continue
    origins = sorted({source for obj in objects for source in obj.get('vendorAssets', [])})
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    objects[0].data = objects[0].data.copy()
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = (parent_name or 'Garden') + '_' + material_names[0]
    if origins:
        objects[0]['vendorAssets'] = origins

world = bpy.context.scene.world or bpy.data.worlds.new('Paper studio')
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (*rgb('#F8F8F0'), 1)
world.node_tree.nodes['Background'].inputs[1].default_value = .8
for name, location, energy, size in [
    ('Garden key', (-5, -6, 12), 1450, 8), ('Garden fill', (6, 2, 8), 700, 9),
]:
    bpy.ops.object.light_add(type='AREA', location=location)
    light = bpy.context.object
    light.name = name; light.data.energy = energy; light.data.size = size
    light.rotation_euler = (Vector((0, 0, 1)) - light.location).to_track_quat('-Z', 'Y').to_euler()
bpy.ops.object.camera_add(location=(9, -15, 12))
camera = bpy.context.object; camera.name = 'Garden overview'
camera.data.type = 'ORTHO'; camera.data.ortho_scale = 17.5
camera.rotation_euler = (Vector((0, 0, 1.55)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
scene = bpy.context.scene; scene.camera = camera
scene.render.engine = 'CYCLES'; scene.cycles.samples = 24; scene.cycles.use_denoising = True
scene.render.resolution_x = 1500; scene.render.resolution_y = 1100; scene.render.resolution_percentage = 100
scene.view_settings.view_transform = 'AgX'
scene.render.image_settings.file_format = 'PNG'; scene.render.film_transparent = False
scene.render.fps = 30; scene.frame_end = 180; scene.frame_set(1)
bpy.context.preferences.filepaths.save_version = 0
bpy.data.orphans_purge(do_recursive=True)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'island.blend'), compress=True)
for obj in scene.objects:
    if obj.animation_data:
        for track in obj.animation_data.nla_tracks:
            track.mute = False
bpy.ops.object.select_all(action='DESELECT')
for obj in scene.objects:
    if obj.type not in {'LIGHT', 'CAMERA'}:
        obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'island.glb'), export_format='GLB', use_selection=True,
    export_cameras=False, export_lights=False, export_animations=True,
    export_animation_mode='NLA_TRACKS', export_force_sampling=True,
    export_frame_range=False, export_extras=True, export_yup=True,
    export_materials='EXPORT', export_image_format='AUTO')
raw = (OUT / 'island.glb').read_bytes()
gltf = json.loads(raw[20:20 + struct.unpack_from('<I', raw, 12)[0]])
triangles = sum(gltf['accessors'][p['indices']]['count'] // 3 for m in gltf.get('meshes', []) for p in m['primitives'])
external = []
for key, provenance in PROVENANCE.items():
    used = {item['file'] for item in INSTANCES if item['pack'] == key}
    external.append({'name': provenance['pack'], 'author': provenance['author'], 'license': provenance['license'],
        'source': 'assets/island/vendor/' + PACKS[key] + '/SOURCE.json',
        'models': [item for item in provenance['selectedModels'] if item['file'] in used]})
report = {
    'schema': 2, 'generator': 'scripts/island/build_scene.py', 'author': 'Weijin / original Ferris character and garden composition',
    'source': 'assets/island/island.blend', 'asset': 'public/island/island.glb',
    'externalAssets': external, 'assetInstances': INSTANCES,
    'bytes': len(raw), 'triangles': triangles, 'meshes': len(gltf.get('meshes', [])),
    'drawCalls': sum(len(m['primitives']) for m in gltf.get('meshes', [])),
    'materials': len(gltf.get('materials', [])), 'textures': len(gltf.get('textures', [])),
    'animations': [{'name': a.get('name'), 'channels': len(a['channels'])} for a in gltf.get('animations', [])],
    'coordinates': {'Blender': 'Z up, front -Y', 'Three': 'Y up, front +Z', 'groundHeight': GROUND,
        'overviewEye': [9, 12, 15], 'overviewTarget': [0, 1.55, 0], 'footprint': [12.96, 9.72]},
    'originalGeometry': ['Ferris bear, glasses, sprout, book, stool and character animation',
        'reference-led Dog and Rabbit plush friends with packed cloth detail',
        'joining deck boards, bookshelf frame and dowels, open journal and pencil, coaster, planted soil pockets and connected light cable'],
    'characterReferences': [
        {'file': 'assets/island/references/'+name, 'sha256': hashlib.sha256((SOURCE/'references'/name).read_bytes()).hexdigest(),
         'use': 'User-provided visual reference for original geometry; not embedded in the runtime asset'}
        for name in ['dog-plush.jpg', 'rabbit-plush.jpg']],
    'interactionPivots': [
        {'name': obj.name, 'parent': obj.parent.name if obj.parent else None,
         'positionThree': [round(obj.matrix_world.translation.x, 5), round(obj.matrix_world.translation.z, 5), round(-obj.matrix_world.translation.y, 5)],
         'role': obj.get('effectRole', ''),
         **({'pour_axis': obj['pour_axis'], 'pour_angle': obj['pour_angle']} if 'pour_axis' in obj else {}),
         **({'flow_axis': list(obj['flow_axis'])} if 'flow_axis' in obj else {})}
        for obj in scene.objects if obj.type == 'EMPTY' and (obj.name in {
            'Library_Books','Library_FeatureBook','Desk_Lamp','Desk_OpenBook','Desk_Page','Fountain_WaterAnchor','Fountain_BasinAnchor','Radio','Radio_NoteAnchor',
            'Plants_Monstera','Plants_Sansevieria','Plants_Pothos','Dog','Rabbit','Bear_Book','Bear_Book_Page','Dog_FlowerAnchor',
            'Rabbit_WateringCan','Rabbit_WateringCanGrip','Rabbit_WaterNozzleAnchor','Rabbit_WaterTargetAnchor'} or obj.name.endswith('_Foliage'))],
    'sourceLicense': 'External assets CC0-1.0 by Isa Lousberg / Tiny Treats and Kay Lousberg / KayKit. Source packages, licenses, hashes and actual mesh origins are retained.',
    'buildCommand': '/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/island/build_scene.py',
}
(OUT / 'model-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print('GARDEN_REPORT ' + json.dumps({k: report[k] for k in ['bytes', 'triangles', 'meshes', 'drawCalls', 'materials', 'textures', 'animations']}))
if '--render' in sys.argv:
    for obj in scene.objects:
        if obj.animation_data:
            for track in obj.animation_data.nla_tracks:
                track.mute = True
    for obj in scene.objects:
        if 'restRotation' in obj: obj.rotation_euler = obj['restRotation']
        if 'restScale' in obj: obj.scale = obj['restScale']
        if 'restQuaternion' in obj: obj.rotation_quaternion = obj['restQuaternion']
    scene.render.filepath = '/tmp/weijin-rebuild/garden-preview.png'
    bpy.ops.render.render(write_still=True)
