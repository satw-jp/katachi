import bpy,bmesh,runpy,json,hashlib,math,csv
from pathlib import Path
from mathutils import Vector
W=Path(__file__).resolve().parent;O=W.parent/'outputs'
source=O/'MINIA_INTERVAL_DELETE.blend';source_sha=hashlib.sha256(source.read_bytes()).hexdigest()
data=json.loads((W/'reinforce_input.json').read_text(encoding='utf-8'));plan=json.loads((W/'reinforce_plan.json').read_text(encoding='utf-8'))
runpy.run_path(str(O/'MINIA_INTERVAL_DELETE_BOOTSTRAP.py'))
import interval_delete as d
s=bpy.context.scene;state=d.mp.scan_state(s,True)
assert state['id_to_pos']==data['positions'],'Source changed since planning'
assert state['roots']==data['roots'],'Source root registry changed since planning'
assert d.masks(s)==data['deleted'],'User deletion state changed since planning'
base_positions=dict(state['id_to_pos']);base_edges={r['ids'] for r in state['edge_rows']};base_masks=s.get(d.KEY,'[]')
bm=state['bm'];byid={sid:bm.verts[i] for i,sid in state['id_by_index'].items()}
for row in plan['added']:
    va=byid[row['a_id']];vb=byid[row['b_id']]
    assert (d.mp._world(state['obj'],va.co)-d.mp._world(state['obj'],vb.co)).length<=10.00001
    assert bm.edges.get((va,vb)) is None
    edge=bm.edges.new((va,vb));edge.select_set(False)
bmesh.update_edit_mesh(state['obj'].data,loop_triangles=False,destructive=True)
print('ADDED',len(plan['added']),flush=True)
result=d.mp.update_colors(s);assert result['status']=='CURRENT',result
after=d.mp.scan_state(s,False)
assert all(after['id_to_pos'][sid]==p for sid,p in base_positions.items())
assert base_edges<={r['ids'] for r in after['edge_rows']}
assert s[d.KEY]==base_masks
assert len(after['roots'])==len(data['roots'])+len(plan['added'])
assert d.mp._verify_references(s)==7
g,display=d.mp._graph_state(after);scores=d.mp.colorbase.score_graph(g,after['cache']['seeds'])
def metrics(edges):
    total=red=saturated=0.
    for a,b,e in edges:
        length=e['length_mm'];value=scores[frozenset((a,b))]['effective_distance_mm']
        total+=length
        if value is None or value>=25.65:red+=length
        if value is None or value>=30:saturated+=length
    return {'total_length_mm':total,'red_ge_25_65_length_mm':red,'saturated_ge_30_length_mm':saturated}
old_edges=[(a,b,e) for a,b,e in data['edges'] if g.has_edge(a,b)]
report={**plan['report'],'source_sha256':source_sha,'saved_actual_graph':metrics(list(g.edges(data=True))),'saved_existing_edges':metrics(old_edges),'old_point_positions_preserved':True,'old_author_edges_preserved':True,'user_deleted_interval_count_preserved':len(d.masks(s)),'source_reference_count':7,'new_logical_roots':len(after['roots'])-len(data['roots']),'color_update':result,'gui_launched':False,'manufacturing_geometry_changed':False}
report['remaining_red_note']='Full elimination is impossible under unchanged support-distance scoring: some interior points are farther than the red threshold even at straight-line distance to existing seeds. No palette or support-seed edits.'
s['local_reinforcement_review_json']=json.dumps(report,ensure_ascii=False,separators=(',',':'))
s['local_reinforcement_source_sha256']=source_sha
s['local_reinforcement_added_roots_json']=json.dumps([d.mp._root_id(r['a_id'],r['b_id']) for r in plan['added']])
note=bpy.data.texts.get('LOCAL_REINFORCEMENT_REVIEW') or bpy.data.texts.new('LOCAL_REINFORCEMENT_REVIEW')
note.clear();note.write('局所接続による補強案\n追加した枝は全て原寸10mm以内。新規枝同士で一直線に12mmを超える組合せも回避。\n花への2本目の接続を優先。元の編集・削除状態を維持。\n外形内確認は設計中心線と表示半径0.14mmに対するものです。印刷用の太さは未設定。\n色評価は変更していません。安全地帯から距離のある内部には赤が残ります。\n詳細はMINIA_LOCAL_REINFORCED_REVIEW.jsonと接続一覧CSVを確認。\n')
target=O/'MINIA_LOCAL_REINFORCED_REVIEW.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(target))
assert hashlib.sha256(source.read_bytes()).hexdigest()==source_sha
report['original_file_unchanged']=True
(O/'MINIA_LOCAL_REINFORCED_REVIEW.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
with (O/'MINIA_LOCAL_REINFORCED_CONNECTIONS.csv').open('w',encoding='utf-8-sig',newline='') as f:
    writer=csv.DictWriter(f,fieldnames=['a_id','b_id','length_mm','reason','certified_centerline_clearance_mm'])
    writer.writeheader();writer.writerows({k:r[k] for k in writer.fieldnames} for r in plan['added'])
print('BUILD_PASS',json.dumps(report,ensure_ascii=False),flush=True)
