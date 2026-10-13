import copy
import unittest
from tools.authored_support.stages.v4_removal import generate_removal, compare_removal
from tools.authored_support.contracts import ContractError
from tools.authored_support.stage_registry import resolve_stage
from tools.authored_support.source_io import read_json
from pathlib import Path

class RemovalContracts(unittest.TestCase):
    def test_registry_is_bound_to_original_algorithms(self):
        p=Path(__file__).resolve().parents[1]/'presets/minia_legacy_v1'
        case=read_json(p/'CASE.json');recipe=read_json(p/'RECIPE.json');source=read_json(p/'SOURCE_RULE_MAP.json')
        fn,holds=resolve_stage('V4_D2_REMOVAL',case=case,recipe=recipe,source_map=source)
        self.assertTrue(callable(fn));self.assertFalse(holds)
        recipe['stage_bindings']['V4_D2_REMOVAL']['source_code_sha256']={}
        fn,holds=resolve_stage('V4_D2_REMOVAL',case=case,recipe=recipe,source_map=source)
        self.assertIsNone(fn);self.assertTrue(holds)

    def test_invalid_ids_rejected_before_array_runtime(self):
        for candidates,body in [([],[]),([{'id':'x'},{'id':'x'}],[]),([{'id':'x','target':'missing'}],[{'id':'b'}])]:
            with self.assertRaises(ContractError):generate_removal(candidates,body,np=None)

    def test_exact_order_tool_direction_and_blocked_ids(self):
        expected={'sequence':[{'id':'a','tool_approach':[1.,0.,0.]},{'id':'b','tool_approach':[0.,1.,0.]}],'blocked_ids':['c'],'physical_evidence':False,'method':'historic duplicate notes'}
        actual=copy.deepcopy(expected);actual['method']='single execution notes'
        result=compare_removal(actual,expected)
        self.assertEqual(result['status'],'PASS');self.assertFalse(result['method_text_equal'])
        actual['sequence'].reverse();self.assertEqual(compare_removal(actual,expected)['status'],'HOLD')
        actual=copy.deepcopy(expected);actual['sequence'][0]['tool_approach'][0]+=1e-15
        self.assertEqual(compare_removal(actual,expected)['status'],'HOLD')
        actual=copy.deepcopy(expected);actual['blocked_ids']=[]
        self.assertEqual(compare_removal(actual,expected)['status'],'HOLD')

if __name__=='__main__':unittest.main()
