#!/usr/bin/env node
/** Browser emulation and local WebGL checks; this is not physical-device evidence. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:4327';
const output = process.env.SMOKE_SCREENSHOT_DIR;
const softwareWebGL = process.env.ISLAND_SOFTWARE_WEBGL === '1';
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined,
  args: softwareWebGL ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : undefined });
const contexts = [], errors = [], evidence = [], cameraJourneys = [], effectChecks = [], activityChecks = [];
let passed = false;
const url = path => new URL(path, base).href;
const data = page => page.locator('#island-root').evaluate(element => ({ ...element.dataset }));
const effectState = page => page.locator('#island-root').evaluate(root => JSON.parse(root.dataset.effects));
const activityState = page => page.locator('#island-root').evaluate(root => JSON.parse(root.dataset.activity));
const outlineState = page => page.locator('#island-root').evaluate(root => JSON.parse(root.dataset.outline));
const objectNames = { library: 'Library', recent: 'Noticeboard', categories: 'Categories', about: 'Dog', tags: 'Tags', mail: 'Mailbox', bear: 'Bear', rabbit: 'Rabbit' };
async function context(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  context.setDefaultTimeout(30_000);
  context.setDefaultNavigationTimeout(30_000);
  contexts.push(context);
  context.on('page', page => page.on('pageerror', error => errors.push(`${page.url()}: ${error}`)));
  return context;
}
async function ready(page) {
  await page.waitForFunction(() => {
    const root = document.querySelector('#island-root');
    if (root?.getAttribute('data-state') === 'fallback') throw new Error(document.querySelector('#island-status')?.textContent);
    return root?.getAttribute('data-state') === 'ready' && Boolean(root.getAttribute('data-camera-points'))
      && Boolean(root.dataset.activity && root.dataset.poses && root.dataset.outline);
  }, null, { timeout: 90_000 });
  await page.evaluate(async () => {
    await document.activeViewTransition?.finished;
    await Promise.allSettled(document.getAnimations().filter(animation =>
      Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished));
  });
}
async function record(page, name) {
  const webgl = await page.evaluate(() => {
    const gl = document.querySelector('#island-scene canvas')?.getContext('webgl2');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null;
  });
  if (softwareWebGL && webgl) assert.match(webgl, /SwiftShader/i, 'the opt-in CI reproduction uses actual software WebGL');
  evidence.push({ name, url: page.url(), viewport: page.viewportSize(), data: await data(page), browser: browser.version(), emulated: true, webgl });
  if (output) {
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: join(output, `${name}.png`) });
  }
}
async function openPanel(page, view) {
  await page.locator(`[data-island-access="${view}"]`).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#island-dialog')?.open);
  const dialog = page.locator('#island-dialog');
  assert(await dialog.isVisible());
  assert(await dialog.locator('a[href]').count() > 0, `${view} exposes real content links`);
  return dialog;
}
async function assertScrollableFallback(page) {
  const scrolling = await page.locator('#island-directory').evaluate(directory => {
    directory.scrollTop = directory.scrollHeight;
    const result = { scrolled: directory.scrollTop > 0, outer: scrollY, scrollbar: getComputedStyle(directory).scrollbarWidth };
    directory.scrollTop = 0;
    return result;
  });
  assert(scrolling.scrolled && scrolling.outer === 0, 'fallback content scrolls inside its directory while the homepage stays fixed');
  assert.equal(scrolling.scrollbar, 'none', 'the fallback directory does not introduce a visible scrollbar');
}
// Projected anchors are renderer diagnostics; no visible DOM marker is required.
const cameraPoints = page => page.locator('#island-root').evaluate(root =>
  JSON.parse(root.dataset.cameraPoints).map(point => [point.x, point.y]));
function projectedDistance(a, b) {
  return Math.max(...a.map((point, index) => Math.hypot(point[0] - b[index][0], point[1] - b[index][1])));
}
async function waitForCamera(page, expected) {
  // The runtime bounds simulation dt. On software WebGL, 900 ms of wall time
  // need not finish a camera tween. Cross two rendered frames before trusting
  // cameraMoving so an old false value cannot satisfy the new navigation.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForFunction(expected => {
    const root = document.querySelector('#island-root');
    const points = JSON.parse(root.dataset.cameraPoints);
    return root.dataset.cameraMoving === 'false' && points.every((point, index) =>
      Math.hypot(point.x - expected[index][0], point.y - expected[index][1]) < 1);
  }, expected, { timeout: 30_000 });
}
async function waitForCameraChange(page, before, distance) {
  await page.waitForFunction(({ before, distance }) => JSON.parse(document.querySelector('#island-root').dataset.cameraPoints)
    .some((point, index) => Math.hypot(point.x - before[index][0], point.y - before[index][1]) > distance), { before, distance });
}
async function cameraJourney(page, selector, keyboard = false) {
  await page.evaluate(selector => {
    const sample = () => JSON.parse(document.querySelector('#island-root').dataset.cameraPoints).map(point => [point.x, point.y]);
    window.__islandCameraTrace = { samples: [], done: false };
    document.addEventListener('click', function onClick(event) {
      if (!event.target.closest(selector)) return;
      document.removeEventListener('click', onClick, true);
      const trace = window.__islandCameraTrace;
      trace.samples.push(sample());
      function next() {
        trace.samples.push(sample());
        if (trace.samples.length >= 71 && document.querySelector('#island-root').dataset.cameraMoving === 'false') trace.done = true;
        else requestAnimationFrame(next);
      }
      requestAnimationFrame(next);
    }, true);
  }, selector);
  if (keyboard) { await page.locator(selector).first().focus(); await page.keyboard.press('Enter'); }
  else await page.locator(selector).first().click();
  await page.waitForFunction(() => window.__islandCameraTrace?.done);
  return page.evaluate(() => { const samples = window.__islandCameraTrace.samples; delete window.__islandCameraTrace; return samples; });
}
function assertSmoothJourney(samples, label) {
  const distance = projectedDistance(samples[0], samples.at(-1));
  assert(distance > 8, `${label} exercises a visible camera journey`);
  const firstStep = projectedDistance(samples[0], samples[1]);
  const largestStep = Math.max(...samples.slice(1).map((sample, index) => projectedDistance(sample, samples[index])));
  assert(firstStep < distance * .15, `${label} has no abrupt first-frame jump (${firstStep.toFixed(1)}px of ${distance.toFixed(1)}px)`);
  assert(largestStep < distance * .22, `${label} stays continuous throughout the transition`);
  cameraJourneys.push({ label, projectedTravelPx: Number(distance.toFixed(3)), firstFrameStepPx: Number(firstStep.toFixed(3)), largestFrameStepPx: Number(largestStep.toFixed(3)), samples: samples.length });
}

try {
  const desktop = await context(), page = await desktop.newPage();
  const downloads = [], moduleRequests = [];
  page.on('request', request => {
    if (/\/island\/.*\.glb(?:[?#]|$)/.test(request.url())) downloads.push(request.url());
    if (request.resourceType() === 'script') moduleRequests.push(request.url());
  });
  await page.goto(url('/'));
  await ready(page);
  assert.equal(downloads.length, 1, 'homepage automatically downloads its model without an exploration click');
  assert(moduleRequests.some(request => /(?:three|GLTFLoader|OrbitControls|\/scene)[./_]/i.test(request)), 'homepage loads its real scene renderer');
  const covers = await page.evaluate(() => performance.getEntriesByType('resource').filter(resource => resource.initiatorType === 'img' && /\/island\/cover-(?:day|night)\.webp/.test(resource.name)).map(resource => new URL(resource.name).pathname));
  assert.equal(new Set(covers).size, 1, 'the active theme loads one lightweight cover variant');
  assert.equal(await page.locator('#home-enter-room, #home-enter-blog, #island-reset, #island-panel-reset, .island-dock, .island-marker').count(), 0, 'the homepage has no exploration gateway, reset UI, dock or numeric markers');
  assert(await page.locator('#island-scene canvas').isVisible());
  assert.equal(await page.locator('#island-directory').isVisible(), false, 'the ready homepage keeps its article directory inside scene panels');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight + 1), false, 'the homepage fits one viewport without external scrollbars');
  const access = page.locator('[data-island-access]');
  assert.equal(await access.count(), 6, 'all six destinations retain keyboard access without visual labels');
  assert.equal(await access.evaluateAll(buttons => buttons.some(button => /^\s*\d+\s*$/.test(button.textContent))), false);
  await page.locator('[data-island-access="categories"]').focus();
  await page.waitForFunction(() => document.querySelector('#island-root').dataset.hover === 'categories');
  const names = await access.allTextContents();
  const accessibility = await desktop.newCDPSession(page);
  try {
    const { nodes } = await accessibility.send('Accessibility.getFullAXTree');
    const targets = nodes.filter(node => !node.ignored && node.role?.value === 'button' && names.includes(node.name?.value));
    assert.equal(targets.length, 6, 'all six scene buttons appear with their own accessible names');
    for (const target of targets) {
      assert(!target.description?.value || target.description.value === target.name.value,
        `${target.name.value} must not inherit the hovered target's dynamic tooltip description`);
    }
  } finally { await accessibility.detach(); }
  await page.locator('#island-scene').focus();
  await record(page, 'island-desktop-light');
  const originalOverview = await cameraPoints(page);
  const sceneBounds = await page.locator('#island-scene canvas').boundingBox();
  assert(sceneBounds);
  await page.mouse.move(sceneBounds.x + sceneBounds.width * .5, sceneBounds.y + sceneBounds.height * .65);
  await page.mouse.wheel(0, -240); await waitForCameraChange(page, originalOverview, 8);
  assert(projectedDistance(await cameraPoints(page), originalOverview) > 8, 'ordinary wheel directly zooms the fixed scene without a modifier');
  assert.equal(await page.evaluate(() => scrollY), 0, 'scene wheel does not scroll the document');
  await openPanel(page, 'about'); await page.locator('#island-close').click(); await waitForCamera(page, originalOverview);
  assert(projectedDistance(await cameraPoints(page), originalOverview) < 1, 'closing content restores the authored overview after free zoom');
  console.log('PASS: fixed one-screen homepage has no numeric markers or reset controls; ordinary wheel zooms');

  // The preceding keyboard-opened panel intentionally restores its trigger.
  // Move focus to the scene before observing a genuinely unhovered idle cycle.
  await page.locator('#island-scene').focus();
  await page.mouse.move(5, 5);
  await page.waitForFunction(() => document.querySelector('#island-root').dataset.hover === '');
  const idleActivity = await page.evaluate(async () => {
    const root = document.querySelector('#island-root'), started = performance.now(), ranges = {};
    const eyes = { Dog_Eye_L: [], Rabbit_Eye_L: [] };
    const dogActivities = new Set(), rabbitActivities = new Set();
    let samples = 0, wateringFrames = 0;
    // Cover one complete activity cycle, not an arbitrary single still frame.
    while (performance.now() - started < 14_300) {
      const activity = JSON.parse(root.dataset.activity), bear = JSON.parse(root.dataset.poses);
      dogActivities.add(activity.dog.activity); rabbitActivities.add(activity.rabbit.activity);
      wateringFrames += Number(activity.waterVisible);
      for (const [name, pose] of Object.entries({ ...activity.dog.poses, ...activity.rabbit.poses, ...bear })) {
        const values = [...pose.rotation, ...pose.scale];
        const range = ranges[name] ??= { min: [...values], max: [...values] };
        values.forEach((value, index) => { range.min[index] = Math.min(range.min[index], value); range.max[index] = Math.max(range.max[index], value); });
        if (eyes[name]) eyes[name].push({ atMs: performance.now() - started, scaleY: pose.scale[1] });
      }
      samples++; await new Promise(resolve => setTimeout(resolve, 100));
    }
    const blinks = Object.fromEntries(Object.entries(eyes).map(([name, samples]) => {
      const maxScaleY = Math.max(...samples.map(sample => sample.scaleY));
      const minScaleY = Math.min(...samples.map(sample => sample.scaleY));
      const closed = samples.find(sample => sample.scaleY < .4 * maxScaleY);
      const reopened = closed && samples.find(sample => sample.atMs > closed.atMs && sample.scaleY > .95 * maxScaleY);
      return [name, { minScaleY, maxScaleY, closureRatio: minScaleY / maxScaleY, closedAtMs: closed?.atMs ?? null, reopenedAtMs: reopened?.atMs ?? null, restReference: 'maximum observed scaleY during this idle cycle' }];
    }));
    return { durationMs: performance.now() - started, samples, wateringFrames, dogActivities: [...dogActivities], rabbitActivities: [...rabbitActivities], ranges, blinks };
  });
  activityChecks.push({ mode: 'idle', ...idleActivity });
  assert(idleActivity.dogActivities.includes('sniffing'), 'the dog actually sniffs its flowers without being hovered');
  assert(idleActivity.rabbitActivities.includes('watering') && idleActivity.wateringFrames > 0, 'the rabbit tends its flowerbed without hover');
  for (const name of ['Dog_Head', 'Dog_Tail', 'Rabbit_Head', 'Rabbit_WateringCan', 'Bear_Head', 'Bear_Book_Page']) {
    const range = idleActivity.ranges[name];
    assert(range && range.max.some((value, index) => value - range.min[index] > .005), `${name} has actual changing pose values during idle activity`);
  }
  for (const name of ['Dog_Eye_L', 'Rabbit_Eye_L']) {
    const blink = idleActivity.blinks[name];
    assert(Number.isFinite(blink.maxScaleY) && blink.maxScaleY > 0 && blink.closureRatio < .4, `${name} visibly closes during actual idle animation`);
    assert(blink.closedAtMs !== null && blink.reopenedAtMs > blink.closedAtMs, `${name} returns above 95% of its observed open scale after closing`);
  }

  async function meshHits(target) {
    return target.evaluate(() => {
      const canvas = document.querySelector('#island-scene canvas'), rect = canvas.getBoundingClientRect();
      const root = document.querySelector('#island-root'), candidates = {};
      function sample(x, y) {
        if (document.elementFromPoint(x, y) !== canvas) return;
        canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y, pointerType: 'mouse' }));
        const target = root.dataset.hover;
        if (target) (candidates[target] ??= []).push({ x, y });
      }
      for (let y = rect.y + 18; y < Math.min(innerHeight, rect.bottom) - 18; y += 22)
        for (let x = rect.x + 18; x < rect.right - 18; x += 22) sample(x, y);
      for (const point of JSON.parse(document.querySelector('#island-root').dataset.cameraPoints)) {
        if (!point) continue;
        for (let dy = -8; dy <= 100; dy += 8) for (let dx = -64; dx <= 64; dx += 8) sample(rect.x + point.x + dx, rect.y + point.y + dy);
      }
      return Object.fromEntries(Object.entries(candidates).map(([view, points]) => {
        const center = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
        return [view, points.reduce((nearest, point) => Math.hypot(point.x - center.x, point.y - center.y)
          < Math.hypot(nearest.x - center.x, nearest.y - center.y) ? point : nearest)];
      }));
    });
  }
  const hits = await meshHits(page);
  for (const view of ['library', 'recent', 'categories', 'about', 'tags', 'mail']) {
    assert(hits[view], `${view} has a direct raycast hit on its actual visible mesh`);
    await page.mouse.move(hits[view].x, hits[view].y);
    const hint = page.locator('#island-hint'); await hint.waitFor({ state: 'visible' });
    assert.equal(await hint.innerText(), await page.locator(`[data-island-access="${view}"]`).evaluate(button => button.getAttribute('aria-label') ?? button.textContent), 'tooltip is the destination name alone');
    assert.doesNotMatch(await hint.innerText(), /[·\d]/, 'tooltip has no object prefix, count or extra sentence');
    assert.equal(await hint.getAttribute('role'), 'tooltip');
    await page.waitForFunction(view => {
      const root = document.querySelector('#island-root'), effect = JSON.parse(root.dataset.effects), activity = JSON.parse(root.dataset.activity);
      return root.dataset.hover === view && effect.active === view && effect.strength[view] > .5
        && (view !== 'about' || activity.dog.greeting > .5);
    }, view);
    const effect = await effectState(page);
    const pivots = {
      library: ['Library_FeatureBook'], recent: ['Desk_Page', 'Desk_Lamp'],
      categories: [], about: [],
      tags: ['Plants_Monstera_Foliage', 'Plants_Sansevieria_Foliage', 'Plants_Pothos_Foliage'], mail: ['Radio'],
    };
    for (const name of pivots[view]) assert(effect.pivots.includes(name), `${view} has its actual authored ${name} effect pivot`);
    if (view === 'categories') assert(effect.fountainVisible, 'fountain hover reveals rendered water');
    if (view === 'mail') assert(effect.notesVisible, 'radio hover reveals rendered musical notes');
    if (view === 'recent') assert(effect.lampIntensity > 0, 'desk hover lights its lamp');
    const activity = await activityState(page), outline = await outlineState(page);
    assert(outline.postprocessing && outline.drawn === objectNames[view] && outline.opacity > .5, `${view} receives its own silhouette instead of a fill tint`);
    if (view === 'about') {
      assert(activity.dog.greeting > .5, 'dog hover activates its greeting');
      for (const name of ['Dog_Head', 'Dog_Tail', 'Dog_Ear_L', 'Dog_Ear_R', 'Dog_Arm_L']) assert(activity.pivots.includes(name));
    }
    effectChecks.push({ mode: 'full', view, ...effect, outline, activity });
    // Leave before clicking: decay must restore every transient effect, rather
    // than being hidden only because a content panel covered it.
    await page.mouse.move(5, 5);
    await page.waitForFunction(() => {
      const root = document.querySelector('#island-root'), effect = JSON.parse(root.dataset.effects), activity = JSON.parse(root.dataset.activity), outline = JSON.parse(root.dataset.outline);
      return root.dataset.hover === '' && effect.active === null && !effect.fountainVisible && !effect.notesVisible
        && effect.lampIntensity < .005 && activity.dog.greeting < .001 && activity.rabbit.greeting < .001 && !outline.postprocessing
        && Object.values(effect.strength).every(value => value < .001);
    });
    assert.equal(await hint.isVisible(), false, 'leaving hides the tooltip too');
    effectChecks.push({ mode: 'leave', view, ...await effectState(page) });
    await page.mouse.click(hits[view].x, hits[view].y);
    await page.waitForFunction(() => document.querySelector('#island-dialog')?.open);
    assert.equal((await data(page)).view, view, `${view} mesh opens matching content`);
    await page.keyboard.press('Escape'); await waitForCamera(page, originalOverview);
    assert.equal((await data(page)).hover, '', 'closing a pointer-picked mesh does not restart its hover effect');
    assert(await page.locator('#island-scene').evaluate(scene => document.activeElement === scene), 'closing a pointer-picked mesh restores focus to the scene');
  }
  for (const target of ['bear', 'rabbit']) {
    // Their authored poses keep moving while earlier destinations are tested.
    const hit = (await meshHits(page))[target];
    assert(hit, `${target} has an actual visible mesh hit in its current pose`);
    await page.mouse.move(hit.x, hit.y);
    await page.waitForFunction(target => {
      const root = document.querySelector('#island-root'), outline = JSON.parse(root.dataset.outline), activity = JSON.parse(root.dataset.activity);
      return root.dataset.hover === target && outline.postprocessing && outline.opacity > .5
        && (target !== 'rabbit' || activity.rabbit.greeting > .5);
    }, target);
    assert.equal(await page.locator('#island-hint').isVisible(), false, 'decorative companions do not pretend to be content links');
    assert.equal(await page.locator('#island-scene').evaluate(host => getComputedStyle(host).cursor), 'grab');
    assert.equal((await outlineState(page)).drawn, objectNames[target]);
    const poseBefore = target === 'bear' ? JSON.parse((await data(page)).poses) : (await activityState(page)).rabbit.poses;
    await page.waitForTimeout(400);
    const poseAfter = target === 'bear' ? JSON.parse((await data(page)).poses) : (await activityState(page)).rabbit.poses;
    assert.notDeepEqual(poseBefore, poseAfter, `${target} hover has actual articulated movement`);
    activityChecks.push({ mode: 'companion-hover', target, before: poseBefore, after: poseAfter, outline: await outlineState(page) });
    const beforeUrl = page.url();
    await page.mouse.click(hit.x, hit.y);
    assert.equal(page.url(), beforeUrl, `${target} does not change the location hash`);
    assert.equal(await page.locator('#island-dialog').evaluate(dialog => dialog.open), false, `${target} has no content panel`);
    await page.mouse.move(5, 5);
  }
  await page.mouse.move(hits.about.x, hits.about.y);
  await page.waitForFunction(() => JSON.parse(document.querySelector('#island-root').dataset.activity).dog.greeting > .5);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => {
    const root = document.querySelector('#island-root'), activity = JSON.parse(root.dataset.activity);
    return root.dataset.motion === 'reduced' && activity.reduced && activity.dog.activity === 'still' && activity.rabbit.activity === 'still';
  });
  const stopped = await data(page);
  await page.waitForTimeout(400);
  const stayed = await data(page);
  assert.deepEqual(JSON.parse(stayed.poses), JSON.parse(stopped.poses), 'switching reduced motion mid-greeting stops the actual bear mixer pose');
  assert.deepEqual(JSON.parse(stayed.activity), JSON.parse(stopped.activity), 'dog and rabbit stop in a stable pose, including watering particles');
  assert(Number(stayed.renderFrames) - Number(stopped.renderFrames) < 3, 'reduced motion stops the ongoing render loop');
  activityChecks.push({ mode: 'full-to-reduced', activity: JSON.parse(stayed.activity), poses: JSON.parse(stayed.poses), renderFrameDelta: Number(stayed.renderFrames) - Number(stopped.renderFrames) });
  await page.mouse.move(5, 5);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(() => document.querySelector('#island-root').dataset.motion === 'full');
  const companion = hits.about;
  await page.mouse.move(companion.x, companion.y); await page.mouse.down();
  await page.mouse.move(companion.x + 70, companion.y + 20, { steps: 6 }); await page.mouse.up();
  await waitForCameraChange(page, originalOverview, 1);
  assert.equal(await page.locator('#island-dialog').evaluate(dialog => dialog.open), false, 'orbit drag does not activate its mesh');
  assert(projectedDistance(await cameraPoints(page), originalOverview) > 1, 'dragging visibly orbits the scene');
  await openPanel(page, 'about'); await page.locator('#island-close').click(); await waitForCamera(page, originalOverview);
  console.log('PASS: six content meshes navigate, two companions only react, three idle activities move real nodes, and silhouettes settle cleanly');

  await page.mouse.move(sceneBounds.x + sceneBounds.width * .65, sceneBounds.y + sceneBounds.height * .7); await page.mouse.down();
  await page.mouse.move(sceneBounds.x + sceneBounds.width * .45, sceneBounds.y + sceneBounds.height * .75, { steps: 8 }); await page.mouse.up();
  const beforeWheel = await cameraPoints(page);
  await page.mouse.wheel(0, -400); await waitForCameraChange(page, beforeWheel, 1);
  const opening = await cameraJourney(page, '[data-island-access="about"]', true);
  assertSmoothJourney(opening, 'open content after orbit and zoom');
  const panelCloseJourney = await cameraJourney(page, '#island-close');
  assertSmoothJourney(panelCloseJourney, 'close to overview after orbit and zoom');
  assert(projectedDistance(panelCloseJourney.at(-1), originalOverview) < 1, 'X restores the exact initial overview after orbit and zoom');
  for (const view of ['library', 'recent', 'categories', 'about', 'tags', 'mail']) {
    const trigger = page.locator(`[data-island-access="${view}"]`);
    await trigger.focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#island-dialog')?.open);
    assert.equal((await data(page)).view, view, 'native keyboard activation reaches each mesh destination');
    const dialog = page.locator('#island-dialog');
    const destinations = { library: ['/notes/', '/search/?focus=1'], recent: ['/archives/'], categories: ['/categories/'], about: ['/about/'], tags: ['/tags/'], mail: ['/rss.xml'] };
    for (const href of destinations[view]) assert(await dialog.locator(`a[href="${href}"]`).count() > 0, `${view} exposes ${href}`);
    assert(await dialog.evaluate(element => element.contains(document.activeElement)), 'dialog takes focus');
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('#island-dialog')?.open);
    assert(await trigger.evaluate(element => document.activeElement === element), 'close restores the hidden native keyboard trigger');
    await waitForCamera(page, originalOverview);
  }
  await openPanel(page, 'tags');
  const tokenColors = await page.locator('#island-panel [data-tag-token]').evaluateAll(tokens => tokens.map(token => token.dataset.tokenColor));
  assert(tokenColors.length > 0, 'keyword panel uses the shared soft tag tokens');
  await page.locator('#island-close').click(); await waitForCamera(page, originalOverview); await openPanel(page, 'tags');
  const nextColors = await page.locator('#island-panel [data-tag-token]').evaluateAll(tokens => tokens.map(token => token.dataset.tokenColor));
  assert.notDeepEqual(nextColors, tokenColors, 'every keyword-panel opening refreshes its color assignment');
  await page.keyboard.press('Escape'); await waitForCamera(page, originalOverview);
  await openPanel(page, 'recent'); await page.goBack();
  await page.waitForFunction(() => !document.querySelector('#island-dialog')?.open);
  await page.goForward(); await page.waitForFunction(() => document.querySelector('#island-dialog')?.open);
  await page.reload(); await ready(page); await page.waitForFunction(() => document.querySelector('#island-dialog')?.open);
  const closeJourney = await cameraJourney(page, '#island-close'); assertSmoothJourney(closeJourney, 'close after history/reload');
  await page.waitForFunction(() => !document.querySelector('#island-dialog')?.open);
  await record(page, 'island-desktop-restored');
  console.log('PASS: keyboard content, fresh token colors, focus restoration, continuous close and history/reload');
  // Synthetic visibility event is labelled explicitly: this validates the handler,
  // while a physical browser/background-tab check remains separate evidence.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hiddenFrames = Number((await data(page)).renderFrames);
  await page.waitForTimeout(350);
  assert.equal(Number((await data(page)).renderFrames), hiddenFrames, 'visibility handler stops ongoing rendering');
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction(before => Number(document.querySelector('#island-root')?.getAttribute('data-render-frames')) > before, hiddenFrames);
  const lossAvailable = await page.evaluate(() => {
    const gl = document.querySelector('#island-scene canvas').getContext('webgl2');
    const extension = gl.getExtension('WEBGL_lose_context');
    extension?.loseContext(); return Boolean(extension);
  });
  assert(lossAvailable, 'browser exposes controlled WebGL context loss for this regression');
  await page.waitForFunction(() => document.querySelector('#island-root')?.getAttribute('data-state') === 'fallback');
  assert.equal(await page.locator('#island-scene canvas').count(), 0, 'lost renderer is removed');
  await page.locator('#island-retry').click();
  await ready(page);
  for (let cycle = 0; cycle < 2; cycle++) {
    await page.goto(url('/notes/'));
    assert.equal(await page.locator('#island-scene canvas').count(), 0);
    await page.goto(url('/'));
    await ready(page);
    assert.equal(await page.locator('#island-scene canvas').count(), 1, 're-entry creates one current renderer');
    assert(Number((await data(page)).cacheBytes) > 0, 're-entry reuses the verified binary cache');
  }
  await record(page, 'island-lifecycle-recovered');
  console.log('PASS: visibility handler pauses/resumes; WebGL context loss retries; repeated visits reuse cache and mount one renderer');

  const touch = await context({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mobile = await touch.newPage();
  await mobile.goto(url('/'));
  await ready(mobile);
  assert(await mobile.locator('#island-scene canvas').isVisible(), 'narrow screens retain real 3D');
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await record(mobile, 'island-mobile-light');
  const mobileBeforeDrag = await cameraPoints(mobile);
  assert.equal(await mobile.locator('#island-scene canvas').evaluate(canvas => getComputedStyle(canvas).touchAction), 'none', 'the fixed canvas owns touch orbit and zoom');
  const touchBounds = await mobile.locator('#island-scene canvas').boundingBox(); assert(touchBounds);
  const touchSession = await touch.newCDPSession(mobile);
  const x = touchBounds.x + touchBounds.width * .7, y = touchBounds.y + touchBounds.height * .65;
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (const delta of [10, 25, 45, 65]) await touchSession.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - delta, id: 1 }] });
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await waitForCameraChange(mobile, mobileBeforeDrag, 1);
  assert(projectedDistance(await cameraPoints(mobile), mobileBeforeDrag) > 1, 'single-finger vertical dragging rotates the fixed scene');
  assert.equal(await mobile.evaluate(() => scrollY), 0, 'touch does not create outer document scrolling');
  assert.equal(await mobile.locator('#island-dialog').evaluate(dialog => dialog.open), false, 'touch orbit does not open a panel');
  const beforePinch = await cameraPoints(mobile);
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 30, y, id: 1 }, { x: x + 30, y, id: 2 }] });
  for (const delta of [40, 50, 65]) await touchSession.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - delta, y, id: 1 }, { x: x + delta, y, id: 2 }] });
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await touchSession.detach();
  await waitForCameraChange(mobile, beforePinch, 1);
  assert(projectedDistance(await cameraPoints(mobile), beforePinch) > 1, 'standard two-finger separation zooms the real scene');
  await openPanel(mobile, 'about'); await mobile.locator('#island-close').tap(); await waitForCamera(mobile, mobileBeforeDrag);
  assert(projectedDistance(await cameraPoints(mobile), mobileBeforeDrag) < 1, 'closing returns to the mobile overview after orbit and pinch');
  const mobileHits = await meshHits(mobile); assert(mobileHits.about, 'mobile about companion has a real mesh hit');
  for (const target of ['bear', 'rabbit']) {
    assert(mobileHits[target], `${target} remains visibly pickable on mobile`);
    const beforeUrl = mobile.url();
    await mobile.touchscreen.tap(mobileHits[target].x, mobileHits[target].y);
    assert.equal(mobile.url(), beforeUrl);
    assert.equal(await mobile.locator('#island-dialog').evaluate(dialog => dialog.open), false, 'touching a decorative companion creates no content navigation');
  }
  await mobile.touchscreen.tap(mobileHits.about.x, mobileHits.about.y); await mobile.waitForTimeout(350);
  assert.equal((await data(mobile)).view, 'about');
  assert(await mobile.locator('#island-dialog').evaluate(dialog => dialog.open), 'compatibility click leaves the direct-touch panel open');
  const close = await mobile.locator('#island-close').boundingBox();
  assert(close && close.x >= 0 && close.y >= 0 && close.x + close.width <= 391 && close.y + close.height <= 845, 'X remains inside the viewport');
  await record(mobile, 'island-mobile-panel');
  await mobile.goBack(); await waitForCamera(mobile, mobileBeforeDrag);
  assert.equal(await mobile.locator('#island-dialog').evaluate(dialog => dialog.open), false, 'Back closes a directly tapped mesh panel');
  assert.equal((await data(mobile)).hover, '', 'touch close does not create a synthetic hovered object');
  assert(await mobile.locator('#island-scene').evaluate(scene => document.activeElement === scene), 'touch panel restores scene focus');
  await openPanel(mobile, 'library');
  const panelScroll = await mobile.locator('#island-dialog').evaluate(dialog => {
    const target = [dialog, ...dialog.querySelectorAll('*')].find(element => element.scrollHeight > element.clientHeight + 10 && /auto|scroll/.test(getComputedStyle(element).overflowY));
    if (!target) return null;
    target.scrollTop = target.scrollHeight;
    return { scrolled: target.scrollTop > 0, outerScroll: scrollY, scrollbarWidth: getComputedStyle(target).scrollbarWidth };
  });
  assert(panelScroll?.scrolled && panelScroll.outerScroll === 0, 'long modal content scrolls internally while the page stays fixed');
  await mobile.locator('#island-close').tap();
  console.log('PASS: emulated touch orbits/pinches, direct mesh tap stays open, and modal content scrolls internally');

  const night = await context({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await night.addInitScript(() => { try { localStorage.setItem('theme', 'dark'); } catch {} });
  const dark = await night.newPage();
  await dark.goto(url('/'));
  await dark.waitForTimeout(500);
  const darkCovers = await dark.evaluate(() => performance.getEntriesByType('resource').filter(resource => resource.initiatorType === 'img' && /\/island\/cover-(?:day|night)\.webp/.test(resource.name)).map(resource => new URL(resource.name).pathname));
  assert.deepEqual([...new Set(darkCovers)], ['/island/cover-night.webp'], 'dark homepage downloads only its matching cover');
  await dark.goto(url('/'));
  await ready(dark);
  assert(await dark.evaluate(() => document.documentElement.classList.contains('dark')), 'shared site theme is applied');
  assert.equal((await data(dark)).motion, 'reduced');
  const before = Number((await data(dark)).renderFrames);
  await dark.waitForTimeout(500);
  const after = Number((await data(dark)).renderFrames);
  assert(after - before < 10, 'reduced motion does not maintain a continuous render loop');
  const darkOverview = await cameraPoints(dark);
  const reducedHits = await meshHits(dark);
  const darkBounds = await dark.locator('#island-scene canvas').boundingBox();
  await dark.mouse.move(darkBounds.x + darkBounds.width - 8, darkBounds.y + darkBounds.height - 8);
  await dark.mouse.move(5, 5);
  await dark.waitForFunction(() => document.querySelector('#island-root').dataset.hover === '');
  for (const view of Object.keys(objectNames)) {
    assert(reducedHits[view], `${view} remains directly pickable with reduced motion`);
    const still = await dark.locator('#island-scene canvas').screenshot();
    await dark.mouse.move(reducedHits[view].x, reducedHits[view].y);
    await dark.waitForFunction(view => {
      const root = document.querySelector('#island-root'), effect = JSON.parse(root.dataset.effects);
      return root.dataset.hover === view && effect.reduced && effect.active === view && effect.strength[view] === 1;
    }, view);
    const effect = await effectState(dark), activity = await activityState(dark), outline = await outlineState(dark);
    assert.equal(effect.fountainVisible, false, 'reduced motion does not animate fountain water');
    assert.equal(effect.notesVisible, false, 'reduced motion does not float musical notes');
    assert.equal(activity.waterVisible, false, 'reduced motion stops the rabbit watering particles');
    assert.equal(activity.dog.activity, 'still'); assert.equal(activity.rabbit.activity, 'still');
    assert(outline.postprocessing && outline.drawn === objectNames[view]);
    assert.notDeepEqual(await dark.locator('#island-scene canvas').screenshot(), still, 'the actual reduced-motion canvas still shows a visible hover highlight');
    const hoverFrames = Number((await data(dark)).renderFrames); await dark.waitForTimeout(350);
    assert(Number((await data(dark)).renderFrames) - hoverFrames < 3, 'reduced hover does not start a continuous animation loop');
    effectChecks.push({ mode: 'reduced', view, visibleCanvasChange: true, ...effect, activity, outline });
    await dark.mouse.move(5, 5);
    await dark.waitForFunction(() => {
      const effect = JSON.parse(document.querySelector('#island-root').dataset.effects);
      return effect.active === null && Object.values(effect.strength).every(value => value === 0);
    });
  }
  await dark.locator('[data-island-access="categories"]').focus();
  await dark.waitForFunction(() => document.querySelector('#island-root').dataset.hover === 'categories');
  await dark.waitForTimeout(100);
  const focusedFrames = Number((await data(dark)).renderFrames); await dark.waitForTimeout(350);
  assert(Number((await data(dark)).renderFrames) - focusedFrames < 3, 'reduced-motion keyboard focus updates the tooltip without starting a render loop');
  await dark.locator('[data-island-access="categories"]').evaluate(button => button.blur());
  await openPanel(dark, 'library');
  const reducedJourney = await cameraJourney(dark, '#island-close');
  const reducedStates = [];
  for (const sample of reducedJourney) if (!reducedStates.some(state => projectedDistance(state, sample) < .1)) reducedStates.push(sample);
  assert(reducedStates.length <= 2, 'reduced motion has a direct before/after reset, without intermediate camera motion');
  assert(projectedDistance(reducedJourney.at(-1), darkOverview) < 1, 'reduced-motion reset restores the same overview');
  cameraJourneys.push({ label: 'reduced-motion close', distinctProjectedStates: reducedStates.length, overviewDeviationPx: Number(projectedDistance(reducedJourney.at(-1), darkOverview).toFixed(3)) });
  await record(dark, 'island-desktop-night-reduced');
  console.log('PASS: dark site theme and reduced-motion rendering retain operation feedback');

  const failed = await context(), retry = await failed.newPage();
  let unavailable = true;
  await failed.route('**/island/island.glb*', route => unavailable ? route.fulfill({ status: 503, body: 'fixture model unavailable' }) : route.continue());
  await retry.goto(url('/'));
  await retry.waitForFunction(() => document.querySelector('#island-root')?.getAttribute('data-state') === 'fallback');
  assert(await retry.locator('a[href="/notes/"]').first().isVisible());
  assert(await retry.locator('#island-directory a[href^="/posts/"]').count() > 0, 'failed model retains a full static reading directory');
  unavailable = false;
  await retry.locator('#island-retry').click();
  await ready(retry);
  await record(retry, 'island-resource-retry');
  console.log('PASS: resource failure retains content and retry restores the scene');

  const rapid = await context(), early = await rapid.newPage();
  let releaseDownload;
  const pendingDownload = new Promise(resolve => { releaseDownload = resolve; });
  let released = false;
  await rapid.route('**/island/island.glb*', async route => {
    if (!released) await pendingDownload;
    await route.continue().catch(() => {}); // The first document may cancel its request when leaving.
  });
  await early.goto(url('/'));
  assert.equal((await data(early)).state, 'loading');
  await early.goto(url('/notes/'));
  released = true; releaseDownload();
  await early.waitForTimeout(100);
  assert.equal(await early.locator('#island-scene canvas').count(), 0);
  await early.goto(url('/'));
  await ready(early);
  assert.equal(await early.locator('#island-scene canvas').count(), 1);
  console.log('PASS: leaving during initial binary load cancels cleanly and the next visit still opens');

  const unavailableGL = await context();
  await unavailableGL.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return /webgl/.test(kind) ? null : original.call(this, kind, ...args);
    };
  });
  const fallback = await unavailableGL.newPage();
  await fallback.goto(url('/'));
  await fallback.waitForFunction(() => document.querySelector('#island-root')?.getAttribute('data-state') === 'fallback');
  assert(await fallback.locator('#island-directory a[href^="/posts/"]').count() > 0);
  await assertScrollableFallback(fallback);
  await record(fallback, 'island-no-webgl');
  const noJs = await context({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const staticPage = await noJs.newPage();
  await staticPage.goto(url('/'));
  assert(await staticPage.getByRole('heading', { level: 1 }).first().isVisible());
  assert(await staticPage.locator('#island-directory a[href^="/posts/"]').first().isVisible());
  await assertScrollableFallback(staticPage);
  await record(staticPage, 'island-no-javascript');
  console.log('PASS: no WebGL and no JavaScript retain real article entrances');

  // Expected model failure is handled by the UI; no rejected promises should escape.
  assert.deepEqual(errors, [], 'browser flow leaves no unhandled JavaScript errors');
  passed = true;
} finally {
  if (output) {
    await mkdir(output, { recursive: true });
    await writeFile(join(output, 'island-flow-evidence.json'), JSON.stringify({ capturedAt: new Date().toISOString(), softwareWebGL, passed, evidence, cameraJourneys, effectChecks, activityChecks, errors }, null, 2) + '\n');
  }
  await Promise.all(contexts.map(context => context.close().catch(() => {})));
  await browser.close();
}
