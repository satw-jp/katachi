import pathlib,json,shutil,time
from real_graph import Context
R=pathlib.Path(__file__).resolve().parents[2];O=R/'outputs';T=R/'work/runtime_input_test';T.mkdir(exist_ok=True)
for name in ['SOURCE_BINDING.json','TRANSFORM_AND_REFERENCE_LOCKS.json','SELECTED_GEOMETRY_HEIGHT_CACHE.json']:
    shutil.copy2(O/name,T/name)
c=Context(T);old=c.key(43.2,'PRINTING_WITH_SUPPORT',());assert not c.inputs_changed()
p=T/'SELECTED_GEOMETRY_HEIGHT_CACHE.json';p.write_bytes(p.read_bytes()+b'\n')
assert c.inputs_changed()
try:c.evaluate(43.2,'PRINTING_WITH_SUPPORT')
except RuntimeError as e:assert 'STALE' in str(e)
else:raise AssertionError('Changed contact ledger accepted')
updated=Context(T);assert updated.key(43.2,'PRINTING_WITH_SUPPORT',())!=old
p=T/'SOURCE_BINDING.json';d=json.loads(p.read_text());d['source_records']['local_lobe']['sha256']='0'*64;p.write_text(json.dumps(d))
try:Context(T)
except RuntimeError as e:assert 'Source hash changed' in str(e)
else:raise AssertionError('Incorrect source binding hash accepted')
(O/'ROUTE_RUNTIME_LOCK_TEST.json').write_text(json.dumps({'pass':True,'checks':['source SHA checked on load','contact file mutation marks STALE','stale evaluation rejected','reload obtains new contact hash/cache key','mismatching source hash rejected'],'scope':'Isolated copies of configuration/contact inputs; originals never modified'},indent=2))
print('PASS: five runtime source/contact lock checks')
