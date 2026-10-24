import json
import tempfile
import unittest
from pathlib import Path
import numpy as np
import trimesh
import manifold3d
from ...mesh_backend import ManifoldKernel
from ..construction import planar_foot,contact_parts
from ..recipe import candidate_recipe
from .light import rooted_volume,demands,write,sha,section
from .reuse import self_rooted,comparison
from .reuse import solid_sections
from .donors import Donors
from .order import ordered_demands
from .before_cache import seal,load as load_before
from .graph import unbraced_intervals,independent_roots
from ...stages.v4_d2 import _section_pixels

class ReuseTests(unittest.TestCase):
    def setUp(self):self.k=ManifoldKernel(np,trimesh,manifold3d);self.g=candidate_recipe()['geometry']
    def same(self,a,b):
        x=a.to_mesh();y=b.to_mesh()
        np.testing.assert_array_equal(x.vert_properties,y.vert_properties)
        np.testing.assert_array_equal(x.tri_verts,y.tri_verts)
    def test_v2_foot_exact_arrays(self):
        xy=np.array([5.,7.]);g=self.g;m=trimesh.creation.cylinder(radius=g['foot_radius'],height=g['foot_height'],sections=24)
        self.same(planar_foot(self.k,np,xy,g),self.k.man(m.vertices+np.r_[xy,g['foot_height']/2],m.faces))
    def test_compact_section_bit_exact(self):
        for a,b in [([10,12,.3],[12,15,7]),([.1,.1,0],[.2,.3,3]),([25,18,1],[18,29,9])]:
            mesh=self.k.capsule(a,b,.7).to_mesh();tri=mesh.vert_properties[:,:3][mesh.tri_verts].astype(float)
            lo=tri[:,:,2].min(1);hi=tri[:,:,2].max(1)
            for z in np.arange(.073,9,.1466666667):
                args=(tri,lo,hi,z,np.array([0.,0.]),.22,np.array([180,180]),np)
                np.testing.assert_array_equal(_section_pixels(*args),_section_pixels(*args,compact=True))
    def test_v2_main_neck_exact_arrays(self):
        p=np.array([5.,7.,25.]);n=np.array([0.,0.,-1.]);a=np.array([5.,7.,.6]);g=self.g
        main,neck,end,tip=contact_parts(self.k,np,p,n,a,g)
        self.same(main,self.k.capsule(a,p+n*g['neck_offset'],g['shaft_radius']))
        self.same(neck,self.k.capsule(p+n*g['neck_offset'],p-n*g['neck_overlap'],g['neck_radius']))
    def test_future_component_not_rooted(self):
        v=np.zeros((4,10,10),bool);v[:,2,2]=True;v[1:,7,7]=True
        h=rooted_volume(v);self.assertFalse(h[:,7,7].any());self.assertTrue(h[:,2,2].all())
    def test_shared_root_is_one(self):self.assertEqual(independent_roots([['base'],['base']]),1)
    def test_target_side_brace_height(self):
        gaps=unbraced_intervals(0,77,[[.8,2.8],[27,28],[52,53]])
        self.assertEqual(gaps,[[0,.8],[2.8,27],[28,52],[53,77]])
    def test_support_first_section_cannot_float(self):
        self.assertFalse(self_rooted({1:np.array([3]),2:np.array([3])}))
        self.assertFalse(self_rooted({0:np.array([3]),1:np.array([9])}))
        self.assertTrue(self_rooted({0:np.array([3]),1:np.array([3,4])}))
    def test_all_later_petals_after_contact_quota(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);data=np.array([[0,0,11],[0,1,11],[0,1,77],[0,2,11],[0,2,77],[0,2,55]],np.int32)
            np.savez_compressed(p/'p.npz',data=data)
            write(p/'SOURCE.json',dict(parts=[dict(id='arbitrary',name='flower',file='p.npz')],shape=[10,10],dz_mm=.1,zmax_mm=50))
            h=np.zeros((3,10,10),bool);h[:,1,1]=True
            events,cc=demands(p,h)
            births=[e for e in events if e['category']=='INDEPENDENT_BIRTH']
            self.assertEqual(len(births),2)
            self.assertEqual([e['section'] for e in births],[1,2])
            # Renaming source parts never changes geometry selection.
            obj=json.loads((p/'SOURCE.json').read_text());obj['parts'][0]['id']='different';write(p/'SOURCE.json',obj)
            second,_=demands(p,h)
            self.assertEqual([e['coverage'] for e in events],[e['coverage'] for e in second])
    def test_healthy_control(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);np.savez_compressed(p/'p.npz',data=np.array([[0,0,11],[0,1,11]]))
            write(p/'SOURCE.json',dict(parts=[dict(id='x',name='control',file='p.npz')],shape=[10,10],dz_mm=.1,zmax_mm=50))
            h=np.zeros((2,10,10),bool);h[:,1,1]=True
            self.assertEqual(demands(p,h)[0],[])
    def test_old_thresholds_do_not_change_construction(self):
        for z in [25.6,25.7,30.,40.3,40.4]:
            main,neck,_,_=contact_parts(self.k,np,np.array([5.,7.,z]),np.array([0,0,-1]),np.array([5.,7.,self.g['shaft_radius']]),self.g)
            self.assertGreater(main.volume(),0);self.assertGreater(neck.volume(),0)
    def test_source_hash_changes(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'source';p.write_bytes(b'precise');a=sha(p);p.write_bytes(b'light');self.assertNotEqual(a,sha(p))
    def test_no_count_only_success(self):
        before=[dict(id='a',coverage=0),dict(id='b',coverage=.2)];after=[dict(id='b',coverage=.5)]
        s=comparison(before,after);self.assertEqual(s['resolved_original_events'],1);self.assertEqual(s['improved_original_events'],1)
    def test_existing_shaft_route_requires_preceding_donor(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);g=self.g;a=np.array([4.,5.,g['shaft_radius']]);b=np.array([4.,5.,9.])
            solid=self.k.union([self.k.capsule(a,b,g['shaft_radius']),planar_foot(self.k,np,a[:2],g)])
            mesh=root/'donor.npz';self.k.store(mesh,solid)
            row=dict(id='arbitrary-donor',kind='EXTERIOR_COLUMN',foot=True,points_mm=[a,b],mesh=mesh.name,mesh_identity=self.k.mesh_array_identity(mesh))
            write(root/'base.json',dict(objects=[row]));write(root/'delta.json',dict(additions=[]))
            write(root/'spec.json',dict(support_ledger=dict(path=str(root/'base.json'),sha256=sha(root/'base.json')),
                c_additions=dict(path=str(root/'delta.json'),sha256=sha(root/'delta.json')),common_xy_mm=[0,0]))
            source=dict(recipe=candidate_recipe(),dz_mm=g['grid_z'],pitch_mm=g['grid_xy'],nz=75,shape=[64,64],origin_mm=[0,0])
            occ=np.zeros((75,64,64),bool)
            for iz,cc in solid_sections(solid,source).items():occ[iz].ravel()[cc]=True
            donor=Donors(root/'spec.json',self.k,source,solid_sections);p=np.array([5.5,5,8.]);n=np.array([0,0,-1.])
            result=donor.try_route(p,n,g,occ,np.zeros_like(occ),rooted_volume(occ),solid_sections,[])
            self.assertIsNotNone(result);self.assertGreater(result['donor_contact_volume_mm3'],0)
            self.assertIsNone(donor.try_route(p,n,g,occ,np.zeros_like(occ),np.zeros_like(occ),solid_sections,[]))
    def test_search_budget_covers_all_height_bands(self):
        events=[dict(id=str(i),category='INDEPENDENT_BIRTH',part_name='FLOWERS',cad_z_mm=2+i*.001) for i in range(300)]
        events += [dict(id='high'+str(z),category='INDEPENDENT_BIRTH',part_name='FLOWERS',cad_z_mm=z) for z in (7,12,17,22,27,32,37,42,47)]
        first=list(ordered_demands(events))[:10]
        self.assertEqual({int(e['cad_z_mm']//5) for e in first},set(range(10)))
        self.assertEqual(len(list(ordered_demands(events))),len(events))
    def test_precise_to_light_invalidates_completed_detection(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);cache=root/'cache';cache.mkdir();run=root/'run';run.mkdir()
            source=dict(sha256='precise',dz_mm=.1,zmax_mm=50)
            write(cache/'SOURCE.json',source)
            write(run/'LOWZ_DEMANDS_BEFORE.json',dict(source_sha256='precise',events=[dict(section=1,cad_z_mm=.15000000000000002)]))
            np.savez_compressed(run/'DEMAND_FOOTPRINTS.npz',offsets=[0,1],cells=[1])
            seal(cache,run);self.assertEqual(len(load_before(cache,run)[0]),1)
            source['sha256']='light';write(cache/'SOURCE.json',source)
            with self.assertRaisesRegex(ValueError,'STALE_BEFORE_CACHE'):load_before(cache,run)
    def test_open_contour_cannot_create_receivers_to_frame_edge(self):
        box=trimesh.creation.box(extents=[2,2,2]);box.apply_translation([10,10,1])
        closed=np.array(box.vertices)[np.array(box.faces)]
        self.assertGreater(len(section(closed,1.1,np.array([0.,0.]),.22,[100,100])),0)
        opened=closed[np.array(box.face_normals)[:,0]<.9]
        args=(opened,opened[:,:,2].min(1),opened[:,:,2].max(1),1.1,np.array([0.,0.]),.22,np.array([100,100]),np)
        np.testing.assert_array_equal(_section_pixels(*args),_section_pixels(*args,compact=True))
        with self.assertRaisesRegex(ValueError,'OPEN_SECTION_CONTOUR'):
            section(opened,1.1,np.array([0.,0.]),.22,[100,100])

if __name__=='__main__':unittest.main()
