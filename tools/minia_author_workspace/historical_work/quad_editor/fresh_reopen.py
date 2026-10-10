import bpy,bmesh,sys,json,runpy,hashlib
from pathlib import Path
from mathutils import Vector
root=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra');out=root/'outputs';blend=out/'MINIA_ALL_LINES_RISK_EDITOR_author_recovered_2610100_035_display_fixed_quad.blend'
runpy.run_path(str(out/'MINIA_QUAD_EDITOR_BOOTSTRAP.py'))
import author_scoring_runtime as ar
import quad_view_adapter as quad
import selected_point_overlay as marker
mp=ar.depth.midpoint;obj=bpy.data.objects[mp.ANCHOR];scene=bpy.context.scene
st=mp.scan_state(scene,False);refs=mp._verify_references(scene);screen=bpy.context.window.screen if bpy.context.window else bpy.context.screen;area=next(a for a in screen.areas if a.type=='VIEW_3D');q=area.spaces.active.region_quadviews
faces=len(bmesh.from_edit_mesh(obj.data).faces) if bpy.context.mode=='EDIT_MESH' else len(obj.data.polygons)
dirs=[tuple(round(float(x),4) for x in (v.view_rotation@Vector((0,0,1)))) for v in q]
matmax=[]
for m in bpy.data.materials:
 if m.name.startswith('MINI_A depth color'):
  n=next(n for n in m.node_tree.nodes if n.bl_idname=='ShaderNodeMapRange');matmax.append(float(n.inputs['To Max'].default_value))
regions=[r for r in area.regions if r.type=='WINDOW'];rects=[{'x':r.x,'y':r.y,'width':r.width,'height':r.height} for r in regions]
regionqa=[]
for r in regions:
 if r.width>1 and r.height>1:
  ev=type('Event',(),{'mouse_x':r.x+r.width//2,'mouse_y':r.y+r.height//2})();ctx=type('Ctx',(),{'area':area,'window':bpy.context.window,'screen':screen})();hit,rd=quad._window_region_data(ctx,ev);regionqa.append({'expected':r.as_pointer(),'selected':hit.as_pointer() if hit else None,'region_data':bool(rd),'exact_region':hit==r})
result={'status':'QUAD_FRESH_REOPEN_PASS','blend_sha256':hashlib.sha256(blend.read_bytes()).hexdigest(),'vertices':len(obj.data.vertices),'edges':len(obj.data.edges),'faces':faces,'midpoints':len(st['mid_records']),'author_edges':len(st['edge_rows']),'author_roots':len(st['roots']),'source_refs':refs,'source_guard':'PASS','qview_count':len(q),'ortho_all':all(v.view_perspective=='ORTHO' for v in q),'eye_directions':dirs,'window_region_count':len(regions),'window_region_rects':rects,'region_context_test':regionqa,'picker_adapter_installed':mp._screen_pick is quad._quad_pick,'marker_adapter_installed':marker._draw is quad._marker_draw,'marker_handler_registered':marker._HANDLER is not None,'depth_disabled':scene.get('quadview_depth_disabled'),'depth_to_max_minmax':[min(matmax),max(matmax)],'geometry_altered':False,'actual_GUI_click_test':'UNVERIFIED'}
assert result['qview_count']==4 and result['ortho_all'] and faces==0 and result['source_guard']=='PASS' and result['picker_adapter_installed'] and result['marker_adapter_installed'] and min(matmax)==1.0 and max(matmax)==1.0
(out/'MINIA_ALL_LINES_RISK_EDITOR_QUAD_FRESH_REOPEN_QA.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
print('QUAD_FRESH='+json.dumps(result,ensure_ascii=False),flush=True)
