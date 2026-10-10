import json
from pathlib import Path
base=Path(r'J:\\My Drive\\codex\\2026-09-10\\r4-astra-mocomoco-j-my-drive\\outputs')
files=['R4_A_F2_PRINT_PREPARATION/A/data/structure.json','R4_A_MINI_LOCAL_LOBE_R1/data/ADDED.json','R4_ROOT_LAUNCH_R5/data/FROZEN_ADDITIONS.json','R4_A_F2_PRINT_PREPARATION/A/data/support_geometry.json','R4_D6_SIZE_RHYTHM_V2/data/surface.json','R4_A_F2_PRINT_PREPARATION/A/data/FLOWER_PRINT_ASSIGNMENT.json']
for f in files:
 p=base/f;d=json.loads(p.read_text(encoding='utf-8-sig'))
 print('\nFILE',f,'type',type(d).__name__,'len',len(d))
 if isinstance(d,dict): print('keys',list(d)[:15]);
 if isinstance(d,list) and d: print('first',json.dumps(d[0],ensure_ascii=False)[:900])
 elif isinstance(d,dict):
  for k,v in d.items(): print('first_key',k,'type',type(v).__name__,'sample',json.dumps(v[0] if isinstance(v,list) and v else v,ensure_ascii=False)[:900]);break
