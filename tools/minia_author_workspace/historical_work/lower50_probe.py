from pathlib import Path
p=Path(__file__).with_name('reinforce_probe.py')
src=p.read_text(encoding='utf-8').replace('reinforce_input.json','lower50_input.json')
src=src.replace("'initial_histogram':dict(hist)","'initial_histogram':dict(hist),'display':display,'catalog':d.catalog(st)")
exec(compile(src,str(p),'exec'))
