"""Executable contract vectors: synthetic identity assertions only."""
import copy
from decimal import Decimal, localcontext
import hashlib
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from slice_key import generate_key, canonical_decimal, _serialize, InvalidDescriptor

FIXTURES = Path(__file__).parent / "fixtures" / "slice_key"


class SliceKeyTests(unittest.TestCase):
    def setUp(self):
        self.goldens = {}
        for name in ("base", "unicode"):
            self.goldens[name] = (
                (FIXTURES / (name + ".descriptor.json")).read_bytes(),
                (FIXTURES / (name + ".canonical.json")).read_bytes(),
                json.loads((FIXTURES / (name + ".expected.json")).read_bytes()))
        self.base = json.loads(self.goldens["base"][0])
        # All generator invocations below are forbidden from opening files,
        # discovering dependencies or starting any engine/process.
        self.launches = self.enterContext(patch("subprocess.Popen", side_effect=AssertionError("process launch")))
        self.enterContext(patch("builtins.open", side_effect=AssertionError("filesystem I/O")))
        self.enterContext(patch("io.open", side_effect=AssertionError("filesystem I/O")))
        self.enterContext(patch("os.walk", side_effect=AssertionError("filesystem discovery")))
        self.reference = generate_key(self.base)
        self.assertEqual(self.reference["KEY_STATUS"], "COMPLETE")

    def tearDown(self):
        self.assertEqual(self.launches.call_count, 0)

    def same(self, descriptor):
        result = generate_key(descriptor)
        self.assertEqual(result["KEY_STATUS"], "COMPLETE", result["blockers"])
        self.assertEqual(result["CANONICAL_BYTES"], self.reference["CANONICAL_BYTES"])
        self.assertEqual(result["SLICE_KEY"], self.reference["SLICE_KEY"])
        return result

    def different(self, descriptor):
        result = generate_key(descriptor)
        self.assertEqual(result["KEY_STATUS"], "COMPLETE", result["blockers"])
        self.assertNotEqual(result["CANONICAL_BYTES"], self.reference["CANONICAL_BYTES"])
        self.assertNotEqual(result["SLICE_KEY"], self.reference["SLICE_KEY"])

    def hold(self, descriptor, code=None):
        result = generate_key(descriptor)
        self.assertEqual(result["KEY_STATUS"], "INCOMPLETE")
        self.assertEqual(result["status"], "HOLD")
        for field in ("SLICE_KEY", "CANONICAL_INPUT_DIGESTS", "CANONICAL_TREE", "CANONICAL_BYTES"):
            self.assertIsNone(result[field])
        self.assertTrue(result["blockers"])
        self.assertEqual(result["blockers"], sorted(result["blockers"], key=lambda x: (x["code"], x["pointer"])))
        if code:
            self.assertIn(code, [b["code"] for b in result["blockers"]])
        return result

    def test_golden_artifacts(self):
        for name, (raw, canonical, expected) in self.goldens.items():
            with self.subTest(name=name):
                result = generate_key(raw)
                self.assertEqual(result["KEY_STATUS"], "COMPLETE", result["blockers"])
                self.assertEqual(result["CANONICAL_BYTES"], canonical)
                self.assertEqual(hashlib.sha256(canonical).hexdigest(), expected["sha256"])
                self.assertEqual(result["SLICE_KEY"], expected["slice_key"])
                self.assertFalse(canonical.startswith(b"\xef\xbb\xbf"))
                self.assertFalse(canonical.endswith(b"\n"))

    def test_s01_relocation(self):
        for k in ("job_id", "request_id", "output_dir", "run_dir", "engine_path", "cwd_path"):
            self.base["provenance"][k] = "/other/" + k
        self.base["provenance"]["input_paths"] = ["/other/a.stl", "/other/b.stl"]
        self.base["provenance"]["profile_paths"] = ["/other/profiles/printer.json"]
        self.same(self.base)

    def test_d01_geometry_byte(self):
        # Independent synthetic bytes with a one-byte difference.
        self.base["identity"]["inputs"][0]["sha256"] = hashlib.sha256(b"synthetic geometry permanenU").hexdigest()
        self.different(self.base)

    def test_d02_placement(self):
        self.base["identity"]["inputs"][0]["placement"]["value"]["translation_mm"][0] = "1"
        self.different(self.base)

    def test_d03_process(self):
        self.base["identity"]["profiles"]["process"]["sha256"] = "1" * 64
        self.different(self.base)

    def test_d04_printer(self):
        self.base["identity"]["profiles"]["printer"]["sha256"] = "2" * 64
        self.different(self.base)

    def test_d05_filament(self):
        self.base["identity"]["profiles"]["filaments"][0]["sha256"] = "3" * 64
        self.different(self.base)

    def test_d06_mapping(self):
        self.base["identity"]["profiles"]["filament_mapping"][1] = "2"
        self.different(self.base)

    def test_d07_nozzle(self):
        self.base["identity"]["profiles"]["nozzle"] = "0.6"
        self.different(self.base)

    def test_d08_semantic_argv(self):
        self.base["identity"]["execution"]["argv"][2]["value"] = "1"
        self.different(self.base)

    def test_d09_engine(self):
        self.base["identity"]["engine"]["executable_sha256"] = "4" * 64
        self.different(self.base)

    def test_d10_resource(self):
        self.base["identity"]["engine"]["resource_manifest"]["entries"][0]["sha256"] = "5" * 64
        self.different(self.base)

    def test_d11_ordered_slots(self):
        for field in ("inputs", "filaments", "argv"):
            descriptor = copy.deepcopy(self.base)
            if field == "inputs":
                arr = descriptor["identity"]["inputs"]
                arr.reverse()
                for i, x in enumerate(arr):
                    x["slot"] = str(i)
            elif field == "filaments":
                descriptor["identity"]["profiles"]["filaments"].reverse()
            else:
                arr = descriptor["identity"]["execution"]["argv"]
                arr[-2], arr[-1] = arr[-1], arr[-2]
            with self.subTest(field=field):
                self.different(descriptor)

    def test_n01_output(self):
        self.base["provenance"]["output_dir"] = "/changed"
        self.same(self.base)

    def test_n02_timestamp(self):
        self.base["provenance"]["timestamp"] = "later"
        self.same(self.base)

    def test_n03_request(self):
        self.base["provenance"]["request_id"] = "B"
        self.same(self.base)

    def test_n04_job(self):
        self.base["provenance"]["job_id"] = "B"
        self.same(self.base)

    def test_n05_run(self):
        self.base["provenance"]["run_dir"] = "/runs/B"
        self.same(self.base)

    def test_n06_display(self):
        for k in ("gui_display_name", "candidate_display_name"):
            self.base["provenance"][k] = "changed"
        self.same(self.base)

    def test_i01_missing_engine(self):
        del self.base["identity"]["engine"]["executable_sha256"]
        self.hold(self.base, "MISSING_ENGINE_IDENTITY")

    def test_i02_missing_resources(self):
        del self.base["identity"]["engine"]["resource_manifest"]
        self.hold(self.base, "MISSING_RESOURCE_IDENTITY")

    def test_i03_unknown_env_argv(self):
        self.base["verification"]["environment"] = False
        self.base["verification"]["argv"] = "unknown"
        a = self.hold(self.base, "MISSING_ENVIRONMENT_IDENTITY")
        self.assertIn("UNCLASSIFIED_ARGV", [x["code"] for x in a["blockers"]])
        self.hold(copy.deepcopy(self.base))

    def test_c01_lossless_decimal_json(self):
        for spelling in ("1", "1.0", "1.00", "1e0"):
            raw = self.goldens["base"][0].decode().replace('"scale":["1","1","1"]', '"scale":[' + spelling + ',1,1]')
            self.same(raw)
        self.assertEqual(canonical_decimal("-0.000e99"), "0")
        self.assertEqual(canonical_decimal("12345678901234567890.12345678901234567890"),
                         "12345678901234567890.1234567890123456789")
        with localcontext() as context:
            context.prec = 2
            self.assertEqual(canonical_decimal(Decimal("1.234567890123456789")), "1.234567890123456789")

    def test_c02_canonical_errors(self):
        for mutation in ("missing", "null", "float", "surrogate", "unknown_field", "bool_number"):
            d = copy.deepcopy(self.base)
            if mutation == "missing":
                del d["identity"]["domain"]
            elif mutation == "unknown_field":
                d["identity"]["execution"]["hidden_effect"] = True
            elif mutation == "surrogate":
                d["identity"]["profiles"]["map_mode"] = "\ud800"
            else:
                d["identity"]["profiles"]["nozzle"] = {"null":None,"float":0.4,"bool_number":True}[mutation]
            with self.subTest(mutation=mutation):
                self.hold(d, "INVALID_CANONICAL_INPUT")
        raw = self.goldens["base"][0].decode()
        self.hold(raw.replace('"operation":"FULL_SLICE"', '"operation":"FULL_SLICE","operation":"FULL_SLICE"'))
        for invalid in ("NaN", "Infinity", "-Infinity", "null"):
            self.hold(raw.replace('"nozzle":"0.4"', '"nozzle":' + invalid))
        for value in (float("nan"), float("inf"), 1.0):
            with self.assertRaises(InvalidDescriptor):
                canonical_decimal(value)

    def test_c03_unicode_no_normalization(self):
        a, b = copy.deepcopy(self.base), copy.deepcopy(self.base)
        a["identity"]["profiles"]["map_mode"] = "é"
        b["identity"]["profiles"]["map_mode"] = "e\u0301"
        self.assertNotEqual(generate_key(a)["SLICE_KEY"], generate_key(b)["SLICE_KEY"])

    def test_w01_hardware(self):
        self.base["provenance"]["worker_hostname"] = "M4"
        self.base["provenance"]["worker_hardware"] = "M4"
        self.same(self.base)

    def test_w02_platform(self):
        self.base["identity"]["engine"]["platform_abi"] = "synthetic-macos-arm64"
        self.base["identity"]["engine"]["executable_sha256"] = "6" * 64
        self.different(self.base)

    def test_missing_other_closures(self):
        for flag, code in (("backend","MISSING_BACKEND_IDENTITY"),
                           ("environment","MISSING_ENVIRONMENT_IDENTITY"),
                           ("paths","UNRESOLVED_PATH_SEMANTICS"),("inputs","MISSING_INPUT_SEMANTICS"),
                           ("resources","MISSING_RESOURCE_IDENTITY"),("immutable","INVALID_CANONICAL_INPUT")):
            d = copy.deepcopy(self.base)
            d["verification"][flag] = False
            with self.subTest(flag=flag):
                self.hold(d, code)
        for group, field, code in (("contracts","backend_bundle","MISSING_BACKEND_IDENTITY"),
                                   ("execution","environment","MISSING_ENVIRONMENT_IDENTITY"),
                                   ("execution","argv","UNCLASSIFIED_ARGV"),
                                   ("execution","cwd","UNRESOLVED_PATH_SEMANTICS")):
            d = copy.deepcopy(self.base)
            del d["identity"][group][field]
            self.hold(d, code)

    def test_unsupported_versions_and_legacy(self):
        for name in self.base["identity"]["contracts"]["policies"]:
            d = copy.deepcopy(self.base)
            d["identity"]["contracts"]["policies"][name]["version"] = "0.2"
            self.hold(d, "UNSUPPORTED_CONTRACT_SCHEMA")
        for field, version, code in (("job_schema","0.1","UNSUPPORTED_JOB_SCHEMA"),
                                     ("console_schema","0.2","UNSUPPORTED_CONTRACT_SCHEMA"),
                                     ("runner_version","0.1.0","UNSUPPORTED_CONTRACT_SCHEMA")):
            d = copy.deepcopy(self.base)
            d["identity"]["contracts"][field] = version
            self.hold(d, code)
        for field in ("domain", "key_schema_version", "operation"):
            d = copy.deepcopy(self.base)
            d["identity"][field] = "unsupported"
            self.hold(d, "UNSUPPORTED_CONTRACT_SCHEMA")
        self.base["descriptor_schema_version"] = "0.2"
        self.hold(self.base, "UNSUPPORTED_CONTRACT_SCHEMA")

    def test_serializer_exact_controls_booleans(self):
        self.assertEqual(_serialize({"b":False,"a":[True,'é\n\t\r\b\f\x00"\\/']}),
                         b'{"a":[true,"\xc3\xa9\\u000a\\u0009\\u000d\\u0008\\u000c\\u0000\\"\\\\/"],"b":false}')
        for value in (1, 0.1, None, Decimal("1")):
            with self.assertRaises(InvalidDescriptor):
                _serialize({"a":value})

    def test_resource_names_and_manifest_order(self):
        self.base["identity"]["engine"]["resource_manifest"]["entries"].reverse()
        self.same(self.base)
        for name in ("../config", "C:/config", "/config", "a\\b"):
            d = copy.deepcopy(self.base)
            d["identity"]["engine"]["resource_manifest"]["entries"][0]["logical_name"] = name
            self.hold(d, "UNRESOLVED_PATH_SEMANTICS")

    def test_argv_unclassified_and_bound_references(self):
        for token in ({"kind":"unknown"}, {"kind":"input","slot":"99"},
                      {"kind":"resource","logical_name":"missing"}):
            d = copy.deepcopy(self.base)
            d["identity"]["execution"]["argv"].append(token)
            self.hold(d)
        self.base["identity"]["execution"]["argv"].append({"kind":"option","value":"--orient"})
        self.different(self.base)

    def test_output_alias_semantics(self):
        self.base["identity"]["execution"]["argv"][6]["alias"] = "1"
        self.different(self.base)
        self.base["identity"]["execution"]["argv"].append({"kind":"output","slot":"0","alias":"0"})
        self.hold(self.base, "UNRESOLVED_PATH_SEMANTICS")

    def test_unknown_engine_identity(self):
        self.base["identity"]["engine"]["platform_abi"] = "unknown"
        self.hold(self.base, "MISSING_ENGINE_IDENTITY")

    def test_env_unset_empty_and_semantic_id_injection(self):
        self.base["identity"]["execution"]["environment"]["variables"][1] = {
            "name":"LC_ALL","state":"present","value":""}
        self.different(self.base)
        self.base["identity"]["execution"]["argv"].append({"kind":"literal","value":"job B"})
        self.different(self.base)

    def test_input_declared_semantics(self):
        self.base["identity"]["inputs"][0]["semantics"]["modifier"] = {
            "state":"present","value":{"identity_sha256":"7"*64,"description":"synthetic modifier"}}
        self.different(self.base)
        self.base["identity"]["inputs"][0]["semantics"]["modifier"] = {"state":"unknown"}
        self.hold(self.base,"MISSING_INPUT_SEMANTICS")

    def test_no_input_mutation_and_component_digests(self):
        before = copy.deepcopy(self.base)
        result = self.same(self.base)
        self.assertEqual(self.base,before)
        self.assertEqual([x["pointer"] for x in result["CANONICAL_INPUT_DIGESTS"]],
                         ["/contracts","/engine","/execution","/inputs","/profiles"])
        for entry in result["CANONICAL_INPUT_DIGESTS"]:
            self.assertEqual(entry["sha256"], hashlib.sha256(_serialize(
                result["CANONICAL_TREE"][entry["pointer"][1:]])).hexdigest())


if __name__ == "__main__":
    unittest.main()
