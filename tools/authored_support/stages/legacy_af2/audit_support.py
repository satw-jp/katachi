def run(stage_root):
    import sys, json, functools, time
    from pathlib import Path
    import numpy as np, manifold3d as mf
    R = stage_root
    W = R.parent
    read = lambda p: json.loads(Path(p).read_text(encoding='utf-8-sig'))
    sup = read(W / 'R4_A1_MINI_RELEASE_CANDIDATE/data/support_geometry.json')['objects']
    sb = np.array([r['bbox_mm'] for r in sup])
    old = {r['id']: r for r in read(W / 'R4_A1_MINI_RELEASE_CANDIDATE/data/structure.json')['members']}
    overrides = read(W / 'R4_V8_FABRICATION_EXPORT_GATE/data/mesh_export_overrides.json')

    def man(path):
        q = np.load(path)
        return mf.Manifold(mf.Mesh(q['vertices'].astype(np.float32), q['faces'].astype(np.uint32)))

    @functools.lru_cache(512)
    def sm(i):
        return man(overrides.get(sup[i]['id'], sup[i]['mesh_source']))
    for label, folder in [('A', 'R4_A_SHORT_JOIN_G')]:
        ms = read(W / folder / 'data/structure.json')['members']
        out = R / label / 'data'
        out.mkdir(parents=True, exist_ok=True)
        rows = []
        contacts = []
        n = 0
        start = time.time()
        for ix, m in enumerate(ms):
            b = np.array(m['bbox_mm'])
            near = np.where(np.all(sb[:, 0] <= b[1], axis=1) & np.all(sb[:, 1] >= b[0], axis=1))[0]
            mm = man(m['mesh_source'])
            om = None
            changed = m['id'] not in old or m['mesh_source'] != old[m['id']]['mesh_source']
            for j in near:
                j = int(j)
                s = sup[j]
                v = float((mm ^ sm(j)).volume())
                n += 1
                intended = s.get('target') == m['id'] or s.get('anchor') == m['id']
                if intended:
                    contacts.append(dict(support=s['id'], body=m['id'], overlap_mm3=v, endpoint='target' if s.get('target') == m['id'] else 'anchor'))
                if v > 1e-05 and (not intended) and changed:
                    if om is None and m['id'] in old:
                        om = man(old[m['id']]['mesh_source'])
                    ov = float((om ^ sm(j)).volume()) if om is not None else 0
                    if v > ov + 0.0001:
                        rows.append(dict(support=s['id'], body=m['id'], overlap_mm3=v, old_overlap_mm3=ov))
            nearset = set(near.tolist())
            for j, s in enumerate(sup):
                if j not in nearset and (s.get('target') == m['id'] or s.get('anchor') == m['id']):
                    contacts.append(dict(support=s['id'], body=m['id'], overlap_mm3=0, endpoint='target' if s.get('target') == m['id'] else 'anchor'))
            if ix % 100 == 0:
                print(label, ix, 'pairs', n, 'newhits', len(rows), 'seconds', round(time.time() - start), flush=True)
                (out / 'SUPPORT_COMPATIBILITY_PROGRESS.json').write_text(json.dumps(dict(member=ix, new_collisions=rows, contacts=contacts)), encoding='utf8')
        result = dict(label=label, checked_pairs=n, new_collisions=rows, intended_contacts=contacts, lost_contacts=[c for c in contacts if c['overlap_mm3'] <= 1e-05], scope='All current Permanent vs old Support. Flower unchanged. Existing Support neck/main distinction requires local review; new unintended intersections cannot be accepted by baseline evidence.')
        (out / 'SUPPORT_COMPATIBILITY.json').write_text(json.dumps(result, indent=2), encoding='utf8')
        print('DONE', label, len(rows), 'lost', len(result['lost_contacts']), flush=True)
