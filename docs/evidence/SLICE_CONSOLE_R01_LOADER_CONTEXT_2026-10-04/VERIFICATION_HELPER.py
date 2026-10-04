import json,hashlib,importlib.util,struct,shutil,subprocess
from pathlib import Path
ROOT=Path.cwd();OUT=ROOT/'docs/evidence/SLICE_CONSOLE_R01_LOADER_CONTEXT_2026-10-04'
helper=ROOT.parent/'observe_loader_context.py'
if not helper.exists():helper=OUT/'OBSERVATION_HELPER.py'
spec=importlib.util.spec_from_file_location('obs',helper);obs=importlib.util.module_from_spec(spec);spec.loader.exec_module(obs)
read=lambda n:json.loads((OUT/n).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
regpath=OUT/'SEARCH_REGISTRY_OBSERVATION.json';regpath.write_text(regpath.read_text(encoding='utf-8-sig'),encoding='utf-8',newline='\n')
authority=read('ACCEPTED_AUTHORITY.json');activation=read('ACTIVATION_OBSERVATION.json');redir=read('REDIRECTION_OBSERVATION.json');reg=read('SEARCH_REGISTRY_OBSERVATION.json')
prior=json.loads(obs.git_bytes(obs.PREV+'BINDING_RESULT.json'))
source={}
for name in ['job.py','runner.py']:
    path='tools/slice-console/'+name;data=obs.git_bytes(path)
    source[name]={'git_path':path,'accepted_commit':obs.ACCEPTED,'sha256':obs.digest(data),'relevant_lines':[{'line':i,'text':line} for i,line in enumerate(data.decode().splitlines(),1) if any(s in line for s in ['def resolve_cwd','raw_cwd','def resolve_env','raw_env','env = os.environ.copy()','env.update(resolve_env','cwd = resolve_cwd','cwd=str(cwd)','env=env','shell=False'])]}
search={'schema_version':'0.1','application_directory':str(obs.APP),'System32_candidate':'C:/Windows/System32; accepted AMD64 candidate evidence only','package_execution_model':'UNRESOLVED: GUI subsystem/Win32 manifests/absent adjacent AppxManifest do not prove effective package identity/dependency graph',
 'SafeDllSearchMode':'Registry value absent; documented default enabled, conditional on no parent/child search override','KnownDLLs':'No registry matches for scoped five MSVC and schema-derived host; boot-time object namespace not enumerated',
 'cwd':'Runner resolves explicit cli.cwd relative to job_dir or defaults to job_dir; no new job/process executed. Under standard safe order cwd follows System32; disabled safe order moves cwd before System32.',
 'PATH':'Runner inherits os.environ and overlays resolve_env; actual inherited PATH/parent process DLL directory state not established. No environment values dumped or PATH directory scan.',
 'static_search_order_assumption':'CONDITIONAL_ONLY: redirection/API-set/SxS/loaded modules/KnownDLL/package graph before application directory/System32; dynamic flags can alter order',
 'runtime_search_overrides':'UNRESOLVED: imported LoadLibraryExW/GetProcAddress are not call-site/flag/order proof; dynamically resolved APIs and startup/parent effects remain possible',
 'runner_source_evidence':source,'references':['https://learn.microsoft.com/en-us/windows/win32/dlls/dynamic-link-library-search-order','https://learn.microsoft.com/en-us/windows/win32/dlls/dynamic-link-library-redirection','https://learn.microsoft.com/en-us/windows/win32/sbscs/application-manifests']}
obs.put('SEARCH_POLICY_OBSERVATION.json',search)
blocker='EFFECTIVE_DYNAMIC_LOADER_CONTEXT_UNPROVEN: exact LoadLibraryExW path/flags/order and BambuStudio.dll loading, parent/child search state are not determined by static manifest/import evidence.'
results=[]
for row in prior['imports']:
    candidates=[x for x in row['CANDIDATES'] if x['exists'] and 'System32' in x['path']]
    assert len(candidates)==1
    results.append({'IMPORT_NAME':row['IMPORT_NAME'],'ACTIVATION_CONTEXT_STATUS':'STATIC_MANIFESTS_PARSED_EFFECTIVE_CONTEXT_UNRESOLVED','REDIRECTION_STATUS':'NO_SCOPED_STATIC_ARTIFACT_OBSERVED_EFFECTIVE_REDIRECTION_UNRESOLVED','SEARCH_POLICY_STATUS':'UNRESOLVED','HIGHER_PRIORITY_CANDIDATE':{'observed_static_scoped_candidates':[],'effective_higher_priority_candidates':'UNRESOLVED'},'STATIC_SELECTION_STATUS':'UNRESOLVED','CANDIDATE_PATH':candidates[0]['path'],'CANDIDATE_IDENTITY_AUTHORITY':obs.PREV+'CANDIDATE_IDENTITIES.json','LOGICAL_HOST_MAPPING_AUTHORITY':obs.PREV+'API_SET_SCHEMA_OBSERVATION.json' if row['IMPORT_KIND']=='API_SET_CONTRACT' else None,'RESOLVED_PATH':None,'BLOCKERS':[blocker],'EVIDENCE':['ACTIVATION_OBSERVATION.json','REDIRECTION_OBSERVATION.json','SEARCH_REGISTRY_OBSERVATION.json','SEARCH_POLICY_OBSERVATION.json','ACCEPTED_AUTHORITY.json'],'LOADED_MODULE_VERIFIED':False,
      'selection_conditions':{'logical_mapping':'ON_DISK_SCHEMA_OBSERVED_EFFECTIVE_MAPPING_UNPROVEN' if row['IMPORT_KIND']=='API_SET_CONTRACT' else 'NOT_APPLICABLE_FILENAME_IMPORT','architecture':'ACCEPTED_AMD64_CONSISTENT','higher_priority_absence':'PARTIAL_STATIC_ONLY','unique_static_search_policy':False,'dynamic_override_inertness_proven':False}})
result={'schema_version':'0.1','status':'HOLD','CLOSURE_STATUS':'INCOMPLETE','STATIC_BINDING_RESOLVED':False,'LOADED_MODULE_VERIFIED':False,'remaining_single_blocker':blocker,'imports':results,'actions':dict.fromkeys(['Bambu_process_launch','real_slice','descriptor_integration','cache','REUSE','geometry_MINIL_change','printer_send','print','Print_GO_change','process_trace'],0)}
obs.put('LOADER_CONTEXT_RESULT.json',result)
policy='tools/slice-console/policies/ENGINE_RESOURCE_CLOSURE_POLICY_V0_1.json';plan='tools/slice-console/policies/WINDOWS_BAMBU_02080261_LOCK_PLAN.json'
delta={'schema_version':'0.1','policy_id':'windows-bambu-02080261-loader-context-observation-delta-v0.1','accepted_policy':{'path':policy,'sha256':obs.digest(obs.git_bytes(policy)),'preserved':True},'accepted_plan':{'path':plan,'sha256':obs.digest(obs.git_bytes(plan)),'preserved':True},'new_static_evidence':['Two embedded manifests parsed: no scoped CRT/VC dependent assembly/file/bindingRedirect declaration','26 exact adjacent/external/.local/package-redirection pointers absent','Four limited registry search/redirection values absent; no KnownDLL scoped matches','Loader API name imports observed without call-site/flags proof'],'MSVC_UCRT_unresolved_narrowing':'No evidence of scoped static manifest/local redirection in observed installation pointers; effective dynamic/parent loader context remains unproven, no closure item removed.','remaining_single_blocker':blocker,'CLOSURE_STATUS':'INCOMPLETE','verified':False,'STATIC_BINDING_RESOLVED':False,'LOADED_MODULE_VERIFIED':False,'Identity_Lock_delta':None,'other_unresolved_items':'Preserved unchanged: native transitive/dynamic graph, resource inheritance, datadir, Python runtime, env, general path semantics','next_one_recommendation':'BAMBU LAUNCHER LoadLibraryExW CALL-SITE — EXACT BINARY STATIC ANALYSIS ONLY. Not started. If code evidence cannot close effective context, return a bounded process-evidence proposal to Author before any launch.'}
obs.put('CLOSURE_POLICY_DELTA_V0_1.json',delta)
checks=[]
def yes(v):assert v
def check(name,fn):fn();checks.append({'name':name,'status':'PASS'})
check('accepted_PR45_scope_digest_17_names',lambda:yes(authority['scope_git_blob_sha256']==obs.digest(obs.git_bytes(obs.PREV+'SCOPE_MANIFEST.json')) and {r['IMPORT_NAME'] for r in results}=={r['IMPORT_NAME'] for r in authority['imports']} and len(results)==17))
check('accepted_two_target_identities_and_raw_manifest_hashes',lambda:yes(all(m['accepted_identity_matches'] and sha(Path(m['path']))==m['sha256'] and all(sha(OUT/r['artifact'])==r['sha256'] for r in m['embedded_RT_MANIFEST']) for m in activation['modules'])))
check('two_manifest_resources_parse_no_scoped_runtime_declarations',lambda:yes(len(activation['modules'])==2 and all(len(m['embedded_RT_MANIFEST'])==1 and all(r['parsed']['root']=='assembly' and not r['parsed']['file_declarations'] and all(i['name']=='Microsoft.Windows.Common-Controls' for d in r['parsed']['dependent_assemblies'] for i in d['identities']) and all(not d['binding_redirects'] for d in r['parsed']['dependent_assemblies']) for r in m['embedded_RT_MANIFEST']) for m in activation['modules'])))
check('26_exact_redirection_candidates_checked_absent',lambda:yes(len(redir['candidates'])==26 and not any(r['exists'] for r in redir['candidates'])))
check('search_registry_and_source_evidence_explicit',lambda:yes(len(reg['registry_values'])==4 and not reg['known_dlls_matches'] and 'cwd' in search and 'PATH' in search and len(source)==2))
check('blocker_prevents_all17_candidate_promotions',lambda:yes(all(r['BLOCKERS'] and r['STATIC_SELECTION_STATUS']=='UNRESOLVED' and r['RESOLVED_PATH'] is None for r in results) and not result['STATIC_BINDING_RESOLVED']))
check('loaded_false_and_all_action_counts_zero',lambda:yes(not result['LOADED_MODULE_VERIFIED'] and all(not r['LOADED_MODULE_VERIFIED'] for r in results) and not any(result['actions'].values())))
check('accepted_policy_plan_exact_Git_bytes_unchanged',lambda:yes(delta['accepted_policy']['sha256']=='0e723c91813e0c126f43852bf8bf25faf358d66e42e032fa10c4792b520e8af3' and all(subprocess.check_output([obs.GIT,'show','HEAD:'+p])==obs.git_bytes(p) for p in [policy,plan])))
# Synthetic PE resource fixture. No native image execution or DLL loading.
fixture=bytearray(1024);fixture[:2]=b'MZ';struct.pack_into('<I',fixture,0x3c,128);fixture[128:132]=b'PE\0\0';struct.pack_into('<HH',fixture,132,0x8664,1);struct.pack_into('<H',fixture,148,240);struct.pack_into('<H',fixture,152,0x20b);struct.pack_into('<I',fixture,212,512);struct.pack_into('<II',fixture,280,4096,256);struct.pack_into('<III',fixture,404,4096,256,512)
for pos in [512,536,560]:struct.pack_into('<H',fixture,pos+14,1)
struct.pack_into('<II',fixture,528,24,0x80000018);struct.pack_into('<II',fixture,552,1,0x80000030);struct.pack_into('<II',fixture,576,1033,72)
xml=b'<assembly manifestVersion="1.0"/>';struct.pack_into('<4I',fixture,584,4184,len(xml),0,0);fixture[600:600+len(xml)]=xml
check('synthetic_RT_MANIFEST_resource_extract',lambda:yes(obs.Image(bytes(fixture)).manifests()[0]['raw']==xml))
def reject(fn):
    try:fn()
    except ValueError:return
    raise AssertionError('invalid input accepted')
bad=bytearray(fixture);struct.pack_into('<I',bad,580,999999)
check('synthetic_resource_out_of_bounds_rejected',lambda:reject(lambda:obs.Image(bytes(bad)).manifests()))
testxml=b'<assembly><dependency><dependentAssembly><assemblyIdentity name="Microsoft.VC.fake.CRT"/><bindingRedirect oldVersion="1.0" newVersion="2.0"/></dependentAssembly></dependency></assembly>'
check('synthetic_dependent_assembly_redirect_detected',lambda:yes(obs.manifest_xml(testxml)['dependent_assemblies'][0]['binding_redirects'][0]['newVersion']=='2.0'))
check('synthetic_UTF16_DTD_rejected',lambda:reject(lambda:obs.manifest_xml('<!DOCTYPE assembly [<!ENTITY a "x">]><assembly/>'.encode('utf-16'))))
obs.put('CHECK_RESULTS.json',{'schema_version':'0.1','checks':checks,'pass':len(checks),'fail':0,'existing110_tests':'NOT RERUN: production runtime unchanged; PR44 historical110 PASS','production_runtime_changes':0})
if helper.resolve()!=(OUT/'OBSERVATION_HELPER.py').resolve():shutil.copyfile(helper,OUT/'OBSERVATION_HELPER.py')
if Path(__file__).resolve()!=(OUT/'VERIFICATION_HELPER.py').resolve():shutil.copyfile(__file__,OUT/'VERIFICATION_HELPER.py')
obs.put('ARTIFACT_DIGESTS.json',{'schema_version':'0.1','algorithm':'SHA256 exact bytes','files':{p.name:sha(p) for p in sorted(OUT.iterdir()) if p.is_file() and p.name!='ARTIFACT_DIGESTS.json'},'accepted_policy_sha256':delta['accepted_policy']['sha256'],'accepted_plan_sha256':delta['accepted_plan']['sha256']})
print(str(len(checks))+' new evidence checks PASS; policy delta SHA '+sha(OUT/'CLOSURE_POLICY_DELTA_V0_1.json'))
