from pathlib import Path
p=Path('outputs/view_clip_runtime/single_view_clip_adapter.py');s=p.read_text(encoding="utf-8");s=s.replace("q.view_perspective=state['perspective'];q.lock_rotation=state['locked']", "q.view_perspective=state['perspective']\n    if q.lock_rotation!=state['locked']:q.lock_rotation=state['locked']")
s=s.replace("for q,state in zip(space.region_quadviews,saved):_restore_view(q,state)", "for q in space.region_quadviews:\n                if q.use_box_clip:q.use_box_clip=False\n            for q,state in reversed(list(zip(space.region_quadviews,saved))):_restore_view(q,state)")
p.write_text(s,encoding='utf-8')

