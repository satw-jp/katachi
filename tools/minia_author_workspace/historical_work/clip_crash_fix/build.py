import bpy,bmesh,runpy,sys,json,hashlib
from pathlib import Path
root=Path.cwd();out=root/'outputs';work=root/'work/clip_crash_fix'
source=out/'MINIA_ALL_LINES_RISK_EDITOR_author_recovered_2610100_035_display_fixed_quad_clip.blend'
for p in ('color_author_runtime','selected_point_runtime','quad_view_runtime','view_clip_runtime'):sys.path.insert(0,str(out/p))
import author_scoring_runtime as ar
mp=ar.depth.midpoint
obj=bpy.data.objects[mp.ANCHOR]
def snap():
 if obj.mode=='EDIT':obj.update_from_editmode()
 m=obj.data
 return ([(tuple(v.co)) for v in m.vertices],[tuple(e.vertices) for e in m.edges],len(m.polygons),{a.name:[getattr(d,'value',None) for d in a.data] for a in m.attributes if a.domain=='POINT' and a.data_type in ('FLOAT','INT')})
before=snap();refs=mp._verify_references(bpy.context.scene)
runpy.run_path(str(out/'MINIA_VIEW_CLIP_FIXED_BOOTSTRAP.py'))
import safe_view_clip_adapter as vc
scene=bpy.context.scene
for axis in 'xyz':
 setattr(scene,'minia_clip_'+axis+'_start',0.)
 setattr(scene,'minia_clip_'+axis+'_end',10.)
 assert scene['view_clip_state']=='DEFERRED_TO_VIEWPORT'
 setattr(scene,'minia_clip_'+axis+'_start',10.)
 setattr(scene,'minia_clip_'+axis+'_end',30.)
 setattr(scene,'minia_clip_'+axis+'_start',0.)
 setattr(scene,'minia_clip_'+axis+'_end',100.)
assert before==snap()
state=mp.scan_state(scene,False)
a=next(a for a in bpy.context.screen.areas if a.type=='VIEW_3D')
# The native operator allocates the missing native bounding box. Exercise it on all panes.
for q in a.spaces.active.region_quadviews:
 r=vc._region_for_q(a,q)
 with bpy.context.temp_override(area=a,region=r):
  assert bpy.ops.view3d.clip_border('EXEC_DEFAULT',xmin=100,xmax=500,ymin=100,ymax=500)=={'FINISHED'}
  assert q.use_clip_planes
  vc._clear_native_clip(q)
  assert not q.use_clip_planes
assert before==snap() and mp._verify_references(scene)==refs
scene['view_clip_state']='READY'
target=out/'MINIA_QUAD_CLIP_FIXED.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(target),compress=True)
report={'status':'PASS','vertices':len(before[0]),'edges':len(before[1]),'faces':before[2],'midpoints':len(state['mid_records']),'geometry_and_point_attributes_unchanged':True,'source_guard':'PASS','refs':refs,'native_operator_initialize_disable_all_four_panes':'PASS','ranges_0_10_10_30_0_100_background_safety':'PASS','interactive_depth_slab_and_click':'NOT_TESTED: GUI not launched','source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'output_sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
(out/'MINIA_CLIP_CRASH_FIX_QA.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report),flush=True)
