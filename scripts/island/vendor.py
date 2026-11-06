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


def continuous_grass(objects):
    """Replace per-slice UV repetition with a continuous, seamless ground texture."""
    import numpy as np
    source_image = next(node.image for obj in objects for material in obj.data.materials
                        for node in material.node_tree.nodes if node.type == 'TEX_IMAGE' and node.image)
    width, height = source_image.size
    source_pixels = np.array(source_image.pixels[:], dtype=np.float32).reshape(height, width, 4)
    base = source_pixels[:, :, :3].mean(axis=(0, 1))
    size = 512
    rng = np.random.default_rng(2606)
    yy, xx = np.mgrid[:size, :size]
    coarse = rng.uniform(-.0035, .0035, (16, 16))
    low = np.kron(coarse, np.ones((32, 32)))
    low = (low + np.roll(low, 1, 0) + np.roll(low, -1, 0) + np.roll(low, 1, 1) + np.roll(low, -1, 1)) / 5
    detail = rng.normal(0, .0008, (size, size))
    rgb = np.broadcast_to(base, (size, size, 3)).copy() + low[:, :, None] + detail[:, :, None]
    for _ in range(72):
        cx, cy = rng.uniform(0, size, 2)
        radius = rng.uniform(4, 12)
        tone = rng.uniform(-.012, .012)
        for ox in (-size, 0, size):
            for oy in (-size, 0, size):
                distance = ((xx + ox - cx) / radius) ** 2 + ((yy + oy - cy) / radius) ** 2
                mask = np.clip(1 - distance, 0, 1) ** 1.5
                rgb += mask[:, :, None] * tone
    rgba = np.ones((size, size, 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(rgb, 0, 1)
    image = bpy.data.images.new('Garden_seamless_grass', width=size, height=size, alpha=True)
    image.colorspace_settings.name = source_image.colorspace_settings.name
    image.pixels.foreach_set(rgba.astype(np.float32).ravel())
    image.pack()
    material = bpy.data.materials.new('Garden_continuous_grass')
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = .98
    shader.inputs['Specular IOR Level'].default_value = .22
    texture = material.node_tree.nodes.new('ShaderNodeTexImage')
    texture.image = image
    material.node_tree.links.new(texture.outputs['Color'], shader.inputs['Base Color'])
    bpy.context.view_layer.update()
    for obj in objects:
        obj.data.materials.append(material)
        top_index = len(obj.data.materials) - 1
        uv = obj.data.uv_layers.active.data
        for polygon in obj.data.polygons:
            if polygon.normal.z <= .5:
                continue
            polygon.material_index = top_index
            for loop_index in polygon.loop_indices:
                vertex = obj.data.vertices[obj.data.loops[loop_index].vertex_index]
                point = obj.matrix_world @ vertex.co
                uv[loop_index].uv = (point.x / 4.32, point.y / 4.32)
        obj['adaptation'] = 'Continuous world-space top UV and original seamless grass texture; source side material retained'
