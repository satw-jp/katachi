import {createRequire} from 'node:module';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire('C:/Users/as/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {chromium}=require('playwright');
const out=path.resolve('../../outputs/r1-final');await mkdir(out,{recursive:true});
const base='http://127.0.0.1:5196';const browser=await chromium.launch({channel:'chrome',headless:true});
let context,page;const errors=[];
async function open(){context=await browser.newContext({viewport:{width:1600,height:1100},acceptDownloads:true});page=await context.newPage();page.setDefaultTimeout(180000);page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.accept());await page.goto(base+'/skin-rebuild.html?mode=creation');await page.locator('#generate').click({trial:true});}
const state=async()=> (await page.request.get(base+'/creation-api/state')).json();
const printing=async()=> (await page.request.get(base+'/creation-api/print/state')).json();
const binding=s=>JSON.stringify([s.history,s.cursor,s.results,s.compare,s.selected,s.printing]);
const assert=(v,m)=>{if(!v)throw Error(m);};
try{
 await open();await page.locator('#empty-view').waitFor({state:'hidden'});
 const initial=await printing();const attempts=initial.attempts.length;
 await page.locator('#print-material').selectOption('PETG');await page.locator('#print-preset-name').fill('R1 PETG fixture condition');await page.locator('#print-preset-save').click();
 await page.locator('#print-default').click();await page.locator('#print-presets').selectOption('R1 PETG fixture condition');await page.locator('#print-preset-load').click();
 await page.waitForFunction(()=>document.querySelector('#print-material')?.value==='PETG');
 await page.locator('#print-default').click();
 await page.locator('#print-prepare').click();await page.waitForFunction(()=>document.querySelector('#print-recipe')?.textContent?.includes('512MiB'));
 await page.locator('#print-place').click();await page.waitForFunction(()=>document.querySelector('#print-recipe')?.textContent?.includes('配置適用済み'));
 assert(await page.locator('#print-run').isDisabled(),'Oversize input run must be disabled');
 const prepared=await printing();assert(prepared.prepared.sliceBlocker,'Missing input blocker');assert(prepared.attempts.length===attempts,'Unexpected slice');
 await page.locator('#print-run').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'01-artwork-size-hold.png')});
 const before=await state();const event=page.waitForEvent('download');await page.locator('#save-project').click();const saved=path.join(out,'author-workflow-r1.skincreation');await(await event).saveAs(saved);
 const moved=path.resolve('../moved-r1/reopen-renamed.skincreation');await mkdir(path.dirname(moved),{recursive:true});await copyFile(saved,moved);
 await page.locator('#new-project').click();await page.waitForTimeout(1500);await context.close();await open();await page.locator('#open-project').setInputFiles(moved);await page.locator('#empty-view').waitFor({state:'hidden'});
 const after=await state();assert(binding(before)===binding(after),'Portable reopen changed history/recipe/attempts');
 await page.waitForTimeout(2000);assert((await printing()).attempts.length===attempts,'Reopen auto-started slice');
 assert(await page.locator('#print-presets option').allTextContents().then(a=>a.includes('R1 PETG fixture condition')),'Preset selector not restored');
 assert(await page.locator('#print-run').isDisabled(),'Reopen lost oversize guard');
 await page.locator('#print-run').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'02-fresh-reopen.png')});
 assert(errors.length===0,errors.join('\n'));
 await writeFile(path.join(out,'BROWSER_RESULT.json'),JSON.stringify({status:'PASS_BOUNDED_ONLY',artworkSlice:'NOT_ESTABLISHED',before,after,printing:await printing(),errors,changedDirectory:true,freshBrowser:true,noAutomaticRun:true},null,2));console.log('PASS: UI preset, oversize HOLD, save, renamed/fresh reopen, no auto slice; artwork slice remains NOT ESTABLISHED');
}catch(e){await writeFile(path.join(out,'BROWSER_FAILURE.json'),JSON.stringify({error:String(e),errors},null,2));console.error(e);process.exitCode=1;}
finally{await browser.close();}
