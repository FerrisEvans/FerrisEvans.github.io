// Run only after other GPU work finishes:
// BASE_URL=http://127.0.0.1:4331 node scripts/room/inspection-smoke.mjs
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';

const base=process.env.BASE_URL??'http://127.0.0.1:4331';
const output=process.env.SMOKE_SCREENSHOT_DIR??'.room-build/interaction-round5/inspection-regression';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||undefined});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1,reducedMotion:'no-preference'});
const errors=[],checks=[];page.on('pageerror',error=>errors.push(String(error)));
const lateVisualRequests=[];let entered=false;
page.on('request',request=>{if(entered&&/\/room\/(?:materials\/|study[^/]*\.glb)/.test(new URL(request.url()).pathname))lateVisualRequests.push(request.url());});
async function settle(inspection=''){
  await page.waitForFunction(expected=>{const d=document.querySelector('#room').dataset;return d.state==='active'&&d.cameraMoving==='false'&&d.propMoving==='false'&&(d.inspection??'')===expected;},inspection,{timeout:15000});
}
async function navigate(view){
  await page.locator(`[data-room-view="${view}"]`).click();await settle();
  // ONLINE retains its existing modem sequence before enabling links.
  if(view==='online')await page.waitForFunction(()=>!document.querySelector('.surface-online').hidden);
}
async function action(id){
  await page.locator('#object-menu summary').focus();
  if(!await page.locator('#object-menu').evaluate(element=>element.open))await page.locator('#object-menu summary').click();
  await page.locator(`[data-room-action="${id}"]`).click();
}
const hidden=selector=>page.locator(selector).evaluate(element=>element.hidden);
const data=()=>page.locator('#room').evaluate(element=>({...element.dataset}));
async function record(name){checks.push({name,data:await data(),hash:new URL(page.url()).hash,status:await page.locator('#status').textContent()});await page.screenshot({path:join(output,name+'.png')});}
try{
  await page.goto(new URL('/room/?debug=1#home',base).href);
  await page.waitForFunction(()=>document.querySelector('#room')?.dataset.state==='ready',null,{timeout:180000});
  assert.equal((await data()).interactionsReady,'true');assert.equal((await data()).lightingDetails,'full');
  entered=true;
  await page.locator('#enter-room').click();await settle();

  await page.keyboard.press('l');assert.equal((await data()).lamp,'off');assert.equal((await data()).lampLoading,undefined);
  await page.keyboard.press('l');assert.equal((await data()).lamp,'on');await settle();
  await page.mouse.move(80,690);assert.notEqual((await data()).hover,'plant','pot ceramic must not trigger leaf motion');
  const beforePot=await page.locator('#status').textContent();await page.mouse.click(80,690);
  assert.equal(await page.locator('#status').textContent(),beforePot);
  await page.mouse.move(130,510);assert.equal((await data()).hover,'plant','the visible leaf is the touch target');
  await page.mouse.click(130,510);assert.match(await page.locator('#status').textContent(),/轻触叶片/);
  await record('entry-ready-and-leaf-target');

  await action('pager');await page.waitForFunction(()=>document.querySelector('#room').dataset.view==='online');await settle();
  await page.waitForFunction(()=>!document.querySelector('.surface-online').hidden);
  await navigate('home');await action('clock');await settle('clock');await page.keyboard.press('Escape');await settle();
  await page.keyboard.press('c');await settle();
  assert.equal((await data()).view,'online');assert.equal((await data()).computerScreen,'online');
  assert.equal(await hidden('.surface-online'),false);await record('computer-resumes-pager');
  await navigate('home');await action('floppy');await page.waitForFunction(()=>document.querySelector('#room').dataset.view==='about');await settle();
  await page.keyboard.press('PageDown');await page.keyboard.press('PageDown');await page.keyboard.press('ArrowDown');
  const savedPage=(await data()).computerPage,savedText=await page.locator('.surface-about p.sr-only').textContent();
  assert(savedPage.startsWith('3/'));
  await navigate('home');await action('phone');await settle('phone');await page.keyboard.press('Escape');await settle();
  await action('computer');await settle();
  assert.equal((await data()).view,'about');assert.equal((await data()).computerPage,savedPage);
  assert.equal(await page.locator('.surface-about p.sr-only').textContent(),savedText);await record('computer-resumes-about-page');
  await page.keyboard.press('q');assert.equal((await data()).computerScreen,'terminal');
  await navigate('home');await page.keyboard.press('c');await settle();assert.equal((await data()).computerScreen,'terminal');
  await page.mouse.move(300,350);assert.equal((await data()).hover,'computer','monitor shell has its own resume action');
  await page.mouse.click(300,350);await settle();assert.equal((await data()).computerScreen,'terminal');
  await navigate('home');await page.goBack();await settle();
  assert.equal((await data()).view,'about');assert.equal((await data()).computerScreen,'terminal','browser Back also resumes the existing computer screen');
  await action('floppy');await page.waitForFunction(()=>document.querySelector('#room').dataset.computerScreen==='about');await settle();
  assert.equal((await data()).computerPage,savedPage);await record('floppy-opens-about-from-terminal');
  assert.doesNotMatch(await page.locator('#room').textContent(),/近看|近景/);

  await navigate('work');const workCamera=(await data()).cameraPosition;
  assert.equal((await data()).paper,'up');
  await action('calculator');await settle('calculator');
  assert.equal(await hidden('.surface-work'),true,'calculator must hide document hit areas');
  assert.equal(await hidden('.calculator-controls'),false);
  await page.keyboard.press('n');await settle();
  assert.equal((await data()).view,'work');assert.equal((await data()).paper,'up');
  assert.equal((await data()).cameraPosition,workCamera,'N leaves inspection and restores the normal raised WORK view');
  assert.equal(await hidden('.calculator-controls'),true);assert.equal(await hidden('.surface-work'),false);
  await page.keyboard.press('Escape');await settle();assert.equal((await data()).paper,'down');
  await record('calculator-n-work');

  await page.keyboard.press('n');await settle();
  await page.keyboard.press('z');await settle('tv');
  assert.equal(await page.locator('.tv-slider:not([hidden])').count(),3,'TV inspection enables all sliders while WORK paper stays raised');
  const before=Number((await data()).tvVolume),volume=page.locator('.tv-slider[data-tv-setting="volume"]');
  await volume.focus();await page.keyboard.press('ArrowRight');assert(Number((await data()).tvVolume)>before);
  await page.keyboard.press('Escape');await settle();
  assert.equal((await data()).view,'work');assert.equal((await data()).paper,'up');
  assert.equal((await data()).cameraPosition,workCamera);await record('work-tv-return');

  for(const view of ['about','online']){
    await navigate(view);await action('calculator');await settle('calculator');
    assert.equal(await hidden('.surface-'+view),true,'calculator must hide the computer controls');
    await page.keyboard.press('Escape');await settle();assert.equal(await hidden('.surface-'+view),false);
    const control=page.locator(view==='about'?'.surface-about button:not(:disabled)':'.surface-online a').first();
    await control.focus();const label=await control.getAttribute('aria-label');
    await page.keyboard.press('m');await settle('cd');assert.equal(await hidden('.surface-'+view),true);
    await page.keyboard.press('Escape');await settle();
    assert.equal(new URL(page.url()).hash,'#'+view);assert.equal((await data()).view,view);
    assert.equal(await hidden('.surface-'+view),false);
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),label,'return restores the previous computer control focus');
    await record(view+'-cd-return');
  }
  await navigate('about');await action('rss');
  await page.waitForFunction(()=>document.querySelector('.surface-about').hidden);
  await page.keyboard.press('Escape');await settle();assert.equal(await hidden('.surface-about'),false);

  await navigate('home');await action('pager');await page.keyboard.press('Escape');
  await page.waitForTimeout(500);assert.equal((await data()).view,'home');assert.equal(new URL(page.url()).hash,'#home');
  await record('pager-escape-cancel');

  // Real app navigation + standby creates adjacent HOME history entries.
  await navigate('about');await page.locator('#standby').click();
  await page.waitForFunction(()=>document.querySelector('#room').dataset.state==='ready');
  assert.equal(new URL(page.url()).hash,'#home');
  await page.locator('#enter-room').click();await settle();
  await page.evaluate(async()=>{
    const changed=new Promise(resolve=>addEventListener('popstate',resolve,{once:true}));
    // Same task guarantees Back occurs within the intentional 260 ms delay.
    document.querySelector('[data-room-action="pager"]').click();history.back();await changed;
  });
  await page.waitForTimeout(500);await settle();
  assert.equal((await data()).view,'home');assert.equal(new URL(page.url()).hash,'#home');
  assert.match(await page.locator('#status').textContent(),/拖动环顾/);
  await record('pager-same-hash-back-cancel');
  assert.deepEqual(lateVisualRequests,[],'all scene materials must be ready before interaction');
  assert.deepEqual(errors,[]);console.log('PASS: preloaded interactions, leaf picking, computer resume, inspection controls, N/TV return, standby and delayed history cancellation');
}catch(error){await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});throw error;}
finally{await writeFile(join(output,'evidence.json'),JSON.stringify({errors,lateVisualRequests,checks},null,2));await browser.close();}
