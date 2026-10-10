import ast
from pathlib import Path
out=Path(__file__).resolve().parents[2]/'outputs'
dest=out/'interval_delete_runtime';dest.mkdir(exist_ok=True)
def function(path,name):
    src=path.read_text(encoding='utf-8');tree=ast.parse(src)
    node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==name)
    return '\n'.join(src.splitlines()[node.lineno-1:node.end_lineno])+'\n'
src=function(out/'color_author_runtime/midpoint_runtime.py','scan_state')
src=src.replace('mapped=set()','_interval_delete.validate(scene, roots, cache)\n mapped=set()')
src=src.replace("if pair not in actual:raise RuntimeError('author root interval edge is missing from ALL mesh')", "if pair not in actual and not _interval_delete.deleted_pair(scene, roots, pair):raise RuntimeError('author root interval edge is missing from ALL mesh')")
(dest/'scan_hook.py').write_text(src,encoding='utf-8')
src=function(out/'color_author_runtime/midpoint_runtime.py','_graph_state')
src=src.replace("length=math.dist(pa,pb)","if _interval_delete.source_deleted(bpy.context.scene, cache, i, (ta+tb)*.5):\n    if g.has_edge(a,b):g.remove_edge(a,b)\n    continue\n   length=math.dist(pa,pb)")
src=src.replace('na,nb=graph_node(ida),graph_node(idb)',"if _interval_delete.author_deleted(bpy.context.scene, root['root_id'],ta,tb):continue\n   na,nb=graph_node(ida),graph_node(idb)")
(dest/'graph_hook.py').write_text(src,encoding='utf-8')
src=function(out/'color_author_runtime/author_scoring_runtime.py','_replace_author_preview')
src=src.replace('na,nb=_graph_node(ida,anchors),_graph_node(idb,anchors)',"if _interval_delete.author_deleted(bpy.context.scene,root['root_id'],ta,tb):continue\n            na,nb=_graph_node(ida,anchors),_graph_node(idb,anchors)")
(dest/'preview_hook.py').write_text(src,encoding='utf-8')
src=function(out/'view_clip_runtime/single_view_clip_adapter.py','_clip_aware_pick')
src=src.replace("for i,seg in enumerate(state['cache']['segments']):test('source_segment',seg['a'],seg['b'],{'segment_index':i})", "for i,seg,lo,hi in _interval_delete.source_pieces(state):\n        before=len(candidates)\n        test('source_segment',_lerp(seg['a'],seg['b'],lo),_lerp(seg['a'],seg['b'],hi),{'segment_index':i})\n        if len(candidates)>before:candidates[-1]['t']=lo+(hi-lo)*candidates[-1]['t']")
(dest/'pick_hook.py').write_text(src,encoding='utf-8')
