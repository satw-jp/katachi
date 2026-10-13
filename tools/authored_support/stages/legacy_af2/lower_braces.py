def run(stage_root):
    from pathlib import Path
    import sys, json, math, functools, hashlib
    from pathlib import Path
    R = stage_root
    W = R.parent
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
    read = lambda p: json.loads(Path(p).read_text(encoding='utf-8-sig'))
    out = R / 'data/lower_meshes'
    out.mkdir(exist_ok=True)
    bed = -1.7660574107474478
    fs = read(W / 'R4_D6_SIZE_RHYTHM_V2/data/surface.json')['surface']
    unit = np.load(W / 'R4_D6_SIZE_RHYTHM_V2/data/D6_local.npz')
    unitman = man(unit['vertices'], unit['faces'])
    body = list(fs)
    seen = set()
    for folder in ['R4_A_SHORT_JOIN_G', 'R4_F2_DEEP_JOIN_G']:
        for m in read(W / folder / 'data/structure.json')['members']:
            if m['mesh_source'] not in seen:
                body.append(m)
                seen.add(m['mesh_source'])
    boxes = np.array([m['bbox_mm'] for m in body])
    sup = read(W / 'R4_A1_MINI_RELEASE_CANDIDATE/data/support_geometry.json')['objects']
    sm = {m['id']: m for m in sup}

    @functools.lru_cache(256)
    def solid(i):
        m = body[i]
        if 'physical_scale' in m:
            return unitman.transform(np.c_[np.array(m['orientation_matrix']) * m['physical_scale'], m['position_mm']].tolist())
        q = np.load(m['mesh_source'])
        return man(q['vertices'], q['faces'])

    def hits(m):
        v = m.to_mesh().vert_properties[:, :3]
        near = np.where(np.all(boxes[:, 0] <= v.max(0), axis=1) & np.all(boxes[:, 1] >= v.min(0), axis=1))[0]
        res = []
        for i in near:
            vol = float((m ^ solid(int(i))).volume())
            if vol > 1e-05:
                res.append((body[i]['id'], vol))
        return res

    def cyl(xy, z0, z1, r0, r1=None):
        r1 = r0 if r1 is None else r1
        k = 24
        v = np.array([[*np.array(xy) + r * np.array([math.cos(t), math.sin(t)]), z] for z, r in [(z0, r0), (z1, r1)] for t in np.arange(k) * math.tau / k] + [[*xy, z0], [*xy, z1]])
        f = []
        for i in range(k):
            j = (i + 1) % k
            f.extend([[i, j, k + j], [i, k + j, k + i], [2 * k, j, i], [2 * k + 1, k + i, k + j]])
        return man(v, f)
    from scipy.spatial import cKDTree
    new = read(R / 'data/LOWER_SUPPORT_REVISION.json')['added']
    posts = [r for r in new if r['kind'] == 'LOWER_DISTRIBUTED_BED_CONTACT']
    allposts = posts + [r for r in sup if r['kind'] == 'EXTERNAL_VERTICAL_SHAFT']
    tree = cKDTree([r['points_mm'][0][:2] for r in allposts])
    used = set()
    braces = []
    holds = []
    for ix, r in enumerate(posts):
        if r['points_mm'][1][2] < bed + 10:
            continue
        a = np.array(r['points_mm'][0])
        top = r['points_mm'][1][2]
        found = False
        for j in np.atleast_1d(tree.query(a[:2], k=min(18, len(allposts)))[1]):
            t = allposts[int(j)]
            b = np.array(t['points_mm'][0])
            dist = float(np.linalg.norm(a[:2] - b[:2]))
            rise = max(3, dist * 1.5)
            key = tuple(sorted([r['id'], t['id']]))
            if key in used:
                found = True
                break
            if not 1.8 < dist < 7.5 or min(top, t['points_mm'][1][2]) < bed + 1.2 + rise + 1:
                continue
            candidates = []
            for xy0, xy1 in [(a[:2], b[:2]), (b[:2], a[:2])]:
                start = np.r_[xy0, bed + 1.2]
                end = np.r_[xy1, bed + 1.2 + rise]
                m = capsule(start, end, 0.8)
                if hits(m):
                    continue
                id = f'P10_BR_{len(braces) + len(candidates):04d}'
                path = out / (id + '.npz')
                rec = dict(id=id, kind='EARLY_LOWER_CONTACT_BRACE', anchor=r['id'] if np.array_equal(xy0, a[:2]) else t['id'], target=t['id'] if np.array_equal(xy0, a[:2]) else r['id'], points_mm=[start.tolist(), end.tolist()], diameter_mm=1.6, first_effective_z_mm=float(end[2] + 0.8), mesh_source=str(path.resolve()), removal_direction='bottom panels; cut brace junctions, remove short pieces down/outward', cutting_access='from bottom after release from plate', **store(path, m))
                candidates.append(rec)
            if candidates:
                braces.extend(candidates)
                used.add(key)
                found = True
                break
        if not found:
            holds.append(dict(id=r['id'], height_mm=top - bed, reason='No BODY-clear early neighbor brace; short direct bed shaft retains collar'))
        if ix % 100 == 0:
            print('BRACE', ix, len(braces), 'unbraced', len(holds), flush=True)
    (R / 'data/LOWER_BRACES.json').write_text(json.dumps(dict(objects=braces, unbraced=holds), indent=2), encoding='utf8')
    print('DONE', len(braces), 'unbraced', len(holds), flush=True)
