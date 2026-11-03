"""Local CC0 leaf scans, fitted to the existing pot. See sources/.../SOURCE.json.

Only the blades and their petioles are imported. The retained source coordinates
are a corner attribute, so atlas packing cannot change the scanned leaf veins.
"""
import math
import random
from pathlib import Path
import bpy
from mathutils import Matrix, Vector
from refine_geometry import _activate, _replace
from aging import Surface

SOURCE = Path(__file__).parent / 'sources/potted-plant-02'


def leaf_material(variant=0):
    material = bpy.data.materials.new('Scanned syngonium thin cuticle '+str(variant))
    material.use_nodes = True
    n, l = material.node_tree.nodes, material.node_tree.links
    p = n.get('Principled BSDF')
    p.inputs['Roughness'].default_value = .48
    p.inputs['Subsurface Weight'].default_value = .045
    p.inputs['Subsurface Radius'].default_value = (.0004, .0008, .0002)
    p.inputs['Specular IOR Level'].default_value = .32
    uv = n.new('ShaderNodeAttribute'); uv.attribute_name = 'ScanCoordinates'
    def texture(suffix, data=False):
        node = n.new('ShaderNodeTexImage')
        node.image = bpy.data.images.load(str(SOURCE/'textures'/f'potted_plant_02_leaves_{suffix}'), check_existing=True)
        if data: node.image.colorspace_settings.name = 'Non-Color'
        l.new(uv.outputs['Vector'], node.inputs['Vector'])
        return node.outputs['Color']
    albedo=texture('diff_2k.jpg')
    # The scan already contains the pale vein colour. Compress its brightest
    # patches before the warm lamp illuminates them, preserving the real vein
    # pattern without making the lower leaves read as white paper cutouts.
    luminance=n.new('ShaderNodeRGBToBW');l.new(albedo,luminance.inputs[0])
    reflectance=n.new('ShaderNodeMapRange')
    reflectance.inputs['From Min'].default_value=.045
    reflectance.inputs['From Max'].default_value=.30
    reflectance.inputs['To Min'].default_value=.98
    reflectance.inputs['To Max'].default_value=.55
    reflectance.clamp=True
    l.new(luminance.outputs[0],reflectance.inputs['Value'])
    pigment=n.new('ShaderNodeMixRGB');pigment.blend_type='MULTIPLY'
    pigment.inputs[0].default_value=1
    l.new(albedo,pigment.inputs[1]);l.new(reflectance.outputs['Result'],pigment.inputs[2])
    # The source is genuinely variegated, but its brightest veins should not
    # become white painted lines. Keep the vein pattern while returning a
    # little chlorophyll colour to those bright portions of the lamina.
    vein=n.new('ShaderNodeMapRange');vein.clamp=True
    vein.inputs['From Min'].default_value=.075;vein.inputs['From Max'].default_value=.26
    vein.inputs['To Min'].default_value=0;vein.inputs['To Max'].default_value=.43
    l.new(luminance.outputs[0],vein.inputs['Value'])
    tissue=n.new('ShaderNodeMixRGB')
    l.new(vein.outputs['Result'],tissue.inputs[0]);l.new(pigment.outputs[0],tissue.inputs[1])
    tissue.inputs[2].default_value=(.050,.073,.022,1)
    variation=n.new('ShaderNodeMixRGB');variation.blend_type='MULTIPLY'
    variation.inputs[0].default_value=1
    variation.inputs[2].default_value=[(.96,1.015,.96,1),(1.025,1.0,.94,1),(1.0,.97,.95,1)][variant]
    l.new(tissue.outputs[0],variation.inputs[1]);l.new(variation.outputs[0],p.inputs['Base Color'])
    rough = n.new('ShaderNodeMapRange')
    rough.inputs['To Min'].default_value = .42+variant*.015; rough.inputs['To Max'].default_value = .64+variant*.012
    l.new(texture('rough_2k.jpg',True), rough.inputs[0]); l.new(rough.outputs[0],p.inputs['Roughness'])
    l.new(texture('alpha_2k.png',True),p.inputs['Alpha'])
    # Height is invariant under UV repacking; baking the source tangent normal
    # against a new atlas tangent frame would otherwise rotate the veins.
    # Relief supports the existing curved scan; it must not duplicate the
    # photographed vein contrast as hard raised ridges.
    bump = n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .11
    bump.inputs['Distance'].default_value = .00026
    l.new(texture('disp_2k.jpg',True),bump.inputs['Height']); l.new(bump.outputs[0],p.inputs['Normal'])
    return material


def stem_material():
    material=bpy.data.materials.new('Living syngonium petiole skin')
    material.use_nodes=True;s=Surface(material)
    s.p.inputs['Base Color'].default_value=(.105,.135,.039,1)
    s.p.inputs['Roughness'].default_value=.61
    s.p.inputs['Specular IOR Level'].default_value=.28
    fibres=s.noise(1,s.vector('MULTIPLY',s.position,(310,310,22)))
    s.mix_color(s.math('MULTIPLY',fibres,.14),(.069,.104,.025))
    s.roughness(s.math('MULTIPLY',fibres,.06))
    bump=s.n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.10;bump.inputs['Distance'].default_value=.000055
    s.l.new(fibres,bump.inputs['Height']);s.l.new(bump.outputs[0],s.p.inputs['Normal'])
    return material


def refine_soil(scene):
    """One opaque, granular surface; clods share its bake and draw call."""
    soil=scene.objects['Plant_Pot_Soil']
    rng=random.Random(27182)
    material=bpy.data.materials.new('Loose potting earth and sparse mineral grit')
    material.use_nodes=True;s=Surface(material)
    s.p.inputs['Base Color'].default_value=(.052,.032,.017,1)
    s.p.inputs['Roughness'].default_value=.91
    damp=s.noise(31)
    s.mix_color(s.math('MULTIPLY',damp,.42),(.026,.018,.011))
    mineral=s.n.new('ShaderNodeAttribute');mineral.attribute_name='SoilMineral'
    s.mix_color(mineral.outputs['Fac'],(.29,.26,.20))
    s.roughness(s.math('MULTIPLY',damp,-.12))
    fine=s.noise(570)
    bump=s.n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.24;bump.inputs['Distance'].default_value=.0007
    s.l.new(fine,bump.inputs['Height']);s.l.new(bump.outputs[0],s.p.inputs['Normal'])
    def surface(x,y):
        radius=math.hypot(x,y)
        return .211+.008*math.exp(-(radius/.071)**2)+.0015*math.sin(x*73)*math.cos(y*51)
    vertices=[(0,0,surface(0,0))];faces=[];minerals=[0.]
    segments=64;rings=7
    for ring in range(1,rings+1):
        for i in range(segments):
            angle=i*math.tau/segments;radius=.219*ring/rings
            x,y=radius*math.cos(angle),radius*math.sin(angle)
            vertices.append((x,y,surface(x,y)+rng.uniform(-.0012,.0012)));minerals.append(0.)
    for i in range(segments):faces.append((0,1+i,1+(i+1)%segments))
    for ring in range(rings-1):
        for i in range(segments):
            a=1+ring*segments+i;b=1+ring*segments+(i+1)%segments
            # Radial rows run outwards. Tangent-then-radius winding points
            # down and is culled by the opaque runtime material, exposing
            # the white pot interior through an apparently missing soil bed.
            faces.append((a,a+segments,b+segments,b))
    # Dark humus clumps and a few pale mineral grains break the silhouette,
    # without making a bed of oversized decorative stones or a pale gravel cap.
    for index in range(74):
        angle=rng.random()*math.tau;distance=.203*math.sqrt(rng.random())
        x,y=distance*math.cos(angle),distance*math.sin(angle)
        mineral=index%11==0
        radius=rng.uniform(.003,.006) if mineral else rng.uniform(.005,.013)
        # Humus is not a collection of identically bevelled pebbles. Some
        # fragments lie flatter and longer; moist clumps remain more rounded.
        elongated=not mineral and index%4==0
        stretch=rng.uniform(1.25,1.65) if elongated else rng.uniform(.85,1.15)
        flatten=rng.uniform(.42,.67) if elongated else rng.uniform(.80,1.15)
        rotation=rng.random()*math.tau
        distance=min(distance,.214-radius*stretch*1.26)
        x,y=distance*math.cos(angle),distance*math.sin(angle)
        start=len(vertices);base=surface(x,y)-radius*.35*flatten
        for z,width in ((-.35,.45),(.05,1),(.60,.52)):
            for i in range(7):
                a=i*math.tau/7;irregular=1+rng.uniform(-.26,.26)
                px=math.cos(a)*radius*width*irregular*stretch
                py=math.sin(a)*radius*width*.82*irregular/stretch
                vertices.append((x+px*math.cos(rotation)-py*math.sin(rotation),
                                 y+px*math.sin(rotation)+py*math.cos(rotation),
                                 base+radius*z*flatten+rng.uniform(-.14,.14)*radius))
                minerals.append(float(mineral))
        for row in range(2):
            for i in range(7):
                a=start+row*7+i;b=start+row*7+(i+1)%7
                faces.append((a,b,b+7,a+7))
        # A low, offset crown removes the repeated flat seven-sided lid.
        crown=len(vertices)
        vertices.append((x+radius*.10*math.sin(rotation),y+radius*.10*math.cos(rotation),
                         base+radius*.76*flatten));minerals.append(float(mineral))
        for i in range(7):faces.append((start+14+i,start+14+(i+1)%7,crown))
        faces.append(tuple(start+i for i in reversed(range(7))))
    _replace(soil,vertices,faces,material,smooth=False)
    attr=soil.data.attributes.new('SoilMineral','FLOAT','POINT')
    for value,amount in zip(attr.data,minerals):value.value=amount
    # This replacement is made after the legacy props charts are preserved.
    # Use the rebuilt atlas so every new clod receives its own valid UVs.
    soil['hero_atlas']='equipment'
    # The ceramic atlas joins and removes the parent pot before equipment is
    # processed. Detach now, while its world transform is still valid, so the
    # later bake cannot strand the soil at the world origin.
    bpy.context.view_layer.update()
    world=soil.matrix_world.copy()
    soil.parent=None
    soil.matrix_world=world
    return {'clods':74,'mineralGrains':7,'drawCalls':1,'stemMoundHeight':.008}


def refine_foliage(scene):
    for obj in list(scene.objects):
        if obj.name.startswith(('Plant_Leaf','Plant_Stem')):
            bpy.data.objects.remove(obj,do_unlink=True)
    before = set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE/'foliage.gltf'))
    imported = [o for o in scene.objects if o not in before and o.type=='MESH']
    assert len(imported)==1, 'The source must contain foliage only'
    obj=imported[0]; _activate(obj)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=.00001); bpy.ops.mesh.separate(type='LOOSE')
    bpy.ops.object.mode_set(mode='OBJECT')
    parts=list(bpy.context.selected_objects)
    stems=[o for o in parts if len(o.data.vertices)<150]
    blades=[o for o in parts if o not in stems]
    assert len(stems)==21 and len(blades)==21,(len(stems),len(blades))
    transform=(Matrix.Translation(Vector((-2.14,.15,1.18))) @
               Matrix.Rotation(-.22,4,'Z') @ Matrix.Diagonal((1.45,1.30,1.90,1)) @
               Matrix.Translation(Vector((0,0,-.304))))
    materials=[leaf_material(i)for i in range(3)];petiole=stem_material()
    stem_points=[v.co.copy() for o in stems for v in o.data.vertices]
    for index,leaf in enumerate(blades):
        vertices=[v.co.copy()for v in leaf.data.vertices]
        base=min(vertices,key=lambda p:min((p-s).length_squared for s in stem_points))
        tip=max(vertices,key=lambda p:(p-base).length_squared)
        # Preserve each scanned blade and petiole connection. A bounded soft
        # twist changes its reflected contour without changing plant species
        # or replacing the real scan with a procedural flat leaf.
        axis=(tip-base).normalized();length=(tip-base).length
        normal=sum((face.normal*face.area for face in leaf.data.polygons),Vector()).normalized()
        across=axis.cross(normal).normalized()
        width=max(abs((v-base).dot(across))for v in vertices)
        phase=index*2.3999632297
        # Relax only the interior midrib fold. Keep the scanned outline and
        # petiole attachment fixed instead of shrinking the entire leaf with
        # another subdivision level. UVs continue to describe the same tissue.
        neighbours=[set()for _ in vertices];edge_faces={}
        for face in leaf.data.polygons:
            for a,b in zip(face.vertices,(*face.vertices[1:],face.vertices[0])):
                neighbours[a].add(b);neighbours[b].add(a)
                key=tuple(sorted((a,b)));edge_faces[key]=edge_faces.get(key,0)+1
        boundary={i for edge,count in edge_faces.items()if count==1 for i in edge}
        for _ in range(2):
            current=[vertex.co.copy()for vertex in leaf.data.vertices]
            for i,vertex in enumerate(leaf.data.vertices):
                if i in boundary or not neighbours[i]:continue
                relative=current[i]-base;t=max(0.,min(1.,relative.dot(axis)/length))
                lateral=relative.dot(across)/max(width,.0001)
                average=sum((current[j]for j in neighbours[i]),Vector())/len(neighbours[i])
                soften=(average-current[i]).dot(normal)*.42*math.sin(math.pi*t)*math.exp(-(lateral/.55)**2)
                vertex.co+=normal*max(-.002,min(.002,soften))
        for vertex in leaf.data.vertices:
            relative=vertex.co-base;t=max(0.,min(1.,relative.dot(axis)/length))
            edge=max(-1.,min(1.,relative.dot(across)/max(width,.0001)))
            # Wider blades need a little more cross-blade twist to reveal a
            # changing cuticle highlight. Attachments and tips remain fixed;
            # this changes neither the silhouette scale nor petiole alignment.
            blade_scale=min(1.35,max(.75,width/.055))
            curl=math.sin(math.pi*t)*blade_scale*(.0048*math.sin(phase)*edge+.0030*math.sin(t*5+phase)*edge*edge)
            vertex.co+=normal*curl
        base,tip=transform@base,transform@tip
        leaf['leaf_base']=[base.x,base.z,-base.y]
        leaf['leaf_tip']=[tip.x,tip.z,-tip.y]
        leaf['leaf_phase']=index*2.3999632297
        leaf['leaf_flex']=.012+(index%5)*.0012
    for group,prefix in [(stems,'Plant_Stem_Scan'),(blades,'Plant_Leaf')]:
        for index,obj in enumerate(group):
            obj.name=('Plant_Leaf' if index==0 else 'Plant_Leaf.%03d'%index) if group is blades else prefix+('_%02d'%index)
            obj.data.transform(transform)
            obj['hero_atlas']='foliage' if group is blades else 'equipment'
            obj['surface_profile']='foliage' if group is blades else 'plant-stem'
            obj.data.materials.clear();obj.data.materials.append(materials[index%3] if group is blades else petiole)
            for face in obj.data.polygons:face.use_smooth=True
            if obj in blades:
                _activate(obj)
                sub=obj.modifiers.new('Continuous blade curvature','SUBSURF');sub.levels=1;sub.render_levels=1
                bpy.ops.object.modifier_apply(modifier=sub.name)
            uv=obj.data.uv_layers.active
            attr=obj.data.attributes.new('ScanCoordinates','FLOAT_VECTOR','CORNER')
            for corner,value in zip(attr.data,uv.data):corner.vector=(*value.uv,0)
    soil=refine_soil(scene)
    return {'source':'Poly Haven / potted_plant_02 / CC0-1.0','blades':len(blades),
            'petioles':len(stems),'sourceUV':'ScanCoordinates','pot':'retained','soil':soil,
            'cuticleVariants':3,'additionalBladeCurlSourceMeters':.01053,'softenedInteriorMidrib':True,
            'petioleFinish':'independent opaque living skin',
            'thickness':'thin alpha-tested blade; no inflated solidify shell'}
