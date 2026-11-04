"""Prove runtime-local glTF joint axes on the independently rendered friends.

Run render_friends.py first, then this file with background Blender. Only writes
/tmp/weijin-friends/motion-*.png. Three local XYZ rotations are conjugated back
to Blender coordinates, so these are the same poses as the runtime will apply.
"""
import bpy
import math
import json
import sys
from pathlib import Path
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

OUT = Path('/tmp/weijin-friends')
bpy.ops.wm.open_mainfile(filepath=str(OUT/'friends.blend'))
# glTF exporter converts Blender (x,y,z) to (x,z,-y).
C = Matrix.Rotation(-math.pi/2, 4, 'X')


def pose(name, x=0, y=0, z=0):
    # Three Euler XYZ matrix: Rx @ Ry @ Rz, retaining zero authored joint rest.
    three = Matrix.Rotation(x,4,'X') @ Matrix.Rotation(y,4,'Y') @ Matrix.Rotation(z,4,'Z')
    obj=bpy.data.objects[name]
    obj.rotation_mode='QUATERNION'
    obj.rotation_quaternion=(C.inverted() @ three @ C).to_quaternion()


scene=bpy.context.scene
scene.cycles.samples=40
camera=scene.camera
camera.location=(3,-8,3.15)
camera.rotation_euler=(Vector((0,0,1.17))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.ortho_scale=4.25
checks=[]
cases=[('greeting-a',-1.05,-.90,.06,-.10,1),('greeting-b',-1.35,.90,.12,.10,1)]
if '--activity-only' in sys.argv:
    cases=[]
if '--check-only' in sys.argv:
    samples=[(n*.29,1) for n in range(32)]
    samples += [(t,level) for level in (.25,.5,.75) for t in (0,.7,1.4,2.1)]
    cases += [('sample-'+str(i),-1.2+.15*math.sin(t*7),.9*math.sin(t*11),
        .09+.03*math.sin(t*3),.1*math.sin(t*5),level) for i,(t,level) in enumerate(samples)]
for label, arm, tail, tilt, ears, level in cases:
    pose('Dog_Head',x=.025*level,z=tilt*level)
    pose('Dog_Tail',y=tail*level)
    pose('Dog_Arm_L',y=.68*level,z=arm*level)
    pose('Dog_Ear_L',x=ears*level,z=-.035*level)
    pose('Dog_Ear_R',x=-ears*.75*level,z=.035*level)
    pose('Rabbit_Ear_L',x=.035,z=-.015)
    pose('Rabbit_Ear_R',x=-.025,z=.015)
    bpy.context.view_layer.update()
    arm_obj=bpy.data.objects['Dog_ArmCloth_L']
    vertices=[arm_obj.matrix_world @ v.co for v in arm_obj.data.vertices]
    # HeadCloth now includes the continuous skull, muzzle and cloth nose region.
    for target_name in ['Dog_EarCloth_L','Dog_HeadCloth']:
        target=bpy.data.objects[target_name]
        tree=BVHTree.FromPolygons([target.matrix_world @ v.co for v in target.data.vertices],
            [tuple(p.vertices) for p in target.data.polygons])
        inside=[]
        for vertex in vertices:
            direction=Vector((.873,.341,.349)).normalized()
            origin=vertex.copy();crossings=0
            for _ in range(12):
                hit,normal,face,distance=tree.ray_cast(origin,direction,10)
                if hit is None:
                    break
                crossings+=1;origin=hit+direction*.00001
            if crossings % 2:
                hit,normal,face,distance=tree.find_nearest(vertex)
                if distance>.001:
                    inside.append(distance)
        checks.append({'pose':label,'target':target_name,'insideArmVertices':len(inside),
            'maxPenetration':max(inside,default=0)})
    scene.render.filepath=str(OUT/('motion-'+label+'.png'))
    if '--check-only' not in sys.argv:
        bpy.ops.render.render(write_still=True)
        print('FRIENDS_MOTION',scene.render.filepath,flush=True)
if checks:
    (OUT/'motion-intersections.json').write_text(json.dumps(checks,indent=2)+'\n')
print('FRIENDS_MOTION_INTERSECTIONS',json.dumps({'poses':len(cases),'checks':len(checks),
    'overlaps':[check for check in checks if check['insideArmVertices']]}),flush=True)

if '--activity-only' in sys.argv:
    for label,kind in [('activity-sniff-water','sniff'),('activity-greeting-right','right'),
                       ('activity-greeting-left','left'),('activity-collar-back','back')]:
        for name in ('Dog_Head','Dog_Tail','Dog_Arm_L','Dog_Ear_L','Dog_Ear_R',
                     'Rabbit_Head','Rabbit_Ear_L','Rabbit_Ear_R'):
            pose(name)
        if kind=='sniff':
            pose('Dog_Head',x=.238)
            pose('Dog_Tail',y=.27)
            pose('Dog_Ear_L',x=.025);pose('Dog_Ear_R',x=-.02)
            pose('Rabbit_Head',x=.14)
            pose('Rabbit_Ear_L',x=.03);pose('Rabbit_Ear_R',x=-.025)
        else:
            sign=-1 if kind=='left' else 1
            pose('Dog_Head',y=.085*sign,z=.025*sign)
            pose('Rabbit_Head',x=-.08,y=.07*sign,z=.10*sign)
            pose('Rabbit_Ear_L',x=.095*sign,z=-.24)
            pose('Rabbit_Ear_R',x=-.08*sign,z=.22)
        camera.location=(-3,7,3.4) if kind=='back' else (3,-8,3.15)
        camera.rotation_euler=(Vector((0,0,1.17))-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(OUT/(label+'.png'))
        bpy.ops.render.render(write_still=True)
        print('FRIENDS_ACTIVITY',scene.render.filepath,flush=True)
