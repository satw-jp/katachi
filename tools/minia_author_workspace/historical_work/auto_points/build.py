import bpy,sys,runpy,json,math
from pathlib import Path
from mathutils import Vector
out=Path.cwd()/'outputs';sys.path.insert(0,str(out/'color_author_runtime'))
import author_scoring_runtime as ar
mp=ar.depth.midpoint;obj=bpy.data.objects[mp.ANCHOR]
# Open current user save; register editor before reading provenance.
runpy.run_path(str(out/'MINIA_SINGLE_VIEW_BOOTSTRAP.py'))
state=mp.scan_state(bpy.context.scene,True)
before=dict(state['id_to_pos']);refs=mp._verify_references(bpy.context.scene)
print('BEFORE',len(before),len(state['edge_rows']),len(state['mid_records']),flush=True)
import auto_points_runtime as auto
auto.register();report=auto.subdivide();print('ADDED',report,flush=True)
st=mp.scan_state(bpy.context.scene,False)
assert all(sid in st['id_to_pos'] and (Vector(p)-Vector(st['id_to_pos'][sid])).length<1e-7 for sid,p in before.items())
assert refs==mp._verify_references(bpy.context.scene)
max_source=max(b-a for rows,cuts in auto.source_gaps(st) for a,b in zip(cuts,cuts[1:]))
max_author=max((Vector(r['a_position'])-Vector(r['b_position'])).length for r in st['edge_rows'])
assert max_source<10.0001,(max_source,'source');assert max_author<10.0001,(max_author,'author')
assert auto.subdivide()=={'source_added':0,'author_added':0,'threshold_mm':10.}
update=mp.update_colors();assert update['status']=='CURRENT',update
# Confirm graph world-coordinate distances are stored as physical millimeters.
cache=st['cache'];edges=cache['edges'];nodes=dict(cache['nodes']);checked=0
for a,b,d in edges:
 if 'length_mm' in d and a in nodes and b in nodes and 'position' in nodes[a] and 'position' in nodes[b]:
  length=(Vector(nodes[a]['position'])-Vector(nodes[b]['position'])).length
  if length>1e-4:assert abs(length-d['length_mm'])<1e-3;checked+=1
 if checked>=10:break
assert checked>=1
bpy.ops.wm.save_as_mainfile(filepath=str(out/'MINIA_AUTO_POINTS_10MM.blend'),compress=True)
r={'status':'PASS','added':report,'existing_points_preserved':len(before),'source_refs':refs,'max_source_gap_mm':max_source,'max_author_gap_mm':max_author,'idempotence':'PASS','physical_mm_graph_checks':checked,'color_update':update['status'],'final_vertices':len(st['id_to_pos']),'final_edges':len(st['edge_rows'])}
(out/'MINIA_AUTO_POINTS_QA.json').write_text(json.dumps(r,indent=2));print(json.dumps(r),flush=True)
