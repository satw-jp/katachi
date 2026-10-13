"""Source-faithful V5 stage. Caller must provide an isolated scratch tree.
Original algorithm: body_braces.py; no source-script runtime execution.
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
    fs = read(V2 / 'data/surface.json')['surface']
    fm = {f['id']: f for f in fs}
    birth = {x['id']: x for x in read(V3 / 'data/large_object_births.json')}
    u = np.load(V2 / 'data/D6_local.npz')
    uv = u['vertices']
    r = read(D / 'routes_initial.json')
    direct = collections.Counter((x['target'] for x in r['routes']))
    old = read(V4 / 'data/additions.json')['D2']
    for m in old:
        if m['id'] in r['V4_retained_ids']:
            direct[m['target']] += 1
    parents = []
    for f in fs:
        b = birth[f['id']]
        if f['physical_scale'] < 0.4 or direct[f['id']] < 1 or b['first_whole_section_rooted_layer'] is None:
            continue
        v = uv @ np.array(f['orientation_matrix']).T * f['physical_scale'] + f['position_mm']
        p = v[v[:, 2].argmax()]
        effective = max(float(p[2]) + 0.4, bed + (b['first_whole_section_rooted_layer'] + 0.5) * 0.2)
        parents.append(dict(id=f['id'], top_mm=p, effective_z_mm=effective, physical_scale=f['physical_scale'], direct_support_count=direct[f['id']]))
    print('ELIGIBLE BODY ANCHORS', len(parents), flush=True)
    kt = cKDTree(np.array([p['top_mm'] for p in parents]))
    counts = collections.Counter()
    added = []
    resolved = set()
    for i, d in enumerate(r['unresolved']):
        if d['status'] != 'NO_CLEAR_BED_SHAFT_ROUTE':
            continue
        p = np.array(d['point_mm'])
        end = p - [0, 0, 1.5]
        chosen = None
        for j in np.atleast_1d(kt.query(end, k=min(64, len(parents)))[1]):
            par = parents[int(j)]
            ap = np.array(par['top_mm'])
            start = ap + [0, 0, 1.5]
            delta = end - start
            if par['id'] == d['target'] or counts[par['id']] >= 4 or np.linalg.norm(delta) > 16 or (delta[2] < 1.2) or (par['effective_z_mm'] >= start[2] - 0.35) or (np.linalg.norm(delta[:2]) > delta[2] * 0.85):
                continue
            if not clear(start, end) or not clear(ap + [0, 0, 0.9], start, 0.3) or (not clear(end, p - [0, 0, 0.9], 0.3)):
                continue
            chosen = (par, ap, start, end)
            break
        if chosen:
            par, ap, start, end = chosen
            id = f'B{len(added):05d}'
            added.append(dict(id=id, kind='BODY_TO_BODY_TEMPORARY', target=d['target'], anchor=par['id'], demand=d['id'], points_mm=[ap - [0, 0, 0.15], start, end, p + [0, 0, 0.15]], contact_mm=p, anchor_contact_mm=ap, contact_diameter_mm=0.6, shaft_diameter_mm=1.6, cut_mm=p - [0, 0, 0.42], anchor_cut_mm=ap + [0, 0, 0.42], removal_direction=(start - end) / np.linalg.norm(start - end), anchor_effective_z_mm=par['effective_z_mm'], support_start_z_mm=float(ap[2] - 0.15), anchor_status='V3 first whole-section rooted below anchor, full flower bbox below new main shaft; >=1 direct bed D2. Geometric condition only, slice/physical not proven.', reasons=d['reasons'], anchor_direct_support_count=par['direct_support_count'], anchor_physical_scale=par['physical_scale']))
            counts[par['id']] += 1
            resolved.add(d['id'])
    remaining = [x for x in r['unresolved'] if x['id'] not in resolved]
    save(D / 'body_links.json', dict(routes=added, eligible_anchor_count=len(parents), anchor_records=parents, anchor_usage=counts, unresolved=remaining, rule='Only previously whole-section-rooted and complete flowers with direct bed support; no recursion through new unverified BODY links; max4 loads per anchor; <=16mm rising short link.'))
    print('BODY LINKS', len(added), 'REMAINING', len(remaining), flush=True)
