from pathlib import Path
p=Path('work/support_distance_colors.py')
s=p.read_text(encoding='utf-8')
needle='    result,distances=score_graph(g,seeds)'
replacement='''    import gzip
    cache={'nodes':list(g.nodes(data=True)), 'edges':[[a,b,d] for a,b,d in g.edges(data=True)], 'seeds':sorted(seeds), 'segments':segments, 'anchors':{mid+':'+ep:node(mid,t) for mid,m in permanent.items() for ep,t in [('START',0.),('END',len(m['points'])-1)]}, 'baseline':c.baseline}
    with gzip.open(O/'COLOR_PATH_GRAPH.json.gz','wt',encoding='utf-8') as f:json.dump(cache,f,separators=(',',':'))
    print('GRAPH_CACHE',len(g),g.number_of_edges(),len(segments),len(cache['anchors']))
    return
'''
assert needle in s
s=s.replace(needle,replacement,1)
exec(compile(s,str(p.resolve()),'exec'),{'__name__':'__main__','__file__':str(p.resolve())})
