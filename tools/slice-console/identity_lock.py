"""Explicit identity-lock plans only. No discovery, engine or generator integration."""
from datetime import datetime, timezone
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import stat

SCHEMA_VERSION = "0.1"
CHUNK_SIZE = 1024 * 1024
KINDS = {"engine", "resources", "backend"}
SHA = re.compile(r"[0-9a-f]{64}\Z")


class LockError(ValueError):
    def __init__(self, code, pointer):
        self.code, self.pointer = code, pointer
        super().__init__(code + ": " + pointer)


def _bad(code, pointer):
    raise LockError(code, pointer)


def _obj(v, fields, p):
    if type(v) is not dict or set(v) != set(fields):
        _bad("INVALID_MANIFEST", p)


def _text(v, p):
    if type(v) is not str or not v or any(0xD800 <= ord(c) <= 0xDFFF for c in v):
        _bad("INVALID_MANIFEST", p)
    return v


def _sha(v, p):
    if type(v) is not str or not SHA.fullmatch(v):
        _bad("INVALID_SHA256", p)
    return v


def _bytes(v):
    return json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
                      allow_nan=False).encode("utf-8")


def _digest(v):
    return hashlib.sha256(_bytes(v)).hexdigest()


def _pairs(items):
    obj = {}
    for k, v in items:
        if k in obj:
            _bad("DUPLICATE_KEY", "/")
        obj[k] = v
    return obj


def _load(v):
    if type(v) in (str, bytes):
        try:
            return json.loads(v, object_pairs_hook=_pairs,
                              parse_constant=lambda _: _bad("INVALID_MANIFEST", "/"))
        except (UnicodeError, ValueError) as e:
            if isinstance(e, LockError):
                raise
            _bad("INVALID_MANIFEST", "/")
    return copy.deepcopy(v)


def _absolute(v, p):
    text = _text(v, p)
    if any(x in {".", ".."} for x in text.replace("\\", "/").split("/")):
        _bad("TRAVERSAL", p)
    path = Path(text)
    if not path.is_absolute():
        _bad("ABSOLUTE_PATH_REQUIRED", p)
    return path


def _logical(v, p):
    text = _text(v, p)
    if text.startswith("/") or "\\" in text or ":" in text or any(
            x in {"", ".", ".."} for x in text.split("/")):
        _bad("INVALID_LOGICAL_NAME", p)
    return text


def validate_plan(plan):
    """Validate structure/explicit path bindings; no file I/O."""
    p = _load(plan)
    _obj(p, {"schema_version", "allowed_roots", "groups"}, "/")
    if p["schema_version"] != SCHEMA_VERSION:
        _bad("UNSUPPORTED_SCHEMA", "/schema_version")
    if type(p["allowed_roots"]) is not list or not p["allowed_roots"]:
        _bad("INVALID_MANIFEST", "/allowed_roots")
    roots = [_absolute(x, "/allowed_roots") for x in p["allowed_roots"]]
    if type(p["groups"]) is not list or len(p["groups"]) != 3:
        _bad("INVALID_MANIFEST", "/groups")
    kinds = set()
    for i, group in enumerate(p["groups"]):
        gp = "/groups/" + str(i)
        _obj(group, {"identity_kind", "metadata", "closure_policy", "entries"}, gp)
        kind = group["identity_kind"]
        if type(kind) is not str or kind not in KINDS or kind in kinds:
            _bad("DUPLICATE_OR_UNKNOWN_KIND", gp)
        kinds.add(kind)
        _obj(group["metadata"], {"declared_version", "platform_abi"} if kind == "engine" else {}, gp + "/metadata")
        for v in group["metadata"].values():
            if _text(v, gp + "/metadata").casefold() == "unknown":
                _bad("MISSING_ENGINE_METADATA", gp)
        policy = group["closure_policy"]
        _obj(policy, {"version", "policy_id", "sha256", "status", "path_semantics", "unresolved"}, gp + "/closure_policy")
        if policy["version"] != "0.1":
            _bad("UNSUPPORTED_POLICY", gp)
        _text(policy["policy_id"], gp)
        _sha(policy["sha256"], gp)
        if policy["status"] not in {"COMPLETE", "INCOMPLETE"} or policy["path_semantics"] not in {"INSENSITIVE", "UNRESOLVED"}:
            _bad("INVALID_CLOSURE_POLICY", gp)
        if type(policy["unresolved"]) is not list or any(type(x) is not str or not x for x in policy["unresolved"]):
            _bad("INVALID_CLOSURE_POLICY", gp)
        if policy["status"] == "COMPLETE" and policy["unresolved"]:
            _bad("INVALID_CLOSURE_POLICY", gp)
        entries = group["entries"]
        if type(entries) is not list or not entries:
            _bad("EMPTY_MANIFEST", gp)
        names = set()
        for j, entry in enumerate(entries):
            ep = gp + "/entries/" + str(j)
            _obj(entry, {"logical_name", "source_path", "role", "required", "expected_sha256"}, ep)
            name = _logical(entry["logical_name"], ep)
            if name in names:
                _bad("DUPLICATE_LOGICAL_NAME", ep)
            names.add(name)
            source = _absolute(entry["source_path"], ep)
            if not any(source.is_relative_to(root) and source != root for root in roots):
                _bad("OUTSIDE_POLICY", ep)
            _text(entry["role"], ep)
            if type(entry["required"]) is not bool:
                _bad("INVALID_MANIFEST", ep)
            if entry["expected_sha256"] is not None:
                _sha(entry["expected_sha256"], ep)
        if kind == "engine" and (len(entries) != 1 or not entries[0]["required"] or entries[0]["role"] != "executable"):
            _bad("INVALID_ENGINE_BINDING", gp)
        if kind == "backend" and not {"job.py", "runner.py", "progress.py"} <= names:
            _bad("MISSING_BACKEND_SOURCE", gp)
    return p


def _policy_path(path):
    # Inspect only the explicitly selected file and its ancestors, never siblings.
    for node in reversed((path, *path.parents)):
        info = node.lstat()
        if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & 0x400:
            _bad("LINK_OR_REPARSE_POINT", str(node))
    resolved = path.resolve(strict=True)
    if resolved != path:
        _bad("UNEXPECTED_PATH_RESOLUTION", str(path))
    return resolved


def _meta(info):
    return {"size": info.st_size, "mtime_ns": info.st_mtime_ns,
            "ctime_ns": info.st_ctime_ns, "device": info.st_dev, "inode": info.st_ino}


def _read_file(entry, hook=None):
    """Read fixed-size chunks; compare path and handle metadata before/after."""
    path = Path(entry["source_path"])
    row = {"logical_name": entry["logical_name"], "source_path": str(path),
           "resolved_path": None, "role": entry["role"], "required": entry["required"],
           "expected_sha256": entry["expected_sha256"], "status": "MISSING",
           "observed_bytes": None, "sha256": None, "before": None, "after": None,
           "handle_before": None, "handle_after": None}
    try:
        row["resolved_path"] = str(_policy_path(path))
        before = path.stat()
        if not stat.S_ISREG(before.st_mode):
            _bad("NOT_REGULAR_FILE", str(path))
        row["before"] = _meta(before)
        flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
        with os.fdopen(os.open(path, flags), "rb") as source:
            initial = _meta(os.fstat(source.fileno()))
            row["handle_before"] = initial
            # Windows path stat and handle fstat can report different ctime.
            # Compare each source's ctime against itself, never cross-source.
            comparable = ("size", "mtime_ns", "device", "inode")
            if any(initial[k] != row["before"][k] for k in comparable):
                _bad("CHANGED_DURING_READ", str(path))
            digest, count = hashlib.sha256(), 0
            while True:
                chunk = source.read(CHUNK_SIZE)
                if not chunk:
                    break
                count += len(chunk)
                digest.update(chunk)
                if hook:
                    hook(path, count)
            final = _meta(os.fstat(source.fileno()))
            row["handle_after"] = final
        _policy_path(path)
        row["after"] = _meta(path.stat())
        row["observed_bytes"] = count
        if initial != final or row["before"] != row["after"] or count != before.st_size:
            _bad("CHANGED_DURING_READ", str(path))
        row["sha256"] = digest.hexdigest()
        row["status"] = ("MISMATCH" if entry["expected_sha256"] is not None and
                         row["sha256"] != entry["expected_sha256"] else "HASHED")
    except FileNotFoundError:
        row["status"] = "MISSING" if row["before"] is None else "CHANGED_DURING_READ"
    except LockError as e:
        row["status"] = e.code
    except OSError:
        row["status"] = "READ_ERROR"
    if row["status"] not in {"HASHED", "MISMATCH"}:
        row["sha256"] = None
    return row


def _binding(plan):
    # Physical roots/paths and expected hashes are verification provenance only.
    return {"schema_version": "0.1", "groups": sorted([
        {"identity_kind": g["identity_kind"], "metadata": g["metadata"], "closure_policy": g["closure_policy"],
         "entries": sorted([{k: e[k] for k in ("logical_name", "role", "required")} for e in g["entries"]],
                           key=lambda e: e["logical_name"])} for g in plan["groups"]], key=lambda g: g["identity_kind"])}


def _identities(plan, rows):
    groups = []
    for group in sorted(plan["groups"], key=lambda g: g["identity_kind"]):
        kind = group["identity_kind"]
        entries = [{"logical_name": r["logical_name"], "sha256": r["sha256"],
                    "size": str(r["observed_bytes"]), "role": r["role"]}
                   for r in rows if r["identity_kind"] == kind and r["status"] in {"HASHED", "VERIFIED"}]
        groups.append({"identity_kind": kind, "metadata": group["metadata"],
                       "closure_policy": group["closure_policy"],
                       "manifest": {"schema_version": "0.1", "entries": sorted(entries, key=lambda e: e["logical_name"])}})
    return {"domain": "IDENTITY_LOCK/v0", "schema_version": "0.1", "groups": groups}


def _result(plan, rows, started, operation):
    blockers = []
    for row in rows:
        if row["status"] not in {"HASHED", "VERIFIED"}:
            # Optional listed dependencies can be absent without read failure, but
            # absence always keeps identity closure incomplete.
            blockers.append({"code": row["status"], "kind": row["identity_kind"], "logical_name": row["logical_name"]})
    for group in plan["groups"]:
        if group["closure_policy"]["status"] != "COMPLETE":
            blockers.append({"code": "CLOSURE_INCOMPLETE", "kind": group["identity_kind"], "logical_name": ""})
        if group["closure_policy"]["path_semantics"] != "INSENSITIVE":
            blockers.append({"code": "PATH_SEMANTICS_UNRESOLVED", "kind": group["identity_kind"], "logical_name": ""})
    closure = "COMPLETE" if not blockers else "INCOMPLETE"
    identity = _identities(plan, rows)
    files_ok = all(r["status"] in {"HASHED", "VERIFIED"} for r in rows)
    return {"schema_version": "0.1", "operation": operation,
            "status": ("VERIFIED" if operation == "VERIFY" else "LOCK_CREATED") if not blockers else "HOLD",
            "FILES_STATUS": ("VERIFIED" if operation == "VERIFY" else "HASHED") if files_ok else "INCOMPLETE",
            "CLOSURE_STATUS": closure, "verified": operation == "VERIFY" and not blockers,
            "plan_sha256": _digest(plan), "binding_sha256": _digest(_binding(plan)),
            "identity_sha256": _digest(identity) if not blockers else None,
            "logical_identity": identity if not blockers else None,
            "diagnostic_identity": {"label": "partial / non-reusable", "value": identity} if blockers else None,
            "files": rows, "started_at": started, "finished_at": _time(),
            "blockers": sorted(blockers, key=lambda b: (b["code"], b["kind"], b["logical_name"]))}


def _time():
    return datetime.now(timezone.utc).isoformat()


def _held(code, pointer, operation, started):
    return {"schema_version": "0.1", "operation": operation, "status": "HOLD",
            "FILES_STATUS": "INCOMPLETE", "CLOSURE_STATUS": "INCOMPLETE", "verified": False,
            "plan_sha256": None, "binding_sha256": None, "identity_sha256": None,
            "logical_identity": None, "diagnostic_identity": None, "files": [],
            "started_at": started, "finished_at": _time(),
            "blockers": [{"code": code, "kind": "", "logical_name": pointer}]}


def build_lock(plan, *, read_hook=None):
    """Return (immutable JSON-text receipt, result dict); no output-file mutation."""
    started = _time()
    try:
        plan = validate_plan(plan)
        rows = []
        for group in plan["groups"]:
            for entry in group["entries"]:
                rows.append({**_read_file(entry, read_hook), "identity_kind": group["identity_kind"]})
        result = _result(plan, rows, started, "BUILD")
        lock = {"schema_version": "0.1", "plan_sha256": result["plan_sha256"],
                "binding_sha256": result["binding_sha256"], "created_at": result["finished_at"],
                "build_result": result}
        return _bytes(lock).decode("utf-8"), result
    except (LockError, TypeError, ValueError, UnicodeError) as e:
        code, pointer = (e.code, e.pointer) if isinstance(e, LockError) else ("INVALID_MANIFEST", "/")
        return None, _held(code, pointer, "BUILD", started)


def receipt_sha256(receipt):
    """Pin exact immutable receipt text, including provenance and timestamps."""
    return hashlib.sha256(receipt.encode("utf-8")).hexdigest()


def verify_lock(plan, receipt, *, expected_receipt_sha256, read_hook=None):
    """Rehash explicit plan files against externally pinned receipt bytes.

    A relocated plan is allowed only if logical binding/policy matches. No key call.
    """
    started = _time()
    try:
        plan = validate_plan(plan)
        _sha(expected_receipt_sha256, "/expected_receipt_sha256")
        if type(receipt) is not str or receipt_sha256(receipt) != expected_receipt_sha256:
            _bad("RECEIPT_DIGEST_MISMATCH", "/receipt")
        lock = _load(receipt)
        _obj(lock, {"schema_version", "plan_sha256", "binding_sha256", "created_at", "build_result"}, "/receipt")
        if lock["schema_version"] != "0.1" or lock["binding_sha256"] != _digest(_binding(plan)):
            _bad("LOCK_BINDING_MISMATCH", "/receipt")
        baseline = lock["build_result"]
        if baseline["FILES_STATUS"] != "HASHED" or any(r["status"] != "HASHED" for r in baseline["files"]):
            _bad("INCOMPLETE_BASELINE", "/receipt/build_result")
        old = {(r["identity_kind"], r["logical_name"]): r for r in baseline["files"]}
        entries = [(g["identity_kind"], e) for g in plan["groups"] for e in g["entries"]]
        if set(old) != {(k, e["logical_name"]) for k, e in entries}:
            _bad("LOCK_BINDING_MISMATCH", "/receipt/files")
        rows = []
        for kind, entry in entries:
            prior = old[(kind, entry["logical_name"])]
            if entry["expected_sha256"] is not None and entry["expected_sha256"] != prior["sha256"]:
                _bad("EXPECTED_HASH_CONFLICT", "/plan")
            pinned = {**entry, "expected_sha256": prior["sha256"]}
            row = {**_read_file(pinned, read_hook), "identity_kind": kind}
            if row["status"] == "HASHED":
                row["status"] = "VERIFIED" if row["observed_bytes"] == prior["observed_bytes"] else "MISMATCH"
            rows.append(row)
        return _result(plan, rows, started, "VERIFY")
    except (LockError, TypeError, ValueError, KeyError, UnicodeError) as e:
        code, pointer = (e.code, e.pointer) if isinstance(e, LockError) else ("INVALID_RECEIPT", "/")
        return _held(code, pointer, "VERIFY", started)
