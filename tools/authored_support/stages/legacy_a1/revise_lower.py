def run(stage_root):
    import sys, json, math, hashlib, time
    from pathlib import Path
    R = stage_root
    D = R / 'data'
    P = R.parent
    V7 = P / 'R4_V7_STRONG_SUPPORT_GATE'
    V8 = P / 'R4_V8_FABRICATION_EXPORT_GATE'
    from ..legacy_v7.context import make_context
    _context = make_context(V7)
    clear, void_clear, depth, bed = [_context[k] for k in ['clear', 'void_clear', 'depth', 'bed']]
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
    from scipy.spatial import cKDTree
    read = lambda p: json.loads(Path(p).read_text(encoding='utf-8-sig'))
    save = lambda p, x: Path(p).write_text(json.dumps(x, indent=2, default=lambda a: a.tolist() if hasattr(a, 'tolist') else str(a)), encoding='utf8')
    (D / 'meshes').mkdir(exist_ok=True)
    old = read(V7 / 'data/support_geometry.json')['objects']
    byid = {r['id']: r for r in old}
    overrides = read(V8 / 'data/mesh_export_overrides.json')
    memo = {}

    def solid(r):
        if r['id'] not in memo:
            q = np.load(overrides.get(r['id'], r['mesh_source']))
            memo[r['id']] = man(q['vertices'], q['faces'])
        return memo[r['id']]
    body = read(P / 'R4_V6_INTERNAL_ENVELOPE_REVIEW/data/structure.json')['members'] + read(P / 'R4_D6_SIZE_RHYTHM_V2/data/surface.json')['surface']
    u = np.load(P / 'R4_D6_SIZE_RHYTHM_V2/data/D6_local.npz')
    bl = np.array([x['bbox_mm'][0] for x in body])
    bh = np.array([x['bbox_mm'][1] for x in body])
    bm = {}

    def body_solid(j):
        r = body[j]
        if j not in bm:
            if 'physical_scale' in r:
                bm[j] = man(u['vertices'] @ np.array(r['orientation_matrix']).T * r['physical_scale'] + r['position_mm'], u['faces'])
            else:
                bm[j] = solid(r)
        return bm[j]

    def body_clear(m):
        q = m.to_mesh().vert_properties[:, :3]
        lo = q.min(0)
        hi = q.max(0)
        js = np.where(np.all(bl <= hi, axis=1) & np.all(bh >= lo, axis=1))[0]
        return all((float((m ^ body_solid(int(j))).volume()) <= 1e-05 for j in js))

    def cylinder(xy, z0, z1, r0, r1):
        k = 32
        v = np.array([[*np.array(xy) + r * np.array([math.cos(t), math.sin(t)]), z] for z, r in [(z0, r0), (z1, r1)] for t in np.arange(k) * math.tau / k] + [[*xy, z0], [*xy, z1]])
        f = []
        for i in range(k):
            j = (i + 1) % k
            f.extend([[i, j, k + j], [i, k + j, k + i], [2 * k, j, i], [2 * k + 1, k + i, k + j]])
        return man(v, f)
    cols = [r for r in old if r['kind'] == 'EXTERNAL_VERTICAL_SHAFT' and r['points_mm'][1][2] > bed + 20]
    cols.sort(key=lambda x: x['id'])
    tree = cKDTree([r['points_mm'][0][:2] for r in cols])
    added = []
    held = []

    def commit(m, r):
        info = store(D / 'meshes' / (r['id'] + '.npz'), m)
        r.update(info, mesh_source=str((D / 'meshes' / (r['id'] + '.npz')).resolve()), revision='R9 additive lower Support only', body_overlap_mm3=0)
        added.append(r)
    for c in cols:
        xy = c['points_mm'][0][:2]
        m = union([cylinder(xy, bed + 0.5, bed + 8, 1.4, 1.4), cylinder(xy, bed + 8, bed + 12, 1.4, 0.8)])
        if not body_clear(m):
            held.append(dict(id=c['id'], type='COLLAR', reason='BODY clearance: retain existing collar'))
            continue
        foot = byid['FT_' + c['id']]
        v1 = float((m ^ solid(c)).volume())
        v2 = float((m ^ solid(foot)).volume())
        assert min(v1, v2) > 1e-05
        commit(m, dict(id='LC_' + c['id'], kind='LOWER_LOCAL_SLEEVE', anchor=foot['id'], target=c['id'], points_mm=[[*xy, bed + 0.5], [*xy, bed + 12]], diameter_mm=2.8, taper_to_diameter_mm=1.6, contact_volumes_mm3=[v2, v1], removal_direction='same exterior shaft panel; retained 5mm footprint', cutting_access='cut shaft above sleeve after BODY contacts detached', growth='bed foot overlaps sleeve at initial 0.5mm; vertical then inward taper'))
    degree = {c['id']: 0 for c in cols}
    pairs = []
    seen = set()
    for c in cols:
        if degree[c['id']] >= 2:
            continue
        for j in np.atleast_1d(tree.query(c['points_mm'][0][:2], k=min(18, len(cols)))[1]):
            b = cols[int(j)]
            key = tuple(sorted([c['id'], b['id']]))
            dist = np.linalg.norm(np.array(c['points_mm'][0][:2]) - b['points_mm'][0][:2])
            if key in seen or c is b or (not 2.5 < dist <= 12) or (degree[b['id']] >= 3):
                continue
            seen.add(key)
            rise = max(4, 1.5 * dist)
            candidates = []
            for z0 in [bed + 1.2, bed + 13.2, bed + 25.2]:
                z1 = z0 + rise
                if z1 + 0.8 > min(bed + 40, c['points_mm'][1][2], b['points_mm'][1][2]):
                    continue
                for a, t in [(c, b), (b, c)]:
                    start = np.r_[a['points_mm'][0][:2], z0]
                    end = np.r_[t['points_mm'][0][:2], z1]
                    if not clear(start, end, 0.8) or not void_clear(start, end, 0.8):
                        continue
                    m = capsule(start, end, 0.8)
                    if not body_clear(m):
                        continue
                    vols = [float((m ^ solid(x)).volume()) for x in [a, t]]
                    if min(vols) <= 1e-05:
                        continue
                    mid = (start + end) / 2
                    rad = np.r_[mid[:2], 0.0]
                    rad = rad / max(np.linalg.norm(rad), 1e-09)
                    direction = None
                    for vec in [rad, np.array([rad[1], -rad[0], 0]), -np.array([rad[1], -rad[0], 0]), np.array([0, 0, 1.0])]:
                        if clear(mid, mid + vec * 8, 1.2):
                            direction = vec
                            break
                    if direction is None:
                        continue
                    candidates.append((m, dict(id=f'LB_{len(added) + len(candidates):05d}', kind='LOWER_RISING_SCAFFOLD_BRACE', anchor=a['id'], target=t['id'], points_mm=[start, end], diameter_mm=1.6, horizontal_run_mm=float(dist), rise_mm=float(rise), first_center_height_mm=float(z0 - bed), effective_height_mm=float(z1 + 0.8 - bed), contact_volumes_mm3=vols, removal_direction=direction, cutting_access='exterior panel first; cut both shaft junctions; snip brace into <=3mm fragments where crowded', removal_probe='1.2mm radius at midpoint / 8mm outward sweep BODY raster; temporary neighbors removed first', growth='lower endpoint overlaps bed-rooted shaft, ascending to independently bed-rooted target; no horizontal air-born rung')))
            if candidates:
                for m, r in candidates:
                    commit(m, r)
                pairs.append(key)
                degree[c['id']] += 1
                degree[b['id']] += 1
            if degree[c['id']] >= 2:
                break
        print('SHAFT', c['id'], 'added', len(added), 'pairs', len(pairs), flush=True)

    def stats(seq):
        vals = []
        for c in cols:
            z = []
            for r in seq:
                if 'BRACE' not in r['kind'] or 'points_mm' not in r:
                    continue
                if r.get('target') == c['id']:
                    z.append(r['points_mm'][-1][2] + 0.8 - bed)
                if r.get('anchor') == c['id']:
                    z.append(r['points_mm'][0][2] + 0.8 - bed)
            vals.append(dict(id=c['id'], shaft_height_mm=c['points_mm'][-1][2] - bed, first_lateral_junction_height_mm=min(z) if z else None))
        return vals
    save(D / 'lower_revision.json', dict(added=added, held=held, changed_originals=[], removed_originals=[], pairs=pairs, baseline=stats(old), revised=stats(old + added), degree=degree, parameters=dict(sleeve_diameter_mm=2.8, sleeve_straight_height_mm=8, sleeve_taper_end_mm=12, brace_diameter_mm=1.6, max_neighbor_distance_mm=12, minimum_rise_per_horizontal=1.5, max_added_height_mm=40, mini_scale=0.7333333333333333), physical_status='Experimental response to Author lower-support observation; static photos do not prove vibration cause or success'))
    save(D / 'support_geometry.json', dict(objects=old + added, baseline_count=len(old), added_count=len(added), unchanged_originals=True, all_world_coordinates_mm=True, body_changed=False))
    print('DONE', len(added), 'HELD', len(held), flush=True)
