"""Launcher entry: start Blender with the V2 .blend loaded, then pass this file via --python."""
import bpy,sys
from pathlib import Path

def register_for_current_file():
 blend=Path(bpy.data.filepath).resolve()
 if not blend.exists():raise RuntimeError('Open MINIA_LAYERWISE_ROUTE_VISUALIZER_V2.blend before running this bootstrap')
 project=blend.parent.parent;runtime=project/'outputs'/'route_runtime';module_dir=Path(__file__).resolve().parent
 if not runtime.exists():raise RuntimeError('Local route runtime is missing: '+str(runtime))
 for p in (str(module_dir),str(runtime)):
  if p in sys.path:sys.path.remove(p)
  sys.path.insert(0,p)
 import route_v2_panel
 route_v2_panel.register(runtime_path=runtime,initial_evaluate=True)
 return {'blend':str(blend),'runtime':str(runtime),'panel':'registered','state':bpy.context.scene.get('route_state')}

if __name__=='__main__':print(register_for_current_file(),flush=True)
