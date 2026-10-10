import json,collections
c=json.load(open('work/delete_mode/ledger_inspect.json',encoding='utf-8'));p=[]
f=c['flower_records'];print('flowers type/sample',type(f),str(f[:1] if isinstance(f,list) else list(f.items())[:1])[:600]);print('assignment',str(c['flower_assignment'])[:350])
for r in c['records']:
 sr=r['source_record'];
 if any(str(sr.get(k,'')).startswith('F') for k in ('target_id','parent_id','flower_id')):p.append(r)
print('protected',len(p),collections.Counter(r['source_group'] for r in p));print('types',collections.Counter(r['source_record'].get('kind') for r in p))
