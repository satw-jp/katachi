import bpy,base64,zlib,json
s=''.join(bpy.data.texts['MINIA_SOURCE_LEDGER.zlib.base64'].as_string().split())
d=json.loads(zlib.decompress(base64.b64decode(s)))
print('ledger keys',d.keys());print('top count',len(d.get('records',[])), 'demo',d.get('demo',{}).keys())
if d.get('records'): print(d['records'][0].keys(),d['records'][0].get('id'),d['records'][0].get('source_group'))
