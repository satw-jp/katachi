"""Bounded read-only file observation; never loads or executes observed images.
Run from the isolated repo root. No DLL graph traversal or loader simulation.
"""
import hashlib, json, struct, sys, datetime
from pathlib import Path

ROOT = Path.cwd()
OLD = ROOT / 'docs/evidence/SLICE_CONSOLE_R01_CLOSURE_POLICY_2026-10-04'
OUT = ROOT / 'docs/evidence/SLICE_CONSOLE_R01_MSVC_UCRT_BINDING_2026-10-04'
MSVC = ['MSVCP140.dll', 'MSVCP140_CODECVT_IDS.dll', 'VCRUNTIME140.dll', 'VCRUNTIME140_1.dll', 'CONCRT140.dll']
APP = Path('J:/Program Files/Bambu Studio')
SYSTEM = Path('C:/Windows/System32')

def dump(name, value):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT/name).write_text(json.dumps(value, indent=2, ensure_ascii=False)+'\n', encoding='utf-8', newline='\n')

def scope():
    source = OLD/'PE_IMPORT_OBSERVATION.json'
    imports = {}
    for module in json.loads(source.read_text())['files']:
        for table in ['normal_imports','delay_imports']:
            for name in module[table]:
                if name in MSVC or name.lower().startswith('api-ms-win-crt-'):
                    imports.setdefault(name, []).append({'module': module['path'], 'table':table})
    assert len(imports)==17 and sum(n in MSVC for n in imports)==5
    result={'schema_version':'0.1','source':str(source.relative_to(ROOT)), 'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
            'imports':[{'IMPORT_NAME':n,'IMPORT_KIND':'MSVC_FILENAME' if n in MSVC else 'API_SET_CONTRACT','imported_by':v} for n,v in sorted(imports.items())]}
    dump('SCOPE_MANIFEST.json',result)
    return result

def stable_bytes(path):
    before=path.stat()
    with path.open('rb') as f:
        hb=__import__('os').fstat(f.fileno()); data=f.read(); ha=__import__('os').fstat(f.fileno())
    after=path.stat()
    key=lambda s:(s.st_size,s.st_mtime_ns,s.st_ino,s.st_dev)
    assert key(before)==key(hb)==key(ha)==key(after), 'file changed during read'
    return data

def pe_sections(data):
    assert data[:2]==b'MZ'
    off=struct.unpack_from('<I',data,0x3c)[0]
    assert data[off:off+4]==b'PE\0\0'
    machine,count=struct.unpack_from('<HH',data,off+4)
    opt=off+24; magic=struct.unpack_from('<H',data,opt)[0]
    start=opt+struct.unpack_from('<H',data,off+20)[0]
    sections=[]
    for i in range(count):
        pos=start+40*i
        name=data[pos:pos+8].rstrip(b'\0').decode('ascii')
        rawsize,rawpos=struct.unpack_from('<II',data,pos+16)
        assert rawpos+rawsize<=len(data)
        sections.append((name,rawpos,rawsize))
    return {'machine':hex(machine),'pe_magic':hex(magic),'architecture':{0x8664:'AMD64',0x14c:'I386'}.get(machine,'OTHER')},sections

def parse_v6(blob, names):
    def unpack(fmt,pos):
        size=struct.calcsize(fmt)
        if pos<0 or pos+size>len(blob): raise ValueError('schema offset out of range')
        return struct.unpack_from(fmt,blob,pos)
    version,size,flags,count,entries,hashoff,factor=unpack('<7I',0)
    if version!=6 or not 28<=size<=len(blob) or count>10000: raise ValueError('unsupported schema')
    blob=blob[:size]
    def text(pos,length):
        if length%2 or pos<0 or pos+length>len(blob): raise ValueError('invalid UTF16 range')
        return blob[pos:pos+length].decode('utf-16-le')
    result={}
    for i in range(count):
        ef,no,nl,hl,vo,vc=unpack('<6I',entries+i*24)
        name=text(no,nl)
        if name+'.dll' not in names: continue
        if vc>100: raise ValueError('invalid value count')
        values=[]
        for j in range(vc):
            vf,alias,al,host,hostlen=unpack('<5I',vo+j*20)
            values.append({'flags':vf,'importer_alias':text(alias,al),'host':text(host,hostlen)})
        if name in result: raise ValueError('duplicate contract')
        result[name+'.dll']={'entry_flags':ef,'values':values,'namespace_entry_offset':entries+i*24}
    return {'version':version,'size':size,'flags':flags,'entry_count':count,'mappings':result}

def observe():
    sc=scope() # freeze scope before file candidates
    metadata=json.loads((OUT/'PLATFORM_METADATA.json').read_text(encoding='utf-8-sig'))
    versions={x['path'].lower():x for x in metadata['files']}
    records=[]
    def identity(path, role):
        row={'path':str(path),'role':role,'exists':path.is_file()}
        if row['exists']:
            data=stable_bytes(path); arch,_=pe_sections(data)
            row.update({'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'version':versions.get(str(path).lower(),{}).get('file_version'), 'pe':arch,'stable_read':True})
        records.append(row)
        return row
    for n in MSVC:
        identity(APP/n,'APPLICATION_DIRECTORY_CANDIDATE')
        identity(SYSTEM/n,'SYSTEM32_INSTALLED_VC_RUNTIME_CANDIDATE')
    exe=identity(APP/'bambu-studio.exe','TARGET_RECHECK')
    dll=identity(APP/'BambuStudio.dll','TARGET_RECHECK')
    assert exe['sha256']=='7680dac4a953cb4f8a96cc2b4ad4ea0b8bfc62f937d3491256922ff24dbb8268'
    receipt=json.loads((OLD/'IDENTITY_LOCK.json').read_text())
    # Compare module hash against accepted receipt without assuming its layout.
    assert dll['sha256'] in json.dumps(receipt)
    schema=identity(SYSTEM/'apisetschema.dll','STATIC_API_SET_SCHEMA_FILE')
    data=stable_bytes(SYSTEM/'apisetschema.dll')
    assert hashlib.sha256(data).hexdigest()==schema['sha256']
    _,sections=pe_sections(data)
    parts=[data[p:p+n] for name,p,n in sections if name=='.apiset']
    assert len(parts)==1
    apinames={r['IMPORT_NAME'] for r in sc['imports'] if r['IMPORT_KIND']=='API_SET_CONTRACT'}
    mapping=parse_v6(parts[0],apinames)
    assert set(mapping['mappings'])==apinames
    hosts={v['host'] for row in mapping['mappings'].values() for v in row['values']}
    # Explicit bounded host observation from parsed mappings, not guessed names.
    assert all(Path(h).name==h and '/' not in h and '\\' not in h for h in hosts)
    for host in sorted(hosts):
        identity(APP/host,'API_SET_HOST_APPLICATION_CANDIDATE')
        identity(SYSTEM/host,'API_SET_HOST_SYSTEM32_CANDIDATE')
    dump('CANDIDATE_IDENTITIES.json',{'schema_version':'0.1','observed_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':records})
    dump('API_SET_SCHEMA_OBSERVATION.json',{'schema_version':'0.1','source_identity':schema,'scope':'on-disk .apiset version6 only; not effective process namespace','format_reference':'https://github.com/winsiderss/phnt/blob/master/ntpebteb.h', **mapping})
    results=[]
    for row in sc['imports']:
        n=row['IMPORT_NAME']; api=n in apinames
        values=mapping['mappings'][n]['values'] if api else []
        logical=values[0]['host'] if len(values)==1 and values[0]['importer_alias']=='' else None
        match=logical if api else n
        candidates=[r for r in records if Path(r['path']).name.lower()==(match or '').lower()]
        results.append({**row,'CANDIDATES':candidates,'RESOLUTION_STATUS':'UNRESOLVED',
          'RESOLVED_LOGICAL_HOST':logical,'LOGICAL_HOST_EVIDENCE':'STATIC_ON_DISK_SCHEMA' if logical else None,
          'RESOLVED_PATH':None,'SHA256':None,'VERSION':None,'ARCH':None,
          'EVIDENCE':['SCOPE_MANIFEST.json','CANDIDATE_IDENTITIES.json','PLATFORM_METADATA.json']+(['API_SET_SCHEMA_OBSERVATION.json'] if api else []),
          'BLOCKER':'EXACT_LOADER_CONTEXT_NOT_ESTABLISHED: redirection/activation context, effective search flags and dynamic BambuStudio.dll load context unproven'+('; on-disk schema not independently bound to effective process namespace' if api else ''),
          'LOADED_MODULE_VERIFIED':False})
    dump('BINDING_RESULT.json',{'schema_version':'0.1','status':'HOLD','CLOSURE_STATUS':'INCOMPLETE','STATIC_BINDING_RESOLVED':False,'API_SET_BINDING':'UNRESOLVED','LOADED_MODULE_VERIFIED':False,'imports':results,
      'actions':dict.fromkeys(['bambu_process_launch','real_slice','descriptor_integration','cache','REUSE','geometry_MINIL_change','printer_send','print','Print_GO_change'],0)})
    print(json.dumps({'imports':len(results),'schema_version':mapping['version'],'hosts':sorted(hosts),'candidate_files':sum(r['exists'] for r in records),'status':'INCOMPLETE'}))

if __name__=='__main__':
    if '--scope-only' in sys.argv: scope(); print('17 scoped imports frozen')
    else: observe()
