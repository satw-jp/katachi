"""Pure A-only SLICE_KEY v0.2 generation; explicit API, never a JobSpec.

No I/O, process, discovery, Console or cache imports. A completeness attestations are
a trusted caller boundary, not evidence discovered or independently verified here.
"""
from decimal import Decimal
import hashlib
import json
import re

REQUEST_KEY_SCHEMA_VERSION = "0.2"
DOMAIN = "SLICE_KEY/v0.2"
DESCRIPTOR_SCHEMA_VERSION = "0.2"
_SHA = re.compile(r"[0-9a-f]{64}\Z")
_DECIMAL = re.compile(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?\Z")
PROVENANCE_FIELDS = {
    "request_id", "timestamp", "gui_display_name", "run_pointer", "artifact_pointers",
    "environment_fingerprint_pointer", "deep_runtime_provenance_pointer", "output_paths",
}
ATTESTATIONS = {
    "request_bytes_bound", "input_semantics_complete", "profile_mapping_complete",
    "engine_declaration_bound", "backend_coverage_complete",
    "selected_request_resource_coverage_complete", "execution_classification_complete",
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


def _declared(value, pointer):
    text = _string(value, pointer)
    if text.casefold() in {"unknown", "unclassified"}:
        _fail(pointer, "UNKNOWN_REQUEST_SEMANTICS")
    return text


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
        "identity_sha256": _sha(item["identity_sha256"], pointer + "/value/request_identity_sha256"),
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


def _manifest(value, pointer, code, minimum=0):
    _object(value, {"schema_version", "entries"}, pointer, code)
    if value["schema_version"] != "0.2":
        _fail(pointer + "/schema_version", "UNSUPPORTED_CONTRACT_SCHEMA")
    entries = []
    for i, entry in enumerate(_array(value["entries"], pointer + "/entries", minimum)):
        p = pointer + "/entries/" + str(i)
        _object(entry, {"logical_name", "sha256", "size", "role"}, p, code)
        entries.append({"logical_name": _logical(entry["logical_name"], p + "/logical_name"),
                        "sha256": _sha(entry["sha256"], p + "/sha256", code),
                        "size": _number(entry["size"], p + "/size", integer=True),
                        "role": _string(entry["role"], p + "/role")})
    names = [x["logical_name"] for x in entries]
    if len(names) != len(set(names)):
        _fail(pointer + "/entries")
    return {"schema_version": "0.2", "entries": sorted(entries, key=lambda x: x["logical_name"])}


def _profile(value, pointer):
    _object(value, {"sha256", "format"}, pointer)
    return {"sha256": _sha(value["sha256"], pointer + "/sha256"),
            "format": _declared(value["format"], pointer + "/format")}


def _tree(value):
    _object(value, {"domain", "key_schema_version", "operation", "contracts",
                    "backend_bundle", "inputs", "profiles", "engine", "selected_request_resources", "execution"}, "/request_identity")
    for field, expected in (("domain", DOMAIN), ("key_schema_version", "0.2"),
                            ("operation", "FULL_SLICE")):
        if value[field] != expected:
            _fail("/request_identity/" + field, "UNSUPPORTED_CONTRACT_SCHEMA")
    c = value["contracts"]
    _object(c, {"console_schema", "runner_version", "job_schema", "policies"},
            "/request_identity/contracts", "MISSING_BACKEND_IDENTITY")
    for field, expected in (("console_schema", "0.1"), ("runner_version", "0.2.0"),
                            ("job_schema", "0.2")):
        if c[field] != expected:
            _fail("/request_identity/contracts/" + field,
                  "UNSUPPORTED_JOB_SCHEMA" if field == "job_schema" else "UNSUPPORTED_CONTRACT_SCHEMA")
    _object(c["policies"], {"extraction", "argv", "semantic_env", "request_resource", "paths", "backend"},
            "/request_identity/contracts/policies")
    policies = {}
    for name, policy in c["policies"].items():
        p = "/request_identity/contracts/policies/" + name
        _object(policy, {"version", "sha256"}, p)
        if not _string(policy["version"], p + "/version") or policy["version"].casefold() in {"unknown", "unclassified"}:
            _fail(p + "/version", "UNSUPPORTED_CONTRACT_SCHEMA")
        policies[name] = {"version": _string(policy["version"], p + "/version"),
                          "sha256": _sha(policy["sha256"], p + "/sha256")}
    bp = "/request_identity/backend_bundle"
    bundle = _object(value["backend_bundle"], {"schema_version", "entries", "custom_execution_dependencies"}, bp)
    backend = _manifest({k: bundle[k] for k in ("schema_version", "entries")}, bp, "MISSING_BACKEND_IDENTITY", 3)
    custom = [_logical(x, bp + "/custom_execution_dependencies") for x in _array(bundle["custom_execution_dependencies"], bp)]
    core = {"job.py", "runner.py", "progress.py"}
    if len(set(custom)) != len(custom) or core.intersection(custom):
        _fail(bp, "MISSING_BACKEND_IDENTITY")
    if {e["logical_name"] for e in backend["entries"]} != core | set(custom):
        _fail(bp, "MISSING_BACKEND_IDENTITY")
    for entry in backend["entries"]:
        expected = "backend_core" if entry["logical_name"] in core else "custom_execution_dependency"
        if entry["role"] != expected:
            _fail(bp, "MISSING_BACKEND_IDENTITY")
    backend["custom_execution_dependencies"] = sorted(custom)
    contracts = {**{k: c[k] for k in ("console_schema", "runner_version", "job_schema")}, "policies": policies}

    inputs = []
    for i, item in enumerate(_array(value["inputs"], "/request_identity/inputs", 1)):
        p = "/request_identity/inputs/" + str(i)
        _object(item, {"slot", "format", "input_mode", "sha256", "role", "placement",
                       "intended_transform", "semantics"}, p, "MISSING_INPUT_SEMANTICS")
        slot = _number(item["slot"], p + "/slot", integer=True)
        if slot != str(i):
            _fail(p + "/slot")
        if item["input_mode"] not in {"mesh_import", "native_bambu_project"}:
            _fail(p + "/input_mode", "MISSING_INPUT_SEMANTICS")
        _object(item["semantics"], SEMANTICS, p + "/semantics", "MISSING_INPUT_SEMANTICS")
        inputs.append({"slot": slot, "format": _declared(item["format"], p + "/format"),
                       "input_mode": item["input_mode"], "sha256": _sha(item["sha256"], p + "/sha256"),
                       "role": _declared(item["role"], p + "/role"),
                       "placement": _transform(item["placement"], p + "/placement"),
                       "intended_transform": _transform(item["intended_transform"], p + "/intended_transform"),
                       "semantics": {k: _tag(v, p + "/semantics/" + k) for k, v in item["semantics"].items()}})

    p = "/request_identity/profiles"
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
        result_profiles[k] = ([_declared(x, p + "/" + k) for x in arr] if k == "material_mapping"
                              else [_number(x, p + "/" + k, integer=True) for x in arr])
    result_profiles["map_mode"] = _declared(profiles["map_mode"], p + "/map_mode")

    engine = value["engine"]
    p = "/request_identity/engine"
    _object(engine, {"version", "executable_sha256"}, p, "MISSING_ENGINE_IDENTITY")
    result_engine = {"version": _string(engine["version"], p + "/version"),
                     "executable_sha256": _sha(engine["executable_sha256"], p + "/executable_sha256", "MISSING_ENGINE_IDENTITY")}
    if result_engine["version"].casefold() in {"unknown", "unclassified"}:
        _fail(p + "/version", "MISSING_ENGINE_IDENTITY")
    rp = "/request_identity/selected_request_resources"
    selected = _object(value["selected_request_resources"], {"schema_version", "entries", "selection"}, rp)
    selection = _object(selected["selection"], {"policy_sha256", "role", "evidence_pointer"}, rp + "/selection")
    if (selection["policy_sha256"] != policies["request_resource"]["sha256"]
            or selection["role"] != "selected_toolpath_request_configuration"):
        _fail(rp + "/selection", "MISSING_REQUEST_RESOURCE_SELECTION")
    _string(selection["evidence_pointer"], rp + "/selection/evidence_pointer")
    resource = _manifest({k: selected[k] for k in ("schema_version", "entries")}, rp, "MISSING_REQUEST_RESOURCE_IDENTITY")
    if any(e["role"] != "toolpath_request_configuration" for e in resource["entries"]):
        _fail(rp, "MISSING_REQUEST_RESOURCE_SELECTION")
    # Evidence location is non-key; selected role and exact policy binding are key.
    resource["selection"] = {k: selection[k] for k in ("policy_sha256", "role")}
    resources = {e["logical_name"] for e in resource["entries"]}

    execution = value["execution"]
    p = "/request_identity/execution"
    if type(execution) is dict:
        for field, code in (("semantic_env_overrides", "UNCLASSIFIED_ENV_OVERRIDE"),
                            ("argv", "UNCLASSIFIED_ARGV"), ("cwd", "UNRESOLVED_PATH_SEMANTICS")):
            if field not in execution:
                _fail(p + "/" + field, code)
    _object(execution, {"argv", "cwd", "semantic_env_overrides", "transport"}, p)
    def token(t, pointer):
        if type(t) is not dict or "kind" not in t:
            _fail(pointer, "UNCLASSIFIED_ARGV")
        kind = t["kind"]
        if kind in {"option", "literal", "decimal", "opaque_path"}:
            _object(t, {"kind", "value"}, pointer, "UNCLASSIFIED_ARGV")
            v = _number(t["value"], pointer + "/value") if kind == "decimal" else _string(t["value"], pointer + "/value", kind == "opaque_path")
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
        if kind == "resource":
            _object(t, {"kind", "logical_name"}, pointer, "UNRESOLVED_PATH_SEMANTICS")
            name = _logical(t["logical_name"], pointer + "/logical_name")
            if name not in resources:
                _fail(pointer, "UNRESOLVED_PATH_SEMANTICS")
            return {"kind": kind, "logical_name": name}
        if kind == "output":
            _object(t, {"kind", "slot", "alias", "neutral_rule"}, pointer, "UNRESOLVED_PATH_SEMANTICS")
            rule = _object(t["neutral_rule"], {"id", "policy_sha256"}, pointer + "/neutral_rule")
            if rule != {"id": "output_only_destination", "policy_sha256": policies["paths"]["sha256"]}:
                _fail(pointer, "UNRESOLVED_PATH_SEMANTICS")
            return {"kind": kind, "slot": _number(t["slot"], pointer + "/slot", integer=True),
                    "alias": _number(t["alias"], pointer + "/alias", integer=True), "neutral_rule": dict(rule)}
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
    if cwd["kind"] != "opaque_path":
        _fail(p + "/cwd", "UNRESOLVED_PATH_SEMANTICS")
    variables = []
    for i, var in enumerate(_array(execution["semantic_env_overrides"], p + "/semantic_env_overrides")):
        vp = p + "/semantic_env_overrides/" + str(i)
        if type(var) is not dict or var.get("state") not in {"unset", "present"}:
            _fail(vp, "UNCLASSIFIED_ENV_OVERRIDE")
        _object(var, {"name", "classification", "state", "value"} if var["state"] == "present" else {"name", "classification", "state"}, vp)
        if var["classification"] != "semantic_override":
            _fail(vp, "UNCLASSIFIED_ENV_OVERRIDE")
        converted = {"name": _string(var["name"], vp + "/name"), "classification": "semantic_override", "state": var["state"]}
        if var["state"] == "present":
            converted["value"] = _string(var["value"], vp + "/value", False)
        variables.append(converted)
    if len({v["name"] for v in variables}) != len(variables):
        _fail(p + "/semantic_env_overrides")
    result_execution = {"argv": argv, "cwd": cwd, "semantic_env_overrides": sorted(variables, key=lambda x: x["name"]),
                        "transport": _tag(execution["transport"], p + "/transport")}
    return {"domain": DOMAIN, "key_schema_version": "0.2", "operation": "FULL_SLICE",
            "contracts": contracts, "backend_bundle": backend, "inputs": inputs, "profiles": result_profiles,
            "engine": result_engine, "selected_request_resources": resource, "execution": result_execution}


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
    _object(value, {"descriptor_schema_version", "request_attestations", "request_identity", "provenance"}, "/")
    if value["descriptor_schema_version"] != DESCRIPTOR_SCHEMA_VERSION:
        _fail("/descriptor_schema_version", "UNSUPPORTED_CONTRACT_SCHEMA")
    _object(value["request_attestations"], ATTESTATIONS, "/request_attestations")
    provenance = value["provenance"]
    if type(provenance) is not dict or set(provenance) - PROVENANCE_FIELDS:
        _fail("/provenance")
    # Provenance can contain only text or ordered text arrays, not hidden execution fields.
    for name, entry in provenance.items():
        for text in entry if type(entry) is list else [entry]:
            _string(text, "/provenance/" + name, False)
    return value


def generate_request_key_v0_2(descriptor):
    """Pure dict/raw UTF-8 JSON -> A COMPLETE or HOLD/INCOMPLETE.

    Caller attestations establish only finite A coverage, never B/C compatibility.
    No old descriptor dispatch, migration, file reads, or evidence verification.
    """
    result = {"REQUEST_KEY_SCHEMA_VERSION": REQUEST_KEY_SCHEMA_VERSION, "REQUEST_STATUS": "INCOMPLETE",
              "SLICE_KEY": None, "CANONICAL_REQUEST_DIGESTS": None, "blockers": [],
              "status": "HOLD", "CANONICAL_REQUEST_TREE": None, "CANONICAL_REQUEST_BYTES": None}
    try:
        value = _descriptor(descriptor)
        for flag in ATTESTATIONS:
            if value["request_attestations"][flag] is not True:
                result["blockers"].append({"code": "INCOMPLETE_REQUEST_COVERAGE", "pointer": "/request_attestations/" + flag})
        tree = _tree(value["request_identity"])
        if not result["blockers"]:
            data = _serialize(tree)
            digests = [{"pointer": "/" + k, "sha256": hashlib.sha256(_serialize(tree[k])).hexdigest()}
                       for k in sorted(tree) if k not in {"domain", "key_schema_version", "operation"}]
            result.update(REQUEST_STATUS="COMPLETE", status="COMPLETE",
                          SLICE_KEY=DOMAIN + ":sha256:" + hashlib.sha256(data).hexdigest(),
                          CANONICAL_REQUEST_DIGESTS=digests, CANONICAL_REQUEST_TREE=tree, CANONICAL_REQUEST_BYTES=data)
    except InvalidDescriptor as exc:
        result["blockers"].append({"code": exc.code, "pointer": exc.pointer})
    except (TypeError, KeyError, UnicodeError, ArithmeticError, RecursionError):
        result["blockers"].append({"code": "INVALID_CANONICAL_INPUT", "pointer": "/"})
    result["blockers"] = sorted(result["blockers"], key=lambda x: (x["code"], x["pointer"]))
    return result
