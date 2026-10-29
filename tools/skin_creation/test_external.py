import copy, json, shutil, tempfile, unittest, uuid, time
from unittest.mock import patch
import server
from pathlib import Path
import numpy as np
import external as e
from engine import ROOT, validate_assets
from server import fresh_state, pack, unpack, validate_state

# Standalone mathematical fixture; no artwork source. CC0-1.0.
def octahedron():
    v=np.array([[10,0,0],[-10,0,0],[0,10,0],[0,-10,0],[0,0,10],[0,0,-10]],float)
    faces=[]
    for top in (4,5):
        for a,b in ((0,2),(2,1),(1,3),(3,0)):
            f=[top,a,b];t=v[f]
            if np.dot(np.cross(t[1]-t[0],t[2]-t[0]),t.mean(0))<0:f=[top,b,a]
            faces.append(f)
    return stl(v[np.array(faces)])
def stl(tri):
    return ('solid fixture\n'+''.join('facet normal 0 0 0\nouter loop\n'+''.join('vertex '+' '.join(map(str,p))+'\n' for p in t)+'endloop\nendfacet\n' for t in tri)+'endsolid fixture\n').encode()

class ExternalTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.p=Path(self.temp.name)/'project'
        shutil.copytree(ROOT/'assets',self.p/'assets');validate_assets(self.p/'assets')
        self.data=octahedron();info=e.import_host(self.p,self.data)
        self.recipe=dict(kind=e.KIND,algorithm=e.ALGORITHM,host=info['sha256'],units='mm',upAxis='z',hostScale=1,template=e.s.SOURCE_FILES['data/D6_local.npz']['sha256'],flowerScale=1,density=1,seed=20261029)
    def tearDown(self):self.temp.cleanup()
    def gen(self,**changes):return e.generate(self.p,dict(self.recipe,**changes),uuid.uuid4().hex)
    def test_real_scatter_size_density_transform_and_replay(self):
        a=self.gen();b=self.gen(flowerScale=.8);c=self.gen(density=1.8);d=self.gen(upAxis='y',hostScale=1.2);again=self.gen()
        self.assertEqual([a['flowerCount'],b['flowerCount'],c['flowerCount']],[22,34,39])
        self.assertEqual(a['surfaceHash'],again['surfaceHash'])
        self.assertEqual(len({x['surfaceHash'] for x in (a,b,c,d)}),4)
        self.assertEqual((self.p/'assets/external'/(self.recipe['host']+'.stl')).read_bytes(),self.data)
        for r in (a,b,c,d):e.validate_result(self.p,r)
        layout=self.p/a['layout']/'surface';doc=e.read(layout/'surface.json');doc['instances'][0]['anchor_world_mm'][0]+=1;e.write(layout/'surface.json',doc)
        with self.assertRaisesRegex(ValueError,'mirror'):e.validate_result(self.p,a)
    def test_history_compare_adoption_redo_tail_portability(self):
        a=self.gen();b=self.gen(flowerScale=.8);state=fresh_state();state.update(results={a['id']:a,b['id']:b},history=[a['id'],b['id']],cursor=0,selected=b['id'],compare=a['id'])
        payload=pack(self.p,state);target=Path(self.temp.name)/'other-folder'
        restored=unpack(payload,target);self.assertEqual(state,restored)
        regenerated=e.generate(target,a['recipe'],uuid.uuid4().hex)
        self.assertEqual(a['surfaceHash'],regenerated['surfaceHash'])
    def test_unsupported_and_budget_do_not_change_input(self):
        v,f=e.parse_stl(self.data);tri=v[f]
        bad=[stl(tri[:-1]),stl(tri[:,::-1]),stl(np.concatenate([tri,tri+50])),stl(np.concatenate([tri,tri[:1]]))]
        deg=tri.copy();deg[0,1]=deg[0,0];bad.append(stl(deg))
        for data in bad:
            with self.assertRaises(ValueError):e.import_host(self.p,data)
        for changes in [dict(hostScale=100),dict(flowerScale=.01),dict(density=100)]:
            with self.assertRaisesRegex(ValueError,'budget'):self.gen(**changes)
        with self.assertRaises(ValueError):e.validate_recipe(dict(self.recipe,units='inch'))
    def test_cancel_new_request_project_switch_and_time_budget(self):
        session=server.Session(Path(self.temp.name)/'sessions')
        e.import_host(session.project,self.data)
        initial=e.generate(session.project,self.recipe,uuid.uuid4().hex)
        session.state.update(history=[initial['id']],cursor=0,results={initial['id']:initial},selected=initial['id'])
        def wait_done():
            deadline=time.monotonic()+10
            while session.busy() and time.monotonic()<deadline:time.sleep(.02)
            self.assertFalse(session.busy())
        with session.lock:
            session.generate(self.recipe);old_job=session.state['job']['id'];session.cancel()
            session.generate(dict(self.recipe,density=1.8))
        wait_done()
        self.assertEqual(session.state['selected'],initial['id'])
        self.assertNotIn(old_job,session.state['results'])
        self.assertEqual(len(session.state['history']),2)
        with session.lock:
            session.generate(self.recipe);session.cancel()
            replacement=server.Session(Path(self.temp.name)/'replacement')
            session.project,session.state=replacement.project,replacement.state
        time.sleep(.5)
        self.assertEqual(session.state['results'],{})
        e.import_host(session.project,self.data)
        with patch('server.MAX_SECONDS',.001):
            session.generate(self.recipe);wait_done()
        self.assertEqual(session.state['job']['status'],'failed')
        self.assertIn('budget',session.state['job']['error'])
        self.assertEqual(session.state['results'],{})

    def test_fixed_replay_contract_unchanged(self):
        with self.assertRaises(ValueError): e.s.validate_recipe(self.recipe)

if __name__=='__main__':unittest.main()
