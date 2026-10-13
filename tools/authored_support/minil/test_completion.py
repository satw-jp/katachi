import unittest,tempfile,copy
from pathlib import Path
import numpy as np
import manifold3d as md
import trimesh
from .recipe import candidate_recipe,validate_recipe
from .completion import ready
from .dispatch import Stage,dispatch
from .generate import generate,validate_derived_inputs
from .removal import evaluate
from .body import Body
from .adapter import read
from ..mesh_backend import ManifoldKernel

class CompletionTests(unittest.TestCase):
    def recipe(self): return candidate_recipe()
    def ownership(self): return {'status':'PASS','decision':'NOT_APPLICABLE_TO_ONE_PIECE'}
    def test_double_scale_rejected(self):
        r=self.recipe(); r['existing_artwork_scale']=11/15
        with self.assertRaisesRegex(ValueError,'DOUBLE_SCALE'): validate_recipe(r,self.ownership())
    def test_wrong_plane_rejected(self):
        r=self.recipe(); r['support_model_base_plane_z_mm']=.2
        with self.assertRaisesRegex(ValueError,'WRONG_BASE'): validate_recipe(r,self.ownership())
    def test_wrong_ownership_rejected(self):
        with self.assertRaisesRegex(ValueError,'OWNERSHIP'): validate_recipe(self.recipe(),{'status':'HOLD'})
    def test_unbound_dimensions_rejected(self):
        r=self.recipe(); r['geometry']['shaft_radius']=1
        with self.assertRaisesRegex(ValueError,'DIMENSION'): validate_recipe(r,self.ownership())
    def test_source_geometry_scaled_once_tool_unscaled(self):
        r=self.recipe(); self.assertAlmostEqual(r['geometry']['shaft_radius'],.8*11/15)
        self.assertEqual(r['tool']['radius_mm'],.6)
    def test_false_ready_rejected(self):
        for g in [{},{'candidate_generated':True,'mesh_count':0},{'candidate_generated':True,'mesh_count':1,'demands_processed':1,'demands_total':2}]:
            self.assertFalse(ready(g,[{'status':'PASS'}],True,{'objects':[{}]}))
    def test_partial_stage_or_removal_cannot_ready(self):
        g={'candidate_generated':True,'mesh_count':1,'demands_processed':1,'demands_total':1,'all_height_demands_processed':True}
        self.assertFalse(ready(g,[{'status':'HOLD'}],True,{'objects':[{}]}))
        self.assertFalse(ready(g,[{'status':'PASS'}],True,{}))
        self.assertFalse(ready(g,[{'status':'PASS'}],False,{'objects':[{}]}))
    def fixture(self,out,extra=False):
        k=ManifoldKernel(np,trimesh,md)
        b=Body.__new__(Body); b.np=np;b.k=k
        t=trimesh.creation.box(extents=[4,4,2]); v=t.vertices+[90,90,10]
        meshes=[(v,t.faces)]; b.ids=['target-flower-00001']; b.rows=[{'id':b.ids[0]}]
        if extra:
            meshes.append((v+[0,0,-6],t.faces));b.ids.append('C_collision');b.rows.append({'id':'C_collision'})
        b.boxes=np.array([[v.min(0),v.max(0)] for v,f in meshes]); b.mesh=lambda i:meshes[i]
        b.solid=lambda i:k.man(*meshes[i]); b.index={s:i for i,s in enumerate(b.ids)}
        c={'np':np,'kernel':k,'recipe':self.recipe(),'out':Path(out),'case':{'case_id':'MINIL_B115_PROVISIONAL'}}
        occ=np.zeros((100,100,100),bool); meta={'origin_mm':[80,80,0],'pitch_mm':[.22,.22,.14666666666666667]}
        d=[{'id':'MINIL_DEMAND_target-flower-00001','target':b.ids[0],'role':'FLOWER','wanted_contacts':1,'z_mm':10,'candidates':[{'point_mm':[90,90,9],'normal':[0,0,-1]}]}]
        return c,b,occ,meta,d
    def test_real_generation_dispatched_nonempty(self):
        with tempfile.TemporaryDirectory() as tmp:
            c,b,o,m,d=self.fixture(tmp)
            stages=[Stage('recipe',lambda _:validate_recipe(c['recipe'],self.ownership())),
                    Stage('generate',lambda _:dict(status='PASS',result=generate(c,b,o,o,m,d,[])),('recipe',))]
            result=dispatch('MINIL','MINIL',stages,c)
            self.assertEqual(result[-1]['status'],'PASS'); self.assertGreater(c['generated']['mesh_count'],0)
            for row in c['generated']['objects']:
                self.assertEqual(c['kernel'].mesh_array_identity(c['out']/row['mesh']),row['mesh_identity'])
                if row['foot']: self.assertAlmostEqual(row['bbox_mm'][0][2],0)
    def test_nontarget_body_collision_rejects_route(self):
        with tempfile.TemporaryDirectory() as tmp:
            c,b,o,m,d=self.fixture(tmp,extra=True); result=generate(c,b,o,o,m,d,[])
            self.assertEqual(result['mesh_count'],0)
    def test_deterministic_geometry_readback(self):
        with tempfile.TemporaryDirectory() as a,tempfile.TemporaryDirectory() as b:
            results=[]
            for tmp in (a,b):
                c,body,o,m,d=self.fixture(tmp); results.append(generate(c,body,o,o,m,d,[]))
            self.assertEqual(results[0],results[1])
    def test_old_case_ids_and_completed_support_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            c,b,o,m,d=self.fixture(tmp)
            for old in ('A0341','N00224','X03795'):
                bad=copy.deepcopy(d);bad[0]['target']=old
                with self.assertRaisesRegex(ValueError,'UNBOUND_DEMAND'):validate_derived_inputs(b,bad,[],c)
            c['completed_support']=[]
            with self.assertRaisesRegex(ValueError,'OLD_COMPLETED'):validate_derived_inputs(b,d,[],c)
    def test_capsule_broadphase_preserves_true_intersection(self):
        with tempfile.TemporaryDirectory() as tmp:
            c,b,o,m,d=self.fixture(tmp);a=[90,90,0];z=[90,90,12];solid=c['kernel'].capsule(a,z,.6)
            hits=b.hits(solid,1e-6,capsule=(a,z,.6));self.assertEqual(hits[0]['id'],b.ids[0])
    def test_cut_neck_does_not_erase_embedded_fragment(self):
        with tempfile.TemporaryDirectory() as tmp:
            c,b,o,m,d=self.fixture(tmp);generate(c,b,o,o,m,d,[])
            result=evaluate(c,b);self.assertEqual(len(result['objects']),1)
            row=result['objects'][0];self.assertGreater(len(row['fragments']),1)
            self.assertFalse(row['all_fragments_removed_in_model'])
            self.assertTrue(result['remaining_obstacle_ids'])
            self.assertAlmostEqual(sum(f['volume_mm3'] for f in row['fragments']),c['generated']['objects'][0]['volume_mm3'],places=5)
            self.assertEqual(row['fragment_option_attempts'][0]['main_piece_option'],1)
            self.assertTrue(any(f.get('proof')=='INITIAL_INTERSECTION_CONTAINED_IN_EVERY_SWEEP' for f in row['fragments']))

if __name__=='__main__': unittest.main()
