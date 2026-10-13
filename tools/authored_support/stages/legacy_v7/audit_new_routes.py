"""Pure scoped port; caller supplies isolated scratch root. No legacy import."""
def run(stage_root, kind):
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
    import argparse
    routes = read(D / f'new_{kind}_routes.json')['routes']
    (D / 'new_meshes').mkdir(exist_ok=True)
    fs = {f['id']: f for f in read(V2 / 'data/surface.json')['surface']}
    ms = {m['id']: m for m in read(V6 / 'data/structure.json')['members']}
    u = np.load(V2 / 'data/D6_local.npz')
    uv = u['vertices']
    uf = u['faces']
    memo = {}
    records = []
    meshes = []

    def solid(id):
        if id not in memo:
            if len(memo) > 80:
                memo.clear()
            if id in fs:
                f = fs[id]
                memo[id] = man(uv @ np.array(f['orientation_matrix']).T * f['physical_scale'] + f['position_mm'], uf)
            else:
                q = np.load(ms[id]['mesh_source'])
                memo[id] = man(q['vertices'], q['faces'])
        return memo[id]
    directions = []
    for k in range(96):
        z = 1 - 2 * (k + 0.5) / 96
        ang = k * math.pi * (3 - math.sqrt(5))
        directions.append(np.array([math.sqrt(1 - z * z) * math.cos(ang), math.sqrt(1 - z * z) * math.sin(ang), z]))
    upper = origin + shape * pitch

    def ray(a, d, r):
        a = np.array(a)
        bounds = []
        for j in range(3):
            if abs(d[j]) > 1e-08:
                bounds.append(((upper[j] + 2 if d[j] > 0 else origin[j] - 2) - a[j]) / d[j])
        length = max(1.0, min([t for t in bounds if t > 0] + [260.0]))
        return clear(a, a + d * length, r)

    def access(p):
        preferred = np.array(p) - np.array([0.0, 0.0, 105.0])
        preferred /= np.linalg.norm(preferred)
        for d in sorted(directions, key=lambda d: -d @ preferred):
            if ray(np.array(p) + d * 1.5, d, 0.6):
                return d
        return None

    def withdrawal(a, b):
        points = np.linspace(a, b, max(3, int(np.linalg.norm(b - a) / 1.2) + 1))
        pref = (a + b) / 2 - [0, 0, 105]
        pref /= max(np.linalg.norm(pref), 1e-06)
        for d in sorted(directions, key=lambda d: -d @ pref):
            if all((ray(p, d, 0.8) for p in points)):
                return d
        return None
    for ix, r in enumerate(routes):
        p = np.array(r['points_mm'])
        isbody = r['kind'] == 'BODY_TO_BODY_TEMPORARY'
        if isbody and (not any((ray((p[1] + p[2]) / 2, d, 0.8) for d in directions))):
            records.append(dict(id=r['id'], target=r['target'], anchor=r['anchor'], flags=['NO_LINEAR_EXTRACTION_AT_MAIN_MIDPOINT'], status='HOLD', note='Necessary escape test fails even before contact/mesh construction; no final material or removal claim.'))
            if ix % 100 == 0:
                print('EARLY HOLD', ix, 'SELECT', sum((not x['flags'] for x in records)), flush=True)
            if ix % 100 == 0:
                save(D / f'{kind}_audit_checkpoint.json', records)
            continue
        parts = [capsule(p[0], p[1], 0.3), capsule(p[1], p[2], 0.8), capsule(p[2], p[3], 0.3)] if isbody else [capsule(p[0], p[1], 0.8), capsule(p[1], p[2], 0.3)]
        m = union(parts)
        info = store(D / 'new_meshes' / (r['id'] + '.npz'), m)
        meshes.append(dict(**r, **info, mesh_source=str(D / 'new_meshes' / (r['id'] + '.npz'))))
        flags = []
        targetvol = float((parts[-1] ^ solid(r['target'])).volume())
        anchorvol = float((parts[0] ^ solid(r['anchor'])).volume()) if isbody else None
        if targetvol <= 1e-05:
            flags.append('TARGET_CONTACT')
        if isbody and anchorvol <= 1e-05:
            flags.append('ANCHOR_CONTACT')
        tool = access(r['cut_mm'])
        atool = access(r['anchor_cut_mm']) if isbody else None
        if tool is None:
            flags.append('TARGET_CUT_ACCESS')
        if isbody and atool is None:
            flags.append('ANCHOR_CUT_ACCESS')
        a, b = p[1:3] if isbody else p[:2]
        d = withdrawal(a, b) if not flags else None
        fragments = []
        cuts = []
        if d is not None:
            fragments = [dict(points_mm=[a, b], direction=d)]
        elif not flags:
            for n in [2, 3]:
                split = np.linspace(a, b, n + 1)
                cutdirs = [access(x) for x in split[1:-1]]
                if any((x is None for x in cutdirs)):
                    continue
                w = [withdrawal(x, y) for x, y in zip(split[:-1], split[1:])]
                if all((x is not None for x in w)):
                    fragments = [dict(points_mm=[x, y], direction=z) for x, y, z in zip(split[:-1], split[1:], w)]
                    cuts = [dict(point_mm=x, direction=y) for x, y in zip(split[1:-1], cutdirs)]
                    break
        if not fragments:
            flags.append('NO_REMOVABLE_FRAGMENTS')
        records.append(dict(id=r['id'], target=r['target'], anchor=r['anchor'], target_overlap_mm3=targetvol, anchor_overlap_mm3=anchorvol, target_tool_direction=tool, anchor_tool_direction=atool, extra_main_cuts=cuts, fragments=fragments, flags=flags, status='HOLD' if flags else 'GEOMETRY_ACCESS_CANDIDATE', caution='BODY-clear tool/fragment sweeps; temporary scaffold may be cut outside-in first. Actual jaw shape, cutting force and removal are not physically verified.'))
        if ix % 100 == 0:
            print('AUDIT', kind, ix, 'SELECT', sum((not r['flags'] for r in records)), 'HOLD', sum((bool(r['flags']) for r in records)), flush=True)
        if ix % 100 == 0:
            save(D / f'{kind}_audit_checkpoint.json', records)
    save(D / f'{kind}_mesh_records.json', meshes)
    save(D / f'{kind}_contact_removal.json', records)
    print('AUDIT DONE', kind, len(records), sum((not r['flags'] for r in records)), flush=True)
