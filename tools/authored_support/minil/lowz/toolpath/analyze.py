"""Bounded-memory saved G-code diagnosis. Never opens a printer or slicer."""
import argparse,csv,gzip,hashlib,json,math,time,ctypes
from pathlib import Path
from collections import Counter,defaultdict
import numpy as np
from scipy import ndimage
from .parser import motions
from .footprint import raster,classify,deposit,RAW_NOM,GOOD_NOM,RAW_OUT,RAW_IN
from .fast_footprint import evaluate

def sha(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda:f.read(8*1024*1024),b''):h.update(b)
    return h.hexdigest()

def write(path,obj):Path(path).write_text(json.dumps(obj,indent=2,ensure_ascii=False),encoding='utf-8')

def retain_raw_across_vertical_gap(previous):
    """A planned raft air gap is not absence of earlier XY material.

    Retain its possible footprint, but do not certify load transfer across an
    uncalibrated vertical gap. Downstream trust remains UNKNOWN.
    """
    previous &= RAW_OUT|RAW_IN|RAW_NOM

def memory():
    class Counters(ctypes.Structure):
        _fields_=[('cb',ctypes.c_ulong),('faults',ctypes.c_ulong)]+[(n,ctypes.c_size_t) for n in ('peak_ws','ws','peak_paged','paged','peak_nonpaged','nonpaged','pagefile','peak_pagefile')]
    try:
        c=Counters();c.cb=ctypes.sizeof(c)
        fn=ctypes.windll.psapi.GetProcessMemoryInfo;fn.argtypes=[ctypes.c_void_p,ctypes.POINTER(Counters),ctypes.c_ulong];fn.restype=ctypes.c_int
        if not fn(ctypes.c_void_p(-1),ctypes.byref(c),c.cb):raise OSError('GetProcessMemoryInfo failed')
        return dict(working_bytes=c.ws,peak_working_bytes=c.peak_ws,commit_bytes=c.pagefile)
    except (AttributeError,OSError) as e:return {'unavailable':str(e)}

def run(gcode,out,expected_sha,pitch=.05,max_z=50.,threshold=.5):
    out=Path(out);out.mkdir(parents=True,exist_ok=False);start=time.monotonic();gcode=Path(gcode)
    before_stat=(gcode.stat().st_size,gcode.stat().st_mtime_ns)
    code_lock={p.name:sha(p) for p in Path(__file__).parent.glob('*.py')}
    actual=sha(gcode)
    if actual!=expected_sha:raise ValueError('GCODE_SHA_MISMATCH')
    n=int(math.ceil(256/pitch));previous=np.zeros((n,n),np.uint8);same=np.zeros_like(previous)
    counts=Counter();reasons=Counter();bands=defaultdict(Counter);layers=[];pending=[];events=[];last_z=None;layer=None;current=None;event=None;last_uid=None
    graph_prev=None;graph_nodes_prev={};graph_records=[];next_node=0;graph_factor=max(1,round(.2/pitch));sample_count=Counter();samples=[];arc_anchors=[];parsed=0
    def finish_layer():
        nonlocal pending,graph_prev,graph_nodes_prev,next_node,event
        if current is None:return
        # Four successor observations at the same machine XY footprint. This is
        # persistence evidence, not an assignment to a CAD component.
        remaining=[]
        for e in pending:
            if '_cell_chunks' in e:
                e['_cells']=np.unique(np.concatenate(e.pop('_cell_chunks')),axis=0)
            if current['layer']>e['layer']:
                yx=e['_cells'];vals=same[yx[:,0],yx[:,1]]
                e['successors'].append(dict(layer=current['layer'],z=current['z'],raw_overlap=float(np.mean((vals&RAW_NOM)!=0)),rooted_overlap=float(np.mean((vals&GOOD_NOM)!=0))))
            if len(e['successors'])<4:remaining.append(e)
        pending=remaining
        # 0.20-mm connectivity proxy is separate from fine-grid support bounds.
        mask=(same[::graph_factor,::graph_factor]&RAW_NOM)!=0
        lab,num=ndimage.label(mask,np.ones((3,3)));objects=ndimage.find_objects(lab);new_nodes={};children=Counter()
        for idx,slc in enumerate(objects,1):
            yy,xx=np.where(lab[slc]==idx);yy+=slc[0].start;xx+=slc[1].start
            parents=[] if graph_prev is None else [int(x) for x in np.unique(graph_prev[yy,xx]) if x]
            ps=[graph_nodes_prev[p] for p in parents];root=bool(current['layer']==1 or any(x['rooted'] for x in ps))
            birth=current['z'] if len(ps)!=1 else ps[0]['chain_start_z'];next_node+=1
            row=dict(node=next_node,layer=current['layer'],z=current['z'],parents=[x['node'] for x in ps],rooted=root,
                     chain_start_z=birth,no_merge_height_mm=current['z']-birth,
                     area_proxy_mm2=len(yy)*(pitch*graph_factor)**2,
                     minimum_bbox_span_mm=min(xx.max()-xx.min()+1,yy.max()-yy.min()+1)*pitch*graph_factor,
                     bbox=[[float(xx.min()*pitch*graph_factor),float(yy.min()*pitch*graph_factor)],[float((xx.max()+1)*pitch*graph_factor),float((yy.max()+1)*pitch*graph_factor)]])
            new_nodes[idx]=row;graph_records.append(row)
            for p in parents:children[p]+=1
        for p,count in children.items():graph_nodes_prev[p]['next_layer_children']=count
        graph_prev=lab;graph_nodes_prev=new_nodes
        current['memory']=memory();layers.append(dict(current));write(out/'PROGRESS.json',dict(layer=current['layer'],z=current['z'],motions=parsed,counts=dict(counts),elapsed_seconds=time.monotonic()-start,memory=current['memory']))
        if current['layer']%10==0:print('DIAG_LAYER',current['layer'],current['z'],parsed,dict(counts),flush=True)

    with gcode.open(encoding='ascii',errors='strict') as f,gzip.open(out/'MOTION_DIAGNOSTICS.csv.gz','wt',newline='') as cf:
        writer=csv.writer(cf);writer.writerow(['line','span_index','uid','layer','machine_z','category','reason','width','height','E','length','prior_rooted_lower','prior_rooted_upper','same_rooted_lower','raw_earlier_upper','x','y'])
        for m in motions(f,max_z+.41):
            if layer!=m['layer']:
                finish_layer();previous,same=same,previous;same.fill(0);last_z=None if current is None else current['z'];layer=m['layer'];current=dict(layer=layer,z=m['z'],height=m['height'],motions=0,counts={},features={},first_line=m['line'],last_line=m['line'])
                if last_z is not None and abs(m['z']-m['height']-last_z)>.003:
                    retain_raw_across_vertical_gap(previous);current['vertical_gap_mm']=m['z']-m['height']-last_z
            if any(x!='NO_NET_DEPOSITION_DURING_UNRETRACTION' for x in m['errors']):
                # Unsupported motion semantics may conceal deposited material;
                # do not continue making absence claims after losing the source.
                write(out/'PARSER_HOLD.json',m);raise ValueError('UNBOUND_EXTRUSION_SEMANTICS: '+','.join(m['errors']))
            r=evaluate(m,previous,same,pitch,threshold,layer==1);parsed+=1
            current['motions']+=1;current['last_line']=m['line'];current['counts'][r['category']]=current['counts'].get(r['category'],0)+1;current['features'][m['feature']]=current['features'].get(m['feature'],0)+1
            if m['z']<=max_z:
                counts[r['category']]+=1;reasons[r['reason']]+=1;bands[int(m['z']//5)*5][r['category']]+=1
                writer.writerow([m['line'],m['span_index'],m['uid'],layer,m['z'],r['category'],r['reason'],m['width'],m['height'],m['e_delta'],m['length'],r['prior_rooted']['lower'],r['prior_rooted']['upper'],r['same_earlier_rooted']['lower'],r['raw_earlier']['upper'],*m['points'][0]])
                key=(int(m['z']//5),r['category'])
                if sample_count[key]<4:
                    samples.append(dict(motion=m,diagnostic=r));sample_count[key]+=1
                if m['uid']!=last_uid:event=None
                if r['category']=='UNSUPPORTED_FIRST_EXTRUSION' and event is None:
                    slc,outer,inner,nominal=raster(m,pitch)
                    yy,xx=np.where(nominal);cells=np.c_[yy+slc[0].start,xx+slc[1].start]
                    event=dict(event_id=f'LIGHT_L{layer}_LINE{m["line"]}',layer=layer,z=m['z'],uid=m['uid'],first_line=m['line'],diagnostic=r,motions=[],successors=[],_cell_chunks=[])
                    events.append(event);pending.append(event)
                if event is not None:
                    event['motions'].append(m);slc,outer,inner,nominal=raster(m,pitch);yy,xx=np.where(nominal)
                    event['_cell_chunks'].append(np.c_[yy+slc[0].start,xx+slc[1].start])
            if layer<=8 and m['arc'] is not None and m['arc']['radius']>.5:arc_anchors.append(dict(line=m['line'],layer=layer,z=m['z'],**m['arc']))
            last_uid=m['uid']
        finish_layer()
    after_stat=(gcode.stat().st_size,gcode.stat().st_mtime_ns)
    if before_stat!=after_stat or sha(gcode)!=actual:raise ValueError('INPUT_CHANGED_DURING_DIAGNOSIS')
    if code_lock!={p.name:sha(p) for p in Path(__file__).parent.glob('*.py')}:raise ValueError('CODE_CHANGED_DURING_DIAGNOSIS')
    for e in events:
        del e['_cells'];e.update(source_sha256=actual,frame='MACHINE_MM',cad_transform='UNBOUND',flower_id=None,support_id=None,generation_status='BLOCKED_COORDINATE_AND_ROUTE_CERTIFICATE',print_go=False)
    write(out/'EVENTS.json',events);write(out/'REPRESENTATIVE_PATHS.json',samples);write(out/'EARLY_ARC_ANCHORS.json',arc_anchors)
    write(out/'STRUCTURE_GRAPH.json',dict(nodes=graph_records,semantics='0.20mm raw-deposition connectivity proxy; not proof of load paths or brace ownership; no ID assignment'))
    write(out/'LAYERS.json',layers)
    write(out/'RESULT.json',dict(status='SAVED_LIGHT_SLICE_DIAGNOSTIC',gcode_sha256=actual,input_unchanged=True,machine_z_range=[0,max_z],successor_scan_to=max_z+.41,
        counts=dict(counts),reasons=dict(reasons),height_bands={str(k):dict(v) for k,v in bands.items()},unsupported_path_events=len(events),
        count_unit='ordered <=2mm analytical spans; not unique commands, flowers, or failed components',pitch_mm=pitch,threshold=threshold,threshold_semantics='>=50% conservative footprint overlap with rooted geometry, NOT physical strength',
        arc_sag_mm=.002,cell_half_diagonal_mm=pitch/math.sqrt(2),numeric_mm=1e-7,
        sensitivity='coverage lower/upper bounds and threshold .25/.50/.75 on representatives; no threshold tuned to improve counts',
        dimensions='explicit native LINE_WIDTH and LAYER_HEIGHT; round bead swept footprint',elapsed_seconds=time.monotonic()-start,memory=memory(),
        generator_convertible_schema_events=len(events),generator_authorized_events=0,print_go=False,
        limitations=['current print job identity UNBOUND','machine to CAD mapping UNBOUND','physical adhesion/vibration/buckling/removal untested','conservative root propagation can make downstream UNKNOWN','coarse structure graph cannot identify Support versus artwork'],
        code_sha256=code_lock))
    print('SAVED_LIGHT_DIAG_COMPLETE',dict(counts),len(events),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--gcode',required=True);p.add_argument('--out',required=True);p.add_argument('--sha',required=True);p.add_argument('--pitch',type=float,default=.05);p.add_argument('--max-z',type=float,default=50.);a=p.parse_args();run(a.gcode,a.out,a.sha,a.pitch,a.max_z)
