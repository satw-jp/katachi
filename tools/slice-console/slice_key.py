"""Pure SLICE_KEY v0.1 generation from preverified descriptors, never a JobSpec.

No I/O, process, discovery, Console or cache imports. Verification assertions are
a trusted caller boundary, not evidence discovered or independently verified here.
"""
from decimal import Decimal
import hashlib
import json
import re

KEY_SCHEMA_VERSION = "0.1"
DOMAIN = "SLICE_KEY/v0.1"
DESCRIPTOR_SCHEMA_VERSION = "0.1"
_SHA = re.compile(r"[0-9a-f]{64}\Z")
_DECIMAL = re.compile(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?\Z")
PROVENANCE_FIELDS = {
    "job_id", "request_id", "timestamp", "output_dir", "run_dir", "log_path",
    "input_paths", "profile_paths", "engine_path", "resource_paths", "cwd_path",
    "worker_hostname", "worker_hardware", "gui_display_name", "candidate_display_name",
}
VERIFICATIONS = {
    "immutable": "INVALID_CANONICAL_INPUT",
    "engine": "MISSING_ENGINE_IDENTITY",
    "resources": "MISSING_RESOURCE_IDENTITY",
    "backend": "MISSING_BACKEND_IDENTITY",
    "environment": "MISSING_ENVIRONMENT_IDENTITY",
    "argv": "UNCLASSIFIED_ARGV",
    "paths": "UNRESOLVED_PATH_SEMANTICS",
    "inputs": "MISSING_INPUT_SEMANTICS",
}
SEMANTICS = {"assembly", "modifier", "enforcer", "authored_support",
             "process_fixture", "other", "provenance"}


class InvalidDescriptor(ValueError):
    def __init__(self, pointer, code="INVALID_CANONICAL_INPUT"):
        self.pointer, self.code = pointer, code
        super().__init__(code + ": " + pointer)


def _fail(pointer, code="INVALID_CANONICAL_INPUT"):
    raise InvalidDescriptor(pointer, code)


def _object(value, fields, pointer, code="INVALID_CANONICAL_INPUT"):
    if type(value) is not dict or set(value) != set(fields):
        _fail(pointer, code)
    return value


def _string(value, pointer, nonempty=True):
    if type(value) is not str or (nonempty and not value):
        _fail(pointer)
    if any(0xD800 <= ord(c) <= 0xDFFF for c in value):
        _fail(pointer)
    return value


def _sha(value, pointer, code="INVALID_CANONICAL_INPUT"):
    if type(value) is not str or not _SHA.fullmatch(value):
        _fail(pointer, code)
    return value


def canonical_decimal(value):
    """Lossless decimal spelling; float/bool/null never accepted."""
    if type(value) is int:
        number = Decimal(value)
    elif type(value) is Decimal:
        number = value
    elif type(value) is str and _DECIMAL.fullmatch(value):
        number = Decimal(value)
    else:
        _fail("/numeric")
    if not number.is_finite():
        _fail("/numeric")
    if number.is_zero():
        return "0"
    # format(f) does not round through Decimal context or binary floating point.
    text = format(number, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text


def _number(value, pointer, integer=False, positive=False):
    try:
        text = canonical_decimal(value)
    except InvalidDescriptor:
        _fail(pointer)
    if integer and ("." in text or text.startswith("-")):
        _fail(pointer)
    if positive and Decimal(text) <= 0:
        _fail(pointer)
    return text


def _array(value, pointer, minimum=0):
    if type(value) is not list or len(value) < minimum:
        _fail(pointer)
    return value


def _logical(value, pointer):
    name = _string(value, pointer)
    if (name.startswith("/") or "\\" in name or ":" in name
            or any(p in {"", ".", ".."} for p in name.split("/"))):
        _fail(pointer, "UNRESOLVED_PATH_SEMANTICS")
    return name


def _tag(value, pointer):
    """Explicit opaque semantic declaration bound to preverified exact identity."""
    if type(value) is not dict:
        _fail(pointer, "MISSING_INPUT_SEMANTICS")
    if value == {"state": "not_applicable"}:
        return dict(value)
    _object(value, {"state", "value"}, pointer, "MISSING_INPUT_SEMANTICS")
    if value["state"] != "present":
        _fail(pointer, "MISSING_INPUT_SEMANTICS")
    item = _object(value["value"], {"identity_sha256", "description"}, pointer + "/value")
    return {"state": "present", "value": {
        "identity_sha256": _sha(item["identity_sha256"], pointer + "/value/identity_sha256"),
        "description": _string(item["description"], pointer + "/value/description", False)}}


def _transform(value, pointer):
    if value in ({"state": "identity"}, {"state": "embedded"}):
        return dict(value)
    _object(value, {"state", "value"}, pointer, "MISSING_INPUT_SEMANTICS")
    if value["state"] != "present":
        _fail(pointer, "MISSING_INPUT_SEMANTICS")
    item = _object(value["value"], {"translation_mm", "rotation_deg", "scale"}, pointer + "/value")
    transformed = {}
    for field in ("translation_mm", "rotation_deg", "scale"):
        vector = _array(item[field], pointer + "/value/" + field)
        if len(vector) != 3:
            _fail(pointer + "/value/" + field)
        transformed[field] = [_number(x, pointer + "/value/" + field + "/" + str(i),
                                     positive=field == "scale") for i, x in enumerate(vector)]
    return {"state": "present", "value": transformed}


def _manifest(value, pointer, code):
    _object(value, {"schema_version", "entries"}, pointer, code)
    if value["schema_version"] != "0.1":
        _fail(pointer + "/schema_version", "UNSUPPORTED_CONTRACT_SCHEMA")
    entries = []
    for i, entry in enumerate(_array(value["entries"], pointer + "/entries", 1)):
        p = pointer + "/entries/" + str(i)
        _object(entry, {"logical_name", "sha256", "size", "role"}, p, code)
        entries.append({"logical_name": _logical(entry["logical_name"], p + "/logical_name"),
                        "sha256": _sha(entry["sha256"], p + "/sha256", code),
                        "size": _number(entry["size"], p + "/size", integer=True),
                        "role": _string(entry["role"], p + "/role")})
    names = [x["logical_name"] for x in entries]
    if len(names) != len(set(names)):
        _fail(pointer + "/entries")
    return {"schema_version": "0.1", "entries": sorted(entries, key=lambda x: x["logical_name"])}


def _profile(value, pointer):
    _object(value, {"sha256", "format"}, pointer)
    return {"sha256": _sha(value["sha256"], pointer + "/sha256"),
            "format": _string(value["format"], pointer + "/format")}


def _tree(value):
    _object(value, {"domain", "key_schema_version", "operation", "contracts",
                    "inputs", "profiles", "engine", "execution"}, "/identity")
    for field, expected in (("domain", DOMAIN), ("key_schema_version", "0.1"),
                            ("operation", "FULL_SLICE")):
        if value[field] != expected:
            _fail("/identity/" + field, "UNSUPPORTED_CONTRACT_SCHEMA")
    c = value["contracts"]
    _object(c, {"console_schema", "runner_version", "job_schema", "policies", "backend_bundle"},
            "/identity/contracts", "MISSING_BACKEND_IDENTITY")
    for field, expected in (("console_schema", "0.1"), ("runner_version", "0.2.0"),
                            ("job_schema", "0.2")):
        if c[field] != expected:
            _fail("/identity/contracts/" + field,
                  "UNSUPPORTED_JOB_SCHEMA" if field == "job_schema" else "UNSUPPORTED_CONTRACT_SCHEMA")
    _object(c["policies"], {"extraction", "argv", "environment", "resource", "paths", "backend"},
            "/identity/contracts/policies")
    policies = {}
    for name, policy in c["policies"].items():
        p = "/identity/contracts/policies/" + name
        _object(policy, {"version", "sha256"}, p)
        if policy["version"] != "0.1":
            _fail(p + "/version", "UNSUPPORTED_CONTRACT_SCHEMA")
        policies[name] = {"version": _string(policy["version"], p + "/version"),
                          "sha256": _sha(policy["sha256"], p + "/sha256")}
    backend = _manifest(c["backend_bundle"], "/identity/contracts/backend_bundle", "MISSING_BACKEND_IDENTITY")
    if not {"job.py", "runner.py"} <= {e["logical_name"] for e in backend["entries"]}:
        _fail("/identity/contracts/backend_bundle", "MISSING_BACKEND_IDENTITY")
    contracts = {**{k: c[k] for k in ("console_schema", "runner_version", "job_schema")},
                 "policies": policies, "backend_bundle": backend}

    inputs = []
    for i, item in enumerate(_array(value["inputs"], "/identity/inputs", 1)):
        p = "/identity/inputs/" + str(i)
        _object(item, {"slot", "format", "input_mode", "sha256", "role", "placement",
                       "intended_transform", "semantics"}, p, "MISSING_INPUT_SEMANTICS")
        slot = _number(item["slot"], p + "/slot", integer=True)
        if slot != str(i):
            _fail(p + "/slot")
        if item["input_mode"] not in {"mesh_import", "native_bambu_project"}:
            _fail(p + "/input_mode", "MISSING_INPUT_SEMANTICS")
        _object(item["semantics"], SEMANTICS, p + "/semantics", "MISSING_INPUT_SEMANTICS")
        inputs.append({"slot": slot, "format": _string(item["format"], p + "/format"),
                       "input_mode": item["input_mode"], "sha256": _sha(item["sha256"], p + "/sha256"),
                       "role": _string(item["role"], p + "/role"),
                       "placement": _transform(item["placement"], p + "/placement"),
                       "intended_transform": _transform(item["intended_transform"], p + "/intended_transform"),
                       "semantics": {k: _tag(v, p + "/semantics/" + k) for k, v in item["semantics"].items()}})

    p = "/identity/profiles"
    profiles = value["profiles"]
    _object(profiles, {"printer", "process", "filaments", "auxiliary", "nozzle",
                      "filament_mapping", "volume_mapping", "nozzle_mapping", "material_mapping", "map_mode"}, p)
    result_profiles = {k: _profile(profiles[k], p + "/" + k) for k in ("printer", "process")}
    for k in ("filaments", "auxiliary"):
        result_profiles[k] = [_profile(x, p + "/" + k + "/" + str(i))
                              for i, x in enumerate(_array(profiles[k], p + "/" + k, int(k == "filaments")))]
    result_profiles["nozzle"] = _number(profiles["nozzle"], p + "/nozzle", positive=True)
    count = len(result_profiles["filaments"])
    for k in ("filament_mapping", "volume_mapping", "nozzle_mapping", "material_mapping"):
        arr = _array(profiles[k], p + "/" + k)
        if len(arr) != count:
            _fail(p + "/" + k)
        result_profiles[k] = ([_string(x, p + "/" + k) for x in arr] if k == "material_mapping"
                              else [_number(x, p + "/" + k, integer=True) for x in arr])
    result_profiles["map_mode"] = _string(profiles["map_mode"], p + "/map_mode")

    engine = value["engine"]
    p = "/identity/engine"
    if type(engine) is dict and "resource_manifest" not in engine:
        _fail(p + "/resource_manifest", "MISSING_RESOURCE_IDENTITY")
    _object(engine, {"version", "executable_sha256", "platform_abi", "resource_manifest"}, p, "MISSING_ENGINE_IDENTITY")
    resource = _manifest(engine["resource_manifest"], p + "/resource_manifest", "MISSING_RESOURCE_IDENTITY")
    result_engine = {"version": _string(engine["version"], p + "/version"),
                     "executable_sha256": _sha(engine["executable_sha256"], p + "/executable_sha256", "MISSING_ENGINE_IDENTITY"),
                     "platform_abi": _string(engine["platform_abi"], p + "/platform_abi"),
                     "resource_manifest": resource}
    for field in ("version", "platform_abi"):
        if result_engine[field].casefold() == "unknown":
            _fail(p + "/" + field, "MISSING_ENGINE_IDENTITY")
    resources = {e["logical_name"] for e in resource["entries"]}

    execution = value["execution"]
    p = "/identity/execution"
    if type(execution) is dict:
        for field, code in (("environment", "MISSING_ENVIRONMENT_IDENTITY"),
                            ("argv", "UNCLASSIFIED_ARGV"), ("cwd", "UNRESOLVED_PATH_SEMANTICS")):
            if field not in execution:
                _fail(p + "/" + field, code)
    _object(execution, {"argv", "cwd", "environment", "transport", "provenance"}, p)
    def token(t, pointer):
        if type(t) is not dict or "kind" not in t:
            _fail(pointer, "UNCLASSIFIED_ARGV")
        kind = t["kind"]
        if kind in {"option", "literal", "decimal"}:
            _object(t, {"kind", "value"}, pointer, "UNCLASSIFIED_ARGV")
            v = _number(t["value"], pointer + "/value") if kind == "decimal" else _string(t["value"], pointer + "/value", False)
            return {"kind": kind, "value": v}
        if kind == "engine":
            _object(t, {"kind"}, pointer, "UNCLASSIFIED_ARGV")
            return dict(t)
        if kind == "input":
            _object(t, {"kind", "slot"}, pointer, "UNCLASSIFIED_ARGV")
            slot = _number(t["slot"], pointer + "/slot", integer=True)
            if int(slot) >= len(inputs):
                _fail(pointer, "UNCLASSIFIED_ARGV")
            return {"kind": kind, "slot": slot}
        if kind == "profile":
            _object(t, {"kind", "group", "slot"}, pointer, "UNCLASSIFIED_ARGV")
            group = t["group"]
            if type(group) is not str or group not in {"printer", "process", "filaments", "auxiliary"}:
                _fail(pointer, "UNCLASSIFIED_ARGV")
            slot = _number(t["slot"], pointer + "/slot", integer=True)
            limit = len(result_profiles[group]) if group in {"filaments", "auxiliary"} else 1
            if int(slot) >= limit:
                _fail(pointer, "UNCLASSIFIED_ARGV")
            return {"kind": kind, "group": group, "slot": slot}
        if kind == "profile_group":
            _object(t, {"kind", "items"}, pointer, "UNCLASSIFIED_ARGV")
            items = [token(x, pointer + "/items/" + str(i)) for i, x in enumerate(_array(t["items"], pointer + "/items", 1))]
            if any(x["kind"] != "profile" for x in items):
                _fail(pointer, "UNCLASSIFIED_ARGV")
            return {"kind": kind, "items": items}
        if kind in {"resource", "cwd"}:
            _object(t, {"kind", "logical_name"}, pointer, "UNRESOLVED_PATH_SEMANTICS")
            name = _logical(t["logical_name"], pointer + "/logical_name")
            if name not in resources:
                _fail(pointer, "UNRESOLVED_PATH_SEMANTICS")
            return {"kind": kind, "logical_name": name}
        if kind == "output":
            _object(t, {"kind", "slot", "alias"}, pointer, "UNRESOLVED_PATH_SEMANTICS")
            return {"kind": kind, "slot": _number(t["slot"], pointer + "/slot", integer=True),
                    "alias": _number(t["alias"], pointer + "/alias", integer=True)}
        _fail(pointer, "UNCLASSIFIED_ARGV")
    argv = [token(t, p + "/argv/" + str(i)) for i, t in enumerate(_array(execution["argv"], p + "/argv", 1))]
    if argv[0] != {"kind": "engine"}:
        _fail(p + "/argv/0", "UNCLASSIFIED_ARGV")
    output_aliases = {}
    for i, entry in enumerate(argv):
        if entry["kind"] == "output":
            if entry["slot"] in output_aliases and output_aliases[entry["slot"]] != entry["alias"]:
                _fail(p + "/argv/" + str(i), "UNRESOLVED_PATH_SEMANTICS")
            output_aliases[entry["slot"]] = entry["alias"]
    cwd = token(execution["cwd"], p + "/cwd")
    if cwd["kind"] != "cwd":
        _fail(p + "/cwd", "UNRESOLVED_PATH_SEMANTICS")
    env = _object(execution["environment"], {"variables"}, p + "/environment", "MISSING_ENVIRONMENT_IDENTITY")
    variables = []
    for i, var in enumerate(_array(env["variables"], p + "/environment/variables")):
        vp = p + "/environment/variables/" + str(i)
        if type(var) is not dict or var.get("state") not in {"unset", "present"}:
            _fail(vp, "MISSING_ENVIRONMENT_IDENTITY")
        _object(var, {"name", "state", "value"} if var["state"] == "present" else {"name", "state"}, vp)
        converted = {"name": _string(var["name"], vp + "/name"), "state": var["state"]}
        if var["state"] == "present":
            converted["value"] = _string(var["value"], vp + "/value", False)
        variables.append(converted)
    if len({v["name"] for v in variables}) != len(variables):
        _fail(p + "/environment/variables")
    result_execution = {"argv": argv, "cwd": cwd, "environment": {"variables": sorted(variables, key=lambda x: x["name"])},
                        "transport": _tag(execution["transport"], p + "/transport"),
                        "provenance": _tag(execution["provenance"], p + "/provenance")}
    return {"domain": DOMAIN, "key_schema_version": "0.1", "operation": "FULL_SLICE",
            "contracts": contracts, "inputs": inputs, "profiles": result_profiles,
            "engine": result_engine, "execution": result_execution}


def _serialize(tree):
    def encode(v):
        if type(v) is dict:
            if any(type(k) is not str or not k.isascii() for k in v):
                _fail("/serialization")
            return "{" + ",".join(encode(k) + ":" + encode(v[k]) for k in sorted(v)) + "}"
        if type(v) is list:
            return "[" + ",".join(encode(x) for x in v) + "]"
        if type(v) is bool:
            return "true" if v else "false"
        if type(v) is str:
            _string(v, "/serialization", False)
            escaped = "".join("\\u%04x" % ord(c) if ord(c) < 32 else
                              '\\"' if c == '"' else "\\\\" if c == "\\" else c for c in v)
            return '"' + escaped + '"'
        _fail("/serialization")
    return encode(tree).encode("utf-8")


def _pairs(pairs):
    obj = {}
    for key, value in pairs:
        if key in obj:
            _fail("/json/duplicate_key")
        obj[key] = value
    return obj


def _constant(_):
    _fail("/json/nonfinite")


def _descriptor(value):
    if type(value) in (str, bytes):
        try:
            if type(value) is bytes:
                value = value.decode("utf-8")
            value = json.loads(value, parse_int=Decimal, parse_float=Decimal,
                               parse_constant=_constant, object_pairs_hook=_pairs)
        except (UnicodeError, ValueError) as exc:
            if isinstance(exc, InvalidDescriptor):
                raise
            _fail("/json")
    _object(value, {"descriptor_schema_version", "verification", "identity", "provenance"}, "/")
    if value["descriptor_schema_version"] != DESCRIPTOR_SCHEMA_VERSION:
        _fail("/descriptor_schema_version", "UNSUPPORTED_CONTRACT_SCHEMA")
    _object(value["verification"], VERIFICATIONS, "/verification")
    provenance = value["provenance"]
    if type(provenance) is not dict or set(provenance) - PROVENANCE_FIELDS:
        _fail("/provenance")
    # Provenance can contain only text or ordered text arrays, not hidden execution fields.
    for name, entry in provenance.items():
        for text in entry if type(entry) is list else [entry]:
            _string(text, "/provenance/" + name, False)
    return value


def generate_key(descriptor):
    """Accept dict or raw UTF-8 JSON; return COMPLETE or HOLD/INCOMPLETE.

    COMPLETE additionally exposes CANONICAL_TREE and CANONICAL_BYTES for evidence.
    INCOMPLETE never exposes canonical bytes, digest or component digests.
    """
    result = {"KEY_SCHEMA_VERSION": KEY_SCHEMA_VERSION, "KEY_STATUS": "INCOMPLETE",
              "SLICE_KEY": None, "CANONICAL_INPUT_DIGESTS": None, "blockers": [],
              "status": "HOLD", "CANONICAL_TREE": None, "CANONICAL_BYTES": None}
    try:
        value = _descriptor(descriptor)
        for flag, code in VERIFICATIONS.items():
            if value["verification"][flag] is not True:
                result["blockers"].append({"code": code, "pointer": "/verification/" + flag})
        # Validate even when trust assertions are missing, to identify schema errors too.
        tree = _tree(value["identity"])
        if not result["blockers"]:
            data = _serialize(tree)
            digests = [{"pointer": "/" + k, "sha256": hashlib.sha256(_serialize(tree[k])).hexdigest()}
                       for k in sorted(tree) if k in {"contracts", "inputs", "profiles", "engine", "execution"}]
            result.update(KEY_STATUS="COMPLETE", status="COMPLETE",
                          SLICE_KEY=DOMAIN + ":sha256:" + hashlib.sha256(data).hexdigest(),
                          CANONICAL_INPUT_DIGESTS=digests, CANONICAL_TREE=tree, CANONICAL_BYTES=data)
    except InvalidDescriptor as exc:
        result["blockers"].append({"code": exc.code, "pointer": exc.pointer})
    except (TypeError, KeyError, UnicodeError, ArithmeticError, RecursionError):
        result["blockers"].append({"code": "INVALID_CANONICAL_INPUT", "pointer": "/"})
    result["blockers"] = sorted(result["blockers"], key=lambda x: (x["code"], x["pointer"]))
    return result
