"""Retain the accepted building UV charts while editing independent cloth.

architecture-uv.glb contains only the round-7 building meshes/UVs, no furniture,
lights or camera. Its geometry must still match the procedural building before
its charts can be reused. This prevents a curtain edit changing unrelated texel
allocation and shading. Re-author this UV source when building geometry changes.
"""
from pathlib import Path
import bpy
import numpy as np


def preserve_architecture_uv(scene):
    bpy.context.view_layer.update()
    bpy.ops.import_scene.gltf(filepath=str(Path(__file__).with_name('architecture-uv.glb')))
    references=[o for o in scene.objects if o.name.startswith('UVReference_')]
    if not references:
        raise ValueError('Missing architecture UV reference meshes')
    names=[]
    for reference in references:
        name=reference.name.removeprefix('UVReference_')
        obj=scene.objects.get(name)
        if obj is None or obj.type!='MESH':
            raise ValueError('Architecture changed; update UV source: '+name)
        transform=obj.matrix_world.inverted()@reference.matrix_world
        current=np.asarray([tuple(v.co) for v in obj.data.vertices])
        saved=np.asarray([tuple(transform@v.co) for v in reference.data.vertices])
        # UV seams duplicate vertices, so compare the actual surface points.
        distances=np.sum((current[:,None,:]-saved[None,:,:])**2,axis=2)
        if max(distances.min(0).max(),distances.min(1).max())>1e-10:
            raise ValueError('Architecture changed; update UV source: '+name)
        original=obj.data;materials=list(original.materials)
        obj.data=reference.data.copy();obj.data.transform(transform)
        obj.data.materials.clear()
        for material in materials:obj.data.materials.append(material)
        for polygon in obj.data.polygons:polygon.material_index=0
        obj.data.uv_layers[0].name='MaterialUV'
        if original.users==0:bpy.data.meshes.remove(original)
        names.append(name)
    for reference in references:bpy.data.objects.remove(reference,do_unlink=True)
    return {'source':'architecture-uv.glb','matchedMeshes':len(names),'geometryUnchanged':True}
