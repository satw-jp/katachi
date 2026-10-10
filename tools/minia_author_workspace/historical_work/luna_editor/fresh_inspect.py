import bpy,json,base64,zlib,hashlib
from pathlib import Path
text=bpy.data.texts['MINIA_SOURCE_LEDGER.zlib.base64'];raw=zlib.decompress(base64.b64decode(''.join(text.as_string().split())));ledger=json.loads(raw.decode('utf-8'))
assert hashlib.sha256(raw).hexdigest()==bpy.context.scene['source_ledger_sha256']
assert len(ledger['records'])==9421 and len(ledger['flower_records'])==4283 and len(ledger['support_records'])==22373
assert sum(ledger['group_counts'].values())==9421
obj=bpy.data.objects['AUTHOR_EDIT_DEMO • 24 endpoints, select two then F'];assert len(obj.data.vertices)==24 and len(obj.data.edges)==0
assert abs(bpy.context.scene.unit_settings.scale_length-.001)<1e-9
support=bpy.data.objects['SUPPORT • 22,373 source locators • hidden'];assert len(support.data.vertices)==49819 and support.data.attributes.get('support_record_index') is not None
flower=bpy.data.objects['F3457 • D6 template proxy at exact source position/orientation'];assert len(flower.data.vertices)==32574 and flower['manufacturing_geometry'] is False
res={'status':'PASS_FRESH_OPEN','blend':bpy.data.filepath,'source_records':len(ledger['records']),'groups':ledger['group_counts'],'flowers':len(ledger['flower_records']),'support_objects':len(ledger['support_records']),'support_points':len(support.data.vertices),'support_record_index_attribute':len(support.data.attributes['support_record_index'].data),'demo_anchors':len(obj.data.vertices),'demo_edges':len(obj.data.edges),'flower_template_vertices':len(flower.data.vertices),'ledger_sha256':hashlib.sha256(raw).hexdigest(),'manufacturing_geometry_changed':bpy.context.scene['geometry_changed'],'slice_send_print_count':bpy.context.scene['slice_send_print']}
Path(r'J:\\My Drive\\codex\\2026-10-09\\files-pasted-by-the-user-astra\\outputs\\EDITOR_FRESH_OPEN_QA.json').write_text(json.dumps(res,indent=2),encoding='utf-8');print(json.dumps(res,indent=2),flush=True)
