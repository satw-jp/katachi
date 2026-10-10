import bpy,zlib,base64,json,collections
raw=zlib.decompress(base64.b64decode(''.join(bpy.data.texts['MINIA_SOURCE_LEDGER.zlib.base64'].as_string().split())))
c=json.loads(raw);print('KEYS',c.keys());print('ROWS',c['records'][:2]);print('FIELDCOUNTS',collections.Counter(k for r in c['records'] for k in r));print('FLOWER_EXAMPLES',[r for r in c['records'] if any('flower' in k.lower() or (isinstance(v,str) and v.startswith('F')) for k,v in r.items())][:3]);open('work/delete_mode/ledger_inspect.json','w').write(json.dumps(c))
