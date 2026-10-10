# Executed with the planner's geometry context. Only break remaining >50mm runs.
leg_limit=12.
for attempt in range(80):
    over=audit(g,zlo,zmax)['over_limit']
    if not over:break
    long_pairs={frozenset((a,b)) for r in over for a,b in zip(r['path'],r['path'][1:])}
    already={tuple(r['path'][::2]) for r in replacements};options=[]
    for key,row in d['catalog'].items():
        a,b=row['ids'];i=index[a];j=index[b];pa,pb=positions[i],positions[j]
        if (a,b) in already:continue
        if not all(inside_scope(Vector(p)) for piece in row['pieces'] for p in piece):continue
        length=(pb-pa).length
        if length<1. or length>22.:continue
        if row['kind']=='source':
            pieces=[s for s in displayby[row['branch']] if row['lo']-1e-5<arc(row['branch'],[(s['a'][t]+s['b'][t])/2 for t in range(3)])<row['hi']+1e-5]
            remove=[tuple(s['nodes']) for s in pieces]
        else:remove=[(nodes[i],nodes[j])]
        if not any(frozenset(e) in long_pairs for e in remove) or not all(g.has_edge(*e) for e in remove):continue
        allowed={frozenset(e) for e in remove};interior={n for e in remove for n in e}-{nodes[i],nodes[j]}
        if any(n in seeds or any(frozenset((n,v)) not in allowed for v in g[n]) for n in interior):continue
        center=(pa+pb)/2;direction=pb-pa
        for p,k,_ in kd.find_range(center,leg_limit):
            if k in (i,j) or ids[k] in contacts or owners[k] in (owners[i],owners[j]):continue
            if not inside_scope(p) or clear[k]<4 or degree[k]>=4 or not available(k):continue
            lk=(p-pa).length;lj=(p-pb).length
            if min(lk,lj)<1 or max(lk,lj)>leg_limit or lk+lj>max(leg_limit*2,length*3):continue
            if any(g.has_edge(u,v) or frozenset((u,v)) in forbidden for u,v in ((nodes[i],nodes[k]),(nodes[k],nodes[j]))):continue
            t=max(0,min(1,(p-pa).dot(direction)/direction.length_squared));offset=(p-(pa+direction*t)).length
            turn=math.degrees((p-pa).angle(pb-p))
            if offset<1 or not 25<=turn<=145:continue
            if any(ids[end] in contacts and (clear[k]<5 or clear[k]-clear[end]<4 or (p-positions[end]).normalized().dot(-normals[contacts[ids[end]]])<.7) for end in (i,j)):continue
            if safe(i,k) is None or safe(k,j) is None:continue
            # Prefer a cut near the middle of a long run, then a short detour.
            longest=max((r for r in over if any(frozenset(e) in {frozenset(x) for x in zip(r['path'],r['path'][1:])} for e in remove)),key=lambda r:r['length_mm'])
            c=(Vector(g.nodes[longest['path'][0]]['position'])+Vector(g.nodes[longest['path'][-1]]['position']))/2
            options.append(((center-c).length+.5*(lk+lj),key,row,i,j,k,turn,offset,remove,length))
    if not options:
        if leg_limit==12:
            leg_limit=20.;print('LONG_RUN_FALLBACK_20MM',flush=True);continue
        print('LONG_RUN_UNRESOLVED',len(over),flush=True);break
    _,key,row,i,j,k,turn,offset,remove,length=min(options,key=lambda r:r[0])
    for u,v in remove:g.remove_edge(u,v)
    new_edge(i,k,'bend_over_50mm');new_edge(k,j,'bend_over_50mm')
    mask={k:v for k,v in row.items() if k in ('kind','branch','root','lo','hi')}
    replacements.append({'mask':mask,'path':[ids[i],ids[k],ids[j]],'turn_degrees':turn,'offset_mm':offset,'old_length_mm':length,'removed_graph_edges':remove,'max_leg_mm':leg_limit})
    pending[:]=[(q,r) for q,r in pending if q!=key]
    print('LONG_RUN_BEND',attempt+1,'remaining_before',len(over),flush=True)
