import copy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np
import engine
from internal import geometry
from metadata import structure_digest, validate_mesh

class MetadataTests(unittest.TestCase):
    def fixture(self, root):
        v=np.array([[0,0,0],[1,0,0],[0,1,0]], dtype=np.float32)
        f=np.array([[0,1,2]], dtype=np.uint32)
        m=dict(id='a', parent_id='root', main_diameter_mm=2.2, terminal_diameter_mm=1.1,
               points_mm=[[0,0,0],[0,0,1]], mesh_geometry_sha256=geometry.canonical_mesh_digest(v,f))
        arrays=geometry._mesh_archive([m], {'a':(v,f)})
        p=root/'MEMBER_MESHES.npz'; np.savez_compressed(p, **arrays)
        s=dict(members=[m],member_count=1,mesh_archive=dict(vertex_count=3,triangle_count=1),
               structure_semantic_sha256=structure_digest([m]),diameter_main_mm=2.2,centerline_semantic_sha256='center')
        return p,s,(v,f)

    def test_semantics_counts_offsets_and_corruption(self):
        with tempfile.TemporaryDirectory() as d:
            p,s,_=self.fixture(Path(d)); validate_mesh(s,p)
            changed=copy.deepcopy(s);changed['members'][0]['parent_id']='another'
            self.assertNotEqual(structure_digest(changed['members']),s['structure_semantic_sha256'])
            for field in ('count','digest','range'):
                bad=copy.deepcopy(s)
                if field=='count': bad['mesh_archive']['vertex_count']=4
                elif field=='digest': bad['structure_semantic_sha256']='bad'
                else: bad['members'][0]['mesh_vertex_range']=[0,2]
                with self.assertRaises(ValueError): validate_mesh(bad,p)

    def test_generate_publish_uses_npz_and_semantic_definition(self):
        with tempfile.TemporaryDirectory() as d:
            project=Path(d); baseline=project/'layouts/large-flower/baseline';baseline.mkdir(parents=True)
            _,s,arrays=self.fixture(baseline)
            engine.write(baseline/'STRUCTURE.json',s)
            engine.write(baseline/'CONTACT_AUDIT.json',dict(checked_relationships=[]))
            surf=baseline.parent/'surface';surf.mkdir()
            engine.write(surf/'surface.json',dict(count=1,semantic_geometry_sha256='surface'))
            def materialize(m):
                m['mesh_geometry_sha256']=geometry.canonical_mesh_digest(*arrays)
                return None,*arrays,None
            with patch.object(engine,'validate_assets'), patch.object(engine,'context',return_value=dict(d6_path='unused',placements={},flower_ids=[])), patch.object(engine.surface,'load_mesh',return_value=arrays), patch.object(geometry,'FlowerGeometry'), patch.object(geometry,'_materialize',side_effect=materialize):
                result=engine.generate(project,dict(flowerScale=1,diameter=2.4),'b'*32)
            actual=engine.read(project/result['structure']);validate_mesh(actual,project/result['mesh'])
            self.assertEqual(result['meshHash'],structure_digest(actual['members']))

if __name__=='__main__': unittest.main()
