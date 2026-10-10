import bpy,json,base64,zlib,hashlib
x=bpy.data.texts['MINIA_SOURCE_LEDGER.zlib.base64'].as_string();raw=base64.b64decode(''.join(x.split()));
print(json.dumps({'filepath':bpy.data.texts['MINIA_SOURCE_LEDGER.zlib.base64'].filepath,'len':len(x),'compressed_len':len(raw),'computed':hashlib.sha256(raw).hexdigest(),'expected':bpy.context.scene.get('source_ledger_sha256'),'zlen':bpy.context.scene.get('source_ledger_zlib_bytes'),'first':x[:40],'last':x[-80:]},indent=2))
try: print('decompressed',len(zlib.decompress(raw)))
except Exception as e:print('ERR',repr(e))
