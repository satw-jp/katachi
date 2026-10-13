"""Bounded negative gates and reproducible MINIL geometry identity tests."""
import tempfile
import unittest
from pathlib import Path
import numpy as np
from .adapter import array_semantic, check_ranges, mesh_semantic, validate_output_destination, build_support
from .dispatch import Stage, dispatch

class AdapterGates(unittest.TestCase):
    def test_cross_case_refused_before_stage(self):
        calls=[]
        with self.assertRaisesRegex(ValueError,"CASE_ID"):
            dispatch("MINIA","MINIL",[Stage("a",lambda c:calls.append(1))],{})
        self.assertEqual(calls,[])

    def test_dependency_hold_does_not_execute_mesh_builder(self):
        calls=[]
        result=dispatch("x","x",[Stage("recipe",lambda c:{"status":"HOLD"}),
            Stage("mesh",lambda c:calls.append(1),("recipe",))],{})
        self.assertEqual(result[-1]["status"],"HOLD")
        self.assertEqual(calls,[])

    def test_unbound_builder_cannot_pass(self):
        self.assertEqual(build_support({})["status"],"HOLD")

    def test_source_overlap_rejected_both_directions(self):
        with tempfile.TemporaryDirectory() as tmp:
            source=Path(tmp)/"source"
            with self.assertRaisesRegex(ValueError,"OUTPUT_OVERLAPS_SOURCE"):
                validate_output_destination(source/"out",[source])
            with self.assertRaisesRegex(ValueError,"OUTPUT_OVERLAPS_SOURCE"):
                validate_output_destination(source,[source/"inputs"])

    def test_existing_output_never_overwritten(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError,"OUTPUT_ALREADY_EXISTS"):
                validate_output_destination(tmp,[])

    def test_extra_minia_scaling_changes_semantic(self):
        a={"position":np.array([[1.,2.,3.]]),"scale":np.array([1.])}
        b={k:v*11/15 for k,v in a.items()}
        self.assertNotEqual(array_semantic(a,np),array_semantic(b,np))

    def test_semantic_independent_of_mapping_order(self):
        a={"z":np.array([1.]),"a":np.array([2],np.int32)}
        self.assertEqual(array_semantic(a,np),array_semantic(dict(reversed(list(a.items()))),np))

    def test_cross_member_faces_rejected(self):
        mesh={"vertices":np.array([[0.,0.,0.],[1.,0.,0.],[0.,1.,0.],[2.,2.,2.]]),
            "faces":np.array([[0,1,3]]),"vertex_offsets":[0,3,4],"face_offsets":[0,1,1]}
        rows=[{"vertex_range":[0,3],"face_range":[0,1]},{"vertex_range":[3,4],"face_range":[1,1]}]
        with self.assertRaisesRegex(ValueError,"CROSS_MEMBER_FACE"):
            check_ranges(rows,mesh,np)

    def test_canonical_mesh_detects_displacement(self):
        v=np.array([[0.,0.,0.],[1.,0.,0.],[0.,1.,0.]])
        f=np.array([[0,1,2]])
        self.assertNotEqual(mesh_semantic(v,f,np),mesh_semantic(v+0.01,f,np))
        self.assertEqual(mesh_semantic(v,f,np),mesh_semantic(v[[1,2,0]],np.array([[2,0,1]]),np))

if __name__=="__main__":
    unittest.main()
