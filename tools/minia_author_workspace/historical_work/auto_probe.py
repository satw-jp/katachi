import gzip,json,collections,math
c=json.load(gzip.open('outputs/COLOR_PATH_GRAPH.json.gz','rt',encoding='utf-8')); segs=c['segments'];print(segs[:3]);lens=[math.dist(s['a'],s['b']) for s in segs];print('max',max(lens),'ge10',sum(x>=10 for x in lens));print('samplebranch',segs[:8])
