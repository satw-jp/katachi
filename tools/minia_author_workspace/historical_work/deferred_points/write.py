from pathlib import Path
out=Path('outputs');s=(out/'view_clip_runtime/auto_points_runtime.py').read_text(encoding='utf-8-sig')
a=s.index('class MINIA_OT_connect_auto_points');b=s.index('class MINIA_PT_auto_points',a);s=s[:a]+s[b:]
s=s.replace("self.layout.label(text='F接続時に途中点を自動追加')", "self.layout.label(text='F：仮の線を接続（点は増やさない）')").replace("self.layout.label(text='他の追加線は色更新時に点を追加')", "self.layout.label(text='色を更新：本線に途中点を追加')")
s=s.replace('for cls in (MINIA_OT_connect_auto_points,MINIA_PT_auto_points):','for cls in (MINIA_PT_auto_points,):')
s=s.replace("if not any(k.idname=='mini_a.connect_auto_points' for k in km.keymap_items):km.keymap_items.new('mini_a.connect_auto_points','F','PRESS',head=True)", "for k in list(km.keymap_items):\n            if k.idname=='mini_a.connect_auto_points':km.keymap_items.remove(k)")
(out/'view_clip_runtime/deferred_points_runtime.py').write_text(s,encoding='utf-8')
b=(out/'MINIA_AUTO_POINTS_BOOTSTRAP.py').read_text(encoding='utf-8-sig').replace('import auto_points_runtime as auto','import deferred_points_runtime as auto').replace('auto.register();auto.subdivide()','auto.register()')
(out/'MINIA_DEFERRED_POINTS_BOOTSTRAP.py').write_text(b,encoding='utf-8')
