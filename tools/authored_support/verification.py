"""Independent plan, array and native comparisons after generation."""
from pathlib import Path
from .compare import compare_support
from .source_io import read_json, resolve_asset, sha256_file
from .mesh_backend import ManifoldKernel
from .native_compare import compare as compare_native


def verify_complete(*, actual, expected, generation, roots, golden, preset):
    kernel = ManifoldKernel.from_runtime_root(Path(roots['roots']['geometry_runtime']))
    source = Path(roots['roots']['outputs'])
    layout = Path(generation['plan_path']).parents[3]
    expected_roots = {str(r['mesh_source']).replace('\\', '/').split('/R4_', 1)[0]
                      for r in expected['objects'] if '/R4_' in str(r['mesh_source']).replace('\\', '/')}
    prefixes = [str(layout).replace('\\', '/'), str(source).replace('\\', '/'),
                str(generation.get('source_root', source)).replace('\\', '/'), *expected_roots]
    def semantic(value):
        if isinstance(value, dict):
            return {k:semantic(v) for k,v in value.items()}
        if isinstance(value, list):
            return [semantic(v) for v in value]
        if isinstance(value, str):
            normalized=value.replace('\\','/')
            for prefix in prefixes:
                if normalized.startswith(prefix + '/'):
                    return '<SOURCE_OR_GENERATED_LAYOUT>/' + normalized[len(prefix)+1:]
        return value
    plan = compare_support(semantic(actual), semantic(expected))
    expected_by_id = {r['id']:r for r in expected['objects']}
    mismatches, identities = [], {}
    for row in actual['objects']:
        if row['id'] not in expected_by_id:
            mismatches.append(row['id']);continue
        expected_path = str(expected_by_id[row['id']]['mesh_source']).replace('\\','/')
        expected_path = source / ('R4_' + expected_path.split('/R4_',1)[1])
        before = sha256_file(expected_path)
        a = kernel.mesh_array_identity(Path(row['mesh_source']))
        b = kernel.mesh_array_identity(expected_path)
        unchanged = before == sha256_file(expected_path)
        identities[row['id']] = dict(reference_sha256=before, actual=a, expected=b, reference_unchanged=unchanged)
        if a != b or not unchanged:
            mismatches.append(row['id'])
    mesh = dict(status='PASS' if not mismatches and plan['actual_count']==plan['expected_count'] else 'HOLD',
                compared=len(identities), mismatch_ids=mismatches, identities=identities)
    native = compare_native(plan=actual, assembly=read_json(Path(generation['assembly_path'])),
        topology=read_json(Path(generation['topology_path'])),
        package=resolve_asset(golden['native_package'], roots),
        expected_sha256=golden['native_package']['sha256'], kernel=kernel,
        transform_lock=read_json(preset/'CASE.json')['transform_chain'])
    return dict(status='PASS' if all(x['status']=='PASS' for x in [plan,mesh,native]) else 'HOLD',
                complete_comparison=True, plan_comparison=plan, mesh_comparison=mesh,
                native_part_comparison=native, physical_pass=False)
