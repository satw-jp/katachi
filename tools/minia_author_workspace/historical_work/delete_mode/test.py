import bpy,runpy,json,sys,time
from pathlib import Path
OUT=Path(__file__).resolve().parents[2]/'outputs'
runpy.run_path(str(OUT/'MINIA_INTERVAL_DELETE_BOOTSTRAP.py'))
import interval_delete as d
s=bpy.context.scene
state=d.mp.scan_state(s,True)
print('STATE',len(state['id_by_index']),len(state['edge_rows']),flush=True)
items=d.catalog(state)
print('CATALOG',len(items),'PROTECTED',len(d.protection(s)[0]),flush=True)
counts={k:sum(r['kind']==k and not r['protected'] for r in items.values()) for k in ('source','author')}
print('DELETABLE',counts,flush=True)
protected=next(k for k,r in items.items() if r['protected'])
try:d.delete_intervals(s,{protected})
except RuntimeError as e:print('PROTECTED_REJECTED',str(e),flush=True)
else:raise AssertionError('Protection failed')
assert s.get(d.KEY,'[]')=='[]'
before_pos={k:tuple(p) for k,p in state['id_to_pos'].items()}
chosen=[]
for kind in ('source','author'):
    chosen.extend([k for k,r in items.items() if r['kind']==kind and not r['protected']][:2])
assert len(chosen)==4
print('CHOSEN',chosen,flush=True)
print('DELETE',d.delete_intervals(s,chosen),flush=True)
after=d.mp.scan_state(s,False)
assert all(tuple(after['id_to_pos'][k])==p for k,p in before_pos.items())
assert not set(chosen)&set(d.catalog(after))
assert len(after['edge_rows'])==len(state['edge_rows'])-2
g,display=d.mp._graph_state(after)
for key in chosen:
    row=items[key]
    if row['kind']=='author':
        a,b=[after['cache']['anchors'].get(i,i) for i in row['ids']]
        assert not g.has_edge(a,b),(a,b)
print('RECOLOR',d.mp.update_colors(s),flush=True)
assert s['midpoint_editor_state']=='CURRENT'
assert not set(chosen)&set(d.catalog(d.mp.scan_state(s,False)))
print('REFS',d.mp._verify_references(s),flush=True)
qa={'protected_source_branches':len(d.protection(s)[0]),'deletable_intervals':counts,'removed_test_intervals':chosen,'vertex_positions_preserved':True,'references_unchanged':True,'recolor':'CURRENT'}
Path(__file__).with_name('qa.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2),encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(Path(__file__).with_name('deleted_fixture.blend')))
print('TEST_PASS',flush=True)
