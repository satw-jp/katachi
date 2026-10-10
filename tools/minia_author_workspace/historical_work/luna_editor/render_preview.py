import bpy,json,time
from pathlib import Path
p=Path(r'J:\\My Drive\\codex\\2026-10-09\\files-pasted-by-the-user-astra\\outputs\\MINIA_INTERNAL_REPAIR_EDITOR_PREVIEW.png')
scene=bpy.context.scene
scene.render.filepath=str(p);scene.render.image_settings.file_format='PNG';scene.render.resolution_percentage=80
start=time.time();bpy.ops.render.render(write_still=True);print(json.dumps({'preview':str(p),'exists':p.exists(),'bytes':p.stat().st_size if p.exists() else None,'elapsed_seconds':round(time.time()-start,2),'engine':scene.render.engine}),flush=True)
