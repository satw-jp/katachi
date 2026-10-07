"""Preverified synthetic B vectors; comparator I/O/process/discovery forbidden."""
import copy
from contextlib import ExitStack
import hashlib
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from execution_env_v01 import compare_execution_env_v0_1 as _compare
from slice_key_v02 import generate_request_key_v0_2
FIXTURES = ROOT/'tests/fixtures/execution_env_v01'
IO_COUNTS = {target:0 for target in ('subprocess.Popen', 'subprocess.run', 'builtins.open',
                                   'io.open', 'os.walk', 'os.scandir', 'os.listdir', 'os.stat', 'os.lstat')}


def pure_call(function, *args):
    # Guard only the call, so unittest can format an assertion failure normally.
    with ExitStack() as stack:
        guards={target:stack.enter_context(patch(target,side_effect=AssertionError(target))) for target in IO_COUNTS}
        try:
            return function(*args)
        finally:
            for target,guard in guards.items():
                IO_COUNTS[target]+=guard.call_count


def compare_execution_env_v0_1(*args):
    return pure_call(_compare,*args)


class ExecutionEnvironmentV01Tests(unittest.TestCase):
    def setUp(self):
        # Explicit fixture loads precede the pure-call guards; no host collection.
        self.policy_raw = (ROOT/'policies/EXECUTION_ENV_COMPATIBILITY_POLICY_V0_1.json').read_bytes()
        self.policy = json.loads(self.policy_raw)
        self.prior = json.loads((FIXTURES/'base.fingerprint.json').read_bytes())
        self.current = copy.deepcopy(self.prior)
        self.golden = json.loads((FIXTURES/'base.expected.json').read_bytes())
        self.directional_raw = (FIXTURES/'synthetic_directional.policy.json').read_bytes()
        evidence = ROOT.parents[1]/'docs/evidence/SLICE_CONSOLE_R01_A1_ELEVATED_TRACE_2026-10-05'
        self.a_descriptor = json.loads((evidence/'CORRECTED_DESCRIPTOR.json').read_bytes())
        self.a_key = json.loads((evidence/'CORRECTED_PRODUCTION_REQUEST_KEY.json').read_bytes())
        self.a_policy_sha = hashlib.sha256((ROOT/'policies/WINDOWS_A1_04_REQUEST_IDENTITY_POLICY_V0_2.json').read_bytes()).hexdigest()

    def tearDown(self):
        self.assertTrue(all(count==0 for count in IO_COUNTS.values()),IO_COUNTS)

    def compare(self, cls, policy=None):
        result = compare_execution_env_v0_1(self.prior, self.current, self.policy_raw if policy is None else policy)
        self.assertEqual(result['status'], 'COMPLETE', result['blockers'])
        self.assertEqual(result['comparison_class'], cls, result)
        self.assertFalse(result['reuse_authorized'])
        return result

    def hold(self, code, policy=None, prior=None):
        result = compare_execution_env_v0_1(self.prior if prior is None else prior, self.current, self.policy_raw if policy is None else policy)
        self.assertEqual(result['status'], 'HOLD')
        self.assertIsNone(result['comparison_class'])
        self.assertIn(code, [x['code'] for x in result['blockers']])
        self.assertFalse(result['reuse_authorized'])
        return result

    def bind(self, raw):
        policy = json.loads(raw) if isinstance(raw, (bytes,str)) else raw
        data = raw if isinstance(raw,bytes) else raw.encode() if isinstance(raw,str) else json.dumps(raw,sort_keys=True,separators=(',',':')).encode()
        for fp in (self.prior,self.current):
            fp['policy']={'domain':policy['domain'],'policy_id':policy['policy_id'],
                          'version':policy['policy_version'],'sha256':hashlib.sha256(data).hexdigest()}

    def change(self, name, value): self.current['observations'][name]['value']=value

    def test_exact_independent_golden(self):
        result=self.compare('EXACT_WITHIN_POLICY')
        self.assertEqual(result['prior_fingerprint_digest'],self.golden['fingerprint_semantic_sha256'])
        self.assertEqual(result['current_fingerprint_digest'],self.golden['fingerprint_semantic_sha256'])
        self.assertEqual(result['policy_identity']['sha256'],self.golden['policy_sha256'])
        self.assertEqual(result['differences'],[])

    def test_explicit_direction_A_to_B_compatible(self):
        self.bind(self.directional_raw)
        self.change('vc_runtime_candidate',json.loads(self.directional_raw)['directional_rules'][0]['to'])
        result=self.compare('COMPATIBLE_WITHIN_POLICY',self.directional_raw)
        self.assertEqual(result['rule_applications'],[{'rule_id':'SYNTHETIC_A_TO_B','observation':'vc_runtime_candidate','direction':'prior_to_current','allowed':True}])

    def test_reverse_not_inferred(self):
        self.bind(self.directional_raw)
        self.prior['observations']['vc_runtime_candidate']['value']['sha256']='b'*64
        self.compare('UNVERIFIED_ENV',self.directional_raw)

    def test_transitive_A_to_C_not_inferred(self):
        self.bind(self.directional_raw)
        self.change('vc_runtime_candidate',json.loads(self.directional_raw)['directional_rules'][1]['to'])
        self.compare('UNVERIFIED_ENV',self.directional_raw)

    def test_explicit_B_to_C_compatible(self):
        self.bind(self.directional_raw)
        rules=json.loads(self.directional_raw)['directional_rules']
        self.prior['observations']['vc_runtime_candidate']['value']=rules[1]['from']
        self.change('vc_runtime_candidate',rules[1]['to'])
        self.compare('COMPATIBLE_WITHIN_POLICY',self.directional_raw)

    def test_architecture_hard_deny(self):
        self.change('architecture','arm64');self.compare('INCOMPATIBLE_ENV')

    def test_platform_hard_deny(self):
        self.change('os_family','Linux');self.compare('INCOMPATIBLE_ENV')

    def test_companion_hard_deny(self):
        self.change('engine_companion',{'sha256':'b'*64});self.compare('INCOMPATIBLE_ENV')

    def test_explicit_allow_cannot_override_hard_deny(self):
        self.change('engine_companion',{'sha256':'b'*64})
        self.policy['directional_rules']=[{'rule_id':'invalid-authority-to-override','observation':'engine_companion','from':self.prior['observations']['engine_companion']['value'],'to':self.current['observations']['engine_companion']['value'],'allowed':True}]
        self.bind(self.policy);self.compare('INCOMPATIBLE_ENV',self.policy)

    def test_hard_deny_precedes_required_gap(self):
        self.change('architecture','arm64');self.current['observations'].pop('api_set_schema')
        result=self.compare('INCOMPATIBLE_ENV')
        self.assertEqual(result['blockers'][0]['code'],'KNOWN_HARD_DENY')

    def test_malformed_precedes_hard_deny(self):
        self.change('architecture','arm64');self.current['unexpected']='field'
        self.hold('INVALID_FIELDS')

    def test_gap_precedes_explicit_allowed_difference(self):
        self.bind(self.directional_raw)
        self.change('vc_runtime_candidate',json.loads(self.directional_raw)['directional_rules'][0]['to'])
        self.current['observations']['python']['state']='STALE'
        self.compare('UNVERIFIED_ENV',self.directional_raw)

    def test_missing_required_field(self):
        self.current['observations'].pop('python');self.compare('UNVERIFIED_ENV')

    def test_missing_state_is_not_equal(self):
        for fp in (self.prior,self.current):fp['observations']['api_set_schema']={'state':'MISSING','value':None}
        result=self.compare('UNVERIFIED_ENV')
        self.assertEqual(result['prior_fingerprint_digest'],result['current_fingerprint_digest'])

    def test_stale(self):
        self.current['observations']['os_build']['state']='STALE';self.compare('UNVERIFIED_ENV')

    def test_untrusted(self):
        self.current['observations']['python']['state']='UNTRUSTED';self.compare('UNVERIFIED_ENV')

    def test_unknown_state(self):
        self.current['observations']['ucrt_candidate']['state']='UNKNOWN';self.compare('UNVERIFIED_ENV')

    def test_known_null_values_are_not_equal(self):
        for fp in (self.prior,self.current):fp['observations']['api_set_schema']['value']['sha256']=None
        result=self.compare('UNVERIFIED_ENV')
        self.assertEqual(result['prior_fingerprint_digest'],result['current_fingerprint_digest'])

    def test_unknown_declared_value(self):
        self.change('os_build','unknown');self.compare('UNVERIFIED_ENV')

    def test_policy_identity_mismatch(self):
        self.current['policy']['sha256']='b'*64;self.compare('UNVERIFIED_ENV')

    def test_policy_revoked(self):
        self.policy['status']='REVOKED';self.bind(self.policy);self.compare('UNVERIFIED_ENV',self.policy)

    def test_coverage_mismatch(self):
        self.current['coverage']['scope_id']='different-scope';self.compare('UNVERIFIED_ENV')

    def test_python_upgrade_has_no_default_rule(self):
        self.current['observations']['python']['value']['version']='synthetic-3.13';self.compare('UNVERIFIED_ENV')

    def test_os_upgrade_has_no_default_rule(self):
        self.change('os_build','synthetic-build-B');self.compare('UNVERIFIED_ENV')

    def test_crt_upgrade_has_no_default_rule(self):
        self.current['observations']['vc_runtime_candidate']['value']['sha256']='b'*64;self.compare('UNVERIFIED_ENV')

    def test_unset_and_empty_are_different(self):
        self.current['observations']['inherited_environment']['value']['entries'][0]['state']='empty'
        self.compare('UNVERIFIED_ENV')

    def test_present_env_unknown_identity(self):
        self.current['observations']['inherited_environment']['value']['entries'][2]['value_identity']=None
        self.compare('UNVERIFIED_ENV')

    def test_unknown_env_classification(self):
        self.current['observations']['inherited_environment']['value']['entries'][0]['classification']='unclassified'
        self.compare('UNVERIFIED_ENV')

    def test_env_scope_gap(self):
        self.current['observations']['inherited_environment']['value']['entries'].pop();self.compare('UNVERIFIED_ENV')

    def test_native_manifest_scope_gap(self):
        self.current['observations']['native_runtime_manifest']['value']['entries'].pop();self.compare('UNVERIFIED_ENV')

    def test_native_unknown_role(self):
        self.current['observations']['native_runtime_manifest']['value']['entries'][0]['role']='other'
        self.compare('UNVERIFIED_ENV')

    def test_provenance_independence(self):
        self.current['provenance']={'pid':999,'collected_at':'2099-01-01T00:00:00Z','hostname':'synthetic-host-B',
          'collector_run_id':'synthetic-run-B','file_path':'synthetic-path-B','evidence_pointer':'synthetic-evidence-B',
          'trace_sha256':'b'*64,'human_note':'Different NON-KEY diagnostic note'}
        result=self.compare('EXACT_WITHIN_POLICY')
        self.assertEqual(result['prior_fingerprint_digest'],result['current_fingerprint_digest'])

    def test_duplicate_json_fields_rejected(self):
        raw=json.dumps(self.prior).replace('"schema_version": "0.1"','"schema_version": "0.1", "schema_version": "0.1"')
        self.hold('DUPLICATE_FIELD',prior=raw)

    def test_duplicate_manifest_logical_names_rejected(self):
        entries=self.current['observations']['native_runtime_manifest']['value']['entries'];entries.append(copy.deepcopy(entries[0]))
        self.hold('DUPLICATE_ENTRY')

    def test_unknown_observation_field_rejected(self):
        self.current['observations']['loaded_module_graph']={'state':'KNOWN','value':[]};self.hold('INVALID_FIELDS')

    def test_malformed_numeric_and_string_states(self):
        for state in (True,0,1.0,'known',None,[],{}):
            with self.subTest(state=state):
                self.current['observations']['python']['state']=state;self.hold('INVALID_OBSERVATION_STATE')

    def test_size_bool_float_negative_string_rejected(self):
        for size in (True,1.0,-1,'123'):
            with self.subTest(size=size):
                self.current['observations']['native_runtime_manifest']['value']['entries'][0]['size']=size
                self.hold('INVALID_SIZE')

    def test_raw_env_value_rejected_without_echo(self):
        entry=self.current['observations']['inherited_environment']['value']['entries'][0]
        entry['raw_value']='NEVER-ECHO-SECRET'
        result=self.hold('INVALID_FIELDS');self.assertNotIn('NEVER-ECHO-SECRET',json.dumps(result))

    def test_unsupported_namespace(self):
        self.current['domain']='EXECUTION_ENV_FINGERPRINT/v9';self.hold('UNSUPPORTED_FINGERPRINT')

    def test_policy_provenance_cannot_enter_semantic_sha(self):
        self.policy['collected_at']='2099-01-01';self.hold('INVALID_FIELDS',policy=self.policy)

    def test_unknown_policy_rule_field_rejected(self):
        policy=json.loads(self.directional_raw);policy['directional_rules'][0]['evidence_pointer']='NON-KEY'
        self.hold('INVALID_FIELDS',policy=policy)

    def test_duplicate_direction_rules_rejected(self):
        policy=json.loads(self.directional_raw);policy['directional_rules'].append(copy.deepcopy(policy['directional_rules'][0]))
        self.hold('DUPLICATE_OR_EMPTY_RULE',policy=policy)

    def test_unknown_rule_value_rejected(self):
        policy=json.loads(self.directional_raw);policy['directional_rules'][0]['from']=None
        self.hold('UNKNOWN_RULE_VALUE',policy=policy)

    def test_explicit_directional_deny_precedes_gap(self):
        policy=json.loads(self.directional_raw);policy['directional_rules'][0]['allowed']=False;self.bind(policy)
        self.change('vc_runtime_candidate',policy['directional_rules'][0]['to'])
        self.current['observations']['api_set_schema']['state']='STALE'
        result=self.compare('INCOMPATIBLE_ENV',policy)
        self.assertFalse(result['rule_applications'][0]['allowed'])

    def test_inputs_not_mutated_and_result_repeatable(self):
        self.bind(self.policy)
        original=copy.deepcopy((self.prior,self.current,self.policy))
        first=self.compare('EXACT_WITHIN_POLICY',self.policy);second=self.compare('EXACT_WITHIN_POLICY',self.policy)
        self.assertEqual(first,second);self.assertEqual((self.prior,self.current,self.policy),original)

    def test_manifest_env_and_coverage_list_order_not_identity(self):
        self.current['observations']['native_runtime_manifest']['value']['entries'].reverse()
        self.current['observations']['inherited_environment']['value']['entries'].reverse()
        for key in ('required_observations','native_runtime_names','inherited_env_names'):self.current['coverage'][key].reverse()
        result=self.compare('EXACT_WITHIN_POLICY')
        self.assertEqual(result['prior_fingerprint_digest'],result['current_fingerprint_digest'])

    def test_policy_exact_raw_bytes_identity(self):
        padded=b' '+self.policy_raw
        result=self.compare('UNVERIFIED_ENV',padded)
        self.assertEqual(result['policy_identity']['sha256'],hashlib.sha256(padded).hexdigest())

    def test_json_and_dict_fingerprint_semantics_match(self):
        result=compare_execution_env_v0_1(json.dumps(self.prior).encode(),json.dumps(self.current),self.policy_raw)
        self.assertEqual(result,self.compare('EXACT_WITHIN_POLICY'))

    def test_corrected_production_A_regression_pin(self):
        pin='SLICE_KEY/v0.2:sha256:2a930b89ef411450fa625275a8db40fef3b796a5961b704d1100232a2b9d988c'
        self.assertEqual(self.a_key['SLICE_KEY'],pin)
        self.assertEqual(self.a_policy_sha,'60701d2dce4352f0c76c10a27d7b7a1f636777b34b8cd2335f4b261c37f81664')
        self.assertEqual(pure_call(generate_request_key_v0_2,self.a_descriptor)['SLICE_KEY'],pin)


if __name__ == '__main__':
    unittest.main()
