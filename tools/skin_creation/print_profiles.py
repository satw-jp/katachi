"""Bounded BBL profile adapter. No user-code or arbitrary profile execution.
Inheritance/include extraction reused from 2026-09-26 MINI_D prepare_pla_profiles.py,
load(kind,name), without its candidate-specific overrides.
"""
import hashlib
import json
from pathlib import Path

ENGINE = Path('J:/Program Files/Bambu Studio/bambu-studio.exe')
PROFILES = ENGINE.parent / 'resources/profiles/BBL'
CONSOLE_COMMIT = '3437d964792ff717c2181cebfb84f8574c95eded'

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
    return h.hexdigest()

def load_profile(kind, name, records, stack=()):
    if name in stack or '/' in name or chr(92) in name:
        raise ValueError('Invalid profile inheritance')
    p=PROFILES/kind/(name+'.json'); j=json.loads(p.read_text(encoding='utf-8')); out={}
    if j.get('inherits'):out.update(load_profile(kind,j['inherits'],records,stack+(name,)))
    for inc in j.get('include',[]):out.update(load_profile(kind,inc,records,stack+(name,)))
    out.update(j);out.pop('inherits',None);out.pop('include',None)
    records[str(p)]=dict(sha256=digest(p), bytes=p.stat().st_size)
    return out

def resolve(choice):
    if set(choice) != {'machine','nozzle','material','support','plate','brim','interface','supportMaterial'}:
        raise ValueError('Unknown/missing print setting')
    if choice['machine'] not in ('A1','A1 mini') or choice['nozzle'] not in ('0.4','0.6') or choice['material'] not in ('PLA','PETG'):
        raise ValueError('Unsupported machine/nozzle/material')
    if choice['interface'] != 'same' or choice['supportMaterial'] != 'same':
        raise ValueError('Different support material assignment not yet proven')
    if choice['support'] not in ('normal(auto)','tree(auto)','none') or choice['plate'] != 'Textured PEI Plate' or choice['brim'] not in ('no_brim','outer_only'):
        raise ValueError('Unsupported support/plate/brim')
    records={str(PROFILES/'cli_config.json'):dict(sha256=digest(PROFILES/'cli_config.json'),bytes=(PROFILES/'cli_config.json').stat().st_size)}; tag='A1M' if choice['machine']=='A1 mini' else 'A1'
    printer=load_profile('machine',f"Bambu Lab {choice['machine']} {choice['nozzle']} nozzle",records)
    processName=f"0.20mm Standard @BBL {tag}" if choice['nozzle']=='0.4' else f"0.30mm Standard @BBL {tag} 0.6 nozzle"
    process=load_profile('process',processName,records)
    filament=load_profile('filament',f"Generic {choice['material']} @BBL {tag}",records)
    if printer['name'] not in process.get('compatible_printers',[]):raise ValueError('Process/printer incompatible')
    if filament.get('compatible_printers') and printer['name'] not in filament['compatible_printers']:raise ValueError('Filament/printer incompatible')
    overrides=dict(enable_support='0' if choice['support']=='none' else '1', support_type='normal(auto)' if choice['support']=='none' else choice['support'],support_filament='0',support_interface_filament='0',curr_bed_type=choice['plate'],brim_type=choice['brim'],enable_prime_tower='0')
    process.update(overrides)
    return dict(choice=choice, profiles=dict(printer=printer,process=process,filament=filament),sources=records,overrides=overrides,engine=dict(path=str(ENGINE),version='02.08.02.61',sha256=digest(ENGINE)),consoleCommit=CONSOLE_COMMIT,
                layerHeight=process['layer_height'],projectFilamentIndex=1,physicalAmsSlot=None)

DEFAULT=dict(machine='A1',nozzle='0.4',material='PLA',support='normal(auto)',plate='Textured PEI Plate',brim='no_brim',interface='same',supportMaterial='same')
