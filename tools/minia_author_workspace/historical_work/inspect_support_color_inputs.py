import pathlib,json,sys,collections
O=pathlib.Path(__file__).resolve().parent.parent/'outputs';sys.path.insert(0,str(O/'route_runtime'))
from real_graph import Context
c=Context(O);lock=json.loads((O/'TRANSFORM_AND_REFERENCE_LOCKS.json').read_text())
s=json.loads(pathlib.Path(lock['locks']['support_source']['path']).read_text())['objects']
for name,rows in [('permanent',[m for m in c.members.values() if m['role']=='PERMANENT']),('support',[m for m in c.members.values() if m['role']=='SUPPORT'])]:
 print(name,'count',len(rows),'parent',collections.Counter(str(m['parent'])[:1] for m in rows),'target',collections.Counter(str(m['target'])[:1] for m in rows))
 print(json.dumps(rows[:2],ensure_ascii=False))
print('support records',json.dumps(s[:3],ensure_ascii=False)[:6000])
surface=json.loads(pathlib.Path(lock['locks']['flower_source']['path']).read_text())
print('surface keys',surface.keys());print(json.dumps(surface['surface'][:1],ensure_ascii=False)[:2500])
g,unknown=c.build(156,'PRINTING_WITH_SUPPORT')
contacts=[(a,b,d) for a,b,d in g.edges(data=True) if {g.nodes[a].get('role'),g.nodes[b].get('role')}=={'SUPPORT','PERMANENT'}]
print('graph contacts',len(contacts),'examples',contacts[:5],'unknown',len(unknown))
