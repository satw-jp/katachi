"""Focused read-only adapter fixtures. Internal policy injection is synthetic only."""
import copy
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
import request_identity_a1 as adapter
from slice_key_v02 import generate_request_key_v0_2

class A1RequestAdapterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = self.enterContext(tempfile.TemporaryDirectory())
        self.root = Path(self.tmp)
        shutil.copytree(ROOT/'sample/clean_mesh_box', self.root/'sample')
        self.job = self.root/'sample/SLICE_JOB.json'
        self.raw = json.loads(self.job.read_bytes())
        self.engine = self.root/'synthetic-exe'
        self.engine.write_bytes(b'synthetic executable fixture only')
        self.backend = self.root/'backend'
        self.backend.mkdir()
        for name in ('job.py','runner.py','progress.py'): shutil.copyfile(ROOT/name,self.backend/name)
        self.resource = self.root/'cli_config.json'
        self.resource.write_bytes(b'synthetic selected request limits')
        self.policy = json.loads(adapter.POLICY_PATH.read_bytes())
        self.policy['route']['engine_path'] = str(self.engine)
        self.policy['route']['engine_sha256'] = hashlib.sha256(self.engine.read_bytes()).hexdigest()
        self.policy['request_resources']['coverage_status'] = 'COMPLETE'
        self.policy['request_resources']['unresolved'] = []
        self.policy['request_resources']['selected'][0]['path'] = str(self.resource)
        self.policy['request_resources']['selected'][0]['sha256'] = hashlib.sha256(self.resource.read_bytes()).hexdigest()
        self.policy['policy_id'] = 'synthetic-focused-A1-policy-only'
        self.absent = self.root/'missing-machine.json'
        self.policy['required_absence_checks'][0]['path'] = str(self.absent)
        self.policy['observed_profile_sha256'] = {role:hashlib.sha256((self.root/'sample'/('profiles/'+role+'.json')).read_bytes()).hexdigest() for role in ('printer','process','filament')}
        self.policy['observed_route_context'] = {'cwd':str(self.root), 'datadir':str(self.root/'sample/data')}
        self.raw['engine_path'] = str(self.engine)
        self.raw['cli']['cwd'] = str(self.root)
        self.run_dir = self.root/'review-output'
        self.save()
        self.generator = self.enterContext(patch('request_identity_a1.generate_request_key_v0_2', wraps=generate_request_key_v0_2))
        self.launches = self.enterContext(patch('subprocess.Popen',side_effect=AssertionError('engine forbidden')))

    def save(self): self.job.write_text(json.dumps(self.raw),encoding='utf-8')
    def run_adapter(self):
        self.save()
        data = json.dumps(self.policy,sort_keys=True,separators=(',',':')).encode()
        return adapter._adapt(self.job,self.backend,self.run_dir,self.policy,hashlib.sha256(data).hexdigest(),'Windows')
    def complete(self):
        result = self.run_adapter()
        self.assertEqual(result['ADAPTER_STATUS'],'COMPLETE',result['blockers'])
        self.assertTrue(all(v['value'] and v['checks'] for v in result['ATTESTATION_EVIDENCE'].values()))
        self.assertIsNotNone(result['DESCRIPTOR'])
        self.assertEqual(result['GENERATOR_RESULT']['REQUEST_STATUS'],'COMPLETE')
        self.assertEqual(self.generator.call_count,1)
        self.assertEqual(result['SLICE_KEY'],result['GENERATOR_RESULT']['SLICE_KEY'])
        self.assertIsNotNone(result['CANONICAL_REQUEST_SHA256'])
        return result
    def hold(self, code):
        result = self.run_adapter()
        self.assertEqual(result['ADAPTER_STATUS'],'HOLD')
        self.assertIn(code,[b['code'] for b in result['blockers']])
        self.assertIsNone(result['DESCRIPTOR'])
        self.assertIsNone(result['GENERATOR_RESULT'])
        self.assertIsNone(result['SLICE_KEY'])
        self.assertIsNone(result['CANONICAL_REQUEST_DIGESTS'])
        self.assertEqual(self.generator.call_count,0)
        return result
    def tearDown(self): self.assertEqual(self.launches.call_count,0)

    def test_supported_shape_complete_synthetic_only(self): self.complete()
    def test_changed_input(self):
        (self.root/'sample/geometry/diagnostic_cube.stl').write_bytes(b'changed geometry')
        self.hold('HASH_MISMATCH')
    def test_changed_profile(self):
        with (self.root/'sample/profiles/printer.json').open('ab') as f: f.write(b' ')
        self.hold('HASH_MISMATCH')
    def test_changed_engine(self):
        self.engine.write_bytes(b'changed engine')
        self.hold('HASH_MISMATCH')
    def test_changed_backend(self):
        with (self.backend/'progress.py').open('ab') as f: f.write(b' ')
        self.hold('HASH_MISMATCH')
    def test_missing_resource(self):
        self.resource.unlink()
        self.hold('FILE_UNAVAILABLE')
    def test_changed_resource(self):
        self.resource.write_bytes(b'changed selected request config')
        self.hold('HASH_MISMATCH')
    def test_unknown_option(self):
        self.raw['cli']['argv'].insert(1,'--unknown')
        self.hold('UNCLASSIFIED_ARGV')
    def test_unsupported_multifilament(self):
        self.raw['profiles']['filament_2']='./profiles/filament.json'
        self.hold('UNSUPPORTED_ROUTE')
    def test_unsupported_native(self):
        self.raw['input_mode']='native_bambu_project'
        self.hold('UNSUPPORTED_ROUTE')
    def test_unsupported_version(self):
        self.raw['cli']['version']='02.08.02.62'
        self.hold('UNSUPPORTED_ROUTE')
    def test_unclassified_env(self):
        self.raw['cli']['env']={'SECRET_TOKEN':'do-not-collect'}
        result=self.hold('UNCLASSIFIED_ENV_OVERRIDE')
        self.assertNotIn('do-not-collect',json.dumps(result))
    def test_unknown_job_field(self):
        self.raw['modifiers']=[]
        self.hold('UNCLASSIFIED_JOB_FIELD')
    def test_unknown_mesh_semantics(self):
        self.raw['mesh']['modifier']='unknown'
        self.hold('UNKNOWN_INPUT_SEMANTICS')
    def test_resource_false_attestation_propagation(self):
        self.policy['request_resources']['coverage_status']='INCOMPLETE'
        result=self.hold('REQUEST_RESOURCE_COVERAGE_UNRESOLVED')
        self.assertFalse(result['ATTESTATION_EVIDENCE']['selected_request_resource_coverage_complete']['value'])
        self.assertTrue(result['ATTESTATION_EVIDENCE']['request_bytes_bound']['value'])
    def test_cwd_opaque_and_one_token_per_actual_argv(self):
        result=self.complete()
        execution=result['DESCRIPTOR']['request_identity']['execution']
        self.assertEqual(execution['cwd'],{'kind':'opaque_path','value':str(self.root)})
        self.assertEqual(len(execution['argv']),len(result['RESOLVED_ARGV']))
        self.assertEqual(execution['argv'][6]['value'],result['RESOLVED_ARGV'][6])
        self.assertEqual(execution['argv'][-1]['kind'],'opaque_path')
    def test_output_rule_conservative_binding(self):
        result=self.complete()
        execution=result['DESCRIPTOR']['request_identity']['execution']
        for index in (26,28):
            self.assertEqual(execution['argv'][index]['kind'],'opaque_path')
            self.assertEqual(execution['argv'][index]['value'],result['RESOLVED_ARGV'][index])
        self.assertEqual(result['DESCRIPTOR']['request_identity']['contracts']['policies']['paths']['sha256'],result['COVERAGE_POLICY_SHA256'])
    def test_guessed_output_neutrality_holds(self):
        self.policy['output_rule']['output_only_destination']=True
        self.hold('UNSUPPORTED_OUTPUT_RULE')
    def test_input_role_not_inferred_for_other_locked_mesh(self):
        p=self.root/'sample/geometry/diagnostic_cube.stl'
        p.write_bytes(p.read_bytes()+b'\n')
        l=self.root/'sample/locks/INPUT_LOCKS.json'; obj=json.loads(l.read_bytes())
        obj['files']['geometry/diagnostic_cube.stl']=hashlib.sha256(p.read_bytes()).hexdigest()
        l.write_text(json.dumps(obj),encoding='utf-8')
        self.hold('UNSUPPORTED_INPUT_SEMANTICS')
    def test_file_change_during_read(self):
        original=adapter.os.fstat
        calls=[0]
        def fstat(fd):
            value=original(fd); calls[0]+=1
            if calls[0]==2: self.engine.write_bytes(b'different stable size?')
            return value
        with patch('request_identity_a1.os.fstat',side_effect=fstat):
            with self.assertRaises(adapter.AdapterHold) as exc: adapter.stable_read(self.engine)
        self.assertEqual(exc.exception.code,'CHANGED_FILE')
    def test_change_between_load_and_final_reverify(self):
        original=adapter.resolve_argv
        def argv(spec,run):
            result=original(spec,run)
            with self.job.open('ab') as f: f.write(b' ')
            return result
        with patch('request_identity_a1.resolve_argv',side_effect=argv): self.hold('CHANGED_FILE')
    def test_modified_production_policy_rejected(self):
        fake=self.root/'modified-policy.json'; fake.write_text(json.dumps(self.policy),encoding='utf-8')
        with patch('request_identity_a1.POLICY_PATH',fake):
            result=adapter.build_windows_a1_request(self.job,backend_dir=self.backend,run_dir=self.run_dir)
        self.assertEqual(result['blockers'][0]['code'],'POLICY_IDENTITY_MISMATCH')
        self.assertEqual(self.generator.call_count,0)
    def test_conflicting_lock_alias_is_not_silently_collapsed(self):
        p=self.root/'sample/locks/INPUT_LOCKS.json'; obj=json.loads(p.read_bytes())
        obj['files']['./profiles/printer.json']='0'*64
        p.write_text(json.dumps(obj),encoding='utf-8')
        self.hold('INVALID_LOCK_COVERAGE')
    def test_missing_lock_coverage(self):
        p=self.root/'sample/locks/INPUT_LOCKS.json'; obj=json.loads(p.read_bytes()); obj['files'].pop('profiles/process.json')
        p.write_text(json.dumps(obj),encoding='utf-8')
        self.hold('INVALID_LOCK_COVERAGE')

    def test_traced_selected_resource_is_in_descriptor(self):
        result=self.complete()
        entries=result['DESCRIPTOR']['request_identity']['selected_request_resources']['entries']
        self.assertEqual(entries[0]['sha256'],self.policy['request_resources']['selected'][0]['sha256'])
        self.assertEqual(result['REQUIRED_ABSENCE_CHECKS'][0]['state'],'ABSENT')

    def test_revised_selected_resource_bytes_change_key(self):
        first=self.complete()['SLICE_KEY']; self.generator.reset_mock()
        self.resource.write_bytes(b'new synthetic reviewed limits')
        self.policy['request_resources']['selected'][0]['sha256']=hashlib.sha256(self.resource.read_bytes()).hexdigest()
        self.assertNotEqual(first,self.complete()['SLICE_KEY'])

    def test_required_absence_becomes_present_hold(self):
        self.absent.write_bytes(b'synthetic machine config')
        self.hold('REQUIRED_ABSENCE_VIOLATION')

    def test_unknown_traced_config_hold(self):
        self.policy['resource_trace_evidence']['unknown_request_config_reads']=['synthetic unknown config']
        self.hold('UNKNOWN_TRACED_CONFIG')

    def test_incomplete_trace_hold(self):
        self.policy['resource_trace_evidence']['trace_complete']=False
        self.hold('TRACE_INCOMPLETE')

    def test_nonselected_runtime_change_same_request_key(self):
        runtime=self.root/'synthetic-runtime.dll'; runtime.write_bytes(b'host-runtime-A')
        first=self.complete()['SLICE_KEY']; self.generator.reset_mock()
        runtime.write_bytes(b'host-runtime-B')
        self.assertEqual(first,self.complete()['SLICE_KEY'])

    def test_actual_policy_pin_and_v01_preserved(self):
        self.assertEqual(hashlib.sha256(adapter.POLICY_PATH.read_bytes()).hexdigest(),adapter.POLICY_SHA256)
        old=ROOT/'policies/WINDOWS_A1_04_REQUEST_IDENTITY_POLICY_V0_1.json'
        self.assertEqual(hashlib.sha256(old.read_bytes()).hexdigest(),'15a49d183e1702cec0eccccdec114555828f32ea69cf7865688d8ab03f941f59')

    def test_changed_traced_profile_binding_hold(self):
        self.policy['observed_profile_sha256']['printer']='0'*64
        self.hold('TRACED_PROFILE_IDENTITY_MISMATCH')

    def test_changed_traced_route_context_hold(self):
        self.policy['observed_route_context']['cwd']='different synthetic route'
        self.hold('TRACE_ROUTE_CONTEXT_MISMATCH')

if __name__=='__main__': unittest.main()
