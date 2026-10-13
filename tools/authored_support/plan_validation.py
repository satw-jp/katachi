from collections import Counter
from .contracts import ContractError
from .rules.finalize import validate_support_references


def validate(plan, *, expected_kinds, flower_ids, permanent_ids):
    records = plan.get('objects')
    if not isinstance(records, list) or any(not isinstance(r, dict) or not r.get('id') for r in records):
        raise ContractError('Support records require nonempty IDs')
    kinds = dict(Counter(r.get('kind') for r in records))
    if set(kinds) - set(expected_kinds):
        raise ContractError('unknown Support kind')
    references = validate_support_references(plan, flower_ids=flower_ids, permanent_ids=permanent_ids)
    if not references['valid']:
        raise ContractError('Support duplicate ID or missing anchor/target')
    if kinds != expected_kinds:
        raise ContractError('fixed-case Support inventory mismatch')
    return dict(reference_check=references, kind_counts=kinds, physical_pass=False,
                historical_holds_preserved=True)
