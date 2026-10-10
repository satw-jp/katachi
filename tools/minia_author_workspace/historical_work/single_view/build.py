import bpy,sys,runpy,json,hashlib,math
from pathlib import Path
from mathutils import Vector
out=Path.cwd()/'outputs';sys.path.insert(0,str(out/'color_author_runtime'))
import author_scoring_runtime as ar
mp=ar.depth.midpoint;obj=bpy.data.objects[mp.ANCHOR]
def snap():
 if obj.mode=='EDIT':obj.update_from_editmode()
 m=obj.data
 return ([tuple(v.co) for v in m.vertices],[tuple(e.vertices) for e in m.edges],len(m.polygons),{a.name:[d.value for d in a.data] for a in m.attributes if a.domain=='POINT' and a.data_type in ('FLOAT','INT')})
before=snap();refs=mp._verify_references(bpy.context.scene)
runpy.run_path(str(out/'MINIA_SINGLE_VIEW_BOOTSTRAP.py'))
import single_view_clip_adapter as vc
s=bpy.context.scene;a=next(a for a in bpy.context.screen.areas if a.type=='VIEW_3D');qs=list(a.spaces.active.region_quadviews)
views=[vc._view_state(q) for q in qs]
original={n:getattr(s,n) for n in ('minia_clip_shared','minia_clip_shared_axis','minia_clip_tilt','minia_clip_tilt_x','minia_clip_tilt_y','minia_clip_tilt_z','minia_clip_z_start','minia_clip_z_end')}
s.minia_clip_shared=True;s.minia_clip_shared_axis='2';s.minia_clip_tilt=True;s.minia_clip_tilt_x=30.;s.minia_clip_tilt_y=25.;s.minia_clip_z_start=0.;s.minia_clip_z_end=15.
vc.apply_clips(s);n=vc._clip_direction(s,2);lo,hi=vc._axis_range(s,2)
assert abs(n.length-1)<1e-6 and abs(n.x)>.1 and abs(n.y)>.1
assert all(vc._region_axis_range(q,s)==(2,(lo,hi)) for q in qs)
assert all((vc._applied_direction(s,2)-n).length<1e-6 for q in qs)
assert vc._line_clip(n*(lo-1),n*(hi+1),2,lo,hi,n) is not None
assert vc._line_clip(n*(hi+2),n*(hi+3),2,lo,hi,n) is None
r=vc._region_for_q(a,qs[3])
with bpy.context.temp_override(area=a,region=r):assert bpy.ops.mini_a.toggle_single()=={'FINISHED'}
assert len(a.spaces.active.region_quadviews)==0
single=a.spaces.active.region_3d;assert vc._view_state(single)==views[3]
assert vc._region_axis_range(single,s)==(2,(lo,hi))
r=vc._region_for_q(a,single)
with bpy.context.temp_override(area=a,region=r):assert bpy.ops.mini_a.toggle_single()=={'FINISHED'}
print('ROUNDTRIP_BEFORE',views,flush=True);print('ROUNDTRIP_AFTER',[vc._view_state(q) for q in a.spaces.active.region_quadviews],flush=True);assert [vc._view_state(q) for q in a.spaces.active.region_quadviews]==views
for name,val in original.items():setattr(s,name,val)
vc.apply_clips(s)
assert before==snap() and refs==mp._verify_references(s)
state=mp.scan_state(s,False)
r=vc._region_for_q(a,a.spaces.active.region_quadviews[3])
with bpy.context.temp_override(area=a,region=r):assert bpy.ops.mini_a.toggle_single()=={'FINISHED'}
assert before==snap()
bpy.ops.wm.save_as_mainfile(filepath=str(out/'MINIA_SINGLE_TILTED_CLIP.blend'),compress=True)
report={'status':'PASS','geometry_unchanged':True,'vertices':len(before[0]),'edges':len(before[1]),'midpoints':len(state['mid_records']),'source_refs':refs,'quad_single_quad_exact_views':'PASS','single_mode_shared_interval':'PASS','tilted_normal':list(n),'tilted_outside_pick_rejected':'PASS','interactive_native_clip_and_mouse':'NOT_TESTED: GUI not launched'}
(out/'MINIA_SINGLE_TILTED_CLIP_QA.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)

