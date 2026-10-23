"""Bounded LOWZ V3 adapter using the unchanged V2 construction primitives.

No native engine, no source writes, no source-specific flower IDs. This produces
CAD review candidates, not production approval. Unresolved routes stay explicit.
"""
import argparse
import json
from pathlib import Path
import numpy as np
from scipy import ndimage
from .light import sha,write,section,rooted_volume,demands
from ..construction import planar_foot,contact_parts
from ...mesh_backend import ManifoldKernel

def solid_sections(solid,source):
    a=solid.to_mesh();tri=a.vert_properties[:,:3][a.tri_verts].astype(float)
    dz=source['dz_mm'];lo=tri[:,:,2].min();hi=tri[:,:,2].max();result={}
    for iz in range(max(0,int(np.floor(lo/dz))),min(source['nz'],int(np.ceil(hi/dz)))):
        cc=section(tri,(iz+.5)*dz,np.array(source['origin_mm']),source['pitch_mm'],source['shape'])
        if len(cc):result[iz]=cc
    return result

def self_rooted(sections):
    if not sections or min(sections)!=0:return False
    last=None
    for iz,cc in sorted(sections.items()):
        if last is not None and (iz!=last[0]+1 or not np.intersect1d(cc,last[1]).size):return False
        last=(iz,cc)
    return True

def overlaps(sections,occ):
    return sum(int(occ[iz].ravel()[cc].sum()) for iz,cc in sections.items())

def comparison(events,after):
    ai={e['id']:e for e in after};before_ids={e['id'] for e in events}
    return dict(before_component_sections=len(events),after_component_sections=len(after),
        resolved_original_events=sum(e['id'] not in ai for e in events),
        improved_original_events=sum(e['id'] in ai and ai[e['id']]['coverage']>e['coverage'] for e in events),
        new_or_relabelled_events=sum(e['id'] not in before_ids for e in after))

def run(cache,out,runtime,attempt_limit=200,candidate_limit=24,structural_source=None,reuse_before=None):
    cache=Path(cache);out=Path(out);out.mkdir(parents=True,exist_ok=False)
    s=json.loads((cache/'SOURCE.json').read_text());source_hash=sha(s['path'])
    if source_hash!=s['sha256']:raise ValueError('SOURCE_SHA_MISMATCH')
    if s.get('bounded_sections_verified') is not True:raise ValueError('UNCERTIFIED_SECTION_CACHE: generation forbidden until bounded-section validation passes')
    for part in s['parts']:
        if sha(cache/part['file'])!=part['sha256']:raise ValueError('SECTION_CACHE_CHANGED')
    print('SOURCE_AND_CACHE_SHA_PASS',flush=True)
    occ=np.load(cache/'occupancy.npy',mmap_mode='r');healthy=rooted_volume(occ)
    print('ROOTED_CAD_BEFORE_COMPLETE',flush=True)
    if reuse_before:
        from .before_cache import load
        events,footprints=load(cache,reuse_before)
        print('SEALED_BEFORE_CACHE_REUSED',flush=True)
    else:events,footprints=demands(cache,healthy)
    write(out/'LOWZ_DEMANDS_BEFORE.json',dict(source_sha256=source_hash,evidence=s['evidence'],events=events))
    offsets=np.r_[0,np.cumsum([len(c) for c in footprints])]
    np.savez_compressed(out/'DEMAND_FOOTPRINTS.npz',offsets=offsets,cells=np.concatenate(footprints) if footprints else np.empty(0,int))
    from .before_cache import seal
    seal(cache,out)
    k=ManifoldKernel.from_runtime_root(Path(runtime));g=s['recipe']['geometry'];scale=s['recipe']['scale']
    recipe=dict(version='LOWZ_COMPONENT_V3_SAME_CONSTRUCTION',source_recipe=s['recipe'],attempt_limit=attempt_limit,candidate_limit=candidate_limit,
        coverage_required=1.0,normal_policy='vertical underside CAD proxy; exact normal UNKNOWN',
        demand_order='independent births first, flower priority, round-robin 5 mm height bands, stable CAD Z and event ID within each band',
        search_height_band_mm=5.,
        maximum_unbraced_candidate_mm=2*g['brace_step'],cad_grid_phase_mm=s['dz_mm']/2,
        route_policy='existing LOWER_DIRECT then external rising branch to frozen plate-rooted shaft; then existing rising braces. BODY surface fallback remains UNHANDLED',
        donor_search_cap=8,
        physical_calibration=False)
    write(out/'RECIPE.json',recipe)
    extra=np.zeros_like(occ);ledger=[];rows=[];solids=[];attempts=0
    partdata={}
    donor_index=None
    if structural_source:
        from .donors import Donors
        donor_index=Donors(structural_source,k,s,solid_sections)
    # All failed events are recorded, including those outside the finite budget.
    from .order import ordered_demands
    ordered=ordered_demands(events,recipe['search_height_band_mm'])
    for ev in ordered:
        decision=dict(event_id=ev['id'],status='UNHANDLED',reasons=[])
        if attempts>=attempt_limit or len(rows)>=candidate_limit:
            decision['reasons']=['FINITE_SEARCH_LIMIT'];ledger.append(decision);continue
        cc=footprints[ev['footprint_index']];iz=ev['section'];z=ev['cad_z_mm']
        yy,xx=np.divmod(cc,s['shape'][1]);xy=np.array(s['origin_mm'])+(np.array([xx.mean(),yy.mean()])+.5)*s['pitch_mm']
        p=np.r_[xy,z];n=np.array([0.,0.,-1.]);end=p+n*g['neck_offset'];a=np.r_[xy,g['shaft_radius']]
        if end[2]<=2.2*scale:
            decision['reasons']=['INSUFFICIENT_HEIGHT_FOR_EXISTING_DIRECT_RULE'];ledger.append(decision);continue
        attempts+=1
        main,neck,end,tip=contact_parts(k,np,p,n,a,g);foot=planar_foot(k,np,xy,g)
        mainsec=solid_sections(main,s);footsec=solid_sections(foot,s);necksec=solid_sections(neck,s)
        direct_clear=not (overlaps(mainsec,occ) or overlaps(footsec,occ) or overlaps(mainsec,extra) or overlaps(footsec,extra))
        if ev['part'] not in partdata:
            with np.load(cache/next(x['file'] for x in s['parts'] if x['id']==ev['part'])) as ar:partdata[ev['part']]=ar['data']
        data=partdata[ev['part']];target=data[data[:,0]==ev['mesh_component']]
        bad=0;contact=0
        for layer,cells in necksec.items():
            owned=target[target[:,1]==layer,2];hit=cells[occ[layer].ravel()[cells]]
            bad+=np.setdiff1d(hit,owned).size;contact+=np.intersect1d(hit,owned).size
        if bad or not contact:
            decision['reasons']=['NECK_NON_TARGET_INTERSECTION' if bad else 'NO_TARGET_CONTACT'];ledger.append(decision);continue
        prior=necksec.get(iz-1,np.empty(0,int))
        covered=np.union1d(np.flatnonzero(healthy[iz-1].ravel()),prior)
        if np.setdiff1d(cc,covered).size:
            decision['reasons']=['EXISTING_NECK_DOES_NOT_COVER_WHOLE_COMPONENT'];ledger.append(decision);continue
        route_kind='LOWER_DIRECT';donor_info={}
        if direct_clear:
            solid=k.union([main,neck,foot]);sections=solid_sections(solid,s)
            if not self_rooted(sections):
                decision['reasons']=['NEW_SUPPORT_SECTION_GAP'];ledger.append(decision);continue
        else:
            decision['route_attempts']=[dict(rule='LOWER_DIRECT',reason='DIRECT_SHAFT_OR_FOOT_INTERSECTION')]
            route=donor_index.try_route(p,n,g,occ,extra,healthy,solid_sections,decision['route_attempts']) if donor_index else None
            if route is None:
                decision['reasons']=['NO_DIRECT_OR_EXISTING_SHAFT_ROUTE'];ledger.append(decision);continue
            solid=route['solid'];sections=route['sections'];a=route['start'];end=route['end'];tip=route['tip'];route_kind='EXTERNAL_SHAFT_BRANCH'
            donor_info={key:route[key] for key in ('donor','donor_sha256','donor_contact_volume_mm3','donor_connection_z_mm')}
        sid=f'LOWZ_RS_{len(rows)+1:05d}';path=out/'support_mesh'/(sid+'.npz');info=k.store(path,solid)
        with np.load(path) as saved:
            reloaded=k.man(saved['vertices'],saved['faces'])
            if reloaded.status()!=k.md.Error.NoError or reloaded.volume()<=0:raise ValueError('RELOAD_INVALID')
        row=dict(id=sid,kind=route_kind,event_id=ev['id'],target_part=ev['part'],target_component=ev['mesh_component'],**donor_info,
            p_mm=p,start_mm=a,end_mm=end,tip_mm=tip,cut_mm=(p+n*g['neck_cut']),mesh=str(path.relative_to(out)),sha256=sha(path),
            role='REMOVABLE_SUPPORT',**info,geometry_identity=k.mesh_array_identity(path),prior_component_coverage=1.,
            contact_cells=contact,exact_surface_collision='UNVERIFIED_SUBGRID',removal='UNKNOWN_PHYSICAL',root='CAD_BASE_PLANE' if route_kind=='LOWER_DIRECT' else donor_info['donor'],
            layer_order='CAD_SECTIONS_CONTIGUOUS_NATIVE_UNVERIFIED')
        rows.append(row);solids.append(solid)
        for layer,cells in sections.items():extra[layer].ravel()[cells]=True
        decision.update(status='GENERATED_CAD_CANDIDATE',support_id=sid,reasons=[]);ledger.append(decision)
        print('CANDIDATE',sid,ev['id'],flush=True)
    # Reuse the original nearest-neighbour rising brace rule and dimensions.
    braces=[];shafts=[r for r in rows if r['kind']=='LOWER_DIRECT']
    for i,row in enumerate(shafts):
        a=np.array(row['start_mm']);top=np.array(row['end_mm']);buddies=0
        choices=sorted((float(np.linalg.norm(a[:2]-np.array(o['start_mm'])[:2])),j) for j,o in enumerate(shafts) if j!=i)[:18]
        for distance,j in choices:
            if not 1.8*scale<distance<7.5*scale:continue
            other=shafts[j];q=np.array(other['start_mm']);ot=np.array(other['end_mm']);rise=max(3*scale,1.5*distance);made=False
            for z in np.arange(1.2*scale,min(top[2],ot[2])-rise,g['brace_step']):
                start=np.r_[a[:2],z];end=np.r_[q[:2],z+rise];solid=k.capsule(start,end,g['brace_radius']);ss=solid_sections(solid,s)
                if overlaps(ss,occ):continue
                sid=f'LOWZ_BR_{len(braces)+1:05d}';path=out/'support_mesh'/(sid+'.npz');info=k.store(path,solid)
                braces.append(dict(id=sid,kind='EARLY_RISING_BRACE',donor=row['id'],target=other['id'],donor_z_mm=float(z),target_z_mm=float(z+rise),
                    start_mm=start,end_mm=end,mesh=str(path.relative_to(out)),sha256=sha(path),**info,native_verified=False))
                for layer,cells in ss.items():extra[layer].ravel()[cells]=True
                made=True
            if made:buddies+=1
            if buddies>=2:break
    from .graph import unbraced_intervals
    audits=[]
    for row in rows:
        contacts=[]
        for b in braces:
            if b['donor']==row['id']:contacts.append([b['donor_z_mm']-g['brace_radius'],b['donor_z_mm']+g['brace_radius']])
            if b['target']==row['id']:contacts.append([b['target_z_mm']-g['brace_radius'],b['target_z_mm']+g['brace_radius']])
        gaps=unbraced_intervals(g['foot_height'],row['end_mm'][2],contacts) if row['kind']=='LOWER_DIRECT' else []
        audits.append(dict(id=row['id'],direct_contact_intervals_mm=contacts,unbraced_intervals_mm=gaps,
            maximum_unbraced_mm=max((b-a for a,b in gaps),default=None),physical_strength='UNKNOWN',
            branch_length_mm=float(np.linalg.norm(np.array(row['end_mm'])-row['start_mm'])) if row['kind']=='EXTERNAL_SHAFT_BRANCH' else None))
    existing_braces=[]
    if structural_source:
        from .legacy_graph import audit_and_generate
        existing_braces=audit_and_generate(structural_source,s,occ,healthy,extra,k,g,out,solid_sections)
    combined=occ|extra;afterhealthy=rooted_volume(combined);after,_=demands(cache,afterhealthy)
    byevent={e['id']:e for e in events}
    for row in rows:
        ev=byevent[row['event_id']];tracked=footprints[ev['footprint_index']];series=[]
        data=partdata[row['target_part']];target=data[data[:,0]==row['target_component']]
        for layer in range(ev['section'],min(s['nz'],ev['section']+4)):
            mask=np.zeros(s['shape'],bool);mask.ravel()[target[target[:,1]==layer,2]]=True
            labels,_=ndimage.label(mask);desc=np.unique(labels.ravel()[tracked]);desc=desc[desc!=0]
            tracked=np.flatnonzero(np.isin(labels,desc)) if len(desc) else np.empty(0,int)
            series.append(dict(section=layer,cad_z_mm=(layer+.5)*s['dz_mm'],descendant_cells=len(tracked),
                prior_coverage=float(afterhealthy[layer-1].ravel()[tracked].mean()) if len(tracked) and layer>0 else None))
        row['first_four_descendant_sections']=series
    stats=comparison(events,after);stats.update(new_shafts=len(shafts),new_existing_shaft_branches=len(rows)-len(shafts),new_braces=len(braces)+len(existing_braces),attempted=attempts,unhandled_routes=sum(x['status']=='UNHANDLED' for x in ledger),
        source_sha_unchanged=sha(s['path'])==source_hash,evidence=s['evidence'],native_slice=0,send=0,print=0,
        remaining_limits=['subgrid collision and exact normals not certified','native chronology unverified','BODY surface fallback not connected','weak-neck strength unverified'])
    if not stats['source_sha_unchanged']:raise ValueError('SOURCE_CHANGED')
    write(out/'LOWZ_DEMANDS_AFTER.json',dict(source_sha256=source_hash,evidence=s['evidence'],events=after))
    write(out/'ROUTE_LEDGER.json',ledger);write(out/'ROOT_BRACE_AUDIT.json',audits)
    write(out/'CANDIDATE.json',dict(source_sha256=source_hash,source_path=s['path'],additions=rows+braces+existing_braces,print_go=False,status='HOLD_UNVERIFIED'))
    write(out/'COMPARISON.json',stats);np.savez_compressed(out/'ADDED_SECTIONS.npz',bits=np.packbits(extra),shape=extra.shape)
    print(json.dumps(stats),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--cache',required=True);p.add_argument('--out',required=True);p.add_argument('--runtime',required=True);p.add_argument('--attempt-limit',type=int,default=200);p.add_argument('--candidate-limit',type=int,default=24)
    p.add_argument('--structural-source')
    p.add_argument('--reuse-before')
    a=p.parse_args();run(a.cache,a.out,a.runtime,a.attempt_limit,a.candidate_limit,a.structural_source,a.reuse_before)
