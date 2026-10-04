import json,hashlib,importlib.util,struct,datetime,shutil
from pathlib import Path
root=Path.cwd(); out=root/'docs/evidence/SLICE_CONSOLE_R01_MSVC_UCRT_BINDING_2026-10-04'
helper_path=root.parent/'observe_msvc_ucrt.py'
if not helper_path.is_file(): helper_path=out/'OBSERVATION_HELPER.py'
spec=importlib.util.spec_from_file_location('observe',helper_path); obs=importlib.util.module_from_spec(spec);spec.loader.exec_module(obs)
read=lambda n:json.loads((out/n).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
checks=[]
def check(name,fn):
    fn();checks.append({'name':name,'status':'PASS'})
def yes(value):
    assert value
sc=read('SCOPE_MANIFEST.json'); result=read('BINDING_RESULT.json'); ids=read('CANDIDATE_IDENTITIES.json'); api=read('API_SET_SCHEMA_OBSERVATION.json')
check('exact_scope_5_MSVC_12_API_set',lambda:yes(len(sc['imports'])==17 and sum(r['IMPORT_KIND']=='API_SET_CONTRACT' for r in sc['imports'])==12))
check('accepted_PE_observation_digest',lambda:yes(sha(root/sc['source'])==sc['source_sha256']))
check('all_9_existing_candidate_hashes_rechecked',lambda:yes(sum(r['exists'] for r in ids['files'])==9 and all(sha(Path(r['path']))==r['sha256'] for r in ids['files'] if r['exists'])))
check('AMD64_consistency',lambda:yes(all(r['pe']['machine']=='0x8664' and r['pe']['pe_magic']=='0x20b' for r in ids['files'] if r['exists'])))
check('12_unique_default_schema_mappings',lambda:yes(len(api['mappings'])==12 and all(v['values']==[{'flags':0,'importer_alias':'','host':'ucrtbase.dll'}] for v in api['mappings'].values())))
check('binding_remains_HOLD_loaded_false_actions_zero',lambda:yes(result['status']=='HOLD' and not result['STATIC_BINDING_RESOLVED'] and not result['LOADED_MODULE_VERIFIED'] and all(r['RESOLUTION_STATUS']=='UNRESOLVED' and r['RESOLVED_PATH'] is None and not r['LOADED_MODULE_VERIFIED'] for r in result['imports']) and not any(result['actions'].values())))
policy=root/'tools/slice-console/policies/ENGINE_RESOURCE_CLOSURE_POLICY_V0_1.json'; plan=root/'tools/slice-console/policies/WINDOWS_BAMBU_02080261_LOCK_PLAN.json'
check('accepted_policy_digest_preserved',lambda:yes(sha(policy)=='0e723c91813e0c126f43852bf8bf25faf358d66e42e032fa10c4792b520e8af3'))
# Synthetic v6 fixture checks: no executable fixture and no native library loading.
name='api-ms-win-crt-test-l1-1-0'; nameb=name.encode('utf-16-le');hostb='host.dll'.encode('utf-16-le')
nameoff=72;hostoff=nameoff+len(nameb);size=hostoff+len(hostb)
blob=struct.pack('<7I',6,size,0,1,28,0,0)+struct.pack('<6I',1,nameoff,len(nameb),len(nameb),52,1)+struct.pack('<5I',0,0,0,hostoff,len(hostb))+nameb+hostb
check('synthetic_v6_default_mapping',lambda:yes(obs.parse_v6(blob,{name+'.dll'})['mappings'][name+'.dll']['values'][0]['host']=='host.dll'))
check('synthetic_scope_filter',lambda:yes(not obs.parse_v6(blob,{'other.dll'})['mappings']))
def rejects(data):
    try:obs.parse_v6(data,{name+'.dll'})
    except (ValueError,struct.error):return
    raise AssertionError('invalid schema accepted')
check('synthetic_unsupported_version_rejected',lambda:rejects(struct.pack('<I',4)+blob[4:]))
bad=bytearray(blob);struct.pack_into('<I',bad,32,999999)
check('synthetic_out_of_bounds_rejected',lambda:rejects(bytes(bad)))
delta={'schema_version':'0.1','policy_id':'windows-bambu-02080261-msvc-ucrt-observation-delta-v0.1','accepted_policy':{'path':str(policy.relative_to(root)),'sha256':sha(policy),'preserved':True},'accepted_lock_plan':{'path':str(plan.relative_to(root)),'sha256':sha(plan),'preserved':True},'CLOSURE_STATUS':'INCOMPLETE','verified':False,'STATIC_BINDING_RESOLVED':False,'LOADED_MODULE_VERIFIED':False,'delta':'Static on-disk API-set mapping and candidate file identity evidence added; no unresolved closure item removed or promoted. Existing lock plan/receipt remain unchanged.','new_lock_entries':[], 'usable_identity':None,'remaining':['Exact effective MSVC/UCRT loader context and physical binding','Other transitive/dynamic native DLLs','Resource inheritance','Datadir discovery and executed-job binding','Python runtime','Effective environment','Path semantics'],'next_one_task':'WINDOWS BAMBU MSVC/UCRT LOADER CONTEXT — STATIC ACTIVATION/SEARCH CONFIGURATION ONLY; no process launch'}
obs.dump('CLOSURE_POLICY_DELTA_V0_1.json',delta)
obs.dump('CHECK_RESULTS.json',{'schema_version':'0.1','new_checks':checks,'pass':len(checks),'fail':0,'runtime_source_changed':False,'existing110_tests':'NOT RERUN: production runtime unchanged; historical PR44 result 110 PASS separately','Bambu_process_launch':0})
if helper_path.resolve()!=(out/'OBSERVATION_HELPER.py').resolve(): shutil.copyfile(helper_path,out/'OBSERVATION_HELPER.py')
if Path(__file__).resolve()!=(out/'VERIFICATION_HELPER.py').resolve(): shutil.copyfile(__file__,out/'VERIFICATION_HELPER.py')
digests={p.name:sha(p) for p in sorted(out.iterdir()) if p.is_file() and p.name!='ARTIFACT_DIGESTS.json'}
obs.dump('ARTIFACT_DIGESTS.json',{'schema_version':'0.1','digest_algorithm':'SHA256 exact artifact bytes','files':digests,'accepted_policy_sha256':sha(policy),'accepted_plan_sha256':sha(plan)})
table=[]
for row in ids['files']:
    if row['exists'] and row['role'] in ('SYSTEM32_INSTALLED_VC_RUNTIME_CANDIDATE','API_SET_HOST_SYSTEM32_CANDIDATE'):
        table.append('| '+Path(row['path']).name+' | '+str(row['bytes'])+' | '+row['version']+' | AMD64 | `'+row['sha256']+'` |')
scope='\n'.join('- `'+r['IMPORT_NAME']+'`' for r in sc['imports'])
doc='''# Windows Bambu MSVC / UCRT binding evidence — 2026-10-04
Decision owner: Author. **INCOMPLETE / HOLD**. Bounded outcome B complete; Author review pending.

## Authority and preservation
PR #44 was Draft/OPEN, mergeable, head32c0411714de254e499371566ed1b423aa645156, base main6997bd185b20839f2e63721c1ed3f45bb1a2343a, behind0 (rev-list1/0). Ready then expected-head normal merge. Fetched main/base6b5df19b0a2adc10f032a1ff0f6f58caad972bcf has parents6997bd1 and32c0411. New isolated branch `agent/slice-console-r0.1-msvc-ucrt-binding`; previous branch/worktree and installed source preserved.
Exact exe SHA7680dac4a953cb4f8a96cc2b4ad4ea0b8bfc62f937d3491256922ff24dbb8268 rechecked, version02.08.02.61. BambuStudio.dll SHA matches accepted receipt. Scope is Windows/Runner0.2.0/A1 0.4 single-filament configuration reference, no route execution claim.

## Fixed import scope
[SCOPE_MANIFEST](SLICE_CONSOLE_R01_MSVC_UCRT_BINDING_2026-10-04/SCOPE_MANIFEST.json) derives only names from accepted two-module PE observation with exact source digest and importing-module/table provenance. Five MSVC + twelve API-set names; no other native graph inspected.
'''+scope+'''

## Candidate file identities
All table paths are `C:/Windows/System32/<name>`. Versions are FileVersionInfo snapshots, not provenance or selected-load proof. Five MSVC candidates share version14.50.35719.0; VC x64 registry reports installed1/v14.50.35719.00. Registry version alone does not bind files to Bambu.

| Candidate | Bytes | File version | Architecture | SHA256 |
|---|---:|---|---|---|
'''+ '\n'.join(table)+'''

[Candidate identities](SLICE_CONSOLE_R01_MSVC_UCRT_BINDING_2026-10-04/CANDIDATE_IDENTITIES.json) records exact paths, existence, bytes/SHA, PE header, version, stable read for9 files (2 target rechecks,5 MSVC,1 UCRT host,1 schema). Six adjacent candidates are absent. No installed VC tree or Windows-wide DLL inventory was crawled. System32 files are installed-runtime candidates; no additional redistributable cache is inferred.

## API-set mapping
Read-only `C:/Windows/System32/apisetschema.dll` PE .apiset v6:194016bytes, SHA391a2818fdef14f4a9b6e6ce2a7e7f01d04f943de9ef543ec683927cfe480889, version10.0.26100.9278, AMD64. Namespace size171104/flags0/984 entries; only12 scoped matches retained. All have one empty-importer-alias default value `ucrtbase.dll`, with entry offsets recorded in [schema evidence](SLICE_CONSOLE_R01_MSVC_UCRT_BINDING_2026-10-04/API_SET_SCHEMA_OBSERVATION.json). This host name comes from local bytes, not a filename guess. Format layout follows [System Informer phnt primary header](https://github.com/winsiderss/phnt/blob/master/ntpebteb.h) observed2026-10-04; private format, v6 only, unsupported versions/ranges reject.
On-disk schema mapping is proven for these bytes; effective process namespace/host binding is not established. `API_SET_BINDING=UNRESOLVED`. No same-name API-set file is treated as implementation. [Microsoft API-set loader operation](https://learn.microsoft.com/en-us/windows/win32/apiindex/api-set-loader-operation) explains contract/schema/host distinction; host exports and per-function binding were outside this name-level observation.

## Static loader reasoning and blocker
[Platform metadata](SLICE_CONSOLE_R01_MSVC_UCRT_BINDING_2026-10-04/PLATFORM_METADATA.json): helper/OS64-bit, both Bambu target images and candidates AMD64. No WOW64 redirection experiment; native System32 candidate is architecture-consistent. [Microsoft filesystem redirector](https://learn.microsoft.com/en-us/windows/win32/winprog64/file-system-redirector).
Limited HKLM Session Manager KnownDLLs values were read for5 MSVC names plus the schema-derived UCRT host; no matching values. This is registry evidence only, not inspection of the boot-time KnownDll object namespace. Adjacent runtime files and two external module manifests were absent. Embedded activation contexts, redirection, package/search configuration and dynamic BambuStudio.dll load flags remain unproven.
Under an assumed ordinary unpackaged/default search, application directory precedes System32 after loader redirection/API-set/SxS/loaded-module/KnownDLL handling. Adjacent absence makes observed System32 files plausible candidates, but does not prove that assumption for this engine. Changed search flags/AddDllDirectory/SetDllDirectory or module load context can alter selection. [Microsoft DLL search order](https://learn.microsoft.com/en-us/windows/win32/dlls/dynamic-link-library-search-order). [Microsoft VC redistribution](https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files?view=msvc-170) distinguishes central/local deployment; existence is not engine binding.

Every [binding result](SLICE_CONSOLE_R01_MSVC_UCRT_BINDING_2026-10-04/BINDING_RESULT.json) is UNRESOLVED with candidates/evidence/blocker. API rows retain RESOLVED_LOGICAL_HOST only as on-disk-schema logical mapping; physical RESOLVED_PATH/SHA256/VERSION/ARCH are null. Their candidate identities remain available separately. `STATIC_BINDING_RESOLVED=false`, `LOADED_MODULE_VERIFIED=false`. PE name, physical filename, contract, logical host and loaded module are distinct.

## Policy / Identity Lock delta
[New observation delta](SLICE_CONSOLE_R01_MSVC_UCRT_BINDING_2026-10-04/CLOSURE_POLICY_DELTA_V0_1.json) references exact accepted policy/plan digests; it is an additive review artifact, not a replacement complete policy. Accepted policy SHA0e723c91813e0c126f43852bf8bf25faf358d66e42e032fa10c4792b520e8af3 preserved. No lock entries or receipts modified; no key generated. Overall CLOSURE_STATUS INCOMPLETE, verifiedfalse. Remaining other native graph/resource inheritance/datadir/Python/env/path gaps retained.

## Checks and action counts
New evidence checks:11 PASS/0 FAIL, including4 synthetic v6 parser checks, scope extraction,9 file rehashes, AMD64,12 mapping rows, held result/action zeros and accepted-policy digest. [CHECK_RESULTS](SLICE_CONSOLE_R01_MSVC_UCRT_BINDING_2026-10-04/CHECK_RESULTS.json), [exact artifact digests](SLICE_CONSOLE_R01_MSVC_UCRT_BINDING_2026-10-04/ARTIFACT_DIGESTS.json). One-shot observation/verification helpers are evidence tools only, never import or load native images; no production runtime changes. Source and accepted evidence Git diff checked separately before commit. Version metadata collected with Get-Item VersionInfo; registry reads Get-Item/Get-ItemProperty only. Helpers require the archived PLATFORM_METADATA and scope authority; they are not a general discovery API.
Existing110 tests NOT RERUN because runtime is unchanged; PR44's110 PASS is historical, not new test evidence. Bambu process/GUI/help/info/dummy/slice0; descriptor/cache/REUSE0; geometry/MINIL/send/print/Print GO change0. No process/module trace or environment/resource/path closure work.

## Next one task and stop
**WINDOWS BAMBU MSVC/UCRT LOADER CONTEXT — STATIC ACTIVATION/SEARCH CONFIGURATION ONLY**: one remaining blocker, determine whether bounded manifest/redirection/search-flag evidence can support a unique selection without process launch. Not started. Native transitive DLL task remains gated; descriptor/cache not advanced.

STOP: **SLICE CONSOLE R0.1 WINDOWS MSVC/UCRT BINDING — AUTHOR REVIEW**
'''
(root/'docs/evidence/SLICE_CONSOLE_R01_MSVC_UCRT_BINDING_2026-10-04.md').write_text(doc,encoding='utf-8',newline='\n')
print('11 new checks PASS; exact artifact digest '+sha(out/'CLOSURE_POLICY_DELTA_V0_1.json'))
