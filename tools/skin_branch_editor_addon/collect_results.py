"""Publish only small, coordinate-free evidence; keep model/run/checkpoint data on Drive."""
import ast
import hashlib
import json
from pathlib import Path
import sys

here = Path(__file__).resolve().parent
repo = here.parents[1]
evidence = Path(sys.argv[1]).resolve()

def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))

def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda: f.read(4 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def write(path, value):
    Path(path).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

zip_path = evidence / 'SKIN_BRANCH_EDITOR_0.1.0.zip'
zip_sha = sha(zip_path)
before = read(evidence / 'ORIGINAL_HASHES_BEFORE.json')
after = []
for row in before:
    actual = sha(row['path'])
    after.append({'path': row['path'], 'sha256': actual, 'matches_archive': actual == row['sha256'],
                  'unchanged': actual == row['actual_sha256']})
assert all(r['matches_archive'] and r['unchanged'] for r in after)
write(evidence / 'ORIGINAL_HASHES_AFTER.json', after)
archive = read(repo / 'docs/evidence/minia_author_workspace/SOURCE_SNAPSHOT.json')
assert all(sha(repo / row['archive']) == row['sha256'] for row in archive['files'])
legacy = read(here / 'LEGACY_SOURCE_HASHES.json')
assert all(sha(here / 'skin_branch_editor/legacy' / row['path']) == row['sha256'] for row in legacy)
syntax = []
for file in here.rglob('*.py'):
    ast.parse(file.read_text(encoding='utf-8-sig'))
    syntax.append(str(file.relative_to(here)))
tests = {phase: read(evidence / ('TEST_' + phase.upper() + '.json')) for phase in ('lifecycle','synthetic','copy','reopen')}
for phase, value in tests.items():
    assert value['status'] == 'PASS', phase
    assert value['zip_sha256'] == zip_sha, 'test ZIP changed: ' + phase
old = read(evidence / 'OPERATIONS_LEGACY_2.json')
new = read(evidence / 'OPERATIONS_ADDON_2.json')
assert old['status'] == new['status'] == 'PASS'
assert old['zip_sha256'] == new['zip_sha256'] == zip_sha
keys = ('state_signature','autopoint_report','color_report','clip_interval','clip_tilt_interval')
parity = {key: old[key] == new[key] for key in keys}
mask = read(evidence / 'MASK_PARITY.json')
assert mask['status'] == 'PASS'
parity['mask_semantics'] = mask['values']['ADDON']['canonical_sha256'] == mask['values']['LEGACY']['canonical_sha256']
assert all(parity.values()), parity
fresh = read(evidence / 'FRESH_STARTUP.json')
moved = read(evidence / 'SECOND_RELOCATION.json')
assert fresh['status'] == moved['status'] == 'PASS'
assert fresh['zip_sha256'] == moved['zip_sha256'] == zip_sha
manifest = read(evidence / 'MANIFEST_TESTS.json')
assert manifest['status'] == 'PASS'
out = {
    'authority': 'https://github.com/satw-jp/katachi/issues/58',
    'status': 'PASS_FOR_AUTHOR_GUI_REVIEW',
    'stop': 'MINIA_BLENDER_ADDON_INSTALLABLE_FOR_AUTHOR_GUI_REVIEW',
    'target': {'os': 'Windows', 'blender': '5.2.2 LTS', 'build': 'd13f752e3b9c'},
    'zip_sha256': zip_sha,
    'archive_commit': 'c75d4b0adcf04b0ad8bde7810dc906e72c36e948',
    'preservation': {'archive_source_files': len(archive['files']), 'archive_hash_mismatches': 0,
                     'vendored_files': len(legacy), 'vendored_hash_mismatches': 0,
                     'original_drive_files_before_after': len(after), 'original_changes': 0,
                     'RUN_007': 'READ_ONLY / SHA UNCHANGED', 'checkpoint': 'SHA UNCHANGED / NOT RESUMED'},
    'syntax_python_files': len(syntax), 'syntax_failures': [],
    'headless_suites': {phase: {k: v for k, v in value.items() if k in ('status','cases','performance_seconds','peak_working_set_bytes')} for phase, value in tests.items()},
    'operation_kernels': {'addon_cases': new['cases'], 'archived_cases': old['cases'],
                          'exact_semantic_comparison': parity,
                          'mask_serialization': mask,
                          'comparison_limit': 'Same portability lifecycle adapter, archived vs packaged kernels. Original GUI bootstrap and viewport not executed.'},
    'performance': {'addon': new['performance_seconds'], 'archived_kernels': old['performance_seconds'],
                    'addon_peak_working_set_bytes': new['peak_working_set_bytes'],
                    'archived_peak_working_set_bytes': old['peak_working_set_bytes'],
                    'scope': 'Same Windows host, same external ZIP and independent LOWER70 copies; process peaks include Blender/data/display allocations; not another-PC benchmark.'},
    'fresh_startup': fresh, 'second_relocation': moved,
    'manifest_fail_closed': manifest,
    'companion': {'powershell_syntax': 'PASS (3 scripts)', 'exclusive_lock_exit': 2,
                  'STOP_request': 'PASS', 'start_executions': 0, 'GUI': 'UNVERIFIED', 'checkpoint_resume': 'NOT_EXECUTED'},
    'gui_acceptance': 'UNVERIFIED', 'other_pc': 'UNVERIFIED',
    'limitations': ['Headless scripts manually drain the scheduled one-shot restoration callback after open_mainfile; real GUI event-loop timing remains Author acceptance.',
                    'Native clip, quad projection/pan, mouse picking, overlay readability, shortcut competition and Windows Forms GUI not exercised.',
                    'Blender emitted a 315-block / 0.023346 MB native unfreed-memory warning on some headless copy exits; owned registrations/timers/draw/keymaps were checked separately and removed.',
                    'Initial isolation directory fallback and thumbnail write attempts were denied by sandbox; later tests precreate/assert profile paths and disable blend previews.',
                    'Local Drive-backed distribution pointer and SHA are verified; cloud synchronization/sharing is not certified.'],
    'boundaries': {'geometry_fabrication_changes': 0, 'optimizer_search_runs': 0, 'RUN_008': 0,
                   'slice': 0, 'Send': 0, 'Print': 0, 'production_addon_installs': 0,
                   'OS_GUI_automation': 0, 'main_merges': 0},
}
write(here / 'TEST_RESULTS.json', out)
write(here / 'DISTRIBUTION.json', {'version': '0.1.0', 'zip': {'path': str(zip_path), 'sha256': zip_sha,
    'bytes': zip_path.stat().st_size, 'storage': 'Drive-backed local path, binary not committed'},
    'private_evidence_root': str(evidence), 'cloud_share_url': None, 'cloud_sync': 'UNVERIFIED',
    'original_artifacts': '../../docs/evidence/minia_author_workspace/DRIVE_ARTIFACTS.json'})
print(json.dumps({'status': out['status'], 'parity': parity, 'archive_files': len(archive['files']),
                  'originals_unchanged': len(after), 'python_files': len(syntax), 'zip_sha256': zip_sha,
                  'performance': out['performance']}))
