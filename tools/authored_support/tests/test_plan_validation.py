import unittest
from tools.authored_support.plan_validation import validate
from tools.authored_support.contracts import ContractError


class PlanValidation(unittest.TestCase):
    def test_unknown_kind_and_reference_fail_closed(self):
        kwargs=dict(expected_kinds={'known':1}, flower_ids={'F1'}, permanent_ids=set())
        valid={'id':'s', 'kind':'known', 'target':'F1', 'anchor':'BED'}
        self.assertFalse(validate({'objects':[valid]}, **kwargs)['physical_pass'])
        for change in [{'kind':'invented'}, {'target':'missing'}, {'id':''}]:
            with self.assertRaises(ContractError):
                validate({'objects':[dict(valid, **change)]}, **kwargs)
        with self.assertRaises(ContractError):
            validate({'objects':[valid, valid]}, **dict(kwargs, expected_kinds={'known':2}))
