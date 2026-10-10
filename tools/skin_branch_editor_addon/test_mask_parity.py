"""Legacy deletes append a Python set: compare saved mask semantics, not JSON order."""
import hashlib
import json
from pathlib import Path
import sys
import bpy

root = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
data = root / 'relocated data/outputs'
values = {}
for label in ('ADDON', 'LEGACY'):
    bpy.ops.wm.open_mainfile(filepath=str(data / ('TEST_' + label + '_2.blend')), load_ui=False, use_scripts=False)
    raw = bpy.context.scene['minia_deleted_intervals_v1']
    masks = json.loads(raw)
    canonical = sorted(json.dumps(row, sort_keys=True, separators=(',', ':')) for row in masks)
    values[label] = {'count': len(masks), 'raw_sha256': hashlib.sha256(raw.encode()).hexdigest(),
                     'canonical_sha256': hashlib.sha256(json.dumps(canonical).encode()).hexdigest()}
assert values['ADDON']['canonical_sha256'] == values['LEGACY']['canonical_sha256']
(root / 'MASK_PARITY.json').write_text(json.dumps({'status': 'PASS', 'values': values,
    'note': 'Original delete_intervals iterates a set. Semantic mask rows match; serialized row order can differ across processes.'}, indent=2), encoding='utf-8')
print('MASK_SEMANTIC_PARITY_PASS')
