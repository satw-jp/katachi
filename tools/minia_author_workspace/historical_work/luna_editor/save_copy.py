import bpy,sys,json
from pathlib import Path
out=Path(sys.argv[sys.argv.index('--')+1]);bpy.ops.wm.save_as_mainfile(filepath=str(out));print(json.dumps({'saved_noop_copy':str(out)}),flush=True)
