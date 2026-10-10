import hashlib, json, os, zipfile, xml.etree.ElementTree as ET
from pathlib import Path
success=Path(r'J:\My Drive\codex\2026-09-23\files-pasted-by-the-user-fukei\outputs\R4_MINIA_TERMINAL_REVIEW_20260922\package_only\plate_1.gcode.3mf')
editable=Path(r'J:\My Drive\codex\2026-09-22\skin-fukei-slice-runner-execution-3\outputs\MINIA_PLA_EDITABLE_REPACKED.3mf')
def file_hash(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(8*1024*1024),b''): h.update(b)
 return h.hexdigest()
def archive(p):
 z=zipfile.ZipFile(p)
 entries=[{'name':i.filename,'bytes':i.file_size,'crc32':f'{i.CRC:08x}'} for i in z.infolist()]
 out={'path':str(p),'bytes':p.stat().st_size,'sha256':file_hash(p),'entries':entries}
 for i in z.infolist():
  if i.filename.lower().endswith('.gcode'):
   h=hashlib.sha256(); n=0
   with z.open(i) as f:
    for b in iter(lambda:f.read(8*1024*1024),b''): h.update(b);n+=len(b)
   out['embedded_gcode']={'entry':i.filename,'bytes':n,'sha256':h.hexdigest()}
  elif i.file_size < 500000 and (i.filename.endswith('.config') or i.filename.endswith('.model') or '3dmodel' in i.filename):
   raw=z.read(i.filename)
   if i.filename.endswith('.model'):
    root=ET.fromstring(raw); ns={'c':'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'}
    objects=root.findall('.//c:object',ns); components=root.findall('.//c:component',ns)
    out.setdefault('small_model_summaries',[]).append({'entry':i.filename,'objects':len(objects),'components':len(components),'object_ids':[o.attrib.get('id') for o in objects]})
   if i.filename.endswith('.config'):
    out.setdefault('configs',[]).append({'entry':i.filename,'text':raw.decode('utf-8','replace')[:2000]})
 return out
res={'success':archive(success),'editable':archive(editable)}
print(json.dumps(res,ensure_ascii=False,indent=2))
