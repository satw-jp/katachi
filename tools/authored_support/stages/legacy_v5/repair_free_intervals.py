"""Source-faithful V5 stage. Caller must provide an isolated scratch tree.
Original algorithm: repair_free_intervals.py; no source-script runtime execution.
"""
def run(stage_root):
    from pathlib import Path
    import sys, json, math, collections
    from pathlib import Path
    import numpy as np
    from scipy.spatial import cKDTree
    from scipy import ndimage as ndi
    R = stage_root
    D = R / 'data'
    V2 = R.parent / 'R4_D6_SIZE_RHYTHM_V2'
    V3 = R.parent / 'R4_V2_INTERNAL_PROPOSAL_V3'
    V4 = R.parent / 'R4_V2_V3_A1_EXPERIMENTAL_V4'

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
    directions = np.array([[x, y, z] for x in [-1, 0, 1] for y in [-1, 0, 1] for z in [-1, 0, 1] if x or y or z], float)
    directions /= np.linalg.norm(directions, axis=1)[:, None]
    directions = np.vstack([[0, 0, 0], directions])

    def occupied(points):
        ix = np.floor((np.asarray(points) - origin) / pitch).astype(int)
        valid = np.all((ix >= 0) & (ix < shape), axis=1)
        out = np.zeros(len(ix), bool)
        q = ix[valid]
        out[valid] = occ[q[:, 2], q[:, 1], q[:, 0]]
        return out

    def clear(a, b, r=0.8):
        a = np.array(a)
        b = np.array(b)
        n = max(2, int(np.ceil(np.linalg.norm(b - a) / 0.45)) + 1)
        q = np.linspace(a, b, n)
        return not np.any(occupied((q[:, None, :] + directions[None, :, :] * (r + 0.26)).reshape(-1, 3)))
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
    n = read(D / 'brace_network.json')
    data = read(D / 'support_geometry.json')
    cols = n['columns']
    kt = cKDTree([c['xy_mm'] for c in cols])
    added = []
    for iteration in range(2):
        events = collections.defaultdict(list)
        for b in n['braces']:
            if b['kind'] == 'EARLY_AND_INTERMEDIATE_SHAFT_BRACE':
                z = max((p[2] for p in b['points_mm'])) + 0.8
                for id in [b['anchor'], b['target']]:
                    events[id].append(z)
        for c in cols:
            top = c['top_z_mm']
            levels = [bed] + sorted(set((z for z in events[c['id']] if bed < z <= top))) + [top]
            for lo, hi in zip(levels[:-1], levels[1:]):
                if hi - lo <= 20:
                    continue
                for z in np.arange(lo + 16 - 0.8, hi - 0.5, 16):
                    end = np.r_[c['xy_mm'], z]
                    chosen = None
                    for j in np.atleast_1d(kt.query(c['xy_mm'], k=20)[1]):
                        other = cols[int(j)]
                        dist = np.linalg.norm(np.array(c['xy_mm']) - other['xy_mm'])
                        rise = max(3.0, dist * 1.35)
                        start = np.r_[other['xy_mm'], z - rise]
                        if other['id'] == c['id'] or dist > 10 or start[2] < bed + 1 or (other['top_z_mm'] < start[2] + 0.8) or (not clear(start, end)):
                            continue
                        chosen = (other, start)
                        break
                    if chosen:
                        other, start = chosen
                        b = dict(id=f"X{len(n['braces']):05d}", kind='EARLY_AND_INTERMEDIATE_SHAFT_BRACE', anchor=other['id'], target=c['id'], points_mm=[start, end], diameter_mm=1.6, anchor_effective_z_mm=float(start[2] - 0.8), brace_effective_z_mm=float(z + 0.8), reason='Final-height audit repair: added only where shaft extension left >20mm growth interval; earlier rooted neighboring shaft', removal_direction='outward with exterior scaffold panel', cutting_access='exterior scaffold')
                        b.update(store(D / 'meshes' / (b['id'] + '.npz'), capsule(start, end, 0.8)))
                        n['braces'].append(b)
                        data['objects'].append(b)
                        added.append(b['id'])
    save(D / 'brace_network.json', n)
    data['count'] = len(data['objects'])
    data['parts_by_kind'] = collections.Counter((x['kind'] for x in data['objects']))
    save(D / 'support_geometry.json', data)
    save(D / 'free_interval_repairs.json', dict(added=added, method='Two bounded passes only; final-height growth intervals, not completed-body connectivity'))
    print('FINAL HEIGHT BRACES', len(added), flush=True)
