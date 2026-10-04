"""Read-only Windows A1/0.4 request adapter. No engine/Console/cache import.

Production policy is immutable/pinned and currently holds resource coverage.
An internal core accepts fixture policy only for focused synthetic tests.
"""
from decimal import Decimal
import hashlib
import json
import os
from pathlib import Path
import stat

from job import load_job, resolve_argv, resolve_cwd, _input_contract_errors
from slice_key_v02 import generate_request_key_v0_2, canonical_decimal, _pairs, _constant, ATTESTATIONS

POLICY_PATH = Path(__file__).parent / 'policies/WINDOWS_A1_04_REQUEST_IDENTITY_POLICY_V0_1.json'
POLICY_SHA256 = '15a49d183e1702cec0eccccdec114555828f32ea69cf7865688d8ab03f941f59'

class AdapterHold(ValueError):
    def __init__(self, code, pointer):
        self.code, self.pointer = code, pointer
        super().__init__(code + ': ' + pointer)

def require(ok, code, pointer):
    if not ok: raise AdapterHold(code, pointer)

def _signature(s):
    return (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)

def stable_read(path):
    """Bounded fresh read; reject links/reparse, changed path/handle identity."""
    path = Path(path).absolute()
    for part in (path, *path.parents):
        info = part.lstat()
        require(not stat.S_ISLNK(info.st_mode) and not (getattr(info, 'st_file_attributes', 0) & 0x400), 'REPARSE_PATH', str(part))
    before = path.stat()
    require(stat.S_ISREG(before.st_mode) and before.st_size <= 16 * 1024 * 1024, 'UNSUPPORTED_FILE', str(path))
    with path.open('rb') as handle:
        first = os.fstat(handle.fileno())
        chunks = []
        total = 0
        while True:
            chunk = handle.read(65536)
            if not chunk: break
            chunks.append(chunk)
            total += len(chunk)
            require(total <= 16 * 1024 * 1024, 'CHANGED_FILE', str(path))
        last = os.fstat(handle.fileno())
    after = path.stat()
    require(_signature(before) == _signature(after) and _signature(first) == _signature(last)
            and _signature(before)[:4] == _signature(first)[:4], 'CHANGED_FILE', str(path))
    data = b''.join(chunks)
    require(len(data) == before.st_size, 'CHANGED_FILE', str(path))
    return data, {'path':str(path), 'size':len(data), 'sha256':hashlib.sha256(data).hexdigest(),
                  'before':list(_signature(before)), 'after':list(_signature(after)),
                  'handle_before':list(_signature(first)), 'handle_after':list(_signature(last))}

def parse(data):
    return json.loads(data.decode('utf-8'), parse_int=Decimal, parse_float=Decimal,
                      parse_constant=_constant, object_pairs_hook=_pairs)

def _adapt(job_path, backend_dir, run_dir, policy, policy_sha, platform):
    result = {'ADAPTER_STATUS':'HOLD', 'COVERAGE_POLICY_VERSION':policy['policy_version'],
              'COVERAGE_POLICY_SHA256':policy_sha, 'DESCRIPTOR':None,
              'ATTESTATION_EVIDENCE':{k:{'value':False,'checks':[]} for k in sorted(ATTESTATIONS)},
              'blockers':[], 'FRESH_IDENTITIES':[], 'RESOLVED_ARGV':None, 'GENERATOR_RESULT':None, 'SLICE_KEY':None, 'CANONICAL_REQUEST_SHA256':None, 'CANONICAL_REQUEST_DIGESTS':None, 'ENGINE_STARTED':False}
    evidence = result['ATTESTATION_EVIDENCE']
    reads = []
    def read(path, expected=None):
        try:
            data, item = stable_read(path)
        except OSError as exc:
            raise AdapterHold('FILE_UNAVAILABLE', str(path)) from exc
        result['FRESH_IDENTITIES'].append(item)
        reads.append((Path(path), item))
        require(expected is None or item['sha256'] == expected, 'HASH_MISMATCH', str(path))
        return data, item
    def attest(flag, checks):
        require(bool(checks) and all(checks), 'ATTESTATION_INCOMPLETE', flag)
        evidence[flag] = {'value':True,'checks':[{'check':label,'passed':True} for label in checks]}
    try:
        raw_bytes, job_identity = read(job_path)
        raw = parse(raw_bytes)
        require(type(raw) is dict and set(raw) == set(policy['job_fields']), 'UNCLASSIFIED_JOB_FIELD', '/job')
        require(platform == 'Windows' and raw['schema_version'] == '0.2' and raw['input_mode'] == 'mesh_import', 'UNSUPPORTED_ROUTE', '/job')
        require(type(raw['cli']) is dict and not set(raw['cli']) - set(policy['cli_fields']), 'UNCLASSIFIED_CLI_FIELD', '/cli')
        require(raw['cli'].get('version') == policy['route']['engine_version'], 'UNSUPPORTED_ROUTE', '/cli/version')
        require(raw['cli'].get('windows_execution') == 'no_window', 'UNSUPPORTED_ROUTE', '/cli/windows_execution')
        require(raw['cli'].get('env', {}) == {}, 'UNCLASSIFIED_ENV_OVERRIDE', '/cli/env')
        require(type(raw['profiles']) is dict and set(raw['profiles']) == {'printer','process','filament'}
                and type(raw['inputs']) is list and len(raw['inputs']) == 1, 'UNSUPPORTED_ROUTE', '/profiles/inputs')
        require(type(raw['mesh']) is dict and set(raw['mesh']) == set(policy['mesh_fields']), 'UNKNOWN_INPUT_SEMANTICS', '/mesh')
        # Existing loader/resolver consumes no processes. Final fresh reverify below
        # binds its reread and STL inspection to the captured immutable observation.
        spec = load_job(job_path)
        require(str(spec.engine_path) == str(Path(policy['route']['engine_path'])), 'UNSUPPORTED_ROUTE', '/engine_path')
        require(spec.inputs[0].suffix.lower() == '.stl' and raw['mesh']['units'] == 'mm', 'UNSUPPORTED_ROUTE', '/mesh/units')
        locks_data, _ = read(spec.locks_path)
        locks = parse(locks_data)
        require(set(locks) == {'version','files'} and locks['version'] == '1' and type(locks['files']) is dict, 'INVALID_LOCK', '/locks')
        expected_paths = [spec.inputs[0], *[spec.profiles[x] for x in ('printer','process','filament')]]
        lock_map = {(spec.job_dir / key).resolve():value for key,value in locks['files'].items()}
        require(len(lock_map) == len(locks['files']) and set(lock_map) == {p.resolve() for p in expected_paths}, 'INVALID_LOCK_COVERAGE', '/locks/files')
        identities = {}
        profile_json = {}
        for p in expected_paths:
            data, item = read(p, lock_map[p.resolve()])
            identities[str(p)] = item
            if p.suffix.lower() == '.json': profile_json[str(p)] = parse(data)
        require(identities[str(spec.inputs[0])]['sha256'] == policy['input_semantics']['accepted_geometry_sha256'], 'UNSUPPORTED_INPUT_SEMANTICS', '/inputs/0')
        errors, _ = _input_contract_errors(spec)
        require(not errors, 'INVALID_MESH_CONTRACT', '/mesh')
        require(raw['mesh']['intended_transform'] == {'translation_mm':[0,0,0],'rotation_deg':[0,0,0],'scale':[1,1,1]}, 'UNSUPPORTED_TRANSFORM', '/mesh/intended_transform')
        semantics = {k:{'state':'not_applicable'} for k in ('assembly','modifier','enforcer','authored_support','process_fixture','other','provenance')}
        for k, description in (('assembly','explicit --assemble request intent'), ('process_fixture','clean single STL diagnostic fixture')):
            semantics[k] = {'state':'present','value':{'identity_sha256':hashlib.sha256(description.encode()).hexdigest(),'description':description}}
        attest('input_semantics_complete', ['one locked STL','mm/bounds/identity intended transform checked','policy diagnostic role and assembly/fixture tags; no extra object channel'])
        printer, process, filament = [profile_json[str(spec.profiles[k])] for k in ('printer','process','filament')]
        require(printer.get('name') == policy['route']['printer'] and printer.get('nozzle_diameter') == ['0.4']
                and process.get('type') == 'process' and filament.get('type') == 'filament'
                and filament.get('filament_type') == ['PLA'], 'UNSUPPORTED_PROFILE', '/profiles')
        require(not any(p.get('inherits') for p in (printer,process,filament)), 'PROFILE_PARENT_UNRESOLVED', '/profiles/inherits')
        # Literal profile bytes remain bound; flatness alone does NOT close defaults.
        require(raw['cli'].get('argv') == policy['argv_template'], 'UNCLASSIFIED_ARGV', '/cli/argv')
        argv = resolve_argv(spec, Path(run_dir))
        result['RESOLVED_ARGV'] = argv
        attest('profile_mapping_complete', ['three fresh locked profiles','A1/0.4 PLA single slot','fixed 1/0/0 Auto For Flush template','auxiliary empty by policy'])
        _, engine = read(spec.engine_path, policy['route']['engine_sha256'])
        attest('engine_declaration_bound', ['accepted executable SHA matched','exact declared version '+raw['cli']['version']])
        backend = []
        for item in policy['backend']['entries']:
            _, observed = read(Path(backend_dir) / item['logical_name'], item['sha256'])
            require(observed['size'] == item['size'], 'BACKEND_SIZE_MISMATCH', item['logical_name'])
            backend.append({k: observed[k] if k in ('sha256','size') else item[k] for k in ('logical_name','sha256','size','role')})
        require(policy['backend']['custom_execution_dependencies'] == [], 'UNSUPPORTED_BACKEND_DEPENDENCY', '/backend')
        attest('backend_coverage_complete', ['three merged-main source pins fresh matched','policy-reviewed imports/calls; no custom execution dependency'])
        resources = []
        for item in policy['request_resources']['selected']:
            _, observed = read(item['path'], item['sha256'])
            resources.append({'logical_name':item['logical_name'],'sha256':observed['sha256'],'size':observed['size'],'role':item['role']})
        # Keep physical bindings for inputs/profiles/data/output and cwd. Typed
        # content role identities live in the bound inputs/profiles sections. Each
        # resolved argv element maps to exactly one token; no added pseudo-argv.
        typed = []
        for i, (template, value) in enumerate(zip(raw['cli']['argv'], argv)):
            if i == 0: typed.append({'kind':'engine'})
            elif template.startswith('--'): typed.append({'kind':'option','value':value})
            elif '{' in template: typed.append({'kind':'opaque_path','value':value})
            elif template in ('0','1','2'): typed.append({'kind':'decimal','value':template})
            else: typed.append({'kind':'literal','value':value})
        # Output classification is never guessed; current frozen policy retains
        # both destinations as opaque paths. There is no output-only whitelist.
        require(policy['output_rule']['classification'] == 'opaque_path' and policy['output_rule']['output_only_destination'] is False,
                'UNSUPPORTED_OUTPUT_RULE', '/policy/output_rule')
        require(resolve_cwd(spec).is_dir(), 'MISSING_CWD', '/cli/cwd')
        attest('execution_classification_complete', ['exact template/resolved argv matched','all semantic values/order retained','all opaque paths/cwd retained','empty explicit env whitelist','no output neutrality asserted'])
        for p, original in reads:
            _, item = stable_read(p)
            require(item['sha256'] == original['sha256'] and item['before'] == original['before'], 'CHANGED_FILE', str(p))
        attest('request_bytes_bound', ['input/profile/engine/backend/resource fresh stable reads','all file bytes reverified after loader/parser/argv binding'])
        require(policy['request_resources']['coverage_status'] == 'COMPLETE', policy['request_resources']['blocker'], '/request_resources')
        attest('selected_request_resource_coverage_complete', ['reviewed finite selected set complete','each selected role policy bound and fresh hash matched'])
        transform = {'state':'present','value':{k:[canonical_decimal(x) for x in v] for k,v in raw['mesh']['intended_transform'].items()}}
        input_item = identities[str(spec.inputs[0])]
        profiles = {k:{'sha256':identities[str(spec.profiles[k])]['sha256'],'format':'json'} for k in ('printer','process')}
        profiles.update(filaments=[{'sha256':identities[str(spec.profiles['filament'])]['sha256'],'format':'json'}],auxiliary=[],nozzle='0.4',filament_mapping=['1'],volume_mapping=['0'],nozzle_mapping=['0'],material_mapping=['PLA'],map_mode='Auto For Flush')
        descriptor = {'descriptor_schema_version':'0.2','request_attestations':{k:evidence[k]['value'] for k in sorted(ATTESTATIONS)},
          'request_identity':{'domain':'SLICE_KEY/v0.2','key_schema_version':'0.2','operation':'FULL_SLICE',
            'contracts':{'console_schema':'0.1','runner_version':'0.2.0','job_schema':'0.2','policies':{k:{'version':policy['policy_version'],'sha256':policy_sha} for k in ('extraction','argv','semantic_env','request_resource','paths','backend')}},
            'backend_bundle':{'schema_version':'0.2','entries':backend,'custom_execution_dependencies':[]},
            'inputs':[{'slot':'0','format':'stl','input_mode':'mesh_import','sha256':input_item['sha256'],'role':policy['input_semantics']['role'],'placement':{'state':'embedded'},'intended_transform':transform,'semantics':semantics}],
            'profiles':profiles,'engine':{'version':raw['cli']['version'],'executable_sha256':engine['sha256']},
            'selected_request_resources':{'schema_version':'0.2','entries':resources,'selection':{'policy_sha256':policy_sha,'role':'selected_toolpath_request_configuration','evidence_pointer':policy['policy_id']}},
            'execution':{'argv':typed,'cwd':{'kind':'opaque_path','value':str(resolve_cwd(spec))},'semantic_env_overrides':[],'transport':{'state':'present','value':{'identity_sha256':hashlib.sha256(b'Windows no_window redirected stdout/stderr; stdin DEVNULL').hexdigest(),'description':'Windows no_window redirected stdout/stderr; stdin DEVNULL'}}}},
          'provenance':{'request_id':spec.job_id,'gui_display_name':spec.candidate}}
        require(all(evidence[k]['value'] for k in ATTESTATIONS), 'ATTESTATION_INCOMPLETE', '/attestations')
        result.update(ADAPTER_STATUS='COMPLETE', DESCRIPTOR=descriptor)
        generated = generate_request_key_v0_2(result['DESCRIPTOR'])
        require(generated['REQUEST_STATUS'] == 'COMPLETE', 'GENERATOR_REJECTED_DESCRIPTOR', '/descriptor')
        result.update(GENERATOR_RESULT=generated, SLICE_KEY=generated['SLICE_KEY'],
                      CANONICAL_REQUEST_SHA256=hashlib.sha256(generated['CANONICAL_REQUEST_BYTES']).hexdigest(),
                      CANONICAL_REQUEST_DIGESTS=generated['CANONICAL_REQUEST_DIGESTS'])
    except AdapterHold as exc:
        result['blockers'].append({'code':exc.code,'pointer':exc.pointer})
    except (OSError, ValueError, TypeError, KeyError, ArithmeticError) as exc:
        result['blockers'].append({'code':'INVALID_OR_UNSTABLE_REQUEST','pointer':'/','detail':str(exc)})
    if result['blockers']:
        result.update(ADAPTER_STATUS='HOLD', DESCRIPTOR=None, GENERATOR_RESULT=None, SLICE_KEY=None, CANONICAL_REQUEST_SHA256=None, CANONICAL_REQUEST_DIGESTS=None)
    return result

def build_windows_a1_request(job_path, *, backend_dir, run_dir):
    """Pinned production policy only; caller must name exact execution source and destination.

    Reads files but never launches engine. Current policy returns precise resource
    coverage HOLD; only adapter COMPLETE calls the v0.2 generator.
    """
    try:
        data, _ = stable_read(POLICY_PATH)
        require(hashlib.sha256(data).hexdigest() == POLICY_SHA256, 'POLICY_IDENTITY_MISMATCH', '/policy')
        policy = json.loads(data)
    except (OSError, ValueError) as exc:
        return {'ADAPTER_STATUS':'HOLD','COVERAGE_POLICY_VERSION':'0.1','COVERAGE_POLICY_SHA256':POLICY_SHA256,
                'DESCRIPTOR':None,'ATTESTATION_EVIDENCE':{k:{'value':False,'checks':[]} for k in sorted(ATTESTATIONS)},
                'blockers':[{'code':'POLICY_IDENTITY_MISMATCH','pointer':'/policy','detail':str(exc)}],
                'FRESH_IDENTITIES':[],'RESOLVED_ARGV':None,'GENERATOR_RESULT':None,'SLICE_KEY':None,'CANONICAL_REQUEST_SHA256':None,'CANONICAL_REQUEST_DIGESTS':None,'ENGINE_STARTED':False}
    return _adapt(job_path, backend_dir, run_dir, policy, POLICY_SHA256, 'Windows' if os.name == 'nt' else os.name)
