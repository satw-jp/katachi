import bpy,runpy,sys
from pathlib import Path
from bpy.app.handlers import persistent
OUT=Path(__file__).resolve().parent
runpy.run_path(str(OUT/'MINIA_COLOR_UPDATE_FIXED_BOOTSTRAP.py'))
if str(OUT/'interval_delete_runtime') not in sys.path:sys.path.insert(0,str(OUT/'interval_delete_runtime'))
import interval_delete
@persistent
def _interval_delete_load(_unused):
    interval_delete.register()
if _interval_delete_load not in bpy.app.handlers.load_post:bpy.app.handlers.load_post.append(_interval_delete_load)
interval_delete.register()
