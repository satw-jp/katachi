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
    member = next((m for m in read(V6 / 'data/structure.json')['members'] if m['id'] == 'A0341'))
    q = np.load(member['mesh_source'])
    tri = q['vertices'][q['faces']]
    p = tri.mean(1)
    n = trimesh.Trimesh(q['vertices'], q['faces'], process=False).face_normals
    ok = n[:, 2] < 0.3
    p = p[ok]
    n = n[ok]
    dep = depth(p)
    order = np.argsort(dep)
    chosen = []
    for i in order:
        if all((np.linalg.norm(p[i] - p[j]) > 0.65 for j in chosen)):
            chosen.append(int(i))
        if len(chosen) >= 70:
            break
    cols = read(V5 / 'data/brace_network.json')['columns']
    xy = np.array([c['xy_mm'] for c in cols])
    kt = cKDTree(xy)
    routes = []
    for ix in chosen:
        point = p[ix]
        normal = n[ix]
        end = point + normal * 1.45
        for j in np.atleast_1d(kt.query(end[:2], k=64)[1]):
            col = cols[int(j)]
            dist = np.linalg.norm(np.array(col['xy_mm']) - end[:2])
            start = np.r_[col['xy_mm'], min(col['top_z_mm'] - 0.5, end[2] - max(3.0, dist * 1.5))]
            if start[2] < bed + 1 or np.linalg.norm(end - start) > 38:
                continue
            if not void_clear(start, end) or not clear(start, end) or (not clear(end, point + normal * 0.85, 0.3)):
                continue
            routes.append(dict(id=f'Z0341_{len(routes):03d}', kind='EXTERNAL_SHAFT_BRANCH', target='A0341', target_role='PERMANENT', anchor=col['id'], demand='T00841 replacement', points_mm=[start, end, point - normal * 0.2], contact_mm=point, contact_normal=normal, cut_mm=point + normal * 0.42, shaft_diameter_mm=1.6, contact_diameter_mm=0.6, anchor_effective_z_mm=float(start[2] - 0.8), reasons=['lost_contact_replacement', 'long_permanent_span'], removal_status='PENDING', rule='Fresh actual-side contact and independent route from existing bed-rooted vertical shaft; do not reuse lost T00841 neck.'))
            break
        if len(routes) >= 12:
            break
    save(D / 'new_special_routes.json', dict(routes=routes))
    print('A0341 ALTERNATIVE ROUTES', len(routes), flush=True)
