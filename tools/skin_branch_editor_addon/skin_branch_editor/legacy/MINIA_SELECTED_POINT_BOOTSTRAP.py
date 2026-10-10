"""Open the explicitly saved in-progress author file with a selection marker."""
import sys
from pathlib import Path
import bpy
from bpy.app.handlers import persistent
OUTPUTS=Path(__file__).resolve().parent
RUNTIME=OUTPUTS/'color_author_runtime'
MARKERS=OUTPUTS/'selected_point_runtime'
for p in (RUNTIME,MARKERS):
    if str(p) not in sys.path:sys.path.insert(0,str(p))
import author_scoring_runtime
import selected_point_overlay

def _selection_snapshot():
    """Preserve the author's current Edit-Mode selection across runtime setup."""
    obj=bpy.data.objects.get(selected_point_overlay.ANCHOR)
    if obj is None or bpy.context.mode!='EDIT_MESH' or bpy.context.view_layer.objects.active!=obj:
        return None
    import bmesh
    bm=bmesh.from_edit_mesh(obj.data);bm.verts.ensure_lookup_table()
    active=bm.select_history.active
    return ([v.index for v in bm.verts if v.select],active.index if isinstance(active,bmesh.types.BMVert) else -1)

def _selection_restore(snapshot):
    if snapshot is None:return
    import bmesh
    obj=bpy.data.objects.get(selected_point_overlay.ANCHOR)
    if obj is None:return
    if obj.mode!='EDIT':
        bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    bm=bmesh.from_edit_mesh(obj.data);bm.verts.ensure_lookup_table();bm.select_history.clear()
    selected,active=snapshot;selected=set(selected)
    for v in bm.verts:v.select_set(v.index in selected)
    if 0<=active<len(bm.verts) and bm.verts[active].select:bm.select_history.add(bm.verts[active])
    bmesh.update_edit_mesh(obj.data,loop_triangles=False,destructive=False)

@persistent
def _activate_after_open(_unused):
    try:
        selection=_selection_snapshot()
        author_scoring_runtime.register(enter_edit_mode=True)
        _selection_restore(selection)
        selected_point_overlay.register()
        bpy.context.scene['selected_point_overlay_state']='READY'
    except Exception as exc:
        if bpy.context.scene:
            bpy.context.scene['selected_point_overlay_state']='HOLD'
            bpy.context.scene['selected_point_overlay_reason']=repr(exc)

if _activate_after_open not in bpy.app.handlers.load_post:
    bpy.app.handlers.load_post.append(_activate_after_open)
_initial_selection=_selection_snapshot()
author_scoring_runtime.register(enter_edit_mode=True)
_selection_restore(_initial_selection)
selected_point_overlay.register()
bpy.context.scene['selected_point_overlay_state']='READY'
