import socket
import unittest
from pathlib import Path
from tools.authored_support.runtime_guard import offline
from tools.authored_support.contracts import ContractError
from test_v2_contracts import temporary_directory


class RuntimeGuard(unittest.TestCase):
    def test_network_is_rejected_before_lookup(self):
        with offline() as policy:
            with self.assertRaises(ContractError):
                socket.getaddrinfo('example.invalid', 443)
        self.assertEqual(policy['blocked_external_events'], 1)

    def test_generation_allowlist_and_source_write_protection(self):
        with temporary_directory() as d:
            source = Path(d)
            fixed = source / 'fixed.json'
            reference = source / 'support_geometry.json'
            fixed.write_text('{}')
            reference.write_text('{}')
            with offline(generation=True, source=source, allowed=[fixed]):
                self.assertEqual(fixed.read_text(), '{}')
                with self.assertRaises(ContractError):
                    reference.read_text()
                with self.assertRaises(ContractError):
                    fixed.write_text('changed')
            self.assertEqual(fixed.read_text(), '{}')

    def test_golden_read_is_forbidden_even_outside_source(self):
        with temporary_directory() as d:
            p = Path(d) / 'GOLDEN.json'
            p.write_text('{}')
            with offline(generation=True):
                with self.assertRaises(ContractError):
                    p.read_text()
            with offline():
                self.assertEqual(p.read_text(), '{}')

    def test_hidden_historical_tree_and_native_package_are_blocked(self):
        with temporary_directory() as d:
            root=Path(d);old=root/'historical';old.mkdir()
            p=old/'support_geometry.json';p.write_text('{}')
            native=root/'success.3mf';native.write_bytes(b'reference')
            with offline(generation=True, forbidden_roots=[old]):
                for f in [p,native]:
                    with self.assertRaises(ContractError):f.read_bytes()
