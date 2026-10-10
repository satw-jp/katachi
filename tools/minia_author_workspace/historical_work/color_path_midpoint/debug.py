import bpy,sys,traceback
from pathlib import Path
sys.path.insert(0,str(Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra\outputs')/'color_path_midpoint_runtime'))
import midpoint_runtime as rt
s=bpy.context.scene
print('mode',bpy.context.mode,'active',bpy.context.view_layer.objects.active,flush=True)
try:
 rt.ensure_midpoint_attributes();print('attrs ok',flush=True)
 print(rt.scan_state(s,True),flush=True)
except Exception:traceback.print_exc()
