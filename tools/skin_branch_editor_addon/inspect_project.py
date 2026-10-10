"""Run with isolated background Blender on a copied .blend; never saves it."""
import base64
import hashlib
import json
from pathlib import Path
import sys
import zlib
import bpy

root = Path(sys.argv[sys.argv.index('--') + 1])
raw = zlib.decompress(base64.b64decode(''.join(bpy.data.texts['MINIA_SOURCE_LEDGER.zlib.base64'].as_string().split())))
ledger = json.loads(raw)
summary = {'ledger_keys': list(ledger), 'scene_keys': list(bpy.context.scene.keys()),
           'transform': {k: v for k, v in ledger.items() if 'transform' in k or 'scale' in k or 'translation' in k},
           'source_ledger_sha256': hashlib.sha256(raw).hexdigest(),
           'references': json.loads(bpy.context.scene['source_reference_fingerprints'])}
(root / 'PROJECT_INSPECTION.json').write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding='utf-8')
print('PROJECT_INSPECTION', summary['ledger_keys'], summary['transform'])
