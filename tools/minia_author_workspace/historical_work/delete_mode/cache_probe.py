import gzip,json,collections
c=json.load(gzip.open('outputs/COLOR_PATH_GRAPH.json.gz','rt',encoding='utf-8'));print('keys',c.keys());print('node',c['nodes'][:5]);print('edge',c['edges'][:3])
