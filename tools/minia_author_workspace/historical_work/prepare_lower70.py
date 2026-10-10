from pathlib import Path
W=Path(__file__).resolve().parent
s=(W/'lower50_plan.py').read_text(encoding='utf-8').replace('lower50','lower70').replace('LOWER50','LOWER70').replace('MINIA_DEEP_BRANCH_REVIEW.blend','MINIA_LOWER50_BRANCHING_REVIEW.blend').replace('zmax=(zlo+zhi)/2','zmax=zlo+(zhi-zlo)*.70').replace("'z_range_percent':[0,50]","'z_range_percent':[0,70]")
s=s.replace("(W/'lower70_plan.json').write_text", "from straight_audit import audit\nreport['straight_members']=audit(g,zlo,zmax)\nreport['new_dead_ends']=[n for n in g if g.degree(n)==1 and (n not in original or original.degree(n)!=1)]\nassert not report['new_dead_ends']\n(W/'lower70_plan.json').write_text")
(W/'lower70_plan.py').write_text(s,encoding='utf-8')
for name in ('build','verify'):
 s=(W/f'lower50_{name}.py').read_text(encoding='utf-8').replace('lower50','lower70').replace('LOWER50','LOWER70').replace('MINIA_LOWER70_BOOTSTRAP.py','MINIA_LOWER50_BOOTSTRAP.py').replace('MINIA_DEEP_BRANCH_REVIEW.blend','MINIA_LOWER50_BRANCHING_REVIEW.blend').replace('minia_clip_z_end=50.','minia_clip_z_end=70.').replace('modified_above_50_percent','modified_above_70_percent').replace('0〜50','0〜70').replace('削除26件','以前の削除・置換')
 if name=='build':
  s=s.replace("json.dumps([{k:v for k,v in row.items() if k!='removed_graph_edges'}", "json.dumps(original['reroutes']+[{k:v for k,v in row.items() if k!='removed_graph_edges'}")
 else:
  s=s.replace("report.update(save_reopen=", "from straight_audit import audit\nreport['straight_members']=audit(g,zlo,zhi)\nbase_degree={n:0 for n,_ in original['nodes']}\nfor a,b,_ in original['edges']:base_degree[a]+=1;base_degree[b]+=1\nnew_dead=[n for n in g if g.degree(n)==1 and base_degree.get(n)!=1]\nassert not new_dead,new_dead\nreport['new_dead_ends']=new_dead\nassert all(r in json.loads(s[rr.KEY]) for r in original['reroutes'])\nreport.update(save_reopen=")
 (W/f'lower70_{name}.py').write_text(s,encoding='utf-8')
