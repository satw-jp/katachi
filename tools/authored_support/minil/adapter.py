"""Issue #64 geometry inspection adapter; incomplete recipe fails closed before Support."""
from pathlib import Path
import argparse
import hashlib
import json
import platform
import shutil
import sys

from .dispatch import Stage, dispatch
from ..mesh_backend import ManifoldKernel
from ..source_io import sha256_file
from ..runtime_guard import offline

CASE_ID = "MINIL_B115_PROVISIONAL"
STOP = "MINIL_SOL_AUTHORED_SUPPORT_ADAPTER_HOLD"
TARGET = "e48b2a1ca56d30e6d91a1f3bc14807e279b72be53b3501c6b1806926061df723"
STRUCTURE = "ed07e2e20226accbaf920e41e568ab74d9d3159c9ae32a53a5bde368c44014a4"

def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))

def write(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, allow_nan=False, indent=2) + "\n", encoding="utf-8")

def require(condition, message):
    if not condition:
        raise ValueError(message)

def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
        separators=(",", ":"), allow_nan=False).encode()).hexdigest()

def array_semantic(arrays, np):
    # Exact frozen MINIL core.py canonical_array_digest, not MINI_A transform.
    h = hashlib.sha256()
    for name in sorted(arrays):
        value = np.asarray(arrays[name])
        kind = value.dtype.kind
        dtype = "<f8" if kind == "f" else "<i8" if kind in "iu" else "u1" if kind == "b" else None
        require(dtype is not None, "UNSUPPORTED_ARRAY")
        value = np.asarray(value, dtype=dtype, order="C")
        h.update(name.encode() + b"\0")
        h.update(str(value.shape).encode() + b"\0")
        h.update(value.tobytes(order="C"))
    return h.hexdigest()

def mesh_semantic(v, f, np):
    # Exact original canonical_mesh_digest (quantized unordered faces).
    q = np.rint(np.asarray(v, dtype=np.float64) * 1e7).astype("<i8")
    order = np.lexsort((q[:, 2], q[:, 1], q[:, 0]))
    inverse = np.empty(len(order), dtype=np.int64)
    inverse[order] = np.arange(len(order))
    remapped = np.sort(inverse[f], axis=1)
    face_order = np.lexsort((remapped[:, 2], remapped[:, 1], remapped[:, 0]))
    h = hashlib.sha256(q[order].tobytes())
    h.update(np.asarray(remapped[face_order], dtype="<i8", order="C").tobytes())
    return h.hexdigest()

def arrays(path, np):
    with np.load(path, allow_pickle=False) as data:
        return {key: data[key] for key in data.files}

def check_ranges(rows, mesh, np, *, ids=False):
    require(len(mesh["vertex_offsets"]) == len(rows) + 1, "VERTEX_OFFSET_COUNT")
    require(len(mesh["face_offsets"]) == len(rows) + 1, "FACE_OFFSET_COUNT")
    require(mesh["vertex_offsets"][0] == mesh["face_offsets"][0] == 0, "OFFSET_START")
    require(mesh["vertex_offsets"][-1] == len(mesh["vertices"]), "VERTEX_END")
    require(mesh["face_offsets"][-1] == len(mesh["faces"]), "FACE_END")
    require(np.isfinite(mesh["vertices"]).all(), "NONFINITE_MESH")
    for i, row in enumerate(rows):
        va, vb = map(int, mesh["vertex_offsets"][i:i+2])
        fa, fb = map(int, mesh["face_offsets"][i:i+2])
        require(vb > va and fb > fa, "EMPTY_MEMBER")
        require(row["mesh_vertex_range" if ids else "vertex_range"] == [va, vb], "VERTEX_RANGE")
        require(row["mesh_face_range" if ids else "face_range"] == [fa, fb], "FACE_RANGE")
        require((mesh["faces"][fa:fb] >= va).all() and (mesh["faces"][fa:fb] < vb).all(), "CROSS_MEMBER_FACE")
        if ids:
            require(str(mesh["member_ids"][i]) == row["id"], "MEMBER_ID_BINDING")

def bind(c):
    np, paths = c["np"], c["paths"]
    p = arrays(paths["placements"], np)
    d6 = arrays(paths["d6"], np)
    st = read(paths["structure"])
    anchors = read(paths["anchors"])["items"]
    members = arrays(paths["members"], np)
    overlay = arrays(paths["overlay_mesh"], np)
    design = read(paths["overlay_design"])
    require(array_semantic(p, np) == TARGET, "TARGET_SEMANTIC_CHANGED")
    keys = ("id", "role", "parent_id", "target_id", "target_component_id", "representative_flower_id",
        "points_mm", "main_diameter_mm", "terminal_diameter_mm", "taper_length_mm", "rule_version",
        "geometry_semantic_sha256", "mesh_geometry_sha256")
    sem = digest([{k: m.get(k) for k in keys} for m in sorted(st["members"], key=lambda r:r["id"])])
    require(sem == STRUCTURE, "STRUCTURE_SEMANTIC_CHANGED")
    require(len(p["position_mm"]) == len(anchors) == 2303, "FLOWER_COUNT")
    require(len(st["members"]) == 2885, "PERMANENT_COUNT")
    flower_ids = [a["instance_id"] for a in anchors]
    member_ids = [m["id"] for m in st["members"]]
    require(len(set(flower_ids)) == 2303 and len(set(member_ids)) == 2885, "DUPLICATE_IDS")
    require(not set(flower_ids).intersection(member_ids), "ROLE_ID_COLLISION")
    require(np.array_equal(np.array([a["anchor_world_mm"] for a in anchors]),p["anchor_world_mm"]), "ANCHOR_BINDING")
    require(all(np.isfinite(a).all() for a in p.values()), "NONFINITE_PLACEMENTS")
    require((p["physical_scale"] > 0).all(), "SCALE")
    require(np.allclose(p["rotation_matrix"] @ np.transpose(p["rotation_matrix"], (0,2,1)), np.eye(3), atol=1e-12, rtol=0), "ROTATION")
    require(np.allclose(np.linalg.det(p["rotation_matrix"]), 1, atol=1e-12, rtol=0), "ROTATION_REFLECTION")
    require(np.allclose(np.linalg.norm(p["normal"], axis=1), 1, atol=1e-12, rtol=0), "NORMAL")
    require(d6["faces"].min() >= 0 and d6["faces"].max() < len(d6["vertices"]), "D6_FACES")
    check_ranges(st["members"], members, np, ids=True)
    branches = design["branches"]
    require(len(branches) == design["branch_count"] == 115, "OVERLAY_COUNT")
    check_ranges(branches, overlay, np)
    source_ids = [(b["source"], b["source_id"]) for b in branches]
    require(len(set(source_ids)) == 115, "OVERLAY_SOURCE_ID_DUPLICATE")
    for b in branches:
        require(b["root_member"] in member_ids, "OVERLAY_ROOT_ID")
        for contact in b["tip_contacts"]:
            if "flower" in contact:
                require(1 <= contact["flower"] <= 2303, "OVERLAY_TARGET_ID")
    identity = {"target_semantic_sha256":TARGET, "structure_semantic_sha256":STRUCTURE,
        "flower_count":2303, "permanent_b0_count":2885, "overlay_count":115,
        "working_case":CASE_ID, "overlay_accepted_as_baseline":False,
        "d6_sha256":sha256_file(paths["d6"]), "placement_npz_authority":True,
        "source_semantics_recomputed":True, "repair_binding":"UNRESOLVED_ONE_PIECE_OWNERSHIP"}
    c.update(p=p, d6=d6, st=st, anchors=anchors, members=members, overlay=overlay,
             branches=branches, flower_ids=flower_ids)
    write(c["out"]/"INPUT_IDENTITY.json", identity)
    return {"status":"PASS", **identity}

def derive(c):
    np, k = c["np"], c["kernel"]
    p, d6, mesh = c["p"], c["d6"], c["members"]
    frame = read(c["paths"]["frame"])
    tr = np.asarray(frame["after_transform"], dtype=float)
    r, t = tr[:9].reshape(3,3).T, tr[9:]
    require(np.allclose(r@r.T,np.eye(3),atol=1e-12,rtol=0) and np.isclose(np.linalg.det(r),1), "NONRIGID_BUILD_TRANSFORM")
    shift = np.asarray(c["case"]["source_to_original_native_translation_mm"])
    # Reproduce documented original float32 export before cycle2 rigid placement.
    def plate(v):
        return (np.asarray(v, dtype=float) + shift).astype(np.float32).astype(float) @ r.T + t
    require(k.man(d6["vertices"],d6["faces"]).status() == k.md.Error.NoError, "INVALID_D6_SOLID")
    frows, bbox, normals, low = [], [], [], []
    template_tri = d6["vertices"][d6["faces"]].astype(float)
    template_cross = np.cross(template_tri[:,1]-template_tri[:,0], template_tri[:,2]-template_tri[:,0])
    for i, fid in enumerate(c["flower_ids"]):
        v = plate(d6["vertices"]@(p["rotation_matrix"][i]*p["physical_scale"][i]).T+p["position_mm"][i])
        b = [v.min(0).tolist(), v.max(0).tolist()]
        normal = p["normal"][i]@r.T
        cross = template_cross @ p["rotation_matrix"][i].T @ r.T
        down = int((cross[:,2] < 0).sum()) # sign only, not a chosen overhang/contact threshold
        idx = int(np.argmin(v[:,2]))
        frows.append({"id":fid,"role":"FLOWER","source_instance_index":i,
            "physical_scale_already_applied":float(p["physical_scale"][i]),
            "bbox_plate_mm":b,"outward_normal_plate":normal.tolist(),
            "minimum_vertex_index":idx,"minimum_vertex_plate_mm":v[idx].tolist(),
            "downward_oriented_triangle_count":down,
            "contact_selected":False,"reason":"RECIPE_UNBOUND"})
        bbox.append(b); normals.append(normal); low.append(v[idx])
        if i % 500 == 0: print("FLOWER_GEOMETRY",i,flush=True)
    mrows = []
    mv = plate(mesh["vertices"])
    for i, m in enumerate(c["st"]["members"]):
        a,b = m["mesh_vertex_range"]; x,y = m["mesh_face_range"]
        v=mesh["vertices"][a:b]; f=mesh["faces"][x:y].astype(np.int64)-a
        require(mesh_semantic(v,f,np)==m["mesh_geometry_sha256"], "MEMBER_MESH_IDENTITY:"+m["id"])
        solid=k.man(v,f)
        require(solid.status()==k.md.Error.NoError and solid.volume()>0, "INVALID_MEMBER_SOLID:"+m["id"])
        mrows.append({"id":m["id"],"role":"PERMANENT","source_role":m["role"],
            "mesh_vertex_range":[a,b],"mesh_face_range":[x,y],
            "bbox_plate_mm":[mv[a:b].min(0).tolist(),mv[a:b].max(0).tolist()],
            "source_solid_volume_mm3":float(solid.volume()),"solid_valid":True,
            "points_plate_mm":plate(m["points_mm"]).tolist()})
    orows=[]
    for i,b in enumerate(c["branches"]):
        a,z=b["vertex_range"]; x,y=b["face_range"]
        v=c["overlay"]["vertices"][a:z]; f=c["overlay"]["faces"][x:y].astype(np.int64)-a
        solid=k.man(v,f)
        require(solid.status()==k.md.Error.NoError and solid.volume()>0, "INVALID_OVERLAY_SOLID")
        orows.append({"id":f"MINIL_B115_{i+1:03d}","role":"PERMANENT_PROVISIONAL",
            "source":b["source"],"source_id":b["source_id"],"root_member":b["root_member"],
            "target_flower_ids":[c["flower_ids"][v["flower"]-1] for v in b["tip_contacts"] if "flower" in v],
            "vertex_range":[a,z],"face_range":[x,y],"solid_volume_mm3":float(solid.volume()),
            "bbox_plate_mm":[v.min(0).tolist(),v.max(0).tolist()],
            "source_solid_array_sha256":hashlib.sha256(v.tobytes()+f.tobytes()).hexdigest()})
    out=c["out"]
    write(out/"FLOWER_GEOMETRY.json",frows)
    write(out/"PERMANENT_GEOMETRY.json",mrows)
    write(out/"B115_SOURCE_LEDGER.json",orows)
    np.savez_compressed(out/"FLOWER_DERIVED.npz",bbox_plate_mm=bbox,normal_plate=normals,minimum_vertex_plate_mm=low)
    bounds=np.asarray(bbox)
    write(out/"FRAME_AUDIT.json",{"frame":"cycle2_grounded_build_before_slicer_raft_lift",
        "units":"mm","source_to_original_native_translation_mm":shift.tolist(),
        "original_native_export_quantization":"float32, no second 11/15 scale",
        "cycle2_build_transform":tr.tolist(),"rigid_transform_valid":True,
        "physical_plate_z_mm":0,"raft_support_top_z_mm":None,
        "artwork_min_z_mm":float(min(bounds[:,0,2].min(),mv[:,2].min())),
        "raft_note":"Grounded geometry frame is NOT the physical raft-top seating frame; no Z offset invented.",
        "flower_local_scale_min_max":[float(p["physical_scale"].min()),float(p["physical_scale"].max())]})
    coverage={"status":"GEOMETRY_INVENTORY_ONLY","b0":{"flowers":2303,"permanent":2885,"source_semantic":STRUCTURE},
        "b115":{"same_b0":True,"additional_members":115,"target_flower_ids":sorted({f for row in orows for f in row["target_flower_ids"]})},
        "support_coverage_b0":None,"support_coverage_b115":None,"reason":"NO_BOUND_SUPPORT_RECIPE; no success credit from branch bbox or old G-code"}
    write(out/"B0_B115_COMPARISON.json",coverage)
    c.update(frows=frows,mrows=mrows,orows=orows)
    return {"status":"PASS","flower_inputs_derived":2303,"member_mesh_identity_and_solids_checked":2885,
        "provisional_solids_checked":115,"support_contacts_selected":0,"chronology":"NOT_COMPUTED"}

def recipe_gate(c):
    blockers=c["recipe"]["unresolved"]
    write(c["out"]/"RISK_LEDGER.json",{"status":"HOLD","blockers":blockers,
        "physical_risk_classification":"UNKNOWN_NO_SUPPORT_CANDIDATE"})
    return {"status":"HOLD","code":"MINIL_RECIPE_AND_SOURCE_MAPPING_UNBOUND","blocker_ids":[r["id"] for r in blockers]}

def build_support(c):
    # Deliberately cannot call fixed-case lower_support/downstream on a different case.
    return {"status":"HOLD","code":"MINIL_GEOMETRY_GENERATION_NOT_IMPLEMENTED_FOR_UNBOUND_RECIPE"}

def validate_output_destination(output, inputs):
    output=Path(output).resolve()
    require(not output.exists(),"OUTPUT_ALREADY_EXISTS")
    for source in inputs:
        source=Path(source).resolve()
        require(output != source and source not in output.parents and output not in source.parents, "OUTPUT_OVERLAPS_SOURCE")
    return output

def run(case_path, roots_path, out):
    case_path=Path(case_path).resolve()
    preset=case_path.parent
    case=read(case_path); recipe=read(preset/"RECIPE_MINIL.json")
    roots=read(roots_path)["roots"]
    require(case["case_id"]==recipe["case_id"]==CASE_ID, "CASE_ID_MISMATCH")
    lock=read(preset/"SOURCE_LOCK.json")
    paths={r["name"]:Path(roots[r["root"]])/r["path"] for r in lock["files"]}
    out=validate_output_destination(out,[*map(Path,roots.values()),preset])
    before={}
    for row in lock["files"]:
        p=paths[row["name"]]
        require(p.is_file() and sha256_file(p)==row["sha256"],"SOURCE_HASH_MISMATCH:"+row["name"])
        before[row["name"]]=row["sha256"]
    require(paths["cycle2_project"].suffix==".3mf","PROJECT_SOURCE_TYPE")
    out.mkdir(parents=True)
    for name in ["CASE_MINIL.json","RECIPE_MINIL.json","OVERRIDES_MINIL.json","SOURCE_LOCK.json","ADAPTER_DIFF.md"]:
        shutil.copyfile(preset/name,out/name)
    write(out/"ROOTS.local.json",read(roots_path))
    k=ManifoldKernel.from_runtime_root(Path(roots["geometry_runtime"]))
    c={"case":case,"recipe":recipe,"paths":paths,"np":k.np,"kernel":k,"out":out}
    stages=[Stage("MINIL_SOURCE_BINDING",bind),Stage("MINIL_GEOMETRY_DERIVATION",derive,("MINIL_SOURCE_BINDING",)),
        Stage("MINIL_RECIPE_GATE",recipe_gate,("MINIL_SOURCE_BINDING",)),
        Stage("MINIL_SUPPORT_GENERATION",build_support,("MINIL_GEOMETRY_DERIVATION","MINIL_RECIPE_GATE"))]
    with offline(generation=True,source=Path(roots["minil"]),allowed=list(paths.values())) as audit:
        records=dispatch(case["case_id"],CASE_ID,stages,c)
    after={name:sha256_file(p) for name,p in paths.items()}
    require(before==after,"SOURCE_MUTATION")
    write(out/"SOURCE_BEFORE_AFTER.json",{"unchanged":True,"before":before,"after":after})
    write(out/"STAGES.json",records)
    write(out/"SUPPORT_GEOMETRY.json",{"case_id":CASE_ID,"status":STOP,"candidate_generated":False,
        "objects":[],"mesh_count":0,"not_a_zero_risk_candidate":True,"print_go":False})
    write(out/"SUPPORT_CONTACT_AND_REMOVAL.json",{"status":"NOT_GENERATED","contacts":[],"cuts":[],
        "access_paths":[],"fragment_escape_paths":[],"reason":"RECIPE_GATE_HOLD"})
    checks={x:"NOT_RUN_NO_CANDIDATE" for x in ["actual_solid_contacts","non_target_collisions","bed_root_paths",
        "chronological_geometry_proxy","separation_fragments","tool_corridors","trapped_pieces","protected_exterior"]}
    write(out/"VALIDATION.json",{"status":STOP,"input_identity":"PASS","input_solids":"PASS","source_unchanged":True,
        "support_checks":checks,"slice_count":0,"send_count":0,"print_count":0,"print_go":False})
    write(out/"UNHANDLED.json",{"source_flower_ids":c["flower_ids"],"count":2303,
        "reason":"No contact demand/selection inferred from bottom vertex or unbound legacy thresholds"})
    write(out/"RUNTIME_AUDIT.json",{"python":platform.python_version(),"numpy":k.np.__version__,
        "kernel":"manifold3d 3.5.2 pinned MINI_A runtime","network_used":False,
        "external_processes_started":False,"blocked_external_events":audit["blocked_external_events"],
        "source_reads":sorted(audit["source_reads"]),"golden_read":False,"old_gcode_read":False,
        "legacy_override_ids_applied":[],"native_project_used_for_identity_only":True})
    write(out/"RESULT.json",{"stop":STOP,"candidate_generated":False,"support_meshes":0,
        "astra_scope":"SOURCE_BLOCKERS_ONLY","print_go":False,"slice":0,"send":0,"print":0})
    print(STOP,flush=True)
    return 2

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--case",required=True);p.add_argument("--roots",required=True);p.add_argument("--out",required=True)
    a=p.parse_args()
    return run(a.case,a.roots,a.out)

if __name__=="__main__":
    sys.exit(main())
