import json, hashlib
from pathlib import Path
B=Path('J:/My Drive/codex/2026-09-10/r4-astra-mocomoco-j-my-drive/outputs')
O=Path(__file__).resolve().parents[1]/'outputs'
paths={
 'old_editor_baseline':B/'R4_A1_MINI_RELEASE_CANDIDATE/data/structure.json',
 'a_source':B/'R4_A_F2_PRINT_PREPARATION/A/data/structure.json',
 'local_lobe':B/'R4_A_MINI_LOCAL_LOBE_R1/data/structure.json',
 'roots':B/'R4_ROOT_LAUNCH_R5/data/FROZEN_ADDITIONS.json',
}
data={k:json.loads(p.read_text(encoding='utf-8')) for k,p in paths.items()}
maps={k:{m['id']:m for m in j['members']} for k,j in data.items() if isinstance(j,dict)}
fields=['points_mm','radius_mm','diameter_mm','tip_diameter_mm','parent_id','target_id']
def compare(a,b):
 x,y=maps[a],maps[b]; common=sorted(x.keys()&y.keys())
 return {'from':a,'to':b,'added_ids':sorted(y.keys()-x.keys()),'removed_ids':sorted(x.keys()-y.keys()),'common_count':len(common),'record_changes':sum(x[k]!=y[k] for k in common),'field_changed_ids':{f:[k for k in common if x[k].get(f)!=y[k].get(f)] for f in fields}}
report={'files':{k:{'path':str(p),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'members':len(data[k]['members']) if isinstance(data[k],dict) else len(data[k])} for k,p in paths.items()},'comparisons':[compare('old_editor_baseline','a_source'),compare('a_source','local_lobe')],'root_count':len(data['roots']),'root_flower_count':len(set(r['flower_id'] for r in data['roots'])),'status':'SOURCE_RECORD_COMPARISON_ONLY_NOT_NATIVE_GEOMETRY_BINDING'}
(O/'SOURCE_CANDIDATE_COMPARISON.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({'files':report['files'],'comparisons':[{**{k:v for k,v in c.items() if k!='field_changed_ids'},'field_changes':{k:len(v) for k,v in c['field_changed_ids'].items()}} for c in report['comparisons']],'root_count':report['root_count'],'root_flower_count':report['root_flower_count']}))
