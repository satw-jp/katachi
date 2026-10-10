import json
from pathlib import Path
b=Path(r'J:\\My Drive\\codex\\2026-09-10\\r4-astra-mocomoco-j-my-drive\\outputs')
d=json.load(open(b/'R4_D6_SIZE_RHYTHM_V2/data/surface.json'))
for r in d['surface'][:4]:print(json.dumps(r,indent=2)[:2500])
