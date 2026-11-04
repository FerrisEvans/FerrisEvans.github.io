#!/usr/bin/env node
/** Local browser evidence. Mobile dimensions are emulated, never a device claim. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { cpus, platform, arch } from 'node:os';
import { chromium } from 'playwright';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:4327';
const output = resolve(process.env.ISLAND_METRICS_FILE ?? 'docs/island/browser-metrics.json');
const expectedBuild = JSON.parse(await readFile('public/island/manifest.json', 'utf8')).buildId;
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome' });
const results = [];
try {
  for (const profile of [
    { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
    { name: 'mobile-viewport-emulation', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  ]) {
    const { name, ...options } = profile;
    const context = await browser.newContext({ ...options, reducedMotion: 'no-preference', colorScheme: 'light' });
    await context.addInitScript(() => { try { localStorage.setItem('theme', 'light'); } catch {} });
    const page = await context.newPage();
    for (const cache of ['cold-new-context', 'warm-same-context', 'hover-fountain-warm', 'hover-dog-warm']) {
      await page.goto(new URL('/', base).href);
      await page.waitForFunction(() => document.querySelector('#island-root')?.getAttribute('data-state') === 'ready', null, { timeout: 90_000 });
      if (cache.startsWith('hover-')) {
        await page.locator(`[data-island-access="${cache === 'hover-fountain-warm' ? 'categories' : 'about'}"]`).focus();
        await page.waitForTimeout(500);
      }
      const measured = await page.evaluate(async () => {
        const intervals = [];
        let previous;
        await new Promise(resolve => {
          function sample(now) {
            if (previous !== undefined) intervals.push(now - previous);
            previous = now;
            if (intervals.length >= 180) resolve();
            else requestAnimationFrame(sample);
          }
          requestAnimationFrame(sample);
        });
        const sorted = [...intervals].sort((a, b) => a - b);
        const percentile = percent => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * percent))];
        const root = document.querySelector('#island-root');
        const canvas = document.querySelector('#island-scene canvas');
        const gl = canvas?.getContext('webgl2');
        const debug = gl?.getExtension('WEBGL_debug_renderer_info');
        const resources = performance.getEntriesByType('resource').filter(resource => /\/island\/|\/_astro\//.test(resource.name)).map(resource => ({
          path: new URL(resource.name).pathname,
          initiatorType: resource.initiatorType,
          transferBytes: resource.transferSize,
          encodedBodyBytes: resource.encodedBodySize,
          durationMs: Number(resource.duration.toFixed(2)),
        }));
        return {
          root: { ...root.dataset },
          frameIntervals: { samples: intervals.length, medianMs: percentile(.5), p95Ms: percentile(.95), maxMs: sorted.at(-1), estimatedMedianFps: 1000 / percentile(.5) },
          viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
          drawingBuffer: { width: canvas?.width, height: canvas?.height },
          webgl: debug ? { vendor: gl.getParameter(debug.UNMASKED_VENDOR_WEBGL), renderer: gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) } : { renderer: 'unavailable' },
          resources,
        };
      });
      assert.equal(measured.root.buildId, expectedBuild, 'Performance must measure the sealed production build.');
      results.push({ profile: name, cache, ...measured });
      console.log(`${name}, ${cache}: ready ${measured.root.readyMs} ms, median ${measured.frameIntervals.medianMs.toFixed(2)} ms, p95 ${measured.frameIntervals.p95Ms.toFixed(2)} ms`);
    }
    await context.close();
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify({
    capturedAt: new Date().toISOString(), browser: browser.version(), headless: true,
    host: { platform: platform(), arch: arch(), cpu: cpus()[0]?.model },
    conditions: 'Local HTTP server, no network or CPU throttling. A fresh browser context has empty HTTP and Cache Storage for each cold profile. Frame intervals use requestAnimationFrame and are not GPU timing. Mobile viewport is emulation on the desktop host, not a physical phone.',
    results,
  }, null, 2) + '\n');
  console.log(`Performance evidence written to ${output}`);
} finally { await browser.close(); }
