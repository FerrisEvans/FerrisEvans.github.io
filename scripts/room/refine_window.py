"""Joinery and restrained shellac timber for the existing window opening.

Runs after retaining the old building UVs. Only window timber and its handle
are replaced; the surrounding walls and accepted cloth retain their charts.
"""
import bpy
from mathutils import Vector
from refine_geometry import _box, _replace, _activate, _tube
from aging import Surface

TIMBER_PREFIXES=('Window_Upright','Window_Rail','Window_Sill','Window_GlazingBead')

def window_material(horizontal,image):
    material=bpy.data.materials.new('Shellac walnut '+('horizontal' if horizontal else 'vertical'))
    material.use_nodes=True
    s=Surface(material)
    xyz=s.n.new('ShaderNodeSeparateXYZ');s.l.new(s.position,xyz.inputs[0])
    normal=s.n.new('ShaderNodeSeparateXYZ');s.l.new(s.geometry.outputs['Normal'],normal.inputs[0])
    along='X' if horizontal else 'Z';across='Z' if horizontal else 'X'
    # Use a narrow cut from the existing timber source at a consistent scale.
    # Front and rebate faces both follow the length of each rail or upright;
    # the latter sample depth instead of stretching a single edge texel.
    side=s.math('ABSOLUTE',normal.outputs[across])
    cross=s.math('ADD',s.math('MULTIPLY',xyz.outputs[across],s.math('SUBTRACT',1,side)),
                 s.math('MULTIPLY',xyz.outputs['Y'],side))
    uv=s.n.new('ShaderNodeCombineXYZ')
    s.l.new(s.math('ADD',s.math('MULTIPLY',xyz.outputs[along],1/3.2),.19),uv.inputs['X'])
    s.l.new(s.math('ADD',s.math('MULTIPLY',cross,1/.90),.34),uv.inputs['Y'])
    grain=s.n.new('ShaderNodeTexImage');grain.image=image;grain.extension='REPEAT'
    s.l.new(uv.outputs[0],grain.inputs['Vector']);s.l.new(grain.outputs['Color'],s.p.inputs['Base Color'])
    # A thin warm finish quiets the source contrast without hiding its fibres.
    s.mix_color(.24,(.20,.14,.077))
    height=s.n.new('ShaderNodeRGBToBW');s.l.new(grain.outputs['Color'],height.inputs[0])
    rough=s.n.new('ShaderNodeMapRange');rough.clamp=True
    rough.inputs['From Min'].default_value=.025;rough.inputs['From Max'].default_value=.25
    rough.inputs['To Min'].default_value=.44;rough.inputs['To Max'].default_value=.35
    s.l.new(height.outputs[0],rough.inputs['Value']);s.l.new(rough.outputs[0],s.p.inputs['Roughness'])
    bump=s.n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.12;bump.inputs['Distance'].default_value=.00015
    s.l.new(height.outputs[0],bump.inputs['Height']);s.l.new(bump.outputs[0],s.p.inputs['Normal'])
    # Saw-cut ends absorb more finish and do not carry long grain across them.
    end=s.math('ABSOLUTE',normal.outputs[along])
    s.mix_color(s.math('MULTIPLY',end,.72),(.115,.067,.032))
    s.roughness(s.math('MULTIPLY',end,.11))
    return material


def refine_window(scene,brass,image):
    bpy.context.view_layer.update()
    horizontal,vertical=window_material(True,image),window_material(False,image)
    names=[]
    def replace_sections(obj,sections,material,bevel=.002):
        vertices,faces=[],[]
        inverse=obj.matrix_world.inverted()
        for axis,start,end,center,profile in sections:
            offset=len(vertices);count=len(profile)
            for t in (start,end):
                for u,depth in profile:
                    p=(t,depth,center+u) if axis=='x' else (center+u,depth,t)
                    vertices.append(inverse@Vector(p))
            faces.append(tuple(offset+i for i in reversed(range(count))))
            faces.append(tuple(offset+count+i for i in range(count)))
            for i in range(count):
                j=(i+1)%count;faces.append((offset+i,offset+j,offset+count+j,offset+count+i))
        _replace(obj,vertices,faces,material,smooth=False)
        _activate(obj)
        # Geometry normals, including concave rebates, must point outwards.
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
        mod=obj.modifiers.new('Joinery eased edges','BEVEL');mod.width=bevel;mod.segments=3
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod=obj.modifiers.new('Joinery face normals','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=mod.name)
        obj['window_finish']=True;names.append(obj.name)
    def profile(half,front=.900,back=1.085):
        # Broad face, eased shoulder, recessed edge for the glass retaining bead.
        lip=min(.012,half*.22)
        return [(-half,back),(half,back),(half,front+.025),(half-lip,front+.025),(half-lip*1.6,front),(-half+lip*1.6,front),(-half+lip,front+.025),(-half,front+.025)]
    center=-.267;middle_half=.1425
    # The outer posts are centred at -2.25/1.75, with .10 width. Rails meet
    # their inner faces instead of cutting halfway through the visible posts.
    spans=[(-2.1985,center-middle_half-.0015),(center+middle_half+.0015,1.6985)]
    for obj in list(scene.objects):
        if obj.type!='MESH' or not obj.name.startswith(TIMBER_PREFIXES):continue
        points=[obj.matrix_world@v.co for v in obj.data.vertices]
        lo=Vector(tuple(min(p[i] for p in points) for i in range(3)));hi=Vector(tuple(max(p[i] for p in points) for i in range(3)))
        if obj.name.startswith('Window_Upright'):
            half=(hi.x-lo.x)/2;x=(hi.x+lo.x)/2
            replace_sections(obj,[('z',lo.z,hi.z,x,profile(half))],vertical)
        elif obj.name.startswith('Window_Rail'):
            z=(hi.z+lo.z)/2;half=(hi.z-lo.z)/2
            replace_sections(obj,[('x',a,b,z,profile(half,front=.907,back=1.08)) for a,b in spans],horizontal,.0018)
        elif obj.name.startswith('Window_GlazingBead_Horizontal'):
            z=(hi.z+lo.z)/2
            p=[(-.007,.922),(.007,.922),(.007,.906),(.003,.899),(-.007,.899)]
            replace_sections(obj,[('x',a,b,z,p) for a,b in spans],horizontal,.001)
        elif obj.name.startswith('Window_GlazingBead'):
            x=(hi.x+lo.x)/2
            p=[(-.007,.932),(.007,.932),(.007,.916),(.003,.909),(-.007,.909)]
            replace_sections(obj,[('z',1.247,2.910,x,p),('z',3.110,3.810,x,p)],vertical,.001)
        elif obj.name=='Window_Sill':
            # Bullnose and sloped landing replace the flat slab and hard front.
            p=[(-.040,1.075),(.031,1.075),(.037,.715),(.033,.658),(.022,.636),(.004,.636),(-.018,.654),(-.040,.680)]
            replace_sections(obj,[('x',-2.37,1.87,1.18,p)],horizontal,.003)
        elif obj.name=='Window_Sill_FrontBead':
            p=[(-.008,.671),(.008,.671),(.008,.651),(.003,.646),(-.008,.646)]
            replace_sections(obj,[('x',-2.345,1.845,1.164,p)],horizontal,.0015)
        else:
            # Retain the fine original sill joint, with the same dark material.
            obj['window_finish']=True;names.append(obj.name)
    # The original handle was an unsupported rod. Add a backplate and returns
    # to the same mesh, preserving its hotspot and object transform.
    handle=scene.objects['Window_Handle'];inverse=handle.matrix_world.inverted()
    path=[Vector((-.16,y,z)) for y,z in [(.899,2.722),(.873,2.722),(.850,2.737),(.850,2.871),(.873,2.886),(.899,2.886)]]
    vertices,faces=_tube(path,.009,12)
    _replace(handle,[inverse@v for v in vertices],faces,brass,smooth=True)
    plate=_box('Window_Handle_Backplate',(-.16,.903,2.804),(.040,.012,.205),brass,scene,bevel=.006)
    # Merge fixed hardware into the existing interactive handle.
    _activate(handle);plate.select_set(True);bpy.ops.object.join()
    handle['window_finish']=True;names.append(handle.name)
    return {'meshes':names,'grain':'longitudinal shellac walnut','grainLength':3.2,'joinGap':.003,'openingUnchanged':True}
