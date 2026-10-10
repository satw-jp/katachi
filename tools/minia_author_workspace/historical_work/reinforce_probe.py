import bpy,runpy,json,collections,math
from pathlib import Path
import numpy as np
O=Path(__file__).resolve().parents[1]/'outputs'
runpy.run_path(str(O/'MINIA_INTERVAL_DELETE_BOOTSTRAP.py'))
import interval_delete as d
s=bpy.context.scene;st=d.mp.scan_state(s,True);g,display=d.mp._graph_state(st)
scores=d.mp.colorbase.score_graph(g,st['cache']['seeds'])
dist=d.mp.nx.multi_source_dijkstra_path_length(g,st['cache']['seeds'],weight='length_mm')
ledger,_=d.mp.route_v2_panel._load_ledger(s)
hostpath=Path(r'J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_D6_SIZE_RHYTHM_V2\data\host.npz')
h=np.load(hostpath);print('HOST',[(k,h[k].shape) for k in h.files],flush=True)
print('STATS',len(st['id_by_index']),len(st['edge_rows']),len(d.masks(s)),len(g),len(g.edges),len(st['cache']['seeds']),flush=True)
hist=collections.Counter('unknown' if r['effective_distance_mm'] is None else str(min(31,round(r['effective_distance_mm']/30*31))) for r in scores.values())
print('BINS',sorted(hist.items()),flush=True)
payload={'positions':st['id_to_pos'],'roots':st['roots'],'nodes':list(g.nodes(data=True)),'edges':list(g.edges(data=True)),'seeds':st['cache']['seeds'],'anchors':st['cache']['anchors'],'mids':list(st['mid_records'].values()),'segments':st['cache']['segments'],'deleted':d.masks(s),'source_to_plate':ledger['source_to_plate'],'flowers':ledger['flower_records'],'records':ledger['records'],'initial_histogram':dict(hist)}
(O.parent/'work/reinforce_input.json').write_text(json.dumps(payload,separators=(',',':')),encoding='utf-8')
print('PROBE_DONE',flush=True)
