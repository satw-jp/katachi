import bpy,time,json
from pathlib import Path
base=Path(r'J:\\My Drive\\codex\\2026-10-09\\files-pasted-by-the-user-astra\\work\\luna_editor')
out=[]
for n in [1,10]:
 p=base/f'text_load_{n}mb.txt';t0=time.time();t=bpy.data.texts.load(str(p));t.use_fake_user=True;t.filepath='';elapsed=time.time()-t0;out.append({'mb':n,'text_length':len(t.as_string()),'seconds':elapsed});bpy.data.texts.remove(t)
print(json.dumps(out),flush=True)
