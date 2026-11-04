// Requires a hardware WebGL browser; software-only CI exercises the reading
// and unsupported-device paths through scripts/browser-smoke.mjs instead.
// BASE_URL=http://127.0.0.1:4327 BROWSER_CHANNEL=chrome node scripts/room/flow-smoke.mjs
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:4327';
const output = process.env.SMOKE_SCREENSHOT_DIR;
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined });
const contexts = [], errors = [], evidence = [], consoleMessages = [];
let currentPage;
const url = path => new URL(path, base).href;
const dataset = (page, selector = '#room') => page.locator(selector).evaluate(element => ({ ...element.dataset }));
async function context(options = {}) {
  const instance = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  contexts.push(instance);
  instance.on('page', page => {
    currentPage = page;
    page.on('pageerror', error => { errors.push(`${page.url()}: ${error}`); console.error('Browser error:', page.url(), String(error)); });
    page.on('console', message => { if (['warning', 'error'].includes(message.type())) consoleMessages.push(message.text()); });
  });
  return instance;
}
async function closeContext(instance) {
  // A route can be usable before its native cross-document transition ends.
  // Finish those finite animations before destroying the test document.
  for (const page of instance.pages()) await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await document.activeViewTransition?.finished;
    await Promise.allSettled(document.getAnimations()
      .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map(animation => animation.finished));
  });
  await instance.close();
}
async function record(page, name, selector = '#room') {
  evidence.push({ name, url: page.url(), data: await dataset(page, selector) });
  if (output) { await mkdir(output, { recursive: true }); await page.screenshot({ path: join(output, name + '.png') }); }
}
async function preloaded(page) {
  await page.waitForFunction(() => {
    const state = document.querySelector('#home-preload')?.dataset.state;
    if (state === 'error') throw new Error(document.querySelector('#home-preload-status')?.textContent);
    return state === 'ready';
  }, null, { timeout: 180000 });
  assert.equal(await page.locator('#home-preload-progress').evaluate(element => element.value), 100);
}
async function active(page, view = 'home') {
  await page.waitForFunction(expected => {
    const data = document.querySelector('#room')?.dataset;
    if (data?.state === 'fallback') throw new Error(document.querySelector('#status')?.textContent);
    return data?.state === 'active' && data.view === expected && data.cameraMoving === 'false';
  }, view, { timeout: 180000 });
  const data = await dataset(page);
  assert.equal(data.lightingDetails, 'full');
  assert.equal(data.interactionsReady, 'true');
  assert.equal(await page.locator('#enter-room').count(), 0, 'room entry must not retain a second unlock button');
}
async function startup(page, state) {
  await page.waitForFunction(expected => document.querySelector('#room')?.dataset.tvStartup === expected, state);
}
async function power(page) {
  const menu = page.locator('#object-menu');
  await menu.locator('summary').focus();
  if (!await menu.evaluate(element => element.open)) await menu.locator('summary').click();
  await menu.locator('[data-room-action="power"]').click();
}

try {
  const warm = await context(), page = await warm.newPage();
  await page.goto(url('/'));
  assert.match(await page.getByRole('heading', { level: 1 }).innerText(), /Praxis/i);
  assert.match(await page.locator('main').innerText(), /保持好奇，慢慢来/);
  assert.equal(await page.locator('#home-enter-room').getAttribute('href'), '/room/');
  assert.equal(await page.locator('#home-enter-blog').getAttribute('href'), '/lofi/');
  await page.locator('#home-preload').waitFor({ state: 'visible' });
  const placement = await page.locator('#home-preload').boundingBox();
  assert(placement && placement.x < 100 && placement.y > 600, 'homepage loading status belongs at bottom left');
  await preloaded(page);
  assert(Number((await dataset(page, '#home-preload')).httpBytes) > 0, 'a cold homepage must download actual room resources');
  assert.equal(await page.locator('#scene').count(), 0, 'homepage preload must not mount the 3D renderer');
  await record(page, 'home-preloaded', '#home-preload');

  await page.locator('#home-enter-room').click();
  await page.waitForURL(url('/room/'));
  await active(page);
  assert(Number((await dataset(page)).cacheBytes) > 0, 'room must reuse resources downloaded on the homepage');
  assert.equal(Number((await dataset(page)).httpRequests), 0, 'a completed preload must not download the scene bundle again');
  assert.equal((await dataset(page)).sound, 'off');
  assert.equal((await dataset(page)).television, 'on');
  await startup(page, 'prompt');
  await record(page, 'room-auto-entered');
  await page.evaluate(() => {
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      HTMLMediaElement.prototype.play = original;
      return Promise.reject(new DOMException('Fixture playback policy denial', 'NotAllowedError'));
    };
  });
  await page.locator('#home-play').click();
  await startup(page, 'playing');
  await page.waitForFunction(() => document.querySelector('#room')?.dataset.homeProgram === 'blocked');
  assert.equal((await dataset(page)).state, 'active');
  await page.locator('#home-play').click();
  await page.waitForFunction(() => document.querySelector('#room')?.dataset.homeProgram === 'playing');

  for (let cycle = 0; cycle < 2; cycle++) {
    await power(page);
    await startup(page, 'off');
    assert.equal((await dataset(page)).state, 'active');
    assert.equal((await dataset(page)).television, 'off');
    await page.keyboard.press('l');
    assert.equal((await dataset(page)).lamp, 'off', 'turning off the TV must leave room objects interactive');
    await page.keyboard.press('l');
    if (cycle === 0) {
      for (const view of ['work', 'posts']) {
        await page.locator(`[data-room-view="${view}"]`).click();
        await active(page, view);
        assert.equal((await dataset(page)).television, 'off', 'room navigation must not silently power the TV back on');
      }
      await power(page);
      await startup(page, 'prompt');
      await page.locator('#object-menu summary').focus();
      await page.keyboard.press('Space');
      await startup(page, 'playing');
      assert.equal((await dataset(page)).tvSource, 'posts', 'confirming the TV prompt must preserve its selected input');
      await power(page);
      await page.locator('[data-room-view="home"]').click();
      await active(page);
      assert.equal((await dataset(page)).television, 'off');
    }
    await power(page);
    await startup(page, 'prompt');
    await page.locator('#home-play').click();
    await startup(page, 'playing');
  }
  await record(page, 'television-repeated-power-on');
  await page.goto(url('/room/#work'));
  await active(page, 'work');
  await page.reload();
  await active(page, 'work');
  await record(page, 'room-deep-link-refreshed');
  await page.locator('header a[href="/"]').click();
  await page.waitForURL(url('/'));
  await preloaded(page);
  assert(Number((await dataset(page, '#home-preload')).cacheBytes) > 0);
  await page.locator('#home-enter-blog').click();
  await page.waitForURL(url('/lofi/'));
  await page.getByRole('heading', { level: 1, name: /保持好奇，慢慢来/ }).waitFor({ state: 'visible' });
  const roomLinks = page.getByRole('link', { name: /书房/ });
  assert(await roomLinks.count() > 0, 'blog navigation must retain a room entrance');
  for (const link of await roomLinks.all()) assert.equal(await link.getAttribute('href'), '/room/');
  assert.equal(await page.locator('#home-preload, #room').count(), 0);
  console.log('PASS: homepage preload is reused by an automatically interactive room; TV power repeats its play prompt; deep links, refresh, homepage return and blog navigation work');
  await closeContext(warm);

  const early = await context(), earlyPage = await early.newPage();
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let released = false;
  await early.route('**/room/materials/**', async route => {
    if (!released) await held;
    await route.continue().catch(() => {}); // Leaving the homepage cancels its pending requests.
  });
  await earlyPage.goto(url('/'), { waitUntil: 'domcontentloaded' });
  await earlyPage.waitForFunction(() => document.querySelector('#home-preload')?.dataset.state === 'loading');
  await earlyPage.locator('#home-enter-room').click();
  await earlyPage.waitForURL(url('/room/'));
  await earlyPage.locator('#status').waitFor({ state: 'visible' });
  assert(['loading', 'preparing'].includes((await dataset(earlyPage)).state));
  assert.equal(await earlyPage.locator('#progress').evaluate(element => element.hidden), false);
  released = true; release();
  await active(earlyPage);
  await record(earlyPage, 'early-entry-completed');
  await closeContext(early);
  console.log('PASS: entering while downloads are pending keeps loading status visible and completes without another click');

  const failed = await context(), failedPage = await failed.newPage();
  let broken = true;
  await failed.route('**/room/materials/*glb.bin*', route => broken ? route.fulfill({ status: 503, body: 'fixture asset unavailable' }) : route.continue());
  await failedPage.goto(url('/'));
  await failedPage.waitForFunction(() => document.querySelector('#home-preload')?.dataset.state === 'error');
  assert.notEqual(await failedPage.locator('#home-enter-room').getAttribute('aria-disabled'), 'true');
  assert.equal(await failedPage.locator('#home-enter-blog').getAttribute('href'), '/lofi/');
  broken = false;
  await failedPage.locator('#home-preload-retry').click();
  await preloaded(failedPage);
  await closeContext(failed);
  console.log('PASS: preload failure exposes retry and leaves both destinations available');

  const noWebgl = await context();
  await noWebgl.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return kind === 'webgl2' ? null : original.call(this, kind, ...args);
    };
  });
  const unsupported = await noWebgl.newPage();
  await unsupported.goto(url('/room/'));
  await unsupported.waitForFunction(() => document.querySelector('#room')?.dataset.state === 'fallback');
  await unsupported.locator('#room-actions a[href="/lofi/"]').click();
  await unsupported.waitForURL(url('/lofi/'));
  await closeContext(noWebgl);

  const narrow = await context({ viewport: { width: 390, height: 844 } }), mobile = await narrow.newPage();
  await mobile.goto(url('/'));
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await mobile.locator('#home-enter-room').click();
  await mobile.waitForFunction(() => document.querySelector('#room')?.dataset.state === 'fallback');
  await mobile.locator('#room-actions a[href="/lofi/"]').click();
  await mobile.waitForURL(url('/lofi/'));
  await closeContext(narrow);
  console.log('PASS: unsupported WebGL and narrow-screen room visits retain a working blog exit');
  assert.deepEqual(errors, [], 'the entry flow must not leave unhandled browser errors');
} catch (error) {
  console.error('Flow failure:', JSON.stringify({ url: currentPage?.url(), data: await dataset(currentPage).catch(() => undefined), errors, consoleMessages }, null, 2));
  if (output && currentPage) { await mkdir(output, { recursive: true }); await currentPage.screenshot({ path: join(output, 'failure.png') }).catch(() => {}); }
  throw error;
} finally {
  if (output) { await mkdir(output, { recursive: true }); await writeFile(join(output, 'flow-evidence.json'), JSON.stringify({ evidence, errors, consoleMessages }, null, 2)); }
  await Promise.all(contexts.map(instance => instance.close().catch(() => {})));
  await browser.close();
}
