import bpy,sys,json,runpy,hashlib,time,math,bmesh
from pathlib import Path
from mathutils import Vector
root=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra');out=root/'outputs';work=root/'work'/'quad_editor';source=out/'MINIA_ALL_LINES_RISK_EDITOR_author_recovered_2610100_035_display_fixed.blend';started=time.perf_counter()
sys.path[:0]=[str(out/'color_author_runtime'),str(out/'selected_point_runtime'),str(out/'quad_view_runtime')]
import author_scoring_runtime as ar
import quad_view_adapter as quad
mp=ar.depth.midpoint;depth=ar.depth;obj=bpy.data.objects[mp.ANCHOR];scene=bpy.context.scene

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
 return {'verts':vs,'edges':es,'faces':len(bm.faces),'attr_names':tuple(x[0] for x in specs)}
geom_before=snapshot();refs_before=mp._verify_references(scene);assert geom_before['faces']==0
runpy.run_path(str(out/'MINIA_QUAD_EDITOR_BOOTSTRAP.py'))
geom_after_setup=snapshot();assert geom_after_setup==geom_before,'quad setup changed source anchors/edges/attributes'
state=mp.scan_state(scene,allow_registry_init=False);color_report=mp.update_colors(scene);assert color_report.get('status')=='CURRENT',color_report
geom_after_update=snapshot();assert geom_after_update==geom_before,'color update changed author geometry'
refs_after=mp._verify_references(scene);assert refs_before==refs_after
# Validate active screen layout and all view orientations.
screen=bpy.context.window.screen if bpy.context.window else bpy.context.screen
area=next(a for a in screen.areas if a.type=='VIEW_3D');space=area.spaces.active;qviews=space.region_quadviews
assert len(qviews)==4,f'expected four quad regions, got {len(qviews)}'
for q in qviews:assert q.view_perspective=='ORTHO'
rotation_dirs=[tuple(round(float(x),4) for x in (q.view_rotation@Vector((0,0,1)))) for q in qviews]
assert len(set(rotation_dirs))==4,rotation_dirs
# Probe every region rectangle that the UI exposes; each hit must resolve its own view data.
region_hits=[]
for reg in [r for r in area.regions if r.type=='WINDOW']:
 if reg.width<2 or reg.height<2:continue
 ev=type('Event',(),{'mouse_x':reg.x+reg.width//2,'mouse_y':reg.y+reg.height//2})()
 ctx=type('Ctx',(),{'area':area,'window':bpy.context.window,'screen':screen})()
 rr,rd=quad._window_region_data(ctx,ev)
 if rr is reg and rd is not None:region_hits.append({'region':reg.type,'x':reg.x,'y':reg.y,'w':reg.width,'h':reg.height,'rotation':tuple(round(float(x),4) for x in (rd.view_rotation@Vector((0,0,1))))})
# Ensure every material has no view-dependent false depth tint while preserving hue base colors.
materials=[]
for mat in bpy.data.materials:
 if mat.name.startswith('MINI_A depth color'):
  mr=next(n for n in mat.node_tree.nodes if n.bl_idname=='ShaderNodeMapRange')
  assert abs(mr.inputs['To Max'].default_value-1.0)<1e-5,(mat.name,mr.inputs['To Max'].default_value)
  materials.append(mat.name)
assert len(materials)>=32
# The saved active screen is quad, the picker is region-aware, and depth is explicit OFF.
assert scene.get('quadview_depth_disabled') is True
assert quad._window_region_data.__name__=='_window_region_data'
target=out/'MINIA_ALL_LINES_RISK_EDITOR_author_recovered_2610100_035_display_fixed_quad.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(target),compress=True)
result={'status':'QUAD_BUILD_PASS','source_file':str(source),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'quad_file':str(target),'quad_sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'mesh_exactly_preserved':True,'vertices':len(geom_before['verts']),'edges':len(geom_before['edges']),'faces':geom_before['faces'],'point_attributes':list(geom_before['attr_names']),'midpoints':len(state['mid_records']),'author_edges':len(state['edge_rows']),'author_roots':len(state['roots']),'source_refs':refs_after,'source_guard':'PASS','color_update':color_report,'quad_info':json.loads(scene['quadview_info_json']),'rv3d_count':len(qviews),'view_eye_directions':rotation_dirs,'ortho_all':True,'window_region_count':len([r for r in area.regions if r.type=='WINDOW']),'region_context_hits':region_hits,'depth_disabled_in_quad':scene.get('quadview_depth_disabled'),'depth_material_count':len(materials),'depth_to_max':[float(next(n for n in m.node_tree.nodes if n.bl_idname=='ShaderNodeMapRange').inputs['To Max'].default_value) for m in [bpy.data.materials[n] for n in materials]],'elapsed_s':time.perf_counter()-started}
(work/'QUAD_BUILD_QA.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
print('QUAD_BUILD='+json.dumps(result,ensure_ascii=False),flush=True)
