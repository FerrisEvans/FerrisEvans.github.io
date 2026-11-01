"""Read-only Blender geometry diagnostics for a selected scene.

Pass --base CANDIDATE/build/study-materials.blend after Blender's -- separator
to inspect the current candidate. The default path and screenshot reference
belong to the original study; they are retained only for historical comparison.
The delivery gate is build-assets.py audit plus the delivered-model Node tests.
"""
import argparse, json, math, sys
from pathlib import Path
import bpy
from bpy_extras.object_utils import world_to_camera_view
root=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base',type=Path,default=root/'.room-build/study-materials.blend')
parser.add_argument('--output',type=Path,default=root/'.room-build/model-audit.json')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.open_mainfile(filepath=str(args.base.resolve()))
scene=bpy.context.scene
scene.render.resolution_x=1440;scene.render.resolution_y=960
bpy.context.view_layer.update()

def bounds(name):
 obj=bpy.data.objects[name]
 points=[obj.matrix_world@v.co for v in obj.data.vertices]
 projected=[world_to_camera_view(scene,scene.camera,p) for p in points]
 return {'worldMin':[min(p[i] for p in points) for i in range(3)],'worldMax':[max(p[i] for p in points) for i in range(3)],
  'pixels1440x960':[min(p.x for p in projected)*1440,(1-max(p.y for p in projected))*960,max(p.x for p in projected)*1440,(1-min(p.y for p in projected))*960]}
names=['CRT_Case','CRT_Screen','VCR_Body','Lamp_Shade','Work_Notepad','Computer_Monitor']
for optional in ('Work_Notepad_Block','Desk_Remote'):
 if optional in bpy.data.objects:names.append(optional)
report={'sourceBlend':str(args.base.resolve()),'camera':{'location':list(scene.camera.location),'lens':scene.camera.data.lens},'objects':{n:bounds(n) for n in names},'finiteVertices':True}
for obj in scene.objects:
 if obj.type=='MESH' and any(not math.isfinite(x) for v in obj.data.vertices for x in v.co): report['finiteVertices']=False
screen=bpy.data.objects['CRT_Screen']; ys=[v.co.y for v in screen.data.vertices]
report['crt']={'vertices':len(screen.data.vertices),'bulgeMeters':max(ys)-min(ys),'exportedDesignBulgeMeters':screen['screen_bulge_m']}
pad_name='Work_Notepad_Block' if 'Work_Notepad_Block' in report['objects'] else 'Work_Notepad'
pad=report['objects'][pad_name]
report['padThicknessObject']=pad_name
report['padThicknessMeters']=pad['worldMax'][2]-pad['worldMin'][2]
report['remotePresent']='Desk_Remote' in report['objects']
if report['remotePresent']:
 remote=report['objects']['Desk_Remote']
 report['remotePaperGapXMeters']=pad['worldMin'][0]-remote['worldMax'][0]
 assert report['remotePaperGapXMeters']>0
report['legacyReferenceBounds']={'CRT_Case':[516,388,877,744],'Lamp_Shade':[180,392,336,516]}
report['legacyProjectionDeltaPixels']={name:[round(v-r,2) for v,r in zip(report['objects'][name]['pixels1440x960'],reference)] for name,reference in report['legacyReferenceBounds'].items()}
assert report['finiteVertices']
assert abs(report['crt']['bulgeMeters']-.037)<.0001
assert .012<report['padThicknessMeters']<.016
args.output.write_text(json.dumps(report,indent=2)+'\n')
print('MODEL_AUDIT',json.dumps(report))
