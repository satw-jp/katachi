from pathlib import Path
p=Path('outputs/view_clip_runtime/safe_view_clip_adapter.py');s=p.read_text(encoding='utf-8-sig')
s=s.replace("def _set_planes(q,axis,scene):", "def _clear_native_clip(q):\n    if not q.use_clip_planes:return\n    if bpy.app.background:\n        q.use_clip_planes=False\n    else:\n        bpy.ops.view3d.clip_border('INVOKE_DEFAULT')\n        if q.use_clip_planes:\n            q.use_clip_planes=False\n            raise RuntimeError('Clip reset failed; clipping disabled')\n\n\ndef _set_planes(q,axis,scene):")
s=s.replace("if q.use_clip_planes:\n            bpy.ops.view3d.clip_border('INVOKE_DEFAULT')", "_clear_native_clip(q)")
s=s.replace("if q.use_clip_planes:bpy.ops.view3d.clip_border('INVOKE_DEFAULT')", "_clear_native_clip(q)")
p.write_text(s,encoding='utf-8')
p=Path('work/clip_crash_fix/build.py');s=p.read_text(encoding='utf-8-sig').replace("assert bpy.ops.view3d.clip_border('INVOKE_DEFAULT')=={'FINISHED'}", "vc._clear_native_clip(q)");p.write_text(s,encoding='utf-8')
