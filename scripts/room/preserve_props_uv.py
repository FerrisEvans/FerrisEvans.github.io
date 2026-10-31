"""Keep the pre-desk-edit prop charts without storing another GLB snapshot.

Unwrap a disposable copy of the previous prop set before the desk is refined.
Removing its legs/aprons later must not reallocate the CRT, plant and PC charts.
Joining preserves polygon loop order; material slots retain object identity.
"""
import bpy


def preserve_props_uv(scene):
    excluded={'CRT_Screen','Computer_Screen','VCR_Display','Window_Backdrop','City_Backdrop'}
    objects=[o for o in scene.objects if o.type=='MESH' and o.name not in excluded
             and not o.get('surface_role') and not o.get('window_finish')
             and not o.name.startswith(('Room_','Window_','Curtain_','Desk_Top','Desk_Return','Lamp_'))]
    copies=[]
    for i,obj in enumerate(objects):
        clone=obj.copy();clone.data=obj.data.copy();scene.collection.objects.link(clone)
        transform=obj.matrix_world.copy();clone.parent=None;clone.matrix_world=transform
        material=bpy.data.materials.new('UV identity '+str(i));material['uv_source_index']=i
        clone.data.materials.clear();clone.data.materials.append(material)
        for face in clone.data.polygons:face.material_index=0
        copies.append(clone)
    bpy.ops.object.select_all(action='DESELECT')
    for clone in copies:clone.select_set(True)
    bpy.context.view_layer.objects.active=copies[0]
    bpy.ops.object.join();joined=bpy.context.object
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.1,island_margin=.012,area_weight=.5)
    bpy.ops.object.mode_set(mode='OBJECT')
    charts={i:[] for i in range(len(objects))}
    for face in joined.data.polygons:
        i=joined.data.materials[face.material_index]['uv_source_index']
        charts[i].append([joined.data.uv_layers.active.data[k].uv.copy() for k in face.loop_indices])
    for i,obj in enumerate(objects):
        if not obj.data.uv_layers:obj.data.uv_layers.new(name='MaterialUV')
        uv=obj.data.uv_layers.active
        uv.name='MaterialUV'
        assert len(charts[i])==len(obj.data.polygons),obj.name
        for face,points in zip(obj.data.polygons,charts[i]):
            assert len(face.loop_indices)==len(points)
            for k,point in zip(face.loop_indices,points):uv.data[k].uv=point
    bpy.data.objects.remove(joined,do_unlink=True)
    return {'meshes':len(objects),'source':'pre-desk-refinement prop layout'}
