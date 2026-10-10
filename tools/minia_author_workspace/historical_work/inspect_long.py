import json
from pathlib import Path
W=Path(__file__).parent;d=json.loads((W/'lower70_input.json').read_text());p=json.loads((W/'lower70_plan.json').read_text());pos=dict(d['nodes'])
for r in p['report']['straight_members']['over_limit']:
 print(round(r['length_mm'],1), min(pos[n]['position'][2] for n in r['path'] if n in pos),max(pos[n]['position'][2] for n in r['path'] if n in pos),r['endpoints'])
