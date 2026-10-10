"""Author-requested finished-model support-distance heuristic, not strength analysis."""
import pathlib,sys,json,math,hashlib,time,collections
O=pathlib.Path(__file__).resolve().parent.parent/'outputs'
sys.path.insert(0,str(O/'route_runtime'))
from real_graph import Context,project,interpolate
import networkx as nx

def score_graph(g,seeds,bonus=.35):
    seeds=set(seeds)&set(g)
    distances=nx.multi_source_dijkstra_path_length(g,seeds,weight='length_mm') if seeds else {}
    augmented=g.copy();root='__COLOR_SUPPORT_REFERENCE__'
    assert root not in augmented
    augmented.add_node(root)
    augmented.add_edges_from((root,n) for n in seeds)
    shared_support_backbone=set()
    # A cycle through the virtual support reference joins two distinct support
    # contact regions. A dangling/shared tail is excluded. This is NOT a proof
    # of physical-branch- or joint-independent support, nor of support strength.
    for edges in nx.biconnected_component_edges(augmented):
        if len(edges)>2 and any(root in e for e in edges):
            shared_support_backbone.update(frozenset(e) for e in edges if root not in e)
    result={}
    for a,b,d in g.edges(data=True):
        length=d['length_mm'];distance=min(distances.get(a,math.inf),distances.get(b,math.inf))+length/2
        merged=frozenset((a,b)) in shared_support_backbone
        result[frozenset((a,b))]={'distance_mm':distance if math.isfinite(distance) else None,
                                 'effective_distance_mm':distance*(1-bonus if merged else 1) if math.isfinite(distance) else None,
                                 'merge_bonus':merged}
    return result,distances

def fixtures():
    def graph(edges):
        g=nx.Graph()
        for a,b,l in edges:g.add_edge(a,b,length_mm=l)
        return g
    g=graph([('S','A',10),('A','B',10),('A','C',8)])
    r,d=score_graph(g,['S']);assert d['B']==20 and d['A']==10
    assert not any(x['merge_bonus'] for x in r.values())
    g=graph([('S1','M',10),('M','S2',10),('M','TAIL',15)])
    r,d=score_graph(g,['S1','S2'])
    assert r[frozenset(('S1','M'))]['merge_bonus']
    assert r[frozenset(('M','S2'))]['merge_bonus']
    assert not r[frozenset(('M','TAIL'))]['merge_bonus']
    assert r[frozenset(('S1','M'))]['effective_distance_mm']==3.25
    g.add_edge('UNLINKED1','UNLINKED2',length_mm=2)
    r,d=score_graph(g,['S1','S2']);assert r[frozenset(('UNLINKED1','UNLINKED2'))]['distance_mm'] is None
    split=graph([('S1','X',5),('X','M',5),('M','S2',10),('M','TAIL',15)])
    rr,dd=score_graph(split,['S1','S2']);assert dd['M']==d['M'] and dd['TAIL']==d['TAIL']
    return {'pass':True,'checks':['Distance increases along a singly supported chain','One trunk with forks gains no merge bonus','Path between two support regions gains bonus','Shared/dangling tail gains no bonus','Unconnected crossing/unreachable stays unknown','Subdivision preserves node distances and tail classification']}

def main():
    started=time.perf_counter();test=fixtures();c=Context(O)
    locks=json.loads((O/'TRANSFORM_AND_REFERENCE_LOCKS.json').read_text())
    support=json.loads(pathlib.Path(locks['locks']['support_source']['path']).read_text())['objects']
    surface_path=pathlib.Path(locks['locks']['flower_source']['path']);raw=surface_path.read_bytes()
    assert hashlib.sha256(raw).hexdigest()==locks['locks']['flower_source']['sha256']
    flowers={f['id']:f for f in json.loads(raw)['surface']}
    permanent={mid:m for mid,m in c.members.items() if m['role']=='PERMANENT'}
    sg=nx.Graph();support_ids={r['id'] for r in support};sg.add_nodes_from(support_ids);sg.add_node('BED')
    def references(v):return v if isinstance(v,list) else [v] if isinstance(v,str) else []
    for r in support:
        for ref in references(r.get('anchor'))+references(r.get('target')):
            if ref=='BED' or ref in support_ids:sg.add_edge(r['id'],ref)
    grounded=set(nx.node_connected_component(sg,'BED'))-{'BED'}
    contacts=[]
    for r in support:
        if r['id'] not in grounded:continue
        pts=r.get('points_mm',[])
        for field,index in [('anchor',0),('target',-1)]:
            for ref in references(r.get(field)):
                if ref in flowers:contacts.append({'support_id':r['id'],'target':ref,'kind':'DECLARED_FLOWER_SUPPORTED_REGION'})
                elif ref in permanent and pts:
                    p=c.plate(pts[index]);contacts.append({'support_id':r['id'],'target':ref,'parameter':project(permanent[ref]['points'],p),'kind':'DECLARED_BRANCH_SUPPORT_CONTACT'})
    params={mid:{float(i) for i in range(len(m['points']))} for mid,m in permanent.items()}
    # Short display/metric segments retain every original polyline bend and
    # every declared attachment location; no coordinate-nearness edge search.
    for mid,m in permanent.items():
        for i,(a,b) in enumerate(zip(m['points'],m['points'][1:])):
            pieces=max(1,math.ceil(math.dist(a,b)/2))
            params[mid].update(i+j/pieces for j in range(1,pieces))
    links=[(a,ta,b,tb,origin) for a,ta,b,tb,origin in c.declared if a in permanent and b in permanent]
    for a,ta,b,tb,_ in links:params[a].add(ta);params[b].add(tb)
    for con in contacts:
        if con['target'] in permanent:params[con['target']].add(con['parameter'])
    g=nx.Graph();nodes={};segments=[]
    for mid,m in permanent.items():
        values=sorted({round(t,9) for t in params[mid]});nodes[mid]={}
        for i,t in enumerate(values):
            n=f'{mid}:{i}';p=interpolate(m['points'],t);nodes[mid][t]=n;g.add_node(n,position=p,branch_id=mid)
        for ta,tb in zip(values,values[1:]):
            a,b=nodes[mid][ta],nodes[mid][tb];pa,pb=g.nodes[a]['position'],g.nodes[b]['position']
            length=math.dist(pa,pb)
            if length<1e-8:continue
            g.add_edge(a,b,length_mm=length,kind='PERMANENT_CENTERLINE',branch_id=mid)
            segments.append({'branch_id':mid,'a':pa,'b':pb,'nodes':[a,b]})
    def node(mid,t):return nodes[mid][round(t,9)]
    for a,ta,b,tb,origin in links:
        na,nb=node(a,ta),node(b,tb)
        if na!=nb:g.add_edge(na,nb,length_mm=math.dist(g.nodes[na]['position'],g.nodes[nb]['position']),kind='DECLARED_NAMED_ATTACHMENT')
    referenced_flowers={m['target'] for m in permanent.values() if m['target'] in flowers}
    for fid in referenced_flowers:
        f=flowers[fid];base=f.get('connection_base_local_mm',[0,0,0]);mat=f['orientation_matrix']
        p=[f['position_mm'][i]+sum(mat[i][j]*base[j] for j in range(3)) for i in range(3)]
        g.add_node(fid,position=c.plate(p),kind='DECLARED_FLOWER_BODY_HUB')
    for mid,m in permanent.items():
        fid=m['target']
        if fid not in referenced_flowers:continue
        n=node(mid,len(m['points'])-1)
        g.add_edge(n,fid,length_mm=math.dist(g.nodes[n]['position'],g.nodes[fid]['position']),kind='DECLARED_FLOWER_BODY_ATTACHMENT')
    seeds=set();grounding=[]
    for con in contacts:
        target=con['target']
        n=target if target in referenced_flowers else node(target,con['parameter']) if target in permanent else None
        if n is not None:seeds.add(n);grounding.append(dict(con,graph_node=n))
    for mid,m in permanent.items():
        if m['parent']=='BED':
            n=node(mid,0.);seeds.add(n);grounding.append({'target':mid,'graph_node':n,'kind':'DECLARED_PERMANENT_BASE'})
    result,distances=score_graph(g,seeds)
    stops=[(0.,(.035,.65,.23)),(.5,(1.,.8,.025)),(1.,(.94,.025,.035))]
    palette=[]
    for i in range(32):
        t=i/31;lo,hi=(stops[0],stops[1]) if t<=.5 else (stops[1],stops[2]);f=(t-lo[0])/(hi[0]-lo[0])
        palette.append([lo[1][k]*(1-f)+hi[1][k]*f for k in range(3)])
    by_branch=collections.defaultdict(list)
    for s in segments:
        r=result[frozenset(s.pop('nodes'))];s.update(r);v=r['effective_distance_mm']
        s['color_bin']=None if v is None else min(31,int(round(max(0,v)/30*31)))
        by_branch[s['branch_id']].append(s)
    assert len(by_branch)==9421
    known=sorted(s['effective_distance_mm'] for s in segments if s['effective_distance_mm'] is not None)
    quantiles={str(q):known[min(len(known)-1,int((len(known)-1)*q))] for q in [0,.25,.5,.75,.9,.95,1]}
    report={'state':'AUTHOR_HEURISTIC_FINISHED_MODEL_WITH_SUPPORT','baseline_sha256':c.baseline,
            'source_support_sha256':locks['locks']['support_source']['sha256'],'source_flower_sha256':locks['locks']['flower_source']['sha256'],
            'rules':{'distance':'Shortest arclength over Permanent centerlines and named/flower-body declared connections to a grounded external Support contact region or Permanent bed base',
                     'merge_bonus_fraction':.35,'merge_eligibility':'Edges on the augmented graph biconnected component through two distinct support-contact regions; dangling/shared tails excluded. Not physical branch/joint independence.',
                     'color_green_distance_mm':0,'color_yellow_distance_mm':15,'color_red_distance_mm':30,'gray':'No mapped route to a selected support region; not proven dangerous',
                     'effective_distance':'raw distance * 0.65 on eligible merged paths, otherwise raw distance','physical_calibration':'NONE: user-requested visualization heuristic'},
            'assumptions':['Finished geometry; all retained external supports assumed present and supporting, not current live printer telemetry','Support contacts and named attachments are declared, not globally verified solid contact','A supported flower is treated as one supported region; flower-body links use a virtual base hub','Body-to-body temporary members without an all-Support path to BED do not independently create safe seeds','Support strength/failure, loads, buckling, bonding and same-layer toolpath order are not modeled','Colors are heuristic ranking, not physical PASS or a reclassification of V2 verified-route evidence'],
            'branch_count':len(by_branch),'segment_count':len(segments),'support_record_count':len(support),'support_only_bed_connected_records':len(grounded),
            'contact_region_count':len(seeds),'grounding_contact_count':len(grounding),'unknown_segment_count':sum(s['color_bin'] is None for s in segments),
            'bonus_segment_count':sum(s['merge_bonus'] for s in segments),'effective_distance_quantiles_mm':quantiles,
            'palette':palette,'unknown_color':[.34,.38,.43],'segments':segments,'elapsed_s':time.perf_counter()-started,
            'new_slice':0,'send':0,'print':0,'manufacturing_geometry_changed':False}
    (O/'SUPPORT_DISTANCE_COLORS.json').write_text(json.dumps(report,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    (O/'SUPPORT_DISTANCE_COLOR_SEEDS.json').write_text(json.dumps(grounding,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    (O/'SUPPORT_DISTANCE_COLOR_TESTS.json').write_text(json.dumps(test,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in ('segments','palette')},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
