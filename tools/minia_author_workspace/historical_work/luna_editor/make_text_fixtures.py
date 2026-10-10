from pathlib import Path
for n in [1,10]:
 p=Path(f'work/luna_editor/text_load_{n}mb.txt');chunk='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'*27
 with p.open('w',encoding='ascii') as f:
  left=n*1024*1024
  while left:
   s=chunk[:min(left,100)];f.write(s+'\n');left-=len(s)
print('fixtures ready')
