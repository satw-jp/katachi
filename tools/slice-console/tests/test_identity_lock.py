"""Small explicit files only; all lock calls prohibit process/generator/discovery."""
import copy
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from identity_lock import build_lock, verify_lock, receipt_sha256, validate_plan, CHUNK_SIZE

def sha(data):
    return hashlib.sha256(data).hexdigest()

def fixture_plan(root):
    groups = []
    for kind, names in (("engine", ["bambu-studio.exe"]), ("resources", ["resources/default.json"]),
                        ("backend", ["job.py", "runner.py", "progress.py"])):
        entries = []
        for name in names:
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            data = ("synthetic " + name).encode()
            path.write_bytes(data)
            entries.append({"logical_name":name,"source_path":str(path),
                            "role":"executable" if kind == "engine" else "source" if kind == "backend" else "config",
                            "required":True,"expected_sha256":sha(data)})
        groups.append({"identity_kind":kind,
            "metadata":{"declared_version":"fixture-1","platform_abi":"fixture-abi"} if kind == "engine" else {},
            "closure_policy":{"version":"0.1","policy_id":"synthetic-explicit-closed-set",
                              "sha256":sha(b"synthetic closure policy 0.1"),"status":"COMPLETE",
                              "path_semantics":"INSENSITIVE","unresolved":[]},
            "entries":entries})
    return {"schema_version":"0.1","allowed_roots":[str(root)],"groups":groups}

class IdentityLockTests(unittest.TestCase):
    def setUp(self):
        self.temp = self.enterContext(tempfile.TemporaryDirectory())
        self.root = Path(self.temp)
        self.plan = fixture_plan(self.root)
        self.launch = self.enterContext(patch("subprocess.Popen",side_effect=AssertionError("process launch")))
        self.enterContext(patch("os.walk",side_effect=AssertionError("discovery")))
        self.enterContext(patch("pathlib.Path.rglob",side_effect=AssertionError("discovery")))
        self.enterContext(patch("slice_key.generate_key",side_effect=AssertionError("generator integration")))

    def tearDown(self):
        self.assertEqual(self.launch.call_count,0)

    def build(self, plan=None, **kwargs):
        return build_lock(self.plan if plan is None else plan, **kwargs)

    def verify(self, receipt, plan=None, **kwargs):
        return verify_lock(self.plan if plan is None else plan, receipt,
                           expected_receipt_sha256=receipt_sha256(receipt), **kwargs)

    def hold(self, result, code):
        self.assertEqual(result["status"],"HOLD")
        self.assertFalse(result["verified"])
        self.assertEqual(result["CLOSURE_STATUS"],"INCOMPLETE")
        self.assertIsNone(result["logical_identity"])
        self.assertIsNone(result["identity_sha256"])
        self.assertIn(code,[x["code"] for x in result["blockers"]])

    def test_pass_build_then_independent_rehash(self):
        before = copy.deepcopy(self.plan)
        receipt,built = self.build()
        self.assertIsInstance(receipt,str)
        self.assertEqual(built["status"],"LOCK_CREATED")
        self.assertFalse(built["verified"])
        checked = self.verify(receipt)
        self.assertEqual(checked["status"],"VERIFIED")
        self.assertTrue(checked["verified"])
        self.assertEqual(built["identity_sha256"],checked["identity_sha256"])
        self.assertTrue(all(r["status"] == "VERIFIED" for r in checked["files"]))
        self.assertEqual(self.plan,before)

    def test_relocation_same_identity_different_provenance(self):
        receipt,built = self.build()
        relocated = fixture_plan(self.root / "relocated")
        second,b2 = self.build(relocated)
        checked = self.verify(receipt,relocated)
        self.assertTrue(checked["verified"],checked["blockers"])
        self.assertEqual(built["identity_sha256"],b2["identity_sha256"])
        self.assertEqual(built["binding_sha256"],b2["binding_sha256"])
        self.assertNotEqual(built["plan_sha256"],b2["plan_sha256"])
        self.assertNotEqual(receipt_sha256(receipt),receipt_sha256(second))

    def test_one_byte_content_change(self):
        receipt,built = self.build()
        entry = self.plan["groups"][1]["entries"][0]
        path = Path(entry["source_path"])
        data = path.read_bytes()
        path.write_bytes(data[:-1]+b"!")
        self.hold(self.verify(receipt),"MISMATCH")
        entry["expected_sha256"] = None
        _,new = self.build()
        self.assertNotEqual(built["identity_sha256"],new["identity_sha256"])

    def test_required_missing(self):
        Path(self.plan["groups"][0]["entries"][0]["source_path"]).unlink()
        _,result = self.build()
        self.hold(result,"MISSING")

    def test_optional_missing_is_not_complete_identity(self):
        entry = self.plan["groups"][1]["entries"][0]
        entry["required"] = False
        Path(entry["source_path"]).unlink()
        _,result = self.build()
        self.hold(result,"MISSING")
        self.assertEqual(result["diagnostic_identity"]["label"],"partial / non-reusable")

    def test_wrong_expected_hash(self):
        self.plan["groups"][0]["entries"][0]["expected_sha256"] = "0"*64
        receipt,result = self.build()
        self.hold(result,"MISMATCH")
        self.hold(self.verify(receipt),"INCOMPLETE_BASELINE")

    def test_unknown_expected_hash_pins_observed_bytes(self):
        for g in self.plan["groups"]:
            for e in g["entries"]:
                e["expected_sha256"] = None
        receipt,built = self.build()
        self.assertEqual(built["FILES_STATUS"],"HASHED")
        self.assertTrue(self.verify(receipt)["verified"])

    def test_streaming_fixed_chunks(self):
        entry = self.plan["groups"][0]["entries"][0]
        path = Path(entry["source_path"])
        data = b"a"*(CHUNK_SIZE*2+7)
        path.write_bytes(data)
        entry["expected_sha256"] = sha(data)
        chunks = []
        receipt,built = self.build(read_hook=lambda p,n: chunks.append(n) if p == path else None)
        self.assertEqual(chunks,[CHUNK_SIZE,CHUNK_SIZE*2,CHUNK_SIZE*2+7])
        self.assertEqual(built["files"][0]["observed_bytes"],len(data))
        self.assertTrue(self.verify(receipt)["verified"])

    def test_changed_during_read(self):
        entry = self.plan["groups"][0]["entries"][0]
        target = Path(entry["source_path"])
        changed = []
        def hook(path,count):
            if path == target and not changed:
                changed.append(True)
                with path.open("ab") as stream:
                    stream.write(b"changed")
        _,result = self.build(read_hook=hook)
        self.hold(result,"CHANGED_DURING_READ")
        row = result["files"][0]
        self.assertIsNone(row["sha256"])

    def test_mtime_change_during_read(self):
        target = Path(self.plan["groups"][0]["entries"][0]["source_path"])
        def hook(path,count):
            if path == target:
                info = path.stat()
                os.utime(path,ns=(info.st_atime_ns,info.st_mtime_ns+1000000000))
        _,result = self.build(read_hook=hook)
        self.hold(result,"CHANGED_DURING_READ")

    def test_duplicate_logical_name(self):
        entries = self.plan["groups"][2]["entries"]
        entries.append(copy.deepcopy(entries[0]))
        receipt,result = self.build()
        self.assertIsNone(receipt)
        self.hold(result,"DUPLICATE_LOGICAL_NAME")

    def test_traversal_and_outside_policy(self):
        for field,value,code in (("logical_name","../a","INVALID_LOGICAL_NAME"),
                                 ("logical_name","C:/a","INVALID_LOGICAL_NAME"),
                                 ("source_path",str(self.root.parent / "outside"),"OUTSIDE_POLICY"),
                                 ("source_path",str(self.root / ".." / "outside"),"TRAVERSAL"),
                                 ("source_path","relative.exe","ABSOLUTE_PATH_REQUIRED")):
            plan = copy.deepcopy(self.plan)
            plan["groups"][0]["entries"][0][field] = value
            with self.subTest(field=field,value=value):
                receipt,result = self.build(plan)
                self.assertIsNone(receipt)
                self.hold(result,code)

    def test_reparse_junction_blocked_before_open(self):
        # Platform-independent synthetic metadata hook exercises Windows reparse bit.
        target = Path(self.plan["groups"][0]["entries"][0]["source_path"])
        original = Path.lstat
        class Reparse:
            st_mode = 0
            st_file_attributes = 0x400
        def lstat(path,*args,**kwargs):
            return Reparse() if path == target.parent else original(path,*args,**kwargs)
        with patch("pathlib.Path.lstat",lstat):
            _,result = self.build()
        self.hold(result,"LINK_OR_REPARSE_POINT")

    def test_symlink_blocked_before_open(self):
        target = Path(self.plan["groups"][0]["entries"][0]["source_path"])
        original = Path.lstat
        class Symlink:
            st_mode = 0o120777
            st_file_attributes = 0
        with patch("pathlib.Path.lstat",lambda p,*a,**kw: Symlink() if p == target else original(p,*a,**kw)):
            _,result = self.build()
        self.hold(result,"LINK_OR_REPARSE_POINT")

    def test_unexpected_resolution(self):
        original = Path.resolve
        target = Path(self.plan["groups"][0]["entries"][0]["source_path"])
        with patch("pathlib.Path.resolve",lambda p,*a,**kw: self.root/"unexpected" if p == target else original(p,*a,**kw)):
            _,result = self.build()
        self.hold(result,"UNEXPECTED_PATH_RESOLUTION")

    def test_incomplete_closure_even_when_every_hash_matches(self):
        group = self.plan["groups"][2]
        group["closure_policy"]["status"] = "INCOMPLETE"
        group["closure_policy"]["unresolved"] = ["Python runtime/stdlib not locked"]
        receipt,result = self.build()
        self.hold(result,"CLOSURE_INCOMPLETE")
        self.assertEqual(result["FILES_STATUS"],"HASHED")
        checked = self.verify(receipt)
        self.hold(checked,"CLOSURE_INCOMPLETE")
        self.assertEqual(checked["FILES_STATUS"],"VERIFIED")

    def test_unresolved_path_semantics(self):
        self.plan["groups"][0]["closure_policy"]["path_semantics"] = "UNRESOLVED"
        _,result = self.build()
        self.hold(result,"PATH_SEMANTICS_UNRESOLVED")

    def test_backend_needs_direct_progress_dependency(self):
        self.plan["groups"][2]["entries"].pop()
        receipt,result = self.build()
        self.assertIsNone(receipt)
        self.hold(result,"MISSING_BACKEND_SOURCE")

    def test_receipt_integrity_and_binding(self):
        receipt,_ = self.build()
        result = verify_lock(self.plan,receipt+" ",expected_receipt_sha256=receipt_sha256(receipt))
        self.hold(result,"RECEIPT_DIGEST_MISMATCH")
        self.plan["groups"][0]["metadata"]["declared_version"] = "changed"
        self.hold(self.verify(receipt),"LOCK_BINDING_MISMATCH")

    def test_plan_expected_hash_conflict(self):
        receipt,_ = self.build()
        self.plan["groups"][0]["entries"][0]["expected_sha256"] = "1"*64
        self.hold(self.verify(receipt),"EXPECTED_HASH_CONFLICT")

    def test_version_duplicate_and_nonfinite_errors(self):
        self.plan["schema_version"] = "unknown"
        _,result = self.build()
        self.hold(result,"UNSUPPORTED_SCHEMA")
        for raw in ('{"schema_version":"0.1","schema_version":"0.1"}', '{"n":NaN}'):
            _,result = self.build(raw)
            self.assertEqual(result["status"],"HOLD")

    def test_metadata_and_logical_order(self):
        receipt,a = self.build()
        self.plan["groups"].reverse()
        for group in self.plan["groups"]:
            group["entries"].reverse()
        _,b = self.build()
        self.assertEqual(a["identity_sha256"],b["identity_sha256"])
        self.assertTrue(self.verify(receipt)["verified"])
        self.assertTrue(all(row["before"] == row["after"] for row in b["files"]))

if __name__ == "__main__":
    unittest.main()
