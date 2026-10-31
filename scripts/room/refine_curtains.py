"""Weighted linen drape inside the existing two curtain silhouettes.

The hanging height, width and object transforms stay fixed. A closed, thin cloth shell
has turned side hems and a heavier lower hem, without a runtime simulation.
"""
import math

_SEGMENTS = 64
_ROWS = 41
# Unequal gathered pleats: narrow recesses between broad cloth faces.
_PROFILES = {
    'Left': ((0, .12), (.12, -.65), (.30, .54), (.43, -.72),
             (.68, .26), (.88, -.24), (1, .04)),
    'Right': ((0, .10), (.08, -.60), (.20, .70), (.34, -.75),
              (.57, .22), (.82, -.15), (1, .08)),
}


def _smooth(value):
    value = max(0., min(1., value))
    return value * value * (3 - 2 * value)


def _sample(points, x, smooth=False):
    if x <= points[0][0]:
        return points[0][1]
    for (a, start), (b, end) in zip(points, points[1:]):
        if x <= b:
            t = (x-a)/(b-a)
            # Cosine shoulders avoid the flat plateaus of smoothstep folds.
            if smooth:
                t = .5 - .5 * math.cos(math.pi*t)
            return start + (end-start)*t
    return points[-1][1]


def _bounds(vertices):
    return ([min(p[a] for p in vertices) for a in range(3)],
            [max(p[a] for p in vertices) for a in range(3)])


def _geometry(source, side):
    low, high = _bounds(source)
    # Clear the objects below the sill so the weighted hem remains visible.
    # The hanging edge stays fixed, and the window opening remains covered.
    original_top=high[2]
    low[2] = -.22
    high[2] = 4.075
    width, height = high[0]-low[0], high[2]-low[2]
    if min(width, height, high[1]-low[1]) <= 0:
        raise ValueError('Curtain needs a non-degenerate X/Z envelope')
    top = sorted((x, y) for x, y, z in source if abs(z-original_top) < height*1e-7)
    if len(top) < 2 or any(b[0] <= a[0] for a, b in zip(top, top[1:])):
        raise ValueError('Curtain needs an ordered hanging edge')
    phase = .45 if side == 'Left' else 1.7
    depth = (high[1]-low[1])*.5
    center = .64
    front, uvs, thickness = [], [], []
    for row in range(_ROWS):
        v = row/(_ROWS-1)
        down = 1-v
        release = _smooth(down/.18)
        # Gravity keeps the long folds nearly vertical. Small differential
        # relaxation and an inward selvedge give them unequal widths below.
        inset = width*release*(.018 + .050*math.sin(math.pi*down)**2)
        for col in range(_SEGMENTS+1):
            u = col/_SEGMENTS
            x = low[0]+inset+(width-2*inset)*u
            shear = math.sin(math.pi*u)*release*(
                .035*math.sin(down*3.4+phase) + .012*down*math.sin(u*8+phase))
            cloth_u = u+shear
            fold = _sample(_PROFILES[side], cloth_u, True)
            # Broad faces open with the weight of the lower hem. Secondary
            # creases fade vertically instead of becoming uniform ridges.
            fullness = (.34+.66*_smooth(down/.075))*(.96-.25*down)
            fine = .065*math.sin(cloth_u*math.tau*6.4+phase+down*.9)
            fine *= (.25+.75*math.exp(-down*4)) * math.sin(math.pi*u)
            sag = .020*math.sin(math.pi*down)*math.sin(u*6+phase)
            y = center+depth*(fold*fullness+fine)+sag
            # Turned side edges and a soft 45 mm bottom hem. Its outward roll
            # is local to the edge, not an extra cylinder laid over the cloth.
            edge = math.exp(-(u*width/.015)**2)+math.exp(-((1-u)*width/.015)**2)
            bottom = math.exp(-((v*height-.016)/.020)**2)
            y += release*(.008*edge-.007*bottom)
            # Continue the same gathered folds to the hanging edge. Blending
            # from the old coarse four-wave header created pinched ridges and
            # square self-shadow marks when the full-height poster exposed it.
            hem_lift = .012*(1+math.sin(u*math.tau*3.1+phase))+.006*math.sin(u*5+phase)**2
            z = low[2]+height*v+hem_lift*down**10
            front.append((x,y,z))
            uvs.append((u,v))
            thickness.append(.0014+.0016*max(edge,math.exp(-(v*height/.048)**4)))
    # Offset along the actual cloth normal, not a world-space extrusion.
    normals = []
    stride = _SEGMENTS+1
    for row in range(_ROWS):
        for col in range(stride):
            l=front[row*stride+max(0,col-1)]; r=front[row*stride+min(_SEGMENTS,col+1)]
            b=front[max(0,row-1)*stride+col]; t=front[min(_ROWS-1,row+1)*stride+col]
            a=[r[i]-l[i] for i in range(3)]; c=[t[i]-b[i] for i in range(3)]
            n=(a[1]*c[2]-a[2]*c[1],a[2]*c[0]-a[0]*c[2],a[0]*c[1]-a[1]*c[0])
            length=math.sqrt(sum(q*q for q in n))
            normals.append(tuple(q/length for q in n))
    vertices = list(front)
    vertices += [tuple(p[i]-n[i]*thick for i in range(3)) for p,n,thick in zip(front,normals,thickness)]
    count=len(front); faces=[]
    for row in range(_ROWS-1):
        for col in range(_SEGMENTS):
            a=row*stride+col
            face=(a,a+1,a+stride+1,a+stride)
            faces.append(face)
            faces.append(tuple(i+count for i in reversed(face)))
    # Consistent perimeter winding closes the real thin fabric edge.
    perimeter=list(range(stride))
    perimeter += [row*stride+_SEGMENTS for row in range(1,_ROWS)]
    perimeter += [(_ROWS-1)*stride+col for col in range(_SEGMENTS-1,-1,-1)]
    perimeter += [row*stride for row in range(_ROWS-2,0,-1)]
    for a,b in zip(perimeter,perimeter[1:]+perimeter[:1]):
        faces.append((b,a,a+count,b+count))
    return vertices,faces,uvs+uvs


def refine_curtains(scene):
    import bpy
    from mathutils import Vector
    audit={}
    for side in ('Left','Right'):
        obj=scene.objects.get('Curtain_'+side)
        if obj is None or obj.type!='MESH':
            raise ValueError('Missing curtain '+side)
        old=obj.data
        source=[tuple(v.co) for v in old.vertices]
        vertices,faces,uvs=_geometry(source,side)
        mesh=bpy.data.meshes.new(obj.name+' weighted linen shell')
        mesh.from_pydata(vertices,[],faces)
        for material in old.materials: mesh.materials.append(material)
        uv=mesh.uv_layers.new(name='ClothUV')
        body_faces=2*(_ROWS-1)*_SEGMENTS
        # Four uninterrupted front/back panels use almost the entire cloth
        # atlas. Smart-projecting the thin shell fragmented the lightmap into
        # tiny islands and made soft folds look like blocky plaster ridges.
        slot = 0 if side == 'Left' else .5
        for polygon in mesh.polygons:
            polygon.use_smooth=polygon.index<body_faces
            if polygon.index<body_faces:
                back=polygon.index%2
                for index in polygon.loop_indices:
                    u,v=uvs[mesh.loops[index].vertex_index]
                    uv.data[index].uv=(slot+back*.25+.012+u*.226,.05+v*.935)
            else:
                # Each rim quad gets its own small rectangular UV cell in the
                # bottom gutter, never bridging across front/back charts.
                edge=polygon.index-body_faces
                col,row=edge%52,edge//52
                for index,(u,v) in zip(polygon.loop_indices,((0,0),(1,0),(1,1),(0,1))):
                    uv.data[index].uv=(slot+.008+(col+u*.75)*.0093,.004+(row+v*.65)*.010)
        mesh.update(calc_edges=True);obj.data=mesh
        if old.users==0:bpy.data.meshes.remove(old)
        world=[tuple(obj.matrix_world@Vector(p)) for p in vertices]
        minimum,maximum=_bounds(world)
        audit[obj.name]={'vertices':len(vertices),'faces':len(faces),
            'rows':_ROWS,'segments':_SEGMENTS,'closedShell':True,
            'clothThickness':.0014,'hemThickness':.003,'hemHeight':.048,
            'worldMin':minimum,'worldMax':maximum}
    return audit


def linen_material():
    """Low-contrast yarn variation; the runtime supplies the fibre sheen."""
    import bpy
    material=bpy.data.materials.new('Warm woven linen')
    material.use_nodes=True
    nodes,links=material.node_tree.nodes,material.node_tree.links
    shader=nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value=.88
    shader.inputs['Sheen Weight'].default_value=.32
    shader.inputs['Sheen Roughness'].default_value=.75
    geometry=nodes.new('ShaderNodeNewGeometry')
    scale=nodes.new('ShaderNodeVectorMath');scale.operation='MULTIPLY'
    scale.inputs[1].default_value=(95,95,3)
    links.new(geometry.outputs['Position'],scale.inputs[0])
    yarn=nodes.new('ShaderNodeTexNoise')
    yarn.inputs['Scale'].default_value=3;yarn.inputs['Detail'].default_value=2
    links.new(scale.outputs[0],yarn.inputs['Vector'])
    pigment=nodes.new('ShaderNodeValToRGB')
    pigment.color_ramp.elements[0].color=(.345,.299,.232,1)
    pigment.color_ramp.elements[1].color=(.375,.326,.257,1)
    links.new(yarn.outputs['Fac'],pigment.inputs[0])
    links.new(pigment.outputs[0],shader.inputs['Base Color'])
    rough=nodes.new('ShaderNodeMapRange')
    rough.inputs['To Min'].default_value=.84;rough.inputs['To Max'].default_value=.92
    links.new(yarn.outputs['Fac'],rough.inputs['Value'])
    links.new(rough.outputs['Result'],shader.inputs['Roughness'])
    bump=nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value=.14;bump.inputs['Distance'].default_value=.00035
    links.new(yarn.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs[0],shader.inputs['Normal'])
    return material
