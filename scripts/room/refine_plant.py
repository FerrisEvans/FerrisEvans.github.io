"""A planted croton: tapered clay pot, branched stems and cupped, veined leaves.

Coordinates are physical world positions, not camera-projection corrections.
Leaf bases are exported for the existing Three.js prop animation.
"""
import math
import random
import bpy
from mathutils import Vector
from refine_geometry import _mesh, _replace, _lathe, _tube, _material, _activate


def leaf_material():
    material = _material('Croton cuticle and ochre veins', (.038, .085, .012), .46)
    n, l = material.node_tree.nodes, material.node_tree.links
    p = n.get('Principled BSDF')
    attr = n.new('ShaderNodeAttribute'); attr.attribute_name = 'LeafCoordinates'
    axes = n.new('ShaderNodeSeparateXYZ'); l.new(attr.outputs['Vector'], axes.inputs[0])
    def calc(op, a, b=0):
        node=n.new('ShaderNodeMath'); node.operation=op
        for socket,value in zip(node.inputs, (a,b)):
            if isinstance(value,(int,float)): socket.default_value=value
            else: l.new(value,socket)
        return node.outputs[0]
    ax=calc('ABSOLUTE',axes.outputs['X'])
    midrib=calc('LESS_THAN',ax,.032)
    # Oblique secondary veins join the midrib, rather than stripes across a leaf.
    phase=calc('SUBTRACT',calc('MULTIPLY',axes.outputs['Y'],48),calc('MULTIPLY',ax,3.8))
    vein=calc('GREATER_THAN',calc('COSINE',phase),.975)
    vein=calc('MULTIPLY',vein,calc('SUBTRACT',1,ax))
    veins=calc('MAXIMUM',midrib,vein)
    noise=n.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value=5.5; noise.inputs['Detail'].default_value=3
    l.new(attr.outputs['Vector'],noise.inputs['Vector'])
    ramp=n.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position=.30; ramp.color_ramp.elements[0].color=(.012,.031,.004,1)
    ramp.color_ramp.elements[1].position=.72; ramp.color_ramp.elements[1].color=(.19,.16,.025,1)
    middle=ramp.color_ramp.elements.new(.55); middle.color=(.042,.087,.012,1)
    l.new(noise.outputs['Fac'],ramp.inputs[0])
    mix=n.new('ShaderNodeMixRGB'); l.new(calc('MULTIPLY',veins,.72),mix.inputs[0]); l.new(ramp.outputs[0],mix.inputs[1]); mix.inputs[2].default_value=(.24,.19,.045,1)
    l.new(mix.outputs[0],p.inputs['Base Color'])
    rough=n.new('ShaderNodeMapRange');rough.inputs['To Min'].default_value=.40;rough.inputs['To Max'].default_value=.58
    l.new(noise.outputs['Fac'],rough.inputs[0]);l.new(rough.outputs[0],p.inputs['Roughness'])
    bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.14;bump.inputs['Distance'].default_value=.0006
    l.new(veins,bump.inputs['Height']);l.new(bump.outputs[0],p.inputs['Normal'])
    return material


def refine_plant(scene, clay):
    pot=bpy.data.objects['Plant_Pot']
    for obj in list(scene.objects):
        if obj.name.startswith(('Plant_Leaf','Plant_Stem','Plant_Pot_Soil')):
            bpy.data.objects.remove(obj,do_unlink=True)
    # Real inner wall, rolled lip, and an unglazed foot resting on the desk.
    profile=[(0,-.275),(.156,-.275),(.166,-.268),(.172,-.250),(.188,-.15),
             (.211,0),(.234,.16),(.241,.215),(.258,.222),(.264,.234),
             (.264,.258),(.257,.271),(.246,.275),(.232,.272),(.225,.263),
             (.224,.246),(.225,.230),(.214,.17),(.191,0),(.167,-.16),(.151,-.245),(0,-.245)]
    vertices,faces=_lathe(profile,80);_replace(pot,vertices,faces,clay)
    soil=_material('Dark moist potting mix',(.025,.018,.009),.98)
    rng=random.Random(709)
    vv=[(0,0,.215)];ff=[]
    for ring in range(1,5):
        for i in range(48):
            angle=i*math.tau/48; radius=.219*ring/4
            vv.append((radius*math.cos(angle),radius*math.sin(angle),.211+rng.uniform(-.007,.004)))
    for i in range(48):ff.append((0,1+i,1+(i+1)%48))
    for ring in range(3):
        for i in range(48):
            a=1+ring*48+i;b=1+ring*48+(i+1)%48;ff.append((a,b,b+48,a+48))
    _mesh('Plant_Pot_Soil',vv,ff,soil,scene,pot,True)
    leafmat=leaf_material();stemmat=_material('Croton woody green stems',(.065,.060,.018),.72)
    origin=Vector((-2.14,.15,1.18))
    # Three unequal branches. Leaves alternate around them, with lower foliage
    # leaning outward and newer upper blades more upright.
    branches=[(Vector((-.05,.02,.0)),Vector((-.12,.05,.93))),
              (Vector((.035,0,0)),Vector((.20,-.04,.62))),
              (Vector((-.015,.04,0)),Vector((-.20,.14,.56)))]
    for index,(base,tip) in enumerate(branches):
        points=[origin+base.lerp(tip,j/16)+Vector((.025*math.sin(j/16*math.pi),0,0)) for j in range(17)]
        vv,ff=_tube(points,.007,8);_mesh('Plant_Stem_Branch'+str(index),vv,ff,stemmat,scene,smooth=True)
    # branch, fraction, blade direction, length, width; no repeated radial fan.
    specs=[(0,.90,(-.12,-.12,1),.30,.13),(0,.70,(.8,-.4,.65),.36,.16),
           (0,.61,(-.8,-.25,.45),.40,.18),(0,.44,(.2,-.9,.3),.38,.18),
           (0,.29,(-.85,-.2,.08),.36,.17),(1,.90,(.25,.15,1),.29,.12),
           (1,.73,(.7,-.25,.45),.38,.17),(1,.54,(-.2,-.9,.1),.36,.19),
           (1,.36,(.85,-.1,-.2),.34,.16),(2,.92,(-.25,.0,.95),.31,.14),
           (2,.70,(-.8,.15,.35),.36,.16),(2,.44,(.15,.7,.45),.35,.17),
           (0,.50,(.65,.25,.7),.33,.17),(1,.21,(.25,-.8,-.10),.30,.17),
           (2,.25,(-.7,-.15,-.08),.31,.16),(0,.76,(-.5,.6,.35),.31,.15)]
    for index,(branch,fraction,direction,length,width) in enumerate(specs):
        a,b=branches[branch];join=origin+a.lerp(b,fraction)+Vector((.025*math.sin(fraction*math.pi),0,0))
        axis=Vector(direction).normalized();base=join+axis*.07
        vv,ff=_tube([join,join.lerp(base,.5)+Vector((0,0,.01)),base],.0032,6)
        _mesh('Plant_Stem_Petiole'+str(index),vv,ff,stemmat,scene,smooth=True)
        lateral=axis.cross(Vector((-.08,-1,.45))).normalized();normal=lateral.cross(axis).normalized()
        vv=[];ff=[]
        for row in range(21):
            t=.001+.998*row/20
            for col in range(7):
                u=-1+col/3;edge=width*.5*math.sin(math.pi*t)**.8
                edge*=1+.07*math.sin(t*17+index)+.08*u*math.sin(t*5+index)
                center=base+axis*length*t+Vector((0,0,-.095*t*t))
                curl=normal*(.032*abs(u)**1.6*math.sin(math.pi*t)+.020*u*t*math.sin(index*1.7))
                vv.append(center+lateral*(edge*u+.013*math.sin(math.pi*t)*math.sin(index))+curl)
        for row in range(20):
            for col in range(6):
                a=row*7+col;ff.append((a,a+7,a+8,a+1))
        obj=_mesh('Plant_Leaf' if index==0 else 'Plant_Leaf.%03d'%index,vv,ff,leafmat,scene,smooth=True)
        attr=obj.data.attributes.new('LeafCoordinates','FLOAT_VECTOR','POINT')
        for row in range(21):
            for col in range(7):attr.data[row*7+col].vector=(-1+col/3,.001+.998*row/20,index*.31)
        obj['leaf_base']=[base.x,base.z,-base.y]
        _activate(obj);shell=obj.modifiers.new('Thin leathery blade','SOLIDIFY');shell.thickness=.0007;shell.offset=0;bpy.ops.object.modifier_apply(modifier=shell.name)
    return {'leaves':len(specs),'branches':len(branches),'potHeight':.55,'rimDiameter':.528,'footDiameter':.332,'leafAnimationOrigin':'petiole'}
