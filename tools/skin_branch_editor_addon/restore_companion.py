"""Prepare a new, disconnected companion copy. Never launches dashboard or search."""
import argparse
import json
from pathlib import Path
import shutil
import importlib.util

parser = argparse.ArgumentParser()
parser.add_argument('--project', type=Path, required=True)
parser.add_argument('--destination', type=Path, required=True)
parser.add_argument('--blender-exe', type=Path, required=True)
args = parser.parse_args()
spec = importlib.util.spec_from_file_location('project_validation', Path(__file__).parent / 'skin_branch_editor/project.py')
validation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validation)
validate, resolve, sha = validation.validate, validation.resolve, validation.sha
value = validate(args.project)
assert args.blender_exe.is_file(), 'Blender executable missing'
assert not args.destination.exists(), 'Refusing to overwrite an existing companion/checkpoint'
root = args.destination.resolve()
source = Path(__file__).parent / 'skin_branch_editor/legacy'
shutil.copytree(source, root)
for name, row in value['files'].items():
    out = root / row['path']
    out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(resolve(Path(value['_root']), row['path']), out)
    assert sha(out) == row['sha256']
task = root / 'MINIA_OPTIMIZER'
settings = json.loads((task / 'settings.json').read_text(encoding='utf-8-sig'))
settings['host_npz'] = str(root / 'host.npz')
settings['source_blend'] = '../MINIA_LOWER70_BRANCHING_REVIEW.blend'
settings['bootstrap'] = '../MINIA_LOWER50_BOOTSTRAP.py'
(task / 'settings.json').write_text(json.dumps(settings, indent=2) + '\n', encoding='utf-8')
old = r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
for name in ('run.ps1', 'dashboard.ps1'):
    path = task / name
    text = path.read_text(encoding='utf-8-sig')
    assert old in text
    text = text.replace(old, str(args.blender_exe.resolve()).replace("'", "''"))
    path.write_bytes(b'\xef\xbb\xbf' + text.replace('\r\n', '\n').replace('\n', '\r\n').encode('utf-8'))
# Preserve RUN_007 as read-only comparison; no latest_verified checkpoint and no auto-resume.
(task / 'RESTORED_NOT_STARTED.txt').write_text(
    'Prepared only. Do not Start/resume under Issue #58. Existing RUN_007 is read-only.\n'
    'Original checkpoint/latest_verified are not silently regenerated. Reopening verified runs uses explicit paths.\n', encoding='utf-8')
print('COMPANION_PREPARED_NOT_STARTED', root)
