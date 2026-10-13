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

    def section_pixels(tri, zmin, zmax, z, origin, pitch, shape):
        sel = (zmin < z) & (zmax > z)
        t = tri[sel]
        if not len(t):
            return np.empty(0, np.int32)
        a = t
        b = np.roll(t, -1, axis=1)
        hit = (a[:, :, 2] <= z) != (b[:, :, 2] <= z)
        u = (z - a[:, :, 2]) / (b[:, :, 2] - a[:, :, 2] + 1e-30)
        p = a + (b - a) * u[:, :, None]
        seg = p[hit].reshape(-1, 2, 3)[:, :, :2]
        y0 = max(0, int(np.floor((seg[:, :, 1].min() - origin[1]) / pitch)))
        y1 = min(shape[1] - 1, int(np.ceil((seg[:, :, 1].max() - origin[1]) / pitch)))
        ys = origin[1] + (np.arange(y0, y1 + 1) + 0.5) * pitch
        a = seg[:, 0]
        b = seg[:, 1]
        hit = (a[:, 1, None] <= ys) != (b[:, 1, None] <= ys)
        xx = a[:, 0, None] + (ys - a[:, 1, None]) * (b[:, 0] - a[:, 0])[:, None] / ((b[:, 1] - a[:, 1])[:, None] + 1e-30)
        ss, rr = np.nonzero(hit)
        xx = xx[ss, rr]
        cc = np.ceil((xx - origin[0]) / pitch - 0.5).astype(int)
        cc = np.clip(cc, 0, shape[0])
        counts = np.zeros((len(ys), shape[0] + 1), np.uint16)
        np.add.at(counts, (rr, cc), 1)
        mask = (np.cumsum(counts[:, :-1], axis=1) % 2).astype(bool)
        r, c = np.nonzero(mask)
        return ((r + y0) * shape[0] + c).astype(np.int32)
    xy_origin = origin[:2].copy()
    xy_shape = shape[:2].copy()
    records = []
    selected = []
    mesh_rows = []
    for kind in ['body', 'outer']:
        audit = {r['id']: r for r in read(D / f'{kind}_contact_removal.json')}
        mesh_rows += [r for r in read(D / f'{kind}_mesh_records.json') if not audit[r['id']]['flags']]
    fs = {f['id']: f for f in read(V2 / 'data/surface.json')['surface']}
    ms = {m['id']: m for m in read(V6 / 'data/structure.json')['members']}
    u = np.load(V2 / 'data/D6_local.npz')
    memo = {}
    (D / 'birth_corrected_meshes').mkdir(exist_ok=True)

    def solid(id):
        if id not in memo:
            if len(memo) > 50:
                memo.clear()
            if id in fs:
                f = fs[id]
                memo[id] = man(u['vertices'] @ np.array(f['orientation_matrix']).T * f['physical_scale'] + f['position_mm'], u['faces'])
            else:
                q = np.load(ms[id]['mesh_source'])
                memo[id] = man(q['vertices'], q['faces'])
        return memo[id]
    for ix, r in enumerate(mesh_rows):
        q = np.load(r['mesh_source'])
        tri = q['vertices'][q['faces']]
        zmin = tri[:, :, 2].min(1)
        zmax = tri[:, :, 2].max(1)
        z0 = float(zmin.min())
        first = None
        good = None
        same_layer = None
        for k in range(max(1, int((z0 - bed) / 0.2)), min(len(rooted), int((z0 + 1.3 - bed) / 0.2) + 2)):
            pix = section_pixels(tri, zmin, zmax, bed + (k + 0.5) * 0.2, xy_origin, 0.3, xy_shape)
            if not len(pix):
                continue
            if first is None:
                first = k
            if np.any(rooted[k].ravel()[pix]) and same_layer is None:
                same_layer = k
            if np.any(rooted[k - 1].ravel()[pix]):
                good = k
                break
        status = 'PASS_EARLIER_BODY_SECTION'
        updated = dict(r)
        trim = 0.0
        volume = None
        if good is None or bed + good * 0.2 - z0 > 1.2:
            status = 'HOLD_ANCHOR_BIRTH'
        elif good != first:
            cut = bed + good * 0.2
            trim = cut - z0
            m = man(q['vertices'], q['faces']).trim_by_plane([0, 0, 1], cut)
            volume = float((m ^ solid(r['anchor'])).volume())
            if volume <= 1e-05:
                status = 'HOLD_TRIM_LOSES_ANCHOR'
            else:
                path = D / 'birth_corrected_meshes' / (r['id'] + '.npz')
                info = store(path, m)
                updated.update(**info, mesh_source=str(path), anchor_bottom_trim_z_mm=cut, anchor_bottom_trim_mm=trim, anchor_trim_rule='Remove only early free sacrificial cap until first sampled section overlaps independently rooted BODY in previous layer; frozen BODY untouched.')
                status = 'TRIMMED_TO_EARLIER_BODY_SECTION'
        if not status.startswith('HOLD'):
            selected.append(updated)
        records.append(dict(id=r['id'], anchor=r['anchor'], target=r['target'], original_first_layer=first, earliest_same_layer_rooted_body_overlap=same_layer, first_previous_layer_rooted_body_overlap=good, trim_mm=trim, post_trim_anchor_overlap_mm3=volume, status=status))
        if ix % 200 == 0:
            print('BIRTH', ix, 'HOLD', sum((x['status'].startswith('HOLD') for x in records)), 'TRIM', sum((x['trim_mm'] > 0 for x in records)), flush=True)
    save(D / 'body_birth_review.json', dict(records=records, xy_mm=0.3, layer_mm=0.2, method='Actual new Support mesh first sections against frozen V6 BODY root propagation at previous layer. Small sacrificial-bottom trim only when required; not G-code ordering or strength proof.'))
    save(D / 'selected_body_meshes.json', selected)
    print('BIRTH DONE', len(records), len(selected), flush=True)
