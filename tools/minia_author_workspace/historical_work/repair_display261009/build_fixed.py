import bpy,sys,json,runpy,hashlib,time
from pathlib import Path
import bmesh
root=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra');out=root/'outputs';work=root/'work'/'repair_display261009';source=out/'MINIA_ALL_LINES_RISK_EDITOR_author_recovered_261009.blend';started=time.perf_counter()
sys.path.insert(0,str(out/'color_author_runtime'));sys.path.insert(0,str(out/'selected_point_runtime'))
import author_scoring_runtime as ar
mp=ar.depth.midpoint;depth=ar.depth;obj=bpy.data.objects[mp.ANCHOR];scene=bpy.context.scene
# Snapshot the live author mesh, including every POINT-domain scalar attribute.
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
 vs=[]
 for v in bm.verts:
  attrs=tuple((n,int(v[l]) if k=='int' else float(v[l])) for n,k,l in specs)
  vs.append((v.index,tuple(float(c) for c in v.co),attrs))
 es=tuple(sorted(tuple(sorted((e.verts[0].index,e.verts[1].index))) for e in bm.edges))
 return {'verts':tuple(vs),'edges':es,'faces':len(bm.faces),'attr_names':tuple(x[0] for x in specs)}
geom_before=snapshot();refs_before=mp._verify_references(scene)
assert geom_before['faces']==0
# Install the new idempotent wrapper, runtime, marker, and shortcut setup.
runpy.run_path(str(out/'MINIA_DISPLAY_FIXED_BOOTSTRAP.py'))
geom_after_register=snapshot();assert geom_after_register==geom_before,'bootstrap changed author geometry'
state=mp.scan_state(scene,allow_registry_init=False)
color_report=mp.update_colors(scene);assert color_report.get('status')=='CURRENT',color_report
geom_after_update=snapshot();assert geom_after_update==geom_before,'color update changed author geometry'
refs_after=mp._verify_references(scene);assert refs_before==refs_after
# Confirm all depth material nodes keep the corrected range after color update.
materials=[]
for mat in bpy.data.materials:
 if not mat.name.startswith('MINI_A depth color'):continue
 nodes=list(mat.node_tree.nodes);mr=next((n for n in nodes if n.bl_idname=='ShaderNodeMapRange'),None)
 dot=next((n for n in nodes if n.bl_idname=='ShaderNodeVectorMath' and n.operation=='DOT_PRODUCT'),None)
 assert mr and abs(mr.inputs['To Max'].default_value-.16)<1e-5,(mat.name,mr.inputs['To Max'].default_value if mr else None)
 materials.append({'name':mat.name,'from_min':float(mr.inputs['From Min'].default_value),'from_max':float(mr.inputs['From Max'].default_value),'to_min':float(mr.inputs['To Min'].default_value),'to_max':float(mr.inputs['To Max'].default_value),'forward':list(dot.inputs[1].default_value) if dot else None})
assert len(materials)>=32
# A small render is attempted only when the saved file already has a camera.
preview_status='SKIPPED_NO_CAMERA';camera_count=sum(1 for o in scene.objects if o.type=='CAMERA')
if scene.camera:
 render=scene.render;old=(render.resolution_x,render.resolution_y,render.resolution_percentage,render.filepath)
 render.resolution_x=640;render.resolution_y=480;render.resolution_percentage=60;render.filepath=str(out/'MINIA_ALL_LINES_RISK_EDITOR_DISPLAY_FIXED_PREVIEW.png')
 try:bpy.ops.render.render(write_still=True);preview_status='RENDERED_640x480'
 except Exception as e:preview_status='RENDER_FAILED_'+repr(e)[:180]
 finally:render.resolution_x,render.resolution_y,render.resolution_percentage,render.filepath=old
# Save a distinct repair copy. Source scene is not overwritten.
target=out/'MINIA_ALL_LINES_RISK_EDITOR_author_recovered_261009_display_fixed.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(target),compress=True)
result={'status':'DISPLAY_FIX_BUILD_PASS','source_file':str(source),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'fixed_file':str(target),'fixed_sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'depth_factor':depth.FAR_FACTOR,'range_trim_fraction':0.10,'range_wrapper_idempotent':hasattr(depth,'_display_fix_base_range'),'original_geometry_exactly_preserved':True,'vertex_count':len(geom_before['verts']),'edge_count':len(geom_before['edges']),'faces':geom_before['faces'],'point_attributes':list(geom_before['attr_names']),'source_reference_count':refs_after,'source_guard':'PASS','midpoints':len(state['mid_records']),'author_edges':len(state['edge_rows']),'author_roots':len(state['roots']),'color_update_status':color_report.get('status'),'color_report':color_report,'depth_material_count':len(materials),'depth_nodes_after_color_update':materials,'viewport_states':[{'shading':a.spaces.active.shading.type,'overlays':a.spaces.active.overlay.show_overlays,'wireframe':a.spaces.active.overlay.show_wireframes,'clip_start':a.spaces.active.clip_start,'clip_end':a.spaces.active.clip_end} for s in bpy.data.screens for a in s.areas if a.type=='VIEW_3D'],'camera_count':camera_count,'preview':preview_status,'old_source_not_saved':True,'elapsed_s':time.perf_counter()-started}
(work/'DISPLAY_FIX_BUILD_QA.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
print('DISPLAY_FIX_BUILD='+json.dumps(result,ensure_ascii=False),flush=True)
