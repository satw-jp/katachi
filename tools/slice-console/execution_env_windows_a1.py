"""Finite read-only B collector; candidate files, never loaded-module claims.

Public collection policy is pinned. Synthetic tests use the private bounded core.
No engine, Runner, Console, A identity, subprocess or directory discovery imports.
"""
import copy
import ctypes
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import uuid

from execution_env_v01 import _fingerprint, InvalidEnvironment

ROOT = Path(__file__).parent
COLLECTION_POLICY_PATH = ROOT/'policies/WINDOWS_A1_EXECUTION_ENV_COLLECTION_POLICY_V0_1.json'
COLLECTION_POLICY_SHA256 = '0bf5d306b79666dca379706fd329b1fc4e9e982c0246c10b3b43c785e611430b'
COMPATIBILITY_POLICY_PATH = ROOT/'policies/EXECUTION_ENV_COMPATIBILITY_POLICY_V0_1.json'
COMPATIBILITY_POLICY_SHA256 = 'f1b1e98e4d74582921da2c8bc1981ec9b46c784fd82cb08d96ea30395b6660e4'
DISTRIBUTION_POLICY_PATH = ROOT/'policies/PYTHON_EXECUTION_DISTRIBUTION_POLICY_V0_1.json'
DISTRIBUTION_POLICY_SHA256 = '9707b2ed4ba1e4cac3919b7ecb752f5702cb289105c1c7c8373799616734c0c4'
MAX_BYTES = 512*1024*1024
CHUNK_BYTES = 1024*1024


class ObservationGap(ValueError):
    def __init__(self, state, code):
        self.state, self.code = state, code


def _signature(info):
    return [info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns]


def stable_file_identity(path, *, max_bytes=MAX_BYTES, chunk_bytes=CHUNK_BYTES, accounting=None):
    """Streaming hash, bounded size, exact path/handle identity before/after.

    Missing, link/reparse, inaccessible, oversized or changing files never KNOWN.
    No missing-file hash and no search/resolve/fallback to another candidate.
    """
    path = Path(path).absolute()
    evidence = {'path':str(path), 'state':'UNKNOWN', 'sha256':None, 'size':None}
    try:
        if not 0 < chunk_bytes <= max_bytes <= MAX_BYTES:
            raise ObservationGap('UNKNOWN', 'INVALID_READ_BOUND')
        for part in (path, *path.parents):
            info = part.lstat()
            if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
                raise ObservationGap('UNTRUSTED', 'REPARSE_OR_SYMLINK')
        before = path.stat()
        if not stat.S_ISREG(before.st_mode) or before.st_size > max_bytes:
            raise ObservationGap('UNKNOWN', 'UNSUPPORTED_FILE_OR_SIZE')
        digest = hashlib.sha256(); total = 0
        with path.open('rb') as handle:
            if accounting is not None:
                accounting['file_read_count'] += 1
            first = os.fstat(handle.fileno())
            while True:
                chunk = handle.read(chunk_bytes)
                if not chunk:
                    break
                total += len(chunk)
                if accounting is not None:
                    accounting['stream_bytes_read'] += len(chunk)
                if total > max_bytes:
                    raise ObservationGap('UNTRUSTED', 'CHANGED_DURING_READ')
                digest.update(chunk)
            last = os.fstat(handle.fileno())
        after = path.stat()
        evidence.update(stat_before=_signature(before), stat_after=_signature(after),
                        handle_before=_signature(first), handle_after=_signature(last))
        # Windows path/handle ctime representations can differ. Compare ctime
        # within each source, and dev/inode/size/mtime across path and handle.
        if not (_signature(before) == _signature(after) and _signature(first) == _signature(last)
                and _signature(before)[:4] == _signature(first)[:4] and total == before.st_size):
            raise ObservationGap('UNTRUSTED', 'CHANGED_DURING_READ')
        evidence.update(state='KNOWN', sha256=digest.hexdigest(), size=total)
    except FileNotFoundError:
        evidence.update(state='MISSING', code='FILE_MISSING')
    except ObservationGap as exc:
        evidence.update(state=exc.state, code=exc.code)
    except OSError:
        evidence.update(state='UNTRUSTED', code='FILE_READ_FAILED')
    return evidence


def _native_architecture():
    class SystemInfo(ctypes.Structure):
        _fields_ = [('architecture',ctypes.c_ushort),('reserved',ctypes.c_ushort),
                    ('page_size',ctypes.c_ulong),('minimum',ctypes.c_void_p),
                    ('maximum',ctypes.c_void_p),('mask',ctypes.c_size_t),
                    ('processors',ctypes.c_ulong),('processor_type',ctypes.c_ulong),
                    ('granularity',ctypes.c_ulong),('level',ctypes.c_ushort),
                    ('revision',ctypes.c_ushort)]
    api = ctypes.WinDLL('kernel32', use_last_error=True).GetNativeSystemInfo
    api.argtypes = [ctypes.POINTER(SystemInfo)]; api.restype = None
    value = SystemInfo(); api(ctypes.byref(value))
    return value.architecture


def canonical_os_build(version):
    parts = (version.major, version.minor, version.build)
    if not all(type(x) is int and x >= 0 for x in parts):
        raise ValueError('INVALID_OS_BUILD')
    return '.'.join(str(x) for x in parts)


def _system_observations(policy):
    observations = {name:{'state':'UNKNOWN','value':None} for name in ('os_family','os_build','architecture')}
    evidence = {'methods':['os.name','sys.getwindowsversion','GetNativeSystemInfo']}
    if os.name != 'nt' or not hasattr(sys, 'getwindowsversion'):
        evidence['code'] = 'ACTUAL_WINDOWS_NOT_CONFIRMED'
        return observations, evidence
    try:
        version = sys.getwindowsversion()
        observations['os_family'] = {'state':'KNOWN','value':'Windows'}
        observations['os_build'] = {'state':'KNOWN','value':canonical_os_build(version)}
    except (OSError, ValueError, AttributeError):
        evidence['build_code'] = 'WINDOWS_VERSION_API_FAILED'
    try:
        code = _native_architecture()
        value = policy['os']['architecture_codes'].get(str(code))
        evidence['architecture_code'] = code
        if value:
            observations['architecture'] = {'state':'KNOWN','value':value}
    except (OSError, AttributeError):
        evidence['architecture_code'] = 'NATIVE_API_FAILED'
    return observations, evidence


def _read_shortcut(path):
    """In-process ShellLink COM, read-only Load/Get; never Resolve/Save/launch."""
    class GUID(ctypes.Structure):
        _fields_ = [('data',ctypes.c_ubyte*16)]
    def guid(value): return GUID.from_buffer_copy(uuid.UUID(value).bytes_le)
    def call(pointer, index, *types):
        table = ctypes.cast(pointer, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p))).contents
        return ctypes.WINFUNCTYPE(ctypes.c_long,ctypes.c_void_p,*types)(table[index])
    def check(code):
        if code < 0: raise OSError('SHORTCUT_API_FAILED')
    ole = ctypes.OleDLL('ole32')
    ole.CoInitializeEx.argtypes = [ctypes.c_void_p,ctypes.c_ulong]
    ole.CoInitializeEx.restype = ctypes.c_long
    init = ole.CoInitializeEx(None,2)
    # RPC_E_CHANGED_MODE means COM already initialized on this thread.
    if init < 0 and init != -2147417850: raise OSError('COM_INITIALIZATION_FAILED')
    link=ctypes.c_void_p(); persist=ctypes.c_void_p()
    try:
        clsid=guid('00021401-0000-0000-C000-000000000046')
        iid=guid('000214F9-0000-0000-C000-000000000046')
        ole.CoCreateInstance.argtypes=[ctypes.POINTER(GUID),ctypes.c_void_p,ctypes.c_ulong,ctypes.POINTER(GUID),ctypes.POINTER(ctypes.c_void_p)]
        ole.CoCreateInstance.restype=ctypes.c_long
        check(ole.CoCreateInstance(ctypes.byref(clsid),None,1,ctypes.byref(iid),ctypes.byref(link)))
        iid_persist=guid('0000010b-0000-0000-C000-000000000046')
        check(call(link,0,ctypes.POINTER(GUID),ctypes.POINTER(ctypes.c_void_p))(link,ctypes.byref(iid_persist),ctypes.byref(persist)))
        check(call(persist,5,ctypes.c_wchar_p,ctypes.c_ulong)(persist,str(path),0))
        target=ctypes.create_unicode_buffer(32768); arguments=ctypes.create_unicode_buffer(32768); cwd=ctypes.create_unicode_buffer(32768)
        check(call(link,3,ctypes.c_wchar_p,ctypes.c_int,ctypes.c_void_p,ctypes.c_ulong)(link,target,len(target),None,4))
        check(call(link,10,ctypes.c_wchar_p,ctypes.c_int)(link,arguments,len(arguments)))
        check(call(link,8,ctypes.c_wchar_p,ctypes.c_int)(link,cwd,len(cwd)))
        return {'target':target.value,'arguments':arguments.value,'cwd':cwd.value}
    finally:
        if persist: call(persist,2)(persist)
        if link: call(link,2)(link)
        if init >= 0: ole.CoUninitialize()


def _python_version_resource(path):
    """Finite executable VERSIONINFO read. No Python process/package enumeration."""
    api=ctypes.WinDLL('version',use_last_error=True)
    api.GetFileVersionInfoSizeW.argtypes=[ctypes.c_wchar_p,ctypes.POINTER(ctypes.c_ulong)]
    api.GetFileVersionInfoSizeW.restype=ctypes.c_ulong
    ignored=ctypes.c_ulong(); size=api.GetFileVersionInfoSizeW(str(path),ctypes.byref(ignored))
    if not 0 < size <= 1024*1024: raise OSError('PYTHON_VERSION_METADATA_UNAVAILABLE')
    data=ctypes.create_string_buffer(size)
    api.GetFileVersionInfoW.argtypes=[ctypes.c_wchar_p,ctypes.c_ulong,ctypes.c_ulong,ctypes.c_void_p]
    if not api.GetFileVersionInfoW(str(path),0,size,data): raise OSError('PYTHON_VERSION_METADATA_UNAVAILABLE')
    api.VerQueryValueW.argtypes=[ctypes.c_void_p,ctypes.c_wchar_p,ctypes.POINTER(ctypes.c_void_p),ctypes.POINTER(ctypes.c_uint)]
    pointer=ctypes.c_void_p(); length=ctypes.c_uint()
    if not api.VerQueryValueW(data,'\\VarFileInfo\\Translation',ctypes.byref(pointer),ctypes.byref(length)) or length.value < 4:
        raise OSError('PYTHON_VERSION_METADATA_UNAVAILABLE')
    translation=ctypes.cast(pointer,ctypes.POINTER(ctypes.c_ushort))
    prefix=f'\\StringFileInfo\\{translation[0]:04x}{translation[1]:04x}\\'
    values={}
    for name in ('ProductVersion','ProductName','CompanyName'):
        if not api.VerQueryValueW(data,prefix+name,ctypes.byref(pointer),ctypes.byref(length)):
            raise OSError('PYTHON_VERSION_METADATA_UNAVAILABLE')
        values[name]=ctypes.wstring_at(pointer,length.value).rstrip('\0')
    if (not values['ProductName'].startswith('Python') or values['CompanyName']!='Python Software Foundation'
            or not re.fullmatch(r'\d+\.\d+\.\d+',values['ProductVersion'])):
        raise OSError('PYTHON_IMPLEMENTATION_OR_VERSION_UNVERIFIED')
    return {'version':values['ProductVersion'],'implementation':'CPython'}


def _python_observation(policy, distribution, read):
    binding=policy['python_binding']; evidence={'shortcuts':[],'collector_runtime_assumed_production':False}
    targets=[]
    norm=lambda x:os.path.normcase(os.path.abspath(x))
    expected_app=str(Path(binding['expected_app_path']))
    for index,path in enumerate(binding['shortcut_paths']):
        before=read(path); item={'path':path,'identity':before}
        evidence['shortcuts'].append(item)
        if before['state']!='KNOWN': continue
        try:
            link=_read_shortcut(path)
            after=read(path)
            matched=(after['state']=='KNOWN' and before['sha256']==after['sha256'] and before['stat_before']==after['stat_before']
                     and link['arguments']==f'"{expected_app}"'+(' --startup' if index==1 else '')
                     and norm(link['cwd'])==norm(binding['expected_working_directory'])
                     and Path(link['target']).is_absolute()
                     and Path(link['target']).name.casefold() in binding['allowed_executable_names'])
            item.update(target=link['target'],route_binding_matched=matched)
            if matched: targets.append(link['target'])
        except (OSError, AttributeError, ValueError): item['code']='SHORTCUT_METADATA_UNAVAILABLE'
    value={'executable_sha256':None,'version':None,'implementation':None,'distribution':distribution}
    if len(targets)!=len(binding['shortcut_paths']) or len({norm(x) for x in targets})!=1:
        evidence['code']='PYTHON_BINDING_AMBIGUOUS'
        return {'state':'UNTRUSTED','value':value},evidence
    target=targets[0]; identity=read(target); evidence['target_identity']=identity
    if identity['state']!='KNOWN':
        evidence['code']='PYTHON_TARGET_NOT_STABLE_REGULAR_FILE'
        return {'state':'UNTRUSTED','value':value},evidence
    try:
        metadata=_python_version_resource(target); after=read(target)
        if after['state']!='KNOWN' or after['sha256']!=identity['sha256'] or after['stat_before']!=identity['stat_before']:
            raise OSError('PYTHON_CHANGED_DURING_VERSION_READ')
        value.update(executable_sha256=identity['sha256'],**metadata)
        evidence['code']='EXACT_OPERATIONAL_SHORTCUT_RUNTIME_BOUND'
        return {'state':'KNOWN','value':value},evidence
    except (OSError, AttributeError, ValueError):
        evidence['code']='PYTHON_VERSION_OR_IMPLEMENTATION_UNVERIFIED'
        return {'state':'UNTRUSTED','value':value},evidence


def _environment_observation(policy, lookup=os.environ.get):
    entries=[]
    for name in policy['inherited_environment']['names']:
        raw=lookup(name)  # Only six approved names; no enumeration or raw logging.
        state='unset' if raw is None else 'empty' if raw=='' else 'present'
        identity=hashlib.sha256(raw.encode('utf-8')).hexdigest() if state=='present' else None
        entries.append({'name':name,'state':state,'value_identity':identity,'classification':'HASHED_NONSECRET'})
    return {'state':'UNTRUSTED','value':{'policy_version':'0.1','entries':entries}}, {
        'source':'collector process candidate values; not production Runner env',
        'code':'RUNNER_INHERITED_ENV_BINDING_UNPROVEN','names_read':[x['name'] for x in entries]}


def _collect(policy, compatibility, distribution, *, accounting=None):
    """Private fixture core; public entry pins all three finite declarations."""
    accounting=accounting if accounting is not None else {'file_read_count':0,'stream_bytes_read':0,'process_launch_count':0}
    evidence={'file_reads':[]}; observations={}; blockers=[]
    def read(path):
        item=stable_file_identity(path,max_bytes=policy['stable_read']['max_bytes'],
                                  chunk_bytes=policy['stable_read']['chunk_bytes'],accounting=accounting)
        evidence['file_reads'].append(item); return item
    observations, evidence['system']=_system_observations(policy)
    route=read(policy['route']['engine_executable']['path'])
    route_ok=route['state']=='KNOWN' and route['sha256']==policy['route']['engine_executable']['sha256']
    for name in ('engine_companion','api_set_schema'):
        item=read(policy['files'][name]); observations[name]={'state':item['state'],'value':{'sha256':item['sha256']}}
    candidates={}
    for name,path in policy['files']['native_runtime_manifest'].items(): candidates[name]=read(path)
    # System32 in a 32-bit process can be redirected. Do not call it the declared
    # native candidate or invent Sysnative/search fallback.
    arch=observations['architecture']['value']
    if arch in ('AMD64','ARM64') and ctypes.sizeof(ctypes.c_void_p)!=8:
        for item in [*candidates.values()]: item.update(state='UNTRUSTED',sha256=None,code='SYSTEM32_REDIRECTION_AMBIGUITY')
        observations['api_set_schema']={'state':'UNTRUSTED','value':{'sha256':None}}
    states=[x['state'] for x in candidates.values()]
    state=next((s for s in ('UNTRUSTED','UNKNOWN','MISSING','STALE') if s in states),'KNOWN')
    observations['native_runtime_manifest']={'state':state,'value':{'identity_kind':'OBSERVED_CANDIDATES_NOT_LOADED',
        'entries':[{'logical_name':name,'sha256':item['sha256'],'size':item['size'] or 0,'role':'runtime_candidate'} for name,item in candidates.items()]}}
    for name,logical in (('vc_runtime_candidate','vcruntime140.dll'),('ucrt_candidate','ucrtbase.dll')):
        item=candidates[logical]; observations[name]={'state':item['state'],'value':{'identity_kind':'OBSERVED_CANDIDATE_FINGERPRINT','sha256':item['sha256']}}
    observations['python'],evidence['python_binding']=_python_observation(policy,distribution,read)
    observations['inherited_environment'],evidence['environment_binding']=_environment_observation(policy)
    if not route_ok:
        observations['engine_companion']={'state':'UNTRUSTED','value':{'sha256':None}}
        blockers.append({'code':'ENGINE_ROUTE_IDENTITY_UNVERIFIED','pointer':'/route'})
    for name,item in observations.items():
        if item['state']!='KNOWN': blockers.append({'code':item['state'],'pointer':'/observations/'+name})
    raw=compatibility['raw']; cp=compatibility['value']
    fingerprint={'schema_version':'0.1','domain':'EXECUTION_ENV_FINGERPRINT/v0.1',
      'policy':{'domain':cp['domain'],'policy_id':cp['policy_id'],'version':cp['policy_version'],'sha256':hashlib.sha256(raw).hexdigest()},
      'coverage':copy.deepcopy(cp['coverage']),'observations':observations,
      'provenance':{'collected_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    'collector_run_id':str(uuid.uuid4()),'human_note':'Collection-time B baseline only; no historical execution backfill or loaded-module claim'}}
    _,digest=_fingerprint(fingerprint,'/collected')
    return {'COLLECTOR_STATUS':'COMPLETE','FINGERPRINT':fingerprint,'FINGERPRINT_SEMANTIC_SHA256':digest,
            'blockers':blockers,'OBSERVATION_EVIDENCE':evidence,'provenance':{'collection_policy_sha256':COLLECTION_POLICY_SHA256,
             'collector_source_sha256':None,'distribution_policy_sha256':DISTRIBUTION_POLICY_SHA256},'IO_ACCOUNTING':accounting}


def collect_windows_a1_execution_env_v0_1():
    """Read only pinned finite candidates; gaps yield a valid COMPLETE document.

    INCOMPLETE means a pinned declaration or the required document cannot be
    verified/constructed. Collector never compares or authorizes REUSE.
    """
    accounting={'file_read_count':0,'stream_bytes_read':0,'process_launch_count':0}
    policy_evidence=[]
    try:
        documents=[]
        for path,pin in ((COLLECTION_POLICY_PATH,COLLECTION_POLICY_SHA256),
                         (COMPATIBILITY_POLICY_PATH,COMPATIBILITY_POLICY_SHA256),
                         (DISTRIBUTION_POLICY_PATH,DISTRIBUTION_POLICY_SHA256)):
            item=stable_file_identity(path,accounting=accounting); policy_evidence.append(item)
            if item['state']!='KNOWN' or item['sha256']!=pin: raise ObservationGap('UNTRUSTED','PINNED_POLICY_IDENTITY_MISMATCH')
            raw=path.read_bytes(); accounting['file_read_count']+=1; accounting['stream_bytes_read']+=len(raw)
            if hashlib.sha256(raw).hexdigest()!=pin: raise ObservationGap('UNTRUSTED','PINNED_POLICY_CHANGED')
            documents.append((raw,json.loads(raw)))
        (collection_raw,policy),(compatibility_raw,cp),(distribution_raw,dist)=documents
        if cp['directional_rules']!=[] or policy['compatibility_policy_sha256']!=COMPATIBILITY_POLICY_SHA256:
            raise ObservationGap('UNKNOWN','UNACCEPTED_COMPATIBILITY_POLICY')
        canonical=json.dumps(dist,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
        distribution={'fingerprint_sha256':hashlib.sha256(canonical).hexdigest(),
                      'policy_id':dist['policy_id'],'policy_version':dist['policy_version'],'policy_sha256':DISTRIBUTION_POLICY_SHA256}
        result=_collect(policy,{'raw':compatibility_raw,'value':cp},distribution,accounting=accounting)
        result['OBSERVATION_EVIDENCE']['policy_reads']=policy_evidence
        source=stable_file_identity(Path(__file__),accounting=accounting)
        result['provenance']['collector_source_sha256']=source['sha256']
        result['OBSERVATION_EVIDENCE']['collector_source']=source
        return result
    except (ObservationGap,OSError,ValueError,TypeError,KeyError,InvalidEnvironment):
        return {'COLLECTOR_STATUS':'INCOMPLETE','FINGERPRINT':None,'FINGERPRINT_SEMANTIC_SHA256':None,
                'blockers':[{'code':'COLLECTION_DECLARATION_OR_DOCUMENT_UNVERIFIED','pointer':'/'}],
                'OBSERVATION_EVIDENCE':{'policy_reads':policy_evidence},'provenance':{},'IO_ACCOUNTING':accounting}
