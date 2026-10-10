import bpy,runpy,json,math,hashlib
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
W=Path(__file__).resolve().parent;O=W.parent/'outputs'
runpy.run_path(str(O/'MINIA_INTERVAL_DELETE_BOOTSTRAP.py'))
import interval_delete as d
s=bpy.context.scene;st=d.mp.scan_state(s,False)
plan=json.loads((W/'deep_reinforce_plan.json').read_text(encoding='utf-8'))
original=json.loads((W/'reinforce_input.json').read_text(encoding='utf-8'))
report=json.loads((O/'MINIA_DEEP_BRANCH_REVIEW.json').read_text(encoding='utf-8'))
hp=Path(r'J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_D6_SIZE_RHYTHM_V2\data\host.npz')
h=np.load(hp);verts=h['vertices']*original['source_to_plate']['scale']+np.array(original['source_to_plate']['translation_mm'])
host=BVHTree.FromPolygons(verts.tolist(),h['faces'].tolist(),all_triangles=True)
def depth(p):
    q,n,face,length=host.find_nearest(p)
    return length if (p-q).dot(n)<0 else -length
normals={f['id']:Vector(f['normal']).normalized() for f in original['flowers']}
roots={r['root_id']:r for r in st['roots']};depths=[];gains=[];cosines=[];minimum=math.inf
for r in plan['added']:
    root=roots[d.mp._root_id(r['a_id'],r['b_id'])]
    a=Vector(st['id_to_pos'][r['a_id']]);b=Vector(st['id_to_pos'][r['b_id']]);length=(b-a).length
    assert length<=10.00001
    assert set((root['a_id'],root['b_id']))==set((r['a_id'],r['b_id']))
    if r['reason']=='flower_second_branch':
        dep=depth(b);gain=dep-depth(a);cos=(b-a).normalized().dot(-normals[r['flower_id']])
        assert dep>=5.-1e-5 and gain>=4.-1e-5 and cos>=.7-1e-5
        depths.append(dep);gains.append(gain);cosines.append(cos)
    else:assert min(depth(a),depth(b))>=4.-1e-5
    n=max(1,math.ceil(length/.2));bound=min(depth(a.lerp(b,i/n)) for i in range(n+1))-length/n/2
    assert bound>=.14-1e-5
    minimum=min(minimum,bound)
assert st['id_to_pos']==original['positions']
assert d.masks(s)==original['deleted']
assert d.mp._verify_references(s)==7
assert s['midpoint_editor_state']=='CURRENT'
assert hashlib.sha256((O/'MINIA_INTERVAL_DELETE.blend').read_bytes()).hexdigest()==report['source_sha256']
report.update(save_reopen_verification='PASS',independent_saved_geometry_check='PASS',flower_target_depth_min_mm=min(depths),flower_depth_gain_min_mm=min(gains),flower_inward_cosine_min=min(cosines),independent_line_clearance_min_mm=minimum)
report['saved_blend_sha256']=hashlib.sha256((O/'MINIA_DEEP_BRANCH_REVIEW.blend').read_bytes()).hexdigest()
report['existing_red_length_reduction_percent']=100*(1-report['saved_existing_edges']['red_ge_25_65_length_mm']/report['before']['red_ge_25_65_length_mm'])
report['all_red_length_change_percent_including_additions']=100*(report['saved_actual_graph']['red_ge_25_65_length_mm']/report['before']['red_ge_25_65_length_mm']-1)
(O/'MINIA_DEEP_BRANCH_REVIEW.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
(O/'MINIA_DEEP_BRANCH_README.txt').write_text(f'''奥の枝へ接続する補強案
起動: MINIA_DEEP_BRANCH_REVIEW_START.lnk
あなたが編集したMINIA_INTERVAL_DELETE.blendから再作成。前回案の追加線は引き継いでいません。
花から奥への接続: {len(depths)}箇所。接続先は外形から5mm以上内側、花側より4mm以上深い点。
花の面の法線に対して内向き45.6度以内。花・表層同士の横つなぎを除外。
その他の追加線は両端が外形から4mm以上内側。
追加線全体: {len(plan['added'])}本。すべて10mm以内。
元の点・線・削除26件を維持。保存後の再読み込みと外形内チェックはPASS。
赤は未解消です。既存線の赤い区間長は{report['existing_red_length_reduction_percent']:.1f}%減。
追加線込みの赤い区間長は元データ比{report['all_red_length_change_percent_including_additions']:+.1f}%です。
外周チェックは設計中心線と表示半径0.14mmに対するもの。印刷用の太さ・実体化は未実施。
接続一覧: MINIA_DEEP_BRANCH_CONNECTIONS.csv
検証詳細: MINIA_DEEP_BRANCH_REVIEW.json
''',encoding='utf-8-sig')
print('VERIFY_PASS',json.dumps({k:report[k] for k in ('flower_target_depth_min_mm','flower_depth_gain_min_mm','flower_inward_cosine_min','existing_red_length_reduction_percent','all_red_length_change_percent_including_additions')}),flush=True)
