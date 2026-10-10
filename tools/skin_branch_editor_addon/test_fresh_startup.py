"""Separate process, saved isolated preferences, no install/enable call, no factory startup."""
import json
from pathlib import Path
import sys
import bpy

root = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
assert Path(bpy.utils.user_resource('CONFIG')).resolve() == root / 'config-test'
assert 'skin_branch_editor' in bpy.context.preferences.addons
import skin_branch_editor as addon
assert addon._REGISTERED
assert bpy.app.handlers.load_post.count(addon._load_post) == 1
bpy.ops.wm.open_mainfile(filepath=str(root / 'relocated data/outputs/AUTHOR_WORK_COPY.blend'), load_ui=False, use_scripts=False)
addon.finish_pending_load_for_test()
assert addon._STATE == 'BOUND', addon._REASON
addon.unbind()
(root / 'FRESH_STARTUP.json').write_text(json.dumps({'status': 'PASS', 'factory_startup': False,
    'install_or_enable_in_script': False, 'saved_preferences_loaded': True, 'bound_copy_reopened': True,
    'gui_acceptance': 'UNVERIFIED', 'zip_sha256': addon.project.sha(root / 'SKIN_BRANCH_EDITOR_0.1.0.zip')}, indent=2), encoding='utf-8')
print('FRESH_STARTUP_PASS')
