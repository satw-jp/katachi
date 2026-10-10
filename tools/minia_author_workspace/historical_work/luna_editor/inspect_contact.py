import json
from pathlib import Path
p=Path('outputs/SELECTED_GEOMETRY_CONTACTS.json');d=json.loads(p.read_text());print('keys',d.keys());
for k,v in d.items():
 if isinstance(v,list): print(k,len(v),json.dumps(v[:2])[:1400])
