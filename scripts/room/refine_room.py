"""Local construction corrections; keep the desk top, props and camera fixed."""
import bpy
from mathutils import Vector
from refine_geometry import _box


def refine_room(scene, plaster, wood, cloth, horizontal_oak, vertical_oak):
    # Side walls ended 3.8 m behind the back wall, masking the exterior obliquely.
    for name in ('Room_LeftWall','Room_RightWall'):
        obj=bpy.data.objects[name];inverse=obj.matrix_world.inverted()
        for vertex in obj.data.vertices:
            p=obj.matrix_world@vertex.co
            if p.y>1.2:p.y=1.2
            if p.z<.01:p.z=-.265
            vertex.co=inverse@p
    # Complete the lintel and the narrow gap between the left jamb and pier.
    _box('Window_Header',(.30,1.12,4.125),(7.8,.16,.60),plaster,scene,bevel=.003)
    _box('Window_LeftReveal',(-2.335,1.12,2.51),(.18,.16,2.72),plaster,scene,bevel=.002)
    _box('Window_RightReturn',(3.91,1.12,2.2),(.47,.16,4.4),plaster,scene,bevel=.002)
    _box('Room_Ceiling',(.30,-2.90,4.48),(7.95,8.20,.16),plaster,scene,bevel=0)
    # The greybox's oversized desk/CRT proportions made its 0.685-unit height
    # read as a low bench. A 0.95-unit desk height restores a useful leg space
    # without lifting the tabletop or breaking any animated prop contacts.
    floor=bpy.data.objects['Room_Floor'];floor.location.z-=.265
    inverse=floor.matrix_world.inverted()
    for vertex in floor.data.vertices:
        p=floor.matrix_world@vertex.co
        if p.y>1.2:p.y=1.2
        vertex.co=inverse@p
    for name in ('Window_WallBelow','Window_RightReturn'):
        obj=bpy.data.objects[name];inverse=obj.matrix_world.inverted()
        for vertex in obj.data.vertices:
            p=obj.matrix_world@vertex.co
            if p.z<.01:p.z=-.265
            vertex.co=inverse@p
    for obj in list(scene.objects):
        if obj.name.startswith('Desk_Leg'):
            inverse=obj.matrix_world.inverted()
            for vertex in obj.data.vertices:
                p=obj.matrix_world@vertex.co;p.z=-.265+(p.z/.565)*.840;vertex.co=inverse@p
    _box('Desk_Leg_ReturnFront',(3.60,-1.82,.155),(.11,.11,.84),wood,scene,bevel=.007)
    _box('Desk_Leg_ReturnBack',(3.60,.65,.155),(.11,.11,.84),wood,scene,bevel=.007)
    _box('Desk_Apron_Front',(0,-.78,.525),(5.4,.055,.10),wood,scene,bevel=.005)
    _box('Desk_Apron_Return',(3.59,-.59,.525),(.055,2.52,.10),wood,scene,bevel=.005)
    # The two slabs overlapped by half a metre at exactly the same height.
    # Meet at x=2.70 instead, retaining the return and all prop positions.
    top=bpy.data.objects['Desk_Top']
    replacement=_box('Temporary desk slab',(-.25,-.0125,.630),(5.9,1.875,.11),wood,scene,bevel=.018)
    replacement.data.transform(top.matrix_world.inverted()@replacement.matrix_world)
    top.data=replacement.data;bpy.data.objects.remove(replacement,do_unlink=True)
    # Give the perpendicular return the same timber at its actual board scale.
    return_wood=wood.copy();return_wood.name='Walnut return with longitudinal grain'
    n,l=return_wood.node_tree.nodes,return_wood.node_tree.links
    geometry=next(node for node in n if node.type=='NEW_GEOMETRY')
    old_links=list(geometry.outputs['Position'].links)
    axes=n.new('ShaderNodeSeparateXYZ');l.new(geometry.outputs['Position'],axes.inputs[0])
    def scaled(socket,scale,offset):
        node=n.new('ShaderNodeMath');node.operation='MULTIPLY_ADD';l.new(socket,node.inputs[0]);node.inputs[1].default_value=scale;node.inputs[2].default_value=offset;return node.outputs[0]
    coords=n.new('ShaderNodeCombineXYZ')
    l.new(scaled(axes.outputs['Y'],6.4/2.95,.55*6.4/2.95),coords.inputs['X'])
    l.new(scaled(axes.outputs['X'],1.875/1.1,-3.25*1.875/1.1-.0125),coords.inputs['Y'])
    l.new(axes.outputs['Z'],coords.inputs['Z'])
    for link in old_links:l.new(coords.outputs[0],link.to_socket)
    slab=bpy.data.objects['Desk_Return'];slab.data.materials.clear();slab.data.materials.append(return_wood)
    # Each timber follows its own length, including the horizontal sash beads.
    for obj in scene.objects:
        if obj.type=='MESH' and obj.name.startswith(('Window_Upright','Window_Rail','Window_Sill','Window_GlazingBead')):
            mat=horizontal_oak if obj.dimensions.x>obj.dimensions.z else vertical_oak
            obj.data.materials.clear();obj.data.materials.append(mat)
    return {'deskHeightAboveFloor':.950,'legGap':0,'returnSupports':2,'rearWallEnd':1.2}
