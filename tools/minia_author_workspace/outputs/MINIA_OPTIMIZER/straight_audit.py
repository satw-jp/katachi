import math
from mathutils import Vector
def audit(g,zlo,zhi):
    seen=set();runs=[]
    def pos(n):return Vector(g.nodes[n]['position'])
    for a,b in g.edges:
        if frozenset((a,b)) in seen:continue
        path=[a,b];direction=pos(b)-pos(a)
        if direction.length<1e-7:continue
        direction.normalize()
        for sign in (1,-1):
            if sign==-1:path.reverse()
            while True:
                prev,n=path[-2:];options=[]
                for v in g[n]:
                    if v in path:continue
                    delta=pos(v)-pos(n)
                    if delta.length>1e-7 and delta.normalized().dot(direction*sign)>.99999:options.append((delta.length,v))
                if not options:break
                path.append(max(options)[1])
        for u,v in zip(path,path[1:]):seen.add(frozenset((u,v)))
        if max(pos(n).z for n in path)<zlo or min(pos(n).z for n in path)>zhi:continue
        length=sum((pos(v)-pos(u)).length for u,v in zip(path,path[1:]))
        runs.append({'length_mm':length,'endpoints':[path[0],path[-1]],'node_count':len(path),'path':path})
    runs.sort(key=lambda r:r['length_mm'],reverse=True)
    unique={frozenset(r['path']):r for r in runs};runs=sorted(unique.values(),key=lambda r:r['length_mm'],reverse=True)
    return {'limit_mm':50,'maximum_mm':runs[0]['length_mm'] if runs else 0,'over_limit_count':sum(r['length_mm']>50.0001 for r in runs),'longest':runs[:20],'over_limit':[r for r in runs if r['length_mm']>50.0001]}
