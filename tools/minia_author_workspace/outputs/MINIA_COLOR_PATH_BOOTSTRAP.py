"""Register the standalone MINI_A endpoint-color editor in Blender."""
from pathlib import Path
import sys, bpy
from bpy.app.handlers import persistent

OUTPUTS = Path(__file__).resolve().parent
RUNTIME = OUTPUTS / 'color_path_runtime'
if str(RUNTIME) not in sys.path:
    sys.path.insert(0, str(RUNTIME))

import color_path_runtime

@persistent
def _register_after_load(_unused):
    # If the author opens another saved copy through File > Open, restore the
    # panel and editable anchor mode without auto-running file-embedded code.
    try:
        color_path_runtime.register(enter_edit_mode=True)
    except Exception as exc:
        scene = bpy.context.scene
        if scene:
            scene['color_map_state'] = 'HOLD'
            scene['color_map_stale_reason'] = repr(exc)

if _register_after_load not in bpy.app.handlers.load_post:
    bpy.app.handlers.load_post.append(_register_after_load)
color_path_runtime.register(enter_edit_mode=True)
