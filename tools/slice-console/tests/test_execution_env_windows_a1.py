"""Finite collector fixtures, no actual host discovery or process execution."""
import copy
from contextlib import ExitStack
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
import execution_env_windows_a1 as collector
from execution_env_v01 import compare_execution_env_v0_1


class WindowsEnvironmentCollectorTests(unittest.TestCase):
    def setUp(self):
        self.root=Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.policy=json.loads(collector.COLLECTION_POLICY_PATH.read_bytes())
        self.cp_raw=collector.COMPATIBILITY_POLICY_PATH.read_bytes();self.cp=json.loads(self.cp_raw)
        self.dist_raw=collector.DISTRIBUTION_POLICY_PATH.read_bytes(); self.dist=json.loads(self.dist_raw)
        self.distribution={'fingerprint_sha256':hashlib.sha256(json.dumps(self.dist,sort_keys=True,separators=(',',':')).encode()).hexdigest(),
            'policy_id':self.dist['policy_id'],'policy_version':self.dist['policy_version'],
            'policy_sha256':collector.DISTRIBUTION_POLICY_SHA256}
        self.paths={}
        for name in ('engine','companion','api_set','ucrtbase.dll','vcruntime140.dll','pythonw.exe','desktop.lnk','startup.lnk'):
            p=self.root/name;p.write_bytes(('synthetic '+name).encode());self.paths[name]=p
        self.policy['route']['engine_executable']={'path':str(self.paths['engine']),'sha256':hashlib.sha256(self.paths['engine'].read_bytes()).hexdigest()}
        self.policy['files']={'engine_companion':str(self.paths['companion']),'api_set_schema':str(self.paths['api_set']),
            'native_runtime_manifest':{name:str(self.paths[name]) for name in ('ucrtbase.dll','vcruntime140.dll')}}
        self.policy['python_binding']['shortcut_paths']=[str(self.paths['desktop.lnk']),str(self.paths['startup.lnk'])]
        self.policy['python_binding']['expected_app_path']=str(self.root/'app.py')
        self.policy['python_binding']['expected_working_directory']=str(self.root)
        self.launch=self.enterContext(patch('subprocess.Popen',side_effect=AssertionError('process forbidden')))
        self.run=self.enterContext(patch('subprocess.run',side_effect=AssertionError('process forbidden')))
        self.enterContext(patch.object(collector,'_system_observations',return_value=(
            {k:{'state':'KNOWN','value':v} for k,v in {'os_family':'Windows','os_build':'10.0.26100','architecture':'AMD64'}.items()},
            {'method':'synthetic fixture'})))
        self.shortcut=self.enterContext(patch.object(collector,'_read_shortcut',side_effect=self.link))
        self.version=self.enterContext(patch.object(collector,'_python_version_resource',return_value={'version':'3.12.10','implementation':'CPython'}))

    def tearDown(self):
        self.assertEqual(self.launch.call_count,0); self.assertEqual(self.run.call_count,0)

    def link(self,path):
        return {'target':str(self.paths['pythonw.exe']),
            'arguments':f'"{self.root / "app.py"}"'+(' --startup' if str(path)==str(self.paths['startup.lnk']) else ''),
            'cwd':str(self.root)}

    def collect(self):
        return collector._collect(self.policy,{'raw':self.cp_raw,'value':self.cp},self.distribution)

    def compare(self,fp,expected):
        with ExitStack() as stack:
            guards=[stack.enter_context(patch(target,side_effect=AssertionError(target))) for target in (
                'subprocess.Popen','subprocess.run','builtins.open','io.open','os.stat','os.lstat','os.listdir','os.scandir','os.walk')]
            result=compare_execution_env_v0_1(fp,fp,self.cp_raw)
            self.assertTrue(all(x.call_count==0 for x in guards))
        self.assertEqual(result['status'],'COMPLETE',result['blockers'])
        self.assertEqual(result['comparison_class'],expected)
        self.assertFalse(result['reuse_authorized'])
        return result

    def test_stable_companion_stream_hash(self):
        item=collector.stable_file_identity(self.paths['companion'],chunk_bytes=3)
        self.assertEqual(item['state'],'KNOWN')
        self.assertEqual(item['sha256'],hashlib.sha256(self.paths['companion'].read_bytes()).hexdigest())
        self.assertEqual(item['stat_before'],item['stat_after'])
        self.assertEqual(item['handle_before'],item['handle_after'])
        self.assertEqual(item['stat_before'][:4],item['handle_after'][:4])

    def test_companion_larger_than_a_limit(self):
        with self.paths['companion'].open('wb') as handle: handle.truncate(17*1024*1024)
        item=collector.stable_file_identity(self.paths['companion'])
        self.assertEqual(item['state'],'KNOWN'); self.assertEqual(item['size'],17*1024*1024)

    def test_changed_during_read_not_known(self):
        original=collector.os.fstat;calls=[0]
        def changed(fd):
            value=original(fd);calls[0]+=1
            if calls[0]==2:self.paths['companion'].write_bytes(b'different')
            return value
        with patch.object(collector.os,'fstat',side_effect=changed): item=collector.stable_file_identity(self.paths['companion'])
        self.assertEqual(item['state'],'UNTRUSTED'); self.assertIsNone(item['sha256'])

    def test_missing_dll(self):
        self.paths['companion'].unlink();item=self.collect()['FINGERPRINT']['observations']['engine_companion']
        self.assertEqual(item,{'state':'MISSING','value':{'sha256':None}})

    def test_reparse_ambiguity(self):
        original=collector.Path.lstat
        def reparse(path):
            value=original(path)
            if path==self.paths['companion']:
                return SimpleNamespace(st_mode=value.st_mode,st_file_attributes=0x400)
            return value
        with patch.object(collector.Path,'lstat',reparse): item=collector.stable_file_identity(self.paths['companion'])
        self.assertEqual(item['state'],'UNTRUSTED');self.assertIsNone(item['sha256'])

    def test_read_bound_rejects_oversized(self):
        item=collector.stable_file_identity(self.paths['companion'],max_bytes=2,chunk_bytes=1)
        self.assertEqual(item['state'],'UNKNOWN')

    def test_os_build_canonicalization(self):
        self.assertEqual(collector.canonical_os_build(SimpleNamespace(major=10,minor=0,build=26100)),'10.0.26100')

    def test_os_build_invalid_not_canonical(self):
        with self.assertRaises(ValueError):collector.canonical_os_build(SimpleNamespace(major=10,minor=0,build='26100'))

    def test_architecture_native_mapping(self):
        # Invoke the real observation mapper, not the setUp system fixture.
        function=self.system_function
        for code,name in ((0,'x86'),(9,'AMD64'),(12,'ARM64')):
            with patch.object(collector.os,'name','nt'),patch.object(collector.sys,'getwindowsversion',return_value=SimpleNamespace(major=10,minor=0,build=1),create=True),patch.object(collector,'_native_architecture',return_value=code):
                self.assertEqual(function(self.policy)[0]['architecture'],{'state':'KNOWN','value':name})

    def test_unknown_architecture_no_env_guess(self):
        with patch.object(collector.os,'name','nt'),patch.object(collector.sys,'getwindowsversion',return_value=SimpleNamespace(major=10,minor=0,build=1),create=True),patch.object(collector,'_native_architecture',return_value=65535):
            self.assertEqual(self.system_function(self.policy)[0]['architecture']['state'],'UNKNOWN')

    def test_exact_native_candidate_list_only(self):
        result=self.collect();entries=result['FINGERPRINT']['observations']['native_runtime_manifest']['value']['entries']
        self.assertEqual({x['logical_name'] for x in entries},{'ucrtbase.dll','vcruntime140.dll'})
        self.assertEqual(result['FINGERPRINT']['observations']['native_runtime_manifest']['value']['identity_kind'],'OBSERVED_CANDIDATES_NOT_LOADED')

    def test_no_directory_fallback(self):
        self.paths['vcruntime140.dll'].unlink();(self.root/'alternate').mkdir();(self.root/'alternate/vcruntime140.dll').write_bytes(b'not selected')
        with patch('os.walk',side_effect=AssertionError('crawl')),patch('os.listdir',side_effect=AssertionError('list')),patch('os.scandir',side_effect=AssertionError('scan')):
            result=self.collect()
        self.assertEqual(result['FINGERPRINT']['observations']['vc_runtime_candidate']['state'],'MISSING')

    def test_python_exact_binding(self):
        result=self.collect()['FINGERPRINT']['observations']['python']
        self.assertEqual(result['state'],'KNOWN'); self.assertEqual(result['value']['version'],'3.12.10')
        self.assertEqual(result['value']['executable_sha256'],hashlib.sha256(self.paths['pythonw.exe'].read_bytes()).hexdigest())

    def test_ambiguous_python_untrusted(self):
        self.shortcut.side_effect=lambda path:dict(self.link(path),target=str(self.root/'other-python.exe')) if str(path).endswith('startup.lnk') else self.link(path)
        item=self.collect()['FINGERPRINT']['observations']['python']
        self.assertEqual(item['state'],'UNTRUSTED');self.assertIsNone(item['value']['executable_sha256'])

    def test_python_alias_untrusted_no_collector_substitution(self):
        original=collector.stable_file_identity
        def read(path,**kwargs):
            if str(path)==str(self.paths['pythonw.exe']):return {'path':str(path),'state':'UNTRUSTED','sha256':None,'size':None,'code':'REPARSE_OR_SYMLINK'}
            return original(path,**kwargs)
        with patch.object(collector,'stable_file_identity',side_effect=read):item=self.collect()['FINGERPRINT']['observations']['python']
        self.assertEqual(item['state'],'UNTRUSTED');self.assertIsNone(item['value']['executable_sha256'])
        self.version.assert_not_called()

    def test_python_bad_launcher_arguments_untrusted(self):
        self.shortcut.side_effect=lambda path:dict(self.link(path),arguments='unexpected opaque argument')
        self.assertEqual(self.collect()['FINGERPRINT']['observations']['python']['state'],'UNTRUSTED')

    def test_python_version_metadata_gap_untrusted(self):
        self.version.side_effect=OSError('unavailable')
        self.assertEqual(self.collect()['FINGERPRINT']['observations']['python']['state'],'UNTRUSTED')

    def test_stdlib_distribution_policy_fingerprint(self):
        first=self.collect()['FINGERPRINT']['observations']['python']['value']['distribution']
        (self.root/'unrelated-package').write_bytes(b'arbitrary installed package')
        second=self.collect()['FINGERPRINT']['observations']['python']['value']['distribution']
        self.assertEqual(first,second)
        self.assertEqual(self.dist['required_third_party_execution_distributions'],[])
        self.assertFalse(self.dist['whole_site_packages_identity'])

    def environment(self,values):return collector._environment_observation(self.policy,lambda name:values.get(name))[0]

    def test_env_unset(self):
        self.assertTrue(all(x['state']=='unset' and x['value_identity'] is None for x in self.environment({})['value']['entries']))

    def test_env_empty(self):
        entry=next(x for x in self.environment({'LANG':''})['value']['entries'] if x['name']=='LANG')
        self.assertEqual(entry['state'],'empty');self.assertIsNone(entry['value_identity'])

    def test_env_present_exact_utf8_hash(self):
        entry=next(x for x in self.environment({'LANG':'日本語 '})['value']['entries'] if x['name']=='LANG')
        self.assertEqual(entry['value_identity'],hashlib.sha256('日本語 '.encode('utf-8')).hexdigest())

    def test_raw_env_never_returned(self):
        item=self.environment({'PATH':'synthetic private raw value','SECRET_TOKEN':'never read'})
        self.assertNotIn('synthetic private raw value',json.dumps(item)); self.assertNotIn('never read',json.dumps(item))

    def test_extra_env_never_read(self):
        seen=[]
        def lookup(name):seen.append(name);self.assertIn(name,self.cp['coverage']['inherited_env_names']);return None
        collector._environment_observation(self.policy,lookup)
        self.assertEqual(seen,self.cp['coverage']['inherited_env_names'])

    def test_unbound_runner_env_untrusted(self):
        item=self.environment({'PATH':'test'})
        self.assertEqual(item['state'],'UNTRUSTED')

    def test_semantic_digest_ignores_provenance(self):
        fp=self.collect()['FINGERPRINT'];first=self.compare(fp,'UNVERIFIED_ENV')
        fp['provenance']={'collected_at':'2030-01-01T00:00:00Z','human_note':'different evidence'}
        second=self.compare(fp,'UNVERIFIED_ENV')
        self.assertEqual(first['current_fingerprint_digest'],second['current_fingerprint_digest'])

    def test_self_exact_when_all_required_known(self):
        env=self.environment({});env['state']='KNOWN' # Synthetic trusted in-process fixture only.
        with patch.object(collector,'_environment_observation',return_value=(env,{'method':'synthetic bound Runner process'})):
            result=self.collect()
        self.compare(result['FINGERPRINT'],'EXACT_WITHIN_POLICY')

    def test_self_unverified_one_gap_no_equal_digest_shortcut(self):
        fp=self.collect()['FINGERPRINT']
        self.assertEqual(sum(x['state']!='KNOWN' for x in fp['observations'].values()),1)
        result=self.compare(fp,'UNVERIFIED_ENV')
        self.assertEqual(result['prior_fingerprint_digest'],result['current_fingerprint_digest'])

    def test_engine_route_change_unverified(self):
        self.paths['engine'].write_bytes(b'other engine')
        self.assertEqual(self.collect()['FINGERPRINT']['observations']['engine_companion']['state'],'UNTRUSTED')

    def test_public_wrong_policy_pin_incomplete(self):
        fake=self.root/'wrong-policy.json';fake.write_bytes(b'{}')
        with patch.object(collector,'COLLECTION_POLICY_PATH',fake): result=collector.collect_windows_a1_execution_env_v0_1()
        self.assertEqual(result['COLLECTOR_STATUS'],'INCOMPLETE');self.assertIsNone(result['FINGERPRINT'])

    def test_all_policy_pins_exact(self):
        for path,pin in ((collector.COLLECTION_POLICY_PATH,collector.COLLECTION_POLICY_SHA256),
                         (collector.COMPATIBILITY_POLICY_PATH,collector.COMPATIBILITY_POLICY_SHA256),
                         (collector.DISTRIBUTION_POLICY_PATH,collector.DISTRIBUTION_POLICY_SHA256)):
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),pin)


WindowsEnvironmentCollectorTests.system_function=staticmethod(collector._system_observations)
if __name__=='__main__':unittest.main()
