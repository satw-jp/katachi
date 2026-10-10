import bpy,runpy,json,math,hashlib
from pathlib import Path
W=Path(__file__).resolve().parent;O=W.parent/'outputs'
runpy.run_path(str(O/'MINIA_INTERVAL_DELETE_BOOTSTRAP.py'))
import interval_delete as d
s=bpy.context.scene;st=d.mp.scan_state(s,False)
plan=json.loads((W/'reinforce_plan.json').read_text(encoding='utf-8'))
original=json.loads((W/'reinforce_input.json').read_text(encoding='utf-8'))
report=json.loads((O/'MINIA_LOCAL_REINFORCED_REVIEW.json').read_text(encoding='utf-8'))
roots={r['root_id']:r for r in st['roots']}
for r in plan['added']:
    root=roots[d.mp._root_id(r['a_id'],r['b_id'])]
    assert math.dist(root['a_position'],root['b_position'])<=10.00001
    assert set((root['a_id'],root['b_id']))==set((r['a_id'],r['b_id']))
assert st['id_to_pos']==original['positions']
assert d.masks(s)==original['deleted']
assert d.mp._verify_references(s)==7
assert s['midpoint_editor_state']=='CURRENT'
assert hashlib.sha256((O/'MINIA_INTERVAL_DELETE.blend').read_bytes()).hexdigest()==report['source_sha256']
report['save_reopen_verification']='PASS'
report['saved_blend_sha256']=hashlib.sha256((O/'MINIA_LOCAL_REINFORCED_REVIEW.blend').read_bytes()).hexdigest()
report['existing_red_length_reduction_percent']=100*(1-report['saved_existing_edges']['red_ge_25_65_length_mm']/report['before']['red_ge_25_65_length_mm'])
report['all_red_length_reduction_percent_including_additions']=100*(1-report['saved_actual_graph']['red_ge_25_65_length_mm']/report['before']['red_ge_25_65_length_mm'])
(O/'MINIA_LOCAL_REINFORCED_REVIEW.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
summary=f'''MINIA 局所補強案（確認用）

起動: MINIA_LOCAL_REINFORCED_REVIEW_START.lnk
元ファイル: MINIA_INTERVAL_DELETE.blend（変更なし）

「30くらいまで」は下側Z 0〜30%を参考に全体を補強する意味として実施。
新規接続: {len(plan['added'])}本、最長9.99mm。
花への2本目の接続: 2,240箇所。
直接複数接続を持つ花: 932 → 3,172 / 4,283。
新規線同士がほぼ一直線につながり12mmを超える組合せは除外。
元の点・線・26件の削除状態を保持。

赤い区間長（同じ距離評価、25.65mm以上）:
既存線のみ: {report['existing_red_length_reduction_percent']:.1f}%減。
新規線を含めた総量: {report['all_red_length_reduction_percent_including_additions']:.1f}%減。
赤は残っています。安全地帯からの直線距離でも閾値を超える内部があるため、
この評価基準と既存の支持点のまま全消去はできません。色の基準は変更していません。

外周チェック: 元の閉じた外形と照合。全追加中心線と表示半径0.14mmが内側。
印刷用の枝の太さ・実体化・スライス・強度確認は今回実施していません。
保存後再読み込み: PASS。GUIは起動せずに検証。
接続詳細: MINIA_LOCAL_REINFORCED_CONNECTIONS.csv
検証詳細: MINIA_LOCAL_REINFORCED_REVIEW.json
'''
(O/'MINIA_LOCAL_REINFORCED_README.txt').write_text(summary,encoding='utf-8-sig')
print('VERIFY_PASS',report['existing_red_length_reduction_percent'],report['all_red_length_reduction_percent_including_additions'],flush=True)
