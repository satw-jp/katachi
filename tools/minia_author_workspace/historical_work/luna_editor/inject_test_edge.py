import bpy,json,bmesh,sys
from pathlib import Path
out=Path(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else Path(r'J:\\My Drive\\codex\\2026-10-09\\files-pasted-by-the-user-astra\\work\\luna_editor\\test_add.blend')
name='AUTHOR_EDIT_DEMO • 24 endpoints, select two then F';o=bpy.data.objects[name];a=o.data.attributes['anchor_index']
by={int(x.value):i for i,x in enumerate(a.data)}
# Ledger-derived ordering: sorted demo IDs, START then END. Add one source-linked test-only edge.
# G0181 is sorted among members; A3457 is also present.
ledger=bpy.data.texts['MINIA_SOURCE_LEDGER.zlib.base64'].as_string()
import base64,zlib
L=json.loads(zlib.decompress(base64.b64decode(''.join(ledger.split()))))
ids=sorted(L['demo']['member_ids']);i=ids.index('G0181')*2;j=ids.index('A3457')*2+1
bm=bmesh.new();bm.from_mesh(o.data);bm.verts.ensure_lookup_table();bm.edges.new((bm.verts[by[i]],bm.verts[by[j]]));bm.to_mesh(o.data);bm.free();o.data.update();bpy.ops.wm.save_as_mainfile(filepath=str(out));print(json.dumps({'test_file':str(out),'edge_count':len(o.data.edges),'anchor_indices':[i,j]}),flush=True)

