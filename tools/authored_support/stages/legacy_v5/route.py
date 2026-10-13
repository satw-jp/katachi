"""Source-faithful V5 stage. Caller must provide an isolated scratch tree.
Original algorithm: route.py; no source-script runtime execution.
"""
def run(stage_root):
    import sys, json, math, collections
    from pathlib import Path
    import numpy as np
    from scipy.spatial import cKDTree
    from scipy import ndimage as ndi
    R = stage_root
    D = R / 'data'
    V2 = R.parent / 'R4_D6_SIZE_RHYTHM_V2'
    V3 = R.parent / 'R4_V2_INTERNAL_PROPOSAL_V3'
    V4 = R.parent / 'R4_V2_V3_A1_EXPERIMENTAL_V4'

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
    directions = np.array([[x, y, z] for x in [-1, 0, 1] for y in [-1, 0, 1] for z in [-1, 0, 1] if x or y or z], float)
    directions /= np.linalg.norm(directions, axis=1)[:, None]
    directions = np.vstack([[0, 0, 0], directions])

    def occupied(points):
        ix = np.floor((np.asarray(points) - origin) / pitch).astype(int)
        valid = np.all((ix >= 0) & (ix < shape), axis=1)
        out = np.zeros(len(ix), bool)
        q = ix[valid]
        out[valid] = occ[q[:, 2], q[:, 1], q[:, 0]]
        return out

    def clear(a, b, r=0.8):
        a = np.array(a)
        b = np.array(b)
        n = max(2, int(np.ceil(np.linalg.norm(b - a) / 0.45)) + 1)
        q = np.linspace(a, b, n)
        return not np.any(occupied((q[:, None, :] + directions[None, :, :] * (r + 0.26)).reshape(-1, 3)))
    fs = read(V2 / 'data/surface.json')['surface']
    fm = {f['id']: f for f in fs}
    ms = read(V3 / 'data/structure.json')['members']
    mm = {m['id']: m for m in ms}
    birth = {x['id']: x for x in read(V3 / 'data/large_object_births.json')}
    loads = {x['id']: x for x in read(V3 / 'data/load_cantilever_review.json')['members']}
    unit = np.load(V2 / 'data/D6_local.npz')
    uv = unit['vertices']
    uf = unit['faces']
    sector = (np.arctan2(uv[:, 1], uv[:, 0]) % (2 * np.pi) / (np.pi / 3)).astype(int)
    demands = []
    for f in fs:
        v = uv @ np.array(f['orientation_matrix']).T * f['physical_scale'] + f['position_mm']
        candidates = [v[v[:, 2].argmin()]]
        for i in range(6):
            ids = np.where(sector == i)[0]
            candidates.append(v[ids[np.argmin(v[ids, 2])]])
        wanted = 4 if f['physical_scale'] >= 0.55 else 2 if f['physical_scale'] >= 0.3 else 1
        chosen = [candidates[0]]
        for _ in range(wanted - 1):
            distances = [min((np.linalg.norm(p - q) for q in chosen)) for p in candidates]
            i = int(np.argmax(distances))
            if distances[i] < max(1.4, 2.5 * f['physical_scale']):
                break
            chosen.append(candidates[i])
        for j, p in enumerate(chosen):
            demands.append(dict(id=f"D_{f['id']}_{j}", target=f['id'], point_mm=p, role='FLOWER', reasons=['distributed_surface_growth', 'rotation_vibration_peeling'] + (['initial_unrooted'] if birth[f['id']]['unrooted_at_birth'] else []) + (['small_thin_attachment'] if f['physical_scale'] < 0.5 else []), physical_scale=f['physical_scale'], wanted_contacts=wanted))
    for m in ms:
        reasons = []
        load = loads[m['id']]
        if birth[m['id']]['unrooted_at_birth']:
            reasons.append('initial_unrooted')
        if load['horizontal_span_mm'] > 10:
            reasons.append('long_overhang_bridge')
        if m['length_mm'] > 18:
            reasons.append('long_free_permanent')
        if m['tip_diameter_mm'] < 1.2:
            reasons.append('small_thin_attachment')
        if load['downstream_flower_count'] >= 32:
            reasons.append('load_concentration')
        if not reasons:
            continue
        q = np.load(V3 / ('data/members/' + m['id'] + '.npz'))
        v = q['vertices']
        a, b = np.array(m['points_mm'])
        targets = [v[v[:, 2].argmin()]] if 'initial_unrooted' in reasons else []
        if any((x in reasons for x in ['long_free_permanent', 'long_overhang_bridge', 'load_concentration'])):
            for t in [0.35, 0.7]:
                p = a * (1 - t) + b * t
                dist = np.linalg.norm(v[:, :2] - p[:2], axis=1) + np.abs(v[:, 2] - p[2]) * 0.15
                ids = np.argsort(dist)[:20]
                targets.append(v[ids[np.argmin(v[ids, 2])]])
        if 'small_thin_attachment' in reasons:
            targets.append(v[np.argmin(np.linalg.norm(v - b, axis=1) + v[:, 2] * 0.1)])
        for j, p in enumerate(targets):
            demands.append(dict(id=f"D_{m['id']}_{j}", target=m['id'], point_mm=p, role='PERMANENT', reasons=reasons, downstream_flower_count=load['downstream_flower_count']))
    demands.sort(key=lambda x: (x['point_mm'][2], x['id']))
    print('DEMANDS', len(demands), flush=True)
    first = np.load(V4 / 'data/vertical_first_material.npz')
    low = np.pad(first['lowest'], 28, constant_values=65535)
    safe = ndi.minimum_filter(low, size=13, mode='constant', cval=65535)
    ny, nx = low.shape
    yy, xx = np.mgrid[0:ny:12, 0:nx:12]
    xy = origin[:2] - 8.4 + np.c_[xx.ravel() + 0.5, yy.ravel() + 0.5] * 0.3
    zfirst = bed + (safe[yy, xx].ravel() + 0.5) * 0.2
    domain = np.load(V3 / 'data/host_domain.npz')
    field = domain['field']
    field_origin = domain['origin']
    field_pitch = float(domain['pitch'])

    def depth(points):
        return ndi.map_coordinates(field, ((np.atleast_2d(points) - field_origin) / field_pitch).T, order=1, mode='constant', cval=-100)
    for j, col in enumerate(xy):
        zz = np.arange(bed, 215, 2.0)
        dep = depth(np.c_[np.tile(col, (len(zz), 1)), zz])
        inside = np.where(dep > 0)[0]
        if len(inside):
            zfirst[j] = min(zfirst[j], zz[inside[0]] - 2)
    trees = {}
    for band in range(0, 241, 10):
        ids = np.where(zfirst > band + bed + 2)[0]
        trees[band] = (cKDTree(xy[ids]), ids)
    columns = {}
    routes = []
    unresolved = []
    attempted = collections.Counter()
    supported = collections.defaultdict(list)
    print('COLUMN TREES READY', len(xy), flush=True)
    old = read(V4 / 'data/additions.json')['D2']
    oldrem = read(V4 / 'data/removal_sequence.json')
    oldok = {x['id']: x for x in oldrem['sequence']}
    for m in old:
        if m['id'] in oldok:
            supported[m['target']].append('V4_' + m['id'])
    for i, d in enumerate(demands):
        p = np.array(d['point_mm'])
        h = p[2] - bed
        if h < 1.4:
            unresolved.append(dict(**d, status='BED_NEAR; later raft/slice evaluation'))
            continue
        shoulder = p - [0, 0, 1.5]
        band = min(240, int(math.ceil(h / 10) * 10))
        kt, ids = trees[band]
        dist, nn = kt.query(p[:2], k=min(28, len(ids)))
        chosen = None
        for distance, n in zip(np.atleast_1d(dist), np.atleast_1d(nn)):
            colxy = xy[ids[int(n)]]
            bottom_z = shoulder[2] - max(1.2, float(distance) * 1.35)
            if bottom_z < bed + 1.3:
                continue
            start = np.r_[colxy, bottom_z]
            sample = np.linspace(start, shoulder, max(3, int(np.linalg.norm(start - shoulder) / 1.5)))
            dep = depth(sample)
            if dep.max() > 5 or np.count_nonzero(dep > 1) * 1.5 > 6:
                continue
            if not clear(start, shoulder):
                continue
            if not clear(shoulder, p - [0, 0, 0.9], 0.3):
                continue
            chosen = (int(ids[int(n)]), start, shoulder)
            break
        if chosen:
            colid, start, shoulder = chosen
            cid = f'S{colid:06d}'
            columns.setdefault(cid, dict(id=cid, xy_mm=xy[colid], top_z_mm=bed, contact_routes=[]))
            rid = f'T{len(routes):05d}'
            columns[cid]['top_z_mm'] = max(columns[cid]['top_z_mm'], float(start[2]) + 0.5)
            columns[cid]['contact_routes'].append(rid)
            r = dict(id=rid, kind='EXTERNAL_SHAFT_BRANCH', demand=d['id'], target=d['target'], anchor=cid, points_mm=[start, shoulder, p + [0, 0, 0.15]], contact_mm=p, shaft_diameter_mm=1.6, contact_diameter_mm=0.6, contact_length_mm=1.65, cut_mm=p - [0, 0, 0.42], removal_direction=(start - shoulder) / np.linalg.norm(start - shoulder), anchor_effective_z_mm=float(start[2]), target_first_contact_z_mm=float(p[2] - 0.15), chronology='Rising branch from vertical bed shaft; geometric ordering only. Actual slice deferred.', reasons=d['reasons'], clearance='actual V3 section-mask sweep, 0.3XY/0.2Z; 0.26mm sampling guard; last0.9mm intended contact excluded, exact contact audit required')
            routes.append(r)
            supported[d['target']].append(rid)
        else:
            unresolved.append(dict(**d, status='NO_CLEAR_BED_SHAFT_ROUTE'))
        if i % 100 == 0:
            print('ROUTED', i, len(routes), 'COL', len(columns), flush=True)
    save(D / 'routes_initial.json', dict(routes=routes, columns=list(columns.values()), unresolved=unresolved, demands=demands, V4_retained_ids=list(oldok), V4_held_id='D2_112', method='Dense all-height demand search, 28 nearest conservative bed-visible columns per target; no historical shape coordinates/counts. Coverage is measured, not assumed.'))
    print('ROUTE DONE', len(routes), len(columns), len(unresolved), flush=True)
