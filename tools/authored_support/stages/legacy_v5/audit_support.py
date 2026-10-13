"""Source-faithful V5 stage. Caller must provide an isolated scratch tree.
Original algorithm: audit_support.py; no source-script runtime execution.
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
    data = read(D / 'support_geometry.json')
    obs = data['objects']
    boxes = np.array([x['bbox_mm'] for x in obs])
    oid = [x['id'] for x in obs]
    contacts = [x for x in obs if 'contact_mm' in x]
    fs = read(V2 / 'data/surface.json')['surface']
    fm = {x['id']: x for x in fs}
    mm = {x['id']: x for x in read(V3 / 'data/structure.json')['members']}
    unit = np.load(V2 / 'data/D6_local.npz')
    uv = unit['vertices']
    uf = unit['faces']
    memo = {}

    def solid(id):
        if id not in memo:
            if id in fm:
                f = fm[id]
                m = man(uv @ np.array(f['orientation_matrix']).T * f['physical_scale'] + f['position_mm'], uf)
            else:
                q = np.load(V3 / ('data/members/' + id + '.npz'))
                m = man(q['vertices'], q['faces'])
            if len(memo) > 32:
                memo.clear()
            memo[id] = m
        return memo[id]

    def box_intersections(p, d):
        enter = np.full(len(boxes), 1.5)
        leave = np.full(len(boxes), 260.0)
        for ax in range(3):
            if abs(d[ax]) < 1e-09:
                leave[(p[ax] < boxes[:, 0, ax] - 0.6) | (p[ax] > boxes[:, 1, ax] + 0.6)] = -1
            else:
                t0 = (boxes[:, 0, ax] - 0.6 - p[ax]) / d[ax]
                t1 = (boxes[:, 1, ax] + 0.6 - p[ax]) / d[ax]
                enter = np.maximum(enter, np.minimum(t0, t1))
                leave = np.minimum(leave, np.maximum(t0, t1))
        ids = np.where(enter <= leave)[0]
        return [oid[i] for i in ids[np.argsort(-enter[ids])]]
    angles = []
    for el in [-45, -70, 0, 30]:
        for az in np.arange(24) * math.tau / 24:
            angles.append(np.array([math.cos(math.radians(el)) * math.cos(az), math.cos(math.radians(el)) * math.sin(az), math.sin(math.radians(el))]))

    def access(p):
        for direction in angles:
            if clear(np.array(p) + direction * 1.5, np.array(p) + direction * 260, 0.6):
                return (direction, box_intersections(p, direction))
        return (None, [])

    def withdrawal(r):
        points = np.array(r['points_mm'])
        if r['kind'] == 'BODY_TO_BODY_TEMPORARY':
            a, b = points[1:3]
            segment = np.linspace(a, b, max(3, int(np.linalg.norm(a - b) / 1)))
            for direction in angles:
                clearall = True
                for start in segment:
                    if not clear(start, start + direction * 260, 0.8):
                        clearall = False
                        break
                if clearall:
                    return direction
            return None
        else:
            p = np.array(r['points_mm'][1])
            direction = np.array(r.get('removal_direction', [0, 0, -1]), float)
            if direction.shape != (3,):
                direction = np.array([0, 0, -1.0])
            return direction if clear(p, p + direction * 260, 0.8) else None
    records = []
    for i, r in enumerate(contacts):
        p = np.array(r['points_mm'])
        target = r['target']
        a, b = p[-2:]
        neck = capsule(a, b, 0.3)
        vol = (neck ^ solid(target)).volume()
        anchorvol = None
        if r['kind'] == 'BODY_TO_BODY_TEMPORARY':
            anchorvol = (capsule(p[0], p[1], 0.3) ^ solid(r['anchor'])).volume()
        cut = np.array(r['cut_mm'])
        direction, blockers = access(cut)
        anchor_direction = None
        anchor_blockers = []
        if 'anchor_cut_mm' in r:
            anchor_direction, anchor_blockers = access(r['anchor_cut_mm'])
        out = withdrawal(r)
        flags = []
        if vol <= 1e-06:
            flags.append('NO_EXACT_TARGET_CONTACT')
        if anchorvol is not None and anchorvol <= 1e-06:
            flags.append('NO_EXACT_ANCHOR_CONTACT')
        if direction is None:
            flags.append('TARGET_CUT_ACCESS_UNCONFIRMED')
        if 'anchor_cut_mm' in r and anchor_direction is None:
            flags.append('ANCHOR_CUT_ACCESS_UNCONFIRMED')
        if out is None:
            flags.append('FRAGMENT_WITHDRAWAL_UNCONFIRMED')
        records.append(dict(id=r['id'], target=target, anchor=r['anchor'], contact_mm=r['contact_mm'], cut_mm=r['cut_mm'], target_overlap_mm3=float(vol), anchor_overlap_mm3=anchorvol, tool_direction=direction, trim_before_target_cut=[x for x in blockers if x != r['id']], anchor_tool_direction=anchor_direction, trim_before_anchor_cut=[x for x in anchor_blockers if x != r['id']], withdrawal_direction=out, status='SAMPLED_ROUTE_SUPPORTED' if not flags else 'HOLD', flags=flags, method='Exact intended neck/BODY intersection; 1.2mm tool and1.6mm fragment swept against frozen BODY section masks with0.26mm guard. Scaffold encountered on access ray is trimmed outside-in before neck. Actual tool shape, cutting forces and physical removal unverified.'))
        if i % 100 == 0:
            print('ACCESS', i, 'HOLD', sum((bool(x['flags']) for x in records)), flush=True)
    save(D / 'contact_removal_audit.json', dict(contacts=records, total=len(records), held_count=sum((bool(x['flags']) for x in records)), physical_verified=False, chronological_gcode_verified=False, note='No slice by Author instruction. This is not a print release. Outside-in scaffold trimming can increase work; hold BODY locally while cutting.'))
    print('AUDIT DONE', len(records), sum((bool(x['flags']) for x in records)), flush=True)
