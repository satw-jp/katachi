import bpy,bmesh,sys
from pathlib import Path
out=Path(sys.argv[sys.argv.index('--')+1]);o=bpy.data.objects['AUTHOR_EDIT_DEMO • 24 endpoints, select two then F'];bm=bmesh.new();bm.from_mesh(o.data);bm.verts.ensure_lookup_table();bm.verts.remove(bm.verts[-1]);bm.to_mesh(o.data);bm.free();o.data.update();bpy.ops.wm.save_as_mainfile(filepath=str(out));print('saved deletion fixture',flush=True)
