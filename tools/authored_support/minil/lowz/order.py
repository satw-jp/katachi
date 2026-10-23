"""Finite search allocation across the full requested height, not early Z only."""
from collections import defaultdict,deque
import math

def ordered_demands(events,band_mm=5.):
    priorities=defaultdict(lambda:defaultdict(list))
    for e in events:
        priority=(e['category']!='INDEPENDENT_BIRTH',not e['part_name'].upper().startswith('FLOWERS'))
        priorities[priority][int(math.floor(e['cad_z_mm']/band_mm))].append(e)
    for priority in sorted(priorities):
        bands={b:deque(sorted(rows,key=lambda e:(e['cad_z_mm'],e['id']))) for b,rows in priorities[priority].items()}
        while any(bands.values()):
            for b in sorted(bands):
                if bands[b]:yield bands[b].popleft()
