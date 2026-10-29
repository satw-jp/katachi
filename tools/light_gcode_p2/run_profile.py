from pathlib import Path
import sys,time,json,threading,os,traceback,collections,hashlib
start=time.perf_counter();P=Path(__file__).parent;variant=sys.argv[1];limit=int(sys.argv[2]);tag=sys.argv[3];out=P/tag;out.mkdir(exist_ok=False)
(out/'CODE_IDENTITY.json').write_text(json.dumps({n:hashlib.sha256((P/variant/n).read_bytes()).hexdigest() for n in ('continuous_area.py','light_gcode_diagnostic.py')}))
sys.path[:0]=[str(P/variant),str(P/'deps'),str(P.parents[1]/'outputs/MINIL_LOWZ50_SAVED_LIGHT_GCODE_DIAGNOSTIC_20261023/runtime'),'J:/My Drive/codex/2026-09-05/files-mentioned-by-the-user-samples/work/r2/vendor']
import light_gcode_diagnostic as d
from continuous_area import AreaBoundsScreen as A
import ctypes
class PMC(ctypes.Structure):
 _fields_=[('cb',ctypes.c_ulong),('PageFaultCount',ctypes.c_ulong)]+[(n,ctypes.c_size_t) for n in ('PeakWorkingSetSize','WorkingSetSize','QuotaPeakPagedPoolUsage','QuotaPagedPoolUsage','QuotaPeakNonPagedPoolUsage','QuotaNonPagedPoolUsage','PagefileUsage','PeakPagefileUsage')]
def memory():
 p=PMC();p.cb=ctypes.sizeof(p);ctypes.windll.psapi.GetProcessMemoryInfo.argtypes=[ctypes.c_void_p,ctypes.POINTER(PMC),ctypes.c_ulong];ok=ctypes.windll.psapi.GetProcessMemoryInfo(ctypes.c_void_p(-1),ctypes.byref(p),p.cb)
 if not ok:raise RuntimeError('MEMORY_MONITOR_UNAVAILABLE')
 return p.WorkingSetSize
assert memory()>0
state={'line_started':0,'line_completed':0,'stage':'startup'};tot=collections.defaultdict(float);rows={};peak=0;done=False
proofs=(out/'AREA_PROOFS.jsonl').open('w');trace=(out/'TRACE.jsonl').open('w');events=(out/'EVENTS.jsonl').open('w');stack=[]
def monitor():
 global peak
 while not done:
  rss=memory();peak=max(peak,rss);elapsed=time.perf_counter()-start
  snap=dict(state,seconds=elapsed,rss=rss,peak_rss=peak,cpu_seconds=time.process_time(),phase_seconds=dict(tot),active_line_metrics=dict(rows.get(state['line_started'],{})))
  (out/'LIVE.json').write_text(json.dumps(snap))
  if elapsed>300 or rss>2147483648:
   snap['status']='BUDGET_STOP';snap['reason']='WALL_300S' if elapsed>300 else 'RSS_2GB';(out/'STOP.json').write_text(json.dumps(snap,indent=2));os._exit(21)
  time.sleep(.5)
threading.Thread(target=monitor,daemon=True).start()
def wrap(owner,name,stage,observe=None):
 fn=getattr(owner,name)
 is_static=isinstance(owner.__dict__.get(name),staticmethod) if isinstance(owner,type) else False
 def f(*args,**kw):
  previous=state['stage'];state['stage']=stage;t=time.perf_counter()
  if stage=='support_area':
   state['area_donor_count']=len(args[6]);state['area_calls_started']=state.get('area_calls_started',0)+1
   if state['line_started']==4212:(out/('AREA_INPUT_'+str(state['area_calls_started'])+'.json')).write_text(json.dumps(dict(args=args[1:],kwargs=kw)))
  try:
   res=fn(*args,**kw)
   if observe:observe(args,res)
   return res
  finally:
   dt=time.perf_counter()-t;tot[stage]+=dt;r=rows.setdefault(state['line_started'],collections.defaultdict(float));r[stage]+=dt;state['stage']=previous
 setattr(owner,name,staticmethod(f) if is_static else f)
def candidate_observe(args,res):
 state['last_candidate_count']=len(res);r=rows.setdefault(state['line_started'],collections.defaultdict(float));r['candidate_count']+=len(res)
def coverage_observe(args,res):
 
 if getattr(args[0],'last_area_proof',None):proofs.write(json.dumps(dict(line=state['line_started'],**args[0].last_area_proof))+'\n')
 state['last_split_nodes']=res[3];r=rows.setdefault(state['line_started'],collections.defaultdict(float));r['split_nodes']+=res[3];r['coverage_calls']+=1
wrap(d.Reader,'line','parser');wrap(d,'arc_reporting_parts','arc_expansion');wrap(A,'_candidates','spatial_candidates',candidate_observe);wrap(A,'_coverage_bounds','support_area',coverage_observe);wrap(A,'_overlapping_candidates','unknown_tracking');wrap(A,'commit_move','commit')

import continuous_area as ca
from collections import Counter
calls=Counter();samples=Counter();cause_sets={};segment_indices=Counter()
causes=(out/'CAUSES.jsonl').open('w');root_file=(out/'ROOT_SETS.jsonl').open('w')
def observe_overlap(args,res):
 calls['overlap_calls']+=1;calls['overlap_candidates']+=len(args[-1]);calls['overlap_hits']+=len(res)
wrap(A,'_overlapping_candidates','overlap_profile',observe_overlap)
def observe_distance(args,res):calls['distance_calls']+=1
wrap(ca,'_segment_distance','segment_distance',observe_distance)
original_segment=A.segment
def segment_audit(self,*args,**kwargs):
 code,detail=original_segment(self,*args,**kwargs)
 line=args[6];idx=segment_indices[line];segment_indices[line]+=1
 roots=tuple(detail.get('origin_root_lines',()))
 key=hashlib.sha256(json.dumps(roots,separators=(',',':')).encode()).hexdigest()
 if key not in cause_sets:
  cause_sets[key]=True;root_file.write(json.dumps([key,roots])+'\n')
 causes.write(json.dumps([line,idx,code,key,detail.get('reason'),detail.get('prior_coverage_lower'),detail.get('prior_coverage_upper')])+'\n')
 calls['segments']+=1;calls['root_references_seen']+=len(roots)
 return code,detail
A.segment=segment_audit

class Sink:
 def write(self,s):
  t=time.perf_counter();old=state['stage'];state['stage']='evidence_write';events.write(s);tot['evidence_write']+=time.perf_counter()-t;state['stage']=old
def lines():
 with open(P/'PREFIX_200000.gcode','rb') as f:
  for n,raw in enumerate(f,1):
   if n>limit:break
   state['line_started']=n;state['raw']=raw.decode().strip();t=time.perf_counter();yield raw
   state['line_completed']=n;r=rows.pop(n,{});r.update(line=n,seconds=time.perf_counter()-t,raw=raw.decode().strip());trace.write(json.dumps(r)+'\n')
   if n%100==0:trace.flush();events.flush()
try:
 result=d.analyze_stream(lines(),'ecaa3527c26a6b608191cb4fac4f6d8db6d1c871be2b1adc62854d7f84266415','3621f2f42bab5881d7a8dae1045337e0c32e950531261256ed3b7496d8be6744',zmax=50.,limit_lines=limit,max_examples=0,event_sink=Sink(),geometry_mode='area_bounds_v2',**({'independent_refinement':True} if variant=='p2' else {}))
 state['stage']='result_write';(out/'RESULT.json').write_text(json.dumps(result,default=lambda x:x.tolist() if hasattr(x,'tolist') else str(x)))
 status='COMPLETED'
except BaseException as e:status='FAILED';(out/'ERROR.txt').write_text(traceback.format_exc())
finally:
 done=True;proofs.close();trace.close();events.close();causes.close();root_file.close();(out/'TRACKING_COUNTS.json').write_text(json.dumps(dict(calls),indent=2));record=dict(state,status=status,seconds=time.perf_counter()-start,peak_rss=peak,cpu_seconds=time.process_time(),phase_seconds=dict(tot),limit=limit,variant=variant);(out/'EXECUTION.json').write_text(json.dumps(record,indent=2));print(json.dumps(record),flush=True)


