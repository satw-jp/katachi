"""Audit sealed v3 evidence without relabelling it as a v4 extraction.

This is a read-only screening gate, not a generator. Full component envelopes
are intentionally conservative; passing a target window is not donor/route
certification. Unknown rows retain their original source identities.
"""
import argparse,json
from pathlib import Path
from collections import Counter
import numpy as np
from .light import sha,write
from .local_certificate import Domain,State

def run(cache,out):
    cache=Path(cache);out=Path(out);out.mkdir(exist_ok=False,parents=True)
    seal=json.loads((cache/'CACHE_SEAL.json').read_text());checked=[]
    for row in seal['files']:
        actual=sha(cache/row['file'])
        if actual!=row['sha256']:raise ValueError('CACHE_SHA_MISMATCH: '+row['file'])
        checked.append(row)
    source=json.loads((cache/'SOURCE.json').read_text())
    if sha(source['path'])!=source['sha256']:raise ValueError('SOURCE_CHANGED')
    reader=cache.parent/'RUN_SECTION_READER.py';adapter=cache.parent/'RUN_ADAPTER.py'
    if sha(reader)!=seal['reader']['sha256'] or sha(adapter)!=seal['adapter_sha256']:raise ValueError('EXECUTION_SNAPSHOT_MISMATCH')
    unknown=json.loads((cache/'UNKNOWN_SECTIONS.json').read_text())['sections']
    components={(p['id'],int(c['component'])):c for p in source['parts'] for c in p['components']}
    regions=[]
    for row in unknown:
        bbox=components[(row['part'],row['component'])]['bbox_mm']
        # Whole source component XY bbox, not an inferred interior of an open ring.
        regions.append(dict(**row,uncertainty_envelope=[bbox[0][:2],bbox[1][:2]],envelope_policy='FULL_COMPONENT_BBOX_CONSERVATIVE'))
    occ=np.load(cache/'occupancy.npy',mmap_mode='r');d=Domain(occ,source['origin_mm'],source['pitch_mm'],regions)
    write(out/'UNKNOWN_REGIONS.json',dict(regions=regions,semantics='uncertainty, NOT occupancy'))
    counts=[];union=np.zeros(occ.shape[1:],np.uint16)
    # Source-complete states at grid centres; conservative boxes are also tested
    # geometrically by Domain.conflicts, including between grid centres.
    for iz in range(len(occ)):
        mask=np.zeros(occ.shape[1:],bool)
        for r in d.regions.get(iz,[]):
            lo,hi=np.asarray(r['uncertainty_envelope']);start=np.maximum(0,np.ceil((lo-d.origin)/d.pitch-.5).astype(int));end=np.minimum([d.nx-1,d.ny-1],np.floor((hi-d.origin)/d.pitch-.5).astype(int))
            if np.all(end>=start):mask[start[1]:end[1]+1,start[0]:end[0]+1]=True
        union+=mask
        counts.append(dict(section=iz,z_mm=(iz+.5)*source['dz_mm'],UNKNOWN=int(mask.sum()),KNOWN_MATERIAL=int((occ[iz]&~mask).sum()),PROVEN_EMPTY=int((~occ[iz]&~mask).sum())))
    np.save(out/'UNKNOWN_LAYER_COUNTS.npy',union)
    # Every saved component section with known material is a screening sample;
    # these are NOT automatically unsupported births or demand counts.
    windows=[];summary=Counter();halo=source['pitch_mm']
    for part in source['parts']:
        with np.load(cache/part['file']) as ar:data=ar['data']
        pairs=np.unique(data[:,:2],axis=0) if len(data) else []
        for gid,iz in pairs:
            gid=int(gid);iz=int(iz)
            if iz<1 or (iz+.5)*source['dz_mm']>50:continue
            bb=components[(part['id'],gid)]['bbox_mm'];box=[bb[0][:2],bb[1][:2]]
            reasons=d.check_boxes({j:box for j in range(iz-1,iz+5)},halo)
            result='LOCAL_UNVERIFIED' if reasons else 'TARGET_WINDOW_UNKNOWN_FREE_ONLY'
            group='FLOWER' if part['id'] in ('3','4','5','6','7','8') else 'OTHER'
            summary[group+'_'+result]+=1
            windows.append(dict(part=part['id'],component=gid,section=iz,status=result,
                                blockers=reasons[:1],scope='whole component XY / previous + current + four successors',halo_mm=halo))
        print('LOCAL_AUDIT_PART',part['id'],dict(summary),flush=True)
    write(out/'TARGET_WINDOWS.json',dict(windows=windows,not_demand_counts=True))
    write(out/'STATE_COUNTS.json',dict(layers=counts,contract='sampled grid-centre state only; unknown wins'))
    write(out/'AUDIT.json',dict(status='HOLD',source_sha256=source['sha256'],source_unchanged=sha(source['path'])==source['sha256'],
       input_reader=seal['reader'],cache_files_verified=checked,unknown_sections=len(regions),summary=dict(summary),
       full_local_certificates=0,new_candidates=0,print_go=False,
       blockers=['target-window screening is not a complete donor/root/route certificate','generator replay stops at COPLANAR_FACE; no real generation authorized'],
       reuse_policy='sealed v3 known/unknown evidence retained under its original reader identity; no new-reader cache claim',
       local_certificate_sha256=sha(Path(__file__).with_name('local_certificate.py')),audit_code_sha256=sha(__file__)))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--cache',required=True);p.add_argument('--out',required=True);a=p.parse_args();run(a.cache,a.out)
