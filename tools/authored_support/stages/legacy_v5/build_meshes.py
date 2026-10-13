"""Source-faithful V5 stage. Caller must provide an isolated scratch tree.
Original algorithm: build_meshes.py; no source-script runtime execution.
"""
def run(stage_root):
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
    from pathlib import Path
    import json, shutil, collections
    R = stage_root
    D = R / 'data'
    V3 = R.parent / 'R4_V2_INTERNAL_PROPOSAL_V3'
    V2 = R.parent / 'R4_D6_SIZE_RHYTHM_V2'
    V4 = R.parent / 'R4_V2_V3_A1_EXPERIMENTAL_V4'

    def read(p):
        return json.loads(Path(p).read_text(encoding='utf-8-sig'))

    def save(p, x):
        Path(p).write_text(json.dumps(x, ensure_ascii=False, indent=2, default=lambda a: a.tolist() if hasattr(a, 'tolist') else str(a)), encoding='utf-8')
    route = read(D / 'routes_initial.json')
    network = read(D / 'brace_network.json')
    body = read(D / 'body_links.json')['routes'] + read(D / 'body_surface_links.json')['routes']
    bed = read(V3 / 'data/structure.json')['bed_z_mm']
    ledger = []

    def add(record, parts):
        mesh = union(parts)
        record.update(store(D / 'meshes' / (record['id'] + '.npz'), mesh))
        ledger.append(record)
    for c in network['columns']:
        xy = c['xy_mm']
        bottom = np.r_[xy, bed + 0.8]
        top = np.r_[xy, max(bed + 0.81, c['top_z_mm'])]
        parts = [capsule(bottom, top, 0.8)]
        if c['lower_local_diameter_mm'] > 1.6:
            parts.append(capsule(np.r_[xy, bed + 1.1], np.r_[xy, min(bed + 12, top[2])], 1.1))
        add(dict(**c, kind='EXTERNAL_VERTICAL_SHAFT', anchor='BED', points_mm=[bottom, top], target=c['contact_routes'], removal_direction='outward after contacts detached; cut scaffold into height/azimuth panels', cutting_access='Exterior scaffold; joint cuts required, detailed order in removal ledger'), parts)
    for b in network['braces']:
        add(dict(**b, removal_direction='outward with exterior shaft panel after BODY neck release', cutting_access='Exterior shaft/branch junctions'), [capsule(*b['points_mm'], 0.8)])
    print('SHAFTS AND BRACES', len(ledger), flush=True)
    for r in route['routes'] + body:
        p = np.array(r['points_mm'])
        if r['kind'] == 'EXTERNAL_SHAFT_BRANCH':
            parts = [capsule(p[0], p[1], 0.8), capsule(p[1], p[2], 0.3)]
        else:
            parts = [capsule(p[0], p[1], 0.3), capsule(p[1], p[2], 0.8), capsule(p[2], p[3], 0.3)]
        add(dict(**r, cutting_access='pending actual section-mask tool approach audit'), parts)
        if len(ledger) % 250 == 0:
            print('CONTACT MESH', len(ledger), flush=True)
    for r in read(V4 / 'data/additions.json')['D2']:
        if r['id'] not in route['V4_retained_ids']:
            continue
        id = 'V4_' + r['id']
        p = V4 / ('data/D2/' + r['id'] + '.npz')
        shutil.copyfile(p, D / 'meshes' / (id + '.npz'))
        q = np.load(p)
        rec = dict(**r)
        rec.update(id=id, kind='RETAINED_LOW_D2', source_id=r['id'], source=str(p), vertices=len(q['vertices']), faces=len(q['faces']))
        ledger.append(rec)
    save(D / 'support_geometry.json', dict(objects=ledger, count=len(ledger), parts_by_kind=collections.Counter((x['kind'] for x in ledger)), support_only=True, permanent_modified=False, V4_D1_carried=False, source_geometry='V2 frozen FLOWER + unmodified V3 Permanent', status='AUTHORED D2 visual review only; no slice; risks remain'))
    print('SUPPORT MESHES', len(ledger), flush=True)
