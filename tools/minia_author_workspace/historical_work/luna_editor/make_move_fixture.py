import bpy,sys,json
from pathlib import Path
out=Path(sys.argv[sys.argv.index('--')+1]);o=bpy.data.objects['AUTHOR_EDIT_DEMO • 24 endpoints, select two then F'];o.data.vertices[0].co.x+=0.25;bpy.ops.wm.save_as_mainfile(filepath=str(out));print('saved movement fixture',flush=True)
