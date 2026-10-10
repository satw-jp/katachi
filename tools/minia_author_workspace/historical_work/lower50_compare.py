import json
from pathlib import Path
W=Path(__file__).resolve().parent
def read(name):return {tuple(sorted((a,b))):d for a,b,d in json.loads((W/name).read_text(encoding='utf-8'))}
e=read('lower50_expected_graph.json');a=read('lower50_actual_graph.json')
missing=set(e)-set(a);extra=set(a)-set(e)
diff=sorted([(abs(e[k]['length_mm']-a[k]['length_mm']),k,e[k]['length_mm'],a[k]['length_mm']) for k in set(e)&set(a)],reverse=True)
report={'missing_count':len(missing),'extra_count':len(extra),'missing':[(k,e[k]) for k in sorted(missing)],'extra':[(k,a[k]) for k in sorted(extra)],'weight_diff':diff[:20],'weight_diff_sum':sum(r[0] for r in diff)}
(W/'lower50_graph_diff.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report)[:14000])
