"""Source probe and fragment options, with explicit persistent remaining solids."""
from .adapter import write, require

def evaluate(c,body):
    np=c['np']; k=c['kernel']; r=c['recipe']; tol=r['numeric']['intersection_volume_mm3']; out=c['out']
    objects=c['generated']['objects']; remaining=dict(c['support_solids']); records=[]
    center=body.boxes.mean(1).mean(0)
    allboxes=np.concatenate([body.boxes,np.array([row['bbox_mm'] for row in objects])])
    worldlo=allboxes[:,0].min(0); worldhi=allboxes[:,1].max(0)
    count=r['tool']['directions']; ii=np.arange(count); z=1-2*(ii+.5)/count; angle=ii*np.pi*(3-np.sqrt(5))
    directions=np.c_[np.sqrt(1-z*z)*np.cos(angle),np.sqrt(1-z*z)*np.sin(angle),z]
    def obstacles(solid,exclude,capsule=None):
        found=body.hits(solid,tol,first=True,capsule=capsule)
        if found: return found
        v=solid.to_mesh().vert_properties[:,:3]
        if not len(v): return found
        lower=v.min(0); upper=v.max(0)
        for sid,other in remaining.items():
            if sid==exclude: continue
            b=other.bounding_box(); a=np.array(b[:3]); b=np.array(b[3:])
            if np.all(a<=upper) and np.all(b>=lower):
                ov=solid^other; require(ov.status()==k.md.Error.NoError,'REMOVAL_BOOLEAN_INVALID')
                if ov.volume()>tol:
                    found.append({'id':sid,'volume_mm3':float(ov.volume())})
                    break
        return found
    def ranked(p):
        pref=np.array(p)-center; pref/=max(np.linalg.norm(pref),1e-12)
        return directions[np.argsort(-(directions@pref),kind='stable')]
    def travel(p,d):
        # Exit the full assembly AABB in this direction, plus 2 mm source clearance.
        p=np.array(p); ts=[((worldhi[j]+8-p[j])/d[j] if d[j]>0 else (worldlo[j]-8-p[j])/d[j]) for j in range(3) if abs(d[j])>1e-12]
        return min(t for t in ts if t>=0)+2
    def access(p,sid):
        first=None
        for direction in ranked(p):
            start=np.array(p)+direction*r['tool']['start_offset_mm']; end=np.array(p)+direction*travel(p,direction)
            probe=k.capsule(start,end,r['tool']['radius_mm']); hits=obstacles(probe,None,(start,end,r['tool']['radius_mm']))
            if first is None: first={'direction':direction.tolist(),'start_mm':start.tolist(),'end_mm':end.tolist(),'obstacles':hits}
            if not hits: return {'status':'MODELLED_ACCESS_CLEAR','direction':direction.tolist(),'start_mm':start.tolist(),'end_mm':end.tolist(),'obstacles':[]}
        return {'status':'MODELLED_ACCESS_BLOCKED',**first}
    ordered=sorted(objects,key=lambda row:(0 if 'BRACE' in row['kind'] else 1,-np.linalg.norm(np.array(row['bbox_mm']).mean(0)-center),row['id']))
    for ri,row in enumerate(ordered):
        sid=row['id']; original=c['support_solids'][sid]; pts=np.array(row['points_mm']); axis=pts[-1]-pts[0]; axis/=max(np.linalg.norm(axis),1e-12)
        cuts=[np.array(p) for p in row['cut_mm']]
        cutrecords=[{'point_mm':p.tolist(),**access(p,sid)} for p in cuts]
        fragments=[original]
        for p in cuts:
            nextpieces=[]
            for fragment in fragments:
                for sign in (1,-1):
                    q=fragment.trim_by_plane(axis*sign,float(p@axis)*sign)
                    if q.volume()>tol: nextpieces.extend(q.decompose())
            fragments=nextpieces
        # Source max three longitudinal fragments: apply two extra main cuts when
        # a route is long. All resulting pieces are retained, including neck studs.
        if np.linalg.norm(pts[1]-pts[0])>14*r['scale']:
            for fraction in (1/3,2/3):
                p=pts[0]*(1-fraction)+pts[1]*fraction
                cutrecords.append({'point_mm':p.tolist(),'reason':'source three-fragment option',**access(p,sid)})
                nextpieces=[]
                for fragment in fragments:
                    for sign in (1,-1):
                        q=fragment.trim_by_plane(axis*sign,float(p@axis)*sign)
                        if q.volume()>tol: nextpieces.extend(q.decompose())
                fragments=nextpieces
        require(fragments,'EMPTY_REMOVAL_FRAGMENTS')
        total=sum(q.volume() for q in fragments)
        require(abs(total-original.volume())<max(1e-5,original.volume()*1e-7),'FRAGMENT_MATERIAL_LOSS:'+sid)
        planned=[]; dependencies=set(); cuts_clear=all(q['status']=='MODELLED_ACCESS_CLEAR' for q in cutrecords)
        # The original stays as an obstacle for other objects; only this object's
        # fragment checks exclude it, and each sibling fragment is separately retained.
        for fi,fragment in enumerate(fragments):
            fid=f'{sid}_fragment_{fi:02d}'; remaining[fid]=fragment
        del remaining[sid]
        for fi,fragment in enumerate(fragments):
            fid=f'{sid}_fragment_{fi:02d}'; path=out/'removal_fragments'/(fid+'.npz'); info=k.store(path,fragment)
            v=fragment.to_mesh().vert_properties[:,:3].astype(float); p=v.mean(0); first=None; clear=None
            for direction in ranked(p):
                length=travel(p,direction)+float(np.linalg.norm(v.max(0)-v.min(0)))
                sweep=k.md.Manifold.hull_points(np.vstack([v,v+direction*length]).tolist())
                hits=obstacles(sweep,fid)
                if first is None: first={'direction':direction.tolist(),'translation_mm':(direction*length).tolist(),'obstacles':hits}
                if not hits:
                    clear={'direction':direction.tolist(),'translation_mm':(direction*length).tolist(),'obstacles':[]}; break
            chosen=clear or first
            dependencies.update(h['id'] for h in chosen['obstacles'] if h['id'].startswith('MINIL_RS_'))
            executed=bool(clear and cuts_clear)
            if executed: del remaining[fid]
            planned.append({'id':fid,'mesh':'removal_fragments/'+path.name,'mesh_identity':k.mesh_array_identity(path),**info,
                            'escape_status':'MODELLED_ACCESS_CLEAR' if clear else 'MODELLED_ACCESS_BLOCKED',**chosen,
                            'removed_from_simulated_obstacles':executed})
        if not cuts_clear:
            # No cut occurred in the simulated sequence: restore the uncut original.
            for fi in range(len(fragments)): remaining.pop(f'{sid}_fragment_{fi:02d}',None)
            remaining[sid]=original
        records.append({'id':sid,'receiver_ids':[h['id'] for h in row['contacts']+row['anchor_contacts']],
                        'cut_sequence':cutrecords,'fragments':planned,'prior_dependencies':sorted(dependencies),
                        'tool_model':r['tool'],'all_cuts_modelled_clear':cuts_clear,
                        'all_fragments_removed_in_model':all(f['removed_from_simulated_obstacles'] for f in planned),
                        'real_tool':'REAL_TOOL_UNVERIFIED','physical':'PHYSICAL_REMOVAL_NOT_TESTED',
                        'assumptions':['Ideal zero-kerf planes','Probe omits first 1.5 mm next to cut','Convex hull sweeps conservatively enclose translating fragment','No deformation, cutting force or hand grip model','Blocked paths record first exact obstacle witness; dependencies are a lower bound, not a complete ordering solution']})
        if ri%20==0:
            print('MINIL_REMOVAL',ri,len(ordered),flush=True)
            write(out/'REMOVAL_PROGRESS.json',{'processed':ri+1,'total':len(ordered)})
            write(out/'PARTIAL_REMOVAL.json',{'objects':records,'complete':False})
    result={'objects':records,'order':[r['id'] for r in ordered], 'remaining_obstacle_ids':sorted(remaining),
            'physical_removal':'PHYSICAL_REMOVAL_NOT_TESTED','real_tool':'REAL_TOOL_UNVERIFIED','toolpath_checked':False}
    write(out/'SUPPORT_CONTACT_AND_REMOVAL.json',result)
    return result
