"""Source-faithful V5 stage. Caller must provide an isolated scratch tree.
Original algorithm: brace_network.py; no source-script runtime execution.
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
    r = read(D / 'routes_initial.json')
    cols = {x['id']: x for x in r['columns']}
    routes = r['routes']
    braces = []
    holds = []
    pairs = set()
    base = list(cols.values())
    coords = np.array([x['xy_mm'] for x in base])
    kt = cKDTree(coords)
    domain = np.load(V3 / 'data/host_domain.npz')
    hf = domain['field']
    ho = domain['origin']
    hp = float(domain['pitch'])

    def external_column(xy, top):
        pts = np.c_[np.tile(xy, (max(2, int((top - bed) / 1.5)), 1)), np.linspace(bed + 1.2, top, max(2, int((top - bed) / 1.5)))]
        dep = ndi.map_coordinates(hf, ((pts - ho) / hp).T, order=1, mode='constant', cval=-100)
        return np.max(dep) < 0 and clear(pts[0], pts[-1], 1.1)
    for c in base:
        h = c['top_z_mm']
        c['nominal_diameter_mm'] = 1.6
        c['lower_local_diameter_mm'] = 2.2 if h - bed > 70 and len(c['contact_routes']) >= 2 else 1.6
        c['lower_reinforcement_height_mm'] = 12 if c['lower_local_diameter_mm'] > 1.6 else 0
        if h - bed < 12:
            continue
        buddy = None
        for j in np.atleast_1d(kt.query(c['xy_mm'], k=10)[1]):
            other = base[int(j)]
            dist = np.linalg.norm(np.array(c['xy_mm']) - other['xy_mm'])
            if other['id'] == c['id'] or not 2 < dist < 7.3:
                continue
            if other['top_z_mm'] < h and (not external_column(other['xy_mm'], h)):
                continue
            other['top_z_mm'] = max(other['top_z_mm'], h)
            buddy = other
            break
        if buddy is None:
            for angle in np.arange(16) * math.tau / 16:
                xy = np.array(c['xy_mm']) + [3.6 * math.cos(angle), 3.6 * math.sin(angle)]
                if np.any(np.abs(xy) > 123) or not external_column(xy, h):
                    continue
                id = 'Q' + c['id'][1:]
                buddy = dict(id=id, xy_mm=xy, top_z_mm=h, contact_routes=[], nominal_diameter_mm=1.6, lower_local_diameter_mm=2.2 if h - bed > 70 else 1.6, lower_reinforcement_height_mm=12 if h - bed > 70 else 0, reason='external near-vertical buddy to make early and intermediate braces effective')
                cols[id] = buddy
                break
        if buddy is None:
            holds.append(dict(id=c['id'], reason='No exterior brace buddy; long unbraced shaft', free_length_mm=h - bed))
            continue
        pair = tuple(sorted([c['id'], buddy['id']]))
        if pair in pairs:
            continue
        pairs.add(pair)
        distance = np.linalg.norm(np.array(c['xy_mm']) - buddy['xy_mm'])
        rise = max(5.0, distance * 1.35)
        levels = list(np.arange(bed + rise + 1.2, h - 0.5, 16.0))
        levels.append(h - 0.5)
        for z in levels:
            if z - bed < rise + 1.0:
                continue
            for a, b in [(c, buddy), (buddy, c)]:
                start = np.r_[a['xy_mm'], z - rise]
                end = np.r_[b['xy_mm'], z]
                if clear(start, end):
                    braces.append(dict(id=f'X{len(braces):05d}', kind='EARLY_AND_INTERMEDIATE_SHAFT_BRACE', anchor=a['id'], target=b['id'], points_mm=[start, end], diameter_mm=1.6, anchor_effective_z_mm=float(start[2] - 0.8), brace_effective_z_mm=float(end[2] + 0.8), reason='Both vertical shafts grow from bed; rising diagonal installed before next16mm free segment. No horizontal floating rung.'))
                else:
                    holds.append(dict(id=c['id'], reason='brace BODY-clearance failure', z_mm=float(z)))
    values = list(cols.values())
    tree = cKDTree([x['xy_mm'] for x in values])
    for t in routes:
        a, b = np.array(t['points_mm'][:2])
        L = np.linalg.norm(b - a)
        if L < 16:
            continue
        for fraction in [0.4, 0.75]:
            target = a * (1 - fraction) + b * fraction
            chosen = None
            for j in np.atleast_1d(tree.query(target[:2], k=12)[1]):
                c = values[int(j)]
                dist = np.linalg.norm(np.array(c['xy_mm']) - target[:2])
                start_z = target[2] - max(2, dist * 1.35)
                if start_z < bed + 1 or start_z > c['top_z_mm'] - 0.5 or dist > 15:
                    continue
                start = np.r_[c['xy_mm'], start_z]
                if np.linalg.norm(start - a) < 1.2 or not clear(start, target):
                    continue
                chosen = (c, start)
                break
            if chosen:
                c, start = chosen
                braces.append(dict(id=f'X{len(braces):05d}', kind='UPPER_BRANCH_BRACE', anchor=c['id'], target=t['id'], points_mm=[start, target], diameter_mm=1.6, anchor_effective_z_mm=float(start[2] - 0.8), brace_effective_z_mm=float(target[2] + 0.8), reason='Earlier vertical shaft supports growing long diagonal at an intermediate point.'))
            else:
                holds.append(dict(id=t['id'], reason='long diagonal brace position unserved', fraction=fraction, position_mm=target.tolist()))
    for c in cols.values():
        c.setdefault('nominal_diameter_mm', 1.6)
        c.setdefault('lower_local_diameter_mm', 1.6)
        c.setdefault('lower_reinforcement_height_mm', 0)
    save(D / 'brace_network.json', dict(columns=list(cols.values()), braces=braces, holds=holds, rule='External paired shafts; rising1.6mm braces, first~6-11mm and16mm growth intervals; selected tall loaded feet2.2mm for first12mm only. Not physical/slice verification.'))
    print('BRACES', len(braces), 'COLUMNS', len(cols), 'HOLD', len(holds), flush=True)
