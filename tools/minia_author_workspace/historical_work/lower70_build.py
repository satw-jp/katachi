import bpy,bmesh,runpy,json,hashlib,math
from pathlib import Path
from mathutils import Vector
W=Path(__file__).resolve().parent;O=W.parent/'outputs'
plan=json.loads((W/'lower70_plan.json').read_text(encoding='utf-8'));original=json.loads((W/'lower70_input.json').read_text(encoding='utf-8'))
source=O/'MINIA_LOWER50_BRANCHING_REVIEW.blend';sha=hashlib.sha256(source.read_bytes()).hexdigest()
runpy.run_path(str(O/'MINIA_LOWER50_BOOTSTRAP.py'))
import interval_delete as d
import flower_reroute as rr
s=bpy.context.scene;st=d.mp.scan_state(s,True)
assert st['id_to_pos']==original['positions'] and st['roots']==original['roots'] and d.masks(s)==original['deleted']
bm=st['bm'];obj=st['obj'];inv=obj.matrix_world.inverted();roots=st['roots'];root_index={r['root_id']:i for i,r in enumerate(roots)}
byid={sid:bm.verts[i] for i,sid in st['id_by_index'].items()}
layers={n:bm.verts.layers.int.get(n) for n in ('anchor_index','midpoint_kind','midpoint_segment_index','midpoint_author_root','record_index','endpoint_index')};tl=bm.verts.layers.float.get('midpoint_t')
assert len({p['id'] for p in plan['new_points']})==len(plan['new_points'])
for rec in plan['new_points']:
    if rec['kind']=='author':
        ri=root_index[rec['root']];root=roots[ri];a,b=rec['edge_ids'];va,vb=byid[a],byid[b];edge=bm.edges.get((va,vb));assert edge
        _,v=bmesh.utils.edge_split(edge,va,.5)
        root['cuts'].append({'id':rec['id'],'t':rec['t']});root['cuts'].sort(key=lambda c:c['t'])
        kind=d.mp.KIND_AUTHOR;si=-1
    else:ri=-1;si=rec['segment_index'];kind=d.mp.KIND_SOURCE;v=bm.verts.new(inv@Vector(rec['position']))
    v.co=inv@Vector(rec['position'])
    for n,value in [('anchor_index',-1),('midpoint_kind',kind),('midpoint_segment_index',si),('midpoint_author_root',ri),('record_index',-1),('endpoint_index',-1)]:
        if layers[n] is not None:v[layers[n]]=value
    v[tl]=rec['t'];v.select_set(False);byid[rec['id']]=v
d.mp._store_registry(s,roots)
for row in plan['added']:
    a,b=byid[row['a_id']],byid[row['b_id']]
    assert bm.edges.get((a,b)) is None
    bm.edges.new((a,b)).select_set(False)
bm.verts.index_update();bm.edges.index_update();bmesh.update_edit_mesh(obj.data,loop_triangles=False,destructive=True)
# Register all replacement roots while the old paths still exist.
st=d.mp.scan_state(s,True)
s[rr.KEY]=json.dumps(original['reroutes']+[{k:v for k,v in row.items() if k!='removed_graph_edges'} for row in plan['replacements']],separators=(',',':'))
s[d.KEY]=json.dumps(original['deleted']+[r['mask'] for r in plan['replacements']],separators=(',',':'))
rr.validate(s,st['roots'],st['cache'])
for row in plan['replacements']:
    if row['mask']['kind']=='author':
        a,b=row['path'][0],row['path'][-1];edge=bm.edges.get((byid[a],byid[b]));assert edge;bm.edges.remove(edge)
bmesh.update_edit_mesh(obj.data,loop_triangles=False,destructive=True)
print('APPLIED',len(plan['replacements']),len(plan['new_points']),len(plan['added']),flush=True)
pre=d.mp.scan_state(s,False);pg,_=d.mp._graph_state(pre)
expected=json.loads((W/'lower70_expected_graph.json').read_text(encoding='utf-8'))
assert {frozenset((a,b)) for a,b in pg.edges}=={frozenset((a,b)) for a,b,_ in expected},'Planned graph differs before automatic 10mm subdivision'
result=d.mp.update_colors(s);assert result['status']=='CURRENT',result
after=d.mp.scan_state(s,False)
assert all(after['id_to_pos'][k]==v for k,v in original['positions'].items())
assert d.mp._verify_references(s)==7
assert all(row in d.masks(s) for row in original['deleted'])
g,display=d.mp._graph_state(after)
for row in plan['new_points']:
    if 'branch_target' in row:
        a=row['id'];b=after['cache']['anchors'].get(row['branch_target'],row['branch_target']);assert g.has_edge(a,b) and g.degree(a)>=3
scores=d.mp.colorbase.score_graph(g,after['cache']['seeds']);zlo,zmax=plan['report']['z_range_mm'];red=total=0
for a,b,e in g.edges(data=True):
    pa=g.nodes[a]['position'];pb=g.nodes[b]['position'];length=e['length_mm']
    if max(pa[2],pb[2])<zlo or min(pa[2],pb[2])>zmax:continue
    frac=1.
    if abs(pb[2]-pa[2])>1e-9:
        lo,hi=sorted(((zlo-pa[2])/(pb[2]-pa[2]),(zmax-pa[2])/(pb[2]-pa[2])));frac=max(0,min(1,hi)-max(0,lo))
    val=scores[frozenset((a,b))]['effective_distance_mm'];total+=length*frac
    if val is None or val>=25.65:red+=length*frac
(W/'lower70_actual_graph.json').write_text(json.dumps(list(g.edges(data=True))),encoding='utf-8')
# The existing color-update command inserts points on the new 10mm+ legs.
# Total geometry is invariant; per-edge midpoint scores are recomputed below.
assert abs(total-plan['report']['after']['total_length_mm'])<.1,(total,plan['report']['after'])
s.minia_clip_shared=True;s.minia_clip_shared_axis='2';s.minia_clip_tilt=False;s.minia_clip_z_start=0.;s.minia_clip_z_end=70.;d.clip.apply_clips(s)
report={**plan['report'],'actual_red_length_mm':red,'actual_total_length_mm':total,'source_sha256':sha,'original_points_preserved':True,'user_deletions_preserved':True,'reference_count':7,'color_update':result,'modified_above_70_percent':False,'red_elimination':'NOT_ACHIEVED','new_edge_max_mm':max(r['length_mm'] for r in plan['added'])}
report['after']={**report['after'],'red_length_mm':red,'total_length_mm':total}
s['lower70_branching_report_json']=json.dumps(report,separators=(',',':'))
target=O/'MINIA_LOWER70_BRANCHING_REVIEW.blend';bpy.ops.wm.save_as_mainfile(filepath=str(target))
assert hashlib.sha256(source.read_bytes()).hexdigest()==sha
(O/'MINIA_LOWER70_BRANCHING_REVIEW.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
(O/'MINIA_LOWER70_CHANGES.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf-8')
print('BUILD_PASS',json.dumps(report),flush=True)
