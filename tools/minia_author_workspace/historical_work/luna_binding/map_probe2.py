import json
from pathlib import Path
p=Path(r'J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_A_F2_PRINT_PREPARATION\A\data\ARTWORK_PERMANENT_ID_MAP.json')
x=json.loads(p.read_text(encoding='utf-8'));print('records',len(x),'sum',sum(int(a['triangles']) for a in x),'last',x[-2:])
