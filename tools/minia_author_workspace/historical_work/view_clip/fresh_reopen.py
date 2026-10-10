import bpy,bmesh,sys,json,runpy,hashlib
from pathlib import Path
root=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra');out=root/'outputs';work=root/'work'/'view_clip'
blend=out/'MINIA_ALL_LINES_RISK_EDITOR_author_recovered_2610100_035_display_fixed_quad_clip.blend'
expected=json.loads((work/'VIEW_CLIP_BUILD_QA.json').read_text(encoding='utf-8'))
sys.path[:0]=[str(out/'color_author_runtime'),str(out/'selected_point_runtime'),str(out/'quad_view_runtime'),str(out/'view_clip_runtime')]
import author_scoring_runtime as ar
import view_clip_adapter as vc
mp=ar.depth.midpoint;scene=bpy.context.scene;obj=bpy.data.objects[mp.ANCHOR]
before_refs=mp._verify_references(scene)
if bpy.context.mode!='EDIT_MESH':bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
bm=bmesh.from_edit_mesh(obj.data);bm.verts.ensure_lookup_table();bm.edges.ensure_lookup_table();bm.faces.ensure_lookup_table()
vertices=len(bm.verts);edges=len(bm.edges);faces=len(bm.faces)
runpy.run_path(str(out/'MINIA_VIEW_CLIP_BOOTSTRAP.py'))
state=mp.scan_state(scene,False)
assert vertices==expected['vertices'] and edges==expected['edges'] and faces==expected['faces']
assert len(state['mid_records'])==expected['midpoints'] and len(state['edge_rows'])==expected['author_edges']
assert mp._verify_references(scene)==before_refs==expected['source_refs']
screen=bpy.context.window.screen if bpy.context.window else bpy.context.screen;area=next(a for a in screen.areas if a.type=='VIEW_3D');q=area.spaces.active.region_quadviews
assert len(q)==4 and [vc._axis_for_region(r) for r in q]==[2,1,0,None]
assert all(not r.use_clip_planes for r in q)
assert all(getattr(scene,n)==v for n,v in [('minia_clip_z_start',0.),('minia_clip_z_end',100.),('minia_clip_y_start',0.),('minia_clip_y_end',100.),('minia_clip_x_start',0.),('minia_clip_x_end',100.)])
assert all(a.spaces.active.shading.type=='SOLID' and a.spaces.active.shading.color_type=='MATERIAL' for a in screen.areas if a.type=='VIEW_3D')
result={'status':'VIEW_CLIP_FRESH_REOPEN_PASS','blend':str(blend),'blend_sha256':hashlib.sha256(blend.read_bytes()).hexdigest(),'vertices':vertices,'edges':edges,'faces':faces,'midpoints':len(state['mid_records']),'author_edges':len(state['edge_rows']),'source_guard':'PASS','source_refs':before_refs,'quad_axis_order':[2,1,0,None],'full_range_native_clip_off':True,'solid_material_colors':True,'click_pick':'NOT_TESTED: background mode has no reliable interactive quad region coordinates'}
(work/'VIEW_CLIP_FRESH_REOPEN_QA.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8');print('VIEW_CLIP_FRESH_REOPEN='+json.dumps(result,ensure_ascii=False),flush=True)
