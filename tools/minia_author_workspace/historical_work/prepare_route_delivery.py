import pathlib,json,zipfile,hashlib,shutil
R=pathlib.Path(__file__).resolve().parent.parent
O=R/'outputs';runtime=O/'route_runtime';runtime.mkdir(exist_ok=True)
vendor=pathlib.Path(r'J:\My Drive\codex\2026-09-05\files-mentioned-by-the-user-samples\work\r2\vendor')
archive=runtime/'networkx-3.6.1.zip'
if not archive.exists():
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
        for p in sorted((vendor/'networkx').rglob('*')):
            if p.is_file() and '__pycache__' not in p.parts and 'tests' not in p.parts and p.suffix!='.pyc':
                z.write(p,p.relative_to(vendor).as_posix())
        for p in sorted((vendor/'networkx-3.6.1.dist-info').rglob('*')):
            if p.is_file() and ('LICENSE' in p.name or p.name=='METADATA'):
                z.write(p,p.relative_to(vendor).as_posix())
for name in ['real_graph.py','route_analysis.py']:
    shutil.copy2(R/'work/route_visualizer'/name,runtime/name)
manifest={'purpose':'Local Blender route runtime; original source JSON paths remain hash-locked in SOURCE_BINDING/TRANSFORM_AND_REFERENCE_LOCKS.',
          'networkx_version':'3.6.1','networkx_license':'BSD-3-Clause, license included inside dependency ZIP',
          'files':{p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in runtime.iterdir() if p.is_file()}}
(O/'ROUTE_RUNTIME_MANIFEST.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps(manifest,indent=2))
