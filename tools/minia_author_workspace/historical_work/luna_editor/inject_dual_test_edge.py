import bpy,json,bmesh,sys,base64,zlib
from pathlib import Path
out=Path(sys.argv[sys.argv.index('--')+1]);t=bpy.data.texts['MINIA_SOURCE_LEDGER.zlib.base64'].as_string();L=json.loads(zlib.decompress(base64.b64decode(''.join(t.split()))));records=L['records'];demo=sorted(L['demo']['member_ids'])
def add(name,ids):
 o=bpy.data.objects[name];attr=o.data.attributes['anchor_index'];lookup={int(x.value):i for i,x in enumerate(attr.data)};a=ids.index('A3457')*2+1;b=ids.index('G0181')*2
 bm=bmesh.new();bm.from_mesh(o.data);bm.verts.ensure_lookup_table();bm.edges.new((bm.verts[lookup[a]],bm.verts[lookup[b]]));bm.to_mesh(o.data);bm.free();o.data.update();return len(o.data.edges)
counts={'global':add('AUTHOR_EDIT_ALL • protected point baseline',[r['id'] for r in records]),'demo':add('AUTHOR_EDIT_DEMO • 24 endpoints, select two then F',demo)};bpy.ops.wm.save_as_mainfile(filepath=str(out));print(json.dumps(counts),flush=True)
