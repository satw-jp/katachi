"""Verified flower-route replacements; unrelated protected routes remain locked."""
import bpy,json,math
from mathutils import Vector
import interval_delete as d
mp=d.mp
KEY='minia_flower_reroutes_v1'
_base_protected=d.root_protected
_source={};_author={};_pairs=set();_protected_roots=set()
def mask_key(r):return (r['kind'],r.get('branch',r.get('root')),round(r['lo'],8),round(r['hi'],8))
def source_deleted(scene,cache,index,t):
    d.tables(cache);branch,start,length=d._segment_arcs[index];arc=start+length*t
    return any(lo-1e-6<arc<hi+1e-6 for lo,hi in _source.get(branch,[]))
def author_deleted(scene,rid,lo,hi):return any(a<=lo+1e-6 and b>=hi-1e-6 for a,b in _author.get(rid,[]))
def deleted_pair(scene,roots,pair):return pair in _pairs
def root_protected(scene,root):return root['root_id'] in _protected_roots or _base_protected(scene,root)
def validate(scene,roots,cache):
    global _source,_author,_pairs,_protected_roots
    masks=d.masks(scene);_source={};_author={};_pairs=set();_protected_roots=set()
    for r in masks:
        if r.get('kind')=='source':_source.setdefault(r['branch'],[]).append((r['lo'],r['hi']))
        elif r.get('kind')=='author':_author.setdefault(r['root'],[]).append((r['lo'],r['hi']))
    rd={r['root_id']:r for r in roots};tables=d.tables(cache)
    allowed=set()
    def source_arc(branch,sid):
        if sid==branch+':START':return 0.
        if sid==branch+':END':return tables[branch][-1][3]
        if not sid.startswith('SMID:'):raise RuntimeError('置換元の点IDが不正です')
        _,si,t=sid.split(':');si=int(si);t=float(t)
        if cache['segments'][si]['branch_id']!=branch:raise RuntimeError('置換元の枝が一致しません')
        return d._segment_arcs[si][1]+d._segment_arcs[si][2]*t
    for replacement in json.loads(scene.get(KEY,'[]')):
        row=replacement['mask'];path=replacement['path']
        if len(path)!=3 or len(set(path))!=3:raise RuntimeError('花の代替経路が不正です')
        if row['kind']=='author':
            root=rd[row['root']];chain={root['a_id']:0.,root['b_id']:1.,**{c['id']:c['t'] for c in root['cuts']}}
            ts=sorted((chain[path[0]],chain[path[-1]]))
        else:ts=sorted((source_arc(row['branch'],path[0]),source_arc(row['branch'],path[-1])))
        if abs(ts[0]-row['lo'])>1e-4 or abs(ts[1]-row['hi'])>1e-4:raise RuntimeError('花の置換範囲が一致しません')
        coordinates={}
        for a,b in zip(path,path[1:]):
            rid=mp._root_id(a,b)
            if rid not in rd or _author.get(rid):raise RuntimeError('花の代替接続を削除できません')
            rr=rd[rid]
            if set((rr['a_id'],rr['b_id']))!=set((a,b)):raise RuntimeError('代替接続IDが不正です')
            coordinates[rr['a_id']]=Vector(rr['a_position']);coordinates[rr['b_id']]=Vector(rr['b_position'])
            limit=float(replacement.get('max_leg_mm',6.))
            if limit not in (6.,12.,20.) or math.dist(rr['a_position'],rr['b_position'])>limit+.0001:raise RuntimeError('代替接続が長すぎます')
            _protected_roots.add(rid)
        a,w,b=[coordinates[s] for s in path]
        angle=math.degrees((w-a).angle(b-w))
        if angle<24.99:raise RuntimeError('代替接続の折れが失われています')
        allowed.add(mask_key(row))
    protected,_=d.protection(scene)
    for row in masks:
        lo=float(row['lo']);hi=float(row['hi'])
        if not(math.isfinite(lo) and math.isfinite(hi) and 0<=lo<hi):raise RuntimeError('削除範囲が不正です')
        permitted=mask_key(row) in allowed
        if row['kind']=='source':
            branch=row['branch']
            if branch not in tables or hi>tables[branch][-1][3]+1e-5 or (branch in protected and not permitted):raise RuntimeError('花の枝には検証済みの代替経路が必要です')
        elif row['kind']=='author':
            if row['root'] not in rd or hi>1.000001 or (root_protected(scene,rd[row['root']]) and not permitted):raise RuntimeError('花の枝には検証済みの代替経路が必要です')
        else:raise RuntimeError('削除種類が不正です')
    for r in roots:
        chain=[(r['a_id'],0.)]+[(c['id'],c['t']) for c in r['cuts']]+[(r['b_id'],1.)]
        for (a,lo),(b,hi) in zip(chain,chain[1:]):
            if author_deleted(scene,r['root_id'],lo,hi):_pairs.add(tuple(sorted((a,b))))
def register():
    d.validate=validate;d.source_deleted=source_deleted;d.author_deleted=author_deleted;d.deleted_pair=deleted_pair;d.root_protected=root_protected
    cache=mp._read_data(bpy.context.scene)[0]
    validate(bpy.context.scene,mp._registry(bpy.context.scene),cache)
