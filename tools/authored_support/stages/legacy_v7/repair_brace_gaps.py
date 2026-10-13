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
    import sys
    import numpy as np, trimesh, manifold3d as md

    def man(v, f):
        return md.Manifold(md.Mesh(np.asarray(v, np.float32), np.asarray(f, np.uint32)))

    def capsule(a, b, r):
        a = np.array(a)
        b = np.array(b)
        parts = []
        if np.linalg.norm(a - b) > 1e-06:
            q = trimesh.creation.cylinder(radius=r, segment=[a, b], sections=12)
            parts.append(man(q.vertices, q.faces))
        for p in [a, b]:
            q = trimesh.creation.icosphere(subdivisions=1, radius=r)
            parts.append(man(q.vertices + p, q.faces))
        return md.Manifold.batch_boolean(parts, md.OpType.Add)

    def union(parts):
        return md.Manifold.batch_boolean(parts, md.OpType.Add)

    def store(path, m):
        assert m.status() == md.Error.NoError and m.volume() > 0
        q = m.to_mesh()
        v = q.vert_properties[:, :3]
        f = q.tri_verts
        np.savez_compressed(path, vertices=v, faces=f)
        return dict(bbox_mm=[v.min(0).tolist(), v.max(0).tolist()], volume_mm3=float(m.volume()), vertices=len(v), faces=len(f))
    s = read(D / 'scaffold.json')
    old = read(V5 / 'data/brace_network.json')
    sel = set(read(V6 / 'data/selected_support_ids.json'))
    cols = old['columns'] + s['columns']
    kt = cKDTree([c['xy_mm'] for c in cols])
    routes = {r['id']: r for r in read(V5 / 'data/support_geometry.json')['objects']}
    routes.update({r['id']: r for r in read(D / 'new_external_routes.json')['routes']})
    holds = []
    for h in s['holds']:
        if h['reason'] == 'UPPER_BRANCH_BRACE_UNSERVED':
            holds.append(dict(id=h['id'], point_mm=h['point_mm'], source='R7'))
    for h in old['holds']:
        if h['id'] in sel and 'position_mm' in h:
            holds.append(dict(id=h['id'], point_mm=h['position_mm'], source='V5'))
    added = []
    remaining = []
    for h in holds:
        target = np.array(h['point_mm'])
        r = routes[h['id']]
        base = np.array(r['points_mm'][0])
        found = None
        for j in np.atleast_1d(kt.query(target[:2], k=64)[1]):
            c = cols[int(j)]
            dist = np.linalg.norm(np.array(c['xy_mm']) - target[:2])
            for ratio in [1.2, 1.0, 1.8, 2.2]:
                z = target[2] - max(3, dist * ratio)
                start = np.r_[c['xy_mm'], z]
                if z < bed + 1 or z > c['top_z_mm'] - 0.5 or np.linalg.norm(start - base) < 1.4:
                    continue
                if not clear(start, target) or not void_clear(start, target):
                    continue
                found = (c, start)
                break
            if found:
                break
        if found:
            c, start = found
            id = f'RB7_{len(added):04d}'
            rec = dict(id=id, kind='UPPER_BRANCH_BRACE_REPAIR', anchor=c['id'], target=h['id'], points_mm=[start, target], diameter_mm=1.6, anchor_effective_z_mm=float(start[2] - 0.8), effective_z_mm=float(target[2] + 0.8), source_gap=h, rule='Different rising angle from an earlier bed-rooted shaft; no BODY or protected Void crossing')
            info = store(D / 'scaffold_meshes' / (id + '.npz'), capsule(start, target, 0.8))
            rec.update(**info, mesh_source=str(D / 'scaffold_meshes' / (id + '.npz')))
            added.append(rec)
        else:
            remaining.append(h)
    s['objects'] += added
    s['braces'] += added
    s['repaired_gap_count'] = len(added)
    s['remaining_upper_gaps'] = remaining
    save(D / 'scaffold.json', s)
    save(D / 'brace_gap_repair.json', dict(added=added, remaining=remaining))
    print('GAPS', len(holds), 'REPAIRED', len(added), 'REMAIN', len(remaining), flush=True)
