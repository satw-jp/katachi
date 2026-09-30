"""Bounded creation adapter; original replay entrypoints remain untouched."""
from __future__ import annotations
import copy
import hashlib
import json
import sys
import time
from pathlib import Path
import numpy as np
from surface import replay as surface
from internal import core, geometry

ROOT = Path(__file__).resolve().parent
H = 11 / 15
LOCK = {**{k: v['sha256'] for k, v in surface.SOURCE_FILES.items() if k.startswith('data/')},
        'r4/structure.json': core.SOURCE_STRUCTURE_SHA256,
        'r4/host_domain.npz': core.HOST_DOMAIN_SHA256,
        'r4/protected_corridors.json': core.CORRIDORS_SHA256,
        'r4/parameters.json': core.R4_PARAMETERS_SHA256}

def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))

def write(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def validate_recipe(recipe):
    if set(recipe) != {'flowerScale', 'diameter'} or recipe['flowerScale'] not in (1, H) or recipe['diameter'] not in (2.2, 2.4):
        raise ValueError('v0 supports only mini MOCOMOCO/D6, flower 1 or 11/15, diameter 2.2 or 2.4')
    return recipe

def validate_assets(assets):
    for name, digest in LOCK.items():
        if sha(assets / name) != digest:
            raise ValueError('Source identity mismatch: ' + name)

def surface_recipe(g):
    return dict(recipe_id='mini_a1_size_flower_target_v0' if g == 1 else 'mini_scaled_flower_control_v0',
                condition='TARGET' if g == 1 else 'CONTROL', host_uniform_scale=H, flower_global_scale=g,
                seed=surface.SEED, candidate_count=surface.CANDIDATE_COUNT, template_radius63_mm=surface.R63_MM,
                reference_count=418, reference_host_area_mm2=surface.REFERENCE_AREA,
                placement_method='v2-descending-size-clearance-v0', count_policy='empirical_area_density_v0',
                petal_count=6, structures='NOT_GENERATED', support='NOT_GENERATED')

def context(assets, layout):
    placements = dict(np.load(layout / 'surface/placements.npz', allow_pickle=False))
    doc = read(layout / 'surface/surface.json')
    members = read(assets / 'r4/structure.json')['members']
    retained, excluded = core.validate_core_source(members)
    return dict(placements=placements, flower_ids=[x['instance_id'] for x in doc['instances']],
                d6_path=assets / 'data/D6_local.npz', host_path=assets / 'data/host.npz',
                paths={'inputs/r4/' + n: assets / 'r4' / n for n in ('host_domain.npz', 'protected_corridors.json')},
                source_members=members, core_members=retained, excluded_old_endpoints=excluded,
                print_assembly={'uniform_scale': H, 'translation_z_mm': 0},
                files={'inputs/target/host.npz': {'sha256': LOCK['data/host.npz']},
                       'inputs/r4/structure.json': {'sha256': LOCK['r4/structure.json']}})

def resized_members(baseline, diameter):
    """Always start from the immutable 2.2mm baseline, never the active mesh."""
    members = copy.deepcopy(baseline)
    for m in members:
        if m['main_diameter_mm'] != 2.2:
            raise ValueError('Not an immutable 2.2mm baseline')
        ratio = m['terminal_diameter_mm'] / 2.2
        m['main_diameter_mm'] = diameter
        m['terminal_diameter_mm'] = min(diameter, diameter * ratio)
        # Centerlines, taper length, anchors and topology stay unchanged.
    return members

def generate(project, recipe, result_id, force=False):
    validate_recipe(recipe)
    assets = project / 'assets'
    validate_assets(assets)
    def progress(stage, *_):
        print(json.dumps({'stage': stage}), flush=True)
    start = time.perf_counter()
    # Fresh layouts are immutable. A force run makes a new layout, not an overwrite.
    label = 'large-flower' if recipe['flowerScale'] == 1 else 'small-flower'
    layout = project / 'layouts' / (label + ('-' + result_id if force else ''))
    if not (layout / 'baseline/STRUCTURE.json').is_file():
        if layout.exists():
            layout = project / 'layouts' / (label + '-' + result_id)
        layout.mkdir(parents=True)
        progress('花配置を実生成')
        surface.generate_case(assets, surface_recipe(recipe['flowerScale']), layout / 'surface')
        (layout / 'baseline').mkdir()
        progress('内部枝を実生成（数分）')
        geometry.generate_structure(context(assets, layout), layout / 'baseline', progress)
    baseline = read(layout / 'baseline/STRUCTURE.json')
    out = project / 'results' / result_id
    out.mkdir(parents=True)
    if recipe['diameter'] == 2.2:
        mesh_path = layout / 'baseline/MEMBER_MESHES.npz'
        structure_path = layout / 'baseline/STRUCTURE.json'
        mesh_hash = baseline['structure_semantic_sha256']
    else:
        progress('配置と中心線を保持して枝径を再生成')
        members = resized_members(baseline['members'], recipe['diameter'])
        arrays, solids = {}, {}
        for index, m in enumerate(members):
            solid, vertices, faces, _ = geometry._materialize(m)
            arrays[m['id']] = (vertices, faces)
            solids[m['id']] = solid
            if index % 200 == 0:
                progress(f'枝径再生成 {index}/{len(members)}')
        # Recheck declared positive contacts, including actual flower geometry.
        ctx = context(assets, layout)
        v, f = surface.load_mesh(ctx['d6_path'])
        flowers = geometry.FlowerGeometry(v, f, ctx['placements'], ctx['flower_ids'])
        checks = []
        for row in read(layout / 'baseline/CONTACT_AUDIT.json')['checked_relationships']:
            a, b = row['a'], row['b']
            if a not in solids or b.startswith('BED_'):
                continue
            if b in solids:
                volume = float((solids[a] ^ solids[b]).volume())
            elif b in flowers.index:
                volume = flowers.overlap(solids[a], flowers.index[b])
            else:
                continue
            if volume <= row.get('threshold_mm3', 1e-8):
                raise ValueError('Diameter contact failed: ' + a + ' -> ' + b)
            checks.append({'a': a, 'b': b, 'volume': volume})
        mesh_path, structure_path = out / 'MEMBER_MESHES.npz', out / 'STRUCTURE.json'
        np.savez_compressed(mesh_path, **geometry._mesh_archive(members, arrays))
        mesh_hash = core.digest_json([m['mesh_geometry_sha256'] for m in members])
        write(structure_path, dict(baseline, members=members, diameter_main_mm=recipe['diameter'],
                                   structure_semantic_sha256=mesh_hash, diameter_contact_checks=checks,
                                   fabrication='NOT_TESTED', support='NOT_GENERATED', print_go=False))
    surf = read(layout / 'surface/surface.json')
    result = dict(id=result_id, recipe=recipe, flowerCount=surf['count'], memberCount=baseline['member_count'],
                  surfaceHash=surf['semantic_geometry_sha256'], centerlineHash=baseline['centerline_semantic_sha256'],
                  meshHash=mesh_hash, layout=layout.relative_to(project).as_posix(),
                  mesh=mesh_path.relative_to(project).as_posix(), structure=structure_path.relative_to(project).as_posix(),
                  runtimeSeconds=time.perf_counter() - start, support='NOT_GENERATED', printGo=False,
                  fabrication='NOT_TESTED', diameterPolicy='immutable-2.2-baseline-rematerialization-v0')
    write(out / 'result.json', result)
    progress('完了')
    return result

def scene(project, result):
    def mesh(path, scale=1):
        with np.load(path, allow_pickle=False) as data:
            return dict(vertices=(data['vertices'] * scale).ravel().tolist(), faces=data['faces'].ravel().tolist())
    return dict(host=mesh(project / 'assets/data/host.npz', H), flower=mesh(project / 'assets/data/D6_local.npz'),
                instances=read(project / result['layout'] / 'surface/surface.json')['instances'],
                branches=mesh(project / result['mesh']))

if __name__ == '__main__':
    generate(Path(sys.argv[1]), json.loads(sys.argv[2]), sys.argv[3], len(sys.argv) > 4)
