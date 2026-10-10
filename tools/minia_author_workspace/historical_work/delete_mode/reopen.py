import bpy,runpy,json
from pathlib import Path
from types import SimpleNamespace
OUT=Path(__file__).resolve().parents[2]/'outputs'
runpy.run_path(str(OUT/'MINIA_INTERVAL_DELETE_BOOTSTRAP.py'))
import interval_delete as d
s=bpy.context.scene;state=d.mp.scan_state(s,False);items=d.catalog(state)
assert len(d.masks(s))==4
report=json.loads(Path(__file__).with_name('qa.json').read_text(encoding='utf-8'))
assert not set(report['removed_test_intervals'])&set(items)
g,display=d.mp._graph_state(state)
tables=d.tables(state['cache'])
for mask in d.masks(s):
    if mask['kind']!='source':continue
    # Every visible source piece must lie outside the recorded deleted arc.
    for i,seg,lo,hi in d.source_pieces(state):
        if seg['branch_id']!=mask['branch']:continue
        branch,start,length=d._segment_arcs[i]
        assert not mask['lo']+1e-5<start+length*(lo+hi)*.5<mask['hi']-1e-5
protected=next(k for k,r in items.items() if r['kind']=='author' and r['protected'])
before=s[d.KEY]
try:d.delete_intervals(s,{protected})
except RuntimeError:pass
else:raise AssertionError('Protected author root was deleted')
assert s[d.KEY]==before
# Missing unapproved edge must still trip the original guard.
bm=state['bm'];edge=next(iter(bm.edges));va,vb=edge.verts
bm.edges.remove(edge)
try:d.mp.scan_state(s,False)
except RuntimeError as exc:assert 'missing' in str(exc)
else:raise AssertionError('Unauthorized edge removal accepted')
bm.edges.new((va,vb));d.bmesh.update_edit_mesh(state['obj'].data,loop_triangles=False,destructive=True)
assert d.mp.scan_state(s,False)
# Applied axis clipping rejects distant geometry and clips crossing strokes.
old_range=d.clip._region_axis_range;old_dir=d.clip._applied_direction
d.clip._region_axis_range=lambda rd,scene:(2,(0.,15.))
d.clip._applied_direction=lambda scene,axis:d.Vector((0,0,1))
assert not list(d.clipped_pieces({'pieces':[((0,0,20),(1,1,30))]},None,s))
pieces=list(d.clipped_pieces({'pieces':[((0,0,-10),(0,0,30))]},None,s))
assert abs(pieces[0][0].z)<1e-5 and abs(pieces[0][1].z-15)<1e-5
d.clip._region_axis_range=old_range;d.clip._applied_direction=old_dir
result=d.mp.update_colors(s);assert result['status']=='CURRENT',result
assert not set(report['removed_test_intervals'])&set(d.catalog(d.mp.scan_state(s,False)))
report.update(save_reopen='PASS',protected_author_rejected=True,unapproved_missing_edge_rejected=True,clip_math='PASS',gui_mouse_test='NOT_RUN',reopen_recolor=result)
(OUT/'MINIA_INTERVAL_DELETE_QA.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('REOPEN_PASS',json.dumps(report,ensure_ascii=False),flush=True)
