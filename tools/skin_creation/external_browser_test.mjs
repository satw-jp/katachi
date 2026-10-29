import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {writeFile,readFile,mkdir,copyFile} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
const require=createRequire('C:/Users/as/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {chromium}=require('playwright');
const out=process.env.SKIN_EVIDENCE || 'J:/My Drive/codex/2026-10-29/files-mentioned-by-the-user-skin/outputs';
const repo=process.env.SKIN_REPO || process.cwd();const git=process.env.SKIN_GIT || 'git.exe';
const head=execFileSync(git,['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const dirty=execFileSync(git,['-C',repo,'status','--porcelain'],{encoding:'utf8'}).trim();
const browser=await chromium.launch({channel:'chrome',headless:true});
const cdp=await browser.newBrowserCDPSession();
const pidfile=out+'/browser-pids.json',stop=out+'/browser-monitor-stop-'+Date.now(),memory=out+'/browser-memory.json';
await writeFile(pidfile,JSON.stringify((await cdp.send('SystemInfo.getProcessInfo')).processInfo.map(p=>p.id)));
const monitor=spawn('C:/Users/as/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',['-X','utf8',fileURLToPath(new URL('./browser_memory.py',import.meta.url)),pidfile,memory,stop],{windowsHide:true});
const errors=[],steps=[];let context,page,base='http://127.0.0.1:5216';
async function openContext(){context=await browser.newContext({viewport:{width:1600,height:1100},acceptDownloads:true});page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.accept());}
async function state(){return (await page.request.get(base+'/creation-api/state')).json();}
const current=s=>s.results[s.history[s.cursor]];
function assert(x,m){if(!x)throw new Error(m);}
async function record(name,start=performance.now()){await writeFile(pidfile,JSON.stringify((await cdp.send('SystemInfo.getProcessInfo')).processInfo.map(p=>p.id)));steps.push({name,elapsedMs:performance.now()-start,state:await state()});console.log('PASS',name);}
async function done(){await page.waitForFunction(()=>document.querySelector('#cancel-generation').disabled && !document.querySelector('#generate').disabled,{},{timeout:65000});const s=await state();if(s.job?.status==='failed')throw new Error(s.job.error);await page.locator('#empty-view').waitFor({state:'hidden',timeout:30000});await page.waitForFunction(count=>document.querySelector('#view-labels').textContent.includes(count.toLocaleString()+' 花'),current(s).flowerCount);return current(s);}
async function generate(name,force=false){const t=performance.now();await page.locator(force?'#regenerate':'#generate').click();const r=await done();await record(name,t);return r;}
async function fill(id,value){await page.locator('#'+id).fill(String(value));await page.locator('#'+id).press('Tab');}
try{
 await openContext();const start=performance.now();await page.goto(base+'/skin-rebuild.html?mode=creation');await page.locator('#generate:not([disabled])').waitFor();if((await state()).history.length){await page.locator('#new-project').click();await page.waitForFunction(()=>document.querySelector('#generated-status').textContent==='未生成');}await record('initial-ui-ready',start);
 await page.locator('#source-mode').selectOption('external');await page.locator('#host-file').setInputFiles(out+'/independent-octahedron.stl');await page.waitForFunction(()=>document.querySelector('#host-info').textContent.includes('SHA256'));
 assert(await page.locator('#generate').isDisabled(),'mm must be confirmed');await page.locator('#confirm-mm').check();await fill('external-flower-scale',1);await fill('density',1);await fill('seed',20261029);await fill('host-scale',1.2);await page.locator('#host-axis').selectOption('y');
 const t=await generate('host-scale-and-orientation');assert(t.recipe.hostScale===1.2&&t.recipe.upAxis==='y','explicit transform');
 await fill('host-scale',1);await page.locator('#host-axis').selectOption('z');const a=await generate('baseline-22');assert(a.flowerCount===22,'baseline count');
 await fill('external-flower-scale',.8);const b=await generate('size-34');assert(b.flowerCount===34&&a.surfaceHash!==b.surfaceHash,'real size changes');
 await fill('external-flower-scale',1);await fill('density',1.8);const c=await generate('density-39');assert(c.flowerCount===39&&a.surfaceHash!==c.surfaceHash,'density changes');
 let tick=performance.now();await page.locator(`[data-result-id="${a.id}"] button`).first().click();await page.locator('#view-labels.split').waitFor();await record('compare',tick);
 await page.locator(`[data-result-id="${b.id}"] button`).nth(1).click();await page.waitForFunction(id=>document.querySelector('#selection-status').textContent.includes(id),b.id);assert((await state()).selected===b.id,'adopt explicit candidate');
 tick=performance.now();await page.locator('#undo').click();await page.waitForFunction(id=>document.querySelector('#generated-status').textContent.includes(id),b.id);await done();await record('undo',tick);
 tick=performance.now();await page.locator('#redo').click();await page.waitForFunction(id=>document.querySelector('#generated-status').textContent.includes(id),c.id);await done();await record('redo',tick);await page.locator('#undo').click();await page.waitForFunction(id=>document.querySelector('#generated-status').textContent.includes(id),b.id);await done();
 const before=await state();tick=performance.now();await page.locator('#show-host').uncheck();await page.locator('#fit-view').click();const canvas=page.locator('#viewport canvas');const box=await canvas.boundingBox();await page.mouse.move(box.x+box.width*.4,box.y+box.height*.4);await page.mouse.down();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.45,{steps:8});await page.mouse.up();await page.locator('#show-host').check();
 assert(JSON.stringify(before)===JSON.stringify(await state()),'display changed state/hashes');await record('camera-and-host-proxy-invariant',tick);
 await page.screenshot({path:out+'/comparison.png',fullPage:true});
 tick=performance.now();const [download]=await Promise.all([page.waitForEvent('download',{timeout:65000}),page.locator('#save-project').click()]);await download.saveAs(out+'/author-loop.skincreation');await record('save-redo-tail',tick);
 await mkdir(out+'/moved',{recursive:true});await copyFile(out+'/author-loop.skincreation',out+'/moved/author-loop.skincreation');
 await context.close();base='http://127.0.0.1:5226';await openContext();await page.goto(base+'/skin-rebuild.html?mode=creation');await page.locator('#generate:not([disabled])').waitFor();
 tick=performance.now();await page.locator('#open-project').setInputFiles(out+'/moved/author-loop.skincreation');await page.waitForFunction(id=>document.querySelector('#generated-status').textContent.includes(id),b.id,{timeout:65000});await done();let restored=await state();
 for(const k of ['history','cursor','compare','selected','results'])assert(JSON.stringify(restored[k])===JSON.stringify(before[k]),'restore mismatch '+k);
 await record('moved-fresh-session-restore',tick);const again=await generate('forced-actual-regeneration',true);assert(again.id!==b.id&&again.surfaceHash===b.surfaceHash,'forced regeneration semantic hash');
 const protectedState=await state();await writeFile(out+'/corrupt.skincreation',Buffer.from('invalid zip'));await page.locator('#open-project').setInputFiles(out+'/corrupt.skincreation');await page.locator('#error').waitFor({state:'visible'});assert((await state()).selected===b.id&&current(await state()).id===again.id,'corrupt archive replaced result');await record('corrupt-archive-preserved');
 await page.locator('#host-file').setInputFiles({name:'open-shell.stl',mimeType:'application/octet-stream',buffer:Buffer.from('solid bad\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid bad\n')});await page.waitForFunction(()=>document.querySelector('#error').textContent.includes('Open or non-manifold'));
 assert(current(await state()).id===again.id,'invalid host replaced result');await record('invalid-stl-preserved');
 await fill('external-flower-scale',.01);await page.locator('#generate').click();await page.waitForFunction(()=>document.querySelector('#progress').textContent.includes('budget'),{},{timeout:65000});assert(current(await state()).id===again.id&&(await state()).selected===b.id,'budget failure replaced result');await record('budget-preserved');
 await fill('external-flower-scale',.8);await page.locator('#generate').click();await page.locator('#cancel-generation:not([disabled])').waitFor();const cancelled=(await state()).job.id;await page.locator('#cancel-generation').click();await page.locator('#generate:not([disabled])').waitFor();await fill('seed',20261030);const newer=await generate('new-request-after-cancel');await page.waitForTimeout(500);const final=await state();assert(!final.results[cancelled]&&final.selected===b.id&&current(final).id===newer.id,'stale cancellation response');await record('cancel-stale-preserved');
 await page.screenshot({path:out+'/restored-regenerated.png',fullPage:true});assert(errors.length===0,'browser errors');
 await writeFile(out+'/browser-acceptance.json',JSON.stringify({status:'PASS',head,dirty,steps,errors,baseline:a,size:b,density:c,regenerated:again,cancelledJob:cancelled},null,2));
}catch(e){await page?.screenshot({path:out+'/browser-failure.png',fullPage:true});await writeFile(out+'/browser-failure.json',JSON.stringify({head,dirty,steps,errors,error:String(e)},null,2));throw e;}
finally{await writeFile(stop,'stop');await new Promise(resolve=>monitor.on('exit',resolve));await browser.close();}
