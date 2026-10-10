"""Deterministic, offline, constrained graph search. No model/API/network calls."""
import bpy,bmesh,sys,json,math,hashlib,runpy,time,collections,traceback
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from straight_audit import audit
import flower_support

def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def write_json(path,value):
    path=Path(path);tmp=path.with_suffix(path.suffix+'.tmp')
    payload=json.dumps(value,ensure_ascii=False,indent=2)
    for attempt in range(8):
        try:
            tmp.write_text(payload,encoding='utf-8');tmp.replace(path);return
        except PermissionError:
            if attempt==7:raise
            time.sleep(min(2.,.1*2**attempt))
def read_json(path):return json.loads(Path(path).read_text(encoding='utf-8-sig'))
def status(stage,**kw):
    value={'stage':stage,'time_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),**kw}
    write_json(HERE/'status.json',value);print(stage,json.dumps(kw,ensure_ascii=True),flush=True)
    labels={'COUNTING_FLOWER_SUPPORTS':'花から奥への支持系統を確認中','SEARCHING':'改善候補を探索中','ACCEPTED':'改善する接続を採用','SAVING':'最良結果を保存中','PENDING_REOPEN_VERIFY':'保存後の再読み込み待ち','VERIFIED':'保存・再読み込み検証が完了','FAILED':'エラーで停止'}
    lines=['MINI_A 自動改善プログラム',labels.get(stage,stage),'']
    if (HERE/'checkpoint.json').exists():
        j=read_json(HERE/'checkpoint.json');base=j['baseline'];cur=j.get('current',base)
        lines.extend([f"採用済み接続：{len(j['accepted'])}本",f"赤の総延長：{base['red_length_mm']:.2f} → {cur['red_length_mm']:.2f} mm"])
        if 'flower_support_2' in cur:
            lines.append(f"奥から2系統以上で支えられる花：{base['flower_support_2']+base['flower_support_3_or_more']} → {cur['flower_support_2']+cur['flower_support_3_or_more']}")
            lines.append(f"3系統以上：{base['flower_support_3_or_more']} → {cur['flower_support_3_or_more']}")
    if kw.get('stop_reason'):lines.append('停止理由：'+kw['stop_reason'])
    if kw.get('error'):lines.append('詳細：'+kw['error'])
    lines.extend(['','探索中の数値は仮採用結果です。OPEN_LATEST.lnkは検証を通った結果だけを開きます。','START_OR_RESUME.lnk：続きから実行','STOP_AND_SAVE.lnk：途中で止めて保存'])
    try:(HERE/'PROGRESS.txt').write_text('\n'.join(lines),encoding='utf-8-sig')
    except PermissionError:pass  # An open progress viewer must not stop the search.

def initialize():
    cfg=read_json(HERE/'settings.json')
    assert cfg['scope_percent']==[0,100], 'This optimizer version evaluates the whole model'
    assert 0<cfg['maximum_internal_link_mm']<10 and 0<cfg['maximum_flower_link_mm']<10
    assert cfg['maximum_straight_mm']==50 and cfg['red_threshold_mm']==25.65
    runpy.run_path(str((HERE/cfg['bootstrap']).resolve()))
    import interval_delete as deletion
    import flower_reroute
    scene=bpy.context.scene;state=deletion.mp.scan_state(scene,True)
    graph,_=deletion.mp._graph_state(state)
    ledger,_=deletion.mp.route_v2_panel._load_ledger(scene)
    host_path=Path(cfg['host_npz']);h=np.load(host_path)
    vv=h['vertices']*ledger['source_to_plate']['scale']+np.array(ledger['source_to_plate']['translation_mm'])
    host=BVHTree.FromPolygons(vv.tolist(),h['faces'].tolist(),all_triangles=True)
    def depth(p):
        q,n,face,length=host.find_nearest(Vector(p));return length if (Vector(p)-q).dot(n)<0 else -length
    seeds=set(state['cache']['seeds'])&set(graph)
    flowers={r['id']:r for r in ledger['flower_records']};contacts={}
    for r in ledger['records']:
        sr=r['source_record']
        for field,end in [('parent_id','START'),('target_id','END'),('flower_id','END')]:
            if sr.get(field) in flowers:
                sid=r['id']+':'+end
                if sid in state['id_to_pos']:contacts[sid]=sr[field]
    # Coordinate aliases at a flower endpoint inherit the same inward constraint.
    tree=KDTree(len(contacts));keys=sorted(contacts)
    for i,k in enumerate(keys):tree.insert(Vector(state['id_to_pos'][k]),i)
    tree.balance()
    for sid,p in state['id_to_pos'].items():
        q,i,length=tree.find(Vector(p))
        if length<1e-4:contacts[sid]=contacts[keys[i]]
    context={'cfg':cfg,'deletion':deletion,'mp':deletion.mp,'scene':scene,'state':state,'graph':graph,'seeds':seeds,'depth':depth,'contacts':contacts,'flowers':flowers,'host_hash':digest(host_path)}
    status('COUNTING_FLOWER_SUPPORTS')
    flower_support.prepare(context);flower_support.refresh(context,graph)
    return context

def node(c,sid):return c['state']['cache']['anchors'].get(sid,sid)
def metric(c,g,support_updates=None):
    scores=c['mp'].colorbase.score_graph(g,c['seeds']);red=total=0.;red_count=0
    for a,b,e in g.edges(data=True):
        length=e['length_mm'];total+=length;q=scores[frozenset((a,b))]['effective_distance_mm']
        if q is None or q>=c['cfg']['red_threshold_mm']:red+=length;red_count+=1
    return {'red_length_mm':red,'red_edge_count':red_count,'total_length_mm':total,**flower_support.summary(c,support_updates)},scores

def forbidden_pairs(c):
    bad=set()
    for r in c['state']['roots']:
        bad.add(frozenset((node(c,r['a_id']),node(c,r['b_id']))))
        chain=[r['a_id']]+[q['id'] for q in r['cuts']]+[r['b_id']]
        # Includes masked intervals, so user deletions can never be recreated.
        bad.update(frozenset((node(c,a),node(c,b))) for a,b in zip(chain,chain[1:]))
    return bad

def owner(c,sid):
    if sid.startswith('SMID:'):return c['state']['cache']['segments'][int(sid.split(':')[1])]['branch_id']
    return sid.split(':')[1] if sid.startswith('AMID:') else sid.split(':')[0]

def geometry(c,a,b):
    cfg=c['cfg'];pos=c['state']['id_to_pos'];pa,pb=Vector(pos[a]),Vector(pos[b]);length=(pb-pa).length
    if length<1:return None
    da,db=c['depth'](pa),c['depth'](pb);fa,fb=c['contacts'].get(a),c['contacts'].get(b)
    if fa and fb:return None
    if fa or fb:
        if length>cfg['maximum_flower_link_mm']:return None
        start,target,ds,dt,fid=(pa,pb,da,db,fa) if fa else (pb,pa,db,da,fb)
        inward=-Vector(c['flowers'][fid]['normal']).normalized()
        if dt<cfg['flower_target_depth_mm'] or dt-ds<cfg['flower_depth_gain_mm'] or (target-start).normalized().dot(inward)<cfg['flower_inward_cosine']:return None
        kind='flower_inward'
    else:
        if length>cfg['maximum_internal_link_mm'] or min(da,db)<cfg['internal_depth_mm']:return None
        kind='internal_short_link'
    count=max(1,math.ceil(length/.2));bound=min(c['depth'](pa.lerp(pb,i/count)) for i in range(count+1))-length/count/2
    if bound<cfg['certified_clearance_mm']:return None
    return {'a_id':a,'b_id':b,'length_mm':length,'kind':kind,'clearance_mm':bound}

def candidates(c,g,journal,scores):
    cfg=c['cfg'];positions=c['state']['id_to_pos'];bad=forbidden_pairs(c)
    ids=sorted(sid for sid,p in positions.items() if node(c,sid) in g and g.degree(node(c,sid))>0 and (sid in c['contacts'] or c['depth'](p)>=cfg['internal_depth_mm']))
    tree=KDTree(len(ids))
    for i,sid in enumerate(ids):tree.insert(Vector(positions[sid]),i)
    tree.balance();dd=c['mp'].nx.multi_source_dijkstra_path_length(g,c['seeds'],weight='length_mm')
    red_nodes=set();unmerged_red=set()
    for a,b in g.edges:
        r=scores[frozenset((a,b))];v=r['effective_distance_mm']
        if v is None or v>=cfg['red_threshold_mm']:
            red_nodes.update((a,b))
            if not r['merge_bonus']:unmerged_red.update((a,b))
    counts=collections.Counter(sid for r in journal['accepted'] for sid in (r['a_id'],r['b_id']));found={}
    for i,a in enumerate(ids):
        na=node(c,a)
        if counts[a]>=cfg['maximum_added_degree']:continue
        flower=a in c['contacts'] and c['support_counts'].get(c['contacts'][a],0)<3
        if na not in red_nodes and not flower:continue
        radius=cfg['maximum_flower_link_mm'] if a in c['contacts'] else cfg['maximum_internal_link_mm']
        rows=sorted(tree.find_range(Vector(positions[a]),radius),key=lambda q:(q[2],ids[q[1]]))
        eligible=0
        for p,k,length in rows:
            b=ids[k];nb=node(c,b);pair=frozenset((na,nb))
            if a==b or na==nb or length<1 or counts[b]>=cfg['maximum_added_degree'] or owner(c,a)==owner(c,b) or g.has_edge(na,nb) or pair in bad:continue
            da,db=dd.get(na,math.inf),dd.get(nb,math.inf)
            gain=abs(da-db)-length if math.isfinite(da+db) else (1000 if math.isfinite(da) or math.isfinite(db) else -1)
            cycle=na in unmerged_red or nb in unmerged_red
            if gain<.25 and not cycle and not flower:continue
            if gain<.25 and not flower:
                near=c['mp'].nx.single_source_dijkstra_path_length(g,na,cutoff=length*2.5,weight='length_mm')
                if nb in near:continue
            pair_id='|'.join(sorted((a,b)))
            support=c['support_counts'].get(c['contacts'].get(a),3)
            row={'a_id':a,'b_id':b,'key':pair_id,'priority':(0 if flower and support<2 else 1,-max(0,gain),0 if flower else 1,length,pair_id)}
            if pair not in found or row['priority']<found[pair]['priority']:found[pair]=row
            eligible+=1
            if eligible>=cfg['nearest_candidates_per_point']:break
    return sorted(found.values(),key=lambda r:r['priority'])

def optimize(c):
    cfg=c['cfg'];source=(HERE/cfg['source_blend']).resolve();assert Path(bpy.data.filepath).resolve()==source
    source_hash=digest(source);signature=hashlib.sha256(json.dumps(cfg,sort_keys=True).encode()).hexdigest()
    checkpoint=HERE/'checkpoint.json';g=c['graph'];baseline=g.copy();before,_=metric(c,g)
    assert audit(g,-math.inf,math.inf)['over_limit_count']==0,'Input contains a >50mm straight member; input repair is required first'
    if checkpoint.exists():
        journal=read_json(checkpoint)
        assert journal['source_sha256']==source_hash and journal['settings_sha256']==signature and journal['host_sha256']==c['host_hash'],'Input/settings changed. Keep the old checkpoint and start a separate optimizer folder.'
        for row in journal['accepted']:
            assert geometry(c,row['a_id'],row['b_id']) is not None
            a,b=node(c,row['a_id']),node(c,row['b_id']);assert not g.has_edge(a,b)
            g.add_edge(a,b,length_mm=row['length_mm'],kind='AUTO_OPTIMIZER')
        flower_support.refresh(c,g)
        if journal['version']==1:
            write_json(HERE/'checkpoint_before_flower_support_v2.json',journal)
            journal['version']=2;journal['tested']=[];journal['round_start_count']=len(journal['accepted']);journal['baseline']=before
    else:
        journal={'version':2,'source_sha256':source_hash,'settings_sha256':signature,'host_sha256':c['host_hash'],'source_blend':str(source),'baseline':before,'accepted':[],'round':1,'tested':[],'round_start_count':0,'runs':0,'evaluations_total':0,'rejections':{}}
    journal['runs']+=1;run=journal['runs'];current,scores=metric(c,g);tested=set(journal['tested']);evaluations=0;reason=None
    def save():
        journal['tested']=sorted(tested);journal['current']=current;write_json(checkpoint,journal)
    save();status('SEARCHING',run=run,before=before,current=current,accepted_total=len(journal['accepted']))
    while reason is None:
        if (HERE/'STOP').exists():reason='USER_STOP';break
        if current['red_length_mm']<1e-6:reason='RED_ZERO';break
        if len(journal['accepted'])>=cfg['maximum_new_links_total']:reason='LINK_LIMIT';break
        if evaluations>=cfg['evaluations_per_run']:reason='RUN_BUDGET';break
        rows=candidates(c,g,journal,scores);remaining=[r for r in rows if r['key'] not in tested]
        if not remaining:
            if len(journal['accepted'])==journal['round_start_count']:reason='NO_IMPROVING_CANDIDATE_IN_THIS_NEIGHBORHOOD';break
            if journal['round']>=cfg['maximum_rounds']:reason='ROUND_LIMIT';break
            journal['round']+=1;journal['round_start_count']=len(journal['accepted']);tested.clear();save();continue
        # Rebuild rankings after accepted changes; evaluated failures are retried next round.
        for candidate in remaining:
            if (HERE/'STOP').exists():reason='USER_STOP';break
            if evaluations>=cfg['evaluations_per_run']:reason='RUN_BUDGET';break
            if len(journal['accepted'])>=cfg['maximum_new_links_total']:reason='LINK_LIMIT';break
            a,b=candidate['a_id'],candidate['b_id'];tested.add(candidate['key']);row=geometry(c,a,b)
            journal['candidates_checked_total']=journal.get('candidates_checked_total',0)+1
            reject=None
            if row is None:reject='geometry_constraint'
            else:
                evaluations+=1;journal['evaluations_total']+=1
                na,nb=node(c,a),node(c,b);g.add_edge(na,nb,length_mm=row['length_mm'],kind='AUTO_OPTIMIZER')
                support_updates=flower_support.trial(c,g,na,nb)
                trial,trial_scores=metric(c,g,support_updates);gain=current['red_length_mm']-trial['red_length_mm']
                flower_gain=current['flower_deficit_to_3']-trial['flower_deficit_to_3']
                if not (gain>=cfg['minimum_red_improvement_mm'] or abs(gain)<1e-6 and flower_gain>0):reject='no_measured_improvement'
                elif trial['flower_deficit_to_2']>current['flower_deficit_to_2']:reject='flower_support_regression'
                elif audit(g,-math.inf,math.inf)['over_limit_count']:reject='straight_over_50mm'
                if reject:g.remove_edge(na,nb)
                else:
                    row.update(before=current,after=trial,red_improvement_mm=gain,round=journal['round'],accept_reason='red_reduction' if gain>=cfg['minimum_red_improvement_mm'] else 'flower_second_connection')
                    flower_support.commit(c,support_updates)
                    journal['accepted'].append(row);current=trial;scores=trial_scores;save()
                    status('ACCEPTED',run=run,evaluations=evaluations,accepted_total=len(journal['accepted']),red_length_mm=current['red_length_mm'],gain_mm=gain)
                    break
            if reject:journal['rejections'][reject]=journal['rejections'].get(reject,0)+1
            if row is not None or journal['candidates_checked_total']%25==0:save()
            if row is not None and evaluations%10==0:status('SEARCHING',run=run,evaluations=evaluations,accepted_total=len(journal['accepted']),red_length_mm=current['red_length_mm'])
    journal['stop_reason']=reason;save()
    # Every accepted candidate is an edge between existing connected points.
    assert not [n for n in g if g.degree(n)==1 and (n not in baseline or baseline.degree(n)!=1)]
    straight=audit(g,-math.inf,math.inf);assert straight['over_limit_count']==0
    status('SAVING',run=run,stop_reason=reason,current=current)
    st=c['state'];bm=st['bm'];assert bm is not None
    byid={sid:bm.verts[i] for i,sid in st['id_by_index'].items()}
    for row in journal['accepted']:
        a,b=byid[row['a_id']],byid[row['b_id']];assert bm.edges.get((a,b)) is None
        bm.edges.new((a,b)).select_set(False)
    bm.edges.index_update();bmesh.update_edit_mesh(st['obj'].data,loop_triangles=False,destructive=True)
    result=c['mp'].update_colors(c['scene']);assert result['status']=='CURRENT',result
    after_state=c['mp'].scan_state(c['scene'],False);actual,_=c['mp']._graph_state(after_state);actual_metric,_=metric(c,actual)
    assert all(after_state['id_to_pos'][k]==v for k,v in st['id_to_pos'].items())
    assert abs(actual_metric['red_length_mm']-current['red_length_mm'])<.05
    assert {frozenset(e) for e in actual.edges}=={frozenset(e) for e in g.edges}
    assert c['mp']._verify_references(c['scene'])==7
    assert digest(source)==source_hash
    scene=c['scene'];scene.minia_clip_shared=True;scene.minia_clip_shared_axis='2';scene.minia_clip_tilt=False;scene.minia_clip_z_start=0;scene.minia_clip_z_end=100;c['deletion'].clip.apply_clips(scene)
    output=HERE/f'MINIA_AUTO_100_RUN_{run:03d}.blend';assert not output.exists()
    report={'run':run,'source':str(source),'source_sha256':source_hash,'output':str(output),'baseline':before,'after':actual_metric,'accepted_total':len(journal['accepted']),'stop_reason':reason,'straight':straight,'new_dead_ends':0,'seeds':sorted(c['seeds']),'original_positions':st['id_to_pos'],'original_masks':c['deletion'].masks(scene),'original_reroutes':json.loads(scene.get('minia_flower_reroutes_v1','[]')),'accepted':journal['accepted'],'verified':False,'algorithm':'deterministic constrained greedy search; additions only; local neighborhood, not a global optimum proof'}
    scene['minia_optimizer_report']=json.dumps({k:v for k,v in report.items() if k not in ('original_positions','accepted','seeds','original_masks','original_reroutes','straight')},ensure_ascii=False)
    bpy.ops.wm.save_as_mainfile(filepath=str(output));write_json(HERE/f'RUN_{run:03d}.json',report)
    write_json(HERE/'pending_verify.json',{'run':run,'output':str(output),'report':str(HERE/f'RUN_{run:03d}.json')})
    status('PENDING_REOPEN_VERIFY',run=run,output=str(output),stop_reason=reason)

def verify(c):
    pending=read_json(HERE/'pending_verify.json');report=read_json(pending['report']);st=c['state'];g=c['graph']
    assert Path(bpy.data.filepath).resolve()==Path(report['output']).resolve()
    assert digest(report['source'])==report['source_sha256']
    assert all(st['id_to_pos'][k]==v for k,v in report['original_positions'].items())
    assert c['deletion'].masks(c['scene'])==report['original_masks']
    assert json.loads(c['scene'].get('minia_flower_reroutes_v1','[]'))==report['original_reroutes']
    assert sorted(c['seeds'])==report['seeds'] and c['mp']._verify_references(c['scene'])==7
    current,_=metric(c,g);assert abs(current['red_length_mm']-report['after']['red_length_mm'])<.05
    for key in ('flower_support_0','flower_support_1','flower_support_2','flower_support_3_or_more'):
        assert current[key]==report['after'][key],(key,current[key],report['after'][key])
    assert current['red_length_mm']<=report['baseline']['red_length_mm']+.05
    for row in report['accepted']:
        assert geometry(c,row['a_id'],row['b_id']) is not None
        assert g.has_edge(node(c,row['a_id']),node(c,row['b_id']))
        assert g.degree(node(c,row['a_id']))>=2 and g.degree(node(c,row['b_id']))>=2
        assert row['after']['red_length_mm']<=row['before']['red_length_mm']+1e-6
    straight=audit(g,-math.inf,math.inf);assert straight['over_limit_count']==0
    result=c['mp'].update_colors(c['scene']);assert result['status']=='CURRENT',result
    report['verified']=True;report['verification']='PASS: saved/reopened/recolored, frozen inputs, every accepted edge, inward/envelope constraints, 50mm straight rule, monotone red history'
    write_json(pending['report'],report);write_json(HERE/'latest_verified.json',{'run':report['run'],'output':report['output'],'report':pending['report'],'red_before_mm':report['baseline']['red_length_mm'],'red_after_mm':current['red_length_mm'],'accepted_total':report['accepted_total'],'stop_reason':report['stop_reason'],'maximum_straight_mm':straight['maximum_mm'],'verified':True})
    status('VERIFIED',run=report['run'],red_before_mm=report['baseline']['red_length_mm'],red_after_mm=current['red_length_mm'],accepted_total=report['accepted_total'],stop_reason=report['stop_reason'])

if __name__=='__main__':
    try:
        c=initialize()
        if '--verify' in sys.argv:verify(c)
        else:optimize(c)
    except Exception as exc:
        status('FAILED',error=str(exc),traceback=traceback.format_exc());raise
