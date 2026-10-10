"""Read-only original audit; copy only editor dependencies into an isolated folder."""
import argparse
import ast
import hashlib
import json
from pathlib import Path
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent

def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda: f.read(4 * 1024 * 1024), b''):
            h.update(b)
    return h.hexdigest()

def write(path, value):
    Path(path).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--audit-dir', type=Path, required=True)
    args = p.parse_args()
    args.audit_dir.mkdir(parents=True, exist_ok=True)
    snapshot = json.loads((ROOT / 'docs/evidence/minia_author_workspace/SOURCE_SNAPSHOT.json').read_text())
    checks = []
    for row in snapshot['files']:
        actual = sha(ROOT / row['archive'])
        checks.append({'archive': row['archive'], 'sha256': actual, 'matches': actual == row['sha256']})
    assert all(c['matches'] for c in checks), 'archive copy hash mismatch'
    write(args.audit_dir / 'ARCHIVE_HASH_CHECK.json', checks)
    ledger = json.loads((ROOT / 'docs/evidence/minia_author_workspace/DRIVE_ARTIFACTS.json').read_text())
    artifacts = []
    for row in ledger['artifacts']:
        path = Path(row['path'])
        actual = sha(path) if path.is_file() else None
        artifacts.append({**row, 'actual_sha256': actual, 'matches': actual == row['sha256']})
    write(args.audit_dir / 'ORIGINAL_HASHES_BEFORE.json', artifacts)
    # Vendor only original executable editor source, preserving every duplicate and byte.
    original = ROOT / 'tools/minia_author_workspace/outputs'
    target = HERE / 'skin_branch_editor/legacy'
    source_map = []
    inventory = []
    for file in sorted(original.rglob('*')):
        if not file.is_file():
            continue
        rel = file.relative_to(original)
        out = target / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(file, out)
        source_map.append({'path': str(rel).replace('\\', '/'), 'sha256': sha(file)})
        if file.suffix == '.py':
            tree = ast.parse(file.read_text(encoding='utf-8-sig'))
            inventory.append({'path': str(rel).replace('\\', '/'),
                'imports': [ast.unparse(n) for n in ast.walk(tree) if isinstance(n, (ast.Import, ast.ImportFrom))],
                'registrations_and_paths': [line.strip() for line in file.read_text(encoding='utf-8-sig').splitlines()
                    if any(x in line for x in ('register_class', 'keymap', 'draw_handler', 'load_post', 'timers.', 'sys.path', 'Path(', 'J:', 'C:'))]})
    write(HERE / 'LEGACY_SOURCE_HASHES.json', source_map)
    write(HERE / 'RUNTIME_INVENTORY.json', inventory)
    selected = ['COLOR_PATH_GRAPH.json.gz', 'SUPPORT_DISTANCE_COLORS.json',
                'networkx-3.6.1.zip', 'host.npz', 'MINIA_LOWER70_BRANCHING_REVIEW.blend',
                'MINIA_AUTO_100_RUN_007.blend']
    data = args.audit_dir / 'relocated data/outputs'
    data.mkdir(parents=True, exist_ok=True)
    dependencies = {}
    for name in selected:
        row = next(r for r in artifacts if Path(r['path']).name == name)
        assert row['matches'], 'missing/mismatched original: ' + name
        relative = 'color_path_runtime/' + name if name.endswith('.zip') else name
        out = data / relative
        out.parent.mkdir(parents=True, exist_ok=True)
        assert not out.exists(), 'refusing to overwrite test dependency: ' + str(out)
        shutil.copyfile(row['path'], out)
        assert sha(out) == row['sha256']
        dependencies[name] = {'path': relative, 'sha256': row['sha256']}
    archive = data / 'color_path_runtime/networkx-3.6.1.zip'
    with zipfile.ZipFile(archive) as z:
        licenses = [n for n in z.namelist() if n.endswith('LICENSE.txt')]
        assert licenses
        license_text = z.read(licenses[0]).decode()
        assert 'Redistribution and use' in license_text
        (HERE / 'NETWORKX_LICENSE_EXTERNAL.txt').write_text(license_text, encoding='utf-8')
    write(HERE / 'DEPENDENCY_MANIFEST.json', {
        'authority': 'https://github.com/satw-jp/katachi/issues/58',
        'archive_commit': 'c75d4b0adcf04b0ad8bde7810dc906e72c36e948',
        'target': 'Windows / Blender 5.2.2 LTS d13f752e3b9c',
        'blender_bundled': ['Python', 'NumPy', 'mathutils', 'bmesh', 'gpu'],
        'networkx': {'version': '3.6.1', 'license': 'BSD-3-Clause',
                     'redistribution': 'permitted with copyright/license/disclaimer; this ZIP remains external',
                     'license_evidence': 'NETWORKX_LICENSE_EXTERNAL.txt', 'included_in_addon': False},
        'files': dependencies,
        'companion': 'byte-preserved external Windows Forms dashboard; not executed by addon',
        'originals': '../minia_author_workspace/RESTORE.md',
        'checkpoint': 'external original SHA ledger; never automatically resumed',
        'source': 'embedded MINIA_SOURCE_LEDGER.zlib.base64 checked against scene and project manifest',
        'extra_layerwise_dependencies': 'SOURCE_BINDING / locks / height cache / source records needed only by historical layerwise UI, which is not registered here'
    })
    write(args.audit_dir / 'DEPENDENCIES.json', dependencies)
    print(json.dumps({'archive_files': len(checks), 'original_matches': sum(r['matches'] for r in artifacts),
                      'original_total': len(artifacts), 'data_root': str(data)}))

if __name__ == '__main__':
    main()
