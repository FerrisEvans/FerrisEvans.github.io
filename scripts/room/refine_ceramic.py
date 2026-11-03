"""Authored hollow stoneware; runtime owns sipping and the separate liquid."""
import math
import bpy
from mathutils import Vector
from aging import Surface
from refine_geometry import _lathe, _replace, _activate


def _body_uv(body, profile, segments):
    """One continuous chart over the foot, outer wall, lip and inner wall.

    Smart projection split this smooth ceramic into four vertical charts.
    Their independently filtered irradiance made the cup look cracked. The
    only angular seam now faces the window, away from the viewing area.
    """
    coordinates=[];distance=0.
    for index,(radius,z) in enumerate(profile):
        if index:
            previous=profile[index-1]
            distance+=math.hypot(radius-previous[0],z-previous[1])
        if radius:
            coordinates.extend((((i-segments//4)%segments)/segments,distance)for i in range(segments))
        else:
            coordinates.append((None,distance))
    uv=body.data.uv_layers.new(name='MaterialUV')
    for face in body.data.polygons:
        chart=[coordinates[i]for i in face.vertices]
        angles=[u for u,_ in chart if u is not None]
        wrap=max(angles)-min(angles)>.5
        angles=[u+1 if wrap and u<.5 else u for u in angles]
        for loop,(u,v) in zip(face.loop_indices,chart):
            u=sum(angles)/len(angles) if u is None else u+1 if wrap and u<.5 else u
            uv.data[loop].uv=(math.tau*max(r for r,_ in profile)*u,v)


def _handle_uv(handle, path, segments):
    """Unroll the D-shaped handle instead of making short projection islands."""
    distance=[0.]
    for a,b in zip(path,path[1:]):distance.append(distance[-1]+(b-a).length)
    uv=handle.data.uv_layers.new(name='MaterialUV')
    side_count=(len(path)-1)*segments
    for face in handle.data.polygons:
        if face.index>=side_count:
            # The two attachment caps stay in small, separate charts.
            center=(.65,.04 if face.index==side_count else .10)
            for loop in face.loop_indices:
                angle=handle.data.loops[loop].vertex_index%segments*math.tau/segments
                uv.data[loop].uv=(center[0]+.019*math.cos(angle),center[1]+.019*math.sin(angle))
            continue
        around=[handle.data.loops[i].vertex_index%segments for i in face.loop_indices]
        wrap=max(around)-min(around)>segments/2
        for loop,j in zip(face.loop_indices,around):
            index=handle.data.loops[loop].vertex_index//segments
            if wrap and j==0:j=segments
            uv.data[loop].uv=(distance[index],math.tau*.019*j/segments)


def unwrap_ceramic(joined):
    """Pack cup, handle, flowerpot and foot at a common physical texel scale."""
    mesh=joined.data
    # The active join object is the pot foot, which has no UV layer. Blender
    # merges the cup's named layer but leaves it inactive in that case.
    uv=mesh.uv_layers.get('MaterialUV') or mesh.uv_layers.new(name='MaterialUV')
    for layer in list(mesh.uv_layers):
        if layer!=uv:mesh.uv_layers.remove(layer)
    mesh.uv_layers.active_index=0
    uv.active_render=True
    for name in ('Plant_Pot','Plant_Pot_Foot'):
        faces=[p for p in mesh.polygons if mesh.materials[p.material_index].get('source_object')==name]
        indices=sorted({i for face in faces for i in face.vertices})
        points={i:joined.matrix_world@mesh.vertices[i].co for i in indices}
        center=Vector(tuple((min(p[a]for p in points.values())+max(p[a]for p in points.values()))/2 for a in range(3)))
        # Both pots are authored lathes: consecutive equal-radius/equal-height
        # vertices form a profile ring. Use arc length, including the rolled
        # rim, so the visible wall never inherits a projection-chart seam.
        rings=[]
        for i in indices:
            p=points[i];radius=math.hypot(p.x-center.x,p.y-center.y)
            if not rings or abs(rings[-1]['radius']-radius)>1e-5 or abs(rings[-1]['z']-p.z)>1e-5:
                rings.append({'radius':radius,'z':p.z,'vertices':[]})
            rings[-1]['vertices'].append(i)
        coordinates={};distance=0.
        for index,ring in enumerate(rings):
            if index:
                previous=rings[index-1]
                distance+=math.hypot(ring['radius']-previous['radius'],ring['z']-previous['z'])
            for i in ring['vertices']:
                p=points[i]
                u=((math.atan2(p.y-center.y,p.x-center.x)-math.pi/2)/math.tau)%1 if ring['radius']>1e-5 else None
                coordinates[i]=(u,distance)
        circumference=math.tau*max(r['radius']for r in rings)
        for face in faces:
            chart=[coordinates[i]for i in face.vertices];angles=[u for u,_ in chart if u is not None]
            wrap=max(angles)-min(angles)>.5
            angles=[u+1 if wrap and u<.5 else u for u in angles]
            for loop,(u,v) in zip(face.loop_indices,chart):
                u=sum(angles)/len(angles) if u is None else u+1 if wrap and u<.5 else u
                uv.data[loop].uv=(u*circumference,v)
    _activate(joined)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True,scale=True,margin_method='FRACTION',margin=.018)
    bpy.ops.object.mode_set(mode='OBJECT')
    return {'continuousLatheCharts':3,'handleChart':'unrolled','marginFraction':.018,'angularSeams':'rear'}


def refine_ceramic(scene):
    material=bpy.data.materials.new('Warm glazed stoneware')
    material.use_nodes=True
    s=Surface(material)
    s.p.inputs['Base Color'].default_value=(.59,.62,.56,1)
    fine=s.noise(430)
    s.l.new(s.math('ADD',.16,s.math('MULTIPLY',fine,.10)),s.p.inputs['Roughness'])
    speckles=s.ramp(s.noise(650),.70,.82)
    s.mix_color(s.math('MULTIPLY',speckles,.24),(.12,.14,.11))
    bump=s.n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.10;bump.inputs['Distance'].default_value=.00012
    s.l.new(fine,bump.inputs['Height']);s.l.new(bump.outputs[0],s.p.inputs['Normal'])
    body=scene.objects['Mug_Body']
    bpy.context.view_layer.update()
    points=[body.matrix_world@v.co for v in body.data.vertices]
    bottom=min(p.z for p in points);top=max(p.z for p in points)
    center=Vector((sum((min(p[i] for p in points),max(p[i] for p in points)))/2 for i in range(3)))
    h=(top-bottom)/2
    # Continuous wall, rounded lip, subtle belly and a recessed foot.
    profile=[(0,-h+.005),(.095,-h+.005),(.103,-h),(.114,-h),
             (.120,-h+.007),(.124,-h+.024),(.131,-.05),(.134,.065),
             (.134,h-.010),(.133,h-.004),(.130,h),(.127,h),
             (.124,h-.004),(.123,h-.010),(.122,.08),(.115,-.10),
             (.109,-h+.019),(0,-h+.019)]
    body_segments=80
    vertices,faces=_lathe(profile,body_segments)
    inv=body.matrix_world.inverted()
    _replace(body,[inv@(center+Vector(p)) for p in vertices],faces,material)
    _body_uv(body,profile,body_segments)
    body['ceramic_finish']=True
    # The handle follows a continuous D curve with thicker attachment roots.
    handle=scene.objects['Mug_Handle'];inv=handle.matrix_world.inverted()
    control=[Vector((x,0,z)) for x,z in [(-.120,.098),(-.273,.127),(-.265,-.124),(-.119,-.090)]]
    path=[]
    for i in range(49):
        t=i/48;u=1-t
        path.append(center+control[0]*u**3+control[1]*3*u*u*t+control[2]*3*u*t*t+control[3]*t**3)
    vertices=[];faces=[];segments=16
    for i,p in enumerate(path):
        tangent=(path[min(i+1,48)]-path[max(i-1,0)]).normalized()
        across=Vector((0,1,0));radial=tangent.cross(across).normalized()
        t=i/48;radius=.0185+.004*(math.exp(-t*16)+math.exp(-(1-t)*16))
        for j in range(segments):
            angle=j*math.tau/segments
            vertices.append(inv@(p+across*math.cos(angle)*radius*.90+radial*math.sin(angle)*radius))
    for i in range(48):
        for j in range(segments):
            k=(j+1)%segments;faces.append((i*segments+j,i*segments+k,(i+1)*segments+k,(i+1)*segments+j))
    faces += [tuple(reversed(range(segments))),tuple(range(48*segments,49*segments))]
    _replace(handle,vertices,faces,material)
    _handle_uv(handle,path,segments)
    handle['ceramic_finish']=True
    # The runtime supplies the liquid. Keep the source preview below the lip
    # too, so neither previews nor the irradiance bake contain a floating lid.
    opening=scene.objects.get('Mug_Opening')
    if opening:
        opening.location.z-=.025
    for obj in (body,handle):
        _activate(obj);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
    return {'hollow':True,'outerRadius':.135,'innerRadius':.121,'top':top,'bottom':bottom,
            'continuousCeramicUV':True,'bodySeam':'rear','bodyRadialSegments':body_segments,
            'runtimePreservesGeometry':True,'sipAndLiquidUnchanged':True}
