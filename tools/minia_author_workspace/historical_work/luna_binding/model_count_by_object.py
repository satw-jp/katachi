import xml.etree.ElementTree as ET,json
p=r'J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs\R4_ROOT_LAUNCH_R5\source\ROOT_AND_LR_ADDITIONS.model'
counts={};cur=None;stack=[]
for ev,e in ET.iterparse(p,events=('start','end')):
 tag=e.tag.rsplit('}',1)[-1]
 if ev=='start':
  stack.append(e)
  if tag=='object':cur=e.get('id');counts[cur]={'vertices':0,'triangles':0,'name':e.get('name')}
  continue
 if cur is not None and tag in ('vertex','triangle'):counts[cur]['vertices' if tag=='vertex' else 'triangles']+=1
 if tag=='object':cur=None
 if len(stack)>1:stack[-2].remove(e)
 stack.pop()
print(json.dumps(counts,indent=2))
