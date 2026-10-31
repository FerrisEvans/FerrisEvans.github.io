"""Authored hollow stoneware; runtime owns sipping and the separate liquid."""
import math
import bpy
from mathutils import Vector
from aging import Surface
from refine_geometry import _lathe, _replace, _activate


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
    vertices,faces=_lathe(profile,80)
    inv=body.matrix_world.inverted()
    _replace(body,[inv@(center+Vector(p)) for p in vertices],faces,material)
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
            'runtimePreservesGeometry':True,'sipAndLiquidUnchanged':True}
