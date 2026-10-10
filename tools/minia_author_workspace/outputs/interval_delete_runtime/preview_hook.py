def _replace_author_preview(state):
    """Build <=2 mm display-only strokes, colored by distance along each author interval."""
    graph,_=midpoint._graph_state(state)
    scores=midpoint.colorbase.score_graph(graph,state['cache']['seeds'])
    distances=_NX.multi_source_dijkstra_path_length(graph,state['cache']['seeds'],weight='length_mm') if state['cache']['seeds'] else {}
    by_bin={i:[] for i in range(32)};by_bin[-1]=[]
    root_summaries={r['root_id']:{'root_id':r['root_id'],'logical_intervals':0,'length_mm':0.0,'display_segments':0,'bins':set(),'min_effective_distance_mm':None,'max_effective_distance_mm':None,'merge_bonus_intervals':0} for r in state['roots']}
    anchors=state['cache']['anchors'];roots=state['roots'];positions=state['id_to_pos']
    for root in roots:
        chain=[(root['a_id'],0.0)]+[(c['id'],float(c['t'])) for c in root.get('cuts',[])]+[(root['b_id'],1.0)]
        for (ida,ta),(idb,tb) in zip(chain,chain[1:]):
            if _interval_delete.author_deleted(bpy.context.scene,root['root_id'],ta,tb):continue
            na,nb=_graph_node(ida,anchors),_graph_node(idb,anchors)
            pa,pb=positions[ida],positions[idb]
            length=float(graph[na][nb].get('length_mm',math.dist(pa,pb))) if graph.has_edge(na,nb) else math.dist(pa,pb)
            if length<=1e-12:continue
            summary=root_summaries[root['root_id']];summary['logical_intervals']+=1;summary['length_mm']+=length
            q=scores.get(frozenset((na,nb)));merged=bool(q and q.get('merge_bonus'))
            if merged:summary['merge_bonus_intervals']+=1
            da,db=distances.get(na,math.inf),distances.get(nb,math.inf)
            count=max(1,int(math.ceil(length/2.0)))
            for j in range(count):
                t0=j/count;t1=(j+1)/count;tm=(t0+t1)*.5
                raw=min(da+tm*length,db+(1.0-tm)*length)
                effective=raw*.65 if merged else raw
                color_bin=_bin(effective)
                p0=midpoint._interp(pa,pb,t0);p1=midpoint._interp(pa,pb,t1)
                by_bin[color_bin].append({'a':p0,'b':p1,'root_id':root['root_id'],'parent_ids':[ida,idb],'t0':ta+(tb-ta)*t0,'t1':ta+(tb-ta)*t1,'effective_distance_mm':None if not math.isfinite(effective) else effective,'merge_bonus':merged})
                summary['display_segments']+=1
                if color_bin>=0:summary['bins'].add(color_bin)
                if math.isfinite(effective):
                    summary['min_effective_distance_mm']=effective if summary['min_effective_distance_mm'] is None else min(summary['min_effective_distance_mm'],effective)
                    summary['max_effective_distance_mm']=effective if summary['max_effective_distance_mm'] is None else max(summary['max_effective_distance_mm'],effective)
    coll=bpy.data.collections.get(midpoint.PREVIEW) or bpy.data.collections.new(midpoint.PREVIEW)
    if coll.name not in bpy.context.scene.collection.children:bpy.context.scene.collection.children.link(coll)
    for obj in list(coll.objects):bpy.data.objects.remove(obj,do_unlink=True)
    total=0
    for b,segments in by_bin.items():
        if not segments:continue
        label='gray' if b<0 else f'{b:02d}'
        data=bpy.data.curves.new(f'Author distance {label} strokes','CURVE');data.dimensions='3D';data.resolution_u=1;data.bevel_depth=.14;data.bevel_resolution=2
        for seg in segments:
            spline=data.splines.new('POLY');spline.points.add(1)
            spline.points[0].co=(*seg['a'],1);spline.points[1].co=(*seg['b'],1)
        obj=bpy.data.objects.new(f'Author distance • {label} • {len(segments)} subsegments',data)
        obj['display_only']=True;obj['classification']='DESIGN_INTENT_PREDICTION • TOOLPATH_UNVERIFIED';obj['color_bin']=b;obj['segment_count']=len(segments);obj['distance_scope']='DECLARED_GRAPH_ASSUMPTION'
        obj.hide_select=True;coll.objects.link(obj);total+=len(segments)
    report={'author_root_count':len(root_summaries),'author_display_segment_count':total,'colored_bins':sorted(b for b,v in by_bin.items() if b>=0 and v),'roots':[{**r,'bins':sorted(r['bins'])} for r in root_summaries.values()]}
    bpy.context.scene['author_line_color_report_json']=__import__('json').dumps(report,separators=(',',':'),ensure_ascii=False)
    return total
