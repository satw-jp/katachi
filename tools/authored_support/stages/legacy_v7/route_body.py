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
    q = np.load(D / 'body_anchors.npz')
    ap = q['points']
    an = q['normals']
    owners = q['owners']
    kt = cKDTree(ap)
    demands = read(D / 'demands.json')
    routes = []
    unresolved = []
    usage = collections.Counter()
    targetcounts = collections.Counter()
    demands.sort(key=lambda d: (0 if d['target'] == 'A0341' else 1 if d['z_mm'] >= 135 else 2 if d['z_mm'] >= 65 else 3, d['role'] != 'FLOWER', -d['z_mm']))
    for ix, d in enumerate(demands):
        chosen_points = [np.array(p) for p in d['existing_contacts']]
        wanted = d['wanted_contacts'] - len(chosen_points)
        new = []
        for candidate in d['candidates']:
            if len(new) >= wanted:
                break
            p = np.array(candidate['point_mm'])
            normal = np.array(candidate['normal'])
            end = p + normal * 1.45
            if any((np.linalg.norm(p - t) < 1.4 for t in chosen_points)):
                continue
            if depth(end)[0] > 14:
                continue
            dist, indices = kt.query(end, k=128, distance_upper_bound=25)
            valid = indices < len(ap)
            indices = indices[valid]
            a = ap[indices]
            dv = end - a
            L = np.linalg.norm(dv, axis=1)
            unit = dv / np.maximum(L[:, None], 1e-09)
            allowed = (L > 3.5) & (L < 23) & (dv[:, 2] > 2) & (np.linalg.norm(dv[:, :2], axis=1) < dv[:, 2] * 1.25) & (np.sum(unit * an[indices], axis=1) > 0.45) & (owners[indices] != d['target'])
            indices = indices[allowed]
            chosen = None
            for j in indices:
                j = int(j)
                owner = str(owners[j])
                if usage[owner] >= 8:
                    continue
                a = ap[j]
                direction = (end - a) / np.linalg.norm(end - a)
                start = a + direction * 1.4
                anchor_tip = a - direction * 0.35
                probe = a - an[j] * 0.65
                probe[2] = min(probe[2], anchor_tip[2] - 0.5)
                if not query([probe], rooted)[0]:
                    continue
                if not void_clear(start, end):
                    continue
                interior = np.linspace(start, end, 20)
                if np.mean(depth(interior) > 2) * np.linalg.norm(end - start) > 12:
                    continue
                if not clear(start, end) or not clear(a + direction * 0.95, start, 0.3) or (not clear(end, p + normal * 0.9, 0.3)):
                    continue
                chosen = (j, start, anchor_tip, probe)
                break
            if chosen:
                j, start, anchor_tip, probe = chosen
                id = f'N{len(routes):05d}'
                a = ap[j]
                direction = (end - a) / np.linalg.norm(end - a)
                rec = dict(id=id, kind='BODY_TO_BODY_TEMPORARY', target=d['target'], anchor=str(owners[j]), demand=d['id'], target_role=d['role'], points_mm=[anchor_tip, start, end, p - normal * 0.2], anchor_contact_mm=a, contact_mm=p, anchor_normal=an[j], contact_normal=normal, shaft_diameter_mm=1.6, contact_diameter_mm=0.6, cut_mm=p + normal * 0.42, anchor_cut_mm=a + direction * 0.45, anchor_rooted_probe_mm=probe, support_birth_min_z_mm=float(anchor_tip[2] - 0.3), anchor_evidence='V6 BODY-only bed-propagated earlier material voxel; no circular new-support credit', reasons=d['reasons'], removal_status='PENDING', first_physical_success_priority=True)
                routes.append(rec)
                new.append(id)
                chosen_points.append(p)
                usage[str(owners[j])] += 1
                targetcounts[d['target']] += 1
        if len(new) < wanted:
            unresolved.append(dict(target=d['target'], role=d['role'], remaining_contacts=wanted - len(new), z_mm=d['z_mm'], reason='No admissible earlier BODY route under current clearance/void constraints'))
        if ix % 200 == 0:
            print('BODY ROUTES', ix, len(routes), 'UPPER', sum((r['contact_mm'][2] > 135 for r in routes)), flush=True)
    save(D / 'new_body_routes.json', dict(routes=routes, unresolved=unresolved, anchor_usage=usage, target_counts=targetcounts, rule='Normal-aware actual underside contacts; temporary1.6mm main,0.6mm short sacrificial endpoints; earlier independently rooted3mm V6 BODY; <=23mm endpoints, <=12mm internal length; no protected Void crossing. No final removal/strength assertion.'))
    print('BODY DONE', len(routes), len(unresolved), flush=True)
