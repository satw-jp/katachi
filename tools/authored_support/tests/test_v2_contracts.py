import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from tools.authored_support.source_io import check_asset, read_locked_json
from tools.authored_support.contracts import ContractError
from tools.authored_support.compare import compare_support

def temporary_directory():
    root=Path(__file__).resolve().parents[3]/'work/authored_support_test_temp'
    root.mkdir(parents=True,exist_ok=True)
    return tempfile.TemporaryDirectory(dir=root)


class V2Contracts(unittest.TestCase):
    def test_empty_malformed_sha_never_passes(self):
        with temporary_directory() as d:
            p=Path(d)/'input.json';p.write_text('{}')
            for value in [None,'','g'*64,'a'*63,'a'*65,64]:
                r=check_asset(dict(root='r',path=p.name,sha256=value),{'roots':{'r':d}})
                self.assertEqual(r['reason'],'EXPECTED_SHA256_INVALID')

    def test_descriptor_hash_before_parse(self):
        with temporary_directory() as d:
            p=Path(d)/'golden.json';p.write_text('{invalid')
            with self.assertRaisesRegex(ContractError,'SHA256 mismatch'):
                read_locked_json(p,'0'*64)
            p.write_text('{}')
            self.assertEqual(read_locked_json(p,hashlib.sha256(p.read_bytes()).hexdigest()),{})

    def test_order_is_required(self):
        a={'objects':[{'id':'a'},{'id':'b'}]}
        b={'objects':list(reversed(a['objects']))}
        self.assertFalse(compare_support(a,b)['plan_equal'])

if __name__=='__main__': unittest.main()
