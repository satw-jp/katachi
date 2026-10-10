"""Second relocation of an already saved bound work copy; same Windows, no GUI."""
import json
from pathlib import Path
import shutil
import sys
import bpy
import addon_utils

root = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
data = root / 'relocated data/outputs'
destination = root / 'second relocation/outputs'
assert not destination.exists(), 'refusing to overwrite relocation trial'
for kind, folder in [('CONFIG', 'config-test'), ('SCRIPTS', 'scripts-test'), ('EXTENSIONS', 'extensions-test')]:
    assert Path(bpy.utils.user_resource(kind)).resolve() == root / folder
destination.mkdir(parents=True)
manifest = json.loads((data / 'PROJECT.json').read_text(encoding='utf-8'))
for relative in [row['path'] for row in manifest['files'].values()] + ['PROJECT.json', manifest['work_file']]:
    target = destination / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(data / relative, target)
addon = addon_utils.enable('skin_branch_editor', default_set=True, persistent=True)
bpy.ops.wm.open_mainfile(filepath=str(destination / manifest['work_file']), load_ui=False, use_scripts=False)
addon.finish_pending_load_for_test()
assert addon._STATE == 'HOLD', 'old absolute manifest pointer must not silently bind moved file'
addon.bind(destination / 'PROJECT.json')
assert addon._STATE == 'BOUND'
mp = addon._SESSION.modules['midpoint_runtime']
scan = mp.scan_state(bpy.context.scene, False)
assert len(scan['cache']['anchors']) == 18842
old = bpy.context.scene['skin_branch_project_sha256']
assert old == addon.project.sha(data / 'PROJECT.json') == addon.project.sha(destination / 'PROJECT.json')
addon.unbind()
(root / 'SECOND_RELOCATION.json').write_text(json.dumps({'status': 'PASS', 'same_windows': True,
    'stale_absolute_pointer': 'HOLD', 'explicit_new_manifest': 'BOUND', 'manifest_identity_retained': True,
    'protected_anchors': 18842, 'gui_acceptance': 'UNVERIFIED', 'other_pc': 'UNVERIFIED',
    'zip_sha256': addon.project.sha(root / 'SKIN_BRANCH_EDITOR_0.1.0.zip')}, indent=2), encoding='utf-8')
print('SECOND_RELOCATION_PASS')
