"""Bootstrap the current author blend in four-view clipped-range mode."""
import bpy,sys,runpy
from pathlib import Path
from bpy.app.handlers import persistent
OUT=Path(__file__).resolve().parent
for p in (OUT/'color_author_runtime',OUT/'selected_point_runtime',OUT/'quad_view_runtime',OUT/'view_clip_runtime'):
 if str(p) not in sys.path:sys.path.insert(0,str(p))
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   for q in area.spaces.active.region_quadviews:q.use_clip_planes=False
runpy.run_path(str(OUT/'MINIA_QUAD_EDITOR_BOOTSTRAP.py'))
import author_scoring_runtime as author
import safe_view_clip_adapter as viewclip
viewclip.register();depth=author.depth
scene=bpy.context.scene;scene['quadview_depth_disabled']=True;scene['depth_cue_enabled']=False
# Rebuild display materials in SOLID/MATERIAL and apply per-pane native clips.
depth._install_depth_materials(scene);viewclip.apply_clips(scene)
@persistent
def _clip_after_open(_unused):
 try:
  viewclip.register();scene=bpy.context.scene;scene['quadview_depth_disabled']=True;scene['depth_cue_enabled']=False
  depth._install_depth_materials(scene);viewclip.apply_clips(scene)
 except Exception as exc:bpy.context.scene['view_clip_state']='HOLD';bpy.context.scene['view_clip_error']=repr(exc)
if _clip_after_open not in bpy.app.handlers.load_post:bpy.app.handlers.load_post.append(_clip_after_open)
scene['view_clip_state']='READY'
print('MINIA_VIEW_CLIP_READY',scene.get('view_clip_source_bounds_json',''),scene.get('quad_clip_regions_json',''),flush=True)
