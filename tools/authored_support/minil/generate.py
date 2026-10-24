"""MINIL-only ports of direct, external and earlier-BODY authored support routes."""
from .adapter import write, require, digest
from .body import query
from .construction import planar_foot, contact_parts

def validate_derived_inputs(body,demands,anchors,context):
    ids=set(body.ids)
    require(not any(key in context for key in ('prior_support','selected_support_ids','golden','completed_support')),'OLD_COMPLETED_SUPPORT_INPUT')
    require(all(d['target'] in ids and d['id']=='MINIL_DEMAND_'+d['target'] for d in demands),'UNBOUND_DEMAND_ID')
    require(all(a['owner'] in ids for a in anchors),'UNBOUND_ANCHOR_ID')

def generate(c,body,occ,rooted,meta,demands,anchors):
    from scipy import ndimage as ndi
    from scipy.spatial import cKDTree
    np=c['np']; k=c['kernel']; r=c['recipe']; g=r['geometry']; s=r['scale']; tol=r['numeric']['intersection_volume_mm3']
    rows=[]; solids={}; columns={}; contacts={}; rejected=[]; bytarget={}; out=c['out']
    validate_derived_inputs(body,demands,anchors,c)
    def save(kind,solid,points,**extra):
        require(solid.status()==k.md.Error.NoError and solid.volume()>0,'INVALID_NEW_SUPPORT')
        sid=f'MINIL_RS_{len(rows)+1:05d}'; path=out/'support_mesh'/(sid+'.npz')
        info=k.store(path,solid); row={'id':sid,'role':'REMOVABLE_SUPPORT','kind':kind,'mesh':'support_mesh/'+path.name,
                                    'points_mm':np.asarray(points).tolist(),**info,**extra,'mesh_identity':k.mesh_array_identity(path)}
        rows.append(row); solids[sid]=solid
        return sid
    def foot(xy):
        return planar_foot(k,np,xy,g)
    def clear(solid): return not body.hits(solid,tol,first=True)
    dirs=np.array([[x,y,z] for x in [-1,0,1] for y in [-1,0,1] for z in [-1,0,1] if x or y or z],float)
    dirs=np.vstack([np.zeros(3),dirs/np.linalg.norm(dirs,axis=1)[:,None]])
    def raster_clear(a,b,radius):
        p=np.linspace(a,b,max(2,int(np.ceil(np.linalg.norm(np.array(b)-a)/(.45*s)))+1))
        return not query((p[:,None]+dirs[None]*(radius+.22*s)).reshape(-1,3),occ,meta,np).any()
    projection=occ.any(0)
    distance=ndi.distance_transform_edt(~projection)*g['grid_xy']
    lo=body.boxes[:,0].min(0); hi=body.boxes[:,1].max(0)
    xx,yy=np.meshgrid(np.arange(lo[0]-15*s,hi[0]+15*s,g['column_spacing']),np.arange(lo[1]-15*s,hi[1]+15*s,g['column_spacing']))
    xy=np.c_[xx.ravel(),yy.ravel()]; ix=np.floor((xy-np.array(meta['origin_mm'])[:2])/g['grid_xy']).astype(int)
    # Extend the projection by padding to retain exterior search outside the body-grid box.
    pad=int(np.ceil(16*s/g['grid_xy'])); padded=np.pad(projection,pad)
    dist=ndi.distance_transform_edt(~padded)*g['grid_xy']; ix+=pad
    dep=dist[ix[:,1],ix[:,0]]; xy=xy[(dep>1.5*s)&(dep<15*s)&(xy[:,0]>g['foot_radius'])&(xy[:,1]>g['foot_radius'])&(xy[:,0]<180-g['foot_radius'])&(xy[:,1]<180-g['foot_radius'])]
    tree=cKDTree(xy) if len(xy) else None
    ap=np.array([a['point_mm'] for a in anchors]); atree=cKDTree(ap) if len(ap) else None
    used_anchors={}
    def contact_route(d,p,n,start,anchor=None,anchor_normal=None):
        end=p+n*g['neck_offset']; tip=p-n*g['neck_overlap']
        if not raster_clear(start,end,g['shaft_radius']): return None
        main,neck,end,tip=contact_parts(k,np,p,n,start,g)
        if body.hits(main,tol,first=True,capsule=(start,end,g['shaft_radius'])): return None
        hits=body.hits(neck,tol)
        if {h['id'] for h in hits}!={d['target']}: return None
        parts=[main,neck]; anchor_hits=[]; cuts=[(p+n*g['neck_cut']).tolist()]
        if anchor is not None:
            q=np.array(anchor['point_mm']); direction=(end-q)/np.linalg.norm(end-q)
            an=k.capsule(q-direction*.35*s,start,g['neck_radius']); anchor_hits=body.hits(an,tol)
            if {h['id'] for h in anchor_hits}!={anchor['owner']}: return None
            parts.append(an); cuts.insert(0,(q+direction*.42*s).tolist())
        return k.union(parts),[start,end,tip],hits,anchor_hits,cuts
    def ensure_column(j,z):
        key=int(j); pos=xy[j]; top=z+.6*s
        if key in columns:
            columns[key]['top']=max(columns[key]['top'],top); return key
        a=np.r_[pos,g['shaft_radius']]; b=np.r_[pos,top]
        solid=k.union([k.capsule(a,b,g['shaft_radius']),foot(pos)])
        if not clear(solid): return None
        columns[key]={'xy':pos,'top':top,'routes':[]}; return key
    ordered=sorted(demands,key=lambda d:(-d['z_mm'],d['id']))
    for di,d in enumerate(ordered):
        accepted=[]; failures={'direct':0,'external':0,'body':0}
        for cand in d['candidates']:
            if len(accepted)>=d['wanted_contacts']: break
            p=np.array(cand['point_mm']); n=np.array(cand['normal']); end=p+n*g['neck_offset']
            if any(np.linalg.norm(p-np.array(q))<2*s for q in accepted): continue
            found=False
            if p[2]<g['lower_max_z'] and end[2]>2.2*s:
                a=np.r_[end[:2],g['shaft_radius']]
                route=contact_route(d,p,n,a)
                if route is not None:
                    solid,points,hits,ah,cuts=route; f=foot(end[:2])
                    if clear(f):
                        solid=k.union([solid,f]); sid=save('LOWER_DIRECT',solid,points,target=d['target'],contacts=hits,anchor_contacts=[],cut_mm=cuts,foot=True)
                        accepted.append(p.tolist()); bytarget.setdefault(d['target'],[]).append(sid); found=True
                if not found: failures['direct']+=1
            if not found and tree is not None and d['z_mm']>=g['external_min_z']:
                dd,jj=tree.query(end[:2],k=min(64,len(xy)),distance_upper_bound=g['external_search'])
                for distance,j in zip(np.atleast_1d(dd),np.atleast_1d(jj)):
                    if j>=len(xy): continue
                    a=np.r_[xy[j],end[2]-max(g['branch_min_drop'],distance*1.5)]
                    if a[2]<2*s: continue
                    route=contact_route(d,p,n,a)
                    if route is None: continue
                    col=ensure_column(int(j),a[2])
                    if col is None: continue
                    solid,points,hits,ah,cuts=route
                    sid=save('EXTERNAL_SHAFT_BRANCH',solid,points,target=d['target'],column_index=col,contacts=hits,anchor_contacts=[],cut_mm=cuts,foot=False)
                    columns[col]['routes'].append(sid); bytarget.setdefault(d['target'],[]).append(sid); accepted.append(p.tolist()); found=True; break
                if not found: failures['external']+=1
            if not found and atree is not None:
                dd,jj=atree.query(end,k=min(128,len(ap)),distance_upper_bound=g['body_search'])
                for distance,j in zip(np.atleast_1d(dd),np.atleast_1d(jj)):
                    if j>=len(ap): continue
                    anchor=anchors[int(j)]; q=ap[j]; dv=end-q; length=np.linalg.norm(dv)
                    if anchor['owner']==d['target'] or used_anchors.get(int(j),0)>=8: continue
                    if length<g['body_min_length'] or length>g['body_max_length'] or dv[2]<2*s or np.linalg.norm(dv[:2])>dv[2]*1.25: continue
                    direction=dv/length
                    if direction@np.array(anchor['normal'])<.45: continue
                    start=q+direction*1.4*s
                    route=contact_route(d,p,n,start,anchor)
                    if route is None: continue
                    solid,points,hits,ah,cuts=route
                    sid=save('TEMPORARY_BODY_ROUTE',solid,points,target=d['target'],anchor=anchor['owner'],rooted_probe_mm=anchor['rooted_probe_mm'],contacts=hits,anchor_contacts=ah,cut_mm=cuts,foot=False)
                    used_anchors[int(j)]=used_anchors.get(int(j),0)+1
                    accepted.append(p.tolist()); bytarget.setdefault(d['target'],[]).append(sid); found=True; break
                if not found: failures['body']+=1
        contacts[d['target']]={'wanted':d['wanted_contacts'],'accepted':len(accepted),'support_ids':bytarget.get(d['target'],[]),'failures':failures}
        if len(accepted)<d['wanted_contacts']:
            rejected.append({'demand':d['id'],'target':d['target'],'z_mm':d['z_mm'],'wanted':d['wanted_contacts'],'accepted':len(accepted),'reason':'No further source-rule route passed raster, actual non-target intersection and target-contact predicates','attempts':failures})
        if di%100==0:
            print('MINIL_ROUTES',di,len(ordered),'objects',len(rows),'columns',len(columns),flush=True)
            write(out/'GENERATION_PROGRESS.json',{'demands_processed':di+1,'total':len(ordered),'objects':len(rows),'complete':False})
            write(out/'PARTIAL_SUPPORT_PLAN.json',{'candidate_generated':False,'objects':rows,'demands_processed':di+1,'complete':False})
    column_ids={}
    for j,col in sorted(columns.items()):
        a=np.r_[col['xy'],g['shaft_radius']]; b=np.r_[col['xy'],col['top']]
        solid=k.union([k.capsule(a,b,g['shaft_radius']),foot(col['xy'])])
        require(clear(solid),'EXTENDED_COLUMN_COLLISION')
        sid=save('EXTERIOR_COLUMN',solid,[a,b],target=None,contacts=[],anchor_contacts=[],cut_mm=[],foot=True,dependent_routes=col['routes'])
        column_ids[j]=sid
    for row in rows:
        if 'column_index' in row: row['anchor']=column_ids[row.pop('column_index')]
    shafts=[row for row in rows if row['kind'] in ('LOWER_DIRECT','EXTERIOR_COLUMN')]
    braces=[]; missing=[]
    # Source nearest-neighbour rising early/periodic shaft bracing; exact BODY remains obstacle.
    for i,row in enumerate(shafts):
        a=np.array(row['points_mm'][0]); top=np.array(row['points_mm'][1]); choices=sorted([(float(np.linalg.norm(a[:2]-np.array(other['points_mm'][0])[:2])),j) for j,other in enumerate(shafts) if j!=i])[:18]
        buddies=0
        for distance,j in choices:
            if not 1.8*s<distance<7.5*s: continue
            other=shafts[j]; q=np.array(other['points_mm'][0]); ot=np.array(other['points_mm'][1]); rise=max(3*s,1.5*distance)
            made=False
            for z in np.arange(1.2*s,min(top[2],ot[2])-rise,g['brace_step']):
                start=np.r_[a[:2],z]; end=np.r_[q[:2],z+rise]
                solid=k.capsule(start,end,g['brace_radius'])
                if not clear(solid): continue
                sid=save('EARLY_RISING_BRACE',solid,[start,end],target=None,anchor=row['id'],other_anchor=other['id'],contacts=[],anchor_contacts=[],cut_mm=[start.tolist(),end.tolist()],foot=False)
                braces.append(sid); made=True
            if made: buddies+=1
            if buddies>=2: break
        if not buddies: missing.append(row['id'])
    # Report unsupported upper branch brace requirement, never silently claim structural clearance.
    long_routes=[row['id'] for row in rows if row['kind']=='EXTERNAL_SHAFT_BRANCH' and np.linalg.norm(np.array(row['points_mm'][1])-row['points_mm'][0])>14*s]
    result={'case_id':c['case']['case_id'],'candidate_generated':bool(rows),'objects':rows,'mesh_count':len(rows),
            'geometry_role':'REMOVABLE_SUPPORT_SEPARATE_FROM_ARTWORK','demands_processed':len(ordered),'demands_total':len(demands),'all_height_demands_processed':True,
            'unbraced_shaft_ids':missing,'long_branch_upper_brace_pending_ids':long_routes,'print_go':False}
    write(out/'support_geometry.json',result); write(out/'UNHANDLED.json',{'demands':rejected,'count':len(rejected),'contact_counts':contacts})
    write(out/'GENERATION_PROGRESS.json',{'demands_processed':len(ordered),'total':len(ordered),'objects':len(rows),'complete':True})
    c['generated']=result; c['support_solids']=solids
    return result
