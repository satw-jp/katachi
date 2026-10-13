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
    demands = read(D / 'demands.json')
    xx, yy = np.meshgrid(np.arange(-120, 120.1, 3.6), np.arange(-120, 120.1, 3.6))
    xy = np.c_[xx.ravel(), yy.ravel()]
    maxfield = field.max(2)
    dep = ndi.map_coordinates(maxfield, ((xy - ho[:2]) / hp).T, order=1, mode='constant', cval=-100)
    xy = xy[(dep < -1.5) & (dep > -15)]
    valid = []
    for p in xy:
        if clear(np.r_[p, bed + 1.2], np.r_[p, 215], 1.05):
            valid.append(p)
    xy = np.array(valid)
    kt = cKDTree(xy)
    routes = []
    columns = {}
    demands.sort(key=lambda d: (0 if d['target'] == 'A0341' else 1, -d['z_mm']))
    for ix, d in enumerate(demands):
        if d['z_mm'] < 55 and d['target'] != 'A0341':
            continue
        found = None
        for cand in d['candidates']:
            p = np.array(cand['point_mm'])
            n = np.array(cand['normal'])
            end = p + n * 1.45
            dist, nn = kt.query(end[:2], k=min(64, len(xy)), distance_upper_bound=30)
            for distance, j in zip(np.atleast_1d(dist), np.atleast_1d(nn)):
                if j >= len(xy):
                    continue
                start = np.r_[xy[j], end[2] - max(3.0, distance * 1.5)]
                if start[2] < bed + 2:
                    continue
                if not void_clear(start, end):
                    continue
                pts = np.linspace(start, end, 30)
                if np.mean(depth(pts) > 2) * np.linalg.norm(end - start) > 10:
                    continue
                if not clear(start, end) or not clear(end, p + n * 0.9, 0.3):
                    continue
                found = (int(j), p, n, start, end)
                break
            if found:
                break
        if found:
            j, p, n, start, end = found
            cid = f'E{j:05d}'
            id = f'Y{len(routes):05d}'
            columns.setdefault(cid, dict(id=cid, xy_mm=xy[j], top_z_mm=bed, contact_routes=[]))
            columns[cid]['top_z_mm'] = max(columns[cid]['top_z_mm'], float(start[2]) + 0.6)
            columns[cid]['contact_routes'].append(id)
            routes.append(dict(id=id, kind='EXTERNAL_SHAFT_BRANCH', target=d['target'], target_role=d['role'], anchor=cid, demand=d['id'], points_mm=[start, end, p - n * 0.2], contact_mm=p, contact_normal=n, cut_mm=p + n * 0.42, shaft_diameter_mm=1.6, contact_diameter_mm=0.6, anchor_effective_z_mm=float(start[2] - 0.8), reasons=d['reasons'], removal_status='PENDING', rule='All-height BODY/Host-exterior bed shaft, rising1.6mm branch, actual underside-normal short0.6mm contact; upper branch brace required.'))
        if ix % 300 == 0:
            print('EXTERNAL', ix, len(routes), len(columns), flush=True)
    save(D / 'new_external_routes.json', dict(routes=routes, columns=list(columns.values()), all_height_column_candidate_count=len(xy)))
    print('EXTERNAL DONE', len(routes), len(columns), flush=True)
