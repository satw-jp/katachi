from __future__ import annotations

import base64
import hashlib
import json
import threading
import time
import unittest
from http.client import HTTPConnection
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from bridge_contract import (
    BIND_ADDRESS,
    MAX_REQUEST_BYTES,
    OPERATION,
    PORT,
    BridgeError,
    canonical_json,
    origin_allowed,
    validate_capabilities,
    validate_render_request,
)
from server import BridgeService, make_server


OBJ = b"# triangle\nv 0 0 0\nv 10 0 0\nv 0 10 0\nf 1 2 3\n"
MESH_HASH = hashlib.sha256(OBJ).hexdigest()
FINGERPRINT = hashlib.sha256(b"fixed-test-snapshot").hexdigest()


def request_payload(*, purpose: str = "body", request_id: str = "test-body", device: str = "cpu") -> dict:
    encoded = base64.b64encode(OBJ).decode("ascii")
    return {
        "requestId": request_id,
        "operation": OPERATION,
        "case": {"id": "test-case", "label": "bounded test case"},
        "provenance": {
            "repository": "satw-jp/katachi",
            "sourceCommit": "586a20cedfca9e769f710cfd96a400b4737069d5",
            "sourceRef": "main",
            "shapeSource": "cloud-sculpt.buildCloudMesh",
            "fingerprint": FINGERPRINT,
        },
        "canonicalMesh": {"format": "obj", "dataBase64": encoded, "byteLength": len(OBJ), "sha256": MESH_HASH},
        "physicalScale": {"mmPerShapeUnit": 20, "source": "assumed"},
        "camera": {
            "positionMm": {"x": 0, "y": 80, "z": -120},
            "targetMm": {"x": 0, "y": 0, "z": 0},
            "up": {"x": 0, "y": 1, "z": 0},
            "fovDeg": 45,
            "aspect": 1,
        },
        "hostMaterial": {"id": "neutral", "ior": 1.5, "absorptionPerMm": {"r": 0.002, "g": 0.002, "b": 0.002}, "roughness": 0.05},
        "light": {"directionPropagation": {"x": 0, "y": -1, "z": 0}, "radiance": {"r": 1, "g": 1, "b": 1}, "angularDiameterDeg": 5},
        "receiver": {"positionMm": {"x": 0, "y": -40, "z": 0}, "normal": {"x": 0, "y": 1, "z": 0}, "extentMm": {"x": 120, "z": 120}, "reflectance": 0.8},
        "environment": {"radiance": {"r": 0.01, "g": 0.01, "b": 0.01}},
        "renderPurpose": purpose,
        "compute": {"device": device},
        "spp": 2,
        "resolution": {"width": 16, "height": 16},
    }


def capabilities_payload() -> dict:
    return {
        "schemaVersion": "hikari-mitsuba-bridge.v1",
        "service": "hikari-mitsuba-local-bridge",
        "bindAddress": BIND_ADDRESS,
        "port": PORT,
        "mitsuba": {"available": True, "version": "test"},
        "drjit": {"available": True, "version": "test"},
        "pythonVersion": "3.12.0",
        "variants": ["scalar_rgb", "cuda_ad_rgb"],
        "selectedVariant": "scalar_rgb",
        "cudaAvailable": False,
        "gpu": None,
        "workerReady": True,
        "supportedOperations": [OPERATION],
        "supportedDevices": ["cuda", "cpu"],
        "optix": "unknown",
        "artifactTransport": "GET /v1/artifacts/{requestId}",
        "cancellation": "POST /v1/cancel",
    }


class FakeWorker:
    def __init__(self, *, wait_for_cancel: bool = False, mismatch: bool = False, cuda_unavailable: bool = False) -> None:
        self.wait_for_cancel = wait_for_cancel
        self.mismatch = mismatch
        self.cuda_unavailable = cuda_unavailable
        self.started = threading.Event()

    def capabilities(self) -> dict:
        return capabilities_payload()

    def render(self, request: dict, cancel_event: threading.Event) -> dict:
        self.started.set()
        if self.cuda_unavailable and request["compute"]["device"] == "cuda":
            raise BridgeError("cuda_unavailable", "test CUDA unavailable", 503)
        if self.wait_for_cancel:
            cancel_event.wait(2)
            if cancel_event.is_set():
                raise BridgeError("cancelled", "test cancellation", 409)
        return {
            "requestId": "wrong-id" if self.mismatch else request["requestId"],
            "success": True,
            "operation": request["operation"],
            "selectedVariant": "scalar_rgb",
            "gpu": None,
            "executionDevice": "cpu",
            "cudaFallback": False,
            "purpose": request["renderPurpose"],
            "resolution": request["resolution"],
            "spp": request["spp"],
            "renderMs": 1.0,
            "provenanceHash": "a" * 64,
            "provenanceFingerprint": "wrong" if self.mismatch else request["provenance"]["fingerprint"],
            "warnings": [],
            "artifact": b"\x89PNG\r\n\x1a\n",
        }


class BridgeContractTests(unittest.TestCase):
    def test_capabilities_schema_and_loopback(self) -> None:
        self.assertEqual(validate_capabilities(capabilities_payload())["port"], 47659)
        self.assertEqual(BIND_ADDRESS, "127.0.0.1")
        self.assertTrue(origin_allowed("http://localhost:5173"))
        self.assertFalse(origin_allowed("https://evil.example"))

    def test_valid_body_and_receiver_are_bounded(self) -> None:
        body = validate_render_request(request_payload())
        receiver = validate_render_request(request_payload(purpose="receiver", request_id="test-receiver"))
        self.assertEqual(body["renderPurpose"], "body")
        self.assertEqual(receiver["renderPurpose"], "receiver")
        self.assertEqual(body["canonicalMesh"]["data"], OBJ)

    def test_invalid_operation_and_arbitrary_path_or_code_rejected(self) -> None:
        invalid_operation = request_payload()
        invalid_operation["operation"] = "mitsuba.arbitrary"
        with self.assertRaises(BridgeError):
            validate_render_request(invalid_operation)
        for key in ("path", "python", "scene", "plugin", "code"):
            invalid = request_payload()
            invalid[key] = "not allowed"
            with self.assertRaises(BridgeError):
                validate_render_request(invalid)

    def test_request_size_is_bounded(self) -> None:
        self.assertGreater(MAX_REQUEST_BYTES, len(canonical_json(request_payload())))
        invalid = request_payload()
        invalid["case"]["label"] = "x" * (MAX_REQUEST_BYTES + 1)
        with self.assertRaises(BridgeError):
            validate_render_request(invalid)

    def test_cuda_unavailable_does_not_fallback(self) -> None:
        service = BridgeService(FakeWorker(cuda_unavailable=True))
        with self.assertRaises(BridgeError) as raised:
            service.render(request_payload(device="cuda"))
        self.assertEqual(raised.exception.code, "cuda_unavailable")
        service.close()

    def test_timeout_cancellation_and_stale_result(self) -> None:
        timeout_service = BridgeService(FakeWorker(wait_for_cancel=True), render_timeout_seconds=0.02)
        with self.assertRaises(BridgeError) as timeout:
            timeout_service.render(request_payload(request_id="timeout"))
        self.assertEqual(timeout.exception.code, "timeout")
        timeout_service.close()

        worker = FakeWorker(wait_for_cancel=True)
        cancel_service = BridgeService(worker, render_timeout_seconds=2)
        result: list[Exception] = []

        def run() -> None:
            try:
                cancel_service.render(request_payload(request_id="cancel"))
            except Exception as exc:  # expected cancellation path
                result.append(exc)

        thread = threading.Thread(target=run)
        thread.start()
        self.assertTrue(worker.started.wait(1))
        cancelled = cancel_service.cancel({"requestId": "cancel", "provenanceFingerprint": FINGERPRINT})
        thread.join(1)
        self.assertTrue(cancelled["cancelled"])
        self.assertEqual(getattr(result[0], "code", None), "cancelled")
        cancel_service.close()

        stale_service = BridgeService(FakeWorker(mismatch=True))
        with self.assertRaises(BridgeError) as stale:
            stale_service.render(request_payload(request_id="stale"))
        self.assertEqual(stale.exception.code, "stale_result")
        stale_service.close()


class BridgeHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.service = BridgeService(FakeWorker())
        cls.httpd = make_server(cls.service)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        time.sleep(0.03)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.service.close()
        cls.thread.join(1)

    def test_invalid_origin_is_rejected(self) -> None:
        request = Request(f"http://{BIND_ADDRESS}:{PORT}/v1/capabilities", headers={"Origin": "https://evil.example"})
        with self.assertRaises(HTTPError) as raised:
            urlopen(request, timeout=2)
        self.assertEqual(raised.exception.code, 403)

    def test_capabilities_render_and_binary_artifact(self) -> None:
        with urlopen(f"http://{BIND_ADDRESS}:{PORT}/v1/capabilities", timeout=2) as response:
            capabilities = json.loads(response.read())
        self.assertEqual(capabilities["service"], "hikari-mitsuba-local-bridge")
        payload = json.dumps(request_payload(request_id="http-body")).encode()
        request = Request(f"http://{BIND_ADDRESS}:{PORT}/v1/render", data=payload, headers={"Content-Type": "application/json"}, method="POST")
        with urlopen(request, timeout=2) as response:
            metadata = json.loads(response.read())
        self.assertEqual(metadata["purpose"], "body")
        artifact_request = Request(
            f"http://{BIND_ADDRESS}:{PORT}{metadata['artifactUrl']}",
            headers={"X-Hikari-Provenance-Fingerprint": FINGERPRINT},
        )
        with urlopen(artifact_request, timeout=2) as response:
            self.assertEqual(response.headers["Content-Type"], "image/png")
            self.assertEqual(response.read(), b"\x89PNG\r\n\x1a\n")

    def test_oversized_content_length_is_rejected(self) -> None:
        connection = HTTPConnection(BIND_ADDRESS, PORT, timeout=2)
        connection.request("POST", "/v1/render", body=b"{}", headers={"Content-Length": str(MAX_REQUEST_BYTES + 1)})
        response = connection.getresponse()
        self.assertEqual(response.status, 413)
        connection.close()


if __name__ == "__main__":
    unittest.main()
