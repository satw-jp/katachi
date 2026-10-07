"""Package completed standalone G-code without invoking the slicer."""

from __future__ import annotations

import hashlib
import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree

GCODE_ENTRY = "Metadata/plate_1.gcode"
SETTINGS_ENTRY = "Metadata/model_settings.config"
REQUIRED = {GCODE_ENTRY, SETTINGS_ENTRY, "Metadata/plate_1.gcode.md5", "[Content_Types].xml", "_rels/.rels", "3D/3dmodel.model", "Metadata/_rels/model_settings.config.rels"}
CONTENT_TYPES = (b'<?xml version="1.0" encoding="UTF-8"?>\n'
                 b'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n'
                 b' <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n'
                 b' <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n'
                 b' <Default Extension="gcode" ContentType="text/x.gcode"/>\n</Types>\n')
RELS = (b'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        b'<Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>'
        b'</Relationships>\n')
MODEL_RELS = (b'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
              b'<Relationship Target="/Metadata/plate_1.gcode" Id="rel-1" Type="http://schemas.bambulab.com/package/2021/gcode"/>'
              b'</Relationships>\n')
EMPTY_MODEL = (b'<?xml version="1.0" encoding="UTF-8"?>\n'
               b'<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" '
               b'xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">\n'
               b' <metadata name="Application">BambuStudio-02.08.02.61</metadata>\n'
               b' <metadata name="BambuStudio:3mfVersion">1</metadata>\n'
               b' <resources>\n </resources>\n <build/>\n</model>\n')


def _sha_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def inspect_gcode(path: Path) -> dict:
    """Read metadata only; never decode or transform the bytes used for packaging."""
    digest = hashlib.sha256()
    md5 = hashlib.md5()
    size = 0
    declared = None
    seen = set()
    total_in_markers = set()
    printer = None
    material = None
    with path.open("rb") as handle:
        for line in handle:
            digest.update(line)
            md5.update(line)
            size += len(line)
            if line.startswith(b"; total layer number:"):
                match = re.search(rb":\s*(\d+)", line)
                if match:
                    declared = int(match.group(1))
            elif line.startswith(b"; layer num/total_layer_count:"):
                match = re.search(rb":\s*(\d+)\s*/\s*(\d+)", line)
                if match:
                    seen.add(int(match.group(1)))
                    total_in_markers.add(int(match.group(2)))
            elif line.startswith(b"; printer_model ="):
                printer = line.partition(b"=")[2].strip().decode("utf-8", "replace")
            elif line.startswith(b"; filament_type ="):
                material = line.partition(b"=")[2].strip().decode("utf-8", "replace")
    layers = len(seen) if seen else declared
    if not size or (declared is not None and seen and (layers != declared or seen != set(range(1, declared + 1)))) or (total_in_markers and total_in_markers != {layers}):
        raise ValueError("G-code is empty or layer metadata is inconsistent")
    return {"bytes": size, "sha256": digest.hexdigest().upper(), "md5": md5.hexdigest().upper(),
            "layers": layers, "declared_layers": declared, "printer": printer, "material": material}


def _context_entries(context: Path | None) -> dict[str, bytes]:
    """Use settings only from a supplied source 3MF; omit geometry and stale plate data."""
    if context is None:
        return {}
    if context.suffix.lower() != ".3mf":
        raise ValueError("Source context must be a 3MF file")
    with zipfile.ZipFile(context) as archive:
        if "Metadata/project_settings.config" not in archive.namelist():
            raise ValueError("Source context has no project settings")
        return {name: archive.read(name) for name in archive.namelist()
                if name.startswith("Metadata/") and name not in {GCODE_ENTRY, "Metadata/plate_1.gcode.md5", SETTINGS_ENTRY}
                and not name.endswith("/")}


def _plate_settings(context: Path | None) -> bytes:
    root = ElementTree.Element("config")
    plate = ElementTree.SubElement(root, "plate")
    if context is not None:
        with zipfile.ZipFile(context) as archive:
            if SETTINGS_ENTRY not in archive.namelist():
                raise ValueError("Source context has no model settings")
            source = ElementTree.fromstring(archive.read(SETTINGS_ENTRY))
            source_plate = next((item for item in source if item.tag.rsplit("}", 1)[-1] == "plate"), None)
            if source_plate is None:
                raise ValueError("Source context has no plate settings")
            for item in source_plate:
                if item.tag.rsplit("}", 1)[-1] == "metadata" and item.get("key") != "gcode_file":
                    plate.append(item)
    ElementTree.SubElement(plate, "metadata", {"key": "gcode_file", "value": GCODE_ENTRY})
    return ElementTree.tostring(root, encoding="utf-8", xml_declaration=True)


def package_gcode(gcode: Path, output_dir: Path, context: Path | None = None,
                  expected_sha256: str | None = None, expected_bytes: int | None = None,
                  expected_layers: int | None = None) -> dict:
    """Standalone-only entrypoint. Fail closed and record validation in PACKAGE_RESULT.json."""
    output_dir.mkdir(parents=True, exist_ok=True)
    destination = output_dir / (gcode.stem + ".gcode.3mf")
    temporary = output_dir / (destination.name + ".tmp")
    manifest_path = output_dir / "PACKAGE_RESULT.json"
    result = {"status": "PACKAGE_FAILED", "gcode_status": "GCODE_COMPLETE", "preview_status": "AUTHOR_PREVIEW_CHECK",
              "input_gcode": str(gcode), "output_path": str(destination), "source_context": str(context) if context else None}
    try:
        if not gcode.is_file() or destination.resolve() == gcode.resolve():
            raise ValueError("Input G-code is missing or output overlaps input")
        info = inspect_gcode(gcode)
        if expected_sha256 and info["sha256"] != expected_sha256.upper():
            raise ValueError("Input SHA256 differs from authoritative identity")
        if expected_bytes is not None and info["bytes"] != expected_bytes:
            raise ValueError("Input byte count differs from authoritative identity")
        if expected_layers is not None and info["layers"] != expected_layers:
            raise ValueError("Input layer count differs from authoritative identity")
        result.update({"filename": gcode.name, "standalone_bytes": info["bytes"], "standalone_sha256": info["sha256"],
                       "detected_layers": info["layers"], "printer": info["printer"], "material": info["material"]})
        if context is None:
            raise ValueError("Bambu Previewには元の3MF設定が必要です。source contextを選択してください")
        entries = _context_entries(context)
        entries[SETTINGS_ENTRY] = _plate_settings(context)
        entries["Metadata/plate_1.gcode.md5"] = info["md5"].encode("ascii")
        entries["[Content_Types].xml"] = CONTENT_TYPES
        entries["_rels/.rels"] = RELS
        entries["Metadata/_rels/model_settings.config.rels"] = MODEL_RELS
        entries["3D/3dmodel.model"] = EMPTY_MODEL
        with zipfile.ZipFile(temporary, "w", allowZip64=True) as archive:
            for name, content in sorted(entries.items()):
                archive.writestr(name, content, compress_type=zipfile.ZIP_DEFLATED)
            # ZipFile.write streams the original bytes directly; it does not parse or rewrite G-code.
            archive.write(gcode, GCODE_ENTRY, compress_type=zipfile.ZIP_DEFLATED)
        embedded_digest = hashlib.sha256()
        embedded_size = 0
        with zipfile.ZipFile(temporary) as archive:
            bad = archive.testzip()
            if bad is not None:
                raise ValueError(f"ZIP CRC failed: {bad}")
            names = set(archive.namelist())
            if not REQUIRED.issubset(names) or any(name.startswith("3D/Objects/") for name in names):
                raise ValueError("Required metadata missing or geometry unexpectedly present")
            xml = ElementTree.fromstring(archive.read(SETTINGS_ENTRY))
            if not any(item.get("key") == "gcode_file" and item.get("value") == GCODE_ENTRY for item in xml.iter()):
                raise ValueError("Plate G-code metadata missing")
            if archive.getinfo(GCODE_ENTRY).file_size != info["bytes"]:
                raise ValueError("Embedded byte count mismatch")
            if archive.read("Metadata/plate_1.gcode.md5").decode("ascii") != info["md5"]:
                raise ValueError("Embedded MD5 metadata mismatch")
            with archive.open(GCODE_ENTRY) as embedded:
                for chunk in iter(lambda: embedded.read(4 * 1024 * 1024), b""):
                    embedded_digest.update(chunk)
                    embedded_size += len(chunk)
        embedded_sha = embedded_digest.hexdigest().upper()
        result.update({"zip_crc": "PASS", "required_metadata": "PASS", "embedded_bytes": embedded_size,
                       "embedded_sha256": embedded_sha, "hash_match": "MATCH" if embedded_sha == info["sha256"] else "MISMATCH",
                       "layer_metadata": "PASS" if info["layers"] is not None else "UNKNOWN"})
        if result["hash_match"] != "MATCH" or embedded_size != info["bytes"]:
            raise ValueError("Embedded G-code differs from standalone input")
        if _sha_file(gcode) != info["sha256"]:
            raise ValueError("Standalone G-code changed during packaging")
        temporary.replace(destination)
        result.update({"status": "PACKAGE_COMPLETE", "package_sha256": _sha_file(destination)})
    except Exception as exc:
        result["error"] = str(exc)
        temporary.unlink(missing_ok=True)
    manifest_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result
