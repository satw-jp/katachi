import sys,json,pathlib,time
from real_graph import Context
R=pathlib.Path(__file__).resolve().parents[2];start=time.perf_counter();c=Context(R/'outputs');load=time.perf_counter()-start
rows=[]
for h in [43.2,44.,45.,48.]:
 for mode in ['PRINTING_WITH_SUPPORT','PERMANENT_ONLY_AFTER_REMOVAL']:
  r=c.evaluate(h,mode,failure={'kind':'branch','id':'A3457'})
  rows.append(r)
a=c.members['R5_F3457_P1'];b=c.members['G0165']
edit={'id':'TEST_ONLY_001','a_member':a['id'],'a_parameter':len(a['points'])-1,'a_position':a['points'][-1],
      'b_member':b['id'],'b_parameter':len(b['points'])-1,'b_position':b['points'][-1]}
before=c.evaluate(45.,'PERMANENT_ONLY_AFTER_REMOVAL');after=c.evaluate(45.,'PERMANENT_ONLY_AFTER_REMOVAL',[edit])
cached=c.evaluate(45.,'PERMANENT_ONLY_AFTER_REMOVAL',[edit])
assert before['cache_key']!=after['cache_key']
assert all(r['color']=='GRAY' for row in rows for r in row['targets'])
assert not any(e['id']=='TEST_ONLY_001' for e in c.members.values())
report={'scope':'Real mixed declared/selected-geometry graph; no physical, toolpath or Blender UI acceptance.','load_seconds':load,'rows':rows,'test_only_edit':edit,'test_before':before,'test_after':after,'cached_seconds':cached['elapsed_s'],'test_edit_in_author_candidate':False,'elapsed_total_s':time.perf_counter()-start}
(R/'outputs/REAL_GRAPH_VALIDATION.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'load_s':load,'cases':[{'h':r['model_z_mm'],'mode':r['mode'],'counts':[x['graph_count'] for x in r['targets']],'common_branches':[x['common_branch_failures'] for x in r['targets']],'elapsed_s':r['elapsed_s']} for r in rows],'test_before':[x['graph_count'] for x in before['targets']],'test_after':[x['graph_count'] for x in after['targets']],'cached_s':cached['elapsed_s']},indent=2))
