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
    changes = read(D / 'changes.json')
    obs = read(V5 / 'data/support_geometry.json')['objects']
    om = {o['id']: o for o in obs}
    selected = set(read(V5 / 'data/selected_support_ids.json'))
    contacts = read(V5 / 'data/contact_removal_audit.json')['contacts']
    changeset = {c['id'] for c in changes}
    changedsolids = {}
    for c in changes:
        q = np.load(D / 'members' / (c['id'] + '.npz'))
        changedsolids[c['id']] = man(q['vertices'], q['faces'])
    touch = []
    held = []
    for o in obs:
        if o['id'] not in selected:
            continue
        bb = np.array(o['bbox_mm'])
        cand = [c for c in changes if np.all(bb[0] <= np.array(c['after']['bbox_mm'])[1]) and np.all(np.array(c['after']['bbox_mm'])[0] <= bb[1])]
        if not cand:
            continue
        q = np.load(V5 / 'data/meshes' / (o['id'] + '.npz'))
        s = man(q['vertices'], q['faces'])
        for c in cand:
            vol = float((s ^ changedsolids[c['id']]).volume())
            if vol > 1e-05:
                intended = c['id'] in [o.get('target'), o.get('anchor')]
                touch.append(dict(support=o['id'], member=c['id'], overlap_mm3=vol, intended=intended))
                if not intended:
                    held.append(dict(id=o['id'], reason='NEW_INTERNAL_COLLISION', member=c['id']))
    rechecks = []
    for i, r in enumerate(contacts):
        id = r['id']
        if id not in selected:
            continue
        o = om[id]
        flags = []
        p = np.array(o['points_mm'])
        for key, cutkey in [('tool_direction', 'cut_mm'), ('anchor_tool_direction', 'anchor_cut_mm')]:
            direction = r.get(key)
            if direction is not None:
                cut = np.array(o[cutkey])
                direction = np.array(direction)
                if not clear(cut + direction * 1.5, cut + direction * 260, 0.6):
                    flags.append(key + '_BLOCKED_ON_REVISED_BODY')
        direction = r.get('withdrawal_direction')
        if direction is not None:
            direction = np.array(direction)
            starts = np.linspace(p[1], p[2], max(3, int(np.linalg.norm(p[2] - p[1])))) if o['kind'] == 'BODY_TO_BODY_TEMPORARY' else p[1:2]
            if any((not clear(start, start + direction * 260, 0.8) for start in starts)):
                flags.append('WITHDRAWAL_BLOCKED_ON_REVISED_BODY')
        for key in ['target', 'anchor']:
            target = o.get(key)
            if target in changeset:
                a, b = p[-2:] if key == 'target' else p[:2]
                volume = float((capsule(a, b, 0.3) ^ changedsolids[target]).volume())
                if volume <= 1e-06:
                    flags.append('REVISED_' + key.upper() + '_CONTACT_LOST')
        rechecks.append(dict(id=id, flags=flags))
        for flag in flags:
            held.append(dict(id=id, reason=flag))
        if i % 300 == 0:
            print('RECHECK', i, len(held), flush=True)
    holdids = {x['id'] for x in held}
    save(D / 'support_recheck.json', dict(exact_intersections_with_revised_members=touch, removal_rechecks=rechecks, new_holds=held, new_hold_ids=sorted(holdids), retained_selected_count=len(selected - holdids), original_V5_selected_count=len(selected), method='Exact updated Permanent / D2 intersections; saved tool and withdrawal paths resampled against rebuilt V6 whole BODY planes; no new support optimization; not physical removal proof'))
    save(D / 'selected_support_ids.json', sorted(selected - holdids))
    print('SUPPORT DONE', len(holdids), flush=True)
