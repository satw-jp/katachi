"""Validate committed/generated evidence without starting a renderer."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


OUTPUT_DIR = Path(__file__).resolve().parent / "outputs"


def read_json(name: str) -> dict:
    with (OUTPUT_DIR / name).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def main() -> None:
    environment = read_json("environment.json")
    case = read_json("fixed-case.json")
    gradient = read_json("gradient-probe.json")
    assert environment["status"] == "PASS"
    assert environment["selectedVariant"] == "cuda_ad_rgb"
    assert "cuda_ad_rgb" in environment["availableVariants"]
    assert "NVIDIA GeForce RTX 3080" in environment["gpuSnapshotAfter"]["gpu"]
    mesh_path = OUTPUT_DIR / case["mesh"]["filename"]
    mesh_hash = hashlib.sha256(mesh_path.read_bytes()).hexdigest()
    assert mesh_hash == case["mesh"]["sha256"]
    assert case["sourceCommit"] == "586a20cedfca9e769f710cfd96a400b4737069d5"
    assert case["mesh"]["topology"]["ok"] is True
    assert gradient["status"] == "PASS"
    assert gradient["directionAgreement"] is True
    for name in [
        "cuda-probe.png", "body.png", "receiver-only.png", "caustic-16spp.png",
        "caustic-64spp.png", "expressive-mild.png", "expressive-strong.png",
    ]:
        assert (OUTPUT_DIR / name).stat().st_size > 0, name
    print("HIKARI_MITSUBA_SPIKE_VERIFY_OK")


if __name__ == "__main__":
    main()
