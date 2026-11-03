"""Weighted linen drape inside the existing two curtain silhouettes.

The hanging height, width and object transforms stay fixed. A closed, thin cloth shell
has turned side hems and a heavier lower hem, without a runtime simulation.
"""
import math

_SEGMENTS = 64
_ROWS = 57
_HANGERS = {
    'Left': (.035, .164, .325, .483, .663, .825, .970),
    'Right': (.030, .188, .351, .516, .684, .851, .970),
}
# Unequal gathered pleats: narrow recesses between broad cloth faces.
_PROFILES = {
    'Left': ((0, .12), (.08, -.42), (.17, .22), (.24, .37),
             (.33, -.70), (.44, .48), (.54, .32), (.64, -.50),
             (.75, .22), (.88, -.29), (1, .04)),
    'Right': ((0, .10), (.10, -.58), (.20, .40), (.30, .47),
              (.37, -.73), (.47, .34), (.62, .18), (.71, -.43),
              (.86, .20), (1, .08)),
}
# The cloth does not carry every small header gather to the floor. Unequal
# sideward release leaves broad, slightly inclined faces between deep creases;
# the previous two sinusoidal profiles kept three cylindrical ribs all the way
# down the panel, especially obvious behind the phone and cassette stack.
_MIDDLE_PROFILES = {
    'Left': ((0, .12), (.12, -.38), (.25, -.21), (.37, .38),
             (.47, -.60), (.58, -.35), (.73, .31), (.89, -.16), (1, .04)),
    'Right': ((0, .10), (.14, -.43), (.28, -.20), (.39, .44),
              (.51, .28), (.61, -.59), (.74, -.26), (.89, .18), (1, .08)),
}
# The weighted lower cloth opens into fewer, unequal folds. Sharing the top
# section all the way down made the curtains read as an extruded moulding.
_LOWER_PROFILES = {
    'Left': ((0, .12), (.15, -.29), (.29, -.17), (.42, .27),
             (.55, -.44), (.67, -.30), (.81, .18), (.94, -.08), (1, .04)),
    'Right': ((0, .10), (.18, -.26), (.31, -.14), (.45, .34),
              (.57, .24), (.69, -.40), (.81, -.20), (.94, .10), (1, .08)),
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
    # Resolve the turned lower edge independently of the metre-long drape.
    # A uniform 10 cm grid skipped the entire 45 mm hem and rounded it into
    # a thick scallop, despite the material describing thin woven cloth.
    heights = [0., .006, .013, .024, .036, .044, .050, .059, .075, .10]
    heights += [.13+(height-.13)*i/(_ROWS-11) for i in range(_ROWS-10)]
    for row, elevation in enumerate(heights):
        v = elevation/height
        down = 1-v
        release = _smooth(down/.18)
        # Gravity keeps the long folds nearly vertical. Small differential
        # relaxation and an inward selvedge give them unequal widths below.
        inset = width*release*(.018 + .050*math.sin(math.pi*down)**2)
        for col in range(_SEGMENTS+1):
            u = col/_SEGMENTS
            x = low[0]+inset+(width-2*inset)*u
            shear = math.sin(math.pi*u)*release*(
                .070*math.sin(down*3.1+phase)*math.sin(math.pi*down*.75)
                + .028*math.sin(u*5.4+down*3.8+phase)*down)
            cloth_u = u+shear
            # Adjacent gathers release at different heights. A single global
            # blend kept all folds opening in parallel like an extrusion.
            opening = _smooth((down-.08+.065*math.sin(u*7.3+phase))/.52)
            lower_release = _smooth((down-.48+.045*math.sin(u*6.1+phase))/.52)
            upper_fold = _sample(_PROFILES[side], cloth_u, True)
            middle_fold = _sample(_MIDDLE_PROFILES[side], cloth_u, True)
            lower_fold = _sample(_LOWER_PROFILES[side], cloth_u, True)
            fold = upper_fold*(1-opening)+middle_fold*opening
            fold = fold*(1-lower_release)+lower_fold*lower_release
            # Broad faces open with the weight of the lower hem. Secondary
            # creases fade vertically instead of becoming uniform ridges.
            fullness = (.34+.66*_smooth(down/.075))*(.96-.25*down)
            fullness *= .91+.13*math.sin(u*8.7+phase+down*2.4)
            fine = .065*math.sin(cloth_u*math.tau*6.4+phase+down*.9)
            fine *= (.25+.75*math.exp(-down*4)) * math.sin(math.pi*u)
            sag = .020*math.sin(math.pi*down)*math.sin(u*6+phase)
            y = center+depth*(fold*fullness+fine)+sag
            # Two broad tension patches draw only part of a fold sideways.
            # They are tied to the hanging and sewn edges, not repeating wind
            # waves or surface noise laid across the whole curtain.
            for start,level,span,amount in ((.31,.28,.15,.012),(.76,.67,.19,-.010)):
                center_u=start+.13*(down-level)
                shoulder=math.exp(-((u-center_u)/.15)**2)
                y += amount*shoulder*math.exp(-((down-level)/span)**2)*math.sin(math.pi*u)
            # A few local, tapering tension creases interrupt the uninterrupted
            # vertical highlights. Their centres drift with gravity instead of
            # adding a repeated corrugation across every cloth face.
            for start, amplitude, begin, end in ((.24,.032,.0,.58),
                                                (.53,-.026,.10,.87),
                                                (.79,.019,.34,1.04)):
                progress = (down-begin)/(end-begin)
                if 0 < progress < 1:
                    drift = start+.055*math.sin(down*2.6+phase+start*3)
                    spread = .024+.018*progress
                    across = (u-drift)/spread
                    crease = math.exp(-across**2)-.32*math.exp(-((across-1.3)/1.3)**2)
                    fade = math.sin(math.pi*progress)**1.2
                    y += amplitude*crease*fade*math.sin(math.pi*u)
            # Turned side edges and a soft 45 mm bottom hem. Its outward roll
            # is local to the edge, not an extra cylinder laid over the cloth.
            edge = math.exp(-(u*width/.015)**2)+math.exp(-((1-u)*width/.015)**2)
            bottom = math.exp(-((elevation-.012)/.014)**2)
            hem_seam = math.exp(-((elevation-.046)/.0075)**2)
            # A rounded turn below a shallow sewing trough catches a short,
            # interrupted shadow. Broad puckering varies along the sewn edge;
            # there is no rigid rod or constant-height scallop beneath it.
            hem_pucker = math.sin(u*math.tau*4.3+phase)*math.sin(math.pi*u)
            hem_relax = math.exp(-((elevation-.055)/.065)**2)
            y += release*(.005*edge-.0055*bottom+.0034*hem_seam
                          +.003*hem_pucker*hem_relax)
            # A sewn selvedge has slightly different tension from the cloth
            # face. Its long, unequal puckers terminate before the header;
            # unlike extra periodic pleats they do not corrugate the panel.
            selvedge=math.exp(-(u/.075)**2)-.7*math.exp(-((1-u)/.065)**2)
            y += .0045*selvedge*math.sin(math.pi*down)*math.sin(down*11+phase)
            # Narrow sewn returns receive a shallow channel, with a small
            # amount of local take-up instead of a perfectly straight seam.
            seam_u=.022+.003*math.sin(down*13+phase)
            stitched=math.exp(-((u-seam_u)/.012)**2)+math.exp(-((1-u-seam_u)/.012)**2)
            y += .0018*stitched*release
            # Continue the same gathered folds to the hanging edge. Blending
            # from the old coarse four-wave header created pinched ridges and
            # square self-shadow marks when the full-height poster exposed it.
            hem_lift = .004*(1+math.sin(u*math.tau*2.1+phase))+.003*math.sin(u*5+phase)**2
            z = low[2]+height*v+hem_lift*down**10
            for left,right in zip(_HANGERS[side],_HANGERS[side][1:]):
                if left < u < right:
                    # A few millimetres of header sag between actual supports,
                    # tapering out before it can turn into an artificial wave.
                    z -= .006*math.sin(math.pi*(u-left)/(right-left))**2*math.exp(-down*24)
                    break
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
                    uv.data[index].uv=(slot+.008+(col+u*.75)*.0093,.004+(row+v*.65)*.009)
        mesh.update(calc_edges=True);obj.data=mesh
        header=vertices[(_ROWS-1)*(_SEGMENTS+1):_ROWS*(_SEGMENTS+1)]
        hangers=[]
        for u in _HANGERS[side]:
            position=u*_SEGMENTS;index=min(_SEGMENTS-1,int(position));blend=position-index
            hangers.extend(header[index][a]*(1-blend)+header[index+1][a]*blend for a in range(3))
        # The hardware samples these exact cloth points after all room
        # transforms, avoiding the former 1–2 cm gap behind several hooks.
        obj['curtain_hangers']=hangers
        if old.users==0:bpy.data.meshes.remove(old)
        world=[tuple(obj.matrix_world@Vector(p)) for p in vertices]
        minimum,maximum=_bounds(world)
        audit[obj.name]={'vertices':len(vertices),'faces':len(faces),
            'rows':_ROWS,'segments':_SEGMENTS,'closedShell':True,
            'clothThickness':.0014,'hemThickness':.003,'hemHeight':.048,
            'connectedHangers':len(_HANGERS[side]),'profileLevels':3,
            'worldMin':minimum,'worldMax':maximum}
    return audit


def linen_material():
    """Soft, fine cloth variation; the runtime supplies the fibre sheen.

    Individual threads are below the delivered atlas's useful resolution.
    Keep their relief subtle instead of enlarging them into visible ridges.
    """
    import bpy
    material=bpy.data.materials.new('Warm woven linen')
    material.use_nodes=True
    nodes,links=material.node_tree.nodes,material.node_tree.links
    shader=nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value=.82
    shader.inputs['Sheen Weight'].default_value=.32
    shader.inputs['Sheen Roughness'].default_value=.75
    geometry=nodes.new('ShaderNodeNewGeometry')
    yarn=nodes.new('ShaderNodeTexNoise')
    # World-space scale stays consistent across both curtains. The old 95:3
    # axis ratio stretched the surface grain into coarse vertical streaks.
    yarn.inputs['Scale'].default_value=185;yarn.inputs['Detail'].default_value=0
    links.new(geometry.outputs['Position'],yarn.inputs['Vector'])
    pigment=nodes.new('ShaderNodeValToRGB')
    # Keep the warm beige midpoint; fine yarn variation stays below 4 percent.
    pigment.color_ramp.elements[0].color=(.346,.301,.236,1)
    pigment.color_ramp.elements[1].color=(.374,.324,.253,1)
    links.new(yarn.outputs['Fac'],pigment.inputs[0])
    links.new(pigment.outputs[0],shader.inputs['Base Color'])
    rough=nodes.new('ShaderNodeMapRange')
    rough.inputs['To Min'].default_value=.77;rough.inputs['To Max'].default_value=.87
    links.new(yarn.outputs['Fac'],rough.inputs['Value'])
    links.new(rough.outputs['Result'],shader.inputs['Roughness'])
    bump=nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value=.09;bump.inputs['Distance'].default_value=.00012
    links.new(yarn.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs[0],shader.inputs['Normal'])
    return material
