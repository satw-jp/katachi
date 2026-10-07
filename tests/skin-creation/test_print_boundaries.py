import copy,io,json,sys,tempfile,unittest,zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/skin_creation'))
from print_workflow import PrintWorkflow,new_state,validate_saved,identity
from print_profiles import DEFAULT

class PrintBoundaries(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.key='a'*32
  self.result=dict(id=self.key,meshHash='mesh',surfaceHash='surface')
  self.session=SimpleNamespace(project=self.root,state=dict(selected=self.key,results={self.key:self.result},printing=new_state()))
  self.w=PrintWorkflow(self.session,self.root/'artifacts')
 def tearDown(self):self.temp.cleanup()
 def prepare(self,triangles=12):
  with patch('print_workflow.bounds',return_value=dict(min=[-10,-10,-1],max=[10,10,20],triangles=triangles)):
   self.w.prepare(dict(choice=copy.deepcopy(DEFAULT)))
  self.w.place();return self.w.value()['prepared']
 def test_oversized_input_rejected_before_export_or_engine(self):
  p=self.prepare(282315806);self.assertIsNotNone(p['sliceBlocker'])
  with patch('print_workflow.export') as export:
   with self.assertRaises(ValueError):self.w.start(dict(key=p['key']))
   export.assert_not_called()
  self.assertEqual(self.w.value()['attempts'],[])
 def test_wrong_binding_rejected_and_selected_change_stales_only_result(self):
  p=self.prepare();validate_saved(self.w.value(),self.session.state['results'])
  broken=copy.deepcopy(self.w.value());broken['prepared']['translation'][0]+=1
  with self.assertRaises(ValueError):validate_saved(broken,self.session.state['results'])
  self.w.value()['attempts'].append(dict(id='b'*32,snapshotId=self.key,recipeKey=p['key'],artifacts={},status='FAILED'))
  self.session.state['selected']=None
  self.assertTrue(self.w.state()['attempts'][0]['stale']);self.assertEqual(self.w.value()['prepared'],p)
  with self.assertRaises(ValueError):self.w.start(dict(key=p['key']))
 def test_unproven_material_and_profile_preserve_current_recipe(self):
  self.prepare();old=copy.deepcopy(self.w.value())
  with self.assertRaises(ValueError):self.w.prepare(dict(choice=dict(DEFAULT,interface='PETG')))
  self.assertEqual(old,self.w.value())
  with patch('print_workflow.identity',return_value='changed'):
   with self.assertRaises(ValueError):self.w.prepare(dict(choice=DEFAULT))
  self.assertEqual(old,self.w.value())
 def test_preset_choice_roundtrip_and_no_auto_run(self):
  c=dict(DEFAULT,material='PETG');self.w.preset(dict(operation='save',name='PETG',choice=c));self.w.preset(dict(operation='load',name='PETG'))
  self.assertEqual(self.w.value()['choice'],c);self.assertFalse(self.w.busy());self.assertEqual(self.w.value()['attempts'],[])
 def test_corrupt_artifact_rebind_preserves_existing_bytes(self):
  import hashlib
  a=dict(id='c'*32,snapshotId=self.key,recipeKey='fixture',status='OUTPUT_COMPLETE_REVIEW_REQUIRED',artifacts={'plate_1.gcode':dict(bytes=4,sha256=hashlib.sha256(b'good').hexdigest())})
  self.w.value()['attempts'].append(a);folder=self.w.output/a['id'];folder.mkdir();(folder/'plate_1.gcode').write_bytes(b'good')
  buf=io.BytesIO()
  with zipfile.ZipFile(buf,'w') as z:z.writestr('attempt.json',json.dumps(a));z.writestr('plate_1.gcode',b'evil')
  with self.assertRaises(ValueError):self.w.rebind(buf.getvalue())
  self.assertEqual((folder/'plate_1.gcode').read_bytes(),b'good')
  valid=self.w.bundle(a['id']);self.w.rebind(valid);self.assertEqual((folder/'plate_1.gcode').read_bytes(),b'good')

if __name__=='__main__':unittest.main()
