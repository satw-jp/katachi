import bpy,time,os,json
from pathlib import Path
out=[]
for n in [1,10]:
 p=Path(f'work/luna_editor/text_load_{n}mb.txt');t0=time.time();t=bpy.data.texts.load(str(p));t.use_fake_user=True;t.filepath='';elapsed=time.time()-t0;out.append({'mb':n,'text_length':len(t.as_string()),'seconds':elapsed});bpy.data.texts.remove(t)
print(json.dumps(out),flush=True)
