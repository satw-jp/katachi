from pathlib import Path
p=Path(__file__).with_name('reinforce_probe.py')
src=p.read_text(encoding='utf-8').replace('reinforce_input.json','lower70_input.json').replace('MINIA_INTERVAL_DELETE_BOOTSTRAP.py','MINIA_LOWER50_BOOTSTRAP.py')
src=src.replace("'initial_histogram':dict(hist)","'initial_histogram':dict(hist),'display':display,'catalog':d.catalog(st),'reroutes':json.loads(s.get('minia_flower_reroutes_v1','[]'))")
exec(compile(src,str(p),'exec'))
