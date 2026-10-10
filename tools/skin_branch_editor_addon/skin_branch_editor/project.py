"""No Blender side effects: explicit project roots and immutable input hashes."""
import hashlib
import json
from pathlib import Path

def sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda: f.read(4 * 1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()

def resolve(root, value):
    relative = Path(value)
    if relative.is_absolute():
        raise ValueError('Project paths must be relative to the selected manifest')
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError('Project path escapes the selected data root')
    return path

def validate(path):
    path = Path(path).resolve()
    raw = path.read_bytes()
    value = json.loads(raw.decode('utf-8-sig'))
    if value['schema'] != 'MINIA_EDITOR_PROJECT_V0':
        raise ValueError('Unsupported project schema')
    if value['archive_commit'] != 'c75d4b0adcf04b0ad8bde7810dc906e72c36e948':
        raise ValueError('Wrong archive authority')
    root = path.parent
    locks = value['files']
    for name in ('COLOR_PATH_GRAPH.json.gz', 'SUPPORT_DISTANCE_COLORS.json',
                 'networkx-3.6.1.zip', 'host.npz', 'MINIA_LOWER70_BRANCHING_REVIEW.blend',
                 'MINIA_AUTO_100_RUN_007.blend'):
        row = locks[name]
        actual = sha(resolve(root, row['path']))
        if actual != row['sha256']:
            raise ValueError('Missing or mismatched dependency: ' + name)
    trusted = json.loads((Path(__file__).parent / 'DEPENDENCY_MANIFEST.json').read_text(encoding='utf-8'))
    for name, row in trusted['files'].items():
        if locks[name]['sha256'] != row['sha256'] or locks[name]['path'] != row['path']:
            raise ValueError('Dependency not bound to archive: ' + name)
    work = resolve(root, value['work_file'])
    if work in [resolve(root, row['path']) for row in locks.values()]:
        raise ValueError('Editable work file must be an independent copy')
    if not work.is_file() or work.suffix.lower() != '.blend':
        raise ValueError('Explicit .blend work copy missing')
    value['_manifest_path'] = str(path)
    value['_manifest_sha256'] = hashlib.sha256(raw).hexdigest()
    value['_root'] = str(root)
    value['_work_path'] = str(work)
    return value
