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
    fs = read(V2 / 'data/surface.json')['surface']
    fm = {f['id']: f for f in fs}
    u = np.load(V2 / 'data/D6_local.npz')
    tri = u['vertices'][u['faces'][::20]]
    cp = tri.mean(1)
    cn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    cn /= np.linalg.norm(cn, axis=1)[:, None]
    cache = R.parents[1] / 'work/internal_v3_section_cache/large'
    ap = []
    an = []
    owners = []
    times = []
    for ix, f in enumerate(fs):
        if f['physical_scale'] < 0.55 or f['position_mm'][2] < 65:
            continue
        rot = np.array(f['orientation_matrix'])
        p = cp @ rot.T * f['physical_scale'] + f['position_mm']
        n = cn @ rot.T
        ok = (n[:, 2] > 0.2) & (n @ np.array(f['normal']) > 0.45)
        indices = np.where(ok)[0]
        indices = indices[np.argsort(-p[indices, 2])]
        chosen = []
        q = np.load(cache / (f['id'] + '.npz'))
        layers = q['layers']
        offsets = q['offsets']
        pixels = q['pixels']
        layerindex = {int(k): j for j, k in enumerate(layers)}
        for j in indices:
            if depth(p[j])[0] > 1 or any((np.linalg.norm(p[j] - p[k]) < 1.1 for k in chosen)):
                continue
            k = int((p[j, 2] - 0.9 - bed) / 0.2)
            z = bed + (k + 0.5) * 0.2
            if k not in layerindex or k < 1:
                continue
            zindex = layerindex[k]
            pix = pixels[offsets[zindex]:offsets[zindex + 1]]
            if not len(pix) or not np.all(rooted[k].ravel()[pix]):
                continue
            chosen.append(int(j))
            ap.append(p[j])
            an.append(n[j])
            owners.append(f['id'])
            times.append(z)
            if len(chosen) >= 12:
                break
        if ix % 500 == 0:
            print('EXPOSED ANCHORS', ix, len(ap), flush=True)
    ap = np.array(ap)
    an = np.array(an)
    times = np.array(times)
    owners = np.array(owners)
    kt = cKDTree(ap)
    routes = []
    usage = collections.Counter()
    demands = [d for d in read(D / 'demands.json') if d['role'] == 'FLOWER' and d['z_mm'] >= 110]
    demands.sort(key=lambda d: -d['z_mm'])
    for ix, d in enumerate(demands):
        f = fm[d['target']]
        rot = np.array(f['orientation_matrix'])
        p = cp @ rot.T * f['physical_scale'] + f['position_mm']
        n = cn @ rot.T
        ok = (n[:, 2] < 0.28) & (n @ np.array(f['normal']) > -0.15)
        indices = np.where(ok)[0]
        indices = indices[np.argsort(depth(p[indices]))]
        pool = []
        for j in indices:
            if all((np.linalg.norm(p[j] - p[k]) > 1.1 for k in pool)):
                pool.append(int(j))
            if len(pool) >= 22:
                break
        used = [np.array(x) for x in d['existing_contacts']]
        count = 0
        for j in pool:
            if count >= 2:
                break
            point = p[j]
            normal = n[j]
            end = point + normal * 1.45
            if any((np.linalg.norm(point - x) < 1.35 for x in used)):
                continue
            dist, nn = kt.query(end, k=min(96, len(ap)), distance_upper_bound=18)
            nn = nn[nn < len(ap)]
            delta = end - ap[nn]
            length = np.linalg.norm(delta, axis=1)
            di = delta / np.maximum(length[:, None], 1e-09)
            ok = (length > 3.5) & (delta[:, 2] > 2) & (np.linalg.norm(delta[:, :2], axis=1) < delta[:, 2] * 1.25) & (np.sum(di * an[nn], axis=1) > 0.4) & (owners[nn] != f['id'])
            chosen = None
            for aidx in nn[ok]:
                owner = str(owners[aidx])
                if usage[owner] >= 4:
                    continue
                a = ap[aidx]
                direction = (end - a) / np.linalg.norm(end - a)
                tip = a - direction * 0.35
                start = a + direction * 1.4
                if times[aidx] > tip[2] - 0.45:
                    continue
                if depth(np.linspace(start, end, 12)).max() > 2.5:
                    continue
                if not void_clear(start, end) or not clear(start, end) or (not clear(a + direction * 0.95, start, 0.3)) or (not clear(end, point + normal * 0.85, 0.3)):
                    continue
                chosen = (aidx, tip, start)
                break
            if chosen:
                aidx, tip, start = chosen
                a = ap[aidx]
                direction = (end - a) / np.linalg.norm(end - a)
                id = f'W{len(routes):05d}'
                routes.append(dict(id=id, kind='BODY_TO_BODY_TEMPORARY', target=f['id'], target_role='FLOWER', anchor=str(owners[aidx]), demand=d['id'], points_mm=[tip, start, end, point - normal * 0.2], anchor_contact_mm=a, contact_mm=point, contact_normal=normal, anchor_normal=an[aidx], cut_mm=point + normal * 0.42, anchor_cut_mm=a + direction * 0.45, shaft_diameter_mm=1.6, contact_diameter_mm=0.6, anchor_effective_z_mm=float(times[aidx]), anchor_evidence='Entire existing anchor FLOWER section independently rooted in V6 BODY at least0.15mm below new contact birth; actual full-layer support birth audit remains required', anchor_physical_scale=fm[str(owners[aidx])]['physical_scale'], reasons=['upper_growth_stability', 'distributed_surface_support'], rule='Short outward temporary BODY link, max18mm; visible outside Host, no internal cage; material endpoints remain separate from frozen BODY.'))
                usage[str(owners[aidx])] += 1
                used.append(point)
                count += 1
        if ix % 100 == 0:
            print('OUTER BODY ROUTES', ix, len(routes), flush=True)
    save(D / 'new_outer_routes.json', dict(routes=routes, anchor_count=len(ap), anchor_usage=usage))
    print('OUTER DONE', len(routes), flush=True)
