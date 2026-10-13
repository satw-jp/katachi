"""Pure scoped port; caller supplies isolated scratch root. No legacy import."""
def run(stage_root):
    import sys, json, math, collections
    from pathlib import Path
    import numpy as np
    from scipy import ndimage as ndi
    from scipy.spatial import cKDTree
    R = stage_root
    D = R / 'data'
    V2 = R.parent / 'R4_D6_SIZE_RHYTHM_V2'
    V3 = R.parent / 'R4_V2_INTERNAL_PROPOSAL_V3'
    V5 = R.parent / 'R4_V5_AUTHORED_SUPPORT_REVIEW'
    V6 = R.parent / 'R4_V6_INTERNAL_ENVELOPE_REVIEW'

    def read(p):
        return json.loads(Path(p).read_text(encoding='utf-8-sig'))

    def save(p, x):
        Path(p).write_text(json.dumps(x, ensure_ascii=False, indent=2, default=lambda a: a.tolist() if hasattr(a, 'tolist') else str(a)), encoding='utf-8')
    grid = read(D / 'grid.json')
    occ = np.load(grid['path'])
    origin = np.r_[grid['origin_xy'], grid['bed_z']]
    bed = origin[2]
    pitch = np.array([0.3, 0.3, 0.2])
    shape = np.array(occ.shape[::-1])
    rooted = np.load(read(D / 'rooted_grid.json')['rooted_path'])
    dirs = np.array([[x, y, z] for x in [-1, 0, 1] for y in [-1, 0, 1] for z in [-1, 0, 1] if x or y or z], float)
    dirs /= np.linalg.norm(dirs, axis=1)[:, None]
    dirs = np.vstack([[0, 0, 0], dirs])

    def query(points, volume=occ):
        ix = np.floor((np.asarray(points) - origin) / pitch).astype(int)
        ok = np.all((ix >= 0) & (ix < shape), axis=1)
        out = np.zeros(len(ix), bool)
        q = ix[ok]
        out[ok] = volume[q[:, 2], q[:, 1], q[:, 0]]
        return out

    def clear(a, b, r=0.8):
        a = np.array(a)
        b = np.array(b)
        q = np.linspace(a, b, max(2, int(np.ceil(np.linalg.norm(b - a) / 0.45)) + 1))
        return not np.any(query((q[:, None, :] + dirs[None, :, :] * (r + 0.22)).reshape(-1, 3)))
    h = np.load(V3 / 'data/host_domain.npz')
    field = h['field']
    ho = h['origin']
    hp = float(h['pitch'])
    corr = read(V3 / 'data/protected_corridors.json')['corridors']

    def depth(p):
        return ndi.map_coordinates(field, ((np.atleast_2d(p) - ho) / hp).T, order=1, mode='constant', cval=-100)

    def void_clear(a, b, r=0.8):
        p = np.linspace(a, b, max(3, int(np.linalg.norm(np.array(b) - a) / 0.6)))
        p = p[depth(p) > 2]
        for c in corr:
            ax = [i for i in range(3) if i != c['axis']]
            if len(p) and np.min(np.linalg.norm(p[:, ax] - np.array(c['center_mm'])[ax], axis=1)) < c['radius_mm'] + r:
                return False
        return True
    old = read(V5 / 'data/support_geometry.json')['objects']
    sel = set(read(V6 / 'data/selected_support_ids.json'))
    objects = [dict(r, mesh_source=str(V5 / 'data/meshes' / (r['id'] + '.npz')), revision='retained V6 selected D2') for r in old if r['id'] in sel]
    audits = []
    for kind in ['external', 'special']:
        audit = {r['id']: r for r in read(D / f'{kind}_contact_removal.json')}
        mesh = read(D / f'{kind}_mesh_records.json')
        good = [r for r in mesh if not audit[r['id']]['flags']]
        if kind == 'special':
            good = good[:1]
        objects += good
        audits += [audit[r['id']] for r in good]
    body = read(D / 'selected_body_meshes.json')
    objects += body
    for kind in ['body', 'outer']:
        aset = {r['id']: r for r in read(D / f'{kind}_contact_removal.json')}
        audits += [aset[r['id']] for r in body if r['id'] in aset]
    scaffold = read(D / 'scaffold.json')
    objects += scaffold['objects']
    objects += read(D / 'feet.json')['objects']
    if (D / 'clearance_patch.json').exists():
        patches = {r['id']: r['final_record'] for r in read(D / 'clearance_patch.json')['changes'] if 'final_record' in r}
        objects = [patches.get(r['id'], r) for r in objects]
    ids = [r['id'] for r in objects]
    assert len(ids) == len(set(ids))
    save(D / 'support_geometry.json', dict(objects=objects, selected_count=len(objects), new_contact_audits=audits, all_world_coordinates_mm=True, body_changed=False, current_internal='V6'))
    fs = read(V2 / 'data/surface.json')['surface']
    ms = read(V6 / 'data/structure.json')['members']
    fm = {f['id']: f for f in fs}
    mm = {m['id']: m for m in ms}
    targets = collections.defaultdict(list)
    regions = {}
    oldtarget = collections.defaultdict(list)
    for r in objects:
        if 'contact_mm' in r:
            targets[r['target']].append(r)
    for r in old:
        if r['id'] in sel and 'contact_mm' in r:
            oldtarget[r['target']].append(r)
    for name, lo, hi in [('lower', -10, 70), ('mid', 70, 140), ('upper', 140, 220), ('crown', 170, 220)]:
        fl = [f for f in fs if lo <= f['position_mm'][2] < hi]
        per = [m for m in ms if lo <= np.mean(np.array(m['points_mm'])[:, 2]) < hi]
        regions[name] = dict(flowers=len(fl), flower_targets_before=sum((bool(oldtarget.get(f['id'])) for f in fl)), flower_targets_now=sum((bool(targets.get(f['id'])) for f in fl)), permanent_targets_before=sum((bool(oldtarget.get(m['id'])) for m in per)), permanent_targets_now=sum((bool(targets.get(m['id'])) for m in per)), contact_paths_before=sum((lo <= r['contact_mm'][2] < hi for r in old if r['id'] in sel and 'contact_mm' in r)), contact_paths_now=sum((lo <= r['contact_mm'][2] < hi for r in objects if 'contact_mm' in r)))
    boxes = np.array([r['bbox_mm'] for r in objects] + [f['bbox_mm'] for f in fs] + [m['bbox_mm'] for m in ms])
    bounds = np.array([boxes[:, 0].min(0), boxes[:, 1].max(0)])
    kinds = collections.Counter((r['kind'] for r in objects))
    coverage = dict(selected_support_objects=len(objects), contact_paths=sum(('contact_mm' in r for r in objects)), unique_flower_targets=sum((id in fm for id in targets)), unique_permanent_targets=sum((id in mm for id in targets)), regions=regions, kinds=kinds, bounds_mm=bounds, dimensions_mm=bounds[1] - bounds[0], T00841_replacement=[r['id'] for r in objects if r['id'].startswith('Z0341')], retained_v6_risks=['A0503', 'A0767', 'A3110', 'A3864', 'A3956'], old_1438_not_gcode_failures=True, geometry_generation_only=True, no_slice=True, export_owner='Author', rule='Direct FLOWER targets and direct Permanent targets reported separately; no claim every flower/petal is supported by counting a final component.')
    save(D / 'coverage.json', coverage)
    lookup = {r['id']: dict(kind=r['kind'], anchor=r.get('anchor', 'BED'), target=r.get('target'), mesh_source=r['mesh_source'], contact_mm=r.get('contact_mm'), points_mm=r.get('points_mm'), body_role=r.get('target_role')) for r in objects}
    save(D / 'ID_MAP.json', lookup)
    print('ASSEMBLY', len(objects), 'CONTACTS', coverage['contact_paths'], 'BOUNDS', coverage['dimensions_mm'], flush=True)
    print(regions, flush=True)
