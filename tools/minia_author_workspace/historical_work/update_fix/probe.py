import bpy,runpy,json
from pathlib import Path
out=Path.cwd()/'outputs'
runpy.run_path(str(out/'MINIA_DEFERRED_POINTS_BOOTSTRAP.py'))
import deferred_points_runtime as auto
s=bpy.context.scene
print('SAVED_STATE',s.get('midpoint_editor_state'),s.get('midpoint_editor_reason'),flush=True)
try:
 r=bpy.ops.mini_a.update_midpoint_colors();print('OPERATOR',r,flush=True)
except Exception as e:print('EXCEPTION',repr(e),flush=True)
print('AFTER',s.get('midpoint_editor_state'),s.get('midpoint_editor_reason'),flush=True)
