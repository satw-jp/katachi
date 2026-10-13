"""Imported legacy ports must not start generation or modify source files."""
import ast
import importlib
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


class PortImports(unittest.TestCase):
    def test_ports_import_without_generation_side_effects(self):
        stages = Path(__file__).resolve().parents[1] / 'stages'
        paths = sorted(p for p in stages.glob('legacy_*/*.py') if p.name != '__init__.py')
        self.assertGreater(len(paths), 20)
        old = sys.dont_write_bytecode
        sys.dont_write_bytecode = True
        try:
            with patch.object(Path, 'write_text', side_effect=AssertionError('import wrote text')), \
                 patch.object(Path, 'mkdir', side_effect=AssertionError('import created output')):
                for p in paths:
                    name = 'tools.authored_support.stages.' + p.parent.name + '.' + p.stem
                    module = importlib.import_module(name)
                    self.assertTrue(callable(getattr(module, 'run', getattr(module, 'make_context', None))))
        finally:
            sys.dont_write_bytecode = old

    def test_ports_have_no_dynamic_code_or_process_launch(self):
        stages = Path(__file__).resolve().parents[1] / 'stages'
        for p in stages.glob('legacy_*/*.py'):
            tree = ast.parse(p.read_text(encoding='utf-8'))
            for node in ast.walk(tree):
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                    self.assertNotIn(node.func.id, {'exec', 'eval', 'compile', '__import__'}, str(p))
                if isinstance(node, (ast.Import, ast.ImportFrom)):
                    names = [a.name for a in node.names] if isinstance(node, ast.Import) else [node.module or '']
                    self.assertFalse(any(n.split('.')[0] in {'subprocess', 'requests', 'socket', 'urllib'} for n in names), str(p))
