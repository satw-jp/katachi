"""Source probe and fragment options, with explicit persistent remaining solids."""
from .adapter import write, require

def evaluate(c,body):
    np=c['np']; k=c['kernel']; r=c['recipe']; tol=r['numeric']['intersection_volume_mm3']; out=c['out']
    objects=c['generated']['objects']; remaining=dict(c['support_solids']); records=[]
    epoch=0; cached_epoch=-1; cached_keys=[]; cached_boxes=None; bbox_cache={}
    center=body.boxes.mean(1).mean(0)
    allboxes=np.concatenate([body.boxes,np.array([row['bbox_mm'] for row in objects])])
    worldlo=allboxes[:,0].min(0); worldhi=allboxes[:,1].max(0)
    count=r['tool']['directions']; ii=np.arange(count); z=1-2*(ii+.5)/count; angle=ii*np.pi*(3-np.sqrt(5))
    directions=np.c_[np.sqrt(1-z*z)*np.cos(angle),np.sqrt(1-z*z)*np.sin(angle),z]
    def obstacles(solid,exclude,capsule=None):
        nonlocal cached_epoch,cached_keys,cached_boxes
        found=body.hits(solid,tol,first=True,capsule=capsule)
        if found: return found
        v=solid.to_mesh().vert_properties[:,:3]
        if not len(v): return found
        lower=v.min(0); upper=v.max(0)
        if cached_epoch!=epoch:
            cached_keys=list(remaining);boxes=[]
            for sid in cached_keys:
                other=remaining[sid];item=bbox_cache.get(sid)
                if item is None or item[0] is not other:
                    box=np.array(other.bounding_box()).reshape(2,3);bbox_cache[sid]=(other,box)
                boxes.append(bbox_cache[sid][1])
            cached_boxes=np.array(boxes);cached_epoch=epoch
        if not cached_keys:return found
        near=np.flatnonzero(np.all(cached_boxes[:,0]<=upper,1)&np.all(cached_boxes[:,1]>=lower,1))
        if capsule is not None and len(near):
            a,b,radius=capsule;a=np.array(a);delta=np.array(b)-a;boxes=cached_boxes[near];centers=boxes.mean(1)
            t=np.clip(((centers-a)@delta)/max(float(delta@delta),1e-30),0,1)
            near=near[np.linalg.norm(centers-(a+t[:,None]*delta),axis=1)<=np.linalg.norm(boxes[:,1]-boxes[:,0],axis=1)/2+radius+1e-6]
        for index in near:
            sid=cached_keys[index];other=remaining[sid]
            if sid==exclude: continue
            ov=solid^other; require(ov.status()==k.md.Error.NoError,'REMOVAL_BOOLEAN_INVALID')
            if ov.volume()>tol:
                found.append({'id':sid,'volume_mm3':float(ov.volume())});break
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
        sid=row['id']; original=c['support_solids'][sid]; pts=np.array(row['points_mm'])
        axis=pts[1]-pts[0]; axis/=max(np.linalg.norm(axis),1e-12)
        neck_axis=pts[-1]-pts[1] if len(pts)>2 else axis
        neck_axis=neck_axis/max(np.linalg.norm(neck_axis),1e-12)
        main=k.capsule(pts[0],pts[1],r['geometry']['shaft_radius'])
        cuts=[np.array(p) for p in row['cut_mm']]
        normals=[axis.copy() for p in cuts]
        if cuts and row.get('target'): normals[-1]=neck_axis
        basecuts=[{'point_mm':p.tolist(),'plane_normal':n.tolist(),**access(p,sid)} for p,n in zip(cuts,normals)]
        baseline=dict(remaining); attempts=[]
        for pieces in r['tool']['fragment_options']:
            remaining.clear();remaining.update(baseline)
            epoch+=1
            cutrecords=list(basecuts)
            if pieces>1:
                for p in np.linspace(pts[0],pts[1],pieces+1)[1:-1]:
                    cutrecords.append({'point_mm':p.tolist(),'plane_normal':axis.tolist(),'reason':f'source {pieces}-fragment option',**access(p,sid)})
            fragments=[original]
            for cut in cutrecords:
                p=np.array(cut['point_mm']);n=np.array(cut['plane_normal']);nextpieces=[]
                for fragment in fragments:
                    for sign in (1,-1):
                        q=fragment.trim_by_plane(n*sign,float(p@n)*sign)
                        if q.volume()>tol: nextpieces.extend(q.decompose())
                fragments=nextpieces
            require(fragments,'EMPTY_REMOVAL_FRAGMENTS')
            total=sum(q.volume() for q in fragments)
            require(abs(total-original.volume())<max(1e-5,original.volume()*1e-7),'FRAGMENT_MATERIAL_LOSS:'+sid)
            planned=[];dependencies=set();cuts_clear=all(q['status']=='MODELLED_ACCESS_CLEAR' for q in cutrecords)
            del remaining[sid]
            for fi,fragment in enumerate(fragments):remaining[f'{sid}_fragment_{fi:02d}']=fragment
            epoch+=1
            for fi,fragment in enumerate(fragments):
                fid=f'{sid}_fragment_{fi:02d}';v=fragment.to_mesh().vert_properties[:,:3].astype(float);p=v.mean(0)
                initial=obstacles(fragment,fid);first=None;clear=None
                # Any positive initial intersection is contained in every swept
                # convex hull. One exact witness proves all directions blocked.
                if initial:
                    direction=ranked(p)[0];first={'direction':direction.tolist(),'translation_mm':(direction*travel(p,direction)).tolist(),
                                                'obstacles':initial,'proof':'INITIAL_INTERSECTION_CONTAINED_IN_EVERY_SWEEP'}
                else:
                    for direction in ranked(p):
                        length=travel(p,direction)+float(np.linalg.norm(v.max(0)-v.min(0)))
                        sweep=k.md.Manifold.hull_points(np.vstack([v,v+direction*length]).tolist());hits=obstacles(sweep,fid)
                        witness={'direction':direction.tolist(),'translation_mm':(direction*length).tolist(),'obstacles':hits,'proof':'CONTINUOUS_CONVEX_HULL_SWEEP'}
                        if first is None:first=witness
                        if not hits:clear=witness;break
                chosen=clear or first
                dependencies.update(h['id'] for h in chosen['obstacles'] if h['id'].startswith('MINIL_RS_'))
                # A residue outside the main shaft is retained, never silently
                # deleted or credited as a successfully removed fragment.
                residue=bool(initial and (fragment^main).volume()<=tol)
                executed=bool(clear and cuts_clear)
                if executed:
                    del remaining[fid];epoch+=1
                planned.append({'id':fid,'escape_status':'MODELLED_ACCESS_CLEAR' if clear else 'MODELLED_ACCESS_BLOCKED',
                                **chosen,'sacrificial_residue_outside_main':residue,'removed_from_simulated_obstacles':executed})
            if not cuts_clear:
                remaining.clear();remaining.update(baseline)
                epoch+=1
            main_clear=all(f['removed_from_simulated_obstacles'] for f in planned if not f['sacrificial_residue_outside_main'])
            attempts.append({'main_piece_option':pieces,'cuts_clear':cuts_clear,'main_fragments_clear':main_clear,
                             'residues_retained':sum(f['sacrificial_residue_outside_main'] for f in planned)})
            # Source order: primary tool gate, whole-main extraction, then 2/3
            # main pieces only when required. Residues remain a separate failure.
            if not all(q['status']=='MODELLED_ACCESS_CLEAR' for q in basecuts) or main_clear:break
        for fragment,item in zip(fragments,planned):
            path=out/'removal_fragments'/(item['id']+'.npz');info=k.store(path,fragment)
            item.update(mesh='removal_fragments/'+path.name,mesh_identity=k.mesh_array_identity(path),**info)
        records.append({'id':sid,'receiver_ids':[h['id'] for h in row['contacts']+row['anchor_contacts']],
                        'cut_sequence':cutrecords,'fragments':planned,'prior_dependencies':sorted(dependencies),
                        'fragment_option_attempts':attempts,'main_fragments_removed_in_model':main_clear,
                        'tool_model':r['tool'],'all_cuts_modelled_clear':cuts_clear,
                        'all_fragments_removed_in_model':all(f['removed_from_simulated_obstacles'] for f in planned),
                        'real_tool':'REAL_TOOL_UNVERIFIED','physical':'PHYSICAL_REMOVAL_NOT_TESTED',
                        'assumptions':['Ideal zero-kerf planes','Probe omits first 1.5 mm next to cut','Convex hull sweeps conservatively enclose translating fragment','No deformation, cutting force or hand grip model','Build plate and raft are absent from removal model; release and holding are unverified','Blocked paths record first exact obstacle witness; dependencies are a lower bound, not a complete ordering solution']})
        if ri%20==0:
            print('MINIL_REMOVAL',ri,len(ordered),flush=True)
            write(out/'REMOVAL_PROGRESS.json',{'processed':ri+1,'total':len(ordered)})
            write(out/'PARTIAL_REMOVAL.json',{'objects':records,'complete':False})
    result={'objects':records,'order':[r['id'] for r in ordered], 'remaining_obstacle_ids':sorted(remaining),
            'physical_removal':'PHYSICAL_REMOVAL_NOT_TESTED','real_tool':'REAL_TOOL_UNVERIFIED','toolpath_checked':False}
    write(out/'SUPPORT_CONTACT_AND_REMOVAL.json',result)
    return result
