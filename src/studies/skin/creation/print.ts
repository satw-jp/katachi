import { request, type ProjectState } from './api.ts';

type Choice = Record<string,string>;
interface Prepared { key:string; snapshotId:string; snapshotHash:string; sourceBounds:{min:number[];max:number[]}; proposedTranslation:number[]; translation:number[]|null; placementAccepted:boolean; plateSize:number; resolved:{layerHeight:string;profiles:{process:{name:string};printer:{name:string};filament:{name:string}}} }
interface Attempt { id:string;snapshotId:string;status:string;error?:string;stale:boolean;available:boolean;artifacts:Record<string,{sha256:string;bytes:number}>;summary?:{layers:number;bytes:number} }
interface PrintState {choice:Choice;prepared:Prepared|null;presets:Record<string,Choice>;attempts:Attempt[];active?:{status:string;stage:string;progress?:{percent:number;actual:boolean}};limitations:string[]}
export function createPrintUI() {
 const panel=document.createElement('section');panel.id='print-preparation';
 panel.innerHTML=`<p class="eyebrow">04 / PRINT PREPARATION · R1</p><h2>印刷準備</h2>
 <p id="print-target">造形を明示選択してください</p><img id="print-thumbnail" alt="明示選択した制作snapshot" hidden style="width:100%;max-height:180px;object-fit:contain" />
 <div class="fields"><label>機種<select id="print-machine"><option>A1</option><option>A1 mini</option></select></label><label>ノズル mm<select id="print-nozzle"><option>0.4</option><option>0.6</option></select></label>
 <label>作品材料<select id="print-material"><option>PLA</option><option>PETG</option></select></label><label>plate<select id="print-plate"><option>Textured PEI Plate</option></select></label>
 <label>Support本体<select id="print-supportMaterial"><option value="same">作品と同じ材料</option><option disabled>別材料 — 割当未検証</option></select></label><label>接触面の材料<select id="print-interface"><option value="same">作品と同じ材料</option><option disabled>別材料 — 割当未検証</option></select></label>
 <label>Support方式<select id="print-support"><option value="normal(auto)">Bambu normal(auto)</option><option disabled>tree / authored — 未検証</option></select></label><label>接地条件<select id="print-brim"><option value="no_brim">brimなし・一体平行移動</option></select></label></div>
 <p class="note">実証経路：A1 0.4 PLA/PETG、A1 mini 0.4 PLA、A1 0.6 PLA。品質は各機種のStandard、層高0.2 / 0.3 mm。別材料Support、任意品質・層高は未対応。</p>
 <label>preset名<input id="print-preset-name" value="My print recipe" maxlength="80" /></label><select id="print-presets" aria-label="保存preset"></select><button id="print-preset-save">preset保存</button><button id="print-preset-load">preset読込</button><button id="print-default">既定に戻す</button>
 <p id="print-diff" class="note"></p><button id="print-prepare">選択snapshotと条件を確認</button>
 <p id="print-recipe" class="note"></p><div id="print-bed"></div><button id="print-place" disabled>表示した平行移動を適用</button>
 <button id="print-run" class="primary" disabled>Support / slice を実行</button><button id="print-cancel" disabled>今回の実行をCancel</button>
 <output id="print-progress" aria-live="polite"></output><p id="print-error" role="alert" hidden></p><div id="print-attempts"></div>
 <label class="file-label">移動した成果物bundleを再bind<input id="print-rebind" type="file" accept=".skinprint,.zip" /></label>
 <p class="note">保存 .skincreation は造形・recipe・結果参照を保存。大容量成果物は下のbundleを隣接保存してください。再読込だけではsliceしません。Supportはtoolpathのみ。Print GO: false。</p>`;
 document.querySelector('aside')!.append(panel);
 const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
 const keys=['machine','nozzle','material','plate','supportMaterial','interface','support','brim'];
 let value:PrintState|null=null;let project:ProjectState|null=null;let busy=false;let dirty=false;let imageId='';
 const choice=():Choice=>Object.fromEntries(keys.map(k=>[k,el<HTMLSelectElement>('print-'+k).value]));
 function fill(c:Choice){for(const k of keys)el<HTMLSelectElement>('print-'+k).value=c[k];dirty=false;}
 function error(e:unknown){el('print-error').textContent=String(e);el('print-error').hidden=false;}
 function paint(){
  const selected=project?.selected?project.results[project.selected]:null;
  el('print-target').textContent=selected?`対象 ${selected.id} · 花 ${selected.flowerCount} · 枝 ${selected.recipe.diameter} mm · ${selected.meshHash.slice(0,12)}`:'先に「この造形で進める」で対象を選択してください';
  el<HTMLImageElement>('print-thumbnail').hidden=imageId!==selected?.id;
  const p=value?.prepared;const active=value?.active?.status==='running';
  el<HTMLButtonElement>('print-prepare').disabled=busy||active||!selected;
  el<HTMLButtonElement>('print-place').disabled=busy||active||!p||dirty||p.snapshotId!==selected?.id;
  el<HTMLButtonElement>('print-run').disabled=busy||active||!p?.placementAccepted||dirty||p.snapshotId!==selected?.id;
  el<HTMLButtonElement>('print-cancel').disabled=!active;
  el('print-diff').textContent=Object.entries(choice()).filter(([k,v])=>value?.choice[k]!==v).map(([k,v])=>`${k}: ${value?.choice[k]} → ${v}`).join(' / ');
  el('print-recipe').textContent=p?`${p.resolved.profiles.printer.name} / ${p.resolved.profiles.filament.name} / ${p.resolved.profiles.process.name} / 層高 ${p.resolved.layerHeight}mm。移動量 XYZ: ${p.proposedTranslation.map(x=>x.toFixed(3)).join(', ')} mm。${p.placementAccepted?'配置適用済み':'配置未適用'}。拡縮・根元延長・Host出力なし。`:'';
  if(p){const lo=p.sourceBounds.min;const hi=p.sourceBounds.max;const t=p.translation||[0,0,0];const scale=220/p.plateSize;el('print-bed').innerHTML=`<svg viewBox="-12 -12 244 244" width="220" aria-label="適用後XY boundsとplate"><rect width="220" height="220" fill="#edf3ef" stroke="#888"/><rect x="${(lo[0]+t[0])*scale}" y="${220-(hi[1]+t[1])*scale}" width="${(hi[0]-lo[0])*scale}" height="${(hi[1]-lo[1])*scale}" fill="#65c9be88" stroke="#28634f"/></svg><p class="note">${p.placementAccepted?'適用後':'制作座標'}boundsの上面図。全partの相対位置を保持。Support/brimの最終範囲はnative結果で再確認。</p>`;}else el('print-bed').replaceChildren();
  el('print-progress').textContent=value?.active?`${value.active.status} · ${value.active.stage}${value.active.progress?` · ${value.active.progress.actual?'実測':'推定'} ${value.active.progress.percent.toFixed(1)}%`:''}`:'';
  const container=el('print-attempts');container.replaceChildren();
  for(const a of value?.attempts||[]){const article=document.createElement('article');article.className='candidate';const text=document.createElement('p');text.textContent=`${a.status} · ${a.id} · ${a.stale?'旧条件の記録':'今回の条件'} · ${a.available?'成果物参照可能':'成果物欠落 / 未完成'}${a.error?' · '+a.error:''}`;article.append(text);
   for(const name of Object.keys(a.artifacts)){const link=document.createElement('a');link.textContent=name;link.href=`/creation-api/print/artifact/${a.id}/${name}`;link.download=name;link.style.display='block';article.append(link);}
   if(Object.keys(a.artifacts).length){const link=document.createElement('a');link.textContent='成果物bundleを保存 .skinprint';link.href=`/creation-api/print/bundle/${a.id}`;link.download=`${a.id}.skinprint`;article.append(link);const note=document.createElement('p');note.textContent='出力完了・要確認。gcode.3mfをBambu Studio Previewで開いて確認。Print/SendはAuthor操作。';article.append(note);}
   container.append(article);
  }
 }
 async function action(path:string,body:unknown={},sync=false){if(busy)return;busy=true;el('print-error').hidden=true;paint();try{value=await request<PrintState>(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(sync)fill(value.choice);const names=Object.keys(value.presets);el<HTMLSelectElement>('print-presets').replaceChildren(...names.map(n=>new Option(n,n)));}catch(e){error(e);}finally{busy=false;paint();}}
 keys.forEach(k=>el('print-'+k).addEventListener('change',()=>{dirty=true;paint();}));
 el('print-prepare').onclick=()=>void action('/print/prepare',{choice:choice()},true);
 el('print-place').onclick=()=>void action('/print/place');
 el('print-run').onclick=()=>void action('/print/run',{key:value?.prepared?.key});
 el('print-cancel').onclick=()=>void action('/print/cancel');
 el('print-preset-save').onclick=()=>void action('/print/preset',{operation:'save',name:el<HTMLInputElement>('print-preset-name').value,choice:choice()});
 el('print-preset-load').onclick=()=>void action('/print/preset',{operation:'load',name:el<HTMLSelectElement>('print-presets').value},true);
 el('print-default').onclick=()=>void action('/print/preset',{operation:'reset'},true);
 el<HTMLInputElement>('print-rebind').onchange=async e=>{const input=e.target as HTMLInputElement;const file=input.files?.[0];if(!file)return;try{value=await request<PrintState>('/print/rebind',{method:'POST',body:file});paint();}catch(e){error(e);}finally{input.value='';}};
 async function poll(){if(busy)return;try{const next=await request<PrintState>('/print/state');if(!value||(!dirty&&JSON.stringify(value.choice)!==JSON.stringify(next.choice)))fill(next.choice);value=next;paint();}catch(e){error(e);}}
 void poll();setInterval(()=>void poll(),1500);
 return {update(next:ProjectState){project=next;paint();},capture(id:string,index=0){const canvas=document.querySelector<HTMLCanvasElement>('#viewport canvas');if(canvas){const copy=document.createElement('canvas');copy.width=320;copy.height=220;copy.getContext('2d')!.drawImage(canvas,index*canvas.width/(project?.compare?2:1),0,canvas.width/(project?.compare?2:1),canvas.height,0,0,320,220);el<HTMLImageElement>('print-thumbnail').src=copy.toDataURL();imageId=id;paint();}}};
}
