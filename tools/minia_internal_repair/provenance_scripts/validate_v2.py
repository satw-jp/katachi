import bpy,sys,json,time
from pathlib import Path
OUT=Path(bpy.data.filepath).resolve().parent
sys.path.insert(0,str(OUT));sys.path.insert(0,str(OUT/'route_runtime'))
import MINIA_ROUTE_BOOTSTRAP
import ctypes,ctypes.wintypes,time
started_wall=time.perf_counter()
class PMC(ctypes.Structure):
 _fields_=[('cb',ctypes.wintypes.DWORD),('PageFaultCount',ctypes.wintypes.DWORD),('PeakWorkingSetSize',ctypes.c_size_t),('WorkingSetSize',ctypes.c_size_t),('QuotaPeakPagedPoolUsage',ctypes.c_size_t),('QuotaPagedPoolUsage',ctypes.c_size_t),('QuotaPeakNonPagedPoolUsage',ctypes.c_size_t),('QuotaNonPagedPoolUsage',ctypes.c_size_t),('PagefileUsage',ctypes.c_size_t),('PeakPagefileUsage',ctypes.c_size_t)]
def memory_stats():
 c=PMC();c.cb=ctypes.sizeof(c)
 kernel32=ctypes.WinDLL('kernel32',use_last_error=True);psapi=ctypes.WinDLL('psapi',use_last_error=True)
 kernel32.GetCurrentProcess.restype=ctypes.wintypes.HANDLE
 psapi.GetProcessMemoryInfo.argtypes=[ctypes.wintypes.HANDLE,ctypes.POINTER(PMC),ctypes.wintypes.DWORD];psapi.GetProcessMemoryInfo.restype=ctypes.wintypes.BOOL
 ok=psapi.GetProcessMemoryInfo(kernel32.GetCurrentProcess(),ctypes.byref(c),c.cb)
 return {'working_set_mb':round(c.WorkingSetSize/1048576,1),'peak_working_set_mb':round(c.PeakWorkingSetSize/1048576,1)} if ok else {'memory_status':'unavailable'}
boot=MINIA_ROUTE_BOOTSTRAP.register_for_current_file()
import route_v2_panel as p
scene=bpy.context.scene
checks={'bootstrap':boot,'initial_state':scene.get('route_state'),'initial_edit_count':json.loads(scene['route_summary_json'])['edit_count']}
assert checks['initial_state']=='CURRENT' and checks['initial_edit_count']==0
scene.route_height=43.4
checks['height_marks_stale']=scene.get('route_state')=='STALE'
assert checks['height_marks_stale']
scene.route_height=43.2;r=p.reevaluate(scene);checks['height_reset_current']=r['status']=='CURRENT'
scene.route_mode='PERMANENT_ONLY_AFTER_REMOVAL'
checks['mode_marks_stale']=scene.get('route_state')=='STALE'
r=p.reevaluate(scene);checks['43_2_perm_graph_count']=r['after']['targets'][0]['graph_count']
scene.route_mode='PRINTING_WITH_SUPPORT';scene.route_height=43.2;scene.route_failure_kind='joint';p._failure_items(None,None);scene.route_failure_id=next(k for k,v in p._FAILURE_ITEM_MAP.items() if v==('joint','G0181|A3457'))
r=p.reevaluate(scene);checks['joint_failure_kind']=r['after']['failure_impact']['failure_kind'];checks['joint_failure_id']=r['after']['failure_impact']['failure_id'];checks['joint_impact']=r['after']['failure_impact']
assert checks['joint_failure_kind']=='joint'
# Stable failure selection survives a height where the ID may be absent.
scene.route_failure_kind='branch';p._failure_items(None,None);token=next(k for k,v in p._FAILURE_ITEM_MAP.items() if v==('branch','A3457'));scene.route_failure_id=token
scene.route_height=30.0;r30=p.reevaluate(scene);p._failure_items(None,None);checks['A3457_selected_token_stable_at30']=scene.route_failure_id==token;checks['A3457_height30_present']=r30['after']['failure_impact'].get('failure_present_in_graph');checks['A3457_height30_status']=r30['after']['failure_impact'].get('failure_status');checks['A3457_display_label']=[x[1] for x in p._failure_items(None,None) if x[0]==token][0]
scene.route_height=43.2;r432=p.reevaluate(scene);p._failure_items(None,None);checks['A3457_selected_token_stable_at43_2']=scene.route_failure_id==token;checks['A3457_height43_2_present']=r432['after']['failure_impact'].get('failure_present_in_graph')
# TEST_ONLY_001: add exactly the bounded line used in parent fixture, to the DEMO anchor mesh.
obj=bpy.data.objects['AUTHOR_EDIT_DEMO • 24 endpoints, select two then F']
ledger,_=p._load_ledger(scene);rows=[{x['id']:x for x in ledger['records']}[mid] for mid in ledger['demo']['member_ids']]
expected=p._expected_rows(rows)
lookup={x['anchor_id']:i for i,x in enumerate(expected)}
edge=(lookup['R5_F3457_P1:END'],lookup['G0165:END'])
mesh=obj.data;mesh.edges.add(1);mesh.edges[-1].vertices=sorted(edge);mesh.update()
audit=p.extract_current_edits(scene);checks['test_edit_id']=audit['edits'][0]['id'];checks['test_edge_count']=audit['edge_count'];checks['test_edit_issues']=audit['issues']
assert audit['edge_count']==1 and not audit['issues']
p.poll_ui_state();checks['edit_marks_stale']=scene.get('route_state')=='STALE';checks['edit_overlay_hidden']=bpy.data.collections['ROUTE_OVERLAY'].hide_viewport
scene.route_mode='PERMANENT_ONLY_AFTER_REMOVAL';scene.route_height=43.2
before_after=p.reevaluate(scene);checks['test_edit_graph_before']=before_after['before']['targets'][0]['graph_count'];checks['test_edit_graph_after']=before_after['after']['targets'][0]['graph_count'];checks['edit_overlay']=before_after['overlay']
checks['height_event_evidence']='MINIA_LAYERWISE_ROUTE_VISUALIZER_V2_HEIGHT_EVENT_EVIDENCE.json; not rerun in this pass'
# EditMode BMesh live edits are polled; explicit reevaluation must HOLD.
bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.mode_set(mode='EDIT');import bmesh;bm=bmesh.from_edit_mesh(obj.data);bm.verts.ensure_lookup_table();edge2=(lookup['R5_F3457_P1:START'],lookup['G0165:START']);bm.edges.new((bm.verts[edge2[0]],bm.verts[edge2[1]]));bmesh.update_edit_mesh(obj.data);p.poll_ui_state();checks['edit_mode_poll_stale']=scene.get('route_state')=='STALE';checks['edit_mode_overlay_hidden']=bpy.data.collections['ROUTE_OVERLAY'].hide_viewport;hold=p.reevaluate(scene);checks['edit_mode_hold']=hold.get('status')=='HOLD';bpy.ops.object.mode_set(mode='OBJECT')
# Persist only a test fixture, never the author V2 file.
fixture=Path(__file__).resolve().parent/'MINIA_LAYERWISE_ROUTE_VISUALIZER_V2_TEST_ONLY.blend';bpy.ops.wm.save_as_mainfile(filepath=str(fixture))
checks['test_fixture']=str(fixture);checks['author_v2_edit_count']=0
checks['full_validation_wall_s']=round(time.perf_counter()-started_wall,2);checks['memory']=memory_stats()
# This process's author file was cloned before test edit; V2 delivered blend remains clean.
(OUT/'MINIA_LAYERWISE_ROUTE_VISUALIZER_V2_TEST_RESULTS.json').write_text(json.dumps(checks,indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps(checks,indent=2,ensure_ascii=False),flush=True)
