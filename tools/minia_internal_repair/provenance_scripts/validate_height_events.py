import pathlib,json,time
from real_graph import Context
R=pathlib.Path(__file__).resolve().parents[2];c=Context(R/'outputs')
a=c.members['R5_F3457_P1'];b=c.members['G0165']
edit={'id':'TEST_ONLY_001','a_member':a['id'],'a_parameter':len(a['points'])-1,'a_position':a['points'][-1],
      'b_member':b['id'],'b_parameter':len(b['points'])-1,'b_position':b['points'][-1]}
mode='PERMANENT_ONLY_AFTER_REMOVAL'
before=c.height_events(mode);after=c.height_events(mode,[edit])
assert before['cache_key']!=after['cache_key']
assert before['single_route_interval_estimate_mm']==[44.6,156]
assert before['route_onset_estimates']['2']['status']=='NOT_FOUND_THROUGH_RANGE'
assert after['route_onset_estimates']['2']['status']=='NOT_FOUND_THROUGH_RANGE'
t=time.perf_counter();cached=c.height_events(mode,[edit]);cached_s=time.perf_counter()-t
assert cached==after
report={'pass':True,'test_only_edit':edit,'before':before,'after':after,'cached_seconds':cached_s,
        'test_edit_in_author_candidate':False,'scope':'Conditional supplied-graph height event estimates only; explicit monotonic assumption, not physical timing.'}
(R/'outputs/HEIGHT_EVENT_COMPARISON_TEST.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({'before_interval':before['single_route_interval_estimate_mm'],'after_interval':after['single_route_interval_estimate_mm'],
                  'before_seconds':before['elapsed_s'],'after_seconds':after['elapsed_s'],'cached_seconds':cached_s}))
