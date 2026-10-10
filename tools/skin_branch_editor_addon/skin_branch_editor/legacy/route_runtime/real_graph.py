"""MINI_A full declared graph with selected real clipped-mesh replacement.

Outside the measured region, below-height centerline fragments are a declared
approximation, not verified material. No contact is inferred between unnamed
nearby members. The 18 measured members retain separate actual components.
"""
import json,math,hashlib,time,pathlib,sys
_local_dependency=pathlib.Path(__file__).with_name('networkx-3.6.1.zip')
sys.path.insert(0,str(_local_dependency)) if _local_dependency.exists() else sys.path.append(r'J:\My Drive\codex\2026-09-05\files-mentioned-by-the-user-samples\work\r2\vendor')
import networkx as nx
from route_analysis import analyze,impact,reachable,VERSION

def interpolate(points,t):
    i=min(int(t),len(points)-2);f=t-i
    return [points[i][k]*(1-f)+points[i+1][k]*f for k in range(3)]

def project(points,p):
    best=(float('inf'),0.)
    for i,(a,b) in enumerate(zip(points,points[1:])):
        d=[b[k]-a[k] for k in range(3)];den=sum(x*x for x in d)
        f=max(0.,min(1.,sum((p[k]-a[k])*d[k] for k in range(3))/den)) if den else 0.
        distance=sum((a[k]+f*d[k]-p[k])**2 for k in range(3))
        if distance<best[0]:best=(distance,i+f)
    return best[1]

def clipped_intervals(points,h):
    result=[]
    for i,(a,b) in enumerate(zip(points,points[1:])):
        if a[2]>h and b[2]>h:continue
        lo,hi=float(i),float(i+1)
        if a[2]>h:lo=i+(h-a[2])/(b[2]-a[2])
        if b[2]>h:hi=i+(h-a[2])/(b[2]-a[2])
        if hi-lo<1e-10:continue
        if result and abs(result[-1][1]-lo)<1e-9:result[-1][1]=hi
        else:result.append([lo,hi])
    return result

class Context:
    def __init__(self,output_root):
        self.out=pathlib.Path(output_root)
        binding=json.loads((self.out/'SOURCE_BINDING.json').read_text(encoding='utf-8'))
        if not binding['gate_pass']:raise RuntimeError('Source binding not accepted')
        self.baseline=binding['editable_candidate']['container_sha256']
        locks=json.loads((self.out/'TRANSFORM_AND_REFERENCE_LOCKS.json').read_text(encoding='utf-8'))
        s=locks['source_world_to_plate_scale'];t=locks['source_world_to_plate_translation_mm']
        self.plate=lambda p:[p[k]*s+t[k] for k in range(3)]
        self.input_paths=[self.out/'SOURCE_BINDING.json',self.out/'TRANSFORM_AND_REFERENCE_LOCKS.json',self.out/'SELECTED_GEOMETRY_HEIGHT_CACHE.json']
        def locked_json(record):
            path=pathlib.Path(record['path']);raw=path.read_bytes()
            if hashlib.sha256(raw).hexdigest()!=record['sha256']:
                raise RuntimeError('Source hash changed; source binding must be reviewed: '+str(path))
            self.input_paths.append(path)
            return json.loads(raw)
        rows=locked_json(binding['source_records']['local_lobe'])['members']
        rows+=locked_json(binding['source_records']['roots'])
        support=locked_json(locks['locks']['support_source'])['objects']
        self.members={}
        for role,records in [('PERMANENT',rows),('SUPPORT',support)]:
            for r in records:
                if len(r.get('points_mm',[]))<2:continue
                self.members[r['id']]={'id':r['id'],'role':role,'points':[self.plate(p) for p in r['points_mm']],
                                       'parent':r.get('parent_id') if role=='PERMANENT' else r.get('anchor'),
                                       'target':r.get('target_id') if role=='PERMANENT' else r.get('target'),
                                       'flower_id':r.get('flower_id'), 'kind':r.get('kind')}
        raw=(self.out/'SELECTED_GEOMETRY_HEIGHT_CACHE.json').read_bytes()
        cache=json.loads(raw);self.contact_hash=hashlib.sha256(raw).hexdigest()
        self.snapshots={r['model_z_mm']:r for r in cache['snapshots']};self.selected=set(cache['member_ids'])
        self.declared=[];self.junctions={}
        for m in self.members.values():
            target=m['target']
            if isinstance(target,str) and target.startswith('J'):
                self.junctions.setdefault(target,[]).append((m['id'],len(m['points'])-1))
        # Parameterize declared attachment on its named source only.
        for m in self.members.values():
            p=m['parent'];q=m['target'];end=len(m['points'])-1
            if isinstance(p,str) and p in self.members:
                self.declared.append((m['id'],0.,p,project(self.members[p]['points'],m['points'][0]),'PARENT'))
            elif p in self.junctions if isinstance(p,str) else False:
                for other,param in self.junctions[p]:self.declared.append((m['id'],0.,other,float(param),p))
            if isinstance(q,str) and q in self.members:
                self.declared.append((m['id'],float(end),q,project(self.members[q]['points'],m['points'][-1]),'TARGET'))
        self.cache={}
        self.event_cache={}
        self.input_signature=self.current_input_signature()

    def current_input_signature(self):
        return tuple((str(p),p.stat().st_size,p.stat().st_mtime_ns) for p in self.input_paths)

    def inputs_changed(self):
        try:return self.current_input_signature()!=self.input_signature
        except OSError:return True

    def key(self,h,mode,edits):
        return hashlib.sha256(json.dumps([VERSION,self.baseline,self.contact_hash,h,mode,edits,['R0000','R0001'],'F3457'],sort_keys=True,separators=(',',':')).encode()).hexdigest()

    def height_events(self,mode,edits=()):
        """Conditional grid-event estimates, not an exhaustive physical history.

        Explicit action only: global evaluation is too expensive for a slider.
        Before the stable single target, separate components cannot share a
        single count. Named-parent approximation may also break monotonicity;
        the assumption is retained in the result, never promoted to proof.
        """
        if self.inputs_changed():raise RuntimeError('STALE: route inputs changed')
        key=self.key('HEIGHT_EVENTS',mode,edits)
        if key in self.event_cache:return self.event_cache[key]
        start=time.perf_counter();upper=max(self.snapshots)
        counts={h:sum(n['physical_member_id']=='F3457' for n in s['nodes']) for h,s in self.snapshots.items()}
        stable=round(max(h for h,n in counts.items() if n!=1)+.2,8);samples={}
        def count(h):
            if h not in samples:
                targets=self.evaluate(h,mode,edits)['targets']
                samples[h]=targets[0]['graph_count'] if len(targets)==1 else None
            return samples[h]
        def onset(k):
            first=count(stable)
            if first is None:return {'status':'UNRESOLVED'}
            if first>=k:return {'status':'AT_OR_BEFORE_STABLE_TARGET','upper_bound_model_z_mm':stable}
            last=count(upper)
            if last is None:return {'status':'UNRESOLVED'}
            if last<k:return {'status':'NOT_FOUND_THROUGH_RANGE','through_model_z_mm':upper}
            lo=int(round(stable*5));hi=int(round(upper*5))
            while hi-lo>1:
                mid=(hi+lo)//2;value=count(mid/5)
                if value is None:return {'status':'UNRESOLVED'}
                if value>=k:hi=mid
                else:lo=mid
            return {'status':'DECLARED_GRAPH_EVENT_ESTIMATE','first_grid_height_mm':hi/5,'previous_grid_height_mm':lo/5}
        events={str(k):onset(k) for k in [1,2]}
        first=events['1'];second=events['2'];interval=None
        if first['status']=='DECLARED_GRAPH_EVENT_ESTIMATE':
            end=(second.get('previous_grid_height_mm') if second['status']=='DECLARED_GRAPH_EVENT_ESTIMATE'
                 else upper if second['status']=='NOT_FOUND_THROUGH_RANGE' else None)
            if end is not None:interval=[first['first_grid_height_mm'],end]
        result={'cache_key':key,'analysis_version':VERSION,'mode':mode,'new_branch_count':len(edits),
                'stable_single_target_from_model_z_mm':stable,'through_model_z_mm':upper,'route_onset_estimates':events,
                'single_route_interval_estimate_mm':interval,'elapsed_s':time.perf_counter()-start,
                'assumption':'Monotonic supplied-graph connectivity after stable single F3457 component; named-parent projection and unmeasured contacts remain unresolved. No physical or toolpath timing claim.',
                'sampled_heights':samples,'earlier_fragmented_target_interval':'NOT_SUMMARIZED_AS_A_SINGLE_COUNT',
                'physical_strength':'UNVERIFIED','baseline_sha256':self.baseline,'contact_ledger_sha256':self.contact_hash}
        if len(self.event_cache)>=4:self.event_cache.pop(next(iter(self.event_cache)))
        self.event_cache[key]=result
        return result

    def build(self,h,mode,edits=()):
        if h not in self.snapshots:raise ValueError('First release supports model heights 0–156 mm on the 0.2 mm measured grid')
        g=nx.Graph();g.add_node('MODEL_BASE',role='MODEL_BASE');pieces={};unknown=[]
        actual=self.snapshots[h]
        for n in actual['nodes']:
            if n['role']=='SUPPORT' and mode=='PERMANENT_ONLY_AFTER_REMOVAL':continue
            mid=n['physical_member_id'];bb=n['bbox_plate_mm']
            g.add_node(n['id'],branch_id=None if mid=='F3457' else mid,member_id=mid,role=n['role'],
                       flower_ids=['F3457'] if mid=='F3457' else [],bbox=[bb[:3],bb[3:]],geometry='ACTUAL_CLIPPED_COMPONENT')
            pieces.setdefault(mid,[]).append(n['id'])
            if mid in self.members and self.members[mid]['parent']=='BED' and abs(bb[2])<1e-5:
                g.add_edge(n['id'],'MODEL_BASE',joint_id='BASE:'+mid,evidence='MODEL_BASE_PLANE_CONTACT',contact_kind='BEARING_CONTACT')
        for c in actual['contacts']:
            if c['a'] in g and c['b'] in g:g.add_edge(c['a'],c['b'],**{k:v for k,v in c.items() if k not in ('a','b')})
        for m in self.members.values():
            mid=m['id']
            if mid in self.selected or (m['role']=='SUPPORT' and mode=='PERMANENT_ONLY_AFTER_REMOVAL'):continue
            for i,(lo,hi) in enumerate(clipped_intervals(m['points'],h)):
                nid=f'{mid}@{i}';pts=[interpolate(m['points'],lo),interpolate(m['points'],hi)]
                pts.extend(m['points'][j] for j in range(math.ceil(lo),math.floor(hi)+1))
                flowers=[];target=m['target']
                if hi>=len(m['points'])-1-1e-8 and isinstance(target,str) and target.startswith('F'):
                    flowers=[target]
                g.add_node(nid,branch_id=mid,member_id=mid,role=m['role'],flower_ids=flowers,
                           bbox=[[min(p[k] for p in pts) for k in range(3)],[max(p[k] for p in pts) for k in range(3)]],
                           interval=(lo,hi),geometry='CENTERLINE_CLIP_APPROXIMATION')
                pieces.setdefault(mid,[]).append(nid)
                if lo<=1e-8 and m['parent']=='BED':
                    evidence='MODEL_BASE_GEOMETRY_CHECKED' if mid in ('R0000','R0001') else 'DECLARED_CONNECTION'
                    g.add_edge(nid,'MODEL_BASE',joint_id='BASE:'+mid,evidence=evidence,contact_kind='BEARING_CONTACT' if m['role']=='SUPPORT' else 'MODEL_BASE')
        def resolve(mid,param):
            candidates=pieces.get(mid,[])
            if mid not in self.selected:
                return next((n for n in candidates if g.nodes[n]['interval'][0]-1e-8<=param<=g.nodes[n]['interval'][1]+1e-8),None)
            if mid not in self.members:return None
            p=interpolate(self.members[mid]['points'],param)
            if p[2]>h+1e-7:return None
            hits=[n for n in candidates if all(g.nodes[n]['bbox'][0][k]-1e-5<=p[k]<=g.nodes[n]['bbox'][1][k]+1e-5 for k in range(3))]
            if len(hits)==1:return hits[0]
            unknown.append({'member':mid,'parameter':param,'reason':'Selected actual component attachment ambiguous or absent; no connection inferred'})
            return None
        for a,ta,b,tb,origin in self.declared:
            if a in self.selected and b in self.selected:continue # actual clip contacts govern these pairs
            na,nb=resolve(a,ta),resolve(b,tb)
            if na and nb and na!=nb:
                support=g.nodes[na]['role']!=g.nodes[nb]['role']
                g.add_edge(na,nb,joint_id=f'DECLARED:{a}|{b}|{origin}',evidence='DECLARED_CONNECTION',
                           contact_kind='BEARING_CONTACT' if support else 'DECLARED_MATERIAL_CONTACT')
        for e in edits:
            mid=e['id'];pts=[e['a_position'],e['b_position']]
            for i,(lo,hi) in enumerate(clipped_intervals(pts,h)):
                nid=f'{mid}@{i}';pp=[interpolate(pts,lo),interpolate(pts,hi)]
                g.add_node(nid,branch_id=mid,member_id=mid,role='AUTHOR_ADDITION',flower_ids=[],
                           bbox=[[min(p[k] for p in pp) for k in range(3)],[max(p[k] for p in pp) for k in range(3)]],geometry='DESIGN_INTENT_PREDICTION')
                for ep,param in [('a',0.),('b',1.)]:
                    if not lo-1e-8<=param<=hi+1e-8:continue
                    source_id=e[ep+'_member'];source_param=e[ep+'_parameter']
                    attached=resolve(source_id,source_param)
                    if attached:g.add_edge(nid,attached,joint_id=f'INTENT:{mid}:{ep}',evidence='DESIGN_INTENT_PREDICTION',contact_kind='UNVERIFIED_NEW_BRANCH')
        return g,unknown

    def evaluate(self,h,mode,edits=(),failure=None):
        if self.inputs_changed():raise RuntimeError('STALE: source/contact inputs changed; reload the route context before re-evaluation')
        h=round(round(float(h)*5)/5,8) # Blender FloatProperty storage is float32.
        if mode not in ('PRINTING_WITH_SUPPORT','PERMANENT_ONLY_AFTER_REMOVAL'):raise ValueError('Unknown holding mode')
        start=time.perf_counter();key=self.key(h,mode,edits)
        if key not in self.cache:
            g,unknown=self.build(h,mode,edits)
            targets=[n for n,d in g.nodes(data=True) if d.get('member_id')=='F3457']
            results=[analyze(g,n,['MODEL_BASE'],False) for n in targets]
            for r in results:
                r['verified_model_geometry_route_lower_bound']=sum(
                    all(e in ('GEOMETRY_CONTACT_VERIFIED','MODEL_BASE_PLANE_CONTACT','MODEL_BASE_GEOMETRY_CHECKED') for e in w['evidence_levels'])
                    for w in r['witnesses'])
                r['verified_lower_bound_scope']='Geometric connection to model base, including stated bearing assumptions; not actual raft/toolpath/strength verification'
            connected=reachable(g,['MODEL_BASE'])
            connected_branches={g.nodes[n]['branch_id'] for n in connected if g.nodes[n].get('branch_id')}
            connected_flowers={f for n in connected for f in g.nodes[n].get('flower_ids',[])}
            result={'cache_key':key,'analysis_version':VERSION,'edit_delta_sha256':hashlib.sha256(json.dumps(edits,sort_keys=True,separators=(',',':')).encode()).hexdigest(),
                    'base_ids':['MODEL_BASE'],'permanent_base_member_ids':['R0000','R0001'],'model_z_mm':h,'mode':mode,'region':'F3457 DEMO, physical damage location unknown',
                    'scope':'Full declared source graph, centerline-clipped outside 18 measured meshes. Physical route counts remain unresolved.',
                    'targets':results,'unresolved_selected_attachments':unknown,'node_count':len(g),'edge_count':g.number_of_edges(),
                    'evidence_level':'MIXED_DECLARED_AND_SELECTED_GEOMETRY','height_semantics':'GEOMETRY_LAYER_END_ESTIMATE',
                    'toolpath_status':'TOOLPATH_UNVERIFIED','raft_mapping':'ASSUMED_0.6_MM_NOT_USED_IN_MODEL_HEIGHT',
                    'base_connected_branch_count':len(connected_branches),'base_connected_flower_count':len(connected_flowers),
                    'connected_count_scope':'Unique IDs in supplied global graph, including declared terminal flower associations; not verified physical holding or complete flower geometry',
                    'physical_strength':'UNVERIFIED','new_branch_count':len(edits),'baseline_sha256':self.baseline,
                    'contact_ledger_sha256':self.contact_hash,'global_incidental_contacts':'NOT_EXHAUSTIVELY_VERIFIED',
                    'global_flower_to_flower_connections':'NOT_INFERRED','selected_boundary_attachments':'DECLARED_NAMED_PARENT_PROJECTION_TO_UNIQUE_COMPONENT_BBOX; NOT_VERIFIED_CONTACT',
                    'base_semantics':'Model base plane and declared bed anchors; actual raft/bed toolpath connection unresolved'}
            if len(self.cache)>=4:self.cache.pop(next(iter(self.cache)))
            self.cache[key]=(g,result)
        g,base=self.cache[key];result=dict(base)
        if failure:result['failure_impact']=impact(g,['MODEL_BASE'],failure['kind'],failure['id'])
        result['elapsed_s']=time.perf_counter()-start
        return result
