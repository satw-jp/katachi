"""Complete MINIL dispatcher; partial execution can never emit READY."""
from pathlib import Path
import traceback
import shutil
from .adapter import read,write,require,bind,derive,recipe_gate,build_support,validate_output_destination,sha256_file,CASE_ID
from .dispatch import Stage,dispatch
from .ownership import prove
from .recipe import save_spec
from .removal import evaluate
from ..mesh_backend import ManifoldKernel

READY='MINIL_AUTHORED_SUPPORT_CANDIDATE_READY_FOR_REVIEW'
HOLD='MINIL_AUTHORED_SUPPORT_IMPLEMENTATION_HOLD'

def ready(generated, stages, readback, removal):
    return bool(generated.get('candidate_generated') and generated.get('mesh_count',0)>0
                and generated.get('demands_processed')==generated.get('demands_total')
                and generated.get('all_height_demands_processed')
                and stages and all(s.get('status')=='PASS' for s in stages)
                and readback and len(removal.get('objects',[]))==generated['mesh_count'])

def reconcile_output_metadata(out,plan):
    """Replace V1 inspection-only labels after actual generation and binding."""
    out=Path(out);identity=read(out/'INPUT_IDENTITY.json');ownership=read(out/'OWNERSHIP_BINDING.json')
    identity['repair_binding']=ownership['decision'] if ownership['status']=='PASS' else 'HOLD'
    write(out/'INPUT_IDENTITY.json',identity)
    counts={}
    for row in plan['objects']:
        if row.get('target'):counts[row['target']]=counts.get(row['target'],0)+1
    flowers=read(out/'FLOWER_GEOMETRY.json')
    for row in flowers:
        row['contact_selected']=bool(counts.get(row['id'],0));row['authored_support_contact_count']=counts.get(row['id'],0)
        row['reason']='ACTUAL_GENERATED_CONTACTS' if row['contact_selected'] else 'NO_GENERATED_CONTACT_SEE_UNHANDLED'
    write(out/'FLOWER_GEOMETRY.json',flowers)
    inventory=read(out/'B0_B115_COMPARISON.json')
    inventory['reason']='Only B115 Support generated. B0/B115 geometry inventory is not a comparative support-certification study.'
    inventory['b115_new_support_mesh_count']=plan['mesh_count'];inventory['actual_contacted_flower_count']=sum(row['contact_selected'] for row in flowers)
    write(out/'B0_B115_COMPARISON.json',inventory)

def run_completion(case_path,roots_path,out):
    case_path=Path(case_path); preset=case_path.parent; roots=read(roots_path)['roots']; lock=read(preset/'SOURCE_LOCK.json')
    paths={r['name']:Path(roots[r['root']])/r['path'] for r in lock['files']}
    out=validate_output_destination(out,[*paths.values(),preset,Path(roots['minil']),Path(roots['cycle2'])])
    before={name:sha256_file(path) for name,path in paths.items()}
    for row in lock['files']: require(before[row['name']]==row['sha256'],'SOURCE_HASH_MISMATCH:'+row['name'])
    out.mkdir(parents=True); write(out/'SOURCE_LOCK.json',lock); write(out/'CASE_MINIL.json',read(case_path)); write(out/'ROOTS.local.json',{'roots':roots})
    k=ManifoldKernel.from_runtime_root(Path(roots['geometry_runtime']))
    c={'case':read(case_path),'paths':paths,'out':out,'kernel':k,'np':k.np}; records=[]; error=None; removal={}; readback=False
    try:
        save_spec(c)
        if roots.get('derived_checkpoint'):
            checkpoint=Path(roots['derived_checkpoint']); reuse=read(checkpoint/'CHECKPOINT_LOCK.json')
            require(reuse['task']=='MINIL_AUTHORED_SUPPORT_ADAPTER_COMPLETION','WRONG_CHECKPOINT_TASK')
            require(read(checkpoint/'SOURCE_LOCK.json')==lock and read(checkpoint/'CASE_MINIL.json')==c['case'],'CHECKPOINT_SOURCE_MISMATCH')
            for name,sha in reuse['files'].items(): require(sha256_file(checkpoint/name)==sha,'CHECKPOINT_HASH:'+name)
            require(read(checkpoint/'RECIPE_MINIL_V2.json')==c['recipe'],'CHECKPOINT_RECIPE_MISMATCH')
            c['derived_checkpoint']=str(checkpoint)
            write(out/'DERIVED_CHECKPOINT_REUSE.json',{'path':str(checkpoint),'lock':reuse,'note':'Same-task MINIL geometry derivation only; no completed MINI_A Support consumed.'})
            for name in ['GRID.json','BODY_BIRTHS.json','DEMANDS.json','BODY_LOAD_CORRESPONDENCE.json']:
                shutil.copyfile(checkpoint/name,out/name)
        def ownership(ctx):
            return prove(ctx,Path(roots['restart'])/'work/evidence/selected_A_authority')
        stages=[Stage('SOURCE_BINDING',bind),Stage('OWNERSHIP',ownership,('SOURCE_BINDING',)),
                Stage('GEOMETRY',derive,('SOURCE_BINDING',)),Stage('RECIPE',recipe_gate,('OWNERSHIP',)),
                Stage('GENERATION',build_support,('GEOMETRY','RECIPE'))]
        records=dispatch(CASE_ID,CASE_ID,stages,c)
        require(all(row['status']=='PASS' for row in records),'DISPATCH_INCOMPLETE')
        reconcile_output_metadata(out,c['generated'])
        removal=evaluate(c,c['body'])
        for row in c['generated']['objects']:
            path=out/row['mesh']; require(k.mesh_array_identity(path)==row['mesh_identity'],'READBACK_IDENTITY:'+row['id'])
            mesh=k.load_mesh(path); q=k.man(mesh['vertices'],mesh['faces']); require(q.status()==k.md.Error.NoError and q.volume()>0,'READBACK_INVALID:'+row['id'])
            if row['foot']: require(abs(float(mesh['vertices'][:,2].min()))<=1e-6,'FOOT_NOT_ON_BASE:'+row['id'])
        require(read(out/'RECIPE_MINIL_V2.json')==c['recipe'],'RECIPE_READBACK')
        readback=True
    except (Exception,KeyboardInterrupt) as e:
        error={'error':str(e),'traceback':traceback.format_exc()}; write(out/'ERROR.json',error)
        print(traceback.format_exc(),flush=True)
    after={name:sha256_file(path) for name,path in paths.items()}; unchanged=before==after
    write(out/'SOURCE_BEFORE_AFTER.json',{'before':before,'after':after,'unchanged':unchanged})
    write(out/'STAGES.json',records)
    generated=c.get('generated',{}); stop=READY if unchanged and ready(generated,records,readback,removal) else HOLD
    validation={'stop':stop,'candidate_generated':generated.get('candidate_generated',False),'readback':readback,'source_unchanged':unchanged,
                'original_flower_changes':0,'original_permanent_changes':0,'provisional115_changes':0,
                'new_support_meshes':generated.get('mesh_count',0),'slice':0,'send':0,'print':0,'print_go':False,'error':error}
    write(out/'VALIDATION.json',validation)
    write(out/'RISK_LEDGER.json',{'physical':'NOT_TESTED','real_tool':'UNVERIFIED','actual_toolpath':'NOT_GENERATED',
          'unbraced_shaft_ids':generated.get('unbraced_shaft_ids',[]),'long_branch_upper_brace_pending_ids':generated.get('long_branch_upper_brace_pending_ids',[]),
          'removal_blocked_ids':[x['id'] for x in removal.get('objects',[]) if not x['all_fragments_removed_in_model']],
          'protected_void_corridors':'NOT_CERTIFIED: BODY projection search is not original host SDF corridor certification',
          'physical_strength':'NOT_CERTIFIED','print_go':False})
    write(out/'RESULT.json',validation)
    (out/'RESULT.md').write_text(f'# {stop}\n\nMINIL_B115_PROVISIONAL. New removable Support meshes: {generated.get("mesh_count",0)}.\n\nOriginal Flower / Permanent / 115 branch changes: 0. Slice / Send / Print: 0. print_go=false.\n\nThis is implementation validation, not independent review or physical certification.\n\n'+('Failure: '+error['error'] if error else 'See VALIDATION, UNHANDLED and RISK_LEDGER for known limitations.'),encoding='utf-8')
    print(stop,flush=True)
    return 0 if stop==READY else 2
