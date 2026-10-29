#!/usr/bin/env python3
"""Read-only next-four-layer deposition-presence check for selected risk events.

This is NOT a certified support continuum or geometry/Flower-ID mapping.
It is strictly chronological: later deposited paths are reported only as
future observations, never fed back as earlier donor/support material.
"""
from __future__ import annotations
import argparse
from collections import defaultdict
import json
import math
from pathlib import Path
import zipfile
from light_gcode_diagnostic import Reader, pieces, digest_file


def sqdist_point_segment(x,y,a,b):
    dx=b[0]-a[0];dy=b[1]-a[1];den=dx*dx+dy*dy
    t=max(0,min(1,((x-a[0])*dx+(y-a[1])*dy)/den)) if den else 0
    return (x-(a[0]+dx*t))**2+(y-(a[1]+dy*t))**2


def nearest_line(m,anchors,margin=.12):
    if m.width is None or m.width<=0:return []
    # Early conservative check of arc sweep. Chord bbox is not a valid arc bbox.
    near=[]
    if m.g in ('G2','G3') and (m.i is not None or m.j is not None):
        cx=m.x0+(m.i or 0.);cy=m.y0+(m.j or 0.)
        r=math.hypot(m.x0-cx,m.y0-cy)
        near=[a for a in anchors if abs(math.hypot(a[0]-cx,a[1]-cy)-r)<(m.width/2+margin+0.2)]
    elif m.g=='G1':
        half=m.width/2+margin
        near=[a for a in anchors if min(m.x0,m.x1)-half<=a[0]<=max(m.x0,m.x1)+half and min(m.y0,m.y1)-half<=a[1]<=max(m.y0,m.y1)+half]
    else:
        near=list(anchors)
    if not near:return []
    pts,err=pieces(m,0.2)
    if err:return []
    q=[]
    rad2=(m.width/2+margin)**2
    for x,y,idx in near:
        if any(sqdist_point_segment(x,y,a,b)<=rad2 for a,b in zip(pts,pts[1:])):q.append(idx)
    return q


def annotate(stream,events,extra_layers=4,zmax=50):
    reader=Reader();by_layer=defaultdict(list)
    for idx,event in enumerate(events):
        src=event['source_event'];m=event['machine'];L=src['layer']
        # Samples along documented SOURCE event, not guessed CAD geometry.
        pts=[(m['x0']+(m['x1']-m['x0'])*t, m['y0']+(m['y1']-m['y0'])*t,idx) for t in (.25,.5,.75)]
        event['post_four_deposition']={'layers':{},'status':'DEPOSITION_PRESENCE_ONLY','support_certification':'UNVERIFIED'}
        for target in range(L+1,L+extra_layers+1):by_layer[target].extend(pts)
    if not events:return events
    last_needed=max(by_layer)
    for line_no,raw in enumerate(stream,1):
        m=reader.line(raw.decode('utf-8','replace') if isinstance(raw,bytes) else raw,line_no)
        if m is None:continue
        if m.layer>last_needed or (m.z_comment is not None and m.z_comment>zmax+2):break
        anchors=by_layer.get(m.layer)
        if not anchors:continue
        selected=nearest_line(m,anchors)
        for idx in set(selected):
            key=str(m.layer)
            p=events[idx]['post_four_deposition']['layers']
            if key not in p:
                p[key]={'gcode_line':line_no,'feature':m.role,'z_mm':m.z1,'line_width_mm':m.width,
                        'interpretation':'Later deposition intersects at least one sampled XY source path point. Not proof of mechanical support or root continuity.'}
    for ev in events:
        L=ev['source_event']['layer']
        s=ev['post_four_deposition']
        s['layers_with_later_extrusion']=len(s['layers'])
        s['missing_layers']=[i for i in range(L+1,L+extra_layers+1) if str(i) not in s['layers']]
        s['lack_of_observed_deposition_is_not_physical_failure']=True
    return events


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--job',type=Path,required=True)
    ap.add_argument('--diagnostic',type=Path,required=True)
    ap.add_argument('--out',type=Path,required=True)
    ap.add_argument('--job-sha',default='3c4065ed76e7741de7da4683bec7e1f61a09e3342cc3f5a2e3eaf7fd9c91c353')
    args=ap.parse_args()
    if args.out.exists():ap.error('out path already exists; do not overwrite')
    if digest_file(args.job)!=args.job_sha:ap.error('saved job sha mismatch')
    result=json.loads(args.diagnostic.read_text(encoding='utf8'))
    with zipfile.ZipFile(args.job) as z:
        with z.open('Metadata/plate_1.gcode') as f:
            data=annotate(f,result['examples'],extra_layers=4,zmax=50)
    args.out.write_text(json.dumps({'status':'SAVED_LIGHT_SLICE_DIAGNOSTIC','gcode_sha256':result['gcode_sha256'],
                                    'semantics':'Post-deposition presence only; not structural support, independent roots or CAD binding.',
                                    'events':data},indent=2,ensure_ascii=False),encoding='utf8')
    print(f'annotated {len(data)} events',flush=True)

if __name__=='__main__':main()
