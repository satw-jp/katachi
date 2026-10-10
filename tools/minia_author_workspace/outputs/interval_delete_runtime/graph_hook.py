def _graph_state(state):
 cache=state['cache'];g=nx.Graph();g.add_nodes_from(cache['nodes']);g.add_edges_from((a,b,d.copy()) for a,b,d in cache['edges'])
 display=[];source_groups={}
 for vi,r in state['mid_records'].items():
  if r['kind']=='source_segment':source_groups.setdefault(r['segment_index'],[]).append((float(r['t']),r['stable_id'],r['position']))
 for i,seg in enumerate(cache['segments']):
  u,v=seg['nodes'];old=g.get_edge_data(u,v)
  if old is None:raise RuntimeError(f'cache segment edge missing at index {i}')
  cuts=sorted(source_groups.get(i,[]));chain=[(0.0,u,seg['a'])]+cuts+[(1.0,v,seg['b'])]
  if cuts:g.remove_edge(u,v)
  for t,sid,p in cuts:g.add_node(sid,position=p,kind='SOURCE_BRANCH_MIDPOINT',source_segment_index=i,source_t=t,branch_id=seg['branch_id'])
  for (ta,a,pa),(tb,b,pb) in zip(chain,chain[1:]):
   if a==b:raise RuntimeError('duplicate graph split node')
   if _interval_delete.source_deleted(bpy.context.scene, cache, i, (ta+tb)*.5):
    if g.has_edge(a,b):g.remove_edge(a,b)
    continue
   length=math.dist(pa,pb)
   g.add_edge(a,b,length_mm=length,kind=old.get('kind','PERMANENT_CENTERLINE'),branch_id=seg['branch_id'])
   display.append({'branch_id':seg['branch_id'],'a':list(pa),'b':list(pb),'nodes':[a,b]})
 author_nodes={sid:p for sid,p in state['id_to_pos'].items() if sid.startswith('AMID:')}
 for sid,p in author_nodes.items():g.add_node(sid,position=p,kind='AUTHOR_EDGE_MIDPOINT')
 anchor_nodes=cache['anchors']
 def graph_node(sid):
  if sid.startswith('SMID:') or sid.startswith('AMID:'):return sid
  if sid not in anchor_nodes:raise RuntimeError('endpoint cannot be mapped to locked graph node: '+sid)
  return anchor_nodes[sid]
 # Author roots are separate logical lines; an optional cut only subdivides its root.
 for root in state['roots']:
  chain=[(root['a_id'],0.0)]+[(c['id'],float(c['t'])) for c in root.get('cuts',[])]+[(root['b_id'],1.0)]
  for (ida,ta),(idb,tb) in zip(chain,chain[1:]):
   if _interval_delete.author_deleted(bpy.context.scene, root['root_id'],ta,tb):continue
   na,nb=graph_node(ida),graph_node(idb)
   pa,pb=state['id_to_pos'][ida],state['id_to_pos'][idb]
   if na==nb:continue
   # Existing graph edges are retained; never overwrite their source lengths.
   if g.has_edge(na,nb):continue
   g.add_edge(na,nb,length_mm=math.dist(pa,pb),kind='AUTHOR_EDIT_DESIGN_INTENT',root_id=root['root_id'])
 return g,display
