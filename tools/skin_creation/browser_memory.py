import ctypes,json,time,sys
from ctypes import wintypes
from pathlib import Path
pidfile=Path(sys.argv[1]);out=Path(sys.argv[2]);stop=Path(sys.argv[3]);peaks={};sampled=0;samples=0
class C(ctypes.Structure):
 _fields_=[('cb',wintypes.DWORD),('PageFaultCount',wintypes.DWORD)]+[(n,ctypes.c_size_t) for n in ('PeakWorkingSetSize','WorkingSetSize','QuotaPeakPagedPoolUsage','QuotaPagedPoolUsage','QuotaPeakNonPagedPoolUsage','QuotaNonPagedPoolUsage','PagefileUsage','PeakPagefileUsage')]
k=ctypes.windll.kernel32;k.OpenProcess.restype=wintypes.HANDLE;k.CloseHandle.argtypes=[wintypes.HANDLE]
while not stop.exists():
 try:ids=json.loads(pidfile.read_text())
 except Exception:ids=[]
 total=0
 for pid in ids:
  h=k.OpenProcess(0x410,False,int(pid))
  if not h:continue
  c=C();c.cb=ctypes.sizeof(c)
  if ctypes.windll.psapi.GetProcessMemoryInfo(wintypes.HANDLE(h),ctypes.byref(c),c.cb):
   peaks[str(pid)]=max(peaks.get(str(pid),0),c.PeakWorkingSetSize);total+=c.WorkingSetSize
  k.CloseHandle(h)
 sampled=max(sampled,total);samples+=1;time.sleep(.05)
out.write_text(json.dumps(dict(sampleIntervalSeconds=.05,samples=samples,sampledAggregatePeakWorkingSetBytes=sampled,perProcessPeakWorkingSetBytes=peaks,sumIndividualPeaksUpperBoundBytes=sum(peaks.values()),exactSimultaneousPeak='UNKNOWN'),indent=2))
