import pathlib,json,time,hashlib
from real_graph import Context
R=pathlib.Path(__file__).resolve().parents[2];c=Context(R/'outputs');start=time.perf_counter();memo={}
counts={h:sum(n['physical_member_id']=='F3457' for n in s['nodes']) for h,s in c.snapshots.items()}
last_non_single=max(h for h,n in counts.items() if n!=1);stable=round(last_non_single+.2,8)
def run(h,mode):
 key=(h,mode)
 if key not in memo:memo[key]=c.evaluate(h,mode,failure={'kind':'branch','id':'A3457'})
 return memo[key]
def number(h,mode):
 r=run(h,mode)['targets']
 return r[0]['graph_count'] if len(r)==1 else None
def onset(mode,k,upper):
 first=number(stable,mode)
 if first is None:return {'status':'UNRESOLVED'}
 if first>=k:return {'status':'AT_OR_BEFORE_STABLE_TARGET','upper_bound_model_z_mm':stable}
 if number(upper,mode)<k:return {'status':'NOT_FOUND_THROUGH_RANGE','through_model_z_mm':upper}
 lo=int(round(stable*5));hi=int(round(upper*5))
 while hi-lo>1:
  mid=(hi+lo)//2
  value=number(mid/5,mode)
  if value is None:return {'status':'UNRESOLVED'}
  if value>=k:hi=mid
  else:lo=mid
 return {'status':'DECLARED_GRAPH_EVENT_ESTIMATE','first_grid_height_mm':hi/5,'previous_grid_height_mm':lo/5,
         'assumption':'Monotonic connectivity after F3457 has a stable single component; unmeasured incidental contacts and named-parent projection ambiguity are not resolved.'}
events={}
for mode in ['PRINTING_WITH_SUPPORT','PERMANENT_ONLY_AFTER_REMOVAL']:
 events[mode]={str(k):onset(mode,k,45. if mode=='PRINTING_WITH_SUPPORT' else 156.) for k in [1,2,3]}
 cases=[run(h,mode) for h in [43.2,45.]]
baseline=[run(h,m) for h in [43.2,45.] for m in events]
report={'state':'BACKEND_READY_UI_PENDING','region':'F3457/G0181 DEMO, actual damage unlocated','first_model_height_mm':43.2,
        'height_range_model_mm':[0,156],'height_step_mm':.2,'stable_single_target_from_model_z_mm':stable,
        'route_onset_estimates':events,'sampled_cases':baseline,
        'single_route_interval_estimate':{'mode':'PERMANENT_ONLY_AFTER_REMOVAL','from_model_z_mm':events['PERMANENT_ONLY_AFTER_REMOVAL']['1'].get('first_grid_height_mm'),'through_model_z_mm':156.,'scope':'Supplied mixed graph only, under the monotonic event-search assumption; not an actual-material single-path proof.'},
        'source_binding':'SOURCE_BINDING.json','geometry_evidence':'SELECTED_GEOMETRY_CONTACTS.json',
        'existing_gcode_evidence':'GCODE_SELECTED_EVENT_CHECK.json','synthetic_tests':'ROUTE_ENGINE_TEST_RESULTS.json',
        'physical_strength':'UNVERIFIED','author_gui':'UNVERIFIED','new_slice_count':0,'send_count':0,'print_count':0,
        'elapsed_report_s':time.perf_counter()-start,'measured_event_samples':[{'model_z_mm':h,'mode':m,'graph_count':r['targets'][0]['graph_count'] if len(r['targets'])==1 else None} for (h,m),r in sorted(memo.items())]}
(R/'outputs/ROUTE_ANALYSIS.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'stable_target':stable,'events':events,'elapsed_s':report['elapsed_report_s']},indent=2))
