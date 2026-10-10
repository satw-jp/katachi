import bpy,runpy,json,hashlib
from pathlib import Path
OUT=Path(__file__).resolve().parents[2]/'outputs'
source=OUT/'MINIA_COLOR_UPDATE_FIXED.blend'
source_sha=hashlib.sha256(source.read_bytes()).hexdigest()
obj=bpy.data.objects['AUTHOR_EDIT_ALL • protected point baseline']
before=(len(obj.data.vertices),len(obj.data.edges))
runpy.run_path(str(OUT/'MINIA_INTERVAL_DELETE_BOOTSTRAP.py'))
import interval_delete as d
s=bpy.context.scene;state=d.mp.scan_state(s,True)
assert not d.masks(s)
assert (len(state['id_by_index']),len(state['edge_rows']))==before,(before,len(state['id_by_index']),len(state['edge_rows']))
result=d.mp.update_colors(s)
assert result['status']=='CURRENT',result
assert not d.masks(s)
text=bpy.data.texts.get('MINIA_INTERVAL_DELETE_README') or bpy.data.texts.new('MINIA_INTERVAL_DELETE_README')
text.clear();text.write('区間の削除\n右パネル「区間の削除」→「区間を複数選択して削除」\n線をクリックして選択・解除。Enter / Xで削除、Escで終了。\n花へ直接接続する枝全体は保護。内部の元枝と追加枝が対象。\nFは仮線のまま。色更新で10mm以上の区間に点を追加。\n削除対象は設計用中心線で、元の印刷データは変更しません。\n起動はMINIA_INTERVAL_DELETE_START.lnkを使用。\n')
s['interval_delete_version']=1
s['interval_delete_source_sha256']=source_sha
s['interval_delete_rule']='FLOWER_DIRECT_WHOLE_BRANCH'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'MINIA_INTERVAL_DELETE.blend'))
assert hashlib.sha256(source.read_bytes()).hexdigest()==source_sha
report={'source_sha256':source_sha,'initial_vertices':before[0],'initial_edges':before[1],'deleted_intervals':len(d.masks(s)),'reference_count':d.mp._verify_references(s),'recolor':result,'source_unchanged':True}
(OUT/'MINIA_INTERVAL_DELETE_BUILD.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('BUILD_PASS',json.dumps(report),flush=True)
