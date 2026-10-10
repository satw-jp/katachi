import json,zlib
from pathlib import Path
l=json.loads(zlib.decompress(Path('work/luna_editor/MINIA_SOURCE_LEDGER.json.zlib').read_bytes()));ids=l['demo']['member_ids'];rs={x['id']:x for x in l['records']};ps=[p for i in ids for p in rs[i]['points_plate_mm']];print('bounds',[[min(p[k] for p in ps) for k in range(3)],[max(p[k] for p in ps) for k in range(3)]])
