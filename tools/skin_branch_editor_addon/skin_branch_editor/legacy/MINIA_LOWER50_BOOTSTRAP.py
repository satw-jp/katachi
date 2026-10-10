import bpy,runpy,sys
from pathlib import Path
from bpy.app.handlers import persistent
OUT=Path(__file__).resolve().parent
runpy.run_path(str(OUT/'MINIA_INTERVAL_DELETE_BOOTSTRAP.py'))
import flower_reroute
@persistent
def _flower_route_load(_unused):flower_reroute.register()
if _flower_route_load not in bpy.app.handlers.load_post:bpy.app.handlers.load_post.append(_flower_route_load)
flower_reroute.register()
