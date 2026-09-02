"""Loopback-only Hikari Mitsuba bridge server.

The HTTP surface is deliberately small: capabilities, one fixed render
operation, cancellation, and a bounded binary artifact endpoint.  A browser
request can select values within the declared contract, but cannot select a
scene description, plugin, Python code, filesystem path, or executable.
"""

from __future__ import annotations

import argparse
import json
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import unquote, urlsplit

from bridge_contract import (
    ALLOWED_ORIGINS,
    BIND_ADDRESS,
    BridgeError,
    MAX_ARTIFACT_BYTES,
    MAX_REQUEST_BYTES,
    OPERATION,
    PORT,
    artifact_hash,
    origin_allowed,
    validate_render_request,
)
from worker import MitsubaWorker


RENDER_TIMEOUT_SECONDS = 60.0
MAX_ARTIFACTS = 8
ARTIFACT_TTL_SECONDS = 600.0


@dataclass
class _ActiveRequest:
    fingerprint: str
    cancel_event: threading.Event
    future: Future[dict[str, Any]]


class BridgeService:
    """Coordinates validation, one bounded render worker, cancellation, and cache."""

    def __init__(self, worker: Any | None = None, render_timeout_seconds: float = RENDER_TIMEOUT_SECONDS) -> None:
        self.worker = worker or MitsubaWorker()
        self.render_timeout_seconds = render_timeout_seconds
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="hikari-mitsuba")
        self._lock = threading.RLock()
        self._active: dict[str, _ActiveRequest] = {}
        self._artifacts: dict[str, tuple[str, bytes, float]] = {}

    def close(self) -> None:
        with self._lock:
            for active in self._active.values():
                active.cancel_event.set()
        self._executor.shutdown(wait=False, cancel_futures=True)

    def capabilities(self) -> dict[str, Any]:
        return self.worker.capabilities()

    def render(self, payload: Any) -> dict[str, Any]:
        request = validate_render_request(payload)
        request_id = request["requestId"]
        fingerprint = request["provenance"]["fingerprint"]
        cancel_event = threading.Event()
        with self._lock:
            self._expire_artifacts_locked()
            existing = self._active.get(request_id)
            if existing is not None:
                if existing.fingerprint != fingerprint:
                    raise BridgeError("stale_request", "requestId is already active with another provenance fingerprint", 409)
                raise BridgeError("duplicate_request", "requestId is already active", 409)
            cached = self._artifacts.get(request_id)
            if cached is not None:
                if cached[0] != fingerprint:
                    raise BridgeError("stale_request", "requestId is already cached with another provenance fingerprint", 409)
                raise BridgeError("duplicate_request", "requestId already has a completed artifact", 409)
            future = self._executor.submit(self.worker.render, request, cancel_event)
            self._active[request_id] = _ActiveRequest(fingerprint, cancel_event, future)
        try:
            result = future.result(timeout=self.render_timeout_seconds)
        except FutureTimeoutError as exc:
            cancel_event.set()
            raise BridgeError("timeout", "fixed Mitsuba render exceeded the bridge timeout", 504) from exc
        except BridgeError:
            raise
        except Exception as exc:
            raise BridgeError("worker_failed", f"Mitsuba worker failed: {type(exc).__name__}: {exc}", 502) from exc
        finally:
            with self._lock:
                self._active.pop(request_id, None)
        if cancel_event.is_set():
            raise BridgeError("cancelled", "render completed after cancellation and was discarded", 409)
        if result.get("requestId") != request_id or result.get("provenanceFingerprint") != fingerprint:
            raise BridgeError("stale_result", "worker result provenance does not match the request", 502)
        artifact = result.pop("artifact", None)
        if not isinstance(artifact, bytes) or len(artifact) > MAX_ARTIFACT_BYTES:
            raise BridgeError("artifact_too_large", "worker returned no bounded artifact", 502)
        with self._lock:
            self._expire_artifacts_locked()
            if len(self._artifacts) >= MAX_ARTIFACTS:
                oldest = min(self._artifacts.items(), key=lambda item: item[1][2])[0]
                self._artifacts.pop(oldest, None)
            self._artifacts[request_id] = (fingerprint, artifact, time.time() + ARTIFACT_TTL_SECONDS)
        result["artifactHash"] = artifact_hash(artifact)
        result["artifactByteLength"] = len(artifact)
        result["artifactUrl"] = f"/v1/artifacts/{request_id}"
        return result

    def cancel(self, payload: Any) -> dict[str, Any]:
        if not isinstance(payload, dict) or set(payload) != {"requestId", "provenanceFingerprint"}:
            raise BridgeError("invalid_request", "cancel requires requestId and provenanceFingerprint")
        request_id = payload.get("requestId")
        fingerprint = payload.get("provenanceFingerprint")
        if not isinstance(request_id, str) or not isinstance(fingerprint, str):
            raise BridgeError("invalid_request", "cancel identifiers must be strings")
        with self._lock:
            active = self._active.get(request_id)
            if active is None:
                return {"requestId": request_id, "cancelled": False, "status": "not-active"}
            if active.fingerprint != fingerprint:
                raise BridgeError("stale_request", "cancel provenance does not match the active request", 409)
            active.cancel_event.set()
            return {"requestId": request_id, "cancelled": True, "status": "cancellation-requested"}

    def artifact(self, request_id: str, fingerprint: str | None) -> tuple[bytes, str]:
        with self._lock:
            self._expire_artifacts_locked()
            stored = self._artifacts.get(request_id)
            if stored is None:
                raise BridgeError("artifact_not_found", "artifact is unavailable or expired", 404)
            if fingerprint != stored[0]:
                raise BridgeError("stale_request", "artifact provenance does not match the completed request", 409)
            return stored[1], stored[0]

    def _expire_artifacts_locked(self) -> None:
        now = time.time()
        for request_id, (_, _, expires_at) in list(self._artifacts.items()):
            if expires_at <= now:
                self._artifacts.pop(request_id, None)


class _BridgeHandler(BaseHTTPRequestHandler):
    service: BridgeService

    server_version = "HikariMitsubaBridge/1"

    def do_OPTIONS(self) -> None:
        if not self._check_origin():
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        self._cors_headers()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Hikari-Provenance-Fingerprint")
        self.send_header("Access-Control-Max-Age", "300")
        self.end_headers()

    def do_GET(self) -> None:
        if not self._check_origin():
            return
        path = urlsplit(self.path).path
        try:
            if path == "/v1/capabilities":
                self._json(HTTPStatus.OK, self.service.capabilities())
                return
            prefix = "/v1/artifacts/"
            if path.startswith(prefix) and len(path) > len(prefix):
                request_id = unquote(path[len(prefix):])
                if "/" in request_id:
                    raise BridgeError("not_found", "artifact path is invalid", 404)
                data, fingerprint = self.service.artifact(
                    request_id,
                    self.headers.get("X-Hikari-Provenance-Fingerprint"),
                )
                self.send_response(HTTPStatus.OK)
                self._cors_headers()
                self.send_header("Content-Type", "image/png")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("ETag", f'"{artifact_hash(data)}"')
                self.send_header("X-Hikari-Provenance-Fingerprint", fingerprint)
                self.end_headers()
                self.wfile.write(data)
                return
            raise BridgeError("not_found", "endpoint not found", 404)
        except BridgeError as exc:
            self._error(exc)

    def do_POST(self) -> None:
        if not self._check_origin():
            return
        path = urlsplit(self.path).path
        try:
            payload = self._read_json()
            if path == "/v1/render":
                self._json(HTTPStatus.OK, self.service.render(payload))
                return
            if path == "/v1/cancel":
                self._json(HTTPStatus.OK, self.service.cancel(payload))
                return
            raise BridgeError("not_found", "endpoint not found", 404)
        except BridgeError as exc:
            self._error(exc)

    def _read_json(self) -> Any:
        length_header = self.headers.get("Content-Length")
        if length_header is None:
            raise BridgeError("invalid_request", "Content-Length is required")
        try:
            length = int(length_header)
        except ValueError as exc:
            raise BridgeError("invalid_request", "Content-Length is invalid") from exc
        if length < 0 or length > MAX_REQUEST_BYTES:
            raise BridgeError("request_too_large", f"request exceeds {MAX_REQUEST_BYTES} bytes", 413)
        raw = self.rfile.read(length)
        if len(raw) != length:
            raise BridgeError("invalid_request", "request body was truncated")
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise BridgeError("invalid_request", "request body must be UTF-8 JSON") from exc

    def _check_origin(self) -> bool:
        origin = self.headers.get("Origin")
        if origin_allowed(origin):
            return True
        self._error(BridgeError("origin_rejected", "Origin is not allowlisted for the local bridge", 403))
        return False

    def _cors_headers(self) -> None:
        origin = self.headers.get("Origin")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Private-Network", "true")

    def _json(self, status: HTTPStatus, payload: Any) -> None:
        data = json.dumps(payload, ensure_ascii=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
        self.send_response(status)
        self._cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _error(self, error: BridgeError) -> None:
        self._json(
            HTTPStatus(error.status),
            {"success": False, "error": {"code": error.code, "message": error.message}},
        )

    def log_message(self, format: str, *args: Any) -> None:
        # Keep helper output useful for a developer without exposing request
        # bodies or paths containing user-controlled data.
        print(f"[hikari-mitsuba-bridge] {self.command} {self.path.split('?')[0]} -> {args[1] if len(args) > 1 else ''}")


def make_server(service: BridgeService | None = None) -> ThreadingHTTPServer:
    bridge_service = service or BridgeService()

    class BoundHandler(_BridgeHandler):
        pass

    BoundHandler.service = bridge_service
    httpd = ThreadingHTTPServer((BIND_ADDRESS, PORT), BoundHandler)
    httpd.daemon_threads = True
    return httpd


def main() -> int:
    parser = argparse.ArgumentParser(description="Hikari fixed Mitsuba loopback bridge")
    parser.parse_args()
    service = BridgeService()
    httpd = make_server(service)
    print(f"Hikari Mitsuba bridge listening on http://{BIND_ADDRESS}:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        return 0
    finally:
        httpd.shutdown()
        httpd.server_close()
        service.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
