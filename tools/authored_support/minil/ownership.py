"""Read-only proof of historical split ownership against frozen one-piece meshes."""
from pathlib import Path
from .adapter import read, write, require, sha256_file

def prove(c, historical):
    np, md = c['np'], c['kernel'].md
    historical=Path(historical)
    shift=np.array(c['case']['source_to_original_native_translation_mm'])
    members={m['id']:m for m in c['st']['members']}
    def solid(v,f):
        s=md.Manifold(md.Mesh64(np.ascontiguousarray(v,dtype=np.float64),np.ascontiguousarray(f,dtype=np.uint64)))
        require(s.status()==md.Error.NoError,'OWNERSHIP_INVALID_SOLID')
        return s
    def original(key):
        if key in members:
            m=members[key]; a,b=m['mesh_vertex_range']; x,y=m['mesh_face_range']
            v=(c['members']['vertices'][a:b].astype(float)+shift).astype(np.float32).astype(float)
            return solid(v,c['members']['faces'][x:y]-a)
        i=c['flower_ids'].index(key); p=c['p']; d=c['d6']
        v=(d['vertices']@(p['rotation_matrix'][i]*p['physical_scale'][i]).T+p['position_mm'][i]+shift).astype(np.float32).astype(float)
        return solid(v,d['faces'])
    rows=[]
    for key,others in [('SP002',['C0069']),('R36A000858',['R36A000843','target-flower-00083','target-flower-00330','target-flower-00684'])]:
        path=historical/(key+'.npz'); z=np.load(path,allow_pickle=False)
        old=original(key); new=solid(z['vertices_world_mm'],z['faces']); removed=old-new; loss=removed
        for other in others: loss=loss-original(other)
        added=new-old
        row={'id':key,'mesh_vertex_range':members[key]['mesh_vertex_range'],'mesh_face_range':members[key]['mesh_face_range'],
             'original_mesh_semantic_sha256':members[key]['mesh_geometry_sha256'],'historical_sha256':sha256_file(path),
             'original_volume_mm3':old.volume(),'historical_volume_mm3':new.volume(),'removed_overlap_mm3':removed.volume(),
             'union_loss_mm3':loss.volume(),'added_mm3':added.volume(),'retained_by_original_ids':others,
             'classification':'GEOMETRIC_CARVE_FOR_SPLIT_OWNERSHIP_UNION_PRESERVED'}
        rows.append(row)
        require(abs(loss.volume())<1e-6 and abs(added.volume())<1e-6,'OWNERSHIP_MISMATCH:'+key)
    path=historical/'SP004_A_CORRECTED_HALVES.npz'; z=np.load(path,allow_pickle=False)
    halves=[solid(z['vertices_world_mm'],z[field]) for field in ['part1_root0_minus_half_faces','part2_root1_plus_half_faces']]
    whole=halves[0]+halves[1]; old=original('SP004')
    row={'id':'SP004','mesh_vertex_range':members['SP004']['mesh_vertex_range'],'mesh_face_range':members['SP004']['mesh_face_range'],
         'original_mesh_semantic_sha256':members['SP004']['mesh_geometry_sha256'],'historical_sha256':sha256_file(path),
         'union_loss_mm3':(old-whole).volume(),'added_mm3':(whole-old).volume(),
         'classification':'SPLIT_HALF_LABEL_CORRECTION_ONLY','candidate_uses_split_geometry':False}
    rows.append(row)
    require(abs(row['union_loss_mm3'])<1e-6 and abs(row['added_mm3'])<1e-6,'OWNERSHIP_MISMATCH:SP004')
    result={'status':'PASS','decision':'NOT_APPLICABLE_TO_ONE_PIECE','rows':rows,'volume_tolerance_mm3':1e-6,
            'comparison_frame':'original_native_float32_export_before_rigid_build_transform',
            'source_to_native_translation_mm':shift.tolist(),'ROOT':'Historical split allocation; current source members retained by exact ID, no reassignment.',
            'note':'Temporary Boolean unions only compare historical halves; no candidate reconstructed from split CAD.'}
    write(c['out']/'OWNERSHIP_BINDING.json',result)
    c['ownership']=result
    return result
