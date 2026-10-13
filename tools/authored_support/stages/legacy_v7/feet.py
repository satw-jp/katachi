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
    import trimesh
    old = read(V5 / 'data/support_geometry.json')['objects']
    selected = set(read(V6 / 'data/selected_support_ids.json'))
    new = read(D / 'scaffold.json')['objects']
    posts = [r for r in old if r['id'] in selected and r['bbox_mm'][0][2] < bed + 0.05 and (r['kind'] in ['EXTERNAL_VERTICAL_SHAFT', 'RETAINED_LOW_D2'])] + [r for r in new if r['kind'] == 'EXTERNAL_VERTICAL_SHAFT']
    fs = read(V2 / 'data/surface.json')['surface']
    ms = read(V6 / 'data/structure.json')['members']
    body = [dict(**f, role='FLOWER') for f in fs if f['bbox_mm'][0][2] < bed + 6] + [dict(**m, role='PERMANENT') for m in ms if m['bbox_mm'][0][2] < bed + 6]
    u = np.load(V2 / 'data/D6_local.npz')
    memo = {}
    (D / 'foot_meshes').mkdir(exist_ok=True)

    def solid(r):
        id = r['id']
        if id not in memo:
            if r['role'] == 'FLOWER':
                memo[id] = man(u['vertices'] @ np.array(r['orientation_matrix']).T * r['physical_scale'] + r['position_mm'], u['faces'])
            else:
                q = np.load(r['mesh_source'])
                memo[id] = man(q['vertices'], q['faces'])
        return memo[id]

    def cylinder(xy, z0, z1, r0, r1=None):
        r1 = r0 if r1 is None else r1
        K = 32
        v = np.array([[xy[0] + r * math.cos(t), xy[1] + r * math.sin(t), z] for z, r in [(z0, r0), (z1, r1)] for t in np.arange(K) * math.tau / K] + [[*xy, z0], [*xy, z1]])
        f = []
        for i in range(K):
            j = (i + 1) % K
            f.extend([[i, j, K + j], [i, K + j, K + i], [2 * K, j, i], [2 * K + 1, K + i, K + j]])
        return man(v, f)
    records = []
    holds = []
    for ix, p in enumerate(posts):
        xy = np.array(p['points_mm'][0])[:2]
        height = float(p['points_mm'][1][2] - bed)
        chosen = None
        for radius in [2.5, 2.25, 2, 1.75, 1.5]:
            for collar in [1.2, 1.1, 0.8] if height >= 7 else [0.8]:
                parts = [cylinder(xy, bed, bed + 0.6, radius)]
                if collar > 0.8:
                    parts += [cylinder(xy, bed + 0.4, bed + 3.0, collar), cylinder(xy, bed + 3.0, bed + 5.0, collar, 0.8)]
                m = union(parts)
                bbox = np.array([[xy[0] - radius, xy[1] - radius, bed], [xy[0] + radius, xy[1] + radius, bed + (5 if collar > 0.8 else 0.6)]])
                near = [r for r in body if np.all(bbox[0] <= np.array(r['bbox_mm'])[1]) and np.all(np.array(r['bbox_mm'])[0] <= bbox[1])]
                bad = []
                for r in near:
                    vol = float((m ^ solid(r)).volume())
                    if vol > 1e-05:
                        bad.append((r['id'], vol))
                if not bad:
                    chosen = (m, radius, collar)
                    break
            if chosen:
                break
        if not chosen:
            holds.append(dict(post=p['id'], reason='No BODY-clear flat foot in tested2.8-5.0mm footprint range'))
            continue
        m, radius, collar = chosen
        id = 'FT_' + p['id']
        info = store(D / 'foot_meshes' / (id + '.npz'), m)
        path = p.get('mesh_source', str(V5 / 'data/meshes' / (p['id'] + '.npz')))
        q = np.load(path)
        overlap = float((m ^ man(q['vertices'], q['faces'])).volume())
        assert overlap > 1e-05
        records.append(dict(id=id, kind='R3_STYLE_FLAT_FOOT', target=p['id'], anchor='BED', pad_diameter_mm=radius * 2, pad_height_mm=0.6, collar_diameter_mm=collar * 2, collar_height_mm=3 if collar > 0.8 else 0, taper_end_height_mm=5 if collar > 0.8 else 0.6, bottom_z_mm=bed, shaft_overlap_mm3=overlap, body_overlap_mm3=0, mesh_source=str(D / 'foot_meshes' / (id + '.npz')), source_principle='Specified R3 actual mesh: flat expanded pad, short basal sleeve, early diagonals; coordinates and counts not copied', **info))
        if ix % 100 == 0:
            print('FEET', ix, len(records), 'HOLD', len(holds), flush=True)
    save(D / 'feet.json', dict(objects=records, holds=holds, rule='Flat5mm starting footprint,.6mm height, local2.4mm collar3mm tall tapering to1.6mm at5mm; small footprints/collars only to avoid actual BODY collisions. Short posts get pads only. No Artwork/Permanent shift. No slicer raft is authored.'))
    print('FEET DONE', len(records), len(holds), flush=True)
