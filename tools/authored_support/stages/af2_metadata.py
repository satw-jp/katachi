"""Only the final ledger mutation from original package_review.py lines 11–16.

Packaging, legacy PASS assertions, native imports, profiles and reports are not
executed. Historical heights must not be presented as current print evidence.
"""
import copy
import json


def finalize_metadata(plan):
    result = copy.deepcopy(plan)
    for row in result['objects']:
        if row['kind'] == 'BODY_TO_BODY_TEMPORARY':
            for key in ['anchor_effective_z_mm', 'support_start_z_mm', 'support_birth_min_z_mm']:
                if key in row:
                    row['historical_' + key] = row.pop(key)
            row['current_material_min_z_mm'] = row['bbox_mm'][0][2]
    return result


def run(stage_root):
    path = stage_root / 'A/data/support_geometry.json'
    plan = json.loads(path.read_text(encoding='utf-8'))
    path.write_text(json.dumps(finalize_metadata(plan)), encoding='utf-8')
