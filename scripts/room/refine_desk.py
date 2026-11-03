"""Round 10: solid joinery, continuous back wall and oil-finished walnut.

Tabletop contact height and all prop/camera transforms remain fixed. Dimensions
are scene units, not a claim that the stylized room is a measured real interior.
"""
import bpy
from mathutils import Vector
from refine_geometry import _box, _mesh, _activate
from aging import Surface, age_wood


def repair_back_wall(scene, plaster):
    # Coplanar, overlapping piers caused z-fighting; the lower wall also ended
    # before the right return. One closed ring removes both failure modes.
    names = ('Window_WallBelow', 'Window_LeftPier', 'Window_RightPier',
             'Window_LeftReveal', 'Window_RightReturn', 'Window_Header')
    for name in names:
        bpy.data.objects.remove(scene.objects[name], do_unlink=True)
    outer = [(-3.675,-.265),(4.145,-.265),(4.145,4.40),(-3.675,4.40)]
    inner = [(-2.30,1.15),(1.80,1.15),(1.80,3.875),(-2.30,3.875)]
    vertices = [(x,y,z) for y in (1.04,1.20) for loop in (outer,inner) for x,z in loop]
    faces=[]
    for i in range(4):
        j=(i+1)%4
        faces += [(i,j,4+j,4+i),(8+i,12+i,12+j,8+j),
                  (i,8+i,8+j,j),(4+i,4+j,12+j,12+i)]
    wall=_mesh('Window_WallBelow',vertices,faces,plaster,scene)
    wall['wall_finish']=True
    _activate(wall)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    return {'closedRing':True,'aperture':[-2.30,1.80,1.15,3.875],
            'removedCoplanarPiers':6,'wallTriangles':32}


def walnut(image, axis='X'):
    m=bpy.data.materials.new('Oiled walnut / '+axis)
    m.use_nodes=True
    s=Surface(m)
    xyz=s.n.new('ShaderNodeSeparateXYZ');s.l.new(s.position,xyz.inputs[0])
    normal=s.n.new('ShaderNodeSeparateXYZ');s.l.new(s.geometry.outputs['Normal'],normal.inputs[0])
    # Keep the source grain at furniture scale rather than enlarging its
    # cathedral figure into wide, cloudy bands in the phone close-up.
    # Side grain follows thickness; short ends use a separate end-grain signal.
    across='Y' if axis=='X' else 'X'
    length=xyz.outputs[axis]
    if axis=='Z':across='X'
    side=s.math('ABSOLUTE',normal.outputs[across])
    cross=s.math('ADD',s.math('MULTIPLY',xyz.outputs[across],s.math('SUBTRACT',1,side)),
                 s.math('MULTIPLY',xyz.outputs['Z' if axis!='Z' else 'Y'],side))
    uv=s.n.new('ShaderNodeCombineXYZ')
    s.l.new(s.math('ADD',s.math('MULTIPLY',length,1/2.8),.43),uv.inputs['X'])
    s.l.new(s.math('ADD',s.math('MULTIPLY',cross,1/.95),.56),uv.inputs['Y'])
    tex=s.n.new('ShaderNodeTexImage');tex.image=image;tex.extension='REPEAT'
    s.l.new(uv.outputs[0],tex.inputs['Vector']);s.l.new(tex.outputs['Color'],s.p.inputs['Base Color'])
    # Independently sampled fine fibres provide real detail in the 4K bake.
    fibrecoords=s.n.new('ShaderNodeCombineXYZ')
    s.l.new(length,fibrecoords.inputs['X']);s.l.new(cross,fibrecoords.inputs['Y'])
    fine=s.noise(1,s.vector('MULTIPLY',fibrecoords.outputs[0],(4,310,1)))
    pore=s.ramp(fine,.55,.79)
    s.mix_color(s.math('MULTIPLY',pore,.13),(.30,.22,.14),'MULTIPLY')
    s.l.new(s.math('ADD',.38,s.math('MULTIPLY',fine,.10)),s.p.inputs['Roughness'])
    bump=s.n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.12;bump.inputs['Distance'].default_value=.00035
    s.l.new(fine,bump.inputs['Height']);s.l.new(bump.outputs[0],s.p.inputs['Normal'])
    # Saw-cut ends are slightly more porous and darker than longitudinal faces.
    end=s.math('ABSOLUTE',normal.outputs[axis])
    if axis!='Z':
        radial=s.vector('SUBTRACT',s.position,(-.3,0,.30) if axis=='X' else (3.12,0,.30))
        radial=s.vector('MULTIPLY',radial,(0,1,1.7) if axis=='X' else (1,0,1.7))
        rings=s.math('SINE',s.math('MULTIPLY',s.vector('LENGTH',radial),430))
        colour=s.n.new('ShaderNodeMixRGB')
        s.input(colour.inputs[0],s.math('ADD',.5,s.math('MULTIPLY',rings,.5)))
        colour.inputs[1].default_value=(.115,.062,.030,1)
        colour.inputs[2].default_value=(.145,.085,.046,1)
        mix=s.n.new('ShaderNodeMixRGB');s.input(mix.inputs[0],end)
        s.l.new(s.p.inputs['Base Color'].links[0].from_socket,mix.inputs[1])
        s.l.new(colour.outputs[0],mix.inputs[2]);s.l.new(mix.outputs[0],s.p.inputs['Base Color'])
    s.roughness(s.math('MULTIPLY',end,.10))
    if axis!='Z':
        age_wood(m)
        # Restrained broken wear along the front arris, not a uniform outline.
        edge=s.math('MULTIPLY',s.ramp(xyz.outputs['Z'],.670,.684),
                    s.ramp(xyz.outputs['Y' if axis=='X' else 'X'],-.946,-.925,1,0) if axis=='X'
                    else s.ramp(xyz.outputs['X'],4.010,4.018))
        wear=s.math('MULTIPLY',edge,s.ramp(s.noise(19),.38,.72))
        s.mix_color(s.math('MULTIPLY',wear,.10),(.31,.19,.09))
        s.roughness(s.math('MULTIPLY',wear,-.07))
    return m


def unwrap_desk(joined):
    """Give the visible worktops most of the existing 4K atlas.

    A box projection is continuous over each planar face and its bevels.
    The previous automatic pack put the top in a thin strip, despite leaving
    most of the atlas empty. More pixels across the grain preserve fibres
    without enlarging them or increasing the delivered texture dimensions.
    LightUV is copied from this layout by the shared baking pipeline.
    """
    mesh=joined.data
    points=[joined.matrix_world@v.co for v in mesh.vertices]
    normal_matrix=joined.matrix_world.to_3x3().inverted().transposed()
    charts={}
    for face in mesh.polygons:
        source=mesh.materials[face.material_index]['source_object']
        normal=normal_matrix@face.normal
        axis=max(range(3),key=lambda i:abs(normal[i]))
        key=(source,axis,1 if normal[axis]>0 else -1)
        chart=charts.setdefault(key,{'faces':[],'axes':[i for i in range(3) if i!=axis]})
        chart['faces'].append(face)
    for key,chart in charts.items():
        vertices={index for face in chart['faces'] for index in face.vertices}
        axes=chart['axes']
        low=[min(points[i][a] for i in vertices) for a in axes]
        high=[max(points[i][a] for i in vertices) for a in axes]
        size=[b-a for a,b in zip(low,high)]
        if size[1]>size[0]:
            axes.reverse();low.reverse();size.reverse()
        chart.update(low=low,size=size)
    # Wide allocations keep the critical across-grain texel density high.
    slots={('Desk_Top',2,1):(.008,.532,.984,.460),
           ('Desk_Return',2,1):(.008,.272,.604,.244),
           ('Desk_Top',2,-1):(.624,.392,.368,.117),
           ('Desk_Return',2,-1):(.624,.272,.230,.104)}
    remaining=sorted((key for key in charts if key not in slots),
                     key=lambda key:(-charts[key]['size'][1],-charts[key]['size'][0],key))
    # Smaller support and edge charts occupy a separate lower band. Each
    # chart has a 14 px gutter on all sides, wider than the 12 px bake margin.
    padding=14/4096
    scale=.30
    while True:
        rows=[];packed={}
        for key in remaining:
            width,height=[max(4/4096,value*scale)+2*padding for value in charts[key]['size']]
            row=next((row for row in rows if height<=row['height'] and row['x']+width<=.984),None)
            if row is None:
                y=sum(row['height'] for row in rows)
                if width>.984 or y+height>.244:
                    break
                row={'x':0.,'y':y,'height':height};rows.append(row)
            packed[key]=(.008+row['x']+padding,.008+row['y']+padding,
                         width-2*padding,height-2*padding)
            row['x']+=width
        else:
            slots.update(packed);break
        scale*=.94
        if scale<.002:
            raise ValueError('Desk face charts cannot fit their reserved atlas band')
    uv=mesh.uv_layers.active or mesh.uv_layers.new(name='MaterialUV')
    for key,chart in charts.items():
        x,y,width,height=slots[key]
        for face in chart['faces']:
            for loop in face.loop_indices:
                p=points[mesh.loops[loop].vertex_index]
                u,v=[(p[a]-low)/size for a,low,size in zip(chart['axes'],chart['low'],chart['size'])]
                uv.data[loop].uv=(x+u*width,y+v*height)
    return {'charts':len(charts),'topPixels':[4030,1884],
            'returnPixels':[2474,999],'textureSize':4096,'gutterPixels':14}


def refine_desk(scene, image):
    mats={axis:walnut(image,axis) for axis in ('X','Y','Z')}
    # Keep the main work surface and contact height. The return is a usable
    # side desk rather than a narrow tail: its back clears the room's right
    # wall and its front reaches the keyboard/mouse working position.
    for name,center,size,axis in (
        ('Desk_Top',(-.25,-.0125,.6525),(5.9,1.875,.065),'X'),
        ('Desk_Return',(3.36,-.5375,.6525),(1.32,2.925,.065),'Y')):
        original=scene.objects[name]
        replacement=_box('Desk replacement',center,size,mats[axis],scene,bevel=.005,segments=4)
        replacement.data.transform(original.matrix_world.inverted()@replacement.matrix_world)
        original.data=replacement.data;bpy.data.objects.remove(replacement,do_unlink=True)
        original['desk_finish']=True
    # Six floor-to-top supports follow the actual L perimeter. In particular,
    # the extended front end has two legs; no leg sits beneath the keyboard or
    # crosses the seat's knee space at the inside edge of the return.
    for obj in list(scene.objects):
        if obj.name.startswith(('Desk_Leg','Desk_Apron_')):
            bpy.data.objects.remove(obj,do_unlink=True)
    feet=[('LeftFront',-2.70,-.80),('LeftBack',-2.70,.65),
          ('InsideCorner',2.58,-.80),('RightBack',3.86,.65),
          ('ReturnOuter',3.86,-1.84),('ReturnInner',2.84,-1.84)]
    for name,x,y in feet:
        obj=_box('Desk_Leg_'+name,(x,y,.1775),(.115,.115,.885),mats['Z'],scene,bevel=.004,segments=3)
        obj['desk_finish']=True
    # Perimeter rails carry the slabs. The small cleats at the shared seam sit
    # directly beneath the top, instead of a deep rail across the knee space.
    rails=[('Front',(-.06,-.80,.565),(5.28,.075,.11),'X'),
           ('Back',(.58,.65,.565),(6.56,.075,.11),'X'),
           ('Left',(-2.70,-.075,.565),(.075,1.45,.11),'Y'),
           ('ReturnOuter',(3.86,-.595,.565),(.075,2.49,.11),'Y'),
           ('ReturnInner',(2.84,-1.455,.585),(.065,.77,.07),'Y'),
           ('ReturnFront',(3.35,-1.84,.565),(1.02,.075,.11),'X'),
           ('JointFront',(2.70,-.65,.599),(.38,.16,.042),'X'),
           ('JointBack',(2.70,.50,.599),(.38,.16,.042),'X')]
    for name,center,size,axis in rails:
        obj=_box('Desk_Apron_'+name,center,size,mats[axis],scene,bevel=.003,segments=3)
        obj['desk_finish']=True
    # Keep the landing and desk joint explicit for asset-validation reports.
    assert abs(2.7 + 1.32 - 4.02) < 1e-9
    assert all(not (2.7 <= x <= 4.0 and -1.7 <= y <= -.2) for _,x,y in feet)
    # The existing pot's unglazed foot was .005 above the table. Extend only
    # that underside: foliage, rim, pot transform and animation pivots stay put.
    pot=scene.objects['Plant_Pot'];inv=pot.matrix_world.inverted()
    for v in pot.data.vertices:
        p=pot.matrix_world@v.co
        if p.z<.691:p.z=.685;v.co=inv@p
    return {'top':.685,'underside':.620,'thickness':.065,'floor':-.265,
            'height':.950,'grainWidth':2.8,'grainDepth':.95,'supports':len(feet),'aprons':len(rails),'potFootGap':0,
            'returnBounds':[[2.70,-2.00,.620],[4.02,.925,.685]],'rightWallGap':.105,
            'returnKneeSpaceClear':True,
            'propTransformsChanged':False,'cameraChanged':False}
