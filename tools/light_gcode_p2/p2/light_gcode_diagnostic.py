#!/usr/bin/env python3
"""Deterministic read-only Bambu G-code extrusion-footprint screen.

This is a SCREEN, not an assertion of physical support, and not a CAD/Flower
binding. All supported masks contain only previously screen-certified material.
Future and uncertain/unsupported material never become certified receivers.
Outputs stay in an independent directory; input files are never modified.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from dataclasses import dataclass
import hashlib
import gzip
import io
import json
import math
from pathlib import Path
import re
import sys
import time
import zipfile
from typing import Iterator

import numpy as np
from continuous_area import AreaBoundsScreen, ProvenanceBudgetExceeded

try:
    from numba import njit
except ImportError:
    def njit(*args, **kwargs):
        def deco(f):
            return f
        return deco

SCHEMA = 'katachi.lowz.saved_gcode_diagnostic.v1'
SCHEMA_AREA_BOUNDS = 'katachi.lowz.saved_gcode_diagnostic.v2.area_bounds'
MAX_PROVENANCE_ROOTS_PER_CELL = 4
MAX_PROVENANCE_ROOT_RECORDS = 100000
STATUS = ('SUPPORTED_TOOLPATH','MARGINAL_SUPPORT','UNSUPPORTED_FIRST_EXTRUSION','UNKNOWN')
FORMAT_RE = re.compile(r'^([A-Za-z])([+\-]?(?:\d+(?:\.\d*)?|\.\d+))$')
PARAM_RE = re.compile(r'([A-Za-z])\s*([+\-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+\-]?\d+)?)')
HEIGHT_RE = re.compile(r'\s*;\s*Z_HEIGHT\s*:\s*([-+0-9.]+)',re.I)
LAYER_RE = re.compile(r'^\s*;\s*layer num/total_layer_count\s*:\s*(\d+)\s*/\s*(\d+)',re.I)
WIDTH_RE = re.compile(r'^\s*;\s*LINE_WIDTH\s*:\s*([-+0-9.eE]+)',re.I)
FEATURE_RE = re.compile(r'^\s*;\s*FEATURE\s*:\s*(.*)',re.I)
LHEIGHT_RE = re.compile(r'^\s*;\s*LAYER_HEIGHT\s*:\s*([-+0-9.eE]+)',re.I)
OBJECT_RE = re.compile(r'^\s*;\s*OBJECT_ID\s*:\s*(\d+)',re.I)


def digest_file(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def load_zip_member(path:Path, member:str):
    with zipfile.ZipFile(path) as z:
        return z.read(member)


def match_source_job(original: Path, job: Path, expected_source: str, expected_job: str, expected_gcode: str) -> dict:
    found_source=digest_file(original)
    found_job=digest_file(job)
    if found_source!=expected_source or found_job!=expected_job:
        raise ValueError('MISMATCH: locked 3MF SHA256 differs; no diagnostic permitted')
    with zipfile.ZipFile(job) as z:
        gname='Metadata/plate_1.gcode'
        if gname not in z.namelist():raise ValueError('Missing embedded G-code')
        h=hashlib.sha256();n=0
        with z.open(gname) as g:
            for chunk in iter(lambda:g.read(4*1024*1024),b''):
                h.update(chunk);n+=len(chunk)
        ghash=h.hexdigest()
        if ghash!=expected_gcode:raise ValueError('MISMATCH: embedded G-code SHA256 differs; no diagnostic permitted')
        saved_model=z.read('3D/3dmodel.model').decode('utf-8','replace')
        cfg=json.loads(z.read('Metadata/project_settings.config'))
        saved_meta=z.read('Metadata/model_settings.config').decode('utf-8','replace')
        plate=json.loads(z.read('Metadata/plate_1.json'))
        has_original_geometry='<build/>' not in saved_model and '<build />' not in saved_model
    with zipfile.ZipFile(original) as z:
        main=z.read('3D/3dmodel.model').decode('utf-8','replace')
        names=z.namelist()
        missing_refs=[]
        import xml.etree.ElementTree as ET
        root=ET.fromstring(main)
        ns={'c':'http://schemas.microsoft.com/3dmanufacturing/core/2015/02', 'p':'http://schemas.microsoft.com/3dmanufacturing/production/2015/06'}
        build=root.find('c:build',ns)
        components=[]
        for comp in root.findall('.//c:component',ns):
            path=comp.attrib.get('{'+ns['p']+'}path')
            if path and path.lstrip('/') not in names:
                missing_refs.append(path)
            components.append({'objectid':comp.attrib.get('objectid'),'path':path,'transform':comp.attrib.get('transform')})
        builds=[e.attrib for e in list(build)] if build is not None else []
    # These facts alone cannot establish exact slicer CAD->machine transforms:
    # saved job has empty build, original has one large assembly, and original
    # component transforms do not prove Slic3r's later placement/normalization.
    return {
        'status':'SAVED_LIGHT_SLICE_DIAGNOSTIC',
        'source_sha256':found_source,
        'saved_job_sha256':found_job,
        'embedded_gcode_sha256':ghash,
        'embedded_gcode_bytes':n,
        'source_internal_component_count':len(components),
        'source_missing_component_paths':missing_refs,
        'source_build_items':builds,
        'source_component_first_three':components[:3],
        'saved_job_contains_model_geometry':has_original_geometry,
        'saved_model_metadata_hash':hashlib.sha256(saved_meta.encode()).hexdigest(),
        'plate_bbox':plate.get('bbox_all'),
        'saved_profile':{
            'printer_model':cfg.get('printer_model'),
            'nozzle_diameter':cfg.get('nozzle_diameter'),
            'layer_height':cfg.get('layer_height'),
            'initial_layer_print_height':cfg.get('initial_layer_print_height'),
            'raft_layers':cfg.get('raft_layers'),
            'enable_support':cfg.get('enable_support'),
            'curr_bed_type':cfg.get('curr_bed_type'),
            'textured_plate_temp':cfg.get('textured_plate_temp'),
        },
        'cad_machine_xyz_transform':'UNBOUND',
        'current_print_submitted_gcode_sha':'UNBOUND',
        'coordinate_binding_reason':'Source/label/bbox alone cannot prove slicer placement. Saved sliced-only job has no 3D build geometry; do not infer transform or part IDs.',
        'physical_printer_bed':'UNBOUND',
        'source_original_name':original.name,
        'saved_job_name':job.name,
    }


@dataclass
class Move:
    lineno:int
    layer:int
    x0:float
    y0:float
    x1:float
    y1:float
    z0:float
    z1:float
    de:float
    width:float | None
    role:str
    object_id:str | None
    g:str
    i:float | None
    j:float | None
    r:float | None
    z_comment:float | None
    layer_height:float | None
    unsupported_reason:str | None = None


class Reader:
    def __init__(self):
        self.x=None;self.y=None;self.z=None;self.e=0.
        self.abs_xyz=True;self.abs_e=True;self.mm=True;self.xy_plane=True;self.arc_absolute_ij=False
        self.layer=0;self.layer_count=None;self.role='UNSET';self.width=None
        self.width_semantics='feature_scoped_unverified';self.width_source_line=None
        self.z_comment=None;self.layer_height=None;self.object_id=None
        self.errors=Counter();self.rejected_extrusions=[];self.rejected_extrusion_omitted=0;self.unlocated_positive_extrusion_count=0
        self.position_invalidations=[];self.position_invalidations_omitted=0;self.position_invalidation_count=0
        self.coordinates_valid=False

    def _reject(self,lineno,reason,opcode=None,de=None):
        self.errors[reason]+=1
        if de is not None and de<=1e-9:return
        if de is not None:self.unlocated_positive_extrusion_count+=1
        if len(self.rejected_extrusions)<100:
            self.rejected_extrusions.append({'line':lineno,'layer':self.layer,'opcode':opcode,'e_delta':de,'reason':reason,'screen_status':'UNKNOWN_UNLOCATED'})
        else:self.rejected_extrusion_omitted+=1

    def line(self, raw:str, lineno:int) -> Move | None:
        s=raw.strip()
        if not s:return None
        if s.startswith(';'):
            m=LAYER_RE.match(s)
            if m:self.layer=int(m.group(1));self.layer_count=int(m.group(2));return None
            m=HEIGHT_RE.match(s)
            if m:self.z_comment=float(m.group(1));return None
            m=LHEIGHT_RE.match(s)
            if m:self.layer_height=float(m.group(1));return None
            # Version-scoped contract verified against both Bambu generator and
            # native preview reader; unknown producers keep conservative reset.
            if lineno<=16 and s.strip()=='; BambuStudio 02.08.02.61':
                self.width_semantics='bambu_02_08_02_61_modal';return None
            m=FEATURE_RE.match(s)
            if m:
                self.role=m.group(1).strip()
                if self.width_semantics!='bambu_02_08_02_61_modal':
                    self.width=None;self.width_source_line=None
                return None
            m=WIDTH_RE.match(s)
            if m:
                w=float(m.group(1));self.width=w if math.isfinite(w) and w>0 else None
                self.width_source_line=lineno if self.width is not None else None
                return None
            m=OBJECT_RE.match(s)
            if m:self.object_id=m.group(1)
            return None
        code=s.split(';',1)[0].strip()
        if not code:return None
        tok=code.split(None,1)
        op=tok[0].upper()
        # G1X1Y2E.01 is uncommon but supported by param parser.
        mcmd=re.match(r'^(G\d+(?:\.\d+)?|M\d+(?:\.\d+)?|T\d+)(.*)$',op)
        if mcmd:
            op=mcmd.group(1);remainder=mcmd.group(2)
            params_txt=(remainder+' '+tok[1]) if len(tok)>1 else remainder
        else:
            params_txt=tok[1] if len(tok)>1 else ''
        if op=='G90.1':self.arc_absolute_ij=True;return None
        if op=='G91.1':self.arc_absolute_ij=False;return None
        if op=='G90':self.abs_xyz=True;return None
        if op=='G91':self.abs_xyz=False;return None
        if op=='M82':self.abs_e=True;return None
        if op=='M83':self.abs_e=False;return None
        if op=='G21':self.mm=True;return None
        if op=='G20':self.mm=False;return None
        if op=='G17':self.xy_plane=True;return None
        if op in ('G18','G19'):self.xy_plane=False;return None
        if op=='G92':
            p=dict((k.upper(),float(v)) for k,v in PARAM_RE.findall(params_txt))
            for key,attr in [('X','x'),('Y','y'),('Z','z'),('E','e')]:
                if key in p:setattr(self,attr,p[key])
            if all(k in p for k in ('X','Y','Z')):self.coordinates_valid=True
            return None
        if op not in ('G0','G00','G1','G01','G2','G02','G3','G03'):
            # Other future motion/extrusion commands are not assumed to be absent.
            try:p=dict((k.upper(),float(v)) for k,v in PARAM_RE.findall(params_txt))
            except ValueError:p={}
            if 'E' in p:
                de=p['E']-self.e if self.abs_e else p['E']
                self.e=p['E'] if self.abs_e else self.e+p['E']
                if de>1e-9 and self.layer>=1:
                    self._reject(lineno,'UNSUPPORTED_EXTRUSION_OPCODE',op,de)
            # Unknown G motion can move the head. Do not let later supported
            # moves inherit stale coordinates; only an explicit XYZ reseed recovers.
            if op.startswith('G') and op not in ('G90','G91','G90.1','G91.1','G20','G21','G17','G18','G19','G92'):
                self.x=self.y=self.z=None;self.coordinates_valid=False
                self.position_invalidation_count+=1
                if len(self.position_invalidations)<100:self.position_invalidations.append({'line':lineno,'opcode':op})
                else:self.position_invalidations_omitted+=1
            return None
        try:
            p=dict((k.upper(),float(v)) for k,v in PARAM_RE.findall(params_txt))
        except ValueError:
            self.errors['NON_NUMERIC_COMMAND']+=1;return None
        if any(not math.isfinite(x) for x in p.values()):
            self.errors['NONFINITE_COMMAND']+=1;return None
        prev=(self.x,self.y,self.z)
        was_valid=self.coordinates_valid
        for key,attr in [('X','x'),('Y','y'),('Z','z')]:
            if key in p:
                old=getattr(self,attr)
                setattr(self,attr,p[key] if self.abs_xyz else (old+p[key] if old is not None else None))
        de=0.
        if 'E' in p:
            de=p['E']-self.e if self.abs_e else p['E']
            self.e=p['E'] if self.abs_e else self.e+p['E']
        if not was_valid:
            if de>1e-9 and self.layer>=1:self._reject(lineno,'NO_INITIAL_COORDINATES',op,de)
            # Keep independently established absolute axes across commands.
            # Relative axes remain unknown until an absolute coordinate or a
            # complete XYZ reseed provides an anchor.
            self.coordinates_valid=None not in (self.x,self.y,self.z)
            return None
        if de<=1e-9 or self.layer<1:
            if None not in (self.x,self.y,self.z):self.coordinates_valid=True
            return None
        if None in prev or None in (self.x,self.y,self.z):
            self.errors['NO_INITIAL_COORDINATES']+=1;return None
        if math.hypot(self.x-prev[0],self.y-prev[1])<1e-10 and op not in ('G2','G02','G3','G03'):
            return None
        is_arc=op in ('G2','G02','G3','G03')
        reason=None
        if not self.mm:reason='G20_INCH_MODE'
        if is_arc and not self.xy_plane:reason='NON_XY_ARC_PLANE'
        if is_arc and self.arc_absolute_ij:reason='ABSOLUTE_ARC_CENTER_MODE_UNSUPPORTED'
        return Move(lineno,self.layer,float(prev[0]),float(prev[1]),float(self.x),float(self.y),float(prev[2]),float(self.z),de,self.width,self.role,self.object_id,('G3' if op in ('G3','G03') else 'G2') if is_arc else 'G1',p.get('I'),p.get('J'),p.get('R'),self.z_comment,self.layer_height,reason)


def arc_coords(m:Move,tolerance:float=0.025,max_parts:int=2000)->tuple[list[tuple[float,float]],str|None]:
    if m.i is not None or m.j is not None:
        cx=m.x0+(m.i or 0.);cy=m.y0+(m.j or 0.)
        rad=math.hypot(m.x0-cx,m.y0-cy)
        if rad<=0 or not math.isfinite(rad):return [],'INVALID_ARC_RADIUS'
        if abs(math.hypot(m.x1-cx,m.y1-cy)-rad)>max(0.08,rad*.025):return [],'ARC_ENDPOINT_RADIUS_MISMATCH'
        a0=math.atan2(m.y0-cy,m.x0-cx)
        a1=math.atan2(m.y1-cy,m.x1-cx)
        if m.g=='G3':sweep=(a1-a0)%(2*math.pi)
        else:sweep=-((a0-a1)%(2*math.pi))
        if abs(sweep)<1e-12:sweep=2*math.pi if m.g=='G3' else -2*math.pi
    elif m.r is not None:
        rad=abs(m.r)
        vx=m.x1-m.x0;vy=m.y1-m.y0
        chord=math.hypot(vx,vy)
        if chord<1e-10 or chord>2*rad+1e-7:return [],'INVALID_R_ARC'
        mx=(m.x0+m.x1)/2;my=(m.y0+m.y1)/2
        h=math.sqrt(max(0,rad*rad-chord*chord/4))
        nx=-vy/chord;ny=vx/chord
        options=[]
        for sign in (1,-1):
            cx=mx+sign*h*nx;cy=my+sign*h*ny
            a0=math.atan2(m.y0-cy,m.x0-cx)
            a1=math.atan2(m.y1-cy,m.x1-cx)
            sw=((a1-a0)%(2*math.pi)) if m.g=='G3' else -((a0-a1)%(2*math.pi))
            options.append((cx,cy,a0,sw))
        # Positive R means minor sweep; negative R means major sweep.
        cx,cy,a0,sweep=min(options,key=lambda x:abs(x[3])) if m.r>=0 else max(options,key=lambda x:abs(x[3]))
    else:return [],'ARC_CENTER_MISSING'
    max_angle=2*math.acos(max(-1,min(1,1-tolerance/rad)))
    if max_angle<=0:return [],'ARC_TESSELLATION_UNAVAILABLE'
    n=int(math.ceil(abs(sweep)/max_angle))
    if n>max_parts:return [],'ARC_SEGMENT_LIMIT'
    pts=[(m.x0,m.y0)]
    for k in range(1,n):
        a=a0+sweep*k/n
        pts.append((cx+rad*math.cos(a),cy+rad*math.sin(a)))
    pts.append((m.x1,m.y1))
    return pts,None


def arc_path_error_bound(m:Move,sagitta:float)->float:
    """Conservative polyline-to-commanded-arc envelope in millimeters.

    I/J arcs may end slightly off their start radius while still passing the
    parser's compatibility tolerance. Account for that radial discrepancy in
    addition to tessellation sagitta; R arcs construct their center from both
    endpoints, so their endpoint radial residual is zero by construction.
    """
    if m.i is not None or m.j is not None:
        cx=m.x0+(m.i or 0.);cy=m.y0+(m.j or 0.)
        r0=math.hypot(m.x0-cx,m.y0-cy)
        r1=math.hypot(m.x1-cx,m.y1-cy)
        if not all(math.isfinite(v) for v in (r0,r1,sagitta)):
            return math.inf
        return max(0.,sagitta)+abs(r0-r1)
    if m.r is not None and math.isfinite(sagitta):
        return max(0.,sagitta)
    return math.inf


def arc_reporting_parts(m:Move,interval_length_mm:float,max_sagitta_mm:float=.005)->tuple[list[dict],str|None]:
    """Return stable bead-relative arc intervals and conservative envelopes.

    Intervals are parameterized on the source circle, not on tessellation
    chords. Their maximum arc length is fixed by the caller for a move, so a
    renderer's sagitta setting cannot change segment boundaries or reported
    original-path lengths. The polyline is only the area-bound query shape.
    """
    if m.i is not None or m.j is not None:
        cx=m.x0+(m.i or 0.);cy=m.y0+(m.j or 0.)
        radius=math.hypot(m.x0-cx,m.y0-cy)
        if radius<=0 or not math.isfinite(radius):return [],'INVALID_ARC_RADIUS'
        end_radius=math.hypot(m.x1-cx,m.y1-cy)
        residual=abs(end_radius-radius)
        if residual>max(.08,radius*.025):return [],'ARC_ENDPOINT_RADIUS_MISMATCH'
        a0=math.atan2(m.y0-cy,m.x0-cx);a1=math.atan2(m.y1-cy,m.x1-cx)
        sweep=((a1-a0)%(2*math.pi)) if m.g=='G3' else -((a0-a1)%(2*math.pi))
        if abs(sweep)<1e-12:sweep=2*math.pi if m.g=='G3' else -2*math.pi
    elif m.r is not None:
        radius=abs(m.r);residual=0.
        dx=m.x1-m.x0;dy=m.y1-m.y0;chord=math.hypot(dx,dy)
        if chord<1e-10 or chord>2*radius+1e-7:return [],'INVALID_R_ARC'
        mx=(m.x0+m.x1)/2;my=(m.y0+m.y1)/2
        h=math.sqrt(max(0.,radius*radius-chord*chord/4));nx=-dy/chord;ny=dx/chord
        options=[]
        for sign in (1,-1):
            cx=mx+sign*h*nx;cy=my+sign*h*ny
            a0=math.atan2(m.y0-cy,m.x0-cx);a1=math.atan2(m.y1-cy,m.x1-cx)
            sw=((a1-a0)%(2*math.pi)) if m.g=='G3' else -((a0-a1)%(2*math.pi))
            options.append((cx,cy,a0,sw))
        cx,cy,a0,sweep=min(options,key=lambda q:abs(q[3])) if m.r>=0 else max(options,key=lambda q:abs(q[3]))
    else:return [],'ARC_CENTER_MISSING'
    if not math.isfinite(interval_length_mm) or interval_length_mm<=0:return [],'ARC_INTERVAL_SIZE_INVALID'
    total=radius*abs(sweep)
    max_angle=2*math.acos(max(-1.,min(1.,1-max_sagitta_mm/radius)))
    if not math.isfinite(max_angle) or max_angle<=0:return [],'ARC_INTERVAL_SAGITTA_INVALID'
    count=max(1,int(math.ceil(total/interval_length_mm)),int(math.ceil(abs(sweep)/max_angle)))
    if count>200000:return [],'ARC_INTERVAL_RESOURCE_LIMIT'
    delta=sweep/count;length=total/count
    sagitta=radius*(1-math.cos(abs(delta)/2))
    epsilon=sagitta+residual
    out=[]
    for k in range(count):
        t0=k/count;t1=(k+1)/count
        p0=(cx+radius*math.cos(a0+sweep*t0),cy+radius*math.sin(a0+sweep*t0))
        p1=(cx+radius*math.cos(a0+sweep*t1),cy+radius*math.sin(a0+sweep*t1))
        out.append({'p0':p0,'p1':p1,'t0':t0,'t1':t1,'length_mm':length,
                    'length_error_mm':residual*abs(delta),'sagitta_mm':sagitta,'epsilon_mm':epsilon})
    return out,None


@njit
def _stamp(x0,y0,x1,y1,r,prev_cert,prev_uncert,cur_cert,cur_uncert,
           prev_origin,cur_origin,prev_roots,cur_roots,prev_root_count,cur_root_count,
           prev_root_overflow,cur_root_overflow,line_no,left,bottom,step,root,threshold):
    H,W=prev_cert.shape
    ix0=max(0,int(math.floor((min(x0,x1)-r-left)/step-0.5)))
    ix1=min(W-1,int(math.ceil((max(x0,x1)+r-left)/step-0.5)))
    iy0=max(0,int(math.floor((min(y0,y1)-r-bottom)/step-0.5)))
    iy1=min(H-1,int(math.ceil((max(y0,y1)+r-bottom)/step-0.5)))
    dx=x1-x0;dy=y1-y0;ss=dx*dx+dy*dy
    count=0;bc=0;bu=0;sc=0;su=0;origin_line=0;origin_overlap=0
    root_ids=np.zeros(MAX_PROVENANCE_ROOTS_PER_CELL,np.int32);root_n=0;root_overflow=False;root_overflow_hits=0
    r2=r*r
    for iy in range(iy0,iy1+1):
        y=bottom+(iy+0.5)*step
        for ix in range(ix0,ix1+1):
            x=left+(ix+0.5)*step
            t=((x-x0)*dx+(y-y0)*dy)/ss if ss>1e-20 else 0.
            t=max(0.,min(1.,t))
            rx=x0+t*dx;ry=y0+t*dy
            if (x-rx)*(x-rx)+(y-ry)*(y-ry)>r2:continue
            count+=1
            if prev_cert[iy,ix]:bc+=1
            if prev_uncert[iy,ix]:bu+=1
            if cur_cert[iy,ix]:sc+=1
            if cur_uncert[iy,ix]:su+=1
            if prev_uncert[iy,ix] and prev_origin[iy,ix]>0:
                if origin_line==0 or prev_origin[iy,ix]<origin_line:origin_line=prev_origin[iy,ix]
                origin_overlap+=1
            if cur_uncert[iy,ix] and cur_origin[iy,ix]>0:
                if origin_line==0 or cur_origin[iy,ix]<origin_line:origin_line=cur_origin[iy,ix]
                origin_overlap+=1
            if prev_uncert[iy,ix] or cur_uncert[iy,ix]:
                overflow_cell=False
                if prev_uncert[iy,ix]:
                    if prev_root_overflow[iy,ix]:overflow_cell=True
                    for slot in range(prev_root_count[iy,ix]):
                        candidate=prev_roots[iy,ix,slot];found=False
                        for q in range(root_n):
                            if root_ids[q]==candidate:found=True;break
                        if candidate>0 and not found:
                            if root_n<MAX_PROVENANCE_ROOTS_PER_CELL:root_ids[root_n]=candidate;root_n+=1
                            else:root_overflow=True
                if cur_uncert[iy,ix]:
                    if cur_root_overflow[iy,ix]:overflow_cell=True
                    for slot in range(cur_root_count[iy,ix]):
                        candidate=cur_roots[iy,ix,slot];found=False
                        for q in range(root_n):
                            if root_ids[q]==candidate:found=True;break
                        if candidate>0 and not found:
                            if root_n<MAX_PROVENANCE_ROOTS_PER_CELL:root_ids[root_n]=candidate;root_n+=1
                            else:root_overflow=True
                if overflow_cell:root_overflow=True;root_overflow_hits+=1
    for a in range(root_n):
        for b in range(a+1,root_n):
            if root_ids[b]<root_ids[a]:root_ids[a],root_ids[b]=root_ids[b],root_ids[a]
    if root_n>0:origin_line=root_ids[0]
    if count==0:
        # A physically nonzero sub-grid path must not disappear as proven empty.
        root_ids[0]=line_no;root_n=1
        for iy in range(iy0,iy1+1):
            for ix in range(ix0,ix1+1):
                cur_uncert[iy,ix]=1
                if cur_origin[iy,ix]==0:cur_origin[iy,ix]=line_no
                if cur_root_count[iy,ix]==0:cur_roots[iy,ix,0]=line_no;cur_root_count[iy,ix]=1
        return 3,0,0,0,0,0,line_no,0,root_ids,root_n,False,0
    if root:code=0
    else:
        direct=bc/count
        if (bu>0 or su>0) and direct<0.98:code=3
        elif direct>=threshold:code=0
        elif bc>0 or sc>0:code=1
        else:code=2
    if code==3 and root_n==0 and origin_line>0:
        root_ids[0]=origin_line;root_n=1
    target=cur_cert if code==0 else cur_uncert
    for iy in range(iy0,iy1+1):
        y=bottom+(iy+0.5)*step
        for ix in range(ix0,ix1+1):
            x=left+(ix+0.5)*step
            t=((x-x0)*dx+(y-y0)*dy)/ss if ss>1e-20 else 0.
            t=max(0.,min(1.,t))
            rx=x0+t*dx;ry=y0+t*dy
            if (x-rx)*(x-rx)+(y-ry)*(y-ry)<=r2:
                target[iy,ix]=1
                if code!=0:
                    if cur_origin[iy,ix]==0:cur_origin[iy,ix]=origin_line if code==3 and origin_line>0 else line_no
                    if code==3 and root_n>0:
                        for q in range(root_n):
                            candidate=root_ids[q];found=False
                            for slot in range(cur_root_count[iy,ix]):
                                if cur_roots[iy,ix,slot]==candidate:found=True;break
                            if not found:
                                if cur_root_count[iy,ix]<MAX_PROVENANCE_ROOTS_PER_CELL:
                                    cur_roots[iy,ix,cur_root_count[iy,ix]]=candidate;cur_root_count[iy,ix]+=1
                                else:cur_root_overflow[iy,ix]=1
                        if root_overflow:cur_root_overflow[iy,ix]=1
                    elif cur_root_count[iy,ix]==0:
                        cur_roots[iy,ix,0]=line_no;cur_root_count[iy,ix]=1
    return code,count,bc,bu,sc,su,origin_line,origin_overlap,root_ids,root_n,root_overflow,root_overflow_hits


class Screen:
    def __init__(self,step=0.2,left=0,bottom=0,right=256,top=256,root_layers=1,threshold=.65):
        if step<=0 or right<=left or top<=bottom:raise ValueError('Bad screen extent')
        self.step=step;self.left=left;self.bottom=bottom;self.right=right;self.top=top
        self.root_layers=root_layers;self.threshold=threshold
        shape=(math.ceil((top-bottom)/step),math.ceil((right-left)/step))
        self.prev_cert=np.zeros(shape,np.uint8);self.prev_uncert=np.zeros(shape,np.uint8)
        self.cur_cert=np.zeros(shape,np.uint8);self.cur_uncert=np.zeros(shape,np.uint8)
        # One deterministic earliest non-certified source line per raster cell.
        # Additional contributors are counted; this is not a complete causal DAG.
        self.prev_origin=np.zeros(shape,np.int32);self.cur_origin=np.zeros(shape,np.int32)
        self.prev_roots=np.zeros((*shape,MAX_PROVENANCE_ROOTS_PER_CELL),np.int32)
        self.cur_roots=np.zeros((*shape,MAX_PROVENANCE_ROOTS_PER_CELL),np.int32)
        self.prev_root_count=np.zeros(shape,np.uint8);self.cur_root_count=np.zeros(shape,np.uint8)
        self.prev_root_overflow=np.zeros(shape,np.uint8);self.cur_root_overflow=np.zeros(shape,np.uint8)
        self.layer=0;self.layer_z=None
        self.mask_memory_bytes=(4*self.cur_cert.nbytes+2*self.cur_origin.nbytes+
                                2*self.cur_roots.nbytes+2*self.cur_root_count.nbytes+
                                2*self.cur_root_overflow.nbytes)

    def set_layer(self,layer:int,z:float):
        if self.layer==layer:return
        if self.layer and layer<self.layer:raise ValueError('NON_MONOTONIC_LAYER')
        if self.layer:
            self.prev_cert,self.cur_cert=self.cur_cert,self.prev_cert
            self.prev_uncert,self.cur_uncert=self.cur_uncert,self.prev_uncert
            self.prev_origin,self.cur_origin=self.cur_origin,self.prev_origin
            self.prev_roots,self.cur_roots=self.cur_roots,self.prev_roots
            self.prev_root_count,self.cur_root_count=self.cur_root_count,self.prev_root_count
            self.prev_root_overflow,self.cur_root_overflow=self.cur_root_overflow,self.prev_root_overflow
            self.cur_cert.fill(0);self.cur_uncert.fill(0)
            self.cur_origin.fill(0)
            self.cur_roots.fill(0);self.cur_root_count.fill(0);self.cur_root_overflow.fill(0)
        self.layer=layer;self.layer_z=z

    def uncertain_envelope(self,x0,y0,x1,y1,width,line_no):
        # Evidence uncertainty only; never a certified donor. Missing-width
        # contexts conservatively influence a 1mm local envelope.
        if not all(map(math.isfinite,(x0,y0,x1,y1))):return [line_no],True
        radius=max(1.,width/2 if width is not None and math.isfinite(width) and width>0 else 1.)
        ix0=max(0,int(math.floor((min(x0,x1)-radius-self.left)/self.step)))
        ix1=min(self.cur_uncert.shape[1],int(math.ceil((max(x0,x1)+radius-self.left)/self.step)))
        iy0=max(0,int(math.floor((min(y0,y1)-radius-self.bottom)/self.step)))
        iy1=min(self.cur_uncert.shape[0],int(math.ceil((max(y0,y1)+radius-self.bottom)/self.step)))
        if ix0<ix1 and iy0<iy1:
            region=self.cur_uncert[iy0:iy1,ix0:ix1]
            origins=self.cur_origin[iy0:iy1,ix0:ix1]
            origins[origins==0]=line_no
            region[:]=1
            roots=self.cur_roots[iy0:iy1,ix0:ix1,:]
            counts=self.cur_root_count[iy0:iy1,ix0:ix1]
            overflow=self.cur_root_overflow[iy0:iy1,ix0:ix1]
            present=np.any(roots==line_no,axis=2)
            for slot in range(MAX_PROVENANCE_ROOTS_PER_CELL):
                put=(~present)&(counts==slot)
                roots[:,:,slot][put]=line_no
                counts[put]+=1
            overflow[(~present)&(counts>=MAX_PROVENANCE_ROOTS_PER_CELL)]=1
            unique={line_no};has_overflow=False
            for yy in range(iy1-iy0):
                for xx in range(ix1-ix0):
                    has_overflow|=bool(overflow[yy,xx])
                    for slot in range(int(counts[yy,xx])):
                        root=int(roots[yy,xx,slot])
                        if root>0:unique.add(root)
            return sorted(unique)[:MAX_PROVENANCE_ROOTS_PER_CELL],has_overflow or len(unique)>MAX_PROVENANCE_ROOTS_PER_CELL
        return [line_no],False

    def segment(self,x0,y0,x1,y1,width,z,line_no,reason=None):
        if reason:
            roots,overflow=self.uncertain_envelope(x0,y0,x1,y1,width,line_no)
            return 3,{'reason':reason,'direct_unknown':True,'root_line':line_no,'origin_line':min(roots),'origin_root_lines':roots,'origin_root_overflow':overflow,'origin_overflow_cell_hits':int(overflow),'origin_provenance_complete':not overflow,'origin_overlap_cells':0}
        if not all(map(math.isfinite,(x0,y0,x1,y1,z))) or width is None or width<=0 or not math.isfinite(width):
            roots,overflow=self.uncertain_envelope(x0,y0,x1,y1,width,line_no)
            return 3,{'reason':'MISSING_OR_INVALID_LINE_WIDTH_OR_XYZ','direct_unknown':True,'root_line':line_no,'origin_line':min(roots),'origin_root_lines':roots,'origin_root_overflow':overflow,'origin_overflow_cell_hits':int(overflow),'origin_provenance_complete':not overflow,'origin_overlap_cells':0}
        if min(x0,x1)-width/2<self.left or max(x0,x1)+width/2>self.right or min(y0,y1)-width/2<self.bottom or max(y0,y1)+width/2>self.top:
            roots,overflow=self.uncertain_envelope(x0,y0,x1,y1,width,line_no)
            return 3,{'reason':'OUTSIDE_RASTER_EXTENT','direct_unknown':True,'root_line':line_no,'origin_line':min(roots),'origin_root_lines':roots,'origin_root_overflow':overflow,'origin_overflow_cell_hits':int(overflow),'origin_provenance_complete':not overflow,'origin_overlap_cells':0}
        code,n,bc,bu,sc,su,origin_line,origin_overlap,root_ids,root_n,root_overflow,root_overflow_hits=_stamp(
            x0,y0,x1,y1,width/2,self.prev_cert,self.prev_uncert,self.cur_cert,self.cur_uncert,
            self.prev_origin,self.cur_origin,self.prev_roots,self.cur_roots,self.prev_root_count,self.cur_root_count,
            self.prev_root_overflow,self.cur_root_overflow,line_no,self.left,self.bottom,self.step,self.layer<=self.root_layers,self.threshold)
        direct_reason='SUBGRID_FOOTPRINT' if not n else None
        propagated=bool(code==3 and (bu>0 or su>0))
        roots=[int(root_ids[i]) for i in range(root_n)]
        return code,{'footprint_cells':int(n),'prev_cert_cells':int(bc),'prev_uncert_cells':int(bu),'same_cert_cells':int(sc),'same_uncert_cells':int(su),'prior_coverage':bc/n if n else None, 'uncert_coverage':bu/n if n else None,'same_cert_coverage':sc/n if n else None,'reason':direct_reason,'direct_unknown':bool(direct_reason),'propagated_unknown':propagated,'root_line':line_no if direct_reason else None,'origin_line':int(origin_line) if origin_line>0 else None,'origin_root_lines':roots,'origin_root_overflow':bool(root_overflow),'origin_overflow_cell_hits':int(root_overflow_hits),'origin_provenance_complete':not root_overflow and (not propagated or bool(roots)),'origin_overlap_cells':int(origin_overlap)}


def pieces(m:Move,step:float)->tuple[list[tuple[float,float]],str|None]:
    if m.unsupported_reason and m.g in ('G2','G3'):
        return [(m.x0,m.y0),(m.x1,m.y1)],m.unsupported_reason
    if m.g in ('G2','G3'):
        return arc_coords(m,min(.025,step*.15))
    dist=math.hypot(m.x1-m.x0,m.y1-m.y0)
    if not dist:return [],'ZERO_XY_SPAN'
    n=int(math.ceil(dist/max(.3,step*2.5)))
    if n>10000:return [],'EXCESSIVE_STRAIGHT_SPAN'
    return [(m.x0+(m.x1-m.x0)*k/n,m.y0+(m.y1-m.y0)*k/n) for k in range(n+1)],None


def _update_heat(heat:np.ndarray,m:Move,length:float,left:float,bottom:float,step:float):
    x=(m.x0+m.x1)/2;y=(m.y0+m.y1)/2
    ix=int((x-left)/step);iy=int((y-bottom)/step)
    if 0<=iy<heat.shape[0] and 0<=ix<heat.shape[1]:heat[iy,ix]+=length


def _update_heat_xy(heat:np.ndarray,x:float,y:float,length:float,left:float,bottom:float,step:float):
    ix=int((x-left)/step);iy=int((y-bottom)/step)
    if 0<=iy<heat.shape[0] and 0<=ix<heat.shape[1]:heat[iy,ix]+=length


def analyze_stream(stream, source_sha, gcode_sha, zmax:float=50.,screen_step=.2,limit_lines:int|None=None,max_examples=120, event_sink=None, path_step_mm:float|None=None, geometry_mode='raster_v1',independent_refinement=False):
    reader=Reader()
    if geometry_mode=='area_bounds_v2':mask=AreaBoundsScreen(independent_refinement=independent_refinement)
    elif geometry_mode=='raster_v1':mask=Screen(step=screen_step)
    else:raise ValueError('UNSUPPORTED_GEOMETRY_MODE')
    t0=time.monotonic();stats=Counter();summary=defaultdict(Counter);roles=defaultdict(Counter)
    examples=[];top_by_bin=defaultdict(list);unknown_reasons=Counter()
    unknown_segments=Counter();unknown_move_partition=Counter();unknown_move_flags=Counter()
    direct_roots={};propagated_origins={};root_overlap_cells=0
    root_sources={};root_impacts={};root_source_omitted=set();root_impact_omitted=set()
    provenance_overflow_segments=0;provenance_unattributed_segments=0
    heat=np.zeros((128,128),np.float64)
    heat_by_cause={key:np.zeros((128,128),np.float64) for key in ('UNKNOWN_DIRECT','UNKNOWN_PROPAGATED','UNKNOWN_OTHER','SCREEN_UNSUPPORTED','MARGINAL')}
    active_layer=0;active_z=None;first_body=None;observed_z=[];layer_report={}
    lines=0;unhandled_move_count=0;last_layer=0;prior_unlocated=0
    total_demand_events=0
    for lines,raw in enumerate(stream,1):
        if limit_lines and lines>limit_lines:break
        line=raw.decode('utf-8','replace') if isinstance(raw,bytes) else raw
        m=reader.line(line,lines)
        if geometry_mode=='area_bounds_v2' and reader.unlocated_positive_extrusion_count>prior_unlocated:
            mask.add_unbounded_source(lines,'UNKNOWN_UNLOCATED_OR_UNSUPPORTED_POSITIVE_G')
            prior_unlocated=reader.unlocated_positive_extrusion_count
        if m is None:continue
        if m.z_comment is not None and m.z_comment>zmax+.51 and m.layer>1:
            break
        if m.z_comment is None or m.layer_height is None:
            global_reason='MISSING_LAYER_ANNOTATION'
        else:global_reason=m.unsupported_reason
        if m.z_comment is not None and abs(m.z1-m.z_comment)>0.035:
            global_reason='LAYER_Z_MISMATCH'
        if abs(m.z1-m.z0)>0.02:global_reason='EXTRUDING_3D_Z_MOVE'
        if m.layer!=active_layer:
            mask.set_layer(m.layer,m.z1)
            active_layer=m.layer;active_z=m.z_comment
            observed_z.append({'layer':m.layer,'z':m.z_comment})
        if m.z1>zmax+1e-5:continue
        part_meta=None
        if geometry_mode=='area_bounds_v2':
            if m.unsupported_reason and m.g in ('G2','G3'):pp,issue=pieces(m,mask.arc_sagitta_mm)
            elif m.g in ('G2','G3'):
                interval=m.width/4 if m.width is not None and math.isfinite(m.width) and m.width>0 else 0.1
                part_meta,issue=arc_reporting_parts(m,interval)
                pp=[part_meta[0]['p0']]+[p['p1'] for p in part_meta] if not issue and part_meta else []
            else:pp=[(m.x0,m.y0),(m.x1,m.y1)];issue=None
        else:pp,issue=pieces(m,path_step_mm if path_step_mm is not None else screen_step)
        if issue:global_reason=issue;pp=[(m.x0,m.y0),(m.x1,m.y1)];part_meta=None
        classification=[];total_length=0;counts=Counter();weighted_direct=0.;weighted_same=0.
        segment_records=[];move_unknown_flags=set();move_segment_codes=set();move_origins=set();move_root_lines=set();param_count=max(1,len(pp)-1)
        if not pp or len(pp)<2:
            classification=[3];unknown_reasons['NO_SUBSEGMENTS']+=1
            move_unknown_flags.add('UNKNOWN_OTHER')
            unknown_segments['UNKNOWN_OTHER_SEGMENTS']+=1
            segment_records.append({'segment_index':0,'source_t_start':0.0,'source_t_end':1.0,'length_mm':None,'length_value_basis':'UNMEASURABLE_NO_SUBSEGMENTS','screen_code':'UNKNOWN','unknown_cause':'UNKNOWN_OTHER','reason':'NO_SUBSEGMENTS','origin_line':None})
        class_length_error=Counter()
        for part_index,((x0,y0),(x1,y1)) in enumerate(zip(pp,pp[1:])):
            meta=part_meta[part_index] if part_meta is not None else None
            length=meta['length_mm'] if meta is not None else math.hypot(x1-x0,y1-y0)
            if length<1e-12:continue
            if geometry_mode=='area_bounds_v2':
                epsilon=meta['epsilon_mm'] if meta is not None else 0.
                code,details=mask.segment(x0,y0,x1,y1,m.width,m.z1,lines,global_reason,epsilon=epsilon)
            else:code,details=mask.segment(x0,y0,x1,y1,m.width,m.z1,lines,global_reason)
            if details.get('reason'):
                unknown_reasons[details['reason']]+=1
            classification.append(code)
            move_segment_codes.add(STATUS[code])
            counts[STATUS[code]]+=length
            if meta is not None:class_length_error[STATUS[code]]+=meta['length_error_mm']
            total_length+=length
            weighted_direct+=(details.get('prior_coverage') or 0)*length
            weighted_same+=(details.get('same_cert_coverage') or 0)*length
            cause=None
            if details.get('origin_root_overflow'):provenance_overflow_segments+=1
            if code==3:
                if details.get('direct_unknown'):
                    cause='UNKNOWN_DIRECT'
                    root_ids=details.get('origin_root_lines',[lines])
                    source_kind='UNKNOWN_DIRECT'
                    if cause=='UNKNOWN_DIRECT':
                        root=direct_roots.setdefault(lines,{'source_line':lines,'layer':m.layer,'machine_z_mm':m.z1,'opcode':m.g,'feature':m.role,'x0':m.x0,'y0':m.y0,'x1':m.x1,'y1':m.y1,'line_width_mm':m.width,'reason':details.get('reason') or global_reason or 'SUBGRID_FOOTPRINT','direct_segments':0,'direct_length_mm':0.0})
                        root['direct_segments']+=1;root['direct_length_mm']+=length
                elif details.get('propagated_unknown'):
                    cause='UNKNOWN_PROPAGATED'
                    root_ids=details.get('origin_root_lines',[])
                    source_kind=None
                    if not details.get('origin_provenance_complete'):provenance_unattributed_segments+=1
                    origin=int(details.get('origin_line') or 0)
                    origin_key=str(origin) if origin else 'UNATTRIBUTED_ORIGIN'
                    rec=propagated_origins.setdefault(origin_key,{'earliest_source_line':origin or None,'affected_segment_count':0,'affected_move_count':0,'affected_length_mm':0.0,'first_affected_line':lines,'last_affected_line':lines,'first_affected_layer':m.layer,'last_affected_layer':m.layer,'sample_positions':[]})
                    rec['affected_segment_count']+=1;rec['affected_length_mm']+=length
                    move_origins.add(origin_key)
                    rec['first_affected_line']=min(rec['first_affected_line'],lines);rec['last_affected_line']=max(rec['last_affected_line'],lines)
                    rec['first_affected_layer']=min(rec['first_affected_layer'],m.layer);rec['last_affected_layer']=max(rec['last_affected_layer'],m.layer)
                    if len(rec['sample_positions'])<4:rec['sample_positions'].append({'line':lines,'layer':m.layer,'z_mm':m.z1,'x0':x0,'y0':y0,'x1':x1,'y1':y1})
                    root_overlap_cells+=details.get('origin_overlap_cells',0)
                else:cause='UNKNOWN_OTHER'
                if cause in ('UNKNOWN_DIRECT','UNKNOWN_PROPAGATED'):
                    for root_line in root_ids:
                        if root_line not in root_sources:
                            if len(root_sources)<MAX_PROVENANCE_ROOT_RECORDS:
                                root_sources[root_line]={'source_line':root_line,'source_kinds':[],'layer':None,'opcode':None,'feature':None}
                            else:
                                if geometry_mode=='area_bounds_v2':raise ProvenanceBudgetExceeded('ROOT_SOURCE_RECORD_BUDGET_EXCEEDED')
                                root_source_omitted.add(root_line)
                        root_rec=root_sources.get(root_line)
                        if root_rec is not None:
                            kind=source_kind if cause=='UNKNOWN_DIRECT' else root_rec['source_kinds'][0] if root_rec['source_kinds'] else 'SOURCE_KIND_UNRECORDED'
                            if kind not in root_rec['source_kinds']:root_rec['source_kinds'].append(kind)
                            if cause=='UNKNOWN_DIRECT':
                                root_rec.update({'layer':m.layer,'opcode':m.g,'feature':m.role,'reason':details.get('reason') or global_reason or 'SUBGRID_FOOTPRINT'})
                        impact=root_impacts.get(root_line)
                        if impact is None:
                            if len(root_impacts)<MAX_PROVENANCE_ROOT_RECORDS:
                                impact={'source_line':root_line,'affected_segment_count':0,'affected_length_mm_nonexclusive':0.0,'affected_move_count':0,'first_affected_line':lines,'last_affected_line':lines,'sample_positions':[]};root_impacts[root_line]=impact
                            else:
                                if geometry_mode=='area_bounds_v2':raise ProvenanceBudgetExceeded('ROOT_IMPACT_RECORD_BUDGET_EXCEEDED')
                                root_impact_omitted.add(root_line)
                        if impact is not None:
                            impact['affected_segment_count']+=1;impact['affected_length_mm_nonexclusive']+=length
                            move_root_lines.add(root_line)
                            impact['first_affected_line']=min(impact['first_affected_line'],lines);impact['last_affected_line']=max(impact['last_affected_line'],lines)
                            if len(impact['sample_positions'])<4:impact['sample_positions'].append({'line':lines,'layer':m.layer,'segment_index':part_index,'x0':x0,'y0':y0,'x1':x1,'y1':y1,'direct_source_line':cause=='UNKNOWN_DIRECT'})
                move_unknown_flags.add(cause)
                unknown_segments[cause+'_SEGMENTS']+=1
                unknown_segments[cause+'_LENGTH_MM']+=length
                _update_heat_xy(heat_by_cause[cause],(x0+x1)/2,(y0+y1)/2,length,0,0,2.)
            elif code==2:
                if lines not in root_sources and len(root_sources)<MAX_PROVENANCE_ROOT_RECORDS:root_sources[lines]={'source_line':lines,'source_kinds':['SCREEN_UNSUPPORTED'],'layer':m.layer,'opcode':m.g,'feature':m.role,'reason':'NO_PRIOR_CERTIFIED_RECEIVER'}
                elif lines not in root_sources:
                    if geometry_mode=='area_bounds_v2':raise ProvenanceBudgetExceeded('ROOT_SOURCE_RECORD_BUDGET_EXCEEDED')
                    root_source_omitted.add(lines)
                _update_heat_xy(heat_by_cause['SCREEN_UNSUPPORTED'],(x0+x1)/2,(y0+y1)/2,length,0,0,2.)
            elif code==1:
                if lines not in root_sources and len(root_sources)<MAX_PROVENANCE_ROOT_RECORDS:root_sources[lines]={'source_line':lines,'source_kinds':['MARGINAL'],'layer':m.layer,'opcode':m.g,'feature':m.role,'reason':'MARGINAL_RECEIVER_COVERAGE'}
                elif lines not in root_sources:
                    if geometry_mode=='area_bounds_v2':raise ProvenanceBudgetExceeded('ROOT_SOURCE_RECORD_BUDGET_EXCEEDED')
                    root_source_omitted.add(lines)
                _update_heat_xy(heat_by_cause['MARGINAL'],(x0+x1)/2,(y0+y1)/2,length,0,0,2.)
            segment_records.append({'segment_index':part_index,'source_t_start':meta['t0'] if meta is not None else part_index/param_count,'source_t_end':meta['t1'] if meta is not None else (part_index+1)/param_count,'length_mm':length,'length_lower_mm':max(0.,length-meta['length_error_mm']) if meta is not None else length,'length_upper_mm':length+meta['length_error_mm'] if meta is not None else length,'length_value_basis':'source_arc_length_center_radius' if meta is not None else ('endpoint_chord_lower_bound_for_invalid_path' if issue else 'xy_segment_length'),'arc_sagitta_bound_mm':meta['sagitta_mm'] if meta is not None else None,'path_geometry_epsilon_mm':meta['epsilon_mm'] if meta is not None else None,'screen_code':STATUS[code],'unknown_cause':cause,'reason':details.get('reason'),'origin_line':details.get('origin_line') or None,'footprint_cells':details.get('footprint_cells'),'prior_cert_cells':details.get('prev_cert_cells'),'prior_uncertain_cells':details.get('prev_uncert_cells'),'same_layer_cert_cells':details.get('same_cert_cells'),'same_layer_uncertain_cells':details.get('same_uncert_cells')})
        if not classification:
            code=3;unknown_reasons['NO_VALID_FOOTPRINT']+=1
        if geometry_mode=='area_bounds_v2':mask.commit_move()
        elif 3 in classification:code=3
        elif 2 in classification:code=2
        elif 1 in classification:code=1
        else:code=0
        cat=STATUS[code]
        move_partition=None
        if move_unknown_flags:
            if 'UNKNOWN_DIRECT' in move_unknown_flags:move_partition='UNKNOWN_DIRECT'
            elif 'UNKNOWN_PROPAGATED' in move_unknown_flags:move_partition='UNKNOWN_PROPAGATED'
            else:move_partition='UNKNOWN_OTHER'
            unknown_move_partition[move_partition]+=1
            unknown_move_flags['moves_with_unknown']+=1
            if len(move_unknown_flags)>1:unknown_move_flags['moves_with_multiple_unknown_causes']+=1
            unknown_move_flags['cause_flags:'+'+'.join(sorted(move_unknown_flags))]+=1
        if len(move_segment_codes)>1:unknown_move_flags['moves_with_mixed_segment_classes']+=1
        for origin_key in move_origins:propagated_origins[origin_key]['affected_move_count']+=1
        for root_line in move_root_lines:
            if root_line in root_impacts:root_impacts[root_line]['affected_move_count']+=1
        stats[cat]+=1;stats['TOTAL_POSITIVE_MOVES']+=1;stats[f'OPCODE_{m.g}']+=1
        if m.g!='G1':stats['POSITIVE_ARC_MOVES']+=1
        for key,length in counts.items():stats['LENGTH_MM_'+key]+=length
        roll=summary[m.layer];roll[cat]+=1;roll['positive_moves']+=1
        roll['machine_z']=m.z1
        roll['role_support_moves']+=int('support' in m.role.lower())
        roll['role_body_moves']+=int('support' not in m.role.lower())
        roles[m.role][cat]+=1
        if 'support' not in m.role.lower() and first_body is None:first_body={'layer':m.layer,'machine_z':m.z1,'line':lines}
        if code!=0:
            if code==2: _update_heat(heat,m,total_length,0,0,2.)
            # Sample the worst per 5mm height bin and preserve chronological source lines.
            bucket=int(m.z1//5)
            ev={'source_event':{'gcode_sha256':gcode_sha,'gcode_line':lines,'opcode':m.g,'layer':m.layer,'feature':m.role},
                'machine':{'x0':m.x0,'y0':m.y0,'x1':m.x1,'y1':m.y1,'z_mm':m.z1,'line_width_mm':m.width,'extrusion_delta_mm':m.de},
                'observed_event':'OBSERVED_POSITIVE_EXTRUSION','classification':cat,'certainty':'UNCERTAIN' if 3 in classification else ('KNOWN_UNSUPPORTED' if counts['UNSUPPORTED_FIRST_EXTRUSION']>0 else 'KNOWN_SCREEN'),
                'move_summary':{'has_unknown':3 in classification,'known_unsupported_length_mm':counts['UNSUPPORTED_FIRST_EXTRUSION'],'unknown_length_mm':counts['UNKNOWN'],'known_supported_length_mm':counts['SUPPORTED_TOOLPATH'],'marginal_length_mm':counts['MARGINAL_SUPPORT'],'unknown_move_cause_partition':move_partition},
                'segments':segment_records,'footprint':{'screen_grid_mm':screen_step if geometry_mode=='raster_v1' else None,'metric':'raster_cell_area_fraction' if geometry_mode=='raster_v1' else 'swept_capsule_area_fraction_bounds','geometry_mode':geometry_mode,'arc_sagitta_tolerance_mm':mask.arc_sagitta_mm if geometry_mode=='area_bounds_v2' else None,'arc_interval_rule':'fixed source arc-length intervals capped at line_width/4 mm and 0.005 mm geometric sagitta' if geometry_mode=='area_bounds_v2' and m.g in ('G2','G3') and part_meta is not None else None,'class_length_bounds_mm':{k:{'lower':max(0.,counts[k]-class_length_error[k]),'upper':counts[k]+class_length_error[k]} for k in counts},'path_length_mm':round(total_length,5),
                   'unsupported_length_mm':round(counts['UNSUPPORTED_FIRST_EXTRUSION'],5),
                   'marginal_length_mm':round(counts['MARGINAL_SUPPORT'],5),
                   'unknown_length_mm':round(counts['UNKNOWN'],5),
                   'mean_previous_certified_coverage':round(weighted_direct/total_length,5) if total_length else None,
                   'mean_same_layer_certified_coverage':round(weighted_same/total_length,5) if total_length else None},
                'cad_binding':{'status':'UNBOUND','flower_id':None,'support_id':None,'geometry_transform':None},
                'generator_bridge':{'status':'NOT_EMITTED','source_event_hash':None,'rule_id':None,'requires_bound_transform':True}}
            ev['source_event']['event_id']=hashlib.sha256(f'{gcode_sha}:{m.layer}:{lines}'.encode()).hexdigest()
            if event_sink is not None:
                event_sink.write(json.dumps(ev,separators=(',',':'),ensure_ascii=False)+'\n')
            total_demand_events+=1
            rank=(3 if code==2 else 2 if code==1 else 1)*max(.0001,total_length)
            bucket_rows=top_by_bin[bucket]
            if len(bucket_rows)<max(4,max_examples//11):bucket_rows.append((rank,ev))
            else:
                k=min(range(len(bucket_rows)),key=lambda i:bucket_rows[i][0])
                if rank>bucket_rows[k][0]:bucket_rows[k]=(rank,ev)
        last_layer=m.layer
    if geometry_mode=='area_bounds_v2':
        for source_line,source_kind in mask.root_source_kinds.items():
            if source_line not in root_sources:
                if len(root_sources)>=MAX_PROVENANCE_ROOT_RECORDS:
                    raise ProvenanceBudgetExceeded('ROOT_SOURCE_RECORD_BUDGET_EXCEEDED')
                root_sources[source_line]={'source_line':source_line,'source_kinds':[source_kind],
                    'layer':None,'opcode':None,'feature':None,'reason':'ROOT_SOURCE_KIND_RECORDED'}
            elif source_kind not in root_sources[source_line]['source_kinds']:
                root_sources[source_line]['source_kinds'].append(source_kind)
    examples=[r for bucket in sorted(top_by_bin) for _,r in sorted(top_by_bin[bucket],key=lambda x:-x[0])]
    examples=examples[:max_examples]
    by_height=defaultdict(Counter)
    for l,s in summary.items():
        z=s.get('machine_z')
        if isinstance(z,float):
            n=int(z)
            for cat in STATUS:by_height[n][cat]+=s[cat]
            by_height[n]['TOTAL_POSITIVE_MOVES']+=s['positive_moves']
    return {
        'schema':SCHEMA_AREA_BOUNDS if geometry_mode=='area_bounds_v2' else SCHEMA,'geometry_mode':geometry_mode,'status':'SAVED_LIGHT_SLICE_DIAGNOSTIC','scope':'MACHINE_COORDINATES_ONLY',
        'z_range_machine_mm':[0.,zmax], 'gcode_sha256':gcode_sha,'source_3mf_sha256':source_sha,
        'complete_low_z_scan':not limit_lines or lines<limit_lines,'read_lines':lines,'max_layer_scanned':last_layer,
        'first_body_extrusion':first_body,
        'grid_mm':screen_step if geometry_mode=='raster_v1' else None,'path_tessellation_step_mm':path_step_mm if geometry_mode=='raster_v1' and path_step_mm is not None else screen_step if geometry_mode=='raster_v1' else None,'grid_mask_memory_bytes':mask.mask_memory_bytes if geometry_mode=='raster_v1' else 0,
        'receiver_rule':'Only previously classified certified paths from prior layer; earlier same-layer certified path counts as connection only (marginal), never as vertical receiver; unknown/unsupported never become certified donor. Raft layer 1 is software bed-rooted only.',
        'root_layers':mask.root_layers, 'direct_coverage_threshold':mask.threshold,
        'counts':dict(stats),'observed_positive_extrusion_moves':stats['TOTAL_POSITIVE_MOVES'],
        'positive_extrusion_event_accounting':{'coordinate_tracked_supported_opcode_moves':stats['TOTAL_POSITIVE_MOVES'],'unlocated_or_unsupported_opcode_positive_events':reader.unlocated_positive_extrusion_count,'combined_parsed_positive_g_events':stats['TOTAL_POSITIVE_MOVES']+reader.unlocated_positive_extrusion_count,'meaning':'Positive-E G motion commands accounted by parser; excludes non-G E parameters and does not claim physical filament deposition.'},
        'screen_move_counts':{'SCREEN_SUPPORTED':stats['SUPPORTED_TOOLPATH'],'SCREEN_UNSUPPORTED':stats['UNSUPPORTED_FIRST_EXTRUSION'],'MARGINAL':stats['MARGINAL_SUPPORT'],'UNCERTAIN':stats['UNKNOWN']},
        'total_saved_demand_event_rows':total_demand_events,
        'classification_semantics':{'observed_event':'Every parsed positive-E motion is an OBSERVED_POSITIVE_EXTRUSION event. Screen class is an algorithmic result only.','unknown_segment_partition':'Per unknown subsegment, direct local measurement/parser failure takes precedence; otherwise any previous or same-layer uncertain-cell overlap is propagated; remaining unknown segments are other.','unknown_move_partition':'Mutually exclusive by move with priority UNKNOWN_DIRECT then UNKNOWN_PROPAGATED then UNKNOWN_OTHER. Cause flags and per-segment rows preserve mixed-cause moves.','origin_provenance':'raster_v1 retains up to K roots/cell with explicit overflow. area_bounds_v2 uses lossless interned root unions; any resource budget exceedance stops the run.' if geometry_mode=='area_bounds_v2' else 'Bounded per-cell root sets retain up to K unique source lines. Impacts are nonexclusive across roots and lengths; overflow/omissions explicitly make provenance incomplete.','area_bounds_v2':'Swept-capsule area coverage uses conservative lower/upper bounds; only a lower bound at or above the unchanged threshold certifies. Proven overlap below threshold is marginal; interval straddles and exhausted subdivision budget are UNKNOWN. Arc chords use fixed sagitta tolerance; each G-code move is classified before its segments are committed as donors.' if geometry_mode=='area_bounds_v2' else None},
        'unknown_direct_move_count':unknown_move_partition['UNKNOWN_DIRECT'],'unknown_propagated_move_count':unknown_move_partition['UNKNOWN_PROPAGATED'],'unknown_other_move_count':unknown_move_partition['UNKNOWN_OTHER'],
        'unknown_segment_counts_and_lengths':dict(unknown_segments),'unknown_move_cause_flags':dict(unknown_move_flags),'origin_overlap_cell_observations':root_overlap_cells,
        'direct_unknown_roots':list(direct_roots.values()),'propagated_origin_impacts':list(propagated_origins.values()),
        'provenance_contract':({'mode':'lossless_interned_root_unions','root_sets_used':len(mask.pool.sets),'root_set_budget':mask.pool.max_distinct_sets,'root_references_used':mask.pool.root_references,'root_reference_budget':mask.pool.max_root_references,'donor_records_used':mask.donor_records,'donor_record_budget':2_000_000,'global_unbounded_source_lines':sorted(mask.global_uncertain_roots),'root_sources':list(root_sources.values()),'root_impacts':list(root_impacts.values()),'root_impact_lengths_are_nonexclusive':True,'unresolved_referenced_roots':sorted((set(root_impacts)|mask.global_uncertain_roots)-set(root_sources)),'complete':not any((root_source_omitted,root_impact_omitted,provenance_overflow_segments,provenance_unattributed_segments)) and not ((set(root_impacts)|mask.global_uncertain_roots)-set(root_sources))} if geometry_mode=='area_bounds_v2' else {'mode':'bounded_raster_v1','roots_per_cell_max':MAX_PROVENANCE_ROOTS_PER_CELL,'root_records_max':MAX_PROVENANCE_ROOT_RECORDS,'distinct_root_sources_omitted':len(root_source_omitted),'distinct_root_impacts_omitted':len(root_impact_omitted),'segments_with_root_overflow':provenance_overflow_segments,'propagated_segments_without_complete_root_set':provenance_unattributed_segments,'complete':not any((root_source_omitted,root_impact_omitted,provenance_overflow_segments,provenance_unattributed_segments)),'root_sources':list(root_sources.values()),'root_impacts':list(root_impacts.values()),'root_impact_lengths_are_nonexclusive':True}),
        'unknown_reasons':dict(unknown_reasons), 'parser_errors':dict(reader.errors),'unlocated_positive_extrusion_count':reader.unlocated_positive_extrusion_count,'unhandled_positive_extrusion_samples':reader.rejected_extrusions,'unhandled_positive_extrusion_omitted_count':reader.rejected_extrusion_omitted,'position_invalidation_count':reader.position_invalidation_count,'position_invalidation_samples':reader.position_invalidations,'position_invalidation_omitted_count':reader.position_invalidations_omitted,
        'by_layer':[{'layer':k,**dict(v)} for k,v in sorted(summary.items())],
        'by_machine_height_mm':[{'floor_z_mm':k,**dict(v)} for k,v in sorted(by_height.items())],
        'by_feature':{k:dict(v) for k,v in sorted(roles.items())},
        'examples':examples,'heat':heat,'heat_by_cause':heat_by_cause,
        'run_wall_seconds':time.monotonic()-t0,
        'limit_reason':'line_limit' if limit_lines else 'z_limit',
        'physical_risk':{'unsupported_gcode_paths_are_screening_events_not_physical_buckling_or_strength_certification':True,'missing_width_uncertainty_envelope':'1mm local radius is an explicit conservative diagnostic assumption, not a proven physical upper bound; unknown source extent can exceed it.',
             'thin_neck_to_shaft_id_assignment':'UNBOUND','plate_to_material_physical_adhesion':'UNVERIFIED',
             'independent_root_count':'UNVERIFIED_WITHOUT_CERTIFIED_CAD_MAPPING',
             'remaining_upper_brace_length':'UNVERIFIED_WITHOUT_CERTIFIED_SUPPORT_GEOMETRY',
             'post_four_layer_continuation':'NOT_YET_CERTIFIED'},
    }


def save_diagnostic(result:dict,out:Path):
    out.mkdir(parents=True,exist_ok=True)
    heat=result.pop('heat')
    (out/'DIAGNOSTIC_RESULT.json').write_text(json.dumps(result,indent=2,ensure_ascii=False,default=float),encoding='utf-8')
    np.savez_compressed(out/'XY_UNSUPPORTED_HEATMAP.npz',length_mm=heat,step_mm=np.array(2.0),origin_mm=np.array([0.,0.]))
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        fig,ax=plt.subplots(figsize=(9,9))
        ax.imshow(heat,origin='lower',extent=[0,256,0,256],interpolation='nearest')
        ax.set(title='Saved LIGHT G-code: machine XY / first unsupported extrusion screen, Z 0-50mm',xlabel='Machine X (mm)',ylabel='Machine Y (mm)')
        fig.savefig(out/'XY_UNSUPPORTED_HEATMAP.png',dpi=125,bbox_inches='tight')
        plt.close(fig)
    except ImportError:
        pass
    (out/'DEMAND_INTERFACE.json').write_text(json.dumps({
      'schema':'katachi.lowz.gcode_support_demand.v0',
      'provenance':{'gcode_sha256':result['gcode_sha256'],'source_3mf_sha256':result['source_3mf_sha256'],'source_label':'SAVED_LIGHT_SLICE_DIAGNOSTIC'},
      'meaning':'READ_ONLY toolpath demand proposals only; not support geometry or print license',
      'coordinate_frame':'machine_xy_z','cad_transform_status':'UNBOUND',
      'source_event_mapping':'G-code line, layer, XYZ, width, layer order, coverage fractions; traceable to input SHA',
      'generator_preconditions':['verified source geometry and machine/CAD transform','source event to actual source component/part resolved','positive source geometry and stable support references','separate V2 shaft-neck-foot-brace rule/collision/removal validation'],
      'cannot_generate_without':['cad_xyz_transform','component_id_binding','manufacturing_source_identity','validated generator domain'],
      'print_go':False,
      'examples':result['examples'][:24]
    },indent=2,ensure_ascii=False),encoding='utf-8')


def main(argv=None):
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--job',type=Path,required=True)
    ap.add_argument('--light',type=Path,required=True)
    ap.add_argument('--out',type=Path,required=True)
    ap.add_argument('--job-sha',default='3c4065ed76e7741de7da4683bec7e1f61a09e3342cc3f5a2e3eaf7fd9c91c353')
    ap.add_argument('--light-sha',default='ecaa3527c26a6b608191cb4fac4f6d8db6d1c871be2b1adc62854d7f84266415')
    ap.add_argument('--gcode-sha',default='3621f2f42bab5881d7a8dae1045337e0c32e950531261256ed3b7496d8be6744')
    ap.add_argument('--zmax',type=float,default=50.0)
    ap.add_argument('--grid',type=float,default=0.2)
    ap.add_argument('--max-examples',type=int,default=110)
    ap.add_argument('--limit-lines',type=int,default=None,help='Synthetic/smoke only; never describe as full 0-50 diagnostic')
    args=ap.parse_args(argv)
    if args.zmax<=0 or args.grid<=0:ap.error('Positive z/grid required')
    if args.out.exists() and any(args.out.iterdir()):ap.error('OUT must be new/empty; no overwriting')
    match=match_source_job(args.light,args.job,args.light_sha,args.job_sha,args.gcode_sha)
    args.out.mkdir(parents=True,exist_ok=True)
    (args.out/'SOURCE_BINDING.json').write_text(json.dumps(match,indent=2,ensure_ascii=False),encoding='utf-8')
    print('SHA identity PASS: source+saved job+embedded G-code; CURRENT PRINT UNBOUND',flush=True)
    with zipfile.ZipFile(args.job) as z:
        with z.open('Metadata/plate_1.gcode') as stream:
            with gzip.open(args.out/'SCREENING_EVENTS.jsonl.gz','wt',encoding='utf-8',compresslevel=5) as sink:
                result=analyze_stream(stream,args.light_sha,args.gcode_sha,args.zmax,args.grid,args.limit_lines,args.max_examples,event_sink=sink)
    save_diagnostic(result,args.out)
    print(json.dumps({k:result[k] for k in ['status','read_lines','max_layer_scanned','counts','unknown_reasons','run_wall_seconds']},indent=2),flush=True)
    return 0

if __name__=='__main__':sys.exit(main())
