"""Local CC0 leaf scans, fitted to the existing pot. See sources/.../SOURCE.json.

Only the blades and their petioles are imported. The retained source coordinates
are a corner attribute, so atlas packing cannot change the scanned leaf veins.
"""
import math
from pathlib import Path
import bpy
from mathutils import Matrix, Vector
from refine_geometry import _activate

SOURCE = Path(__file__).parent / 'sources/potted-plant-02'


def leaf_material():
    material = bpy.data.materials.new('Scanned syngonium thin cuticle')
    material.use_nodes = True
    n, l = material.node_tree.nodes, material.node_tree.links
    p = n.get('Principled BSDF')
    p.inputs['Roughness'].default_value = .48
    p.inputs['Subsurface Weight'].default_value = .045
    p.inputs['Subsurface Radius'].default_value = (.0004, .0008, .0002)
    p.inputs['Specular IOR Level'].default_value = .32
    uv = n.new('ShaderNodeAttribute'); uv.attribute_name = 'ScanCoordinates'
    def texture(suffix, data=False):
        node = n.new('ShaderNodeTexImage')
        node.image = bpy.data.images.load(str(SOURCE/'textures'/f'potted_plant_02_leaves_{suffix}'), check_existing=True)
        if data: node.image.colorspace_settings.name = 'Non-Color'
        l.new(uv.outputs['Vector'], node.inputs['Vector'])
        return node.outputs['Color']
    l.new(texture('diff_2k.jpg'), p.inputs['Base Color'])
    rough = n.new('ShaderNodeMapRange')
    rough.inputs['To Min'].default_value = .31; rough.inputs['To Max'].default_value = .62
    l.new(texture('rough_2k.jpg',True), rough.inputs[0]); l.new(rough.outputs[0],p.inputs['Roughness'])
    l.new(texture('alpha_2k.png',True),p.inputs['Alpha'])
    # Height is invariant under UV repacking; baking the source tangent normal
    # against a new atlas tangent frame would otherwise rotate the veins.
    bump = n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .32
    bump.inputs['Distance'].default_value = .0007
    l.new(texture('disp_2k.jpg',True),bump.inputs['Height']); l.new(bump.outputs[0],p.inputs['Normal'])
    return material


def refine_foliage(scene):
    for obj in list(scene.objects):
        if obj.name.startswith(('Plant_Leaf','Plant_Stem')):
            bpy.data.objects.remove(obj,do_unlink=True)
    before = set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE/'foliage.gltf'))
    imported = [o for o in scene.objects if o not in before and o.type=='MESH']
    assert len(imported)==1, 'The source must contain foliage only'
    obj=imported[0]; _activate(obj)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=.00001); bpy.ops.mesh.separate(type='LOOSE')
    bpy.ops.object.mode_set(mode='OBJECT')
    parts=list(bpy.context.selected_objects)
    stems=[o for o in parts if len(o.data.vertices)<150]
    blades=[o for o in parts if o not in stems]
    assert len(stems)==21 and len(blades)==21,(len(stems),len(blades))
    transform=(Matrix.Translation(Vector((-2.14,.15,1.18))) @
               Matrix.Rotation(-.22,4,'Z') @ Matrix.Diagonal((1.45,1.30,1.90,1)) @
               Matrix.Translation(Vector((0,0,-.304))))
    material=leaf_material()
    stem_points=[v.co.copy() for o in stems for v in o.data.vertices]
    for index,leaf in enumerate(blades):
        vertices=[v.co.copy()for v in leaf.data.vertices]
        base=min(vertices,key=lambda p:min((p-s).length_squared for s in stem_points))
        tip=max(vertices,key=lambda p:(p-base).length_squared)
        base,tip=transform@base,transform@tip
        leaf['leaf_base']=[base.x,base.z,-base.y]
        leaf['leaf_tip']=[tip.x,tip.z,-tip.y]
        leaf['leaf_phase']=index*2.3999632297
        leaf['leaf_flex']=.012+(index%5)*.0012
    for group,prefix in [(stems,'Plant_Stem_Scan'),(blades,'Plant_Leaf')]:
        for index,obj in enumerate(group):
            obj.name=('Plant_Leaf' if index==0 else 'Plant_Leaf.%03d'%index) if group is blades else prefix+('_%02d'%index)
            obj.data.transform(transform)
            obj['hero_atlas']='foliage';obj['surface_profile']='foliage'
            obj.data.materials.clear();obj.data.materials.append(material)
            for face in obj.data.polygons:face.use_smooth=True
            if obj in blades:
                _activate(obj)
                sub=obj.modifiers.new('Continuous blade curvature','SUBSURF');sub.levels=1;sub.render_levels=1
                bpy.ops.object.modifier_apply(modifier=sub.name)
            uv=obj.data.uv_layers.active
            attr=obj.data.attributes.new('ScanCoordinates','FLOAT_VECTOR','CORNER')
            for corner,value in zip(attr.data,uv.data):corner.vector=(*value.uv,0)
    return {'source':'Poly Haven / potted_plant_02 / CC0-1.0','blades':len(blades),
            'petioles':len(stems),'sourceUV':'ScanCoordinates','potAndSoil':'retained',
            'thickness':'thin alpha-tested blade; no inflated solidify shell'}
