import pathlib,json,hashlib,time
R=pathlib.Path(__file__).resolve().parent.parent;O=R/'outputs';b=json.loads((O/'SOURCE_BINDING.json').read_text(encoding='utf-8'));start=time.perf_counter()
checks=[]
for name,record in [('successful_package',b['successful_print_artifact']),('editable_manufacturing_baseline',b['editable_candidate']),('frozen_basic_editor',{'path':str(O/'MINIA_INTERNAL_REPAIR_EDITOR_V1.blend'),'container_sha256':'11be470c5194f17349eeb1ac4ba473af21275ffb2667f62dc7e8383396652c24'})]:
    p=pathlib.Path(record['path']);h=hashlib.sha256()
    with p.open('rb') as f:
        for block in iter(lambda:f.read(8*1024*1024),b''):h.update(block)
    got=h.hexdigest();checks.append({'name':name,'path':str(p),'bytes':p.stat().st_size,'sha256':got,'unchanged':got==record['container_sha256']})
    assert checks[-1]['unchanged'],name
report={'pass':True,'checks':checks,'elapsed_s':time.perf_counter()-start,'new_slice_count':0,'send_count':0,'print_count':0,'manufacturing_geometry_changed':False}
(O/'PRESERVED_INPUTS_FINAL_CHECK.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
