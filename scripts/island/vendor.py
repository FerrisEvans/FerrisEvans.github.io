"""Verified CC0 asset instancing. Executed by the Blender scene builder.

Source files remain untouched. Materials/images are shared by their content,
never their basename: the different Tiny Treats atlases share a filename.
"""
import hashlib
from mathutils import Matrix, Euler

PACKS = {
    'park': 'tinytreats-pretty-park-1.0',
    'picnic': 'tinytreats-pleasant-picnic-1.0-full',
    'plants': 'tinytreats-house-plants-1.0',
    'furniture': 'kaykit-furniture-bits-1.0',
    'forest': 'kaykit-forest-nature-1.0',
}
PROVENANCE = {}
for key, directory in PACKS.items():
    folder = SOURCE / 'vendor' / directory
    record = json.loads((folder / 'SOURCE.json').read_text())
    for item in record['files']:
        raw = (folder / item['file']).read_bytes()
        if len(raw) != item['bytes'] or hashlib.sha256(raw).hexdigest() != item['sha256']:
            raise RuntimeError(f'Vendor source changed: {directory}/{item["file"]}')
    PROVENANCE[key] = record

TEMPLATES, IMAGE_CACHE, MATERIAL_CACHE = {}, {}, {}
INSTANCES = []

def shared_material(material):
    if not material.use_nodes:
        return material
    shader = material.node_tree.nodes.get('Principled BSDF')
    textures = []
    for node in material.node_tree.nodes:
        if node.type != 'TEX_IMAGE' or not node.image:
            continue
        image = node.image
        raw = Path(bpy.path.abspath(image.filepath)).read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        if digest in IMAGE_CACHE:
            node.image = IMAGE_CACHE[digest]
        else:
            image.name = 'VendorAtlas_' + digest[:12]
            IMAGE_CACHE[digest] = image
        textures.append(digest)
    if shader:
        shader.inputs['Roughness'].default_value = .92
        shader.inputs['Specular IOR Level'].default_value = .22
        color = tuple(round(v, 5) for v in shader.inputs['Base Color'].default_value)
        alpha = round(shader.inputs['Alpha'].default_value, 5)
        metallic = round(shader.inputs['Metallic'].default_value, 5)
    else:
        color, alpha, metallic = tuple(material.diffuse_color), 1, 0
    signature = (tuple(textures), color, alpha, metallic, material.use_backface_culling)
    if signature not in MATERIAL_CACHE:
        material.name = 'VendorMaterial_' + hashlib.sha256(repr(signature).encode()).hexdigest()[:12]
        MATERIAL_CACHE[signature] = material
    return MATERIAL_CACHE[signature]

def template(pack, stem):
    key = (pack, stem)
    if key in TEMPLATES:
        return TEMPLATES[key]
    folder = SOURCE / 'vendor' / PACKS[pack]
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(folder / (stem + '.gltf')))
    imported = set(bpy.context.scene.objects) - before
    meshes = [obj for obj in imported if obj.type == 'MESH']
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    lo = Vector(tuple(min(point[i] for point in points) for i in range(3)))
    hi = Vector(tuple(max(point[i] for point in points) for i in range(3)))
    center = (lo + hi) / 2
    parts = []
    for obj in meshes:
        for slot in obj.material_slots:
            if slot.material:
                slot.material = shared_material(slot.material)
        parts.append((obj.data, Matrix.Translation(-center) @ obj.matrix_world.copy(), obj.name))
    for obj in imported:
        bpy.data.objects.remove(obj, do_unlink=True)
    TEMPLATES[key] = (parts, [point - center for point in points], center)
    return TEMPLATES[key]

def asset(pack, stem, loc, scale=1, yaw=0, parent=None, name=None, rotation=None, contact_z=None):
    parent = parent or ENV
    parts, bounds, center = template(pack, stem)
    xyz = (scale, scale, scale) if isinstance(scale, (int, float)) else scale
    rotation = rotation or (0, 0, yaw)
    transform = Euler(rotation).to_matrix().to_4x4() @ Matrix.Diagonal((*xyz, 1))
    bottom = min((transform @ point).z for point in bounds)
    # Trailing leaves may hang below a pot's physical foot. Their bounding-box
    # minimum is not a support surface: align the original pot base instead.
    if contact_z is not None:
        bottom = (transform @ (Vector((0, 0, contact_z)) - center)).z
    transform = Matrix.Translation((loc[0], loc[1], loc[2] - bottom)) @ transform
    source = PACKS[pack] + '/' + stem + '.gltf'
    created = []
    for data, placement, original_name in parts:
        obj = bpy.data.objects.new(name or stem, data)
        bpy.context.collection.objects.link(obj)
        obj.parent = parent
        obj.matrix_world = transform @ placement
        obj['vendorAssets'] = [source]
        obj['sourceObject'] = original_name
        created.append(obj)
    INSTANCES.append({'pack': pack, 'file': stem + '.gltf', 'position': list(loc),
        'scale': list(xyz), 'rotation': list(rotation), 'group': parent.name,
        **({'sourceContactZ': contact_z} if contact_z is not None else {})})
    return created


def foliage_asset(stem, name, loc, scale, yaw=0, parent=None, soil_height=.55, contact_z=0):
    """Keep the CC0 pot fixed while retaining its unmodified leaves on a pivot.

    Tiny Treats uses solid atlas pigments. Connected islands containing green
    leaf/stem faces are separated without remeshing or changing their UVs.
    Hard-edge/UV seams already split source islands, so classification uses the
    pigment, not a height cut that would detach hanging leaves or leaf roots.
    """
    import bmesh
    root = group(name, loc, parent or TAGS)
    objects = asset('plants', stem, loc, scale, yaw=yaw, parent=root, contact_z=contact_z)
    bpy.context.view_layer.update()
    parts, bounds, center = template('plants', stem)
    origin = Vector(loc) - Euler((0, 0, yaw)).to_matrix() @ Vector((center.x*scale, center.y*scale, 0))
    pivot = group(name+'_Foliage', (origin.x, origin.y, loc[2]+soil_height*scale), root)
    pivot['effectRole'] = 'foliage-only'; pivot['recommendedAxes'] = 'Three local X/Z, amplitude <= 0.035 rad'
    for obj in objects:
        mesh_data = obj.data
        image = next(n.image for m in mesh_data.materials for n in m.node_tree.nodes
                     if n.type == 'TEX_IMAGE' and n.image)
        width, height = image.size; pixels = list(image.pixels)
        uv = mesh_data.uv_layers.active.data
        parents = list(range(len(mesh_data.vertices)))
        def find(index):
            while parents[index] != index:
                parents[index] = parents[parents[index]]; index = parents[index]
            return index
        for edge in mesh_data.edges:
            a, b = edge.vertices; parents[find(a)] = find(b)
        green_islands = set()
        for face in mesh_data.polygons:
            u, v = uv[face.loop_indices[0]].uv
            offset = (min(height-1, max(0, int(v*height)))*width + min(width-1, max(0, int(u*width))))*4
            r, g, b = pixels[offset:offset+3]
            if g > r*1.025 and g > b*1.025:
                green_islands.add(find(face.vertices[0]))
        foliage_faces = {f.index for f in mesh_data.polygons if find(f.vertices[0]) in green_islands}
        if not foliage_faces or len(foliage_faces) == len(mesh_data.polygons):
            raise RuntimeError('Plant foliage classification failed: '+stem)
        for keep_foliage, owner, suffix in [(False, root, '_Pot'), (True, pivot, '_Leaves')]:
            data = mesh_data.copy(); bm = bmesh.new(); bm.from_mesh(data); bm.faces.ensure_lookup_table()
            remove = [f for f in bm.faces if (f.index in foliage_faces) != keep_foliage]
            bmesh.ops.delete(bm, geom=remove, context='FACES'); bm.to_mesh(data); bm.free(); data.update()
            piece = bpy.data.objects.new(name+suffix, data); bpy.context.collection.objects.link(piece)
            piece.parent = owner; piece.matrix_world = obj.matrix_world.copy()
            piece['vendorAssets'] = list(obj['vendorAssets']); piece['sourceObject'] = obj['sourceObject']
            piece['adaptation'] = 'Original connected foliage/pot components separated; geometry and UVs unchanged'
        bpy.data.objects.remove(obj, do_unlink=True)
    return root, pivot
