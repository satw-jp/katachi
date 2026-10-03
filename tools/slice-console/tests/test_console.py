"""Console routing uses only existing fake CLI and small synthetic packages."""

import contextlib
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import test_runner as fixtures
from slice_console import ConsoleRouter
from slice_console.console import main


class ConsoleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.launcher = patch("runner.subprocess.Popen", wraps=subprocess.Popen)
        self.launches = self.launcher.start()
        self.addCleanup(self.launcher.stop)
        self.fixture = fixtures.RunnerTests()
        self.router = ConsoleRouter()

    def tearDown(self):
        print(f"ENGINE_LAUNCH_COUNT {self.id()} {self.launches.call_count}")

    def request(self, mode, **inputs):
        return {"schema_version": "0.1", "request_id": "synthetic-request", "mode": mode,
                "inputs": {key: str(value) if isinstance(value, Path) else value for key, value in inputs.items()}}

    def run_request(self, request, launches=0):
        before = self.launches.call_count
        result = self.router.run(request)
        self.assertEqual(self.launches.call_count-before, launches)
        self.assertEqual(result["engine_started"], launches > 0)
        self.assertIsNotNone(result["finished_at"])
        self.assertNotIn("print_go", result)
        self.assertNotIn("technical_pass", result)
        # Machine-readable serialization is part of the shared result contract.
        json.dumps(result)
        return result

    def test_preflight_pass_no_engine(self):
        job = self.fixture.make_mesh_job(self.root)
        result = self.run_request(self.request("PREFLIGHT", job_path=job))
        self.assertEqual(result["status"], "PASS")
        self.assertTrue(all(check["ok"] for check in result["validation"]))
        self.assertFalse((job.parent/'output/runs').exists())

    def test_preflight_invalid_lock_profile_mesh_hold_no_engine(self):
        for failure in ("lock", "profile", "mesh"):
            with self.subTest(failure=failure):
                root=self.root/failure
                root.mkdir()
                job=self.fixture.make_mesh_job(root)
                if failure == "lock":
                    locks=job.parent/'locks/INPUT_LOCKS.json'
                    data=json.loads(locks.read_text())
                    data['files']['geometry/permanent.stl']='0'*64
                    locks.write_text(json.dumps(data))
                elif failure == "profile":
                    (job.parent/'profiles/printer.json').unlink()
                else:
                    mesh=job.parent/'geometry/permanent.stl'
                    mesh.write_bytes(b'solid empty\nendsolid empty\n')
                    locks=job.parent/'locks/INPUT_LOCKS.json'
                    data=json.loads(locks.read_text())
                    data['files']['geometry/permanent.stl']=hashlib.sha256(mesh.read_bytes()).hexdigest()
                    locks.write_text(json.dumps(data))
                result=self.run_request(self.request("PREFLIGHT",job_path=job))
                self.assertEqual(result['status'],'HOLD')
                self.assertEqual(result['reason'],'STATIC_VALIDATION_FAILED')

    def test_full_slice_delegates_one_fake_engine_preserves_manifest(self):
        job=self.fixture.make_mesh_job(self.root)
        original=job.read_bytes()
        result=self.run_request(self.request('FULL_SLICE',job_path=job),launches=1)
        self.assertEqual(result['status'],'SUCCESS')
        self.assertEqual(result['backend_invoked'],'SliceRunner')
        manifest_path=Path(result['result_manifest_path'])
        manifest=json.loads(manifest_path.read_text())
        self.assertTrue(manifest['execution_success'])
        self.assertEqual(manifest['runner_version'],'0.2.0')
        self.assertEqual(manifest['schema_version'],'0.2')
        self.assertEqual(manifest['argv'],json.loads((manifest_path.parent/'RUNNER_EXECUTION_CONTEXT.json').read_text())['argv'])
        self.assertEqual(job.read_bytes(),original)
        self.assertEqual((manifest_path.parent/'SLICE_JOB.json').read_bytes(),original)
        self.assertNotIn('printable',manifest)
        self.assertNotIn('console',manifest)
        self.assertTrue(any(event=='started' for event,payload in self.drain_events()))

    def drain_events(self):
        events=[]
        while not self.router.events.empty():
            events.append(self.router.events.get())
        return events

    def test_full_slice_invalid_job_no_engine(self):
        job=self.fixture.make_mesh_job(self.root,b'broken mesh')
        result=self.run_request(self.request('FULL_SLICE',job_path=job))
        self.assertEqual(result['status'],'HOLD')
        self.assertIsNone(result['result_manifest_path'])

    def test_full_slice_backend_failure_remains_failed(self):
        job=self.fixture.make_job(self.root,mode='failure',duration=0.01)
        result=self.run_request(self.request('FULL_SLICE',job_path=job),launches=1)
        self.assertEqual(result['status'],'FAILED')
        manifest=json.loads(Path(result['result_manifest_path']).read_text())
        self.assertEqual(manifest['exit_code'],7)
        self.assertFalse(manifest['execution_success'])

    def test_full_slice_cancel_and_busy_preserve_backend_events(self):
        job=self.fixture.make_job(self.root,mode='long',duration=0.01)
        results=[]
        worker=threading.Thread(target=lambda:results.append(self.router.run(self.request('FULL_SLICE',job_path=job))))
        worker.start()
        deadline=time.monotonic()+8
        while time.monotonic()<deadline:
            if not self.router.events.empty():
                event,payload=self.router.events.get()
                if event=='started':
                    break
            time.sleep(0.01)
        else:
            self.router.cancel()
            worker.join(8)
            self.fail('Fake engine did not start')
        busy=self.router.run(self.request('REUSE',artifact_path=self.root/'pointer'))
        self.assertEqual(busy['reason'],'ROUTER_BUSY')
        self.router.cancel()
        worker.join(8)
        self.assertFalse(worker.is_alive())
        self.assertEqual(self.launches.call_count,1)
        self.assertTrue(results[0]['engine_started'])
        self.assertEqual(results[0]['status'],'CANCELLED')
        manifest=json.loads(Path(results[0]['result_manifest_path']).read_text())
        self.assertFalse(manifest['execution_success'])

    def package_inputs(self):
        gcode=self.root/'plate_1.gcode'
        raw=b'; total layer number: 2\r\n; layer num/total_layer_count: 1/2\r\nG1 X1\r\n; layer num/total_layer_count: 2/2\r\nG1 X2\r\n'
        gcode.write_bytes(raw)
        context=self.root/'context.3mf'
        with zipfile.ZipFile(context,'w') as archive:
            archive.writestr('Metadata/project_settings.config','{}')
            archive.writestr('Metadata/model_settings.config','<config><plate><metadata key="gcode_file" value=""/></plate></config>')
        return {'gcode_path':gcode,'context_3mf_path':context,'output_dir':self.root/'package',
                'expected_sha256':hashlib.sha256(raw).hexdigest(),'expected_bytes':len(raw),'expected_layers':2}

    def test_package_only_identity_no_engine(self):
        inputs=self.package_inputs()
        result=self.run_request(self.request('PACKAGE_ONLY',**inputs))
        self.assertEqual(result['status'],'PACKAGE_COMPLETE')
        package=json.loads(Path(result['package_result_path']).read_text())
        self.assertEqual(package['zip_crc'],'PASS')
        self.assertEqual(package['hash_match'],'MATCH')
        self.assertEqual(package['preview_status'],'AUTHOR_PREVIEW_CHECK')
        with zipfile.ZipFile(result['package_path']) as archive:
            self.assertEqual(archive.read('Metadata/plate_1.gcode'),inputs['gcode_path'].read_bytes())

    def test_package_missing_context_or_wrong_hash_fails_no_engine(self):
        for failure in ('context','hash'):
            with self.subTest(failure=failure):
                inputs=self.package_inputs()
                if failure=='context':
                    inputs['context_3mf_path'].unlink()
                else:
                    inputs['expected_sha256']='0'*64
                result=self.run_request(self.request('PACKAGE_ONLY',**inputs))
                self.assertEqual(result['status'],'PACKAGE_FAILED')
                self.assertIsNone(result['package_path'])

    def test_audit_hold_no_engine_or_artifact_selection(self):
        result=self.run_request(self.request('AUDIT_ONLY',artifact_path=self.root/'not-read.gcode'))
        self.assertEqual(result['reason'],'AUDITOR_NOT_CONNECTED')
        self.assertEqual(result['status'],'HOLD')
        self.assertIsNone(result['backend_invoked'])

    def test_reuse_hold_no_engine_or_artifact_selection(self):
        result=self.run_request(self.request('REUSE',artifact_path=self.root/'not-read.json'))
        self.assertEqual(result['reason'],'CACHE_NOT_IMPLEMENTED')
        self.assertEqual(result['status'],'HOLD')
        self.assertIsNone(result['backend_invoked'])

    def test_unknown_mode_fail_closed(self):
        result=self.run_request(self.request('TYPO',job_path=self.root/'job.json'))
        self.assertEqual(result['status'],'HOLD')
        self.assertEqual(result['reason'],'UNKNOWN_MODE')

    def test_invalid_contract_fail_closed(self):
        valid=self.request('PREFLIGHT',job_path=self.root/'job.json')
        cases=[None,{},dict(valid,schema_version='0.2'),dict(valid,extra=True),dict(valid,inputs={'job_path':'relative.json'}),
               dict(valid,inputs={'job_path':str(self.root/'job.json'),'engine_probe':True}),dict(valid,request_id='')]
        for request in cases:
            with self.subTest(request=request):
                self.assertEqual(self.run_request(request)['reason'],'INVALID_REQUEST')

    def test_cli_preflight_and_request_json_share_router_and_write_result(self):
        job=self.fixture.make_mesh_job(self.root)
        output=self.root/'CONSOLE_RESULT.json'
        with contextlib.redirect_stdout(io.StringIO()) as stdout:
            code=main(['preflight',str(job),'--request-id','CLI.TEST','--result',str(output)])
        self.assertEqual(code,0)
        result=json.loads(output.read_text(encoding='utf-8'))
        self.assertEqual(result,json.loads(stdout.getvalue()))
        request=self.root/'CONSOLE_REQUEST.json'
        request.write_text(json.dumps(self.request('PREFLIGHT',job_path=job)))
        with contextlib.redirect_stdout(io.StringIO()) as stdout:
            self.assertEqual(main(['run',str(request)]),0)
        self.assertEqual(json.loads(stdout.getvalue())['status'],'PASS')
        self.assertEqual(self.launches.call_count,0)

    def test_cli_existing_result_refuses_dispatch(self):
        job=self.fixture.make_job(self.root)
        output=self.root/'CONSOLE_RESULT.json'
        output.write_bytes(b'original')
        with contextlib.redirect_stdout(io.StringIO()) as stdout:
            self.assertEqual(main(['full-slice',str(job),'--result',str(output)]),2)
        self.assertEqual(json.loads(stdout.getvalue())['reason'],'RESULT_PATH_UNAVAILABLE')
        self.assertEqual(output.read_bytes(),b'original')
        self.assertEqual(self.launches.call_count,0)

    def test_cli_invalid_json_writes_hold_without_engine(self):
        request=self.root/'CONSOLE_REQUEST.json'
        request.write_text('{invalid')
        output=self.root/'CONSOLE_RESULT.json'
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(main(['run',str(request),'--result',str(output)]),2)
        self.assertEqual(json.loads(output.read_text())['status'],'HOLD')
        self.assertEqual(self.launches.call_count,0)

    def test_cli_backend_result_name_refuses_dispatch(self):
        inputs=self.package_inputs()
        with contextlib.redirect_stdout(io.StringIO()) as stdout:
            code=main(['package',str(inputs['gcode_path']),'--context',str(inputs['context_3mf_path']),
                       '--output-dir',str(inputs['output_dir']),'--result',str(self.root/'PACKAGE_RESULT.json')])
        self.assertEqual(code,2)
        self.assertEqual(json.loads(stdout.getvalue())['reason'],'RESULT_PATH_UNAVAILABLE')
        self.assertEqual(self.launches.call_count,0)
        self.assertFalse(inputs['output_dir'].exists())


if __name__=='__main__':
    unittest.main()
