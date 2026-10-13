"""Source-faithful V5 stage. Caller must provide an isolated scratch tree.
Original algorithm: coverage.py; no source-script runtime execution.
"""
def run(stage_root):
    import json, sys, collections, math
    from pathlib import Path
    import numpy as np
    R = stage_root
    D = R / 'data'
    V2 = R.parent / 'R4_D6_SIZE_RHYTHM_V2'
    V3 = R.parent / 'R4_V2_INTERNAL_PROPOSAL_V3'

    def read(p):
        return json.loads(Path(p).read_text(encoding='utf-8-sig'))

    def save(p, x):
        Path(p).write_text(json.dumps(x, ensure_ascii=False, indent=2, default=lambda a: a.tolist() if hasattr(a, 'tolist') else str(a)), encoding='utf-8')
    obs = read(D / 'support_geometry.json')['objects']
    audit = read(D / 'contact_removal_audit.json')
    held = {x['id'] for x in audit['contacts'] if x['flags']}
    active = [x for x in obs if x['id'] not in held]
    contacts = [x for x in active if 'contact_mm' in x]
    targetmap = collections.defaultdict(list)
    for x in contacts:
        targetmap[x['target']].append(x)
    r = read(D / 'routes_initial.json')
    allroutes = r['routes'] + read(D / 'body_links.json')['routes'] + read(D / 'body_surface_links.json')['routes']
    dm = {x['demand']: x['id'] for x in allroutes}
    demands = r['demands']
    categories = {}
    for d in demands:
        d['assigned_route'] = dm.get(d['id'])
        d['selected_route'] = d['assigned_route'] is not None and d['assigned_route'] not in held
        d['target_has_selected_contact'] = d['target'] in targetmap
        for reason in d['reasons']:
            c = categories.setdefault(reason, dict(targets=set(), sampled_demands=0, assigned_samples=0, targets_with_contact=set()))
            c['targets'].add(d['target'])
            c['sampled_demands'] += 1
            c['assigned_samples'] += d['selected_route']
            if d['target_has_selected_contact']:
                c['targets_with_contact'].add(d['target'])
    for c in categories.values():
        c['target_count'] = len(c['targets'])
        c['target_ids'] = sorted(c.pop('targets'))
        c['targets_with_contact_count'] = len(c['targets_with_contact'])
        c['targets_with_contact_ids'] = sorted(c.pop('targets_with_contact'))
        c['note'] = 'Contact presence is not complete support, printability or strength proof'
    network = read(D / 'brace_network.json')
    shaftchecks = []
    brace_events = collections.defaultdict(list)
    for b in network['braces']:
        if b['kind'] == 'EARLY_AND_INTERMEDIATE_SHAFT_BRACE':
            z = max((p[2] for p in b['points_mm'])) + 0.8
            for id in [b['anchor'], b['target']]:
                brace_events[id].append(z)
    bed = read(V3 / 'data/structure.json')['bed_z_mm']
    for c in network['columns']:
        top = c['top_z_mm']
        events = sorted(set((z for z in brace_events[c['id']] if bed < z <= top)))
        levels = [bed] + events + [top]
        free = max(np.diff(levels))
        shaftchecks.append(dict(id=c['id'], top_z_mm=top, first_effective_brace_z_mm=events[0] if events else None, maximum_growth_interval_without_effective_brace_mm=float(free), lower_local_diameter_mm=c['lower_local_diameter_mm'], hold=free > 20))
    fs = read(V2 / 'data/surface.json')['surface']
    fm = {f['id']: f for f in fs}
    groups = read(V2 / 'data/contact_comparison_threshold.json')['V2_groups']
    broad = []
    for i, g in enumerate(groups):
        bb = np.array([fm[id]['bbox_mm'] for id in g])
        size = bb[:, 1].max(0) - bb[:, 0].min(0)
        if max(size) < 7:
            continue
        points = [np.array(x['contact_mm']) for id in g for x in targetmap.get(id, [])]
        spread = max((np.linalg.norm(a - b) for a in points for b in points), default=0.0)
        broad.append(dict(group=i, flowers=g, dimensions_mm=size, selected_contact_count=len(points), contact_spread_mm=spread, distributed_minimum_met=len(points) >= 2 and spread >= max(size) * 0.35, note='2+ separated contacts is a geometric distribution check; not sag/rotation/peel proof'))
    regions = {}
    for label, lo, hi in [('lower', bed, 70), ('mid', 70, 140), ('upper', 140, 230)]:
        targetflowers = [f['id'] for f in fs if lo <= f['position_mm'][2] < hi]
        regions[label] = dict(flower_count=len(targetflowers), flower_targets_with_selected_contact=sum((id in targetmap for id in targetflowers)), selected_contact_count=sum((lo <= x['contact_mm'][2] < hi for x in contacts)))
    allbbox = np.array([x['bbox_mm'] for x in active + fs + read(V3 / 'data/structure.json')['members']])
    lower = allbbox[:, 0].min(0)
    upper = allbbox[:, 1].max(0)
    result = dict(status='HOLD / Support Visual Gate; authored coverage NOT established', generated_objects=len(obs), selected_objects=len(active), held_contact_paths=len(held), selected_by_kind=collections.Counter((x['kind'] for x in active)), generated_contacts=len(audit['contacts']), selected_contact_paths=len(contacts), target_unique_count=len(targetmap), direct_flower_targets=sum((id.startswith('F') for id in targetmap)), direct_permanent_targets=sum((not id.startswith('F') for id in targetmap)), regions=regions, categories=categories, broad_groups_tested=len(broad), broad_groups_minimum_distribution_met=sum((x['distributed_minimum_met'] for x in broad)), shaft_growth_interval_holds=sum((x['hold'] for x in shaftchecks)), upper_diagonal_unserved_positions=len(network['holds']), bounds_mm=[lower, upper], dimensions_mm=upper - lower, nine_demand_classes=['initial_unrooted', 'long_overhang_bridge', 'long_free_permanent', 'small_thin_attachment', 'distributed_surface_growth', 'load_concentration', 'rotation_vibration_peeling', 'shaft_free_interval', 'upper_branch_birth_stability'], V4_D2_112='HOLD retained in V4 history; not copied into selected V5; no removal success claim', candidate_comparison=[dict(name='AUTHORED D2', geometry='actual V5 separated blend and previews', state='HOLD: incomplete coverage, remaining stability/access questions'), dict(name='AUTHORED D2 + NATIVE TREE FALLBACK', geometry='NOT GENERATED / NOT MIXED', state='Separate follow-up candidate proposal only; would require Author opening native generation/slice scope. Native support may also create removal problems; no success claim.')], slice=False, printability_proven=False, permanent_authority_unchanged=True)
    save(D / 'demand_coverage.json', result)
    save(D / 'all_demand_assignments.json', demands)
    save(D / 'broad_region_support.json', broad)
    save(D / 'shaft_growth_review.json', shaftchecks)
    save(D / 'selected_support_ids.json', [x['id'] for x in active])
    save(D / 'held_support_ids.json', sorted(held))
    print(json.dumps({k: result[k] for k in ['selected_objects', 'selected_contact_paths', 'direct_flower_targets', 'direct_permanent_targets', 'regions', 'shaft_growth_interval_holds', 'dimensions_mm']}, default=lambda x: x.tolist()), flush=True)
