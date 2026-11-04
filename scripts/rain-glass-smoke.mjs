// Exercise the real WebGL pane with browser pointer input and rendered pixels.
// BASE_URL=http://127.0.0.1:4357 BROWSER_CHANNEL=chrome node scripts/rain-glass-smoke.mjs
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:4327';
const output = process.env.SMOKE_SCREENSHOT_DIR;
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined, ignoreDefaultArgs: ['--disable-back-forward-cache'] });
const contexts = [], errors = [], evidence = [];
let currentPage;
const url = path => new URL(path, base).href;
async function context(options = {}) {
  const instance = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ...options });
  contexts.push(instance);
  instance.on('page', page => {
    currentPage = page;
    page.on('pageerror', error => errors.push(`${page.url()}: ${error}`));
  });
  return instance;
}
async function settle(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.allSettled(document.getAnimations()
      .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map(animation => animation.finished));
  });
}
async function close(instance) {
  for (const page of instance.pages()) await settle(page);
  await instance.close();
}
async function capture(page, name) {
  const bytes = await page.screenshot();
  if (output) { await mkdir(output, { recursive: true }); await writeFile(join(output, name + '.png'), bytes); }
  return bytes;
}
async function ready(page) {
  await page.waitForFunction(() => document.querySelector('#home-rain-glass')?.dataset.loaded === 'true');
  await page.locator('#home-rain-canvas').waitFor({ state: 'visible' });
  await settle(page);
  assert.equal(await page.locator('#home-rain-canvas').evaluate(canvas => getComputedStyle(canvas).opacity), '1');
}
async function pixels(buffer, region) {
  return sharp(buffer).extract({ left: region.x, top: region.y, width: region.width, height: region.height })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
}
async function difference(before, after, region) {
  const [a, b] = await Promise.all([pixels(before, region), pixels(after, region)]);
  assert.deepEqual(a.info, b.info);
  let changed = 0, sum = 0;
  for (let index = 0; index < a.data.length; index += a.info.channels) {
    let largest = 0;
    for (let channel = 0; channel < a.info.channels; channel++) {
      const delta = Math.abs(a.data[index + channel] - b.data[index + channel]);
      largest = Math.max(largest, delta); sum += delta;
    }
    if (largest >= 8) changed++;
  }
  return { changedPixels: changed, changedFraction: changed / (a.info.width * a.info.height), meanDifference: sum / a.data.length };
}
async function wipe(page, name, y = 230) {
  const region = { x: 100, y: y - 90, width: 420, height: 180 };
  const control = { x: 950, y: y - 90, width: 300, height: 180 };
  await page.mouse.move(40, 40);
  const before = await capture(page, name + '-before');
  await page.waitForTimeout(200);
  const still = await page.screenshot();
  const baseline = await difference(before, still, region);
  assert(baseline.changedFraction < .001, 'reduced motion must keep the pane stable before a wipe');
  await page.mouse.move(140, y);
  await page.mouse.down();
  await page.mouse.move(480, y, { steps: 34 });
  await page.mouse.up();
  await settle(page);
  const after = await capture(page, name + '-after');
  const wiped = await difference(still, after, region);
  const untouched = await difference(still, after, control);
  assert(wiped.changedFraction > .10 && wiped.meanDifference > 2,
    `a real pointer drag must visibly clear the fog: ${JSON.stringify(wiped)}`);
  assert(untouched.changedFraction < .001, `the untouched control region must remain stable: ${JSON.stringify(untouched)}`);
  evidence.push({ name, baseline, wiped, untouched });
}
async function destinations(page) {
  for (const [id, destination] of [['home-enter-room', '/room/'], ['home-enter-blog', '/lofi/']]) {
    const link = page.locator('#' + id);
    await link.waitFor({ state: 'visible' });
    assert.equal(await link.getAttribute('href'), destination);
    const obscured = await link.evaluate(anchor => {
      const box = anchor.getBoundingClientRect();
      return !anchor.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    });
    assert.equal(obscured, false, 'rain layers must not cover either destination');
  }
}

try {
  const reduced = await context({ reducedMotion: 'reduce' }), page = await reduced.newPage();
  await page.addInitScript(() => {
    window.__rainPageShows = [];
    addEventListener('pageshow', event => window.__rainPageShows.push(event.persisted));
  });
  await page.goto(url('/'));
  await ready(page);
  await destinations(page);
  await wipe(page, 'rain-wipe');
  await page.waitForFunction(() => document.querySelector('#home-preload')?.dataset.state === 'ready', null, { timeout: 180000 });
  assert.equal(await page.locator('#home-preload-progress').evaluate(progress => progress.value), 100);
  assert(Number(await page.locator('#home-preload').getAttribute('data-loaded-bytes')) > 0);
  await page.locator('#home-enter-blog').click();
  await page.waitForURL(url('/lofi/'));
  await page.getByRole('heading', { level: 1, name: /保持好奇，慢慢来/ }).waitFor({ state: 'visible' });
  await settle(page);
  // A BFCache document fires pageshow rather than another load event.
  await page.goBack({ waitUntil: 'commit' });
  assert.equal(page.url(), url('/'));
  await ready(page);
  const restored = await page.evaluate(() => ({ pageShows: window.__rainPageShows, notRestoredReasons: performance.getEntriesByType('navigation')[0]?.notRestoredReasons }));
  evidence.push({ name: 'history-restoration', ...restored });
  assert(restored.pageShows.includes(true), `the lifecycle case must exercise a persisted homepage restoration: ${JSON.stringify(restored)}`);
  await wipe(page, 'rain-wipe-after-back', 550);
  await destinations(page);
  await page.locator('#home-enter-room').click();
  await page.waitForURL(url('/room/'));
  await page.locator('#room').waitFor({ state: 'visible' });
  await close(reduced);
  console.log('PASS: real drag clears fog pixels while the control region stays stable; preload completes, both CTAs work, and browser Back restores wiping');

  const animated = await context({ reducedMotion: 'no-preference' }), rain = await animated.newPage();
  await rain.goto(url('/'));
  await ready(rain);
  await rain.mouse.move(40, 40);
  const beforeRain = await capture(rain, 'rain-moving-before');
  await rain.waitForTimeout(1200);
  const afterRain = await capture(rain, 'rain-moving-after');
  const motion = await difference(beforeRain, afterRain, { x: 80, y: 80, width: 1280, height: 700 });
  assert(motion.changedFraction > .0002, `normal motion must animate visible droplets: ${JSON.stringify(motion)}`);
  evidence.push({ name: 'rain-motion', motion });
  await close(animated);
  console.log('PASS: normal-motion rain changes rendered droplet pixels without pointer input');

  const noJs = await context({ javaScriptEnabled: false }), staticPage = await noJs.newPage();
  await staticPage.goto(url('/'));
  await destinations(staticPage);
  await staticPage.locator('#home-enter-blog').click();
  await staticPage.waitForURL(url('/lofi/'));
  await staticPage.goto(url('/'));
  await staticPage.locator('#home-enter-room').click();
  await staticPage.waitForURL(url('/room/'));
  await noJs.close();

  const noWebgl = await context();
  await noWebgl.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return /^webgl/.test(kind) ? null : original.call(this, kind, ...args);
    };
  });
  const fallback = await noWebgl.newPage();
  await fallback.goto(url('/'));
  await destinations(fallback);
  assert.notEqual(await fallback.locator('#home-rain-glass').getAttribute('data-loaded'), 'true');
  await capture(fallback, 'rain-no-webgl');
  await fallback.locator('#home-enter-blog').click();
  await fallback.waitForURL(url('/lofi/'));
  await fallback.goto(url('/'));
  await fallback.locator('#home-enter-room').click();
  await fallback.waitForURL(url('/room/'));
  await fallback.waitForFunction(() => document.querySelector('#room')?.dataset.state === 'fallback');
  await close(noWebgl);
  console.log('PASS: disabled JavaScript and unavailable WebGL preserve both static destinations');
  assert.deepEqual(errors, [], 'rain lifecycle and navigation must not leave unhandled browser errors');
} catch (error) {
  console.error('Rain-glass failure:', JSON.stringify({ url: currentPage?.url(), evidence, errors }, null, 2));
  if (output && currentPage) await capture(currentPage, 'rain-failure').catch(() => {});
  throw error;
} finally {
  if (output) { await mkdir(output, { recursive: true }); await writeFile(join(output, 'rain-glass-evidence.json'), JSON.stringify({ evidence, errors }, null, 2)); }
  await Promise.all(contexts.map(instance => instance.close().catch(() => {})));
  await browser.close();
}
