"""One-shot evidence helper for two accepted PE images; never loads/executes them.
Run from isolated repo root. No DLL graph, process trace, environment dump or parser API integration.
"""
import hashlib,json,struct,datetime,subprocess,sys,os
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT=Path.cwd()
OUT=ROOT/'docs/evidence/SLICE_CONSOLE_R01_LOADER_CONTEXT_2026-10-04'
PREV='docs/evidence/SLICE_CONSOLE_R01_MSVC_UCRT_BINDING_2026-10-04/'
ACCEPTED='97e0634aa4ee2a737b8b0f33cece44eb3bdc98ef'
GIT=r'C:\Users\as\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe'
APP=Path('J:/Program Files/Bambu Studio')
WATCH={'LoadLibraryA','LoadLibraryW','LoadLibraryExA','LoadLibraryExW','SetDllDirectoryA','SetDllDirectoryW','AddDllDirectory','RemoveDllDirectory','SetDefaultDllDirectories','GetProcAddress','LoadPackagedLibrary','CreateActCtxW','CreateActCtxA','ActivateActCtx','DeactivateActCtx'}

def digest(data): return hashlib.sha256(data).hexdigest()
def git_bytes(path): return subprocess.check_output([GIT,'show',ACCEPTED+':'+path])
def put(name,value):
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/name).write_text(json.dumps(value,indent=2,ensure_ascii=False)+'\n',encoding='utf-8',newline='\n')
def stable(path):
    before=path.stat()
    with path.open('rb') as f:
        hb=os.fstat(f.fileno());data=f.read();ha=os.fstat(f.fileno())
    after=path.stat();key=lambda s:(s.st_size,s.st_mtime_ns,s.st_ino,s.st_dev)
    if not key(before)==key(hb)==key(ha)==key(after):raise ValueError('file changed')
    return data
def manifest_xml(raw):
    # No DTD/entity/network expansion. Reject unsupported declarations fail closed.
    declarations=raw.upper().replace(b'\0',b'')
    if b'<!DOCTYPE' in declarations or b'<!ENTITY' in declarations:raise ValueError('unsupported XML declaration')
    root=ET.fromstring(raw.rstrip(b'\0'))
    tag=lambda e:e.tag.split('}')[-1]
    return {'root':tag(root),'assembly_identities':[dict(e.attrib) for e in root.iter() if tag(e)=='assemblyIdentity'],
      'dependent_assemblies':[{'identities':[dict(c.attrib) for c in e.iter() if tag(c)=='assemblyIdentity'],'binding_redirects':[dict(c.attrib) for c in e.iter() if tag(c)=='bindingRedirect']} for e in root.iter() if tag(e)=='dependentAssembly'],
      'file_declarations':[dict(e.attrib) for e in root.iter() if tag(e)=='file'],
      'requested_execution_levels':[dict(e.attrib) for e in root.iter() if tag(e)=='requestedExecutionLevel'],
      'no_inherit':any(tag(e)=='noInherit' for e in root.iter()),'assembly_attributes':dict(root.attrib)}

class Image:
    def __init__(self,data):
        self.data=data
        if data[:2]!=b'MZ':raise ValueError('not DOS image')
        p=self.u32(0x3c)
        if data[p:p+4]!=b'PE\0\0':raise ValueError('not PE')
        self.machine=self.u16(p+4);self.magic=self.u16(p+24)
        if self.magic!=0x20b or self.machine!=0x8664:raise ValueError('expected AMD64 PE32+')
        self.optional=p+24;self.dirs=self.optional+112;self.sections=[]
        for i in range(self.u16(p+6)):
            s=self.optional+self.u16(p+20)+i*40
            self.sections.append((self.u32(s+12),self.u32(s+16),self.u32(s+20)))
        self.header_size=self.u32(self.optional+60)
    def get(self,p,n):
        if p<0 or n<0 or p+n>len(self.data):raise ValueError('file range out of bounds')
        return self.data[p:p+n]
    def u16(self,p):return struct.unpack('<H',self.get(p,2))[0]
    def u32(self,p):return struct.unpack('<I',self.get(p,4))[0]
    def rva(self,r,n=1):
        if r<self.header_size and r+n<=self.header_size:self.get(r,n);return r
        for va,size,p in self.sections:
            if va<=r and r+n<=va+size:self.get(p+r-va,n);return p+r-va
        raise ValueError('RVA not backed by bytes')
    def directory(self,index):return self.u32(self.dirs+index*8),self.u32(self.dirs+index*8+4)
    def cstr(self,r):
        p=self.rva(r);end=self.data.find(b'\0',p,min(len(self.data),p+4096))
        if end<0:raise ValueError('unterminated name')
        return self.data[p:end].decode('ascii')
    def manifests(self):
        r,size=self.directory(2)
        if not r:return []
        base=self.rva(r,size); result=[]
        def bounded(offset,length):
            if offset<0 or offset+length>size:raise ValueError('resource range out of bounds')
            return base+offset
        def label(v):
            if not v&0x80000000:return v
            p=bounded(v&0x7fffffff,2);length=self.u16(p)
            return self.get(bounded((v&0x7fffffff)+2,length*2),length*2).decode('utf-16-le')
        def entries(offset):
            p=bounded(offset,16);count=self.u16(p+12)+self.u16(p+14)
            if count>10000:raise ValueError('resource count')
            for i in range(count):
                q=bounded(offset+16+i*8,8)
                yield self.u32(q),self.u32(q+4)
        def descend(offset,labels,depth):
            if depth>3:raise ValueError('resource depth')
            for name,target in entries(offset):
                labels2=labels+[label(name)]
                if target&0x80000000:descend(target&0x7fffffff,labels2,depth+1)
                else:
                    p=bounded(target,16);dr,n,cp,res=struct.unpack('<4I',self.get(p,16))
                    if n>1024*1024:raise ValueError('manifest too large')
                    raw=self.get(self.rva(dr,n),n)
                    result.append({'resource_path':labels2,'codepage':cp,'data_rva':dr,'raw':raw})
        for name,target in entries(0):
            if label(name)!=24:continue
            if not target&0x80000000:raise ValueError('RT_MANIFEST missing directory')
            descend(target&0x7fffffff,[24],1)
        return result
    def loader_imports(self):
        r,size=self.directory(1);result=[]
        if r:
            for i in range(1024):
                p=self.rva(r+20*i,20);oft,stamp,chain,name,ft=struct.unpack('<5I',self.get(p,20))
                if not any((oft,stamp,chain,name,ft)):break
                if not oft: # Never reinterpret bound IAT as name table.
                    result.append({'status':'UNRESOLVED_ORIGINAL_THUNK_ABSENT','import_module':self.cstr(name)});continue
                for j in range(100000):
                    val=struct.unpack('<Q',self.get(self.rva(oft+8*j,8),8))[0]
                    if not val:break
                    if val&0x8000000000000000:continue
                    fn=self.cstr(val+2)
                    if fn in WATCH:result.append({'import_module':self.cstr(name),'function':fn,'table':'normal'})
                else:raise ValueError('unterminated thunk table')
            else:raise ValueError('unterminated import directory')
        delay=self.directory(13)
        return {'watched_functions':result,'delay_directory':{'rva':delay[0],'size':delay[1]},'interpretation':'Import name presence is not call execution/argument/flags proof; absence cannot exclude GetProcAddress or other modules.'}
    def metadata(self):
        flags=self.u16(self.optional+70)
        return {'machine':hex(self.machine),'pe_magic':hex(self.magic),'subsystem':self.u16(self.optional+68),'dll_characteristics':hex(flags),'NO_ISOLATION':bool(flags&0x200),'load_config_directory':dict(zip(['rva','size'],self.directory(10))),'scope':'Header metadata only; no load-config code execution, packaged identity or startup-call proof'}

def observe():
    scopeb=git_bytes(PREV+'SCOPE_MANIFEST.json');scope=json.loads(scopeb)
    prior_digests=json.loads(git_bytes(PREV+'ARTIFACT_DIGESTS.json'))['files']
    assert digest(scopeb)==prior_digests['SCOPE_MANIFEST.json']
    apib=git_bytes(PREV+'API_SET_SCHEMA_OBSERVATION.json');assert digest(apib)==prior_digests['API_SET_SCHEMA_OBSERVATION.json']
    ids=json.loads(git_bytes(PREV+'CANDIDATE_IDENTITIES.json'))['files']
    assert len(scope['imports'])==17
    put('ACCEPTED_AUTHORITY.json',{'accepted_commit':ACCEPTED,'scope_path':PREV+'SCOPE_MANIFEST.json','scope_git_blob_sha256':digest(scopeb),'api_set_git_blob_sha256':digest(apib),'imports':scope['imports'],'note':'Digests are exact accepted Git blob bytes; checkout CRLF is not authority.'})
    observations=[]
    for name in ['bambu-studio.exe','BambuStudio.dll']:
        path=APP/name;data=stable(path);prior=next(x for x in ids if Path(x['path']).name==name)
        assert digest(data)==prior['sha256']
        image=Image(data);mrows=[]
        for i,m in enumerate(image.manifests()):
            raw=m.pop('raw');filename=name+'.RT_MANIFEST.'+str(i)+'.xml'
            (OUT/filename).write_bytes(raw)
            mrows.append({**m,'bytes':len(raw),'sha256':digest(raw),'artifact':filename,'parsed':manifest_xml(raw)})
        observations.append({'path':str(path),'bytes':len(data),'sha256':digest(data),'accepted_identity_matches':True,'metadata':image.metadata(),'embedded_RT_MANIFEST':mrows,'loader_function_imports':image.loader_imports()})
    put('ACTIVATION_OBSERVATION.json',{'schema_version':'0.1','observed_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'modules':observations,'loaded_or_executed':False})
    scoped_names=[r['IMPORT_NAME'] for r in scope['imports'] if r['IMPORT_KIND']=='MSVC_FILENAME']+['ucrtbase.dll']
    candidates=[APP/'bambu-studio.exe.manifest',APP/'BambuStudio.dll.manifest',APP/'bambu-studio.exe.2.manifest',APP/'BambuStudio.dll.2.manifest',APP/'bambu-studio.exe.local',APP/'BambuStudio.dll.local',APP/'AppxManifest.xml',APP/'microsoft.system.package.metadata/application.local']
    candidates += [APP/n for n in scoped_names]
    candidates += [APP/'bambu-studio.exe.local'/n for n in scoped_names]
    candidates += [APP/'microsoft.system.package.metadata/application.local'/n for n in scoped_names]
    rows=[]
    for path in candidates:
        row={'path':str(path),'exists':path.exists(),'is_file':path.is_file(),'is_directory':path.is_dir()}
        if row['is_file']:
            raw=stable(path);row.update({'bytes':len(raw),'sha256':digest(raw)})
            if path.name.lower().endswith('.manifest') or path.name=='AppxManifest.xml':row['manifest']=manifest_xml(raw)
        rows.append(row)
    put('REDIRECTION_OBSERVATION.json',{'schema_version':'0.1','candidates':rows,'scope':'Exact pointers only; no directory inventory, SxS store or PATH scan; .local file contents never interpreted as search config','effective_redirection':'UNRESOLVED'})
    print(json.dumps({'target_modules':len(observations),'embedded_manifest_counts':[len(m['embedded_RT_MANIFEST']) for m in observations],'redirection_candidates':len(rows),'existing_candidates':sum(r['exists'] for r in rows),'scope':17}))

if __name__=='__main__':observe()
