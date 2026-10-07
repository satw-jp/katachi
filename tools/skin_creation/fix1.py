"""Explicit one-way conversion of the exact delivered archive; never runs saved code."""
import argparse
import hashlib
import json
import zipfile
from pathlib import Path
from engine import read, write, validate_assets
from metadata import structure_digest, validate_mesh
from server import safe_relative, pack, validate_state, dependency_versions

SOURCE_SHA = '654535f9bc4422bebfe965cf5fa936ca7b67568696ee685a650cf17c91bba0d9'

def convert(source, target, output):
    data = source.read_bytes()
    if hashlib.sha256(data).hexdigest() != SOURCE_SHA:
        raise ValueError('Not the exact delivered archive; no conversion performed')
    if target.exists() or output.exists():
        raise ValueError('Conversion requires new output paths')
    with zipfile.ZipFile(source) as z:
        manifest = json.loads(z.read('manifest.json'))
        files = {}
        for name, lock in manifest['files'].items():
            safe_relative(name)
            payload = z.read('blobs/' + lock['sha256'])
            if len(payload) != lock['bytes'] or hashlib.sha256(payload).hexdigest() != lock['sha256']:
                raise ValueError('Source payload mismatch: ' + name)
            files[name] = payload
    for name, payload in files.items():
        p = target / name; p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(payload)
    validate_assets(target / 'assets')
    if read(target / 'runtime.json')['packages'] != dependency_versions():
        raise ValueError('Source runtime dependency mismatch')
    state = read(target / 'project.json')
    changes = []
    for path in sorted(target.rglob('STRUCTURE.json')):
        if path.relative_to(target).parts[0] not in ('layouts', 'results'):
            continue
        structure = read(path)
        counts = validate_mesh(structure, path.with_name('MEMBER_MESHES.npz'), metadata=False)
        digest = structure_digest(structure['members'])
        old = structure['structure_semantic_sha256']
        fixed = dict(structure, mesh_archive=dict(structure['mesh_archive'], **counts),
                     structure_semantic_sha256=digest)
        if fixed != structure:
            write(path, fixed)
            changes.append(dict(path=path.relative_to(target).as_posix(), old=old, new=digest, counts=counts))
    for key, result in state['results'].items():
        digest = read(target / result['structure'])['structure_semantic_sha256']
        if result['meshHash'] != digest:
            result['meshHash'] = digest
            write(target / 'results' / key / 'result.json', result)
    state['metadataFix1'] = dict(sourceArchiveSha256=SOURCE_SHA, originalGeneratorCode=manifest['code'],
                                operation='metadata-only; original geometry not regenerated', changes=changes)
    validate_state(state, target)
    # Every NPZ and every unchanged input/layout file remains byte-identical.
    changed = [n for n, payload in files.items() if (target / n).read_bytes() != payload]
    if any(not (n.endswith('/STRUCTURE.json') or n.endswith('/result.json')) for n in changed):
        raise ValueError('Conversion changed a protected payload')
    write(target / 'session.json', state)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(pack(target, state))
    report = dict(sourceSha256=SOURCE_SHA, outputSha256=hashlib.sha256(output.read_bytes()).hexdigest(),
                  outputBytes=output.stat().st_size, changedPayloads=changed, changes=changes,
                  protectedPayloadsByteIdentical=True, results=len(state['results']))
    write(output.with_suffix('.comparison.json'), report)
    return report

if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('source', type=Path); p.add_argument('target', type=Path); p.add_argument('output', type=Path)
    a = p.parse_args(); print(json.dumps(convert(a.source, a.target, a.output), indent=2))
