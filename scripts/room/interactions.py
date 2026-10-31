"""Export interaction surfaces before baking joins the static meshes."""
import json
from pathlib import Path
import bpy
from mathutils import Vector

root = Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(root / '.room-build/study-materials.blend'))

def point(obj, local):
    v = obj.matrix_world @ Vector(local)
    return [round(v.x, 6), round(v.z, 6), round(-v.y, 6)]

def bounds(name):
    obj = bpy.data.objects[name]
    corners = [point(obj, p) for p in obj.bound_box]
    return {'min': [min(p[i] for p in corners) for i in range(3)],
            'max': [max(p[i] for p in corners) for i in range(3)]}

def surface(name, horizontal=False):
    obj = bpy.data.objects[name]
    mn = [min(v[i] for v in obj.bound_box) for i in range(3)]
    mx = [max(v[i] for v in obj.bound_box) for i in range(3)]
    if horizontal:
        local = [(mn[0], mx[1], mx[2]+.001), (mx[0], mx[1], mx[2]+.001),
                 (mx[0], mn[1], mx[2]+.001), (mn[0], mn[1], mx[2]+.001)]
    else:
        y = -.010 if name == 'CRT_Screen' else mn[1] - .001
        local = [(mn[0], y, mx[2]), (mx[0], y, mx[2]),
                 (mx[0], y, mn[2]), (mn[0], y, mn[2])]
    return [point(obj, p) for p in local]

data = {
    'surfaces': {'posts': surface('CRT_Screen'), 'work': surface('Work_Notepad', True), 'about': surface('Computer_Screen')},
    'targets': [dict(name=name, view=view, **bounds(name)) for name, view in [
        ('CRT_Case', 'posts'), ('Work_Notepad', 'work'), ('Computer_Monitor', 'about'),
        ('Desk_Book', 'work'), ('Desk_Remote', 'posts'), ('VHS_A_5', 'posts'), ('VHS_B_7', 'posts'),
        ('Retro_Phone', 'online'), ('Desk_CD', 'cd'), ('Desk_Calculator', 'calculator')]],
}
(root / 'src/scripts/room/anchors.json').write_text(json.dumps(data, indent=2)+'\n')
print(json.dumps(data))
