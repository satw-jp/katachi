"""Fixed legacy lineage from this run's V4 output. No reference Support reads."""
from pathlib import Path
import importlib
import json
import shutil

from ..contracts import ContractError
from ..source_io import read_json, sha256_file
from ..run_metrics import start_timer, finish_metrics
from .v5_prepare import generate_occupancy
from .flower_sections import generate as generate_flower_sections
from .v8_topology import diagnose, normalize
from ..rules.lower_support import generate_lower_support

V5_STAGES = ('route', 'body_braces', 'body_surface_links', 'brace_network',
             'build_meshes', 'audit_support', 'recheck_access', 'repair_free_intervals', 'coverage')
V7_STAGES = (('demands_anchors', None), ('route_external', None),
             ('audit_new_routes', 'external'), ('route_body', None),
             ('audit_new_routes', 'body'), ('route_outer_body', None),
             ('audit_new_routes', 'outer'), ('replace_t00841', None),
             ('audit_new_routes', 'special'), ('anchor_birth', None),
             ('scaffold', None), ('repair_brace_gaps', None), ('feet', None),
             ('assemble', None), ('exact_main_clearance', None), ('clearance_patch', None))


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, default=lambda a: a.tolist()) + '\n', encoding='utf-8')


def generate(*, source, output, generated_v4, generated_removal, kernel, overrides):
    """Caller verifies all pinned inputs before entering this generator."""
    operations = overrides.get('operations', [])
    if overrides.get('case_id') != 'MINI_A_AUTHORED_SUPPORT_LEGACY_V1' or \
       sorted(op.get('id', '') for op in operations) != ['N00224', 'X03795'] or \
       any(op.get('operation') != 'remove_support_record' for op in operations):
        raise ContractError('fixed MINI_A overrides must contain exactly the two source-bound removals')
    source, output = Path(source).resolve(), Path(output).resolve()
    if output.exists() or output == source or source in output.parents:
        raise ContractError('downstream output must be new and outside source tree')
    output.mkdir(parents=True)
    layout = output / 'outputs'
    np = kernel.np
    stages = []

    def stage(group, name, root, kind=None):
        timer = start_timer()
        print('STAGE', group, name, kind or '', flush=True)
        module = importlib.import_module(f'tools.authored_support.stages.legacy_{group}.{name}')
        fn = module.run
        fn(root, kind) if kind else fn(root)
        record = dict(group=group, name=name, kind=kind, metrics=finish_metrics(timer),
                      implementation_sha256=sha256_file(Path(module.__file__)),
                      data_hashes={p.relative_to(root).as_posix():sha256_file(p)
                                   for p in sorted(root.rglob('*.json'))})
        stages.append(record)
        write(output / 'STAGE_RESULTS' / f'{group}_{name}_{kind or "default"}.json', record)
        write(output / 'STAGES.json', stages)

    def frozen(folder, names):
        target = layout / folder / 'data'
        target.mkdir(parents=True, exist_ok=True)
        for name in names:
            shutil.copyfile(source / folder / 'data' / name, target / name)
        return layout / folder

    v2 = frozen('R4_D6_SIZE_RHYTHM_V2', ['surface.json', 'D6_local.npz', 'contact_comparison_threshold.json'])
    v3 = frozen('R4_V2_INTERNAL_PROPOSAL_V3', ['surface.json', 'structure.json',
                'large_layer_summary.json', 'large_object_births.json', 'host_domain.npz',
                'load_cantilever_review.json', 'protected_corridors.json'])
    shutil.copytree(source / v3.name / 'data/members', v3 / 'data/members')

    # Relocate only frozen mesh pointers. Their data and geometry remain unchanged.
    # The historical prefix is derived from a known fixed V3 member path.
    original_members = read_json(source / 'R4_V6_INTERNAL_ENVELOPE_REVIEW/data/structure.json')['members']
    paths = [str(r['mesh_source']).replace('\\', '/') for r in original_members if r.get('mesh_source')]
    prefixes = {p.split('/R4_', 1)[0] for p in paths if '/R4_' in p}
    if len(prefixes) != 1:
        raise ContractError('frozen mesh source root is ambiguous')
    historical = prefixes.pop()

    def relocate_members(root):
        p = root / 'data/structure.json'
        doc = read_json(p)
        for row in doc['members']:
            if not row.get('mesh_source'):
                continue
            old = str(row['mesh_source']).replace('\\', '/')
            if not old.startswith(historical + '/'):
                raise ContractError('frozen Permanent pointer outside source root')
            row['mesh_source'] = str(source / old[len(historical) + 1:])
        write(p, doc)

    relocate_members(v3)
    v4 = layout / 'R4_V2_V3_A1_EXPERIMENTAL_V4/data'
    v4.mkdir(parents=True)
    shutil.copyfile(generated_v4 / 'candidates.json', v4 / 'additions.json')
    shutil.copyfile(generated_removal / 'removal_sequence.json', v4 / 'removal_sequence.json')
    shutil.copyfile(generated_v4 / 'prep/vertical_first_material.npz', v4 / 'vertical_first_material.npz')
    shutil.copytree(generated_v4 / 'meshes', v4 / 'D2')
    v5 = layout / 'R4_V5_AUTHORED_SUPPORT_REVIEW'
    (v5 / 'data/meshes').mkdir(parents=True)
    grid = generate_occupancy(v3, v2 / 'data/D6_local.npz', output / 'occupancy', np=np)
    write(v5 / 'data/grid.json', grid)
    for name in V5_STAGES:
        stage('v5', name, v5)

    v6 = frozen('R4_V6_INTERNAL_ENVELOPE_REVIEW', ['structure.json', 'changes.json'])
    relocate_members(v6)
    (v6 / 'data/members').mkdir()
    for row in read_json(v6 / 'data/changes.json'):
        shutil.copyfile(source / v6.name / 'data/members' / f"{row['id']}.npz",
                        v6 / 'data/members' / f"{row['id']}.npz")
    grid = generate_occupancy(v3, v2 / 'data/D6_local.npz', output / 'v6_occupancy',
                              np=np, structure_override=read_json(v6 / 'data/structure.json'))
    write(v6 / 'data/grid.json', grid)
    v7 = layout / 'R4_V7_STRONG_SUPPORT_GATE'
    write(v7 / 'data/grid.json', grid)
    from scipy import ndimage as ndi
    occ = np.load(grid['path'], mmap_mode='r')
    rooted_path = output / 'v6_occupancy/rooted.npy'
    rooted = np.lib.format.open_memmap(rooted_path, mode='w+', dtype=bool, shape=occ.shape)
    prev = np.zeros(occ.shape[1:], bool)
    for layer, mask in enumerate(occ):
        lab, n = ndi.label(mask, np.ones((3, 3), int))
        ids = np.unique(lab[prev]) if layer else np.arange(1, n + 1)
        ids = ids[ids > 0]
        prev = np.isin(lab, ids) & mask
        rooted[layer] = prev
    rooted.flush()
    write(v7 / 'data/rooted_grid.json', dict(**grid, rooted_path=str(rooted_path),
          credit='V6 BODY only; no new Support credit; not G-code or physical proof.'))
    del rooted, occ
    for name in ['support_check', 'repair_contact']:
        stage('v6', name, v6)
    generate_flower_sections(v3, v2, output / 'work/internal_v3_section_cache/large', np=np)
    for name, kind in V7_STAGES:
        stage('v7', name, v7, kind)

    v8 = layout / 'R4_V8_FABRICATION_EXPORT_GATE'
    mesh_out = v8 / 'data/topology_normalized'
    mesh_out.mkdir(parents=True)
    topology = {}
    for row in read_json(v7 / 'data/support_geometry.json')['objects']:
        with np.load(row['mesh_source']) as q:
            issue = diagnose(row['id'], q, np)
            if issue:
                v, f, _, _ = normalize(q, issue, kernel)
                p = mesh_out / f"{row['id']}.npz"
                np.savez_compressed(p, vertices=v, faces=f)
                topology[row['id']] = str(p)
    for id in ['A3864', 'A2063']:
        topology[id] = str(source / v8.name / 'data/topology_normalized' / f'{id}.npz')
    write(v8 / 'data/mesh_export_overrides.json', topology)
    a1 = layout / 'R4_A1_MASTER_SUPPORT_PHYSICAL_REVISION'
    (a1 / 'data').mkdir(parents=True)
    stage('a1', 'revise_lower', a1)
    for folder in ['R4_A_SHORT_JOIN_G', 'R4_F2_DEEP_JOIN_G', 'R4_A1_MINI_RELEASE_CANDIDATE']:
        relocate_members(frozen(folder, ['structure.json']))
    rc = layout / 'R4_A1_MINI_RELEASE_CANDIDATE/data/support_geometry.json'
    shutil.copyfile(a1 / 'data/support_geometry.json', rc)
    af = layout / 'R4_A_F2_PRINT_PREPARATION'
    (af / 'data').mkdir(parents=True)

    def load_mesh(path):
        with np.load(path) as q:
            return {key: q[key] for key in q.files}

    lower = generate_lower_support(flower_surface=read_json(v2 / 'data/surface.json')['surface'],
        flower_template=load_mesh(v2 / 'data/D6_local.npz'), permanent_groups=[
            read_json(layout / folder / 'data/structure.json')['members']
            for folder in ['R4_A_SHORT_JOIN_G', 'R4_F2_DEEP_JOIN_G']],
        upstream_support=read_json(rc)['objects'], mesh_loader=load_mesh,
        kernel=kernel, output_mesh_root=af / 'data/lower_meshes')
    lower.pop('mesh_array_identities')
    for row in lower['added']:
        row['mesh_source'] = str(af / 'data/lower_meshes' / Path(row['mesh_source']).name)
    lower['source_support_sha256'] = sha256_file(rc)
    write(af / 'data/LOWER_SUPPORT_REVISION.json', lower)
    applied = []
    for name in ['lower_braces', 'audit_support', 'repair_contacts', 'repair_main_ends', 'assemble', 'final_support_data']:
        if name in ['assemble', 'final_support_data']:
            id = 'N00224' if name == 'assemble' else 'X03795'
            ops = [op for op in overrides['operations'] if op['id'] == id]
            if len(ops) != 1:
                raise ContractError('missing or duplicate fixed-case override: ' + id)
            op = ops[0]
            if sha256_file(source / af.name / 'reproduce' / f'{name}.py') != op['source_file_sha256']:
                raise ContractError('override source identity mismatch: ' + id)
            before = read_json(af / 'A/data' / ('support_stage2.json' if name == 'assemble' else 'support_geometry.json'))
            rows = [r for r in before['objects'] if r['id'] == id]
            if len(rows) != 1 or any(rows[0].get(k) != v for k, v in op['expected_before'].items()):
                raise ContractError('override expected-before mismatch: ' + id)
            if name == 'assemble' and [r['id'] for r in read_json(af / 'A/data/SUPPORT_MAIN_END_REPAIR.json')['unresolved']] != [id]:
                raise ContractError('override unresolved trigger mismatch: ' + id)
            applied.append(dict(id=id, source_sha256=op['source_file_sha256'], expected_before=op['expected_before']))
        stage('af2', name, af)
    from .af2_metadata import run as finalize_metadata
    metadata_before = sha256_file(af / 'A/data/support_geometry.json')
    finalize_metadata(af)
    write(output / 'STAGE_RESULTS/af2_final_metadata.json', dict(
        source='R4_A_F2_PRINT_PREPARATION/reproduce/package_review.py:11-16',
        input_plan_sha256=metadata_before,
        output_plan_sha256=sha256_file(af / 'A/data/support_geometry.json'),
        scope='Historical ledger fields only; no packaging or physical PASS assertions executed'))
    write(output / 'OVERRIDES_APPLIED.json', dict(applied=applied))
    return dict(plan_path=str(af / 'A/data/support_geometry.json'),
                source_root=str(source),
                assembly_path=str(af / 'A/data/ASSEMBLY.json'),
                topology_path=str(v8 / 'data/mesh_export_overrides.json'),
                stages=stages, golden_read=False)
