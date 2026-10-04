"""Bounded static xrefs for exact Bambu launcher, not a decompiler/loader emulator.
Only Python/Capstone/tooling runs; target bytes are read, never mapped or executed.
Run from repo root with Capstone5.0.6 available on PYTHONPATH or work dependency path.
"""
import sys,json,struct,hashlib,importlib.util,bisect,datetime
from pathlib import Path
sys.dont_write_bytecode=True
ROOT=Path.cwd();OUT=ROOT/'docs/evidence/SLICE_CONSOLE_R01_DLL_LOAD_CALLSITE_2026-10-04'
if (ROOT.parent/'static-analysis-deps').exists():sys.path.insert(0,str(ROOT.parent/'static-analysis-deps'))
import capstone as cs
from capstone.x86_const import X86_OP_MEM,X86_REG_RIP,X86_OP_IMM
old=ROOT/'docs/evidence/SLICE_CONSOLE_R01_LOADER_CONTEXT_2026-10-04/OBSERVATION_HELPER.py'
sp=importlib.util.spec_from_file_location('previous_pe',old);pe=importlib.util.module_from_spec(sp);sp.loader.exec_module(pe)
TARGET=Path('J:/Program Files/Bambu Studio/bambu-studio.exe')
WATCH={'LoadLibraryExW','LoadLibraryW','LoadLibraryA','GetProcAddress'}
MUTATION={'SetDllDirectoryA','SetDllDirectoryW','AddDllDirectory','SetDefaultDllDirectories','SetCurrentDirectoryA','SetCurrentDirectoryW'}
PATH_APIS={'GetModuleFileNameW','GetModuleFileNameA','GetFullPathNameW','GetCurrentDirectoryW'}
def put(n,v):
    OUT.mkdir(parents=True,exist_ok=True);(OUT/n).write_text(json.dumps(v,indent=2)+'\n',encoding='utf-8',newline='\n')
def initial():
    data=pe.stable(TARGET);sha=hashlib.sha256(data).hexdigest();assert sha=='7680dac4a953cb4f8a96cc2b4ad4ea0b8bfc62f937d3491256922ff24dbb8268'
    image=pe.Image(data);base=struct.unpack_from('<Q',data,image.optional+24)[0]
    imports={};r,size=image.directory(1)
    for idx in range(1024):
        oft,t,c,name,ft=struct.unpack('<5I',image.get(image.rva(r+idx*20,20),20))
        if not any((oft,t,c,name,ft)):break
        assert oft
        for j in range(10000):
            val=struct.unpack('<Q',image.get(image.rva(oft+j*8,8),8))[0]
            if not val:break
            if val>>63:continue
            fn=image.cstr(val+2)
            imports[ft+j*8]={'name':fn,'module':image.cstr(name),'IAT_RVA':hex(ft+j*8),'INT_RVA':hex(oft+j*8),'hint_name_RVA':hex(val),'IAT_FILE_OFFSET':hex(image.rva(ft+j*8,8))}
        else:raise ValueError('thunk bounds')
    funcs=[];r,size=image.directory(3)
    for pos in range(0,size,12):
        start,end,unwind=struct.unpack('<3I',image.get(image.rva(r+pos,12),12))
        if start:funcs.append((start,end,unwind))
    funcs.sort();starts=[f[0] for f in funcs]
    def parent(rva):
        idx=bisect.bisect_right(starts,rva)-1
        if idx>=0 and funcs[idx][0]<=rva<funcs[idx][1]:return funcs[idx]
        return None
    literals=[]
    for encoding,needle in [('ascii',b'BambuStudio.dll'),('utf-16-le','BambuStudio.dll'.encode('utf-16-le'))]:
        pos=0
        while True:
            pos=data.find(needle,pos)
            if pos<0:break
            rva=None
            for va,size,raw in image.sections:
                if raw<=pos<raw+size:rva=va+pos-raw;break
            literals.append({'encoding':encoding,'value':'BambuStudio.dll','file_offset':hex(pos),'RVA':hex(rva) if rva is not None else None,'bytes_hex':needle.hex()});pos+=len(needle)
    md=cs.Cs(cs.CS_ARCH_X86,cs.CS_MODE_64);md.detail=True;md.skipdata=True
    insns={};coverage=[]
    coff=image.optional+image.u16(image.optional-4)
    # Disassemble executable section bytes only for reference enumeration.
    for i in range(image.u16(image.optional-18)):
        s=coff+i*40;flags=image.u32(s+36)
        if not flags&0x20000000:continue
        va,rawsize,raw=image.u32(s+12),image.u32(s+16),image.u32(s+20)
        virtual=image.u32(s+8);limit=min(rawsize,virtual)
        decoded=list(md.disasm(data[raw:raw+limit],va))
        for ins in decoded:
            if ins.id:insns[ins.address]=ins
        coverage.append({'section':data[s:s+8].rstrip(b'\0').decode(),'RVA':hex(va),'bytes':limit,'decoded_instruction_count':sum(bool(x.id) for x in decoded),'skipdata_bytes':sum(x.size for x in decoded if not x.id),'method':'linear section decode; supplemented at .pdata function anchors'})
    # Function-anchored decoding avoids relying only on linear sweep alignment.
    for start,end,u in funcs:
        for ins in md.disasm(image.get(image.rva(start,end-start),end-start),start):
            if ins.id:insns[ins.address]=ins
    def row(ins):
        out={'RVA':hex(ins.address),'file_offset':hex(image.rva(ins.address,ins.size)),'bytes':ins.bytes.hex(),'instruction':ins.mnemonic+' '+ins.op_str}
        refs=[]
        for o in ins.operands:
            if o.type==X86_OP_MEM and o.mem.base==X86_REG_RIP:refs.append(ins.address+ins.size+o.mem.disp)
        if refs:out['RIP_targets']=[hex(x) for x in refs]
        for ref in refs:
            if ref in imports:out['import_target']=imports[ref]['name']
        return out
    iatrefs=[];stringrefs=[];litset={int(x['RVA'],16) for x in literals if x['RVA']}
    for ins in sorted(insns.values(),key=lambda x:x.address):
        for o in ins.operands:
            target=ins.address+ins.size+o.mem.disp if o.type==X86_OP_MEM and o.mem.base==X86_REG_RIP else None
            if target in imports and imports[target]['name'] in WATCH|MUTATION:
                iatrefs.append({**row(ins),'target':imports[target], 'reference_kind':'DIRECT_IAT_CALL_OR_JUMP' if ins.mnemonic in ('call','jmp') else 'IAT_POINTER_REFERENCE_ONLY','function_range':[hex(x) for x in parent(ins.address)] if parent(ins.address) else None})
            if target in litset or (o.type==X86_OP_IMM and (o.imm in litset or o.imm-base in litset)):
                stringrefs.append({**row(ins),'function_range':[hex(x) for x in parent(ins.address)] if parent(ins.address) else None})
    relevant=[]
    stringfunctions={tuple(x['function_range']) for x in stringrefs if x['function_range']}
    for ref in iatrefs:
        if ref['target']['name'] in WATCH and tuple(ref['function_range'] or []) in stringfunctions:relevant.append(ref)
    thunk_targets={int(x['RVA'],16):x['target']['name'] for x in iatrefs if x['instruction'].startswith('jmp ')}
    thunk_callers=[]
    for ins in sorted(insns.values(),key=lambda x:x.address):
        if ins.mnemonic in ('call','jmp') and len(ins.operands)==1 and ins.operands[0].type==X86_OP_IMM and ins.operands[0].imm in thunk_targets:
            thunk_callers.append({**row(ins),'thunk_RVA':hex(ins.operands[0].imm),'target_API':thunk_targets[ins.operands[0].imm]})
    path_edges=[]
    for ins in sorted(insns.values(),key=lambda x:x.address):
        if ins.mnemonic.startswith('j') and len(ins.operands)==1 and ins.operands[0].type==X86_OP_IMM and 0x547e<=ins.operands[0].imm<=0x5660:
            path_edges.append({**row(ins),'target_RVA':hex(ins.operands[0].imm)})
    snippets=[]
    for fhex in sorted(stringfunctions):
        start,end,unwind=map(lambda x:int(x,16),fhex)
        snippets.append({'function_begin_RVA':hex(start),'function_end_RVA':hex(end),'unwind_RVA':hex(unwind),'instructions':[row(insns[p]) for p in sorted(insns) if start<=p<end]})
    # Read only the directory-construction prefix feeding the relevant fragment.
    prefix=[row(insns[p]) for p in sorted(insns) if 0x547e<=p<0x550e]
    context_imports=[v for v in imports.values() if v['name'] in {'GetModuleFileNameW','_wsplitpath','_wmakepath','memset'}]
    unwind_chain=[];u=0x9614
    for _ in range(10):
        h=image.get(image.rva(u,4),4);flags=h[0]>>3;count=h[2]
        rec={'unwind_RVA':hex(u),'version':h[0]&7,'flags':flags,'code_count':count}
        if flags&4:
            nxt=struct.unpack('<3I',image.get(image.rva(u+4+((count+1)//2)*4,12),12));rec['chained_function']=[hex(x) for x in nxt];unwind_chain.append(rec);u=nxt[2]
        else:unwind_chain.append(rec);break
    else:raise ValueError('unwind chain limit')
    tool_dll=Path(cs.__file__).parent/'lib/capstone.dll'
    result={'schema_version':'0.1','target':str(TARGET),'sha256':sha,'bytes':len(data),'image_base':hex(base),'tool':{'python':sys.version.split()[0],'capstone':cs.__version__,'binding_path':cs.__file__,'binding_sha256':hashlib.sha256(Path(cs.__file__).read_bytes()).hexdigest(),'disassembler_library_path':str(tool_dll),'disassembler_library_sha256':hashlib.sha256(tool_dll.read_bytes()).hexdigest() if tool_dll.is_file() else None,'method':'PE import/INT/IAT parser; AMD64 Capstone linear and .pdata anchored instruction decode; RIP-relative xrefs; manual bounded register/path reasoning. No decompiler or execution.'},
      'watch_imports':{name:[v for v in imports.values() if v['name']==name] for name in sorted(WATCH)},'mutation_imports':{name:[v for v in imports.values() if v['name']==name] for name in sorted(MUTATION)},'loader_IAT_xrefs':iatrefs,'loader_thunk_direct_callers':thunk_callers,'direct_path_region_branch_edges':path_edges,'BambuStudio_dll_literals':literals,'literal_xrefs':stringrefs,'same_function_relevant_sites':relevant,'relevant_function_snippets':snippets,'path_construction_prefix':prefix,'path_context_imports':context_imports,'relevant_unwind_chain':unwind_chain,'RBX_zero_source':row(insns[0x51d3]),'DLL_utf16_copy_bytes':image.get(image.rva(0x8868,32),32).hex(),'export_name_after_load':image.cstr(0x88b8),'coverage':coverage,'limitations':['Direct RIP IAT references enumerated in decoded bytes; pointer references not inferred to be calls','No guarantee arbitrary runtime-computed/register/dynamically-resolved targets are exhaustively identified','Same-function membership is candidate relevance; dataflow must be reviewed before asserting argument binding'],'LOADED_MODULE_VERIFIED':False}
    put('STATIC_XREF_OBSERVATION.json',result)
    if '--quiet' in sys.argv:
        print(json.dumps({'IAT_xrefs':len(iatrefs),'thunk_callers':thunk_callers,'path_context_imports':context_imports,'unwind_chain':unwind_chain,'coverage':coverage}));return
    print(json.dumps({k:result[k] for k in ['watch_imports','loader_IAT_xrefs','BambuStudio_dll_literals','literal_xrefs','same_function_relevant_sites']},indent=2))
    for snippet in snippets:
        print('FUNCTION',snippet['function_begin_RVA'],snippet['function_end_RVA'])
        for ins in snippet['instructions']:print(ins['RVA'],ins['instruction'],ins.get('import_target',''))

if __name__=='__main__':initial()
