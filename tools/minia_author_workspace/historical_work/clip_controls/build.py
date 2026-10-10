import bpy,sys,runpy,json,hashlib
from pathlib import Path
out=Path.cwd()/'outputs'
sys.path.insert(0,str(out/'color_author_runtime'))
import author_scoring_runtime as ar
mp=ar.depth.midpoint;obj=bpy.data.objects[mp.ANCHOR]
def snap():
 if obj.mode=='EDIT':obj.update_from_editmode()
 m=obj.data
 return ([tuple(v.co) for v in m.vertices],[tuple(e.vertices) for e in m.edges],len(m.polygons),{a.name:[d.value for d in a.data] for a in m.attributes if a.domain=='POINT' and a.data_type in ('FLOAT','INT')})
before=snap();refs=mp._verify_references(bpy.context.scene)
runpy.run_path(str(out/'MINIA_VIEW_CLIP_CONTROLS_BOOTSTRAP.py'))
import stable_view_clip_adapter as vc
s=bpy.context.scene;a=next(a for a in bpy.context.screen.areas if a.type=='VIEW_3D');qs=a.spaces.active.region_quadviews
assert [q.lock_rotation for q in qs]==[True,True,True,False]
assert [vc._axis_for_region(q) for q in qs]==[2,1,0,None]
views=[(tuple(q.view_rotation),tuple(q.view_location),q.view_distance,q.view_perspective) for q in qs]
for axis in 'xyz':
 setattr(s,'minia_clip_'+axis+'_start',10.)
 setattr(s,'minia_clip_'+axis+'_end',30.)
 assert s['view_clip_state']=='PENDING'
assert views==[(tuple(q.view_rotation),tuple(q.view_location),q.view_distance,q.view_perspective) for q in qs]
assert bpy.ops.mini_a.apply_view_ranges()=={'FINISHED'}
assert views==[(tuple(q.view_rotation),tuple(q.view_location),q.view_distance,q.view_perspective) for q in qs]
for axis in 'xyz':
 setattr(s,'minia_clip_'+axis+'_start',0.)
 setattr(s,'minia_clip_'+axis+'_end',100.)
bpy.ops.mini_a.apply_view_ranges();s['view_clip_state']='READY'
assert snap()==before and refs==mp._verify_references(s)
st=mp.scan_state(s,False)
assert any(k.idname=='mini_a.ortho_pan' and k.type=='MIDDLEMOUSE' for k in bpy.context.window_manager.keyconfigs.addon.keymaps['3D View'].keymap_items)
assert a.spaces.active.shading.background_type=='VIEWPORT'
bpy.ops.wm.save_as_mainfile(filepath=str(out/'MINIA_QUAD_CLIP_CONTROLS_FIXED.blend'),compress=True)
r={'status':'PASS','geometry_unchanged':True,'vertices':len(before[0]),'edges':len(before[1]),'midpoints':len(st['mid_records']),'rotation_locks':[q.lock_rotation for q in qs],'stable_axis_mapping':[vc._axis_for_region(q) for q in qs],'numeric_input_preserves_views':True,'apply_preserves_views_background':True,'mmb_pan_keymap':True,'interactive_mouse_and_clipping':'UNVERIFIED: GUI not launched'}
(out/'MINIA_CLIP_CONTROLS_QA.json').write_text(json.dumps(r,indent=2));print(json.dumps(r),flush=True)
