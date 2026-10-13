def run(stage_root):
    import sys, json, functools
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
    unit = np.load(W / 'R4_D6_SIZE_RHYTHM_V2/data/D6_local.npz')
    fs = read(W / 'R4_D6_SIZE_RHYTHM_V2/data/surface.json')['surface']
    fm = {r['id']: r for r in fs}
    for label, folder in [('A', 'R4_A_SHORT_JOIN_G')]:
        d = R / label / 'data'
        ms = read(W / folder / 'data/structure.json')['members']
        mm = {m['id']: m for m in ms}
        body = fs + ms
        boxes = np.array([m['bbox_mm'] for m in body])
        ids = {m['id']: i for i, m in enumerate(body)}
        audit = read(d / 'SUPPORT_CONTACT_REPAIR.json')
        bad = {r['id']: r for r in audit['unresolved']}
        old = read(d / 'support_stage1.json')['objects']
        records = []
        fix = []
        hold = []

        @functools.lru_cache(256)
        def mesh(id):
            if id in fm:
                f = fm[id]
                v = unit['vertices'] @ np.array(f['orientation_matrix']).T * f['physical_scale'] + f['position_mm']
                faces = unit['faces']
            else:
                q = np.load(mm[id]['mesh_source'])
                v = q['vertices']
                faces = q['faces']
            return trimesh.Trimesh(v, faces, process=False)

        @functools.lru_cache(256)
        def solid(id):
            m = mesh(id)
            return man(m.vertices, m.faces)

        def hits(m):
            v = m.to_mesh().vert_properties[:, :3]
            js = np.where(np.all(boxes[:, 0] <= v.max(0), axis=1) & np.all(boxes[:, 1] >= v.min(0), axis=1))[0]
            out = []
            for j in js:
                vol = float((m ^ solid(body[j]['id'])).volume())
                if vol > 1e-05:
                    out.append(dict(id=body[j]['id'], volume_mm3=vol))
            return out
        for s in old:
            if s['id'] not in bad:
                records.append(s)
                continue
            p = np.array(s['points_mm'], float)
            isbody = s['kind'] == 'BODY_TO_BODY_TEMPORARY'
            main = capsule(*(p[1:3] if isbody else p[:2]), 0.8)
            extensions = []
            changes = []
            failed = []
            if bad[s['id']]['reason'] == 'NEW_MAIN_BODY_INTERSECTION':
                hold.append(bad[s['id']])
                records.append(s)
                continue
            for role, tip, base in ([('anchor', 0, 1)] if isbody else []) + [('target', len(p) - 1, len(p) - 2)]:
                id = s[role]
                if id not in ids or float((capsule(p[base], p[tip], 0.3) ^ solid(id)).volume()) > 1e-05:
                    continue
                tm = mesh(id).copy()
                tm.update_faces(tm.area_faces > 1e-10)
                point, dist, face = trimesh.proximity.closest_point_naive(tm, p[tip:tip + 1])
                target = point[0]
                normal = tm.face_normals[face[0]]
                newbase = target + normal * 1.45
                newtip = target - normal * 0.25
                if np.linalg.norm(newbase - p[base]) > 8:
                    failed.append('EXTENSION_OVER_8MM')
                    continue
                extension = capsule(p[base], newbase, 0.8)
                if hits(extension):
                    failed.append('EXTENSION_COLLISION')
                    continue
                extensions.append(extension)
                p[base] = newbase
                p[tip] = newtip
                changes.append(dict(endpoint=role, target=id, contact_mm=target.tolist(), cut_mm=(target + normal * 0.45).tolist()))
            if failed:
                hold.append(dict(id=s['id'], reason='MAIN_EXTENSION_HOLD', details=failed))
                records.append(s)
                continue
            main = union([main] + extensions)
            parts = [capsule(p[0], p[1], 0.3), main, capsule(p[2], p[3], 0.3)] if isbody else [main, capsule(p[1], p[2], 0.3)]
            m = union(parts)
            r = dict(s)
            r.update(points_mm=p.tolist(), revision='P10 local thick main extension, short sacrificial neck; old main/bracing retained')
            for c in changes:
                prefix = 'anchor_' if c['endpoint'] == 'anchor' else ''
                r[prefix + 'contact_mm'] = c['contact_mm']
                r[prefix + 'cut_mm'] = c['cut_mm']
            path = d / 'repair_meshes' / (s['id'] + '_END.npz')
            mp = d / 'repair_meshes' / (s['id'] + '_MAIN.npz')
            store(mp, main)
            r.update(store(path, m), mesh_source=str(path.resolve()), exact_main_mesh_source=str(mp.resolve()))
            records.append(r)
            fix.append(dict(id=s['id'], changes=changes))
        (d / 'SUPPORT_MAIN_END_REPAIR.json').write_text(json.dumps(dict(repairs=fix, unresolved=hold), indent=2), encoding='utf8')
        (d / 'support_stage2.json').write_text(json.dumps(dict(objects=records)), encoding='utf8')
        print(label, 'fixed', len(fix), 'HOLD', len(hold), flush=True)
