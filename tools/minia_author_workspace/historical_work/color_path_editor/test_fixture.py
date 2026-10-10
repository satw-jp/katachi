import bpy, json, sys, time, math, hashlib
from pathlib import Path
import bmesh
from mathutils import Vector

out = Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra\outputs')
work = out.parent / 'work' / 'color_path_editor'
sys.path.insert(0, str(out / 'color_path_runtime'))
import color_path_runtime as rt
import route_v2_panel

scene = bpy.context.scene; anchor = bpy.data.objects[rt.ANCHOR]
if bpy.context.mode != 'EDIT_MESH': bpy.ops.object.mode_set(mode='EDIT')
if bpy.context.mode == 'EDIT_MESH': bpy.ops.object.mode_set(mode='OBJECT')
ledger, _ = route_v2_panel._load_ledger(scene)
expected = route_v2_panel._expected_rows(ledger['records'])
attr = anchor.data.attributes['anchor_index']
idx = {expected[int(attr.data[i].value)]['anchor_id']: i for i in range(len(anchor.data.vertices))}
pair = ('A1472:END', 'A3369:END')
assert all(x in idx for x in pair), [x for x in pair if x not in idx]
if bpy.context.mode != 'EDIT_MESH': bpy.ops.object.mode_set(mode='EDIT')

def select_indices(ids):
    bm = bmesh.from_edit_mesh(anchor.data); bm.verts.ensure_lookup_table(); bm.verts.index_update()
    for v in bm.verts: v.select_set(False)
    for name in ids: bm.verts[idx[name]].select_set(True)
    bmesh.update_edit_mesh(anchor.data, loop_triangles=False, destructive=False)

def bins_from_scores(cache, scores):
    r = {}
    for s in cache['segments']:
        q=scores[frozenset(s['nodes'])]['effective_distance_mm']
        b=None if q is None else min(31,int(round(max(0,q)/30*31)))
        key=str(b) if b is not None else 'gray';r[key]=r.get(key,0)+1
    return r

cache, score, cache_sha, score_sha = rt._read_data(scene)
g0 = rt._graph(cache, [])
s0 = rt.score_graph(g0, cache['seeds']); bins0 = bins_from_scores(cache, s0)
select_indices(pair)
bpy.ops.ed.undo_push(message='Before test F edge')
bpy.ops.mesh.edge_face_add()
bmesh.update_edit_mesh(anchor.data, loop_triangles=False, destructive=True)
rt.poll_state()
assert scene.get('color_map_state') == 'STALE', scene.get('color_map_state')
actual_audit = rt._guard(scene)
assert not actual_audit['issues'], actual_audit['issues']
assert actual_audit['edge_count'] == 1, actual_audit

g1 = rt._graph(cache, actual_audit['edits'])
s1 = rt.score_graph(g1, cache['seeds']); bins1 = bins_from_scores(cache, s1)
changed = sum(1 for s in cache['segments'] if
    s0[frozenset(s['nodes'])]['effective_distance_mm'] != s1[frozenset(s['nodes'])]['effective_distance_mm']
)
changed_color_bins = sum(1 for s in cache['segments'] if
    (None if s0[frozenset(s['nodes'])]['effective_distance_mm'] is None else min(31,int(round(max(0,s0[frozenset(s['nodes'])]['effective_distance_mm'])/30*31)))) !=
    (None if s1[frozenset(s['nodes'])]['effective_distance_mm'] is None else min(31,int(round(max(0,s1[frozenset(s['nodes'])]['effective_distance_mm'])/30*31))))
)
updated = rt.update_colors(scene)
assert updated['status'] == 'CURRENT', updated
assert updated['added_edge_count'] == 1
assert changed > 0 and changed_color_bins > 0 and bins0 != bins1, {'changed': changed, 'changed_color_bins': changed_color_bins, 'before': bins0, 'after': bins1}
assert bpy.data.objects.get('AUTHOR INTENT • cyan display only') is not None

test_blend = work / 'MINIA_COLOR_PATH_EDITOR_TEST_ADDED.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(test_blend))

# A no-line edit state (the state reached with Ctrl+Z in an interactive session)
# must restore baseline coloring. Background Blender lacks the interactive undo
# stack, so remove this test edge directly from BMesh for a deterministic reset.
bm=bmesh.from_edit_mesh(anchor.data);bm.verts.ensure_lookup_table();bm.verts.index_update()
ia,ib=idx[pair[0]],idx[pair[1]]
edge=next(e for e in bm.edges if {v.index for v in e.verts}=={ia,ib})
bmesh.ops.delete(bm,geom=[edge],context='EDGES_FACES')
bmesh.update_edit_mesh(anchor.data, loop_triangles=False, destructive=True)
rt.poll_state()
assert scene.get('color_map_state') == 'STALE'
undo_result = rt.update_colors(scene)
assert undo_result.get('status') == 'CURRENT', undo_result
assert undo_result.get('added_edge_count') == 0, undo_result
assert bins_from_scores(cache, rt.score_graph(rt._graph(cache, []), cache['seeds'])) == bins0
binobjs = [o for o in bpy.data.collections[rt.DISPLAY_COLLECTION].objects if o.type=='CURVE' and o.name.startswith('Support distance •')]
binactual={('gray' if int(o.get('color_bin',-1))<0 else str(int(o['color_bin']))):int(o['segment_count']) for o in binobjs}
assert binactual == bins0, {'actual':binactual,'expected':bins0}

# Protected anchor movement is held before scoring.
bm=bmesh.from_edit_mesh(anchor.data);bm.verts.ensure_lookup_table();bm.verts.index_update()
original_coord=bm.verts[idx['A0817:END']].co.copy()
bm.verts[idx['A0817:END']].co.x += .01
bmesh.update_edit_mesh(anchor.data,loop_triangles=False,destructive=False)
move_result=rt.update_colors(scene)
assert move_result.get('status')=='HOLD', move_result

# F over three anchors can make a face; the extractor wrapper must hold it.
bm=bmesh.from_edit_mesh(anchor.data);bm.verts.ensure_lookup_table();bm.verts.index_update()
bm.verts[idx['A0817:END']].co=original_coord
bmesh.update_edit_mesh(anchor.data,loop_triangles=False,destructive=False)
select_indices(('A0817:END','A0464:END','A0464:START'))
bpy.ops.mesh.edge_face_add()
bmesh.update_edit_mesh(anchor.data,loop_triangles=True,destructive=True)
face_result=rt.update_colors(scene)
assert face_result.get('status')=='HOLD' and '面が追加' in str(face_result.get('issues')), face_result

report={
 'status':'TEST_ONLY_PASS','test_pair':list(pair),'edit_edge_count':1,
 'automatic_stale_after_F':True,'changed_score_segments':changed,'changed_color_bins':changed_color_bins,'baseline_color_bins':bins0,
 'edited_color_bins':bins1,'visual_curve_count_after_update':updated['segment_count'],
 'author_cyan_preview':True,'line_reversal_returned_to_baseline_bins':True,
 'background_undo_stack':'Unavailable; direct BMesh edge reversal used for color reset; interactive Ctrl+Z not observed',
 'background_undo_stack':'Unavailable; deterministic BMesh reversal used for color reset QA',
 'anchor_move_hold':move_result.get('status'),'face_hold':face_result.get('status'),
 'saved_test_blend':str(test_blend),'delivery_blend_edit_count':0,
 'new_slice':0,'send':0,'print':0,'manufacturing_geometry_changed':False,
}
(out/'COLOR_PATH_EDITOR_INTERACTION_QA.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False),flush=True)
