"""Source-faithful V5 stage. Caller must provide an isolated scratch tree.
Original algorithm: body_surface_links.py; no source-script runtime execution.
"""
def run(stage_root):
    from pathlib import Path
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
    import trimesh
    fs = read(V2 / 'data/surface.json')['surface']
    fm = {x['id']: x for x in fs}
    birth = {x['id']: x for x in read(V3 / 'data/large_object_births.json')}
    u = np.load(V2 / 'data/D6_local.npz')
    uv = u['vertices']
    vn = trimesh.Trimesh(uv, u['faces'], process=False).vertex_normals
    r = read(D / 'routes_initial.json')
    prior = read(D / 'body_links.json')
    direct = collections.Counter((x['target'] for x in r['routes']))
    usage = collections.Counter(prior['anchor_usage'])
    points = []
    normals = []
    owners = []
    times = []
    for f in fs:
        b = birth[f['id']]
        if f['physical_scale'] < 0.35 or b['first_whole_section_rooted_layer'] is None:
            continue
        v = uv[::160] @ np.array(f['orientation_matrix']).T * f['physical_scale'] + f['position_mm']
        n = vn[::160] @ np.array(f['orientation_matrix']).T
        root = bed + (b['first_whole_section_rooted_layer'] + 0.5) * 0.2
        valid = (v[:, 2] > root + 0.6) & (n[:, 2] > -0.1)
        points.extend(v[valid])
        normals.extend(n[valid])
        owners.extend([f['id']] * sum(valid))
        times.extend([root] * sum(valid))
    points = np.array(points)
    normals = np.array(normals)
    times = np.array(times)
    kt = cKDTree(points)
    routes = []
    resolved = set()
    print('BODY ANCHOR POINTS', len(points), flush=True)
    for i, d in enumerate(prior['unresolved']):
        if d['status'] != 'NO_CLEAR_BED_SHAFT_ROUTE':
            continue
        p = np.array(d['point_mm'])
        end = p - [0, 0, 1.5]
        chosen = None
        for j in np.atleast_1d(kt.query(end, k=96)[1]):
            j = int(j)
            owner = owners[j]
            if owner == d['target'] or usage[owner] >= (4 if direct[owner] else 2):
                continue
            ap = points[j]
            dv = end - ap
            L = np.linalg.norm(dv)
            if not 2.8 < L <= 16 or dv[2] < 2 or np.linalg.norm(dv[:2]) > dv[2] * 0.95:
                continue
            direction = dv / L
            if direction @ normals[j] < 0.65:
                continue
            start = ap + direction * 1.5
            if not clear(start, end) or not clear(ap + direction * 0.95, start, 0.3) or (not clear(end, p - [0, 0, 0.9], 0.3)):
                continue
            chosen = (j, owner, ap, start, direction)
            break
        if chosen:
            j, owner, ap, start, direction = chosen
            id = f'L{len(routes):05d}'
            routes.append(dict(id=id, kind='BODY_TO_BODY_TEMPORARY', target=d['target'], anchor=owner, demand=d['id'], points_mm=[ap - direction * 0.15, start, end, p + [0, 0, 0.15]], contact_mm=p, anchor_contact_mm=ap, contact_diameter_mm=0.6, shaft_diameter_mm=1.6, cut_mm=p - [0, 0, 0.42], anchor_cut_mm=ap + direction * 0.45, removal_direction=-direction, anchor_effective_z_mm=float(times[j]), support_start_z_mm=float(ap[2] - 0.15 * direction[2] - 0.3), anchor_status='Actual V3 first WHOLE cross-section rooted >=0.6mm before selected surface anchor. Independent V3 ancestry, not recursive new-support credit. Slice order and strength not proven.', anchor_direct_support_count=direct[owner], anchor_physical_scale=fm[owner]['physical_scale'], reasons=d['reasons']))
            usage[owner] += 1
            resolved.add(d['id'])
        if i % 1000 == 0:
            print('LOCAL BODY', i, len(routes), flush=True)
    save(D / 'body_surface_links.json', dict(routes=routes, unresolved=[d for d in prior['unresolved'] if d['id'] not in resolved], anchor_usage=usage, rule='Previously rooted actual BODY section; outward/upward short sacrificial anchor; 1.6mm main; <=16mm; non-recursive support genealogy. No meaningful Permanent modifications.'))
    print('LOCAL BODY DONE', len(routes), flush=True)
