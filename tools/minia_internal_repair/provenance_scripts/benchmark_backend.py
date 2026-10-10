import sys,time,json,ctypes,ctypes.wintypes
from pathlib import Path
ROOT=Path(r'J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra')
sys.path.insert(0,str(ROOT/'work/route_visualizer'))
from real_graph import Context
class PMC(ctypes.Structure):
 _fields_=[('cb',ctypes.wintypes.DWORD),('PageFaultCount',ctypes.wintypes.DWORD),('PeakWorkingSetSize',ctypes.c_size_t),('WorkingSetSize',ctypes.c_size_t),('QuotaPeakPagedPoolUsage',ctypes.c_size_t),('QuotaPagedPoolUsage',ctypes.c_size_t),('QuotaPeakNonPagedPoolUsage',ctypes.c_size_t),('QuotaNonPagedPoolUsage',ctypes.c_size_t),('PagefileUsage',ctypes.c_size_t),('PeakPagefileUsage',ctypes.c_size_t)]
def memory():
 try:
  x=PMC();x.cb=ctypes.sizeof(x);ctypes.windll.psapi.GetProcessMemoryInfo(ctypes.windll.kernel32.GetCurrentProcess(),ctypes.byref(x),x.cb);return {'rss_bytes':x.WorkingSetSize,'peak_rss_bytes':x.PeakWorkingSetSize}
 except Exception:return {'rss_bytes':None,'peak_rss_bytes':None}
t=time.perf_counter();ctx=Context(ROOT/'outputs');load=time.perf_counter()-t
rows=[]
for h,m in [(43.2,'PRINTING_WITH_SUPPORT'),(43.2,'PERMANENT_ONLY_AFTER_REMOVAL'),(45.0,'PRINTING_WITH_SUPPORT'),(45.0,'PERMANENT_ONLY_AFTER_REMOVAL')]:
 t=time.perf_counter();r=ctx.evaluate(h,m);rows.append({'height_mm':h,'mode':m,'elapsed_s':r['elapsed_s'],'wall_s':time.perf_counter()-t,'target_count':len(r['targets']),'target_counts':[{'status':x['status'],'graph_count':x['graph_count'],'lower':x['lower'],'upper':x['upper'],'common_branch_failures':x['common_branch_failures'],'common_joint_failures':x['common_joint_failures'],'verified_model_geometry_route_lower_bound':x.get('verified_model_geometry_route_lower_bound')} for x in r['targets']], 'node_count':r['node_count'],'edge_count':r['edge_count']})
print(json.dumps({'context_load_s':load,'evaluations':rows,'memory':memory(),'module_version':__import__('route_analysis').VERSION},indent=2),flush=True)
