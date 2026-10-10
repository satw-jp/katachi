import zipfile
p=r'J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_A_F2_PRINT_PREPARATION\A\cli\import_validated\A_A1_EDITABLE.3mf'
with zipfile.ZipFile(p) as z:
 for x in z.infolist():
  if x.filename.endswith('object_1.model'): print(x.file_size,x.compress_size,x.compress_type)
