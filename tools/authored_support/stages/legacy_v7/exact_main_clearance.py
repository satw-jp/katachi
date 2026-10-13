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
    fs = read(V2 / 'data/surface.json')['surface']
    ms = read(V6 / 'data/structure.json')['members']
    body = fs + ms
    boxes = np.array([r['bbox_mm'] for r in body])
    u = np.load(V2 / 'data/D6_local.npz')
    unit = man(u['vertices'], u['faces'])
    memo = {}
    rows = []
    checked = 0

    def solid(i):
        if i not in memo:
            if len(memo) > 96:
                memo.clear()
            r = body[i]
            if i < len(fs):
                matrix = np.c_[np.array(r['orientation_matrix']) * r['physical_scale'], r['position_mm']]
                memo[i] = unit.transform(matrix.tolist())
            else:
                q = np.load(r['mesh_source'])
                memo[i] = man(q['vertices'], q['faces'])
        return memo[i]
    objects = [r for r in read(D / 'support_geometry.json')['objects'] if r.get('revision') != 'retained V6 selected D2' and r['kind'] != 'R3_STYLE_FLAT_FOOT']
    for ix, r in enumerate(objects):
        if 'contact_mm' in r:
            p = np.array(r['points_mm'])
            a, b = p[1:3] if r['kind'] == 'BODY_TO_BODY_TEMPORARY' else p[:2]
            bbox = np.array([np.minimum(a, b) - 0.8, np.maximum(a, b) + 0.8])
            m = None
        else:
            bbox = np.array(r['bbox_mm'])
            m = None
        ids = np.where(np.all(boxes[:, 0] <= bbox[1], axis=1) & np.all(boxes[:, 1] >= bbox[0], axis=1))[0]
        if len(ids):
            if r.get('exact_main_mesh_source'):
                q = np.load(r['exact_main_mesh_source'])
                m = man(q['vertices'], q['faces'])
            elif 'contact_mm' in r:
                m = capsule(a, b, 0.8)
            else:
                q = np.load(r['mesh_source'])
                m = man(q['vertices'], q['faces'])
            for j in ids:
                volume = float((m ^ solid(int(j))).volume())
                checked += 1
                if volume > 1e-05:
                    rows.append(dict(support=r['id'], body=body[int(j)]['id'], main_overlap_mm3=volume, role='MAIN/BRACE/SHAFT; intentional fine0.6mm neck excluded'))
        if ix % 250 == 0:
            print('MAIN CLEARANCE', ix, 'pairs', checked, 'HITS', len(rows), flush=True)
    save(D / 'exact_main_clearance.json', dict(objects_checked=len(objects), candidate_pairs_checked=checked, collisions=rows, method='Actual manifold intersection of new selected main1.6mm capsule/shaft/brace with frozen BODY. Sacrificial0.6mm necks excluded; feet were separately checked exactly. Retained V6 D2 preserves its prior checks.'))
    print('EXACT MAIN DONE', len(objects), checked, len(rows), flush=True)
