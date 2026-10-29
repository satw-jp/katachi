"""Creation-to-pinned-Console adapter. No shell, Send, Print or automatic run."""
import copy,hashlib,io,json,os,sys,threading,time,traceback,uuid,zipfile
from pathlib import Path
import numpy as np
from engine import ROOT,read,write,sha
from print_profiles import resolve,DEFAULT,ENGINE,CONSOLE_COMMIT,digest
from print_geometry import bounds,export
sys.path.insert(0,str(ROOT.parent/'slice-console'))
from job import load_job,validate_job
from slice_console import ConsoleRouter
from queue import Empty
from package_gcode import inspect_gcode

MAX_STL_BYTES=512*1024**2  # bounded R1 input expansion budget; no implicit decimation
PROVEN={('A1','0.4','PLA'),('A1 mini','0.4','PLA'),('A1','0.4','PETG'),('A1','0.6','PLA')}

def identity(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()

def new_state():return dict(choice=copy.deepcopy(DEFAULT),presets={},prepared=None,attempts=[])

def validate_saved(value, results):
    if not isinstance(value,dict):raise ValueError('Invalid print state')
    for a in value.get('attempts',[]):
        if a['snapshotId'] not in results or not isinstance(a['id'],str) or len(a['id'])!=32 or any(c not in '0123456789abcdef' for c in a['id']):raise ValueError('Invalid saved attempt reference')
    p=value.get('prepared')
    if p and (p['snapshotId'] not in results or p['snapshotHash']!=results[p['snapshotId']]['meshHash'] or p['key']!=identity({k:v for k,v in p.items() if k!='key'})):
        raise ValueError('Print snapshot/recipe binding mismatch')

class PrintWorkflow:
    def __init__(self,session,output):
        self.session=session;self.output=output.resolve();self.output.mkdir(parents=True,exist_ok=True)
        self.thread=None;self.runner=None;self.cancel_event=threading.Event();self.active=None
    def value(self):
        value=self.session.state.setdefault('printing',new_state())
        for a in value['attempts']:
            if 'recipe' not in a and (value.get('prepared') or {}).get('key')==a['recipeKey']:a['recipe']=copy.deepcopy(value['prepared'])
        return value
    def busy(self):return self.thread is not None and self.thread.is_alive()
    def current_key(self):
        p=self.value().get('prepared');return p['key'] if p else None
    def state(self):
        v=copy.deepcopy(self.value());v['active']=copy.deepcopy(self.active) if self.active and any(a['id']==self.active['id'] for a in v['attempts']) else None
        v['provenCombinations']=[list(x) for x in sorted(PROVEN)]
        v['limitations']=['別材料Support/interface未検証・無効','Physical/chronology/strength未検査','Support meshなし（native toolpathのみ）']
        for a in v['attempts']:
            a['stale']=a['recipeKey']!=self.current_key() or a['snapshotId']!=self.session.state['selected']
            a['available']=bool(a.get('artifacts')) and all((self.output/a['id']/n).is_file() for n in a['artifacts'])
        return v
    def prepare(self,body):
        if self.busy():raise ValueError('Wait for active print preparation')
        result=self.session.state['results'].get(self.session.state['selected'])
        if not result:raise ValueError('この造形で進める、で対象を明示選択してください')
        if result.get('kind')=='external-surface-v1':raise ValueError('External Host: core/branches/Support are not generated; print preparation unsupported')
        choice=body.get('choice',self.value()['choice']); r=resolve(choice)
        sig=identity(dict(profiles=r['profiles'],engine=r['engine']))
        if read(ROOT/'validated_profiles.json').get('|'.join(choice[k] for k in ('machine','nozzle','material'))) != sig:raise ValueError('Profile/engine differs from the tested fixture; unresolved configuration')
        if (choice['machine'],choice['nozzle'],choice['material']) not in PROVEN or choice['support']!='normal(auto)' or choice['brim']!='no_brim':
            raise ValueError('この条件のnative fixtureは未検証です。対応表の組合せを選んでください')
        b=bounds(self.session.project,result);size=np.array(b['max'])-b['min']
        plate=180 if choice['machine']=='A1 mini' else 256
        # Explicit conservative 10mm perimeter allowance, no automatic resize.
        if size[0]>plate-20 or size[1]>plate-20 or size[2]>plate:
            raise ValueError('作品boundsがplateと10mm周囲確認領域を超えます。自動縮小しません')
        t=[plate/2-(b['min'][0]+b['max'][0])/2,plate/2-(b['min'][1]+b['max'][1])/2,-b['min'][2]]
        p=dict(preparationId=uuid.uuid4().hex,snapshotId=result['id'],snapshotHash=result['meshHash'],surfaceHash=result['surfaceHash'],resolved=r,sourceBounds=b,proposedTranslation=t,translation=None,placementAccepted=False,plateSize=plate)
        p['estimatedStlBytes']=84+50*b['triangles']
        p['sliceBlocker']=('STL展開 '+str(p['estimatedStlBytes'])+' bytes がR1の512MiB上限を超えます。共有meshを保つnative入力adapterが未対応です。簡略化・自動修復はしません。' if p['estimatedStlBytes']>MAX_STL_BYTES else None)
        p['key']=identity(p);self.value().update(choice=choice,prepared=p)
        return self.state()
    def place(self):
        p=self.value().get('prepared')
        if not p:raise ValueError('先に対象と条件を確認してください')
        p.pop('key',None);p.update(translation=p['proposedTranslation'],placementAccepted=True);p['key']=identity(p)
        return self.state()
    def preset(self,body):
        name=body.get('name','preset')
        if not isinstance(name,str) or not 1<=len(name)<=80:raise ValueError('Invalid preset name')
        v=self.value()
        if body['operation']=='save':
            selected=body.get('choice',v['choice']);resolve(selected);v['presets'][name]=copy.deepcopy(selected)
        elif body['operation']=='load':v['choice']=copy.deepcopy(v['presets'][name]);v['prepared']=None
        elif body['operation']=='reset':v['choice']=copy.deepcopy(DEFAULT);v['prepared']=None
        else:raise ValueError('Unknown preset operation')
        return self.state()
    def start(self,body):
        if self.busy():raise ValueError('同じ実行を重複起動しません')
        p=copy.deepcopy(self.value().get('prepared'))
        if not p or not p['placementAccepted'] or p['snapshotId']!=self.session.state['selected'] or body.get('key')!=p['key']:raise ValueError('選択・配置・条件を再確認してください')
        if p.get('sliceBlocker') or 84+50*p['sourceBounds']['triangles']>MAX_STL_BYTES:raise ValueError(p.get('sliceBlocker') or 'Input expansion exceeds512MiB budget')
        if identity(resolve(p['resolved']['choice']))!=identity(p['resolved']):raise ValueError('Profile/engine identity changed; re-prepare required')
        # No implicit reuse, nor accidental double-click repetition of this prepared recipe.
        if any(a['recipeKey']==p['key'] for a in self.value()['attempts']):raise ValueError('この確定条件は実行記録があります。記録を確認し再準備してください')
        project=self.session.project;result=copy.deepcopy(self.session.state['results'][p['snapshotId']]);state=self.value()
        key=uuid.uuid4().hex;target=self.output/key;target.mkdir();self.cancel_event.clear()
        record=dict(recipe=p,id=key,snapshotId=result['id'],snapshotHash=result['meshHash'],recipeKey=p['key'],status='PREPARING',artifacts={},printGo=False)
        state['attempts'].append(record);self.active=dict(id=key,stage='実meshを固定中',status='running')
        def run():
            try:
                write(target/'RECIPE_LOCK.json',p)
                geometry=export(project,result,target/'assembly.stl',p['translation'],self.cancel_event);write(target/'GEOMETRY_LOCK.json',geometry)
                for k,v in p['resolved']['profiles'].items():write(target/(k+'.json'),v)
                (target/'data').mkdir();sample=read(ROOT.parent/'slice-console/sample/clean_mesh_box/SLICE_JOB.json')
                sample.update(job_id='SKIN.R1.'+key,candidate='SKIN.tooling.'+result['id'],inputs=['assembly.stl'],profiles={k:k+'.json' for k in p['resolved']['profiles']},input_locks='INPUT_LOCKS.json',data_dir='data',output_dir='runs',mesh=dict(units='mm',expected_bounds_mm=geometry['bounds'],intended_transform=dict(translation_mm=p['translation'],rotation_deg=[0,0,0],scale=[1,1,1])))
                argv=sample['cli']['argv'];i=argv.index('--outputdir');argv[i:i]=['--export-3mf','native.3mf']
                locks={n:digest(target/n) for n in ['assembly.stl','printer.json','process.json','filament.json']};locks.update({name:row['sha256'] for name,row in p['resolved']['sources'].items()});locks[str(ENGINE)]=p['resolved']['engine']['sha256']
                write(target/'INPUT_LOCKS.json',dict(files=locks));write(target/'SLICE_JOB.json',sample)
                if self.cancel_event.is_set():raise ValueError('Cancelled before launch')
                done=threading.Event();terminal={};events=[]
                def callback(kind,data):
                    if kind in ('complete','error'):terminal.update(kind=kind,**data);done.set()
                    if kind in ('started','complete','error'):events.append(dict(kind=kind,data=data))
                    if self.active and self.active['id']==key:self.active['stage']=data.get('phase',kind);self.active['progress']=data if kind=='progress' else self.active.get('progress')
                request=dict(schema_version='0.1',request_id=key,mode='FULL_SLICE',inputs=dict(job_path=str((target/'SLICE_JOB.json').resolve())))
                write(target/'CONSOLE_REQUEST.json',request)
                self.runner=ConsoleRouter();record['status']='RUNNING';console_result={}
                def dispatch():console_result.update(self.runner.run(request))
                dispatch_thread=threading.Thread(target=dispatch,daemon=True);dispatch_thread.start()
                deadline=time.monotonic()+2700
                while dispatch_thread.is_alive() or not self.runner.events.empty():
                    try:kind,data=self.runner.events.get(timeout=.5);callback(kind,data)
                    except Empty:pass
                    if self.cancel_event.is_set() or time.monotonic()>deadline:
                        self.cancel_event.set();self.runner.cancel()
                dispatch_thread.join();write(target/'CONSOLE_RESULT.json',console_result)
                write(target/'EVENTS.json',events)
                if terminal.get('status')!='SUCCESS':raise ValueError('Native execution '+str(terminal.get('status',terminal.get('message')))+'; exit='+str(terminal.get('exit_code')))
                run_dir=Path(terminal['run_dir']);native=run_dir/'native.3mf';gcode=run_dir/'plate_1.gcode';package=run_dir/'plate_1.gcode.3mf'
                review=terminal.get('review_artifact') or {}
                if not review.get('embedded_equals_standalone') or not review.get('review_ready'):raise ValueError('Native context/package identity unverified')
                settings=read(run_dir/'resolved_settings.json');expected=p['resolved']
                if settings['printer_model']!=expected['profiles']['printer']['printer_model'] or settings['nozzle_diameter']!=[p['resolved']['choice']['nozzle']] or settings['filament_type']!=[p['resolved']['choice']['material']] or float(settings['layer_height'])!=float(expected['layerHeight']):raise ValueError('Resolved machine/nozzle/material/layer mismatch')
                info=inspect_gcode(gcode)
                with gcode.open('rb') as f:
                    f.seek(max(0,gcode.stat().st_size-65536));tail=f.read()
                if b'EXECUTABLE_BLOCK_END' not in tail:raise ValueError('G-code terminal marker missing')
                package_request=dict(schema_version='0.1',request_id=key+'.PACKAGE',mode='PACKAGE_ONLY',inputs=dict(gcode_path=str(gcode),context_3mf_path=str(native),output_dir=str(target/'package'),expected_sha256=info['sha256'],expected_bytes=info['bytes'],expected_layers=info['layers']))
                package_result=ConsoleRouter().run(package_request);write(target/'PACKAGE_CONSOLE_RESULT.json',package_result)
                if package_result['status']!='PACKAGE_COMPLETE':raise ValueError('Matching native context package failed: '+str(package_result.get('blocker')))
                package=Path(package_result['package_path']);review=read(Path(package_result['package_result_path']))
                write(target/'OUTPUT_CHECK.json',dict(gcode=info,package=review,resolvedMachine=settings['printer_model'],support=settings.get('support_type'),knownRisks='chronology/physical not tested',printGo=False))
                # Stable relative artifact names; never duplicate huge bytes into history archives.
                import shutil
                for name,path in [('plate_1.gcode',gcode),('plate_1.gcode.3mf',package),('native.3mf',native),('resolved_settings.json',run_dir/'resolved_settings.json'),('RESULT_MANIFEST.json',run_dir/'RESULT_MANIFEST.json')]:
                    shutil.copyfile(path,target/name);record['artifacts'][name]=dict(sha256=digest(target/name),bytes=(target/name).stat().st_size)
                record['status']='OUTPUT_COMPLETE_REVIEW_REQUIRED';record['summary']=info
            except Exception as exc:
                record['status']='CANCELLED' if self.cancel_event.is_set() else 'FAILED';record['error']=str(exc);write(target/'ADAPTER_ERROR.json',dict(error=str(exc),traceback=traceback.format_exc()))
            finally:
                write(target/'ATTEMPT.json',record);self.active=dict(id=key,status=record['status'],stage=record.get('error','完了・PreviewとAuthor確認待ち'))
                # Old completion updates only its original history, never current selection.
                if self.session.project==project:write(project/'session.json',self.session.state)
        self.thread=threading.Thread(target=run,daemon=True);self.thread.start();return self.state()
    def cancel(self):
        self.cancel_event.set()
        if self.runner:self.runner.cancel()
        return self.state()
    def artifact(self,key,name):
        a=next((a for a in self.value()['attempts'] if a['id']==key),None)
        if not a or name not in a.get('artifacts',{}):raise ValueError('Unknown completed artifact')
        p=self.output/key/name
        if not p.is_file() or digest(p)!=a['artifacts'][name]['sha256']:raise ValueError('Artifact missing/changed: rebind exact bundle')
        return p
    def bundle(self,key):
        a=next(a for a in self.value()['attempts'] if a['id']==key)
        buffer=io.BytesIO()
        with zipfile.ZipFile(buffer,'w',zipfile.ZIP_DEFLATED) as z:
            z.writestr('attempt.json',json.dumps(a))
            for name in a['artifacts']:z.write(self.artifact(key,name),name)
        return buffer.getvalue()
    def rebind(self,data):
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            a=json.loads(z.read('attempt.json'));saved=next((x for x in self.value()['attempts'] if x['id']==a['id']),None)
            if saved!=a:raise ValueError('Bundle does not match saved attempt')
            names=list(z.namelist());allowed=set(saved['artifacts'])|{'attempt.json'}
            if len(names)!=len(set(names)) or set(names)!=allowed or sum(i.file_size for i in z.infolist())>2*1024**3:raise ValueError('Invalid artifact bundle inventory')
            temp=self.output/('rebind-'+uuid.uuid4().hex);temp.mkdir()
            for name,lock in saved['artifacts'].items():
                if Path(name).name!=name:raise ValueError('Invalid artifact name')
                p=temp/name
                with z.open(name) as source,p.open('wb') as dest:
                    import shutil;shutil.copyfileobj(source,dest)
                if p.stat().st_size!=lock['bytes'] or digest(p)!=lock['sha256']:raise ValueError('Artifact hash mismatch')
        dest=self.output/a['id'];dest.mkdir(exist_ok=True)
        for name in saved['artifacts']:(temp/name).replace(dest/name)
        return self.state()
