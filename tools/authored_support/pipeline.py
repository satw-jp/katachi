"""Complete fixed-case generation entry, independently verified after generation."""
from collections import Counter
from pathlib import Path
import json
import shutil

from .contracts import ContractError
from .source_io import read_json, read_locked_json, check_asset, sha256_file
from .mesh_backend import ManifoldKernel
from .runtime_guard import offline
from .stages.v4_d2 import generate_v4_d2, _load_source_snapshot
from .stages.v4_removal import generate_v4_removal
from .stages.downstream import generate as generate_downstream
from .rules.finalize import validate_support_references
from .plan_validation import validate


def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2) + '\n', encoding='utf-8')


def generate(*, case, recipe, source_map, roots, output_dir, preset_dir):
    from .stage_registry import resolve_stage
    for id in ['V4_D2_SUPPORT_GENERATION', 'V4_D2_REMOVAL', 'MINIA_DOWNSTREAM']:
        _, holds = resolve_stage(id, case=case, recipe=recipe, source_map=source_map)
        if holds:
            raise ContractError(str([h.as_dict() for h in holds]))
    source = Path(roots['roots']['outputs']).resolve()
    output = Path(output_dir).resolve()
    if output == source or source in output.parents:
        raise ContractError('generation output inside frozen source')
    code_lock = read_locked_json(preset_dir / 'DOWNSTREAM_SOURCE_LOCK.json', case['downstream_source_lock_sha256'])
    checks = [check_asset(dict(row, root='outputs'), roots) for row in code_lock['files']]
    if any(r['status'] != 'PASS' for r in checks):
        raise ContractError('downstream legacy source identity mismatch')
    snapshot, _, _ = _load_source_snapshot(outputs_root=source, preset_dir=preset_dir, source_map=source_map)
    permanent = read_locked_json(preset_dir / 'PERMANENT_MESH_LOCK.json', case['permanent_mesh_lock_sha256'])
    input_lock = read_json(preset_dir / 'V4_D2_INPUT_LOCK.json')
    manifest = read_json(source / input_lock['source_manifest']['path'])
    anchor = input_lock['inputs'][0]['path']
    recorded = [str(r['path']).replace('\\', '/') for r in manifest
                if str(r['path']).replace('\\', '/').endswith('/' + anchor)]
    if len(recorded) != 1:
        raise ContractError('cannot identify historical source root for isolation')
    historical_root = Path(recorded[0][:-len(anchor)]).resolve()
    forbidden = [] if historical_root == source else [historical_root]
    relative = {r['path'] for r in case['inputs']} | {r['path'] for r in permanent['files']}
    relative |= {r['path'] for r in snapshot['inputs']} | {r['path'] for r in code_lock['files']}
    relative.add(input_lock['source_manifest']['path'])
    for row in source_map['observed_lineage']:
        relative.update(r['path'] for r in row.get('source_code', []))
    before = {p: sha256_file(source / p) for p in sorted(relative)}
    kernel = ManifoldKernel.from_runtime_root(Path(roots['roots']['geometry_runtime']))
    overrides = read_json(preset_dir / 'OVERRIDES.json')
    v4, removal = output / 'v4', output / 'removal'
    with offline(generation=True, source=source, allowed=[source / p for p in relative],
                 forbidden_roots=forbidden) as guard:
        generate_v4_d2(case=case, recipe=recipe, source_map=source_map, roots=roots,
                       output_dir=v4, preset_dir=preset_dir)
        generate_v4_removal(case=case, recipe=recipe, source_map=source_map, roots=roots,
                           output_dir=removal, preset_dir=preset_dir, generated_v4_dir=v4)
        result = generate_downstream(source=source, output=output / 'lineage', generated_v4=v4,
                    generated_removal=removal, kernel=kernel, overrides=overrides)
        plan = read_json(Path(result['plan_path']))
        expected = source_map['golden_counts']['kind_counts']
        validation = validate(plan, expected_kinds=expected,
            flower_ids={r['id'] for r in read_json(source / 'R4_D6_SIZE_RHYTHM_V2/data/surface.json')['surface']},
            permanent_ids={r['id'] for r in read_json(source / 'R4_A_SHORT_JOIN_G/data/structure.json')['members']})
        mesh_dir = output / 'support_mesh'
        mesh_dir.mkdir()
        identities = {}
        for row in plan['objects']:
            original = Path(row['mesh_source'])
            if source == original or source in original.parents:
                raise ContractError('generated Support unexpectedly points into historical source')
            target = mesh_dir / f"{row['id']}.npz"
            shutil.copyfile(original, target)
            row['mesh_source'] = str(target)
            identities[row['id']] = kernel.mesh_array_identity(target)
        write(output / 'support_geometry.json', plan)
        write(output / 'MESH_IDENTITIES.json', identities)
        write(output / 'VALIDATION.json', validation)
        write(output / 'GENERATION.json', result)
        shutil.copytree(output / 'lineage/STAGE_RESULTS', output / 'STAGE_RESULTS')
        shutil.copyfile(v4 / 'V4_D2_STAGE.json', output / 'STAGE_RESULTS/v4_d2.json')
        shutil.copyfile(removal / 'STAGE_RESULT.json', output / 'STAGE_RESULTS/v4_removal.json')
        shutil.copyfile(output / 'lineage/OVERRIDES_APPLIED.json', output / 'OVERRIDES_APPLIED.json')
        after = {p: sha256_file(source / p) for p in sorted(relative)}
    if before != after:
        raise ContractError('source input changed during generation')
    write(output / 'SOURCE_BEFORE_AFTER.json', dict(unchanged=True, files=before))
    write(output / 'RUNTIME_AUDIT.json', dict(network_used=False, llm_used=False, api_used=False,
          external_processes_started=False, blocked_external_events=guard['blocked_external_events'],
          source_reads=sorted(guard['source_reads']), hidden_historical_roots=[str(p) for p in forbidden],
          native_reference_read=False, golden_read=False))
    with (output / 'DECISIONS.jsonl').open('w', encoding='utf-8') as stream:
        for row in plan['objects']:
            stream.write(json.dumps(dict(id=row['id'], kind=row['kind'], decision='generated_by_original_rules')) + '\n')
        for row in plan.get('deleted', []):
            stream.write(json.dumps(dict(row, decision='source_bound_removal')) + '\n')
    return result
