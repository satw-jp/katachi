def run(stage_root):
    import json, hashlib, shutil
    from pathlib import Path
    import numpy as np
    R = stage_root
    W = R.parent
    read = lambda p: json.loads(Path(p).read_text(encoding='utf-8-sig'))
    add = read(R / 'data/LOWER_SUPPORT_REVISION.json')['added'] + read(R / 'data/LOWER_BRACES.json')['objects']
    locks = []
    for label, folder in [('A', 'R4_A_SHORT_JOIN_G')]:
        out = R / label
        d = out / 'data'
        for n in ['blend', 'export', 'preview', 'cli/profiles', 'delivery']:
            (out / n).mkdir(parents=True, exist_ok=True)
        p = W / folder / 'data/structure.json'
        shutil.copyfile(p, d / 'structure.json')
        locks.append(dict(label=label, source=str(p), sha256=hashlib.sha256(p.read_bytes()).hexdigest()))
        a = read(d / 'support_stage2.json')['objects']
        removed = {r['id'] for r in read(d / 'SUPPORT_MAIN_END_REPAIR.json')['unresolved']}
        assert all((r['kind'] == 'BODY_TO_BODY_TEMPORARY' for r in a if r['id'] in removed))
        assert not any((r.get('anchor') in removed for r in a))
        deleted = [dict(id=r['id'], target=r['target'], anchor=r['anchor'], remaining_direct_target_contacts=sum((x.get('target') == r['target'] and x['id'] not in removed for x in a)), reason='Obsolete temporary path newly intersects changed Permanent; remove rather than preserve an unintended rigid fusion') for r in a if r['id'] in removed]
        a = [r for r in a if r['id'] not in removed] + add
        (d / 'support_geometry.json').write_text(json.dumps(dict(objects=a, deleted=deleted, source_support='R9/RC', source_permanent=folder, flower_frozen=True, permanent_changed=False)), encoding='utf8')
        boxes = np.array([r['bbox_mm'] for r in a] + [r['bbox_mm'] for r in read(d / 'structure.json')['members']] + [r['bbox_mm'] for r in read(W / 'R4_D6_SIZE_RHYTHM_V2/data/surface.json')['surface']])
        lo = boxes[:, 0].min(0)
        hi = boxes[:, 1].max(0)
        T = np.r_[128 - (lo[:2] + hi[:2]) / 2, -lo[2]]
        (d / 'ASSEMBLY.json').write_text(json.dumps(dict(label=label, support_objects=len(a), new_objects=len(add), removed_obsolete_contacts=deleted, bounds_mm=[lo.tolist(), hi.tolist()], dimensions_mm=(hi - lo).tolist(), common_plate_translation_mm=T.tolist(), uniform_scale=1, plate_size_mm=[256, 256, 256], nominal_geometry_fit=bool(np.all(hi - lo < 256)), gate='NOT YET PRINT READY: pending export, removal/access and actual toolpath checks'), indent=2), encoding='utf8')
    for p in [W / 'R4_D6_SIZE_RHYTHM_V2/data/surface.json', W / 'R4_D6_SIZE_RHYTHM_V2/data/D6_local.npz', W / 'R4_A1_MINI_RELEASE_CANDIDATE/data/support_geometry.json']:
        locks.append(dict(source=str(p), sha256=hashlib.sha256(p.read_bytes()).hexdigest()))
    (R / 'data/SOURCE_LOCKS.json').write_text(json.dumps(locks, indent=2), encoding='utf8')
    (R / 'data/PHYSICAL_EVIDENCE.json').write_text(json.dumps(dict(author_observation=['mini240C print: lower geometry did not form properly', 'internal structure above roughly half collapsed'], photo_observation=['Many exterior lower shafts and identifiable flowers formed', 'Loose/sagging strands and irregular internal junctions visible', 'Images1714/1715 show recognizable flower surface and locally rough/open regions'], cause='No exact failed layer, first failure sequence, G-code hash or temperature measurement established. Photos do not isolate adhesion, vibration, overhang or extrusion cause.', response=['Distributed new lower flower contacts from bed', 'Wider feet and taller local basal collars', 'Early rising braces for all new shafts over10mm'], other_run='A1 Run1 remains INCOMPLETE EXTRUSION/JAM; not relabeled global Support collapse'), indent=2), encoding='utf8')
    print('ASSEMBLED', len(add), flush=True)
