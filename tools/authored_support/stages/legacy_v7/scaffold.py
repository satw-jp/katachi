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
    selected_external = {r['id'] for r in read(D / 'external_contact_removal.json') if not r['flags']}
    data = read(D / 'new_external_routes.json')
    routes = [r for r in data['routes'] if r['id'] in selected_external]
    used = {r['anchor'] for r in routes}
    cols = {c['id']: c for c in data['columns'] if c['id'] in used}
    braces = []
    holds = []
    pairs = set()
    (D / 'scaffold_meshes').mkdir(exist_ok=True)
    base = list(cols.values())
    kt = cKDTree([c['xy_mm'] for c in base])

    def exterior(xy):
        p = np.c_[np.tile(xy, (106, 1)), np.linspace(bed + 1.2, 215, 106)]
        return depth(p).max() < -1.1 and clear(p[0], p[-1], 1.1) and np.all(np.abs(xy) < 122)
    for c in base:
        buddy = None
        for j in np.atleast_1d(kt.query(c['xy_mm'], k=min(12, len(base)))[1]):
            b = base[int(j)]
            distance = np.linalg.norm(np.array(c['xy_mm']) - b['xy_mm'])
            if b['id'] != c['id'] and 2.5 < distance < 7.3:
                buddy = b
                break
        if buddy is None:
            for angle in np.arange(24) * math.tau / 24:
                xy = np.array(c['xy_mm']) + [3.6 * math.cos(angle), 3.6 * math.sin(angle)]
                if exterior(xy):
                    id = 'EB' + c['id'][1:]
                    buddy = dict(id=id, xy_mm=xy, top_z_mm=c['top_z_mm'], contact_routes=[])
                    cols[id] = buddy
                    break
        if buddy is None:
            holds.append(dict(id=c['id'], reason='NO_EARLY_BRACE_BUDDY'))
            continue
        top = max(c['top_z_mm'], buddy['top_z_mm'])
        c['top_z_mm'] = buddy['top_z_mm'] = top
        pairs.add(tuple(sorted([c['id'], buddy['id']])))
    for _ in range(4):
        for a, b in pairs:
            cols[a]['top_z_mm'] = cols[b]['top_z_mm'] = max(cols[a]['top_z_mm'], cols[b]['top_z_mm'])
    for a, b in sorted(pairs):
        ca, cb = (cols[a], cols[b])
        distance = np.linalg.norm(np.array(ca['xy_mm']) - cb['xy_mm'])
        rise = max(4.0, distance * 1.5)
        top = min(ca['top_z_mm'], cb['top_z_mm'])
        levels = list(np.arange(bed + 1 + rise, top - 0.3, 12))
        levels.append(top - 0.3)
        for z in levels:
            if z - rise < bed + 1:
                continue
            for c, d in [(ca, cb), (cb, ca)]:
                start = np.r_[c['xy_mm'], z - rise]
                end = np.r_[d['xy_mm'], z]
                if clear(start, end):
                    braces.append(dict(id=f'B7_{len(braces):05d}', kind='EARLY_SHAFT_BRACE', anchor=c['id'], target=d['id'], points_mm=[start, end], diameter_mm=1.6, anchor_effective_z_mm=float(start[2] - 0.8), effective_z_mm=float(z + 0.8), rule='Rising diagonal from already-growing vertical bed shaft;12mm intervals; no floating horizontal rung.'))
                else:
                    holds.append(dict(id=c['id'], reason='SHAFT_BRACE_CLEARANCE', z_mm=float(z)))
    allcols = list(cols.values())
    tree = cKDTree([c['xy_mm'] for c in allcols])
    for r in routes:
        a, b = np.array(r['points_mm'][:2])
        L = np.linalg.norm(b - a)
        if L < 14:
            continue
        for distance in np.arange(10, L - 3, 10):
            target = a + (b - a) * distance / L
            found = None
            for j in np.atleast_1d(tree.query(target[:2], k=min(24, len(allcols)))[1]):
                c = allcols[int(j)]
                horiz = np.linalg.norm(np.array(c['xy_mm']) - target[:2])
                startz = min(c['top_z_mm'] - 0.5, target[2] - max(2, horiz * 1.5))
                start = np.r_[c['xy_mm'], startz]
                if startz < bed + 1 or np.linalg.norm(start - a) < 1.2:
                    continue
                if clear(start, target) and void_clear(start, target):
                    found = (c, start)
                    break
            if found:
                c, start = found
                braces.append(dict(id=f'B7_{len(braces):05d}', kind='UPPER_BRANCH_BRACE', anchor=c['id'], target=r['id'], points_mm=[start, target], diameter_mm=1.6, anchor_effective_z_mm=float(start[2] - 0.8), effective_z_mm=float(target[2] + 0.8), rule='Earlier bed shaft braces the long rising upper branch at10mm centerline stations.'))
            else:
                holds.append(dict(id=r['id'], reason='UPPER_BRANCH_BRACE_UNSERVED', point_mm=target))
    oldcols = read(V5 / 'data/brace_network.json')['columns']
    tree = cKDTree([c['xy_mm'] for c in oldcols])
    oldpairs = set()
    for c in oldcols:
        if c['top_z_mm'] < bed + 10:
            continue
        for j in np.atleast_1d(tree.query(c['xy_mm'], k=10)[1]):
            b = oldcols[int(j)]
            dist = np.linalg.norm(np.array(c['xy_mm']) - b['xy_mm'])
            rise = max(4.0, dist * 1.5)
            if b['id'] == c['id'] or not 2 < dist < 7.3 or min(c['top_z_mm'], b['top_z_mm']) < bed + rise + 2:
                continue
            pair = tuple(sorted([c['id'], b['id']]))
            if pair in oldpairs:
                break
            for ca, cb in [(c, b), (b, c)]:
                start = np.r_[ca['xy_mm'], bed + 1.0]
                end = np.r_[cb['xy_mm'], bed + 1 + rise]
                if clear(start, end):
                    braces.append(dict(id=f'B7_{len(braces):05d}', kind='R3_STYLE_BASAL_BRACE', anchor=ca['id'], target=cb['id'], points_mm=[start, end], diameter_mm=1.6, anchor_effective_z_mm=bed + 0.2, effective_z_mm=float(end[2] + 0.8), rule='Additional near-foot rising brace; R3 principle, new Mocomoco endpoints.'))
            oldpairs.add(pair)
            break
    objects = []
    for c in cols.values():
        a = np.r_[c['xy_mm'], bed + 0.8]
        b = np.r_[c['xy_mm'], c['top_z_mm']]
        m = capsule(a, b, 0.8)
        info = store(D / 'scaffold_meshes' / (c['id'] + '.npz'), m)
        objects.append(dict(**c, **info, kind='EXTERNAL_VERTICAL_SHAFT', points_mm=[a, b], shaft_diameter_mm=1.6, mesh_source=str(D / 'scaffold_meshes' / (c['id'] + '.npz'))))
    for b in braces:
        m = capsule(*b['points_mm'], 0.8)
        info = store(D / 'scaffold_meshes' / (b['id'] + '.npz'), m)
        objects.append(dict(**b, **info, mesh_source=str(D / 'scaffold_meshes' / (b['id'] + '.npz'))))
    save(D / 'scaffold.json', dict(columns=list(cols.values()), braces=braces, objects=objects, holds=holds))
    print('SCAFFOLD', len(cols), len(braces), 'HOLD', len(holds), flush=True)
