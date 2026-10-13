"""Pure replay of the two pinned V4 removal algorithms. No saved answer input.

The 2 mm swept bounding boxes are the historical proxy, not physical certification.
"""
from __future__ import annotations
import math
import json
from pathlib import Path
from ..contracts import ContractError
from ..source_io import read_json, sha256_file

LEGACY_SOURCE_CODE_SHA256 = {'R4_V2_V3_A1_EXPERIMENTAL_V4/reproduce/check_geometry.py': 'd3a2db4481d12f8abcf26f2b02f3f965e71dcc0aa72565dacb59e573d4d1647b', 'R4_V2_V3_A1_EXPERIMENTAL_V4/reproduce/removal_below.py': 'ca8fc76181c44d22415a8c9f3b8cdc623e7a332954bf43a1bf3a6c5e2e893149'}

def generate_removal(candidates, body, *, np):
    ids = [m['id'] for m in candidates]
    if not candidates or len(ids) != len(set(ids)):
        raise ContractError('empty or duplicate D2 candidate IDs')
    body_ids = [m['id'] for m in body]
    if len(body_ids) != len(set(body_ids)) or set(ids) & set(body_ids):
        raise ContractError('duplicate or colliding BODY/D2 IDs')
    if any(m['target'] not in body_ids for m in candidates):
        raise ContractError('D2 target missing from BODY')
    allitems = body
    remaining={x['id']:x for x in candidates};sequence=[]
    box_cache={ob['id']:np.array(ob['bbox_mm']) for ob in allitems+candidates}
    def ray(p,direction,obstacles,exclude):
     b=np.array([box_cache[ob['id']] for ob in obstacles if ob['id'] not in exclude]);b=b[(b[:,0,2]-1<=p[2])&(b[:,1,2]+1>=p[2])];enter=np.full(len(b),1.5);leave=np.full(len(b),260.)
     for ax in [0,1]:
      if abs(direction[ax])<1e-10:
       outside=(p[ax]<b[:,0,ax]-1)|(p[ax]>b[:,1,ax]+1);leave[outside]=-1
      else:
       t0=(b[:,0,ax]-1-p[ax])/direction[ax];t1=(b[:,1,ax]+1-p[ax])/direction[ax];enter=np.maximum(enter,np.minimum(t0,t1));leave=np.minimum(leave,np.maximum(t0,t1))
     return not np.any(enter<=leave)
    body_clear_cache={}
    while remaining:
     chosen=None
     for m in sorted(remaining.values(),key=lambda x:(x['height_mm'],x['id'])):
      p=np.array(m['cut_mm'])
      for angle in np.arange(24)*2*np.pi/24:
       direction=np.array([np.cos(angle),np.sin(angle),0])
       key=(m['id'],float(angle))
       if key not in body_clear_cache:body_clear_cache[key]=ray(p,direction,allitems,{m['target']})
       if body_clear_cache[key] and ray(p,direction,list(remaining.values()),{m['id']}):chosen=(m,direction);break
      if chosen:break
     if not chosen:break
     m,direction=chosen;sequence.append(dict(order=len(sequence)+1,id=m['id'],target=m['target'],cut_mm=m['cut_mm'],tool_approach=direction,withdrawal='downward; requires assembly lifted after plate release',minimum_modelled_tool_diameter_mm=2.0));del remaining[m['id']]
    report = dict(sequence=sequence,blocked_ids=list(remaining),method='Conservative swept 2mm tool vs all BODY bounding boxes and not-yet-removed D2 bounding boxes, 24 horizontal approaches. Bottom extraction follows clear original downward shaft route. Actual tool shape, operator handling, raft separation and breakage untested.',physical_evidence=False)
    byid={m['id']:m for m in candidates}
    remaining={id:byid[id] for id in report['blocked_ids']}
    bodybox=np.array([m['bbox_mm'] for m in body]);bodyids=np.array([m['id'] for m in body]);cache={}
    def clear(p,d,b):
     enter=np.full(len(b),1.5);leave=np.full(len(b),260.)
     for ax in range(3):
      if abs(d[ax])<1e-10:leave[(p[ax]<b[:,0,ax]-1)|(p[ax]>b[:,1,ax]+1)]=-1
      else:
       t0=(b[:,0,ax]-1-p[ax])/d[ax];t1=(b[:,1,ax]+1-p[ax])/d[ax];enter=np.maximum(enter,np.minimum(t0,t1));leave=np.minimum(leave,np.maximum(t0,t1))
     return not np.any(enter<=leave)
    while remaining:
     chosen=None
     for id,m in remaining.items():
      p=np.array(m['cut_mm']);bb=bodybox[bodyids!=m['target']];other=np.array([x['bbox_mm'] for k,x in remaining.items() if k!=id]).reshape(-1,2,3)
      for elevation in [-15,-30,-45,-60]:
       for az in range(0,360,15):
        el=math.radians(elevation);an=math.radians(az);direction=np.array([math.cos(el)*math.cos(an),math.cos(el)*math.sin(an),math.sin(el)]);key=(id,elevation,az)
        if key not in cache:cache[key]=clear(p,direction,bb)
        if cache[key] and clear(p,direction,other):chosen=(id,m,direction);break
       if chosen:break
      if chosen:break
     if not chosen:break
     id,m,direction=chosen;report['sequence'].append(dict(order=len(report['sequence'])+1,id=id,target=m['target'],cut_mm=m['cut_mm'],tool_approach=direction.tolist(),withdrawal='downward after plate release and lifting assembly',minimum_modelled_tool_diameter_mm=2.,approach_note='Oblique from below; valid only after prior listed D2s removed'));del remaining[id]
    report['blocked_ids']=list(remaining);report['method']+=' Follow-on blocked contacts tested with exact continuous swept bounding-box rays from below at -15/-30/-45/-60 degrees, 15-degree azimuth steps, against remaining Supports and all BODY. Assumes room below lifted assembly; operator fixture and actual tool unverified.'
    for row in report["sequence"]:
        row["tool_approach"] = list(row["tool_approach"])
    return report


def generate_v4_removal(*, case, recipe, source_map, roots, output_dir,
                        preset_dir, generated_v4_dir):
    """Consume this replay's generated candidates, never the archived additions."""
    from .v4_d2 import _load_source_snapshot
    from ..mesh_backend import ManifoldKernel
    from ..run_metrics import start_timer, finish_metrics
    from ..stage_registry import resolve_stage
    timer=start_timer()
    _, holds=resolve_stage('V4_D2_REMOVAL',case=case,recipe=recipe,source_map=source_map)
    if holds: raise ContractError(str([h.as_dict() for h in holds]))
    source=Path(roots['roots']['outputs']).resolve()
    output_dir=Path(output_dir).resolve()
    if output_dir==source or source in output_dir.parents or output_dir.exists():
        raise ContractError('removal output must be new and outside frozen sources')
    generated_v4_dir=Path(generated_v4_dir).resolve()
    if generated_v4_dir==source or source in generated_v4_dir.parents:
        raise ContractError('archived candidates cannot be a generated-stage input')
    code_before={p:sha256_file(source/p) for p in LEGACY_SOURCE_CODE_SHA256}
    if code_before!=LEGACY_SOURCE_CODE_SHA256:raise ContractError('removal source algorithm SHA mismatch')
    before, paths, _=_load_source_snapshot(outputs_root=source,preset_dir=preset_dir,source_map=source_map)
    doc=read_json(generated_v4_dir/'candidates.json')
    provenance=read_json(generated_v4_dir/'V4_D2_STAGE.json')
    if doc.get('stage_id')!='V4_D2_SUPPORT_GENERATION' or provenance.get('source_inputs_after')!=before:
        raise ContractError('candidate producer source identity mismatch')
    identities=read_json(generated_v4_dir/'MESH_IDENTITIES.json')
    kernel=ManifoldKernel.from_runtime_root(Path(roots['roots']['geometry_runtime']))
    if set(identities)!={r['id'] for r in doc['D2']}:raise ContractError('candidate mesh ID set mismatch')
    for id, expected in identities.items():
        if kernel.mesh_array_identity(generated_v4_dir/'meshes'/f'{id}.npz')!=expected:
            raise ContractError(f'generated candidate mesh changed: {id}')
    inputs=[generated_v4_dir/'candidates.json',paths['flower_surface'] if 'flower_surface' in paths else source/'R4_D6_SIZE_RHYTHM_V2/data/surface.json',paths['upstream_structure']]
    hashes={str(p):sha256_file(p) for p in inputs}
    body=read_json(inputs[1])['surface']+read_json(inputs[2])['members']
    result=generate_removal(doc['D2'],body,np=kernel.np)
    if hashes!={str(p):sha256_file(p) for p in inputs}:raise ContractError('removal inputs changed')
    if code_before!={p:sha256_file(source/p) for p in code_before}:raise ContractError('source code changed')
    output_dir.mkdir(parents=True)
    (output_dir/'removal_sequence.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    record=dict(stage_id='V4_D2_REMOVAL',source_code=code_before,input_hashes=hashes,
                sequence_count=len(result['sequence']),blocked_ids=result['blocked_ids'],
                checkpoint_read_during_generation=False,metrics=finish_metrics(timer))
    (output_dir/'STAGE_RESULT.json').write_text(json.dumps(record,indent=2),encoding='utf-8')
    return record


def compare_removal(actual, expected):
    fields=['sequence','blocked_ids','physical_evidence']
    checks={k:actual.get(k)==expected.get(k) for k in fields}
    return dict(status='PASS' if all(checks.values()) else 'HOLD',checks=checks,
                method_text_equal=actual.get('method')==expected.get('method'),
                method_note='Historical descriptive append text is reported independently; ordered numerical records are compared exactly.')
