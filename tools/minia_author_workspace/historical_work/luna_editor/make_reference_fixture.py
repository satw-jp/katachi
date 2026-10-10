import bpy,sys
from pathlib import Path
out=Path(sys.argv[sys.argv.index('--')+1]);o=bpy.data.objects['A_ORIGINAL • source centerlines'];o.data.vertices[0].co.z+=0.5;bpy.ops.wm.save_as_mainfile(filepath=str(out));print('saved source-reference geometry mutation fixture',flush=True)
