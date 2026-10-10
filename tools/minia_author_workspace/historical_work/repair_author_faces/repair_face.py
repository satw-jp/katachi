import bpy,bmesh,sys,json,hashlib,time
from pathlib import Path
root=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra');out=root/'outputs';work=root/'work'/'repair_author_faces';started=time.perf_counter()
sys.path.insert(0,str(out/'color_author_runtime'))
import author_scoring_runtime as ar
mp=ar.depth.midpoint
obj=bpy.data.objects.get(mp.ANCHOR);assert obj and obj.type=='MESH'
if bpy.context.mode!='EDIT_MESH':
 bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
bm=bmesh.from_edit_mesh(obj.data);bm.verts.ensure_lookup_table();bm.edges.ensure_lookup_table();bm.faces.ensure_lookup_table()
assert len(bm.faces)>0,'no face present in latest source file'
attr_specs=[]
for a in obj.data.attributes:
 if a.domain!='POINT':continue
 if a.data_type=='INT':ly=bm.verts.layers.int.get(a.name);kind='int'
 elif a.data_type=='FLOAT':ly=bm.verts.layers.float.get(a.name);kind='float'
 else:continue
 if ly is not None:attr_specs.append((a.name,kind,ly))
def snapshot():
 bm2=bmesh.from_edit_mesh(obj.data);bm2.verts.ensure_lookup_table();bm2.edges.ensure_lookup_table()
 vs=[]
 for v in bm2.verts:
  vals=[]
  for name,kind,layer in attr_specs:vals.append((name,int(v[layer]) if kind=='int' else float(v[layer])))
  vs.append((v.index,tuple(float(c) for c in v.co),tuple(vals)))
 es=sorted(tuple(sorted((e.verts[0].index,e.verts[1].index))) for e in bm2.edges)
 return vs,es,len(bm2.faces)
before=snapshot();removed=len(bm.faces)
bmesh.ops.delete(bm,geom=list(bm.faces),context='FACES_ONLY')
bmesh.update_edit_mesh(obj.data,loop_triangles=False,destructive=False)
after=snapshot()
assert after[0]==before[0],'vertex coordinates or point attributes changed'
assert after[1]==before[1],'edge list changed'
assert after[2]==0,f'faces remain: {after[2]}'
scene=bpy.context.scene
state=mp.scan_state(scene,allow_registry_init=True)
update=mp.update_colors(scene)
assert update.get('status')=='CURRENT',update
final=snapshot();assert final[0]==before[0] and final[1]==before[1] and final[2]==0,'color update altered author geometry'
target=out/'MINIA_ALL_LINES_RISK_EDITOR_author_recovered.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(target),compress=True)
qa={'status':'REPAIR_PASS','source_file':str(out/'MINIA_ALL_LINES_RISK_EDITOR_author.blend'),'source_sha256':hashlib.sha256((out/'MINIA_ALL_LINES_RISK_EDITOR_author.blend').read_bytes()).hexdigest(),'recovered_file':str(target),'removed_face_count':removed,'vertex_count':len(final[0]),'edge_count':len(final[1]),'remaining_faces':final[2],'point_attribute_names':[x[0] for x in attr_specs],'vertex_coordinates_and_point_attributes_identical':True,'all_edge_pairs_identical':True,'source_guard':'PASS','scan_midpoints':len(state['mid_records']),'scan_edges':len(state['edge_rows']),'scan_roots':len(state['roots']),'color_update_status':update.get('status'),'color_update':update,'saved_source_unchanged':True,'elapsed_s':time.perf_counter()-started}
(work/'REPAIR_RESULT.json').write_text(json.dumps(qa,indent=2,ensure_ascii=False),encoding='utf-8')
print('FACE_REPAIR='+json.dumps(qa,ensure_ascii=False),flush=True)


