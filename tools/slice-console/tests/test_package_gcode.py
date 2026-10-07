"""Package-only checks; no Bambu CLI or slicer process."""

import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from package_gcode import GCODE_ENTRY, package_gcode


class PackageGcodeTests(unittest.TestCase):
    def test_raw_bytes_and_validation(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            gcode = root / "plate_1.gcode"
            raw = b"; total layer number: 2\r\n; layer num/total_layer_count: 1/2\r\nG1 X1\r\n; layer num/total_layer_count: 2/2\r\nG1 X2\r\n"
            gcode.write_bytes(raw)
            context = root / "source.3mf"
            with zipfile.ZipFile(context, "w") as archive:
                archive.writestr("Metadata/project_settings.config", "{}")
                archive.writestr("Metadata/model_settings.config", '<config><plate><metadata key="gcode_file" value=""/></plate></config>')
            result = package_gcode(gcode, root / "package", context, expected_bytes=len(raw), expected_layers=2)
            self.assertEqual(result["status"], "PACKAGE_COMPLETE")
            self.assertEqual(result["hash_match"], "MATCH")
            self.assertEqual(result["zip_crc"], "PASS")
            with zipfile.ZipFile(result["output_path"]) as archive:
                self.assertEqual(archive.read(GCODE_ENTRY), raw)
                self.assertFalse(any(name.startswith("3D/Objects/") for name in archive.namelist()))
            self.assertEqual(json.loads((root / "package" / "PACKAGE_RESULT.json").read_text())["detected_layers"], 2)

    def test_missing_context_fails_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            gcode = root / "plate_1.gcode"
            gcode.write_bytes(b"; total layer number: 1\n")
            result = package_gcode(gcode, root / "package")
            self.assertEqual(result["status"], "PACKAGE_FAILED")
            self.assertFalse(Path(result["output_path"]).exists())


if __name__ == "__main__":
    unittest.main()
