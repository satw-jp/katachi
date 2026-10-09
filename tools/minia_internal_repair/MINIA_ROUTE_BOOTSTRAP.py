"""MINI_A V2 runtime bootstrap. Open the V2 blend, then run via the supplied launcher."""
import bpy,sys
from pathlib import Path

OUTPUTS=Path(__file__).resolve().parent
RUNTIME=OUTPUTS/'route_runtime'

def register_for_current_file():
 blend=Path(bpy.data.filepath).resolve()
 if not blend.exists():raise RuntimeError('Open MINIA_LAYERWISE_ROUTE_VISUALIZER_V2.blend before running this bootstrap')
 if not RUNTIME.is_dir():raise RuntimeError('Local route runtime is missing: '+str(RUNTIME))
 for p in (str(OUTPUTS),str(RUNTIME)):
  if p in sys.path:sys.path.remove(p)
  sys.path.insert(0,p)
 import route_v2_panel
 route_v2_panel.register(runtime_path=RUNTIME,initial_evaluate=True)
 return {'blend':str(blend),'output_root':str(OUTPUTS),'runtime':str(RUNTIME),'panel':'registered','state':bpy.context.scene.get('route_state')}

if __name__=='__main__':print(register_for_current_file(),flush=True)
