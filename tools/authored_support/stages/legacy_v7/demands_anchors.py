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
    import trimesh
    ms = read(V6 / 'data/structure.json')['members']
    fs = read(V2 / 'data/surface.json')['surface']
    u = np.load(V2 / 'data/D6_local.npz')
    uv = u['vertices']
    uf = u['faces']
    tri = uv[uf[::32]]
    centers = tri.mean(1)
    norms = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    norms /= np.linalg.norm(norms, axis=1)[:, None]
    selected = set(read(V6 / 'data/selected_support_ids.json'))
    prior = read(V5 / 'data/support_geometry.json')['objects']
    contacts = collections.defaultdict(list)
    for r in prior:
        if r['id'] in selected and 'contact_mm' in r:
            contacts[r['target']].append(r['contact_mm'])
    demands = []
    for f in fs:
        existing = contacts.get(f['id'], [])
        wanted = 3 if f['physical_scale'] >= 0.5 else 2
        if len(existing) >= wanted:
            continue
        rot = np.array(f['orientation_matrix'])
        p = centers @ rot.T * f['physical_scale'] + f['position_mm']
        n = norms @ rot.T
        ok = n[:, 2] < -0.18
        p = p[ok]
        n = n[ok]
        if not len(p):
            continue
        chosen = [int(p[:, 2].argmin())]
        pool = []
        for j in range(min(12, len(p))):
            if j:
                sep = np.min(np.linalg.norm(p[:, None, :] - p[chosen][None, :, :], axis=2), axis=1)
                score = sep - 0.06 * (p[:, 2] - p[:, 2].min())
                score[chosen] = -1
                i = int(score.argmax())
                chosen.append(i)
            i = chosen[-1]
            pool.append(dict(point_mm=p[i], normal=n[i]))
        demands.append(dict(id='FLOWER_' + f['id'], target=f['id'], role='FLOWER', physical_scale=f['physical_scale'], existing_contacts=existing, wanted_contacts=wanted, candidates=pool, z_mm=float(f['position_mm'][2]), reasons=['distributed_overhang', 'growth_vibration', 'local_peeling'] + (['thin_small_attachment'] if f['physical_scale'] < 0.4 else [])))
    loads = {r['id']: r for r in read(V3 / 'data/load_cantilever_review.json')['members']}
    anchor_p = []
    anchor_n = []
    anchor_id = []
    anchor_time = []
    for i, m in enumerate(ms):
        pts = np.array(m['points_mm'])
        radii = m.get('radii_mm', [1.5] * len(pts))
        L = m['length_mm']
        load = loads[m['id']]
        for j, (a, b) in enumerate(zip(pts[:-1], pts[1:])):
            if min(radii[j], radii[j + 1]) < 1.19:
                continue
            z = (b - a) / np.linalg.norm(b - a)
            x = np.cross(z, [0, 0, 1] if abs(z[2]) < 0.9 else [0, 1, 0])
            x /= np.linalg.norm(x)
            y = np.cross(z, x)
            for center in np.linspace(a, b, max(2, int(np.linalg.norm(b - a) / 3) + 1)):
                for angle in np.arange(12) * math.tau / 12:
                    normal = x * math.cos(angle) + y * math.sin(angle)
                    if normal[2] < 0.1:
                        continue
                    p = center + normal * 1.49
                    if depth(p)[0] > 11 or p[2] < bed + 1.0:
                        continue
                    inside = p - normal * 0.65
                    inside[2] -= 0.35
                    if not query([inside], rooted)[0]:
                        continue
                    anchor_p.append(p)
                    anchor_n.append(normal)
                    anchor_id.append(m['id'])
                    anchor_time.append(float(inside[2]))
        if (L > 18 or load['downstream_flower_count'] >= 32 or m['tip_diameter_mm'] < 1.2) and len(contacts.get(m['id'], [])) < 2:
            q = np.load(m['mesh_source'])
            tm = trimesh.Trimesh(q['vertices'], q['faces'], process=False)
            tri = q['vertices'][q['faces']]
            cp = tri.mean(1)
            cn = tm.face_normals
            ok = cn[:, 2] < -0.2
            cp = cp[ok]
            cn = cn[ok]
            if len(cp):
                picked = []
                for fraction in [0.35, 0.65, 0.9]:
                    target = pts[0] * (1 - fraction) + pts[-1] * fraction
                    ix = int(np.linalg.norm(cp - target, axis=1).argmin())
                    picked.append(dict(point_mm=cp[ix], normal=cn[ix]))
                demands.append(dict(id='INTERNAL_' + m['id'], target=m['id'], role='PERMANENT', existing_contacts=contacts.get(m['id'], []), wanted_contacts=2, candidates=picked, z_mm=float(np.mean(pts[:, 2])), reasons=['long_permanent_span'] + (['load_concentration'] if load['downstream_flower_count'] >= 32 else []) + (['thin_attachment'] if m['tip_diameter_mm'] < 1.2 else [])))
        if i % 600 == 0:
            print('ANCHOR MEMBERS', i, 'points', len(anchor_p), flush=True)
    for d in demands:
        if d['target'] == 'A0341':
            d['priority'] = 'T00841 replacement required'
            d['wanted_contacts'] = max(2, d['wanted_contacts'])
    save(D / 'demands.json', demands)
    np.savez_compressed(D / 'body_anchors.npz', points=np.array(anchor_p), normals=np.array(anchor_n), owners=np.array(anchor_id), rooted_probe_z=np.array(anchor_time))
    save(D / 'anchor_rule.json', dict(count=len(anchor_p), source='V6 actual independently rooted material sections; main3mm Permanent surface candidates', no_new_support_credit=True, actual_contact_and_access_audit_required=True))
    print('DEMANDS', len(demands), 'ANCHORS', len(anchor_p), flush=True)
