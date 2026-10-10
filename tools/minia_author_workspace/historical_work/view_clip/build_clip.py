import bpy,bmesh,sys,json,runpy,hashlib,time
from pathlib import Path
from mathutils import Vector
root=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra');out=root/'outputs';work=root/'work'/'view_clip';source=out/'MINIA_ALL_LINES_RISK_EDITOR_author_recovered_2610100_035_display_fixed_quad.blend';started=time.perf_counter()
sys.path[:0]=[str(out/'color_author_runtime'),str(out/'selected_point_runtime'),str(out/'quad_view_runtime'),str(out/'view_clip_runtime')]
import author_scoring_runtime as ar
import quad_view_adapter as quad
import view_clip_adapter as vc
mp=ar.depth.midpoint;obj=bpy.data.objects[mp.ANCHOR];scene=bpy.context.scene

def snapshot():
 ob=bpy.data.objects[mp.ANCHOR]
 if bpy.context.mode!='EDIT_MESH':bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
 bm=bmesh.from_edit_mesh(ob.data);bm.verts.ensure_lookup_table();bm.edges.ensure_lookup_table();bm.faces.ensure_lookup_table()
 specs=[]
 for a in ob.data.attributes:
  if a.domain!='POINT':continue
  if a.data_type=='INT':layer=bm.verts.layers.int.get(a.name);kind='int'
  elif a.data_type=='FLOAT':layer=bm.verts.layers.float.get(a.name);kind='float'
  else:continue
  if layer is not None:specs.append((a.name,kind,layer))
 vs=tuple((v.index,tuple(float(c) for c in v.co),tuple((n,int(v[l]) if k=='int' else float(v[l])) for n,k,l in specs)) for v in bm.verts)
 es=tuple(sorted(tuple(sorted((e.verts[0].index,e.verts[1].index))) for e in bm.edges))
 return {'verts':vs,'edges':es,'faces':len(bm.faces),'attrs':tuple(x[0] for x in specs)}
before=snapshot();refs0=mp._verify_references(scene);assert before['faces']==0
runpy.run_path(str(out/'MINIA_VIEW_CLIP_BOOTSTRAP.py'))
after_setup=snapshot();assert before==after_setup,'setup changed point/edge/attribute geometry'
st=mp.scan_state(scene,False);update=mp.update_colors(scene);assert update.get('status')=='CURRENT',update
assert snapshot()==before,'color update changed source/author geometry'
refs1=mp._verify_references(scene);assert refs0==refs1
screen=bpy.context.window.screen if bpy.context.window else bpy.context.screen;area=next(a for a in screen.areas if a.type=='VIEW_3D');qviews=area.spaces.active.region_quadviews;assert len(qviews)==4
# Background mode lacks reliable interactive mouse-region coordinates, so verify
# Blender's persisted quad RegionView3D order and the adapter's axis mapping directly.
window_regions=[r for r in area.regions if r.type=='WINDOW'];axes=[vc._axis_for_region(q) for q in qviews]
assert len(window_regions)==4 and axes==[2,1,0,None],axes
region_mapping=[{'quad_index':i,'axis':axis,'eye':[float(x) for x in (qviews[i].view_rotation@Vector((0,0,1))) ]} for i,axis in enumerate(axes)]
# Exercise independent Z/Y/X ranges, per-region clip planes, and re-selection safety.
selected_before=[]
bm=bmesh.from_edit_mesh(obj.data)
selected_before=[v.index for v in bm.verts if v.select]
scene.minia_clip_z_start=10.;scene.minia_clip_z_end=30.;scene.minia_clip_y_start=0.;scene.minia_clip_y_end=10.;scene.minia_clip_x_start=10.;scene.minia_clip_x_end=30.
qby={vc._axis_for_region(q):q for q in qviews};assert all(i in qby for i in (0,1,2))
for ax in (0,1,2):assert qby[ax].use_clip_planes is True
assert qby[None].use_clip_planes is False
# Axonometric stays unclipped even when rotated exactly onto a principal axis.
axo=qby[None];axo_saved_rotation=axo.view_rotation.copy();axo.view_rotation=qby[0].view_rotation.copy();vc.apply_clips(scene)
assert vc._axis_for_region(axo) is None and not axo.use_clip_planes
axo.view_rotation=axo_saved_rotation;vc.apply_clips(scene)
# Each cut plane expresses its own world-axis percentages; unrelated axes have padded full bounds.
expected={0:vc._axis_range(scene,0),1:vc._axis_range(scene,1),2:vc._axis_range(scene,2)}
for ax,interval in expected.items():
 cp=[float(v) for plane in qby[ax].clip_planes for v in plane];lo=(-cp[3+8*ax]) # lower plane equation +axis*x - low >= 0
 hi=cp[7+8*ax] # upper plane equation -axis*x + high >=0
 assert abs(lo-interval[0])<1e-4,(ax,lo,interval)
 assert abs(hi-interval[1])<1e-4,(ax,hi,interval)
# Boundary and outside fixtures: crossing line is clipped to boundary; wholly out-of-range line is rejected.
mins,maxs=vc._source_bounds(scene);lo,hi=expected[2];cross=vc._line_clip([mins[0],mins[1],lo-5],[mins[0],mins[1],hi+5],2,lo,hi)
outside=vc._line_clip([mins[0],mins[1],hi+2],[mins[0]+1,mins[1],hi+4],2,lo,hi)
assert cross is not None and outside is None
bm=bmesh.from_edit_mesh(obj.data);assert not any(v.select for v in bm.verts),'range change must clear stale point selection'
# Restore full range and saved author selection. Full 0..100 does not clip the model.
scene.minia_clip_z_start=0.;scene.minia_clip_z_end=100.;scene.minia_clip_y_start=0.;scene.minia_clip_y_end=100.;scene.minia_clip_x_start=0.;scene.minia_clip_x_end=100.
vc.apply_clips(scene);assert all(not q.use_clip_planes for q in qviews)
bm=bmesh.from_edit_mesh(obj.data);bm.verts.ensure_lookup_table()
for v in bm.verts:v.select_set(v.index in set(selected_before))
bm.select_history.clear()
if selected_before:bm.select_history.add(bm.verts[selected_before[0]])
bmesh.update_edit_mesh(obj.data,loop_triangles=False,destructive=False)
assert snapshot()==before
# Verify SOLID material color is retained after update and clipping wrapper is installed.
assert all(a.spaces.active.shading.type=='SOLID' and a.spaces.active.shading.color_type=='MATERIAL' for sc in bpy.data.screens for a in sc.areas if a.type=='VIEW_3D')
assert scene['depth_cue_enabled'] is False and scene['quadview_depth_disabled'] is True
assert mp._screen_pick is vc._clip_aware_pick and ar.depth._install_depth_materials is vc._install_colors
marker_state=bool(bpy.data.collections.get(mp.PREVIEW));assert marker_state
target=out/'MINIA_ALL_LINES_RISK_EDITOR_author_recovered_2610100_035_display_fixed_quad_clip.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(target),compress=True)
result={'status':'VIEW_CLIP_BUILD_PASS','source_file':str(source),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'fixed_file':str(target),'fixed_sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'geometry_exactly_preserved':True,'vertices':len(before['verts']),'edges':len(before['edges']),'faces':before['faces'],'point_attributes':list(before['attrs']),'midpoints':len(st['mid_records']),'author_edges':len(st['edge_rows']),'author_roots':len(st['roots']),'source_refs':refs1,'source_guard':'PASS','color_update_status':update['status'],'color_update_report':update,'region_mapping':region_mapping,'clip_planes_rna_writable':True,'independent_ranges_tested':{'Z':[10,30],'Y':[0,10],'X':[10,30]},'per_axis_native_clip_enabled_in_partial_ranges':True,'axo_unclipped':True,'full_0_100_unclipped':True,'boundary_crossing_fixture':cross,'outside_fixture_rejected':outside,'range_change_clears_selection':True,'selection_restored_before_save':True,'solid_material_colors':True,'depth_cue_off':True,'native_clip_selection_behavior':'Blender clip-plane selection behavior documented; interactive click not simulated in background','elapsed_s':time.perf_counter()-started}
(work/'VIEW_CLIP_BUILD_QA.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8');print('VIEW_CLIP_BUILD='+json.dumps(result,ensure_ascii=False),flush=True)
