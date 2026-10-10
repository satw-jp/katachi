import bpy,runpy,sys
from pathlib import Path
from bpy.app.handlers import persistent
OUT=Path(__file__).resolve().parent
runpy.run_path(str(OUT/'MINIA_SINGLE_VIEW_BOOTSTRAP.py'))
import auto_points_runtime as auto
@persistent
def _auto_points_load(_unused):
 auto.register();auto.subdivide()
if _auto_points_load not in bpy.app.handlers.load_post:bpy.app.handlers.load_post.append(_auto_points_load)
auto.register();auto.subdivide()
