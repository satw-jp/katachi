"""Target-side interval audit and the existing rising brace construction."""
import json
from pathlib import Path
import numpy as np
from .light import sha,write
from .graph import unbraced_intervals

def load(path):
    spec=json.loads(Path(path).read_text());files=[]
    for key in ('support_ledger','c_additions'):
        p=spec[key]['path']
        if sha(p)!=spec[key]['sha256']:raise ValueError('STRUCTURAL_LEDGER_SHA')
        files.append(p)
    base=json.loads(Path(files[0]).read_text())['objects'];delta=json.loads(Path(files[1]).read_text())['additions']
    return spec,base,delta

def audit_and_generate(spec_path,s,occ,healthy,extra,k,g,out,section_fn,limit=24):
    spec,base,delta=load(spec_path);shift=np.array(spec['common_xy_mm']+[0.])
    shafts={r['id']:r for r in base if r['kind'] in ('LOWER_DIRECT','EXTERIOR_COLUMN')}
    byid={r['id']:r for r in base+delta};children={sid:[] for sid in byid}
    for r in base+delta:
        parent=r.get('anchor',r.get('donor'))
        if parent in children:children[parent].append(r['id'])
    def downstream(sid):
        seen=set();targets=set();pending=[sid]
        while pending:
            x=pending.pop()
            if x in seen:continue
            seen.add(x);row=byid[x];target=row.get('target')
            if target and target not in byid:targets.add(target)
            pending.extend(children[x])
        return sorted(targets)
    contacts={sid:[] for sid in shafts};contacts_detail={sid:[] for sid in shafts}
    for r in base:
        if r['kind']!='EARLY_RISING_BRACE':continue
        for key,point in [('anchor',0),('other_anchor',1)]:
            sid=r.get(key)
            if sid in shafts:
                z=float(r['points_mm'][point][2]);contacts[sid].append([z-g['brace_radius'],z+g['brace_radius']]);contacts_detail[sid].append(dict(brace=r['id'],target_side_z=z))
    c_unparsed=[]
    for r in delta:
        if r.get('kind')!='DIRECT_MID_UPPER_BRACE':continue
        rings=np.array(r.get('rings',[]))
        if not len(rings):c_unparsed.append(r.get('id'));continue
        for sid,z,point in [(r.get('target'),r.get('target_height'),rings[-1,:2]),(r.get('donor'),float(rings[0,2]),rings[0,:2])]:
            if sid not in shafts or z is None:continue
            center=np.array(shafts[sid]['points_mm'][0])[:2]
            if np.linalg.norm(center-point)>g['shaft_radius']+g['brace_radius']:c_unparsed.append(r.get('id'));continue
            contacts[sid].append([float(z)-g['brace_radius'],float(z)+g['brace_radius']])
            contacts_detail[sid].append(dict(brace=r.get('id'),target_side_z=float(z),evidence='FORMAL_C_METADATA_ENDPOINT'))
    audit=[]
    for sid,row in shafts.items():
        a=np.array(row['points_mm'][0])+shift;b=np.array(row['points_mm'][1])+shift
        top=min(float(b[2]),s['zmax_mm']);gaps=unbraced_intervals(g['foot_height'],top,contacts[sid]) if top>g['foot_height'] else []
        audit.append(dict(id=sid,start_mm=a,top_mm=b,intervals_mm=gaps,max_unbraced_mm=max((y-x for x,y in gaps),default=0),
            known_contacts=contacts_detail[sid],plate_rooted_by_source_rule=bool(row.get('foot')),formal_C_unparsed=c_unparsed,
            downstream_target_ids=downstream(sid),neck_radius_mm=g['neck_radius'],
            load_inference='dependency count only; force and breakage UNKNOWN'))
    write(out/'EXISTING_ROOT_BRACE_AUDIT.json',dict(source=spec,shaft_count=len(shafts),existing_support_count=len(base)+len(delta),
        shafts=audit,contact_interval_method='target-side endpoint plus recipe radius estimate; exact intersection extent UNVERIFIED',
        load_and_weak_neck_analysis='SOURCE_DEPENDENCY_IDS_AND_RECIPE_NECK_ONLY; physical strength UNVERIFIED',not_a_physical_stability_certificate=True))
    generated=[];decisions=[]
    for target in sorted(audit,key=lambda r:(-r['max_unbraced_mm'],r['id'])):
        if target['max_unbraced_mm']<=2*g['brace_step']:continue
        decision=dict(target=target['id'],before_gap_mm=target['max_unbraced_mm'],attempts=[])
        if len(generated)>=limit:decision['status']='UNHANDLED_FINITE_BRACE_LIMIT';decisions.append(decision);continue
        lo,hi=max(target['intervals_mm'],key=lambda x:x[1]-x[0]);tz=(lo+hi)/2
        tb=np.array(target['start_mm']);end=np.r_[tb[:2],tz]
        donors=sorted((float(np.linalg.norm(np.array(d['start_mm'])[:2]-tb[:2])),d['id'],d) for d in audit if d['id']!=target['id'])[:18]
        made=False
        for distance,donorid,donor in donors:
            if not 1.8*s['recipe']['scale']<distance<7.5*s['recipe']['scale']:
                decision['attempts'].append(dict(donor=donorid,distance_mm=distance,reason='EXISTING_BRACE_DISTANCE_BAND'));continue
            rise=max(3*s['recipe']['scale'],1.5*distance);dz=tz-rise;db=np.array(donor['start_mm'])
            if dz<=g['foot_height'] or dz>=donor['top_mm'][2]:
                decision['attempts'].append(dict(donor=donorid,donor_z_mm=dz,target_z_mm=tz,reason='PRECEDING_DONOR_HEIGHT_UNAVAILABLE'));continue
            start=np.r_[db[:2],dz];li=int(dz/s['dz_mm'])-1;ix=np.floor((start[:2]-s['origin_mm'])/s['pitch_mm']).astype(int)
            if li<0 or not healthy[li,ix[1],ix[0]]:
                decision['attempts'].append(dict(donor=donorid,reason='DONOR_NOT_PRECEDING_ROOTED'));continue
            solid=k.capsule(start,end,g['brace_radius']);sections=section_fn(solid,s);bad=0
            for iz,cells in sections.items():
                hit=cells[occ[iz].ravel()[cells]]
                y,x=np.divmod(hit,s['shape'][1]);points=np.c_[np.array(s['origin_mm'])+(np.c_[x,y]+.5)*s['pitch_mm'],np.full(len(hit),(iz+.5)*s['dz_mm'])]
                # Only the existing endpoint joints may intersect the old geometry.
                if len(points):bad+=int(((np.linalg.norm(points-start,axis=1)>2*g['brace_radius']+s['pitch_mm'])&(np.linalg.norm(points-end,axis=1)>2*g['brace_radius']+s['pitch_mm'])).sum())
            if bad:
                decision['attempts'].append(dict(donor=donorid,reason='BRACE_NON_ENDPOINT_INTERSECTION',cells=bad));continue
            # Each next section must overlap the already present donor/brace.
            prior=None;valid=True
            for iz,cells in sorted(sections.items()):
                on_old=iz>0 and healthy[iz-1].ravel()[cells].any()
                on_brace=prior is not None and np.intersect1d(cells,prior).size>0
                if not (on_old or on_brace):valid=False;break
                prior=cells
            if not valid:
                decision['attempts'].append(dict(donor=donorid,reason='BRACE_UNSUPPORTED_START'));continue
            sid=f'LOWZ_EXISTING_BR_{len(generated)+1:05d}';p=out/'support_mesh'/(sid+'.npz');info=k.store(p,solid)
            generated.append(dict(id=sid,kind='EARLY_RISING_BRACE',target=target['id'],donor=donorid,
                target_z_mm=tz,donor_z_mm=dz,start_mm=start,end_mm=end,mesh=str(p.relative_to(out)),sha256=sha(p),**info,
                removal='UNKNOWN_PHYSICAL',exact_endpoint_ownership='UNVERIFIED_SUBGRID',native_verified=False))
            for iz,cells in sections.items():extra[iz].ravel()[cells]=True
            decision.update(status='GENERATED_CAD_CANDIDATE',support_id=sid,target_z_mm=tz,donor_z_mm=dz);made=True;break
        if not made:decision['status']='UNHANDLED_NO_EXISTING_RULE_ROUTE'
        decisions.append(decision)
    write(out/'EXISTING_BRACE_ROUTE_LEDGER.json',decisions)
    compared=[]
    for row in audit:
        intervals=list(contacts[row['id']])
        for b in generated:
            for role in ('target','donor'):
                if b[role]==row['id']:
                    z=b[role+'_z_mm'];intervals.append([z-g['brace_radius'],z+g['brace_radius']])
        top=min(float(row['top_mm'][2]),s['zmax_mm']);gaps=unbraced_intervals(g['foot_height'],top,intervals)
        compared.append(dict(id=row['id'],before_max_unbraced_mm=row['max_unbraced_mm'],
            after_max_unbraced_mm=max((b-a for a,b in gaps),default=0),after_intervals_mm=gaps,physical_strength='UNKNOWN'))
    write(out/'EXISTING_BRACE_COMPARISON.json',compared)
    return generated
