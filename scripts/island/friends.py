"""Reference-led plush friends for the garden.

Execute after geometry.py in the scene authoring namespace. Public factories:
    make_dog(name='Dog', loc=(0, 0, 0), scale=1, parent=None)
    make_rabbit(name='Rabbit', loc=(0, 0, 0), scale=1, parent=None)
Both return a root Empty, with soles at local Z=0 and front towards -Y.
The Body, Head, Ear_L/R, Arm_L/R, Leg_L/R and Tail Empties remain separate
through export; animated eyes also have Eye_L/R pivots. L/R are viewer left/right.
All cloth detail uses packed, glTF-compatible base-color/normal images. No hair
systems, Blender-only procedural shaders, external textures or runtime fur.
"""
import numpy as _fnp
from mathutils import Vector as _FVector


def _f_image(name, pixels, non_color=False):
    image = bpy.data.images.get(name)
    if image:
        return image
    h, w = pixels.shape[:2]
    image = bpy.data.images.new(name, width=w, height=h, alpha=True)
    image.colorspace_settings.name = 'Non-Color' if non_color else 'sRGB'
    image.pixels.foreach_set(pixels.astype(_fnp.float32).ravel())
    image.pack()
    return image


def _f_cloth_normal(kind):
    name = 'Friend_' + kind + '_normal'
    if bpy.data.images.get(name):
        return bpy.data.images[name]
    size = 256
    yy, xx = _fnp.mgrid[:size, :size] / size
    rng = _fnp.random.default_rng(431 if kind == 'Terry' else 57)
    if kind == 'Terry':
        # Irregular, closed thread loops: readable fabric without noisy silhouettes.
        wx = xx * 24 + .32 * _fnp.sin(yy * math.tau * 8) + .21 * _fnp.sin(xx * math.tau * 5 + yy * math.tau * 11)
        wy = yy * 24 + .28 * _fnp.sin(xx * math.tau * 7) + .18 * _fnp.sin(xx * math.tau * 9 - yy * math.tau * 6)
        d = _fnp.sqrt((_fnp.mod(wx, 1) - .5) ** 2 +
                      ((_fnp.mod(wy, 1) - .5) * 1.2) ** 2)
        height = _fnp.exp(-((d - .27) / .065) ** 2) * .65
        height += rng.random((size, size)) * .18
        strength = 1.8
    elif kind == 'Cord':
        height = .6 * _fnp.cos(xx * math.tau * 58)
        height += .06 * _fnp.sin(yy * math.tau * 80)
        strength = 1.2
    else:
        height = .20 * _fnp.sin(xx * math.tau * 70) + .20 * _fnp.sin(yy * math.tau * 70)
        height += .035 * rng.random((size, size))
        strength = .9
    dx = (_fnp.roll(height, -1, 1) - _fnp.roll(height, 1, 1)) * strength
    dy = (_fnp.roll(height, -1, 0) - _fnp.roll(height, 1, 0)) * strength
    normals = _fnp.stack((-dx, -dy, _fnp.ones_like(dx)), -1)
    normals /= _fnp.linalg.norm(normals, axis=-1, keepdims=True)
    rgba = _fnp.ones((size, size, 4), dtype=_fnp.float32)
    rgba[:, :, :3] = normals * .5 + .5
    return _f_image(name, rgba, True)


def _f_dress_image():
    name = 'Friend_Rabbit_floral_weave'
    if bpy.data.images.get(name):
        return bpy.data.images[name]
    n = 512
    yy, xx = _fnp.mgrid[:n, :n] / n
    rgba = _fnp.ones((n, n, 4), dtype=_fnp.float32)
    cloth = _fnp.array([.91, .875, .79])
    weave = .014 * _fnp.sin(xx * math.tau * 180) + .012 * _fnp.sin(yy * math.tau * 180)
    # Subtle alternate lace channels, intentionally not a second striped dress.
    lace = .025 * (_fnp.cos(xx * math.tau * 22) ** 12)
    rgba[:, :, :3] = cloth[None, None, :] + (weave + lace)[:, :, None]
    for row in range(6):
        for col in range(7):
            cx = (col + .35 + .33 * (row % 2)) / 7
            cy = (row + .5) / 6
            x, y = xx - cx, yy - cy
            # Tiny sprig with two leaves and an embroidered five-petal rose.
            stem = (abs(x + y * .27) < .0018) & (y < -.005) & (y > -.040)
            leaf1 = ((x + .010) / .012) ** 2 + ((y + .024) / .005) ** 2 < 1
            leaf2 = ((x - .009) / .010) ** 2 + ((y + .033) / .005) ** 2 < 1
            rgba[stem | leaf1 | leaf2, :3] = [.48, .54, .40]
            for k in range(5):
                a = math.tau * k / 5
                petal = ((x - .009 * math.cos(a)) / .009) ** 2 + ((y - .009 * math.sin(a)) / .011) ** 2 < 1
                rgba[petal, :3] = [.76, .53 + .018 * (row % 2), .49]
            centre = (x / .006) ** 2 + (y / .006) ** 2 < 1
            rgba[centre, :3] = [.65, .44, .31]
    return _f_image(name, _fnp.clip(rgba, 0, 1))


def _f_mat(key, color, roughness=.88, normal=None, strength=.3, gloss=False, floral=False):
    key = 'Friend_' + key
    if key in MATS:
        return key
    material = bpy.data.materials.new(key)
    material.use_nodes = True
    material.diffuse_color = (*rgb(color), 1)
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*rgb(color), 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Specular IOR Level'].default_value = .45 if gloss else .22
    shader.inputs['Coat Weight'].default_value = .48 if gloss else 0
    shader.inputs['Coat Roughness'].default_value = .12
    if normal:
        texture = material.node_tree.nodes.new('ShaderNodeTexImage')
        texture.name = 'Exportable woven normal'
        texture.image = _f_cloth_normal(normal)
        bump = material.node_tree.nodes.new('ShaderNodeNormalMap')
        bump.inputs['Strength'].default_value = strength
        material.node_tree.links.new(texture.outputs['Color'], bump.inputs['Color'])
        material.node_tree.links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    if floral:
        texture = material.node_tree.nodes.new('ShaderNodeTexImage')
        texture.image = _f_dress_image()
        material.node_tree.links.new(texture.outputs['Color'], shader.inputs['Base Color'])
    MATS[key] = material
    return key


def _f_palette():
    return {
        'fur': _f_mat('Dog_charcoal_terry', '#25272B', normal='Terry', strength=.40),
        'nose': _f_mat('Dog_woven_nose', '#34363B', normal='Weave', strength=.27),
        'seam': _f_mat('Dog_sewn_thread', '#24262A'),
        'brown': _f_mat('Warm_glass_iris', '#493629', .18, gloss=True),
        'black': _f_mat('Black_glass_pupil', '#13151A', .10, gloss=True),
        'shine': _f_mat('Glass_catchlight', '#FFF5DE', .20),
        'cream': _f_mat('Rabbit_ivory_plush', '#F2E8D2', normal='Terry', strength=.20),
        'inner': _f_mat('Rabbit_inner_ear', '#E8DBC2', normal='Weave', strength=.22),
        'pink': _f_mat('Rabbit_pink_nose', '#C58C82', normal='Cord', strength=.16),
        'stitch': _f_mat('Rabbit_face_stitches', '#907866'),
        'cord': _f_mat('Rabbit_brown_corduroy', '#805549', normal='Cord', strength=.34),
        'ribbon': _f_mat('Rabbit_brown_ribbon', '#966D59', normal='Weave', strength=.24),
        'dress': _f_mat('Rabbit_flower_dress', '#F0E4CE', normal='Weave', strength=.24, floral=True),
        'hem': _f_mat('Rabbit_hem_thread', '#DACCAF'),
        'button': _f_mat('Rabbit_ivory_button', '#DDD0A2', .48),
        'hole': _f_mat('Rabbit_button_hole', '#806E4A'),
    }


def _f_mesh(name, verts, faces, uv, mat, parent):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    uvs = data.uv_layers.new(name='UVMap')
    for polygon in data.polygons:
        polygon.use_smooth = True
        for loop in polygon.loop_indices:
            uvs.data[loop].uv = uv[data.loops[loop].vertex_index]
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    finish(obj, name, mat, parent, True)
    obj['original_geometry'] = 'Reference-led sewn plush surface'
    return obj


def _f_sphere(name, centre, radii, mat, parent, shape=None, segments=36, rings=22, fuzz=0):
    verts, faces, uv = [], [], []
    for j in range(rings + 1):
        t = math.pi * j / rings
        for i in range(segments + 1):
            p = math.tau * i / segments
            nx, ny, nz = math.sin(t) * math.cos(p), math.sin(t) * math.sin(p), math.cos(t)
            w = 1 + fuzz * math.sin(t) * math.sin(p * 13 + t * 17) * math.sin(p * 7 - t * 11)
            point = (radii[0] * nx * w, radii[1] * ny * w, radii[2] * nz * w)
            if shape:
                point = shape(*point)
            verts.append(tuple(centre[k] + point[k] for k in range(3)))
            uv.append((3 * i / segments, 2 * j / rings))
    for j in range(rings):
        for i in range(segments):
            a = j * (segments + 1) + i
            faces.append((a, a + segments + 1, a + segments + 2, a + 1))
    return _f_mesh(name, verts, faces, uv, mat, parent)


def _f_sweep(name, stations, mat, parent, sides=18, steps=4):
    """Soft tapered sewn volumes, stations=(x,y,z,halfwidth,halfdepth).

    A Catmull-Rom centreline creates drooping ears and narrow organic limbs.
    Cross section side axis follows the path while its front stays towards -Y.
    """
    points = []
    for k in range(len(stations) - 1):
        a = _fnp.array(stations[max(0, k - 1)])
        b = _fnp.array(stations[k])
        c = _fnp.array(stations[k + 1])
        d = _fnp.array(stations[min(len(stations) - 1, k + 2)])
        for n in range(steps):
            t = n / steps
            points.append(.5 * ((2 * b) + (-a + c) * t + (2*a - 5*b + 4*c - d)*t*t + (-a + 3*b - 3*c + d)*t*t*t))
    points.append(_fnp.array(stations[-1]))
    verts, faces, uv = [], [], []
    for j, row in enumerate(points):
        centre = _FVector(row[:3])
        tangent = _FVector(points[min(j+1, len(points)-1)][:3] - points[max(0, j-1)][:3]).normalized()
        front = _FVector((0, -1, 0))
        side = tangent.cross(front).normalized()
        front = side.cross(tangent).normalized()
        for i in range(sides + 1):
            angle = math.tau * i / sides
            v = centre + side * math.cos(angle) * max(.001, row[3]) + front * math.sin(angle) * max(.001, row[4])
            verts.append(tuple(v)); uv.append((3 * i / sides, 2 * j / (len(points) - 1)))
    for j in range(len(points)-1):
        for i in range(sides):
            a = j * (sides + 1) + i
            faces.append((a, a + sides + 1, a + sides + 2, a + 1))
    faces.append(tuple(range(sides-1, -1, -1)))
    faces.append(tuple((len(points)-1)*(sides+1)+i for i in range(sides)))
    return _f_mesh(name, verts, faces, uv, mat, parent)


def _f_line(name, points, radius, mat, parent):
    # Low bevel resolution keeps stitching affordable in the delivered mesh.
    # Dense sampled hems already describe a smooth curve; do not subdivide every
    # sample eight more times. This retains their exact silhouette with 1/8 faces.
    if len(points) > 16:
        data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D'
        data.bevel_depth=radius;data.bevel_resolution=1;data.use_fill_caps=True
        closed=points[0]==points[-1] or (_FVector(points[0])-_FVector(points[-1])).length < .00001
        samples=points[:-1] if closed else points
        path=data.splines.new('POLY');path.points.add(len(samples)-1)
        for point,xyz in zip(path.points,samples):
            point.co=(*xyz,1)
        path.use_cyclic_u=closed
        obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj)
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
        bpy.context.view_layer.objects.active=obj;bpy.ops.object.convert(target='MESH')
        obj.select_set(False)
        return finish(obj,name,mat,parent,True)
    return tube(name, points, radius, mat, parent, res=1)


def _f_eye(name, side, centre, size, palette, parent):
    pivot = group(name + '_Eye_' + side, centre, parent)
    x, y, z = centre
    ellipsoid(name + '_Iris_' + side, (x, y, z), (size, size*.42, size*1.09), palette['brown'], pivot, seg=24, rings=14)
    ellipsoid(name + '_Pupil_' + side, (x, y-size*.27, z+size*.015), (size*.89, size*.33, size*.98), palette['black'], pivot, seg=24, rings=14)
    ellipsoid(name + '_Catchlight_' + side, (x-size*.25, y-size*.60, z+size*.42), (size*.13, size*.035, size*.16), palette['shine'], pivot, seg=12, rings=8)
    ellipsoid(name + '_Pinlight_' + side, (x+size*.29, y-size*.60, z-size*.19), (size*.045, size*.025, size*.055), palette['shine'], pivot, seg=10, rings=6)
    return pivot


def _f_finish_root(root, loc, scale, parent, species, height):
    if parent:
        root.parent = parent
    root.location = loc
    root.scale = (scale, scale, scale)
    root['friend'] = species
    root['front_axis'] = '-Y'
    root['reference_style'] = 'Warm matte sewn plush, original user reference'
    root['unit_height'] = height
    return root


def _f_dog_face(name, p, parent):
    """One continuous sewn volume from the back of the skull to the nose tip.

    The fabric nose is a material region on the same welded surface, not a
    second oval laid over a snout sphere. Its join has continuous normals and
    profile tangents, including in the overhead view.
    """
    # y, centre-z, half-width, half-height. Last stations close the soft nose.
    control=[(.49,1.91,.002,.002),(.44,1.91,.25,.27),(.31,1.92,.45,.42),
        (.10,1.92,.565,.48),(-.10,1.89,.555,.47),(-.28,1.85,.505,.415),
        (-.44,1.81,.445,.36),(-.58,1.79,.387,.317),(-.69,1.79,.355,.29),
        (-.77,1.79,.33,.27),(-.85,1.79,.27,.225),(-.905,1.79,.17,.145),
        (-.935,1.79,.002,.002)]
    rows=[]
    for k in range(len(control)-1):
        a=_fnp.array(control[max(0,k-1)]);b=_fnp.array(control[k])
        c=_fnp.array(control[k+1]);d=_fnp.array(control[min(len(control)-1,k+2)])
        for j in range(4):
            t=j/4
            rows.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
    rows.append(_fnp.array(control[-1]))
    seg=48;verts=[];uv=[];faces=[]
    for j,(y,z,rx,rz) in enumerate(rows):
        for i in range(seg+1):
            a=math.tau*i/seg
            verts.append((max(.001,rx)*math.cos(a),y,z+max(.001,rz)*math.sin(a)))
            uv.append((i/seg*3,j/(len(rows)-1)*2))
    for j in range(len(rows)-1):
        for i in range(seg):
            a=j*(seg+1)+i
            faces.append((a,a+1,a+seg+2,a+seg+1))
    faces.extend([tuple(range(seg-1,-1,-1)),tuple((len(rows)-1)*(seg+1)+i for i in range(seg))])
    obj=_f_mesh(name+'_HeadCloth',verts,faces,uv,p['fur'],parent)
    obj.data.materials.append(MATS[p['nose']])
    for polygon in obj.data.polygons:
        if polygon.center.y < -.69:
            polygon.material_index=1
            # The nose is cut from ordinary woven cloth, not concentric rings.
            # Give that material its own planar UVs while retaining shared
            # geometric positions and smooth normals at the sewn join.
            for loop in polygon.loop_indices:
                vertex=obj.data.vertices[obj.data.loops[loop].vertex_index].co
                obj.data.uv_layers.active.data[loop].uv=(vertex.x/.75+.5,(vertex.z-1.5)/.60)
    obj['nose_construction']='Single continuous head/snout surface; inset cloth material zone, no stacked plates'
    # A faint sewn join follows the exact shared ring, with no raised rim.
    seam=[(.355*math.cos(math.tau*i/64),-.6905,1.79+.29*math.sin(math.tau*i/64)) for i in range(65)]
    _f_line(name+'_NoseStitch',seam,.0018,p['seam'],parent)
    return obj


def make_dog(name='Dog', loc=(0, 0, 0), scale=1, parent=None):
    p = _f_palette()
    root = group(name)
    body = group(name + '_Body', (0, 0, .90), root)
    _f_sweep(name + '_Torso', [(0,.035,.57,.08,.07), (0,.035,.75,.19,.145), (0,.025,1.08,.22,.16),
        (0,.01,1.36,.19,.14), (0,0,1.52,.105,.09)], p['fur'], body, sides=24)
    # Deliberately slender limbs and flared soft paws, as in the source toy.
    for side, sign in [('L', -1), ('R', 1)]:
        arm = group(name + '_Arm_' + side, (sign*.19, .015, 1.29), body)
        _f_sweep(name + '_ArmCloth_' + side, [(sign*.12,.015,1.36,.025,.025),(sign*.18,.015,1.30,.075,.065),
            (sign*.28,-.005,1.15,.085,.07), (sign*.34,-.04,.92,.07,.065),
            (sign*.39,-.075,.74,.075,.065), (sign*.395,-.095,.65,.09,.074),
            (sign*.395,-.10,.60,.10,.078),(sign*.395,-.10,.55,.08,.063),
            (sign*.395,-.10,.52,.045,.036),(sign*.395,-.10,.51,.002,.002)], p['fur'], arm)
        leg = group(name + '_Leg_' + side, (sign*.13,.015,.67), body)
        _f_sweep(name + '_LegCloth_' + side, [(sign*.08,.015,.77,.025,.025),(sign*.13,.015,.69,.075,.075),
            (sign*.15,.018,.49,.065,.065), (sign*.17,-.005,.23,.075,.075),
            (sign*.19,-.04,.16,.10,.11),(sign*.19,-.075,.10,.115,.15),
            (sign*.19,-.09,.06,.105,.145),(sign*.19,-.09,.025,.075,.105),
            (sign*.19,-.09,.007,.02,.025),(sign*.19,-.09,.005,.001,.001)], p['fur'], leg)
        _f_line(name+'_PawSeam_'+side, [(sign*.255,-.18,.067), (sign*.19,-.225,.063), (sign*.135,-.18,.067)], .0025, p['seam'], leg)
    tail = group(name + '_Tail', (0,.15,.78), body)
    _f_sweep(name + '_TailCloth', [(0,.14,.78,.045,.045), (.025,.29,.72,.075,.07),
        (.03,.43,.76,.07,.07), (.025,.50,.85,.055,.055), (0,.48,.91,.002,.002)], p['fur'], tail)
    head = group(name + '_Head', (0,0,1.48), body)
    _f_dog_face(name,p,head)
    _f_eye(name, 'L', (-.368,-.417,2.02), .135, p, head)
    _f_eye(name, 'R', (.368,-.417,2.02), .135, p, head)
    for side, sign in [('L', -1), ('R', 1)]:
        ear = group(name + '_Ear_' + side, (sign*.46,.005,2.12), head)
        _f_sweep(name+'_EarCloth_'+side, [(sign*.44,.01,2.16,.04,.045),
            (sign*.57,-.035,2.055,.17,.09), (sign*.64,-.065,1.87,.205,.095),
            (sign*.67,-.10,1.63,.18,.085), (sign*.65,-.15,1.43,.13,.075),
            (sign*.61,-.17,1.35,.06,.04),(sign*.60,-.17,1.335,.003,.003)], p['fur'], ear, sides=20)
        _f_line(name+'_EarSeam_'+side, [(sign*.68,-.15,2.00),(sign*.75,-.185,1.79),
            (sign*.75,-.205,1.57),(sign*.67,-.225,1.40)], .0026, p['seam'], ear)
    return _f_finish_root(root, loc, scale, parent, 'dog', 2.41)


def _f_dress(name, p, parent):
    # A sewn bodice and gathered skirt: elliptical silhouette, actual pleats.
    profile = [(.48,.40,.34),(.50,.49,.405),(.56,.52,.43),(.69,.50,.42),
        (.84,.445,.375),(.95,.355,.30),(1.01,.31,.285),(1.15,.335,.305),
        (1.31,.34,.30),(1.39,.265,.245)]
    verts, faces, uv = [], [], []
    seg = 96
    for row, (z, rx, ry) in enumerate(profile):
        for i in range(seg+1):
            a = math.tau*i/seg
            gathered = (.022 if z<.95 else .007)*math.cos(a*16) + .006*math.cos(a*8+.4)
            verts.append(((rx+gathered)*math.cos(a), (ry+gathered*.7)*math.sin(a), z+.004*math.cos(a*16)))
            uv.append((i/seg, (z-.48)/.91))
    for row in range(len(profile)-1):
        for i in range(seg):
            a = row*(seg+1)+i
            faces.append((a,a+1,a+seg+2,a+seg+1))
    obj = _f_mesh(name+'_FloralDress', verts, faces, uv, p['dress'], parent)
    solid = obj.modifiers.new('Sewn cloth thickness', 'SOLIDIFY'); solid.thickness=.012
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=solid.name)
    for z, rx, ry in [(.515,.498,.412),(.977,.323,.292)]:
        pts=[]
        for i in range(65):
            a=math.tau*i/64; ripple=.014*math.cos(a*16) if z<.6 else .004*math.cos(a*16)
            pts.append(((rx+ripple)*math.cos(a),(ry+ripple*.7)*math.sin(a),z))
        _f_line(name+'_SewnHem',pts,.004,p['hem'],parent)
    return obj


def _f_collar_point(a,t):
    co,si=math.cos(a),math.sin(a)
    xi,yi=.245*co,.245*si
    if si<0:
        xo=.395*math.copysign(abs(co)**.5,co)
        yo=-.35*abs(si)**.5
    else:
        # The rear yoke follows the padded shoulders rather than forming stiff
        # square wings. Only the reference's front retains square lower corners.
        xo=(.395-.045*si)*math.copysign(abs(co)**(.5+.5*min(1,si*3)),co)
        yo=.325*si
    zi=1.447+.009*si
    zo=(1.205 if si<0 else 1.25)+.115*(1-abs(si)**.25)
    ease=.022*math.sin(math.pi*t)
    return (xi*(1-t)+xo*t+co*ease,yi*(1-t)+yo*t+si*ease,
        zi*(1-t)+zo*t+.009*math.sin(math.pi*t)*math.sin(a*4))


def _f_rabbit_collar(name,p,parent):
    """An open-neck cloth yoke: curved square front, shoulders and back joined.

    It drapes from the neck opening to the bodice and has 7mm cloth thickness.
    The two buttons are sewn onto the lower front corners of this same surface.
    """
    seg=80;rows=10;verts=[];uv=[];faces=[]
    for j in range(rows+1):
        for i in range(seg+1):
            point=_f_collar_point(math.tau*i/seg,j/rows)
            verts.append(point);uv.append((point[0]/.8+.5,(point[2]-1.2)/.25))
    for j in range(rows):
        for i in range(seg):
            a=j*(seg+1)+i;faces.append((a,a+seg+1,a+seg+2,a+1))
    collar=_f_mesh(name+'_ClothCollar',verts,faces,uv,p['cord'],parent)
    solid=collar.modifiers.new('Thin sewn collar cloth','SOLIDIFY');solid.thickness=.007
    bpy.context.view_layer.objects.active=collar;bpy.ops.object.modifier_apply(modifier=solid.name)
    for t in (.035,.965):
        _f_line(name+'_CollarStitch',[_f_collar_point(math.tau*i/80,t) for i in range(81)],.0022,p['ribbon'],parent)
    for sign in [-1,1]:
        a=-math.pi/2+sign*.65
        centre=_FVector(_f_collar_point(a,.84))
        across=(_FVector(_f_collar_point(a+.001,.84))-_FVector(_f_collar_point(a-.001,.84))).normalized()
        down=(_FVector(_f_collar_point(a,.85))-_FVector(_f_collar_point(a,.83))).normalized()
        normal=down.cross(across).normalized()
        if normal.y>0:normal=-normal
        centre+=normal*.011
        right=_FVector((1,0,0));right=(right-normal*right.dot(normal)).normalized()
        up=normal.cross(right).normalized()
        rotation=normal.to_track_quat('Z','Y').to_euler()
        cylinder(name+'_Button',tuple(centre),.05,.012,p['button'],parent,vertices=24,rot=rotation)
        face=centre+normal*.008
        torus(name+'_ButtonRim',tuple(face),.039,.003,p['hem'],parent,major=20,rot=rotation)
        for dx,dz in [(-.011,-.011),(.011,-.011),(-.011,.011),(.011,.011)]:
            point=face+right*dx+up*dz+normal*.002
            ellipsoid(name+'_ButtonHole',tuple(point),(.0055,.0055,.002),p['hole'],parent,seg=8,rings=6,rot=rotation)
        for diagonal in [-1,1]:
            points=[tuple(face+normal*.004+right*(k*.011)+up*(diagonal*k*.011)) for k in [-1,1]]
            _f_line(name+'_ButtonThread',points,.0018,p['hem'],parent)
    return collar


def _f_ribbon(name, points, widths, mat, parent):
    # Real open ribbon strips, with thickness and curved edges instead of ellipsoids.
    verts, faces, uv = [], [], []
    for j, point in enumerate(points):
        v = _FVector(point)
        tangent = _FVector(points[min(j+1,len(points)-1)])-_FVector(points[max(j-1,0)])
        side = tangent.cross(_FVector((0,-1,0))).normalized()
        for k in range(5):
            f = (k/4-.5)*2
            co = v + side*widths[j]*f + _FVector((0,-.018*(1-f*f),0))
            verts.append(tuple(co)); uv.append((k/4,j/(len(points)-1)))
    for j in range(len(points)-1):
        for k in range(4):
            a=j*5+k; faces.append((a,a+1,a+6,a+5))
    obj = _f_mesh(name,verts,faces,uv,mat,parent)
    mod=obj.modifiers.new('Ribbon cloth thickness','SOLIDIFY');mod.thickness=.009
    bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def make_rabbit(name='Rabbit', loc=(0, 0, 0), scale=1, parent=None):
    p = _f_palette()
    root=group(name)
    body=group(name+'_Body',(0,0,.93),root)
    # The full outer silhouette belongs to the padded dress. Keep the hidden
    # stuffed core within it so cream plush cannot break through the fabric.
    _f_sphere(name+'_Torso',(0,0,1.01),(.29,.255,.45),p['cream'],body,segments=28,rings=18)
    _f_sphere(name+'_SoftNeck',(0,0,1.43),(.235,.235,.20),p['cream'],body,segments=24,rings=16)
    _f_dress(name,p,body)
    for side,sign in [('L',-1),('R',1)]:
        leg=group(name+'_Leg_'+side,(sign*.19,.02,.55),body)
        _f_sweep(name+'_LegCloth_'+side,[(sign*.18,.025,.58,.105,.115),(sign*.20,.01,.38,.105,.12),
            (sign*.22,-.035,.19,.13,.16),(sign*.235,-.11,.10,.16,.22),
            (sign*.24,-.13,.035,.13,.185),(sign*.24,-.13,.012,.005,.005)],p['cream'],leg,sides=20)
        arm=group(name+'_Arm_'+side,(sign*.30,.01,1.28),body)
        if side=='R':
            _f_sweep(name+'_ArmCloth_'+side,[(.29,.015,1.30,.11,.12),(.39,-.09,1.21,.14,.14),
                (.49,-.19,1.08,.135,.14),(.56,-.27,1.01,.14,.15),
                (.57,-.30,.96,.11,.115),(.56,-.30,.92,.003,.003)],p['cream'],arm,sides=20)
            _f_sweep(name+'_Sleeve_'+side,[(.18,.015,1.37,.08,.09),(.30,.0,1.30,.12,.13),
                (.38,-.075,1.23,.155,.155),(.44,-.13,1.14,.152,.15)],p['dress'],arm,sides=20)
            grip=group(name+'_WateringCanGrip',(.57,-.42,1.03),arm)
            grip['attachment']='Align watering-can handle centre here; child prop may tilt independently'
            grip['local_axes']='Identity rest rotation: Three X right, Y up, Z front'
        else:
            _f_sweep(name+'_ArmCloth_'+side,[(sign*.29,.015,1.30,.11,.12),(sign*.39,-.02,1.21,.14,.14),
                (sign*.49,-.045,1.06,.135,.14),(sign*.56,-.065,.90,.14,.15),
                (sign*.57,-.08,.82,.11,.115),(sign*.56,-.08,.78,.003,.003)],p['cream'],arm,sides=20)
            _f_sweep(name+'_Sleeve_'+side,[(sign*.18,.015,1.37,.08,.09),(sign*.30,.01,1.30,.12,.13),(sign*.38,-.02,1.23,.155,.155),
                (sign*.44,-.035,1.14,.152,.15)],p['dress'],arm,sides=20)
    _f_rabbit_collar(name,p,body)
    tail=group(name+'_Tail',(0,.30,.68),body)
    _f_sphere(name+'_CottonTail',(0,.43,.69),(.18,.17,.17),p['cream'],tail,segments=24,rings=16,fuzz=.02)
    head=group(name+'_Head',(0,0,1.43),body)
    _f_sphere(name+'_HeadCloth',(0,-.012,1.83),(.465,.43,.44),p['cream'],head,
        shape=lambda x,y,z:(x*(1-.10*z),y-.035*max(0,-z/.44),z),fuzz=.006)
    _f_sphere(name+'_SoftMuzzle',(0,-.385,1.70),(.245,.105,.18),p['cream'],head,segments=28,rings=18)
    _f_eye(name,'L',(-.259,-.363,1.88),.058,p,head)
    _f_eye(name,'R',(.259,-.363,1.88),.058,p,head)
    # A softly bevelled inverted triangle, matching the little stitched pink nose.
    nose=mesh(name+'_PinkNose',[(-.062,-.491,1.804),(.062,-.491,1.804),(0,-.505,1.727),
        (-.052,-.466,1.800),(.052,-.466,1.800),(0,-.479,1.738)],
        [(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],p['pink'],head,edge=.014)
    for i in range(-3,4):
        x=i*.013
        _f_line(name+'_NoseEmbroidery',[(x,-.507,1.792),(x*.72,-.515,1.756+abs(i)*.006)],.0018,p['pink'],head)
    _f_line(name+'_MouthStem',[(0,-.491,1.733),(0,-.495,1.684)],.0035,p['stitch'],head)
    _f_line(name+'_MouthLeft',[(0,-.495,1.684),(-.025,-.489,1.664),(-.045,-.481,1.675)],.0035,p['stitch'],head)
    _f_line(name+'_MouthRight',[(0,-.495,1.684),(.025,-.489,1.664),(.045,-.481,1.675)],.0035,p['stitch'],head)
    for side,sign in [('L',-1),('R',1)]:
        ear=group(name+'_Ear_'+side,(sign*.36,.015,2.08),head)
        stations=[(sign*.34,.02,2.095,.055,.04),(sign*.47,.045,2.045,.115,.065),
            (sign*.55,.055,1.85,.135,.065),(sign*.60,.045,1.59,.133,.06),
            (sign*.64,.015,1.34,.115,.055),(sign*.64,-.01,1.20,.08,.045),
            (sign*.61,-.02,1.16,.003,.003)]
        _f_sweep(name+'_EarCloth_'+side,stations,p['cream'],ear,sides=20)
        _f_sweep(name+'_EarLining_'+side,[(sign*.46,-.017,2.025,.035,.006),
            (sign*.54,-.016,1.85,.075,.009),(sign*.59,-.02,1.59,.073,.009),
            (sign*.63,-.045,1.35,.055,.009),(sign*.625,-.055,1.23,.016,.005)],p['inner'],ear,sides=12)
    bow=group(name+'_Bow',(-.365,-.10,2.145),head)
    # Rabbit's right, viewer left; four asymmetric ribbon strips and a tied centre.
    _f_ribbon(name+'_BowLoopLeft',[(-.365,-.12,2.145),(-.48,-.14,2.22),(-.57,-.12,2.275),
        (-.59,-.075,2.22),(-.51,-.06,2.18),(-.365,-.11,2.145)],[.03,.065,.07,.065,.055,.03],p['ribbon'],bow)
    _f_ribbon(name+'_BowLoopRight',[(-.365,-.12,2.145),(-.29,-.13,2.235),(-.24,-.11,2.31),
        (-.25,-.06,2.32),(-.32,-.055,2.22),(-.365,-.11,2.145)],[.025,.05,.06,.04,.035,.025],p['ribbon'],bow)
    _f_ribbon(name+'_BowTailLong',[(-.37,-.14,2.14),(-.43,-.15,2.02),(-.47,-.14,1.94),(-.49,-.12,1.91)],
        [.03,.05,.05,.048],p['ribbon'],bow)
    _f_ribbon(name+'_BowTailShort',[(-.36,-.14,2.14),(-.30,-.15,2.07),(-.27,-.13,2.025)],
        [.03,.046,.043],p['ribbon'],bow)
    box(name+'_BowKnot',(-.365,-.145,2.145),(.07,.07,.09),p['cord'],bow,w=.025,rot=(0,.25,-.25))
    return _f_finish_root(root,loc,scale,parent,'rabbit',2.33)
