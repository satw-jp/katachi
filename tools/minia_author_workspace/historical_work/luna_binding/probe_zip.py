import zipfile, json
for p in [r'J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_A_F2_PRINT_PREPARATION\A\cli\import_validated\A_A1_EDITABLE.3mf',r'J:\My Drive\codex\2026-09-22\skin-fukei-slice-runner-execution-3\outputs\MINIA_PLA_EDITABLE_REPACKED.3mf']:
 z=zipfile.ZipFile(p)
 print('\n',p)
 print([(x.filename,x.file_size) for x in z.infolist() if x.filename.endswith('.model')])
 print(z.read('3D/3dmodel.model')[:3000].decode('utf8','replace'))
