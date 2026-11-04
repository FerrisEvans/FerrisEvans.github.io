"""Shared Blender primitives for the original character and connecting terrain."""
# Geometry helpers preserve animation pivots while later merging static pieces.
def group(name, loc=(0,0,0), parent=None):
    obj=bpy.data.objects.new(name,None)
    bpy.context.collection.objects.link(obj)
    obj.location=loc
    bpy.context.view_layer.update()
    if parent:
        matrix=obj.matrix_world.copy();obj.parent=parent;obj.matrix_world=matrix
    return obj

def finish(obj,name,mat,parent=None,smooth=False):
    obj.name=name
    if mat: obj.data.materials.append(MATS[mat])
    if smooth and obj.type=='MESH':
        for p in obj.data.polygons:p.use_smooth=True
    if parent:
        bpy.context.view_layer.update()
        matrix=obj.matrix_world.copy();obj.parent=parent;obj.matrix_world=matrix
    obj['authored_for']='Weijin garden'
    return obj

def bevel(obj,w=.04,segments=3):
    if w<=0:return obj
    b=obj.modifiers.new('Soft toy edges','BEVEL');b.width=w;b.segments=segments
    b.affect='EDGES'
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.modifier_apply(modifier=b.name)
    for p in obj.data.polygons:p.use_smooth=True
    try:
        n=obj.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL');n.keep_sharp=True;n.weight=50
        bpy.ops.object.modifier_apply(modifier=n.name)
    except:pass
    return obj

def box(name,loc,size,mat,parent=None,w=.04,rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=bpy.context.object;o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if rot:o.rotation_euler=rot
    bevel(o,min(w,min(size)*.42))
    return finish(o,name,mat,parent)

def ellipsoid(name,loc,size,mat,parent=None,seg=20,rings=12,rot=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,radius=1,location=loc)
    o=bpy.context.object;o.scale=size
    if rot:o.rotation_euler=rot
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,mat,parent,True)

def cylinder(name,loc,r,depth,mat,parent=None,vertices=24,rot=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=loc)
    o=bpy.context.object
    if rot:o.rotation_euler=rot
    bevel(o,min(.035,r*.18,depth*.18),2)
    return finish(o,name,mat,parent,True)

def cone(name,loc,r1,r2,depth,mat,parent=None,vertices=20,rot=None):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r1,radius2=r2,depth=depth,location=loc)
    o=bpy.context.object
    if rot:o.rotation_euler=rot
    bevel(o,.025,2)
    return finish(o,name,mat,parent,True)

def tube(name,pts,r,mat,parent=None,res=3):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=8
    c.bevel_depth=r;c.bevel_resolution=res;c.resolution_u=8
    p=c.splines.new('BEZIER');p.bezier_points.add(len(pts)-1)
    for q,xyz in zip(p.bezier_points,pts):
        q.co=xyz;q.handle_left_type='AUTO';q.handle_right_type='AUTO'
    obj=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    bpy.ops.object.convert(target='MESH');obj.select_set(False)
    return finish(obj,name,mat,parent,True)

def torus(name,loc,r,t,mat,parent=None,rot=(math.pi/2,0,0),major=32):
    bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=t,major_segments=major,minor_segments=8,location=loc,rotation=rot)
    return finish(bpy.context.object,name,mat,parent,True)

def mesh(name,verts,faces,mat,parent=None,edge=0):
    m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update()
    o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o)
    if edge:bevel(o,edge,2)
    return finish(o,name,mat,parent)
