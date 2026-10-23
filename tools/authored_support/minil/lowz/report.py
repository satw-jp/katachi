"""Small review images from saved CAD evidence, no rendering of invented geometry."""
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from .light import sha,write

def render(cache,out):
    cache=Path(cache);out=Path(out);s=json.loads((cache/'SOURCE.json').read_text());c=json.loads((out/'CANDIDATE.json').read_text());stats=json.loads((out/'COMPARISON.json').read_text())
    invalid=not s.get('bounded_sections_verified',False)
    before=json.loads((out/'LOWZ_DEMANDS_BEFORE.json').read_text())['events'];after=json.loads((out/'LOWZ_DEMANDS_AFTER.json').read_text())['events']
    def metrics(events):
        return dict(component_sections=len(events),independent_births=sum(e['category']=='INDEPENDENT_BIRTH' for e in events),
            zero_receiver_component_sections=sum(e['coverage']==0 for e in events),
            zero_receiver_independent_births=sum(e['coverage']==0 and e['category']=='INDEPENDENT_BIRTH' for e in events),
            partial_coverage_component_sections=sum(0<e['coverage']<1 for e in events))
    detail=dict(before=metrics(before),after=metrics(after),valid_for_support_decision=not invalid,
        note='INVALID SECTION PROXY: raw arithmetic only, not verified support improvement.' if invalid else 'Partial coverage includes normal sloped growth; it is not confirmed print failure.')
    if (out/'EXISTING_BRACE_COMPARISON.json').exists():
        audit=json.loads((out/'EXISTING_BRACE_COMPARISON.json').read_text())
        detail['existing_shafts_with_reduced_max_gap']=sum(r['after_max_unbraced_mm']<r['before_max_unbraced_mm'] for r in audit)
    write(out/'COMPARISON_DETAIL.json',detail)
    decisions={r['event_id']:r for r in json.loads((out/'ROUTE_LEDGER.json').read_text())}
    write(out/'UNHANDLED.json',dict(criterion='strict full CAD raster coverage; partial slopes are not proven failures',count=len(after),
        events=[dict(id=e['id'],category=e['category'],coverage=e['coverage'],
            reasons=decisions.get(e['id'],{}).get('reasons',[]) or ['REMAINS_AFTER_CANDIDATE']) for e in after]))
    occ=np.load(cache/'occupancy.npy',mmap_mode='r')
    with np.load(out/'ADDED_SECTIONS.npz') as a:extra=np.unpackbits(a['bits'])[:np.prod(a['shape'])].reshape(a['shape']).astype(bool)
    with np.load(out/'DEMAND_FOOTPRINTS.npz') as a:offsets=a['offsets'];cells=a['cells']
    font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',18);small=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',14)
    img=Image.new('RGB',(1500,890),'white');d=ImageDraw.Draw(img)
    d.text((30,20),'MINIL LIGHT | CAD 0-50 mm | same source / same section grid',fill='black',font=font)
    mask=occ.any(0);addition=extra.any(0);rgb=np.full((*mask.shape,3),255,np.uint8);rgb[mask]=[205,210,215]
    for index,events in enumerate((before,after)):
        base=rgb.copy()
        if index:base[addition]=[40,110,215]
        panel=Image.fromarray(base[::-1]).resize((680,680))
        img.paste(panel,(30+index*750,85))
        draw=ImageDraw.Draw(img)
        # Event XY comes from its saved footprint, not a flower-center proxy.
        lookup={e['id']:e for e in before}
        for ev in events:
            if ev['coverage']!=0 or ev['category']!='INDEPENDENT_BIRTH':continue
            old=lookup.get(ev['id'])
            if old is None:continue
            i=old['footprint_index'];cc=cells[offsets[i]:offsets[i+1]];yy,xx=np.divmod(cc,s['shape'][1])
            x=30+index*750+float(xx.mean())/s['shape'][1]*680;y=85+(1-float(yy.mean())/s['shape'][0])*680
            draw.ellipse((x-1,y-1,x+1,y+1),fill=(210,55,45))
        draw.text((30+index*750,55),('BEFORE' if not index else 'AFTER')+f' | flagged component-sections: {len(events):,}',fill='black',font=font)
    d.text((30,790),f'Added shafts: {stats["new_shafts"]}   Shaft branches: {stats.get("new_existing_shaft_branches",0)}   Braces: {stats["new_braces"]}   Resolved events: {stats["resolved_original_events"]}',fill='black',font=font)
    d.text((30,825),'Gray: existing lower-50 mm geometry | Blue: additions | Red: zero-receiver independent CAD births only',fill='black',font=small)
    d.text((30,850),'CAD raster proxy only. Exact surface clearance, native chronology and physical removal are NOT certified.',fill='black',font=small)
    if invalid:d.text((30,0),'QUARANTINED: INVALID SECTION FILL - DO NOT USE THESE COUNTS FOR SUPPORT APPROVAL',fill=(190,0,0),font=font)
    img.save(out/('LOWZ_BEFORE_AFTER_QUARANTINED.png' if invalid else 'LOWZ_BEFORE_AFTER.png'))
    selected=[r for r in c['additions'] if r['kind'] in ('LOWER_DIRECT','EXTERNAL_SHAFT_BRANCH')][:3]
    for row in selected:
        ev=next(e for e in before if e['id']==row['event_id']);iz=ev['section'];xy=np.array(row['p_mm'])[:2];ij=np.floor((xy-s['origin_mm'])/s['pitch_mm']).astype(int);rad=int(6/s['pitch_mm'])
        x0=max(0,ij[0]-rad);x1=min(s['shape'][1],ij[0]+rad+1);y0=max(0,ij[1]-rad);y1=min(s['shape'][0],ij[1]+rad+1)
        detail=Image.new('RGB',(1260,580),'white');dd=ImageDraw.Draw(detail);dd.text((20,15),row['id']+' -> '+ev['id'],fill='black',font=font)
        for col,layer in enumerate((iz-1,iz,iz+1)):
            old=occ[layer,y0:y1,x0:x1];new=extra[layer,y0:y1,x0:x1];a=np.full((*old.shape,3),255,np.uint8);a[old]=[110,115,120];a[new]=[40,110,215];a[old&new]=[170,60,160]
            detail.paste(Image.fromarray(a[::-1]).resize((390,390)),(20+col*415,85))
            dd.text((20+col*415,50),f'CAD section Z={(layer+.5)*s["dz_mm"]:.4f} mm',fill='black',font=small)
        dd.text((20,505),'Before / first / following section. Gray=source; blue=addition; purple=raster overlap.',fill='black',font=small)
        dd.text((20,535),'Sub-grid fusion and native line width remain UNVERIFIED.',fill='black',font=small)
        if invalid:dd.text((20,0),'QUARANTINED: SOURCE SECTION PROXY INVALID',fill=(190,0,0),font=small)
        detail.save(out/(row['id']+('_CONTACT_QUARANTINED.png' if invalid else '_CONTACT.png')))
    code=Path(__file__).parents[1]
    adopted=['construction.py','generate.py','recipe.py','../stages/v4_d2.py','lowz/__init__.py','lowz/light.py','lowz/reuse.py','lowz/donors.py','lowz/before_cache.py','lowz/order.py','lowz/legacy_graph.py','lowz/graph.py','lowz/report.py','lowz/test_reuse.py','lowz/replay_check.py']
    write(out/('GUARDED_CODE_IDENTITY.json' if invalid else 'CODE_IDENTITY.json'),[dict(path=p,sha256=sha(code/p)) for p in adopted])
    all_files=[p for p in sorted(out.rglob('*')) if p.is_file() and p.name!='OUTPUT_MANIFEST.json']
    write(out/'OUTPUT_MANIFEST.json',[dict(path=str(p.relative_to(out)),sha256=sha(p),bytes=p.stat().st_size) for p in all_files])

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--cache',required=True);p.add_argument('--out',required=True);a=p.parse_args();render(a.cache,a.out)
