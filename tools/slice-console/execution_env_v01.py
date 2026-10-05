"""Pure finite B comparison. Caller-preverified descriptors only; no I/O/discovery.

KNOWN is a caller assertion of fresh/trusted observations, not a runtime proof.
Candidate runtime identities are never claims about loaded modules. No A/cache/REUSE
imports. Policy raw JSON bytes are hashed exactly; dict policies use canonical JSON.
"""
import copy
import hashlib
import json
import re

DOMAIN = 'EXECUTION_ENV_FINGERPRINT/v0.1'
POLICY_DOMAIN = 'EXECUTION_ENV_COMPATIBILITY_POLICY/v0.1'
OBSERVATIONS = ('os_family', 'os_build', 'architecture', 'engine_companion',
                'native_runtime_manifest', 'api_set_schema', 'vc_runtime_candidate',
                'ucrt_candidate', 'python', 'inherited_environment')
HARD_DENY = {'os_family', 'architecture', 'engine_companion'}
STATES = {'KNOWN', 'MISSING', 'STALE', 'UNTRUSTED', 'UNKNOWN'}
PROVENANCE = {'collected_at', 'hostname', 'collector_run_id', 'file_path',
              'evidence_pointer', 'pid', 'trace_sha256', 'human_note'}
_SHA = re.compile(r'[0-9a-f]{64}\Z')


class InvalidEnvironment(ValueError):
    def __init__(self, code, pointer):
        self.code, self.pointer = code, pointer


def _require(ok, code, pointer):
    if not ok:
        raise InvalidEnvironment(code, pointer)


def _object(value, fields, pointer, optional=()):
    _require(type(value) is dict and set(fields) <= set(value)
             and not set(value) - set(fields) - set(optional), 'INVALID_FIELDS', pointer)


def _text(value, pointer, nullable=False):
    if value is None and nullable:
        return
    _require(type(value) is str and bool(value) and
             not any(0xD800 <= ord(c) <= 0xDFFF for c in value), 'INVALID_STRING', pointer)


def _sha(value, pointer, nullable=False):
    if value is None and nullable:
        return
    _require(type(value) is str and _SHA.fullmatch(value) is not None, 'INVALID_SHA256', pointer)


def _names(value, pointer):
    _require(type(value) is list, 'INVALID_LIST', pointer)
    for name in value:
        _text(name, pointer)
    _require(len(set(value)) == len(value), 'DUPLICATE_ENTRY', pointer)


def _pairs(items):
    value = {}
    for key, item in items:
        _require(key not in value, 'DUPLICATE_FIELD', '/')
        value[key] = item
    return value


def _constant(_):
    raise InvalidEnvironment('INVALID_NUMBER', '/')


def _parse(value):
    if type(value) is dict:
        return copy.deepcopy(value)
    _require(type(value) in (bytes, str), 'INVALID_DOCUMENT', '/')
    try:
        return json.loads(value, object_pairs_hook=_pairs, parse_constant=_constant)
    except InvalidEnvironment:
        raise
    except (UnicodeError, ValueError) as exc:
        raise InvalidEnvironment('INVALID_JSON', '/') from exc


def _canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(',', ':'), allow_nan=False).encode('utf-8')


def _coverage(value, pointer):
    _object(value, ('scope_id', 'required_observations', 'native_runtime_names',
                    'inherited_env_names', 'verification_mode'), pointer)
    _text(value['scope_id'], pointer + '/scope_id')
    for key in ('required_observations', 'native_runtime_names', 'inherited_env_names'):
        _names(value[key], pointer + '/' + key)
        value[key].sort()
    _require(not set(value['required_observations']) - set(OBSERVATIONS),
             'UNSUPPORTED_OBSERVATION', pointer)
    _require(value['verification_mode'] == 'CALLER_PREVERIFIED_OBSERVED_CANDIDATES',
             'UNSUPPORTED_VERIFICATION_MODE', pointer)


def _identity_value(name, value, pointer):
    # Null is an explicit unknown value; equality of unknowns never permits reuse.
    if value is None:
        return
    if name in ('os_family', 'os_build', 'architecture'):
        _text(value, pointer)
    elif name in ('engine_companion', 'api_set_schema'):
        _object(value, ('sha256',), pointer)
        _sha(value['sha256'], pointer + '/sha256', True)
    elif name in ('vc_runtime_candidate', 'ucrt_candidate'):
        _object(value, ('identity_kind', 'sha256'), pointer)
        _require(value['identity_kind'] == 'OBSERVED_CANDIDATE_FINGERPRINT',
                 'UNSUPPORTED_RUNTIME_IDENTITY', pointer)
        _sha(value['sha256'], pointer + '/sha256', True)
    elif name == 'native_runtime_manifest':
        _object(value, ('identity_kind', 'entries'), pointer)
        _require(value['identity_kind'] == 'OBSERVED_CANDIDATES_NOT_LOADED',
                 'UNSUPPORTED_RUNTIME_IDENTITY', pointer)
        _require(type(value['entries']) is list, 'INVALID_LIST', pointer)
        names = []
        for item in value['entries']:
            _object(item, ('logical_name', 'sha256', 'size', 'role'), pointer)
            _text(item['logical_name'], pointer + '/logical_name')
            _text(item['role'], pointer + '/role')
            _sha(item['sha256'], pointer + '/sha256', True)
            _require(type(item['size']) is int and item['size'] >= 0,
                     'INVALID_SIZE', pointer + '/size')
            names.append(item['logical_name'])
        _require(len(set(names)) == len(names), 'DUPLICATE_ENTRY', pointer)
        value['entries'].sort(key=lambda x: x['logical_name'])
    elif name == 'python':
        _object(value, ('executable_sha256', 'version', 'implementation', 'distribution'), pointer)
        _sha(value['executable_sha256'], pointer + '/executable_sha256', True)
        for field in ('version', 'implementation'):
            _text(value[field], pointer + '/' + field, True)
        dist = value['distribution']
        _object(dist, ('fingerprint_sha256', 'policy_id', 'policy_version', 'policy_sha256'), pointer + '/distribution')
        for field in ('fingerprint_sha256', 'policy_sha256'):
            _sha(dist[field], pointer + '/distribution/' + field, True)
        for field in ('policy_id', 'policy_version'):
            _text(dist[field], pointer + '/distribution/' + field, True)
    elif name == 'inherited_environment':
        _object(value, ('policy_version', 'entries'), pointer)
        _text(value['policy_version'], pointer + '/policy_version')
        _require(type(value['entries']) is list, 'INVALID_LIST', pointer)
        names = []
        for item in value['entries']:
            _object(item, ('name', 'state', 'value_identity', 'classification'), pointer)
            _text(item['name'], pointer + '/name')
            _require(type(item['state']) is str and item['state'] in ('unset', 'empty', 'present'),
                     'INVALID_ENV_STATE', pointer)
            _text(item['classification'], pointer + '/classification')
            if item['state'] == 'present':
                _sha(item['value_identity'], pointer + '/value_identity', True)
            else:
                _require(item['value_identity'] is None, 'INVALID_ENV_IDENTITY', pointer)
            names.append(item['name'])
        _require(len(set(names)) == len(names), 'DUPLICATE_ENTRY', pointer)
        value['entries'].sort(key=lambda x: x['name'])


def _unknown(value):
    if value is None:
        return True
    if type(value) is str:
        return value.casefold() in ('unknown', 'unclassified')
    if type(value) is dict:
        return any(_unknown(item) for item in value.values())
    if type(value) is list:
        return any(_unknown(item) for item in value)
    return False


def _policy(document):
    value = _parse(document)
    _object(value, ('schema_version', 'domain', 'policy_id', 'policy_version', 'status',
                    'coverage', 'hard_deny_observations', 'environment_policy', 'directional_rules'), '/policy')
    _require(value['schema_version'] == '0.1' and value['domain'] == POLICY_DOMAIN
             and value['policy_version'] == '0.1', 'UNSUPPORTED_POLICY', '/policy')
    _text(value['policy_id'], '/policy/policy_id')
    _require(type(value['status']) is str and value['status'] in ('ACTIVE', 'REVOKED'),
             'INVALID_POLICY_STATUS', '/policy/status')
    _coverage(value['coverage'], '/policy/coverage')
    _require(set(value['coverage']['required_observations']) == set(OBSERVATIONS),
             'UNSUPPORTED_POLICY_COVERAGE', '/policy/coverage')
    _names(value['hard_deny_observations'], '/policy/hard_deny_observations')
    _require(HARD_DENY <= set(value['hard_deny_observations']) <= set(OBSERVATIONS),
             'INVALID_HARD_DENY', '/policy/hard_deny_observations')
    env = value['environment_policy']
    _object(env, ('version', 'classification'), '/policy/environment_policy')
    _require(env == {'version':'0.1', 'classification':'HASHED_NONSECRET'},
             'UNSUPPORTED_ENV_POLICY', '/policy/environment_policy')
    _require(type(value['directional_rules']) is list, 'INVALID_LIST', '/policy/directional_rules')
    ids = set(); edges = set()
    for rule in value['directional_rules']:
        _object(rule, ('rule_id', 'observation', 'from', 'to', 'allowed'), '/policy/directional_rules')
        _text(rule['rule_id'], '/policy/directional_rules/rule_id')
        _require(type(rule['observation']) is str and rule['observation'] in OBSERVATIONS
                 and type(rule['allowed']) is bool, 'INVALID_RULE', '/policy/directional_rules')
        for side in ('from', 'to'):
            _identity_value(rule['observation'], rule[side], '/policy/directional_rules/' + side)
            _require(not _has_gap_value(rule['observation'], rule[side], value), 'UNKNOWN_RULE_VALUE', '/policy/directional_rules/' + side)
        edge = (rule['observation'], _canonical(rule['from']), _canonical(rule['to']))
        _require(rule['rule_id'] not in ids and edge not in edges and rule['from'] != rule['to'],
                 'DUPLICATE_OR_EMPTY_RULE', '/policy/directional_rules')
        ids.add(rule['rule_id']); edges.add(edge)
    # The exact supplied bytes (before normalization) define policy identity.
    raw = document if type(document) is bytes else document.encode('utf-8') if type(document) is str else _canonical(document)
    identity = {'domain':POLICY_DOMAIN, 'policy_id':value['policy_id'],
                'version':value['policy_version'], 'sha256':hashlib.sha256(raw).hexdigest()}
    return value, identity


def _fingerprint(document, pointer):
    value = _parse(document)
    _object(value, ('schema_version', 'domain', 'policy', 'coverage', 'observations', 'provenance'), pointer)
    _require(value['schema_version'] == '0.1' and value['domain'] == DOMAIN,
             'UNSUPPORTED_FINGERPRINT', pointer)
    _object(value['policy'], ('domain', 'policy_id', 'version', 'sha256'), pointer + '/policy')
    _require(value['policy']['domain'] == POLICY_DOMAIN, 'UNSUPPORTED_POLICY', pointer + '/policy')
    for field in ('policy_id', 'version'):
        _text(value['policy'][field], pointer + '/policy/' + field)
    _sha(value['policy']['sha256'], pointer + '/policy/sha256')
    _coverage(value['coverage'], pointer + '/coverage')
    _object(value['observations'], (), pointer + '/observations', OBSERVATIONS)
    for name, observation in value['observations'].items():
        p = pointer + '/observations/' + name
        _object(observation, ('state', 'value'), p)
        _require(type(observation['state']) is str and observation['state'] in STATES,
                 'INVALID_OBSERVATION_STATE', p + '/state')
        _identity_value(name, observation['value'], p + '/value')
    _object(value['provenance'], (), pointer + '/provenance', PROVENANCE)
    for name, item in value['provenance'].items():
        if name == 'pid':
            _require(type(item) is int and item >= 0, 'INVALID_PID', pointer + '/provenance/pid')
        elif name == 'trace_sha256':
            _sha(item, pointer + '/provenance/' + name)
        else:
            _text(item, pointer + '/provenance/' + name)
    semantic = {k:v for k,v in value.items() if k != 'provenance'}
    return value, hashlib.sha256(_canonical(semantic)).hexdigest()


def _has_gap_value(name, value, policy):
    if name == 'inherited_environment' and value is not None:
        # Null identity is valid for explicit unset/empty states, never for present.
        return (value['policy_version'] != policy['environment_policy']['version'] or
                {x['name'] for x in value['entries']} != set(policy['coverage']['inherited_env_names']) or
                any(x['classification'] != policy['environment_policy']['classification'] or
                    (x['state'] == 'present' and x['value_identity'] is None) for x in value['entries']))
    if _unknown(value):
        return True
    if name == 'native_runtime_manifest':
        return ({x['logical_name'] for x in value['entries']} != set(policy['coverage']['native_runtime_names']) or
                any(x['role'] != 'runtime_candidate' for x in value['entries']))
    return False


def compare_execution_env_v0_1(prior_fingerprint, current_fingerprint, compatibility_policy):
    """Return HOLD on malformed/unsupported input; otherwise a finite B class.

    No wall-clock freshness check: KNOWN must already mean fresh and trusted.
    No reverse/transitive rule inference. No returned class authorizes REUSE.
    """
    result = {'schema_version':'0.1', 'domain':'EXECUTION_ENV_COMPARISON/v0.1',
              'status':'HOLD', 'comparison_class':None, 'policy_identity':None,
              'prior_fingerprint_digest':None, 'current_fingerprint_digest':None,
              'differences':[], 'blockers':[], 'rule_applications':[], 'reuse_authorized':False}
    try:
        policy, identity = _policy(compatibility_policy)
        result['policy_identity'] = identity
        prior, prior_sha = _fingerprint(prior_fingerprint, '/prior')
        current, current_sha = _fingerprint(current_fingerprint, '/current')
        result.update(prior_fingerprint_digest=prior_sha, current_fingerprint_digest=current_sha)
        gaps = []
        if policy['status'] != 'ACTIVE':
            gaps.append({'code':'POLICY_REVOKED', 'pointer':'/policy/status'})
        known = {}
        for side, fp in (('prior', prior), ('current', current)):
            if fp['policy'] != identity:
                gaps.append({'code':'POLICY_IDENTITY_MISMATCH', 'pointer':'/' + side + '/policy'})
            if fp['coverage'] != policy['coverage']:
                gaps.append({'code':'COVERAGE_MISMATCH', 'pointer':'/' + side + '/coverage'})
            known[side] = {}
            for name in policy['coverage']['required_observations']:
                p = '/' + side + '/observations/' + name
                observation = fp['observations'].get(name)
                ok = observation is not None and observation['state'] == 'KNOWN' and not _has_gap_value(name, observation['value'], policy)
                known[side][name] = ok
                if not ok:
                    code = 'MISSING' if observation is None else observation['state'] if observation['state'] != 'KNOWN' else 'UNKNOWN_OR_UNCOVERED_VALUE'
                    gaps.append({'code':code, 'pointer':p})
        denied = []; allowed = []
        for name in policy['coverage']['required_observations']:
            a = prior['observations'].get(name); b = current['observations'].get(name)
            if a == b:
                continue
            difference = {'observation':name, 'prior':a, 'current':b}
            result['differences'].append(difference)
            if not (known['prior'][name] and known['current'][name]):
                continue
            matching = [r for r in policy['directional_rules'] if r['observation'] == name and r['from'] == a['value'] and r['to'] == b['value']]
            if name in policy['hard_deny_observations'] or any(not r['allowed'] for r in matching):
                denied.append({'code':'KNOWN_HARD_DENY', 'pointer':'/observations/' + name})
                for rule in matching:
                    if not rule['allowed']:
                        result['rule_applications'].append({'rule_id':rule['rule_id'], 'observation':name, 'direction':'prior_to_current', 'allowed':False})
            elif matching:
                allowed.append(name)
                result['rule_applications'].append({'rule_id':matching[0]['rule_id'], 'observation':name, 'direction':'prior_to_current', 'allowed':True})
        if denied:
            cls = 'INCOMPATIBLE_ENV'; result['blockers'] = denied + gaps
        elif gaps:
            cls = 'UNVERIFIED_ENV'; result['blockers'] = gaps
        elif not result['differences']:
            cls = 'EXACT_WITHIN_POLICY'
        elif len(allowed) == len(result['differences']):
            cls = 'COMPATIBLE_WITHIN_POLICY'
        else:
            cls = 'UNVERIFIED_ENV'
            result['blockers'] = [{'code':'NO_DIRECTIONAL_RULE', 'pointer':'/observations/' + d['observation']} for d in result['differences'] if d['observation'] not in allowed]
        result.update(status='COMPLETE', comparison_class=cls)
    except InvalidEnvironment as exc:
        result['blockers'] = [{'code':exc.code, 'pointer':exc.pointer}]
    except (ValueError, TypeError, UnicodeError, RecursionError):
        result['blockers'] = [{'code':'INVALID_DOCUMENT', 'pointer':'/'}]
    return result
