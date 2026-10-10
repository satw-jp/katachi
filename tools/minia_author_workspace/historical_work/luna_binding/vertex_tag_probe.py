import zipfile
p=r'J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_A_F2_PRINT_PREPARATION\A\cli\import_validated\A_A1_EDITABLE.3mf'
with zipfile.ZipFile(p) as z,z.open('3D/Objects/object_1.model') as f:
 b=b''
 while True:
  b+=f.read(1024*1024)
  i=b.find(b'<vertex ')
  if i>=0:print(repr(b[i:i+160]));break
