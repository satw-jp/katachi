import json
from pathlib import Path
import unittest
from unittest.mock import patch
from tools.authored_support.cli import _replay
from test_v2_contracts import temporary_directory


class ReplayDispatch(unittest.TestCase):
    def test_replay_calls_verification_only_after_build_and_uses_requested_golden(self):
        with temporary_directory() as d:
            root=Path(d);roots=root/'ROOTS.json';roots.write_text('{"roots":{}}')
            case=root/'preset/CASE.json';golden=root/'reference/GOLDEN.json'
            for build_code,verify_code,expected in [(0,0,0),(0,2,2),(2,0,2)]:
                out=root/f'run_{build_code}_{verify_code}'
                with patch('tools.authored_support.cli._build',return_value=build_code), \
                     patch('tools.authored_support.cli._verify',return_value=verify_code) as verify:
                    self.assertEqual(_replay(case,roots,out,golden),expected)
                    if build_code==0:
                        verify.assert_called_once_with(out/'build',golden,roots,out/'verify')
                    else:
                        verify.assert_not_called()
                result=json.loads((out/'REPLAY.json').read_text())
                self.assertEqual(result['status'],'PASS' if expected==0 else 'HOLD')
                self.assertIn(result['stop'],(out/'RESULT.md').read_text())
