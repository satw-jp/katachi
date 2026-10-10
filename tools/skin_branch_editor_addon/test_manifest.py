"""Actual relocated dependencies: fail closed on hash/path/missing-file errors."""
import copy
import importlib.util
import json
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
data = root / 'relocated data/outputs'
spec = importlib.util.spec_from_file_location('project_validation', Path(__file__).parent / 'skin_branch_editor/project.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
original = json.loads((data / 'PROJECT.json').read_text(encoding='utf-8'))
cases = []
for name in ('bad_hash', 'escape_path', 'missing_file'):
    value = copy.deepcopy(original)
    row = value['files']['COLOR_PATH_GRAPH.json.gz']
    if name == 'bad_hash':
        row['sha256'] = '0' * 64
    elif name == 'escape_path':
        row['path'] = '../outside.json.gz'
    else:
        row['path'] = 'does_not_exist.json.gz'
    path = data / ('MANIFEST_TEST_' + name + '.json')
    path.write_text(json.dumps(value), encoding='utf-8')
    try:
        module.validate(path)
        raise AssertionError('expected validation error: ' + name)
    except (ValueError, FileNotFoundError) as exc:
        cases.append({'name': name, 'pass': True, 'reason': str(exc)})
assert module.validate(data / 'PROJECT.json')
(root / 'MANIFEST_TESTS.json').write_text(json.dumps({'status': 'PASS', 'cases': cases}, indent=2), encoding='utf-8')
print('MANIFEST_TESTS_PASS')
