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
    old = read(W / 'R4_A1_MINI_RELEASE_CANDIDATE/data/support_geometry.json')['objects']
    overrides = read(W / 'R4_V8_FABRICATION_EXPORT_GATE/data/mesh_export_overrides.json')
    unit = np.load(W / 'R4_D6_SIZE_RHYTHM_V2/data/D6_local.npz')
    fs = read(W / 'R4_D6_SIZE_RHYTHM_V2/data/surface.json')['surface']
    fm = {r['id']: r for r in fs}
    for label, folder in [('A', 'R4_A_SHORT_JOIN_G')]:
        d = R / label / 'data'
        (d / 'repair_meshes').mkdir(exist_ok=True)
        ms = read(W / folder / 'data/structure.json')['members']
        mm = {m['id']: m for m in ms}
        body = fs + ms
        boxes = np.array([m['bbox_mm'] for m in body])
        ids = {m['id']: i for i, m in enumerate(body)}
        audit = read(d / 'SUPPORT_COMPATIBILITY.json')
        bad = {r['support'] for r in audit['lost_contacts']}
        coll = {r['support'] for r in audit['new_collisions']}
        records = []
        review = []
        repairs = []

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
            if s['id'] not in bad | coll:
                records.append(s)
                continue
            p = np.array(s['points_mm'], float)
            isbody = s['kind'] == 'BODY_TO_BODY_TEMPORARY'
            main = capsule(*(p[1:3] if isbody else p[:2]), 0.8)
            if s.get('exact_main_mesh_source'):
                q = np.load(s['exact_main_mesh_source'])
                main = man(q['vertices'], q['faces'])
            mh = hits(main)
            oldhits = [r for r in audit['new_collisions'] if r['support'] == s['id']]
            newmain = [h for h in mh if any((h['id'] == r['body'] for r in oldhits))]
            if newmain:
                review.append(dict(id=s['id'], reason='NEW_MAIN_BODY_INTERSECTION', hits=newmain))
                records.append(s)
                continue
            changes = []
            failed = []
            for endpoint in ([('anchor', 0, 1)] if isbody else []) + [('target', len(p) - 1, len(p) - 2)]:
                role, tip, base = endpoint
                id = s[role]
                if id not in ids:
                    continue
                if float((capsule(p[base], p[tip], 0.3) ^ solid(id)).volume()) > 1e-05:
                    continue
                tm = mesh(id).copy()
                tm.update_faces(tm.area_faces > 1e-10)
                point, dist, face = trimesh.proximity.closest_point_naive(tm, p[tip:tip + 1] if tip >= 0 else p[tip:])
                target = point[0]
                normal = tm.face_normals[face[0]]
                newtip = target - normal * 0.25
                length = float(np.linalg.norm(newtip - p[base]))
                if length > 2.5:
                    failed.append(dict(endpoint=role, target=id, gap_mm=float(dist[0]), required_neck_length_mm=length))
                    continue
                p[tip] = newtip
                changes.append(dict(endpoint=role, target=id, contact_mm=target.tolist(), cut_mm=(target + normal * 0.45).tolist(), length_mm=length))
            if failed:
                review.append(dict(id=s['id'], reason='SHORT_NECK_REPAIR_NOT_POSSIBLE', details=failed))
                records.append(s)
                continue
            parts = [capsule(p[0], p[1], 0.3), main, capsule(p[2], p[3], 0.3)] if isbody else [main, capsule(p[1], p[2], 0.3)]
            m = union(parts)
            if m.is_empty() or m.volume() <= 0:
                review.append(dict(id=s['id'], reason='REPAIR_MESH_INVALID'))
                records.append(s)
                continue
            r = dict(s)
            r.update(points_mm=p.tolist(), revision='P10 short sacrificial contact retargeting; main retained', additional_sacrificial_contacts=[x for x in hits(m) if x['id'] not in [s['target'], s['anchor']]])
            for change in changes:
                prefix = 'anchor_' if change['endpoint'] == 'anchor' else ''
                r[prefix + 'contact_mm'] = change['contact_mm']
                r[prefix + 'cut_mm'] = change['cut_mm']
            if changes:
                path = d / 'repair_meshes' / (s['id'] + '.npz')
                r.update(store(path, m), mesh_source=str(path.resolve()))
                repairs.append(dict(id=s['id'], changes=changes))
            records.append(r)
            if oldhits:
                r['new_contact_scope'] = 'Additional contacts confined to sacrificial necks; main has no new BODY collision'
        (d / 'SUPPORT_CONTACT_REPAIR.json').write_text(json.dumps(dict(repairs=repairs, unresolved=review), indent=2), encoding='utf8')
        (d / 'support_stage1.json').write_text(json.dumps(dict(objects=records)), encoding='utf8')
        print(label, 'repaired', len(repairs), 'unresolved', len(review), flush=True)
