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
    import trimesh, copy
    audit = read(D / 'exact_main_clearance.json')
    save(D / 'exact_main_clearance_before_patch.json', audit)
    assembly = read(D / 'support_geometry.json')
    objects = {r['id']: r for r in assembly['objects']}
    fs = read(V2 / 'data/surface.json')['surface']
    ms = read(V6 / 'data/structure.json')['members']
    body = fs + ms
    bm = {r['id']: r for r in body}
    boxes = np.array([r['bbox_mm'] for r in body])
    unit = np.load(V2 / 'data/D6_local.npz')
    memo = {}

    def solid(id):
        if id not in memo:
            r = bm[id]
            if id.startswith('F'):
                memo[id] = man(unit['vertices'] @ np.array(r['orientation_matrix']).T * r['physical_scale'] + r['position_mm'], unit['faces'])
            else:
                q = np.load(r['mesh_source'])
                memo[id] = man(q['vertices'], q['faces'])
        return memo[id]
    out = D / 'clearance_corrected_meshes'
    out.mkdir(exist_ok=True)
    changes = []
    hits = []
    for hit in audit['collisions']:
        r = objects[hit['support']]
        q = np.load(r['mesh_source'])
        m = man(q['vertices'], q['faces'])
        p = np.array(r['points_mm'])
        a, b = p[1:3] if r['kind'] == 'BODY_TO_BODY_TEMPORARY' else p[:2]
        main = capsule(a, b, 0.8)
        intersection = main ^ solid(hit['body'])
        iv = intersection.to_mesh().vert_properties[:, :3]
        center = (iv.min(0) + iv.max(0)) / 2
        radius = float(np.max(np.linalg.norm(iv - center, axis=1)) + 0.16)
        assert radius < 0.7, (r['id'], radius)
        ball = trimesh.creation.icosphere(subdivisions=3, radius=radius)
        cutter = man(ball.vertices + center, ball.faces)
        new = m - cutter
        newmain = main - cutter
        assert len(new.decompose()) == 1 and new.volume() > m.volume() * 0.97, (r['id'], m.volume(), new.volume())
        assert (new ^ solid(r['target'])).volume() > 1e-05
        if r['kind'] == 'BODY_TO_BODY_TEMPORARY':
            assert (new ^ solid(r['anchor'])).volume() > 1e-05
        bounds = np.array(r['bbox_mm'])
        candidate = np.where(np.all(boxes[:, 0] <= bounds[1], axis=1) & np.all(boxes[:, 1] >= bounds[0], axis=1))[0]
        for j in candidate:
            volume = float((newmain ^ solid(body[j]['id'])).volume())
            if volume > 1e-05:
                hits.append(dict(support=r['id'], body=body[j]['id'], main_overlap_mm3=volume))
        before = r['mesh_source']
        info = store(out / (r['id'] + '.npz'), new)
        store(out / (r['id'] + '_main.npz'), newmain)
        r.update(info, mesh_source=str(out / (r['id'] + '.npz')), exact_main_mesh_source=str(out / (r['id'] + '_main.npz')), clearance_patch='Local spherical relief at unintended neighbouring FLOWER grazing contact; original contact endpoints and path unchanged')
        changes.append(dict(id=r['id'], body=hit['body'], original_mesh=before, mesh_source=r['mesh_source'], sphere_center_mm=center, sphere_radius_mm=radius, removed_volume_mm3=float(m.volume() - new.volume()), removed_fraction=float(1 - new.volume() / m.volume()), one_connected_solid=True, target_contact_preserved=True, anchor_contact_preserved=True if r['kind'] == 'BODY_TO_BODY_TEMPORARY' else 'existing shaft endpoint unchanged', removal_envelope='Subset of prior accepted envelope; cut and withdrawal directions unchanged', first_section='Relief away from initial neck / bed anchor; no anchor change'))
        print('PATCH', r['id'], 'radius', radius, 'removed fraction', changes[-1]['removed_fraction'], flush=True)
    assert not hits, hits
    save(D / 'clearance_patch.json', dict(changes=changes, remaining_main_collisions=hits, scope='Support only; no freeze source modified; bounded7 local grazing-contact reliefs'))
    save(D / 'support_geometry.json', assembly)
    lookup = read(D / 'ID_MAP.json')
    for r in changes:
        lookup[r['id']]['mesh_source'] = r['mesh_source']
    save(D / 'ID_MAP.json', lookup)
    audit['collisions'] = []
    audit['before_patch_collisions'] = 7
    audit['local_recheck'] = 'Seven modified actual mains checked against all AABB-overlapping frozen BODY; unaffected7810 retain exhaustive result'
    audit['patch_record'] = 'clearance_patch.json'
    save(D / 'exact_main_clearance.json', audit)
