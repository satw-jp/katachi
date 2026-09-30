import {createRequire} from 'node:module';
import {mkdir,writeFile,copyFile,readFile} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(process.env.SKIN_PLAYWRIGHT_ROOT+'/package.json');
const {chromium}=require('playwright');
const root=path.resolve('docs/evidence/skin-creation-ui-v0');
const base='http://127.0.0.1:5188';
await mkdir(root,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
let context=await browser.newContext({viewport:{width:1600,height:1100},acceptDownloads:true});
let page=await context.newPage();
const errors=[];
function events(){page.on('dialog',d=>d.accept());page.on('pageerror',e=>errors.push(String(e)));}
events();
const state=async()=> (await page.request.get(base+'/creation-api/state')).json();
const binding=s=>JSON.stringify([s.history,s.cursor,s.results,s.compare,s.selected]);
try {
  await page.goto(base+'/skin-rebuild.html?mode=creation');
  await page.locator('#generate').click({trial:true});
  await page.locator('#empty-view').waitFor({state:'hidden',timeout:180000});
  const initial=await state();
  const combos=new Set(Object.values(initial.results).map(r=>`${r.recipe.flowerScale}/${r.recipe.diameter}`));
  if(combos.size!==4) throw new Error('Missing four real conditions');
  await page.locator('#undo').click();
  await page.waitForTimeout(1500);
  const before=await state();
  if(before.cursor===before.history.length-1) throw new Error('No redo tail');
  const event=page.waitForEvent('download',{timeout:180000});
  await page.locator('#save-project').click();
  const download=await event;
  const saved=path.join(root,'author-project.skincreation');
  await download.saveAs(saved);
  const bytes=await readFile(saved);
  console.log('FINAL SAVED BYTES',bytes.length);
  const moved=path.resolve('outputs/creation-portability-final/renamed-portable.skincreation');
  await mkdir(path.dirname(moved),{recursive:true});
  await copyFile(saved,moved);
  await page.locator('#new-project').click();
  await page.waitForTimeout(1500);
  await context.close();
  context=await browser.newContext({viewport:{width:1600,height:1100},acceptDownloads:true});
  page=await context.newPage();events();
  await page.goto(base+'/skin-rebuild.html?mode=creation');
  await page.locator('#generate').click({trial:true});
  await page.locator('#open-project').setInputFiles(moved);
  await page.locator('#empty-view').waitFor({state:'hidden',timeout:180000});
  const restored=await state();
  if(binding(before)!==binding(restored)) throw new Error('Restore changed history/results/selection');
  console.log('FINAL FRESH RESTORE PASS');
  // Invalid restore via the actual UI must not replace the valid current project.
  const corrupt=path.resolve('outputs/creation-portability-final/corrupt.skincreation');
  await writeFile(corrupt,bytes.subarray(0,Math.floor(bytes.length/2)));
  await page.locator('#open-project').setInputFiles(corrupt);
  await page.locator('#error').waitFor({state:'visible',timeout:180000});
  if(binding(await state())!==binding(restored)) throw new Error('Failed restore changed current project');
  await page.screenshot({path:path.join(root,'08-rejected-restore-current-preserved.png'),fullPage:true});
  await page.locator('#redo').click();
  await page.waitForTimeout(1500);
  const redone=await state();
  const expected=redone.results[redone.history[redone.cursor]];
  if(expected.id!==initial.history[initial.cursor]) throw new Error('Restored redo result mismatch');
  await page.locator('#show-flowers').uncheck();
  await page.locator('#show-host').uncheck();
  await page.waitForTimeout(1500);
  await page.screenshot({path:path.join(root,'09-internal-branches.png'),fullPage:true});
  const box=await page.locator('#viewport').boundingBox();
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);
  await page.mouse.down();await page.mouse.move(box.x+box.width*.62,box.y+box.height*.53,{steps:12});await page.mouse.up();
  await page.locator('#show-flowers').check();
  await page.locator('#fit-view').click();
  await page.locator('#regenerate').click();
  const start=Date.now();
  let regenerated;
  for(;;){
    const s=await state();
    if(s.job?.status==='failed')throw new Error(s.job.error);
    if(!s.job){regenerated=s.results[s.history[s.cursor]];break;}
    console.log('FINAL PORTABLE REGEN',s.job.stage);
    if(Date.now()-start>1800000)throw new Error('Regeneration timeout');
    await page.waitForTimeout(15000);
  }
  for(const key of ['surfaceHash','centerlineHash','meshHash'])if(regenerated[key]!==expected[key])throw new Error('Regeneration mismatch '+key);
  await page.locator('#empty-view').waitFor({state:'hidden',timeout:180000});
  await page.screenshot({path:path.join(root,'10-final-fresh-regenerated.png'),fullPage:true});
  if(errors.length)throw new Error(errors.join('\n'));
  await writeFile(path.join(root,'final-restore-result.json'),JSON.stringify({status:'PASS',bytes:bytes.length,before,restored,redone,regenerated,failedRestorePreserved:true,rotated:true,errors},null,2));
  console.log('FINAL RESTORE REGEN PASS');
}catch(error){console.error(error);await writeFile(path.join(root,'final-restore-failure.json'),JSON.stringify({error:String(error),errors},null,2));process.exitCode=1;}
finally{await browser.close();}
