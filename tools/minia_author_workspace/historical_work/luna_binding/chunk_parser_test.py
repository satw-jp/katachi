import re
vrx=re.compile(rb'<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"');trx=re.compile(rb'<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"')
def scan(raw,size):
 vc=tc=0;phase=True;carry=b''
 for off in range(0,len(raw),size):
  data=carry+raw[off:off+size];pos=0
  if phase:
   t=data.find(b'<triangle ');limit=t if t>=0 else len(data);partial=False
   while True:
    i=data.find(b'<vertex ',pos,limit)
    if i<0:break
    end=data.find(b'/>',i);nexttag=data.find(b'<',i+1)
    if end<0 or (nexttag>=0 and nexttag<end):carry=data[i:];partial=True;break
    assert vrx.match(data[i:end+2]);vc+=1;pos=end+2
   if partial:continue
   if t>=0:phase=False;carry=data[t:]
   else:carry=data[-16:]
  else:
   partial=False
   while True:
    i=data.find(b'<triangle ',pos)
    if i<0:break
    end=data.find(b'/>',i);nexttag=data.find(b'<',i+1)
    if end<0 or (nexttag>=0 and nexttag<end):carry=data[i:];partial=True;break
    assert trx.match(data[i:end+2]);tc+=1;pos=end+2
   if not partial:carry=data[-16:]
 return vc,tc
raw=b'<model><vertices>'+b''.join(f'<vertex x="{i}" y="1" z="2"/>'.encode() for i in range(131))+b'</vertices><triangles>'+b''.join(f'<triangle v1="{i}" v2="{i+1}" v3="{i+2}"/>'.encode() for i in range(97))+b'</triangles></model>'
results={str(n):scan(raw,n) for n in [1,7,16,31,64,113,512]}
assert all(v==(131,97) for v in results.values()),results
print(results)
