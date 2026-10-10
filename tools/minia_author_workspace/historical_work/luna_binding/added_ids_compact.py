import json,pathlib
p=pathlib.Path(r'J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_ROOT_LAUNCH_R5/data/ADDED.json')
base=pathlib.Path(r'J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_ROOT_LAUNCH_R5/data/ADDITIONS_3MF_ID_MAP.json')
a=json.loads(p.read_text(encoding='utf-8'));m=json.loads(base.read_text(encoding='utf-8'));s={x['id'] for x in m}
x=[r for r in a if r['id'] not in s]
print(json.dumps({'nonmesh_count':len(x),'ids':[r['id'] for r in x]},indent=2))

