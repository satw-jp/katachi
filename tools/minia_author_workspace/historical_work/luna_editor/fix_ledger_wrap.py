from pathlib import Path
p=Path('work/luna_editor/build_editor_v3.py');s=p.read_text()
old="wrapped='\\\\n'.join(encoded[i:i+100] for i in range(0,len(encoded),100))"
new="wrapped='\\n'.join(encoded[i:i+100] for i in range(0,len(encoded),100))"
assert old in s,repr(s[s.index('wrapped='):s.index('wrapped=')+100])
s=s.replace(old,new)
s=s.replace("epath.write_text(wrapped,encoding='ascii');print('phase: loading ledger Text from file'", "epath.write_text(wrapped,encoding='ascii');assert zlib.decompress(base64.b64decode(''.join(wrapped.split())))==ledger_bytes;print('phase: loading ledger Text from file'")
p.write_text(s)
print(repr(s[s.index('wrapped='):s.index('wrapped=')+110]))
