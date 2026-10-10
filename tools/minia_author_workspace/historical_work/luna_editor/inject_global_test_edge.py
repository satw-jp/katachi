import bpy,json,bmesh,sys
from pathlib import Path
out=Path(sys.argv[sys.argv.index('--')+1]);name='AUTHOR_EDIT_ALL • protected point baseline';o=bpy.data.objects[name];a=o.data.attributes['anchor_index']
ledger=bpy.data.texts['MINIA_SOURCE_LEDGER.zlib.base64'].as_string();import base64,zlib
L=json.loads(zlib.decompress(base64.b64decode(''.join(ledger.split()))));rows=L['records'];ids=[r['id'] for r in rows];i=ids.index('A0001')*2;j=ids.index('A0002')*2+1
bm=bmesh.new();bm.from_mesh(o.data);bm.verts.ensure_lookup_table();bm.edges.new((bm.verts[i],bm.verts[j]));bm.to_mesh(o.data);bm.free();o.data.update();bpy.ops.wm.save_as_mainfile(filepath=str(out));print(json.dumps({'global_edge_count':len(o.data.edges),'anchor_indices':[i,j]}),flush=True)
