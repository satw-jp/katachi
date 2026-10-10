import bpy,runpy,json,math,hashlib
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
W=Path(__file__).resolve().parent;O=W.parent/'outputs'
runpy.run_path(str(O/'MINIA_LOWER50_BOOTSTRAP.py'))
import interval_delete as d
import flower_reroute as rr
plan=json.loads((W/'lower50_plan.json').read_text(encoding='utf-8'));original=json.loads((W/'lower50_input.json').read_text(encoding='utf-8'));report=json.loads((O/'MINIA_LOWER50_BRANCHING_REVIEW.json').read_text(encoding='utf-8'))
s=bpy.context.scene;st=d.mp.scan_state(s,False);g,display=d.mp._graph_state(st)
assert all(st['id_to_pos'][k]==v for k,v in original['positions'].items())
assert d.masks(s)==original['deleted']+[r['mask'] for r in plan['replacements']]
assert d.mp._verify_references(s)==7
hp=Path(r'J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_D6_SIZE_RHYTHM_V2\data\host.npz')
h=np.load(hp);v=h['vertices']*original['source_to_plate']['scale']+np.array(original['source_to_plate']['translation_mm']);host=BVHTree.FromPolygons(v.tolist(),h['faces'].tolist(),all_triangles=True)
def depth(p):
    q,n,f,length=host.find_nearest(p);return length if (p-q).dot(n)<0 else -length
def node(sid):return st['cache']['anchors'].get(sid,sid)
zlo,zhi=plan['report']['z_range_mm'];minimum=math.inf
for r in plan['added']:
    a,b=[Vector(st['id_to_pos'][r[k]]) for k in ('a_id','b_id')];length=(b-a).length
    assert length<=8.0001 and all(zlo-1e-4<=p.z<=zhi+1e-4 for p in (a,b))
    assert g.has_edge(node(r['a_id']),node(r['b_id']))
    n=max(1,math.ceil(length/.2));bound=min(depth(a.lerp(b,i/n)) for i in range(n+1))-length/n/2
    assert bound>=.14-1e-4,(r,bound)
    minimum=min(minimum,bound)
roots={r['root_id']:r for r in st['roots']}
for r in plan['replacements']:
    a,w,b=[Vector(st['id_to_pos'][sid]) for sid in r['path']]
    assert math.degrees((w-a).angle(b-w))>=24.99
    assert max((w-a).length,(b-w).length)<=6.0001
    assert g.degree(node(r['path'][1]))>=3
    for p,q in zip(r['path'],r['path'][1:]):assert d.root_protected(s,roots[d.mp._root_id(p,q)])
for r in plan['new_points']:
    assert r['id'] in st['id_to_pos']
    if 'branch_target' in r:assert g.degree(node(r['id']))>=3 and g.has_edge(node(r['id']),node(r['branch_target']))
# The replacement exemption must not allow deleting a replacement leg.
saved=s[d.KEY];p,q=plan['replacements'][0]['path'][:2];rid=d.mp._root_id(p,q)
s[d.KEY]=json.dumps(d.masks(s)+[{'kind':'author','root':rid,'lo':0.,'hi':1.}])
try:rr.validate(s,st['roots'],st['cache'])
except RuntimeError:pass
else:raise AssertionError('Critical replacement leg deletion accepted')
s[d.KEY]=saved;rr.validate(s,st['roots'],st['cache'])
result=d.mp.update_colors(s);assert result['status']=='CURRENT',result
assert hashlib.sha256((O/'MINIA_DEEP_BRANCH_REVIEW.blend').read_bytes()).hexdigest()==report['source_sha256']
report.update(save_reopen='PASS',recolor_after_reopen='PASS',replacement_leg_protection='PASS',independent_geometry_check='PASS',minimum_saved_line_clearance_mm=minimum)
report['red_length_reduction_percent']=100*(1-report['actual_red_length_mm']/report['before']['red_length_mm'])
(O/'MINIA_LOWER50_BRANCHING_REVIEW.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
(O/'MINIA_LOWER50_README.txt').write_text(f'''Z 0〜50% 枝の折れ・分岐案
起動: MINIA_LOWER50_BRANCHING_REVIEW_START.lnk
元データ: MINIA_DEEP_BRANCH_REVIEW.blend（変更なし）
花につながる長い部材: {report['rerouted_intervals']}区間を折れた経路へ置換、{report['branched_midpoints']}箇所に途中分岐。
折れた経路は既存の内側の枝と合流。各脚6mm以内・折れ25度以上。
分岐部分は点を置いただけではなく、別の枝に接続。
その他の追加接続も8mm以内。新しい線の全体が0〜50%に収まります。
元の点と削除26件を保持。外周内確認（中心線＋表示半径0.14mm）と保存後再読み込みはPASS。

未達: 赤の全消去。赤い区間長の減少は{report['red_length_reduction_percent']:.1f}%です。
内部の支持点まで直線でも約57mm離れる点があり、現在の距離評価では赤が残ります。
既存の接続を壊すか短い内向きの経路が確保できない長材は残しています。
色の評価基準・支持点は変更していません。印刷用の太さ・実体化・強度検証は未実施。
詳細: MINIA_LOWER50_BRANCHING_REVIEW.json / MINIA_LOWER50_CHANGES.json
''',encoding='utf-8-sig')
print('VERIFY_PASS',report['red_length_reduction_percent'],minimum,flush=True)
