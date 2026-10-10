"""MINI_A scoped graph analysis. Input must already represent below-height fragments.

No spatial proximity creates an edge here. One physical branch ID can label
several disconnected fragments; this module never merges those fragments.
"""
import itertools
import networkx as nx

VERSION = 'MINIA_ROUTE_V1'

def reachable(graph, bases):
    seen = set()
    for base in bases:
        if base in graph and base not in seen:
            seen.update(nx.node_connected_component(graph, base))
    return seen

def failed_graph(graph, kind, identity):
    cut = graph.copy()
    if kind == 'branch':
        cut.remove_nodes_from([n for n, d in graph.nodes(data=True) if d.get('branch_id') == identity])
    elif kind == 'joint':
        cut.remove_nodes_from([n for n, d in graph.nodes(data=True) if d.get('joint_id') == identity])
        cut.remove_edges_from([(a,b) for a,b,d in graph.edges(data=True) if d.get('joint_id') == identity])
    else:
        raise ValueError(kind)
    return cut

def impact(graph, bases, kind, identity):
    present=(any(d.get('branch_id')==identity for _,d in graph.nodes(data=True)) if kind=='branch'
             else any(d.get('joint_id')==identity for _,d in graph.nodes(data=True))
             or any(d.get('joint_id')==identity for _,_,d in graph.edges(data=True)))
    before = reachable(graph, bases)
    cut = failed_graph(graph, kind, identity)
    after = reachable(cut, bases)
    lost = before - after
    # Exclude the deliberately deleted material from the collateral-loss count.
    removed = set(graph) - set(cut)
    collateral = lost - removed
    def ids(nodes, field):
        return sorted({graph.nodes[n][field] for n in nodes if graph.nodes[n].get(field)})
    branch_ids = ids(collateral, 'branch_id')
    affected_flowers = {f for n in lost for f in graph.nodes[n].get('flower_ids', [])}
    retained_flowers = {f for n in after for f in graph.nodes[n].get('flower_ids', [])}
    flowers = sorted(affected_flowers-retained_flowers)
    partial = []
    for bid in branch_ids:
        if any(d.get('branch_id') == bid and n in after for n,d in graph.nodes(data=True)):
            partial.append(bid)
    bounds = [graph.nodes[n]['bbox'] for n in collateral if graph.nodes[n].get('bbox')]
    bbox = None if not bounds else [[min(b[0][i] for b in bounds) for i in range(3)], [max(b[1][i] for b in bounds) for i in range(3)]]
    return {'failure_kind':kind, 'failure_id':identity,'failure_present_in_graph':present,
            'failure_status':'EVALUATED_IN_SUPPLIED_GRAPH' if present else 'SELECTED_FAILURE_NOT_PRESENT_AT_HEIGHT',
            'lost_fragment_ids':sorted(collateral), 'removed_fragment_ids':sorted(removed),
            'lost_branch_ids':branch_ids,'lost_branch_count':len(branch_ids),
            'partially_disconnected_branch_ids':partial,
            'affected_flower_ids':sorted(affected_flowers),
            'partially_disconnected_flower_ids':sorted(affected_flowers & retained_flowers),
            'lost_flower_ids':flowers,'lost_flower_count':len(flowers),'bbox':bbox}

def _branch_set(graph, path):
    return {graph.nodes[n]['branch_id'] for n in path if graph.nodes[n].get('branch_id')}

def _witness(graph, path):
    return {'fragment_ids':path,'branch_ids':sorted(_branch_set(graph,path)),
            'contacts':[{'a':a,'b':b,'joint_id':graph.edges[a,b].get('joint_id'),
                         'evidence':graph.edges[a,b].get('evidence','UNRESOLVED'),
                         'contact_kind':graph.edges[a,b].get('contact_kind','UNRESOLVED'),
                         'command_line':graph.edges[a,b].get('command_line')}
                        for a,b in zip(path,path[1:])],
            'bearing_assumption':any(graph.edges[a,b].get('contact_kind')=='BEARING_CONTACT' for a,b in zip(path,path[1:])),
            'joint_ids':sorted({graph.edges[a,b]['joint_id'] for a,b in zip(path,path[1:]) if graph.edges[a,b].get('joint_id')}),
            'evidence_levels':sorted({graph.edges[a,b].get('evidence','UNRESOLVED') for a,b in zip(path,path[1:])})}

def analyze(graph, target, bases, complete_contact_graph=False):
    """Return 0/1/2/3+ in the supplied graph, separate from real completeness.

    Node-split max flow supplies an upper bound. Witnesses are accepted only if
    their physical branch sets are disjoint. Shared fragments never get an
    implicit capacity-sharing hub (which would create phantom connectivity).
    """
    bases = [b for b in bases if b in graph]
    result = {'version':VERSION,'target':target,'bases':bases,'physical_strength':'UNVERIFIED',
              'contact_graph_complete':complete_contact_graph,'witnesses':[],
              'common_branch_failures':[],'common_joint_failures':[]}
    if target not in graph:
        return dict(result,status='TARGET_NOT_PRESENT_AT_HEIGHT',graph_count=None,lower=0,upper=None,color='GRAY')
    if target in bases:
        return dict(result,status='TARGET_IS_BASE_NOT_A_BRANCH_ROUTE',graph_count=None,lower=0,upper=None,color='GRAY')
    if target not in reachable(graph,bases):
        return dict(result,status='RESOLVED_IN_SUPPLIED_GRAPH',graph_count=0,lower=0,upper=0,color='PURPLE' if complete_contact_graph else 'GRAY')
    # Integer tuple labels prevent collisions with user IDs or BASE names.
    index={n:i for i,n in enumerate(graph)}; reverse={i:n for n,i in index.items()}
    flow=nx.DiGraph();sink=(-1,0)
    for n,d in graph.nodes(data=True):
        i=index[n];flow.add_edge((i,0),(i,1),capacity=1 if d.get('branch_id') else 3)
    for a,b in graph.edges:
        flow.add_edge((index[a],1),(index[b],0),capacity=3)
        flow.add_edge((index[b],1),(index[a],0),capacity=3)
    for b in bases:flow.add_edge((index[b],1),sink,capacity=3)
    source=(index[target],0)
    residual=nx.algorithms.flow.edmonds_karp(flow,source,sink,cutoff=3)
    upper=min(3,int(residual.graph['flow_value']))
    positive=nx.DiGraph()
    for a,b,d in residual.edges(data=True):
        if d['flow']>0:positive.add_edge(a,b,remaining=int(d['flow']))
    candidates=[]
    for _ in range(upper):
        path=nx.shortest_path(positive,source,sink)
        original=[]
        for i,side in path:
            if i>=0 and side==0:original.append(reverse[i])
        candidates.append(original)
        for a,b in zip(path,path[1:]):
            positive[a][b]['remaining']-=1
            if positive[a][b]['remaining']==0:positive.remove_edge(a,b)
    if any(not _branch_set(graph,p) for p in candidates):
        return dict(result,status='UNRESOLVED_BRANCHLESS_BASE_PATH',graph_count=None,lower=0,upper=None,color='GRAY')
    best=[]
    for size in range(len(candidates),0,-1):
        for subset in itertools.combinations(candidates,size):
            sets=[_branch_set(graph,p) for p in subset]
            if all(not(a & b) for a,b in itertools.combinations(sets,2)):
                best=list(subset);break
        if best:break
    # Any one branch on a known path that disconnects the target is a proof
    # of a global single-branch bottleneck within this supplied graph.
    for bid in sorted(_branch_set(graph,candidates[0])):
        if target not in reachable(failed_graph(graph,'branch',bid),bases):
            result['common_branch_failures'].append(bid)
    joints={d.get('joint_id') for _,_,d in graph.edges(data=True)} | {d.get('joint_id') for _,d in graph.nodes(data=True)}
    # A common joint must occur on any known path; avoid testing all 9000 IDs.
    first=candidates[0]
    on_path={graph.nodes[n].get('joint_id') for n in first} | {graph.edges[a,b].get('joint_id') for a,b in zip(first,first[1:])}
    for jid in sorted((on_path & joints)-{None}):
        if target not in reachable(failed_graph(graph,'joint',jid),bases):
            result['common_joint_failures'].append(jid)
    if result['common_branch_failures']:upper=1
    lower=len(best)
    count=lower if lower==upper else None
    result.update(status='RESOLVED_IN_SUPPLIED_GRAPH' if count is not None else 'UNRESOLVED_SHARED_BRANCH_CAPACITY',
                  graph_count=count,lower=lower,upper=upper,witnesses=[_witness(graph,p) for p in best],
                  color=({0:'PURPLE',1:'RED',2:'YELLOW',3:'BLUE'}[count] if count is not None and complete_contact_graph else 'GRAY'))
    return result

def snapshot(nodes, contacts, height, mode, command_prefix=None):
    """Assemble pre-clipped/fixture fragment records, never clip whole members.

    For real data the caller must provide the actual clipped components.
    'present_from' is a fragment event, not minimum Z of an entire branch.
    """
    g=nx.Graph()
    for n in nodes:
        if mode=='PERMANENT_ONLY_AFTER_REMOVAL' and n.get('role') in ('SUPPORT','RAFT'):continue
        if height<n.get('present_from',float('-inf')) or height>=n.get('present_until',float('inf')):continue
        g.add_node(n['id'],**{k:v for k,v in n.items() if k!='id'})
    for c in contacts:
        if c['a'] not in g or c['b'] not in g or height<c.get('onset_z',float('-inf')):continue
        if c.get('evidence')=='UNRESOLVED' or not c.get('accepted',True):continue
        if command_prefix is not None and c.get('command_line',0)>command_prefix:continue
        g.add_edge(c['a'],c['b'],**{k:v for k,v in c.items() if k not in ('a','b')})
    return g
