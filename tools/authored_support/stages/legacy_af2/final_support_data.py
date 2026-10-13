def run(stage_root):
    import json
    from pathlib import Path
    R = stage_root
    read = lambda p: json.loads(Path(p).read_text(encoding='utf8'))
    fs = {r['id'] for r in read(R.parent / 'R4_D6_SIZE_RHYTHM_V2/data/surface.json')['surface']}
    for label in ['A']:
        d = R / label / 'data'
        st = read(d / 'support_geometry.json')
        removed = [r for r in st['objects'] if r['id'] == 'X03795']
        st['objects'] = [r for r in st['objects'] if r['id'] != 'X03795']
        st['deleted'] += [dict(id=r['id'], target=r['target'], anchor=r['anchor'], reason='Inherited free brace points to absent T01268; leaf removed, shaft and useful contacts retained') for r in removed]
        ids = fs | {r['id'] for r in read(d / 'structure.json')['members'] + st['objects']} | {'BED'}
        bad = [(r['id'], role, r[role]) for r in st['objects'] for role in ['target', 'anchor'] if isinstance(r.get(role), str) and r[role] not in ids]
        assert not bad, bad
        for r in st['objects']:
            if r['kind'] == 'BODY_TO_BODY_TEMPORARY':
                for key in ['anchor_status', 'anchor_evidence', 'anchor_rooted_probe_mm']:
                    if key in r:
                        r['historical_' + key] = r.pop(key)
                r['current_chronology'] = 'See current BODY_ANCHOR_HEIGHT_SCREEN; historical V3/V6 rooted claims are not current print evidence'
        (d / 'support_geometry.json').write_text(json.dumps(st), encoding='utf8')
        a = read(d / 'ASSEMBLY.json')
        a['support_objects'] = len(st['objects'])
        a['removed_obsolete_contacts'] = st['deleted']
        (d / 'ASSEMBLY.json').write_text(json.dumps(a, indent=2), encoding='utf8')
        (d / 'REFERENCE_INTEGRITY.json').write_text(json.dumps(dict(missing_anchor_or_target_ids=bad, support_count=len(st['objects']), permanent_changed=False), indent=2), encoding='utf8')
    print('FINAL SUPPORT DATA')
