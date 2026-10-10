"""Register the MINI_A depth-cued path editor without trusting blend scripts."""
from pathlib import Path
import sys,bpy
from bpy.app.handlers import persistent

OUTPUTS=Path(__file__).resolve().parent
RUNTIME=OUTPUTS/'color_depth_runtime'
if str(RUNTIME) not in sys.path:sys.path.insert(0,str(RUNTIME))
import depth_runtime

@persistent
def _after_open(_unused):
    try:depth_runtime.register(enter_edit_mode=True)
    except Exception as exc:
        scene=bpy.context.scene
        if scene:
            scene['midpoint_editor_state']='HOLD'
            scene['midpoint_editor_reason']='depth-view bootstrap: '+repr(exc)

if _after_open not in bpy.app.handlers.load_post:bpy.app.handlers.load_post.append(_after_open)
depth_runtime.register(enter_edit_mode=True)
