"""Synthetic v0.2 request contract vectors; generator I/O is forbidden."""
import copy
from decimal import Decimal, localcontext
import hashlib
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from slice_key_v02 import generate_request_key_v0_2, canonical_decimal
from slice_key import generate_key
FIXTURES = Path(__file__).parent / 'fixtures' / 'slice_key_v02'

class RequestKeyV02Tests(unittest.TestCase):
    def setUp(self):
        self.goldens = {name: ((FIXTURES / (name + '.descriptor.json')).read_bytes(),
                              (FIXTURES / (name + '.canonical.json')).read_bytes(),
                              json.loads((FIXTURES / (name + '.expected.json')).read_bytes()))
                        for name in ('base', 'unicode')}
        self.old = (FIXTURES.parent / 'slice_key' / 'base.descriptor.json').read_bytes()
        self.base = json.loads(self.goldens['base'][0])
        self.guards = [self.enterContext(patch(target, side_effect=AssertionError(target))) for target in
                       ('subprocess.Popen', 'subprocess.run', 'builtins.open', 'io.open', 'os.walk', 'os.scandir', 'os.listdir')]
        self.reference = generate_request_key_v0_2(self.base)
        self.assertEqual(self.reference['REQUEST_STATUS'], 'COMPLETE', self.reference['blockers'])

    def tearDown(self):
        for guard in self.guards:
            self.assertEqual(guard.call_count, 0)

    def complete(self, value):
        result = generate_request_key_v0_2(value)
        self.assertEqual(result['REQUEST_STATUS'], 'COMPLETE', result['blockers'])
        self.assertEqual(result['REQUEST_KEY_SCHEMA_VERSION'], '0.2')
        self.assertTrue(result['SLICE_KEY'].startswith('SLICE_KEY/v0.2:sha256:'))
        return result

    def hold(self, value):
        result = generate_request_key_v0_2(value)
        self.assertEqual(result['REQUEST_STATUS'], 'INCOMPLETE')
        self.assertEqual(result['status'], 'HOLD')
        for key in ('SLICE_KEY', 'CANONICAL_REQUEST_DIGESTS', 'CANONICAL_REQUEST_TREE', 'CANONICAL_REQUEST_BYTES'):
            self.assertIsNone(result[key])
        self.assertTrue(result['blockers'])
        self.assertEqual(result['blockers'], sorted(result['blockers'], key=lambda x: (x['code'], x['pointer'])))
        return result

    def test_independent_golden_triples(self):
        for raw, canonical, expected in self.goldens.values():
            result = self.complete(raw)
            self.assertEqual(result['CANONICAL_REQUEST_BYTES'], canonical)
            self.assertEqual(hashlib.sha256(canonical).hexdigest(), expected['sha256'])
            self.assertEqual(result['SLICE_KEY'], expected['slice_key'])
            self.assertFalse(canonical.startswith(b'\xef\xbb\xbf'))
            self.assertFalse(canonical.endswith(b'\n'))
            for digest in result['CANONICAL_REQUEST_DIGESTS']:
                subtree = result['CANONICAL_REQUEST_TREE'][digest['pointer'][1:]]
                # Base contains no control characters; independent JSON oracle.
                if raw == self.goldens['base'][0]:
                    encoded = json.dumps(subtree, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
                    self.assertEqual(hashlib.sha256(encoded).hexdigest(), digest['sha256'])

    def test_namespace_isolation(self):
        self.hold(self.old)
        old_result = generate_key(self.base)
        self.assertEqual(old_result['KEY_STATUS'], 'INCOMPLETE')
        self.assertIsNone(old_result['SLICE_KEY'])
        self.assertNotEqual(generate_key(self.old)['SLICE_KEY'].split(':sha256:')[0], self.reference['SLICE_KEY'].split(':sha256:')[0])

    def test_no_mutation_or_default_dispatch(self):
        before = copy.deepcopy(self.base)
        self.complete(self.base)
        self.assertEqual(self.base, before)
        self.assertNotIn('verified', self.reference)
        self.assertNotIn('compatibility', self.reference)
        self.assertNotIn('REUSE_ELIGIBILITY', self.reference)

    def test_lossless_decimal_and_raw_json(self):
        self.base['request_identity']['profiles']['nozzle'] = Decimal('0.4000')
        self.assertEqual(self.complete(self.base)['SLICE_KEY'], self.reference['SLICE_KEY'])
        raw = self.goldens['base'][0].replace(b'"nozzle":"0.4"', b'"nozzle":0.4000')
        self.assertEqual(self.complete(raw)['SLICE_KEY'], self.reference['SLICE_KEY'])
        with localcontext() as ctx:
            ctx.prec = 2
            self.assertEqual(canonical_decimal(Decimal('123456789.012300')), '123456789.0123')
        self.assertEqual(canonical_decimal('-0.000'), '0')

    def test_duplicate_key_rejected(self):
        self.hold(self.goldens['base'][0].replace(b'"descriptor_schema_version":"0.2"', b'"descriptor_schema_version":"0.2","descriptor_schema_version":"0.2"'))

    def test_surrogate_including_nonkey_rejected(self):
        self.base['provenance']['gui_display_name'] = '\ud800'
        self.hold(self.base)

    def test_unicode_not_normalized(self):
        self.base['request_identity']['execution']['cwd']['value'] = 'C:/é'
        first = self.complete(self.base)
        self.base['request_identity']['execution']['cwd']['value'] = 'C:/e\u0301'
        self.assertNotEqual(first['SLICE_KEY'], self.complete(self.base)['SLICE_KEY'])

    def test_member_manifest_env_order_is_canonical(self):
        d = self.base
        d['request_identity']['backend_bundle']['entries'].reverse()
        d['request_identity']['execution']['semantic_env_overrides'].append({'name':'AAA', 'state':'unset', 'classification':'semantic_override'})
        first = self.complete(d)
        d['request_identity']['execution']['semantic_env_overrides'].reverse()
        d['request_identity'] = dict(reversed(list(d['request_identity'].items())))
        self.assertEqual(first['SLICE_KEY'], self.complete(d)['SLICE_KEY'])

    def test_output_physical_path_excluded_only_under_rule(self):
        self.base['provenance']['output_paths'] = ['D:/moved/output']
        self.assertEqual(self.complete(self.base)['SLICE_KEY'], self.reference['SLICE_KEY'])
        self.base['request_identity']['execution']['argv'][6].pop('neutral_rule')
        self.hold(self.base)

    def test_selected_resource_evidence_pointer_is_nonkey(self):
        self.base['request_identity']['selected_request_resources']['selection']['evidence_pointer'] = 'new/fixture-evidence'
        self.assertEqual(self.complete(self.base)['SLICE_KEY'], self.reference['SLICE_KEY'])

    def test_empty_declared_request_resource_set(self):
        d = self.base['request_identity']
        d['selected_request_resources']['entries'] = []
        d['execution']['argv'] = [x for x in d['execution']['argv'] if x['kind'] != 'resource']
        self.complete(self.base)
        d['request_attestations'] = {}  # undeclared critical field cannot sneak in
        self.hold(self.base)

# Each vector is a separately counted test. Values change only the named logical
# request dimension; ordered input slots are rebound after a single permutation.
def assign(path, value):
    def mutate(d):
        node = d
        for part in path[:-1]: node = node[part]
        node[path[-1]] = value
    return mutate

def remove(path):
    def mutate(d):
        node = d
        for part in path[:-1]: node = node[part]
        del node[path[-1]]
    return mutate

A = ['request_identity']
tag = {'state':'present', 'value':{'identity_sha256':hashlib.sha256(b'synthetic semantics').hexdigest(), 'description':'declared request'}}
different = {
 'input_byte': assign(A+['inputs',0,'sha256'], hashlib.sha256(b'synthetic geometry permanenU').hexdigest()),
 'placement': assign(A+['inputs',0,'placement','value','translation_mm',0], '1'),
 'intended_transform': assign(A+['inputs',0,'intended_transform'], {'state':'embedded'}),
 'nozzle': assign(A+['profiles','nozzle'], '0.6'),
 'material': assign(A+['profiles','material_mapping',0], 'ABS'),
 'map_mode': assign(A+['profiles','map_mode'], 'explicit'),
 'argv_value': assign(A+['execution','argv',2,'value'], '1'),
 'argv_repeat': lambda d: d['request_identity']['execution']['argv'].append({'kind':'option','value':'--orient'}),
 'engine_sha': assign(A+['engine','executable_sha256'], 'a'*64),
 'engine_version': assign(A+['engine','version'], 'synthetic-02.08.02.62'),
 'backend_sha': assign(A+['backend_bundle','entries',0,'sha256'], 'b'*64),
 'policy_sha': assign(A+['contracts','policies','extraction','sha256'], 'c'*64),
 'policy_version': assign(A+['contracts','policies','extraction','version'], 'synthetic-A/0.3'),
 'selected_resource': assign(A+['selected_request_resources','entries',0,'sha256'], hashlib.sha256(b'synthetic requested CLI limitT').hexdigest()),
 'opaque_path': assign(A+['execution','argv',-1,'value'], 'D:/synthetic/bound-path'),
 'opaque_cwd': assign(A+['execution','cwd','value'], 'D:/synthetic/request'),
 'semantic_env': assign(A+['execution','semantic_env_overrides',0,'value'], 'different'),
}
for field in ('printer','process'):
    different[field] = assign(A+['profiles',field,'sha256'], 'd'*64)
for field in ('filaments','auxiliary'):
    if field == 'filaments': different[field] = assign(A+['profiles',field,0,'sha256'], 'e'*64)
    else: different[field] = assign(A+['profiles',field], [{'format':'json','sha256':'e'*64}])
for field in ('filament_mapping','volume_mapping','nozzle_mapping'):
    different[field] = assign(A+['profiles',field,0], '2')
for field in ('assembly','modifier','enforcer','authored_support','process_fixture'):
    different[field] = assign(A+['inputs',0,'semantics',field], tag)
def input_order(d):
    d['request_identity']['inputs'].reverse()
    for i, item in enumerate(d['request_identity']['inputs']): item['slot'] = str(i)
different['input_order'] = input_order

def test_vector(mutate, expected):
    def test(self):
        mutate(self.base)
        if expected == 'hold': self.hold(self.base)
        else:
            result = self.complete(self.base)
            if expected == 'different': self.assertNotEqual(result['SLICE_KEY'], self.reference['SLICE_KEY'])
            else: self.assertEqual(result['CANONICAL_REQUEST_BYTES'], self.reference['CANONICAL_REQUEST_BYTES'])
    return test
for name, mutate in different.items():
    setattr(RequestKeyV02Tests, 'test_different_' + name, test_vector(mutate, 'different'))
for field in ('request_id','timestamp','gui_display_name','run_pointer','environment_fingerprint_pointer','deep_runtime_provenance_pointer'):
    setattr(RequestKeyV02Tests, 'test_same_' + field, test_vector(assign(['provenance',field], 'changed/metadata'), 'same'))
setattr(RequestKeyV02Tests, 'test_same_artifact_pointers', test_vector(assign(['provenance','artifact_pointers'], ['another/artifact']), 'same'))
hold_vectors = {
 'binary_float':assign(A+['profiles','nozzle'], 0.4), 'numeric_null':assign(A+['profiles','nozzle'], None),
 'numeric_bool':assign(A+['profiles','nozzle'], True), 'nan':assign(A+['profiles','nozzle'], Decimal('NaN')),
 'unknown_semantics':assign(A+['inputs',0,'semantics','modifier'], {'state':'unknown'}),
 'unclassified_argv':assign(A+['execution','argv',1], {'kind':'unclassified','value':'--mystery'}),
 'unclassified_env':assign(A+['execution','semantic_env_overrides',0,'classification'], 'unknown'),
 'engine_unknown':assign(A+['engine','version'], 'unknown'),
 'backend_coverage':remove(A+['backend_bundle','entries',2]),
 'custom_dependency':assign(A+['backend_bundle','custom_execution_dependencies'], []),
 'resource_candidate':assign(A+['selected_request_resources','selection','role'], 'candidate'),
 'resource_role':assign(A+['selected_request_resources','entries',0,'role'], 'runtime'),
 'resource_policy_binding':assign(A+['selected_request_resources','selection','policy_sha256'], 'f'*64),
 'output_rule':assign(A+['execution','argv',6,'neutral_rule','id'], 'guessed_neutral'),
 'output_alias':lambda d: d['request_identity']['execution']['argv'].append({'kind':'output','slot':'0','alias':'1','neutral_rule':copy.deepcopy(d['request_identity']['execution']['argv'][6]['neutral_rule'])}),
 'B_actual_data':assign(A+['engine','BambuStudio.dll'], 'a'*64),
 'C_actual_data':assign(A+['execution','loaded_modules'], []),
 'hidden_provenance':assign(['provenance','environment'], {'os':'unknown'}),
 'unknown_field':assign(A+['unclassified'], 'unknown'),
 'missing_cwd':remove(A+['execution','cwd']), 'bad_input_ref':assign(A+['execution','argv',7,'slot'], '999'),
 'bad_resource_ref':assign(A+['execution','argv',-2,'logical_name'], 'undeclared'),
 'surrogate_path':assign(A+['execution','cwd','value'], '\udfff'),
 'mixed_version':assign(A+['key_schema_version'], '0.1'),
 'unknown_input_role':assign(A+['inputs',0,'role'], 'unknown'),
 'unknown_input_format':assign(A+['inputs',0,'format'], 'unclassified'),
 'unknown_profile_format':assign(A+['profiles','printer','format'], 'unknown'),
 'unknown_material':assign(A+['profiles','material_mapping',0], 'unknown'),
 'unknown_map_mode':assign(A+['profiles','map_mode'], 'unknown'),
}
for field in ('inputs','profiles','engine','backend_bundle','selected_request_resources','execution','contracts'):
    hold_vectors['missing_' + field] = remove(A+[field])
for flag in ('request_bytes_bound','input_semantics_complete','profile_mapping_complete','engine_declaration_bound',
             'backend_coverage_complete','selected_request_resource_coverage_complete','execution_classification_complete'):
    hold_vectors['attestation_' + flag] = assign(['request_attestations',flag], False)
for name, mutate in hold_vectors.items():
    setattr(RequestKeyV02Tests, 'test_hold_' + name, test_vector(mutate, 'hold'))

if __name__ == '__main__': unittest.main()
