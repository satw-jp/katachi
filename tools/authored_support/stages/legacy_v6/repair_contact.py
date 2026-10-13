"""Pure scoped port; caller supplies isolated scratch root. No legacy import."""
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
    V5 = R.parent / 'R4_V5_AUTHORED_SUPPORT_REVIEW'
    old = next((x for x in read(V5 / 'data/support_geometry.json')['objects'] if x['id'] == 'T00841'))
    p = np.array(old['points_mm'])
    q = np.load(D / 'members/A0341.npz')
    target = man(q['vertices'], q['faces'])
    tm = trimesh.Trimesh(q['vertices'], q['faces'], process=False)
    contact = trimesh.proximity.closest_point_naive(tm, np.array([old['contact_mm']]))[0][0]
    shoulder = contact - [0, 0, 1.5]
    end = contact + [0, 0, 0.15]
    flags = []
    if not clear(p[1], shoulder, 0.8):
        flags.append('BEND_CLEARANCE')
    if not clear(shoulder, contact - [0, 0, 0.9], 0.3):
        flags.append('NECK_CLEARANCE')
    overlap = float((capsule(shoulder, end, 0.3) ^ target).volume())
    if overlap <= 1e-06:
        flags.append('CONTACT')
    if shoulder[2] < p[1, 2]:
        flags.append('BEND_CHRONOLOGY')
    directions2 = []
    for el in [-70, -40, 0, 30]:
        for az in np.arange(48) * math.tau / 48:
            directions2.append(np.array([math.cos(math.radians(el)) * math.cos(az), math.cos(math.radians(el)) * math.sin(az), math.sin(math.radians(el))]))
    cut = contact - [0, 0, 0.42]
    tool = next((d for d in directions2 if clear(cut + d * 1.5, cut + d * 260, 0.6)), None)
    withdraw = next((d for d in directions2 if all((clear(v, v + d * 260, 0.8) for v in np.linspace(p[1], shoulder, 5)))), None)
    if tool is None:
        flags.append('TOOL_ACCESS')
    if withdraw is None:
        flags.append('WITHDRAWAL')
    m = union([capsule(p[0], p[1], 0.8), capsule(p[1], shoulder, 0.8), capsule(shoulder, end, 0.3)])
    (D / 'support_overrides').mkdir(exist_ok=True)
    info = store(D / 'support_overrides/T00841.npz', m)
    rec = dict(old)
    rec.update(points_mm=[p[0], p[1], shoulder, end], contact_mm=contact, cut_mm=cut, removal_direction=withdraw, target_first_contact_z_mm=float(contact[2] - 0.15), revision='Retain original main span and brace anchors; add short rising bend to corrected A0341; 0.6mm contact remains1.65mm', bbox_mm=info['bbox_mm'], volume_mm3=info['volume_mm3'])
    save(D / 'support_override.json', dict(record=rec, before=old, contact_displacement_mm=float(np.linalg.norm(contact - old['contact_mm'])), target_overlap_mm3=overlap, tool_direction=tool, withdrawal_direction=withdraw, flags=flags, status='HOLD' if flags else 'GEOMETRY_RECHECKED_NO_SLICE'))
    if not flags:
        selected = set(read(D / 'selected_support_ids.json'))
        selected.add('T00841')
        save(D / 'selected_support_ids.json', sorted(selected))
    print('CONTACT REPAIR', flags, 'overlap', overlap, flush=True)
