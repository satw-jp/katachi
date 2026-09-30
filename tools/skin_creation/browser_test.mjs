// Independent test browser, never attaches to an Author browser/profile.
import { createRequire } from 'node:module';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(process.env.SKIN_PLAYWRIGHT_ROOT + '/package.json');
const { chromium } = require('playwright');
const evidence = path.resolve('docs/evidence/skin-creation-ui-v0');
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => { errors.push(String(e)); console.log('PAGEERROR', String(e)); });
page.on('dialog', dialog => dialog.accept());
const base = 'http://127.0.0.1:5188';
const reports = [];
async function state() { return (await page.request.get(base + '/creation-api/state')).json(); }
async function waitDone(label) {
  const start = Date.now();
  for (;;) {
    const s = await state();
    if (s.job?.status === 'failed') throw new Error(s.job.error);
    if (!s.job) {
      const r = s.results[s.history[s.cursor]];
      if (!r) throw new Error('No result after generation');
      console.log('COMPLETE', label, JSON.stringify(r));
      await page.locator('#empty-view').waitFor({ state: 'hidden', timeout: 180000 });
      await page.screenshot({ path: path.join(evidence, label + '.png'), fullPage: true, timeout: 180000 });
      reports.push({ label, result: r, elapsedMs: Date.now() - start });
      await writeFile(path.join(evidence, 'browser-progress.json'), JSON.stringify({ reports, errors }, null, 2));
      return r;
    }
    console.log('PROGRESS', label, s.job.stage);
    if (Date.now() - start > 1800000) throw new Error('Generation exceeded 30 minutes');
    await page.waitForTimeout(10000);
  }
}
try {
  await page.goto(base + '/skin-rebuild.html?mode=creation');
  await page.locator('#generate').waitFor({ state: 'visible' });
  await page.locator('#generate').click();
  const a = await waitDone('01-g1-d2p2');
  await page.locator('#branch-diameter').selectOption('2.4');
  await page.locator('#generate').click();
  const b = await waitDone('02-g1-d2p4');
  if (a.surfaceHash !== b.surfaceHash || a.centerlineHash !== b.centerlineHash || a.meshHash === b.meshHash) throw new Error('Diameter invariants failed');
  await page.locator(`[data-result-id="${a.id}"] button`).click();
  await page.locator('#view-labels.split').waitFor();
  await page.screenshot({ path: path.join(evidence,'03-diameter-comparison.png'),fullPage:true });
  await page.locator('#undo').click();
  await page.waitForTimeout(1500);
  if ((await state()).history[(await state()).cursor] !== a.id) throw new Error('Undo failed');
  await page.locator('#redo').click();
  await page.waitForTimeout(1500);
  if ((await state()).history[(await state()).cursor] !== b.id) throw new Error('Redo failed');
  await page.locator('#clear-compare').click();
  await page.locator('#flower-scale').selectOption('0.7333333333333333');
  await page.locator('#branch-diameter').selectOption('2.2');
  await page.locator('#generate').click();
  const c = await waitDone('04-g11over15-d2p2');
  await page.locator('#branch-diameter').selectOption('2.4');
  await page.locator('#generate').click();
  const d = await waitDone('05-g11over15-d2p4');
  if (c.surfaceHash !== d.surfaceHash || c.centerlineHash !== d.centerlineHash || c.meshHash === d.meshHash) throw new Error('Small-flower diameter invariants failed');
  await page.locator(`[data-result-id="${b.id}"] button`).click();
  await page.locator('#view-labels.split').waitFor();
  await page.locator('#select-design').click();
  await page.screenshot({ path:path.join(evidence,'06-flower-comparison.png'),fullPage:true });
  // Save after Undo: un-applied Redo tail must survive fresh reopen.
  await page.locator('#undo').click();
  await page.waitForTimeout(1500);
  const beforeSave = await state();
  const downloadEvent = page.waitForEvent('download', { timeout:180000 });
  await page.locator('#save-project').click();
  const download = await downloadEvent;
  const saved = path.join(evidence,'four-conditions.skincreation');
  await download.saveAs(saved);
  const movedDir = path.resolve('outputs/creation-portability-moved');
  await mkdir(movedDir,{recursive:true});
  const moved = path.join(movedDir,'portable.skincreation');
  await copyFile(saved,moved);
  await page.locator('#new-project').click();
  await page.waitForTimeout(1500);
  await context.close();
  const fresh = await browser.newContext({viewport:{width:1600,height:1100},acceptDownloads:true});
  const freshPage = await fresh.newPage();
  freshPage.on('pageerror',e=>errors.push(String(e)));
  await freshPage.goto(base+'/skin-rebuild.html?mode=creation');
  await freshPage.locator('#open-project').setInputFiles(moved);
  await freshPage.locator('#empty-view').waitFor({state:'hidden',timeout:180000});
  const restored = await (await freshPage.request.get(base+'/creation-api/state')).json();
  if (JSON.stringify([restored.history,restored.cursor,restored.compare,restored.selected,restored.results]) !== JSON.stringify([beforeSave.history,beforeSave.cursor,beforeSave.compare,beforeSave.selected,beforeSave.results])) throw new Error('Fresh restore mismatch');
  await freshPage.locator('#redo').click();
  await freshPage.waitForTimeout(1500);
  await freshPage.locator('#clear-compare').click();
  await freshPage.locator('#regenerate').click();
  const start = Date.now();
  let regenerated;
  for (;;) {
    const s = await (await freshPage.request.get(base+'/creation-api/state')).json();
    if (s.job?.status==='failed') throw new Error(s.job.error);
    if (!s.job) { regenerated=s.results[s.history[s.cursor]]; break; }
    console.log('FRESH REGEN',s.job.stage);
    if (Date.now()-start>1800000) throw new Error('Fresh regeneration timeout');
    await freshPage.waitForTimeout(10000);
  }
  if (regenerated.surfaceHash!==d.surfaceHash || regenerated.centerlineHash!==d.centerlineHash || regenerated.meshHash!==d.meshHash) throw new Error('Fresh regeneration mismatch');
  await freshPage.locator('#empty-view').waitFor({state:'hidden',timeout:180000});
  await freshPage.screenshot({path:path.join(evidence,'07-fresh-reopen-regenerated.png'),fullPage:true});
  await writeFile(path.join(evidence,'browser-result.json'),JSON.stringify({status:'PASS',reports,beforeSave,restored,regenerated,errors},null,2));
  if(errors.length) throw new Error('Browser errors: '+errors.join('\n'));
} catch(error) {
  console.error(error);
  await writeFile(path.join(evidence,'browser-failure.json'),JSON.stringify({error:String(error),reports,errors},null,2));
  process.exitCode=1;
} finally { await browser.close(); }
