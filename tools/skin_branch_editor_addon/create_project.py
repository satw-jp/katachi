"""Run on an independently copied, SHA-verified LOWER70 source with isolated Blender."""
import base64
import hashlib
import json
from pathlib import Path
import shutil
import sys
import zlib
import bpy

root = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
sys.path.insert(0, str(Path(__file__).parent))
from skin_branch_editor.project import sha
deps = json.loads((Path(__file__).parent / 'DEPENDENCY_MANIFEST.json').read_text(encoding='utf-8'))
for name, row in deps['files'].items():
    assert sha(root / row['path']) == row['sha256'], 'HOLD: ' + name
source = root / deps['files']['MINIA_LOWER70_BRANCHING_REVIEW.blend']['path']
assert Path(bpy.data.filepath).resolve() == source, 'Only verified relocated LOWER70 is accepted'
raw = zlib.decompress(base64.b64decode(''.join(bpy.data.texts['MINIA_SOURCE_LEDGER.zlib.base64'].as_string().split())))
digest = hashlib.sha256(raw).hexdigest()
assert digest == bpy.context.scene['source_ledger_sha256']
work = root / 'AUTHOR_WORK_COPY.blend'
manifest = root / 'PROJECT.json'
assert not work.exists() and not manifest.exists(), 'Refusing to overwrite an existing project'
shutil.copyfile(source, work)
manifest.write_text(json.dumps({
    'schema': 'MINIA_EDITOR_PROJECT_V0', 'archive_commit': deps['archive_commit'],
    'files': deps['files'], 'work_file': work.name,
    'source_ledger_sha256': digest,
    'source_to_plate': json.loads(raw)['source_to_plate'],
    'source_reference_fingerprints': json.loads(bpy.context.scene['source_reference_fingerprints']),
    'readonly_runs': ['MINIA_AUTO_100_RUN_007.blend'],
}, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print('PROJECT_CREATED', str(manifest))
