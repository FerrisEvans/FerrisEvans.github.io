#!/usr/bin/env node
/** Capture the actual browser renderer; never substitute a Blender preview. */
import assert from 'node:assert/strict';
import { readFile, writeFile, rename, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { modelManifest, posterSizes, fileRecord } from './manifest.mjs';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:4327';
const manifest = JSON.parse(await readFile('public/island/manifest.json', 'utf8'));
assert.equal((await modelManifest()).buildId, manifest.buildId, 'Seal model/rendering sources before capturing.');
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome' });
const directory = await mkdtemp(join(tmpdir(), 'praxis-island-posters-'));
const files = {};
try {
  for (const [file, [width, height]] of Object.entries(posterSizes)) {
    const theme = file.includes('night') ? 'dark' : 'light';
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: theme });
    await context.addInitScript(theme => { try { localStorage.setItem('theme', theme); } catch {} }, theme);
    const page = await context.newPage();
    const failures = [];
    page.on('pageerror', error => failures.push(String(error)));
    await page.goto(new URL('/?capture=1', base).href);
    await page.waitForFunction(() => document.querySelector('#island-root')?.getAttribute('data-state') === 'ready', null, { timeout: 90_000 });
    const buildId = await page.locator('#island-root').getAttribute('data-build-id');
    assert.equal(buildId, manifest.buildId, 'The rendered page must use the exact model/source build being sealed.');
    await page.evaluate(() => document.fonts.ready);
    // A newly sealed manifest can trigger one development reload. Add capture
    // chrome suppression only after the matching renderer has become ready.
    await page.addStyleTag({ content: 'astro-dev-toolbar { display:none !important; }' });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const canvas = await page.locator('#island-scene canvas').boundingBox();
    assert(canvas && Math.abs(canvas.x) <= 1 && Math.abs(canvas.y) <= 1 && Math.abs(canvas.width - width) <= 1 && Math.abs(canvas.height - height) <= 1,
      'Capture mode must show the actual scene over the full output canvas without UI or cropping.');
    assert.deepEqual(failures, [], 'The captured scene has no unhandled browser errors.');
    const capture = await page.screenshot();
    const output = join(directory, file);
    if (file.endsWith('.webp')) await sharp(capture).webp({ quality: 88 }).toFile(output);
    else await sharp(capture).jpeg({ quality: 91, mozjpeg: true }).toFile(output);
    files[file] = { ...await fileRecord(output), width, height, theme };
    await context.close();
  }
  assert.equal((await modelManifest()).buildId, manifest.buildId, 'Sources changed during capture; refusing mixed poster delivery.');
  // All captures must succeed before any public poster is replaced.
  for (const file of Object.keys(files)) await rename(join(directory, file), join('public/island', file));
  manifest.posters = { buildId: manifest.buildId, renderer: 'Three.js / browser WebGL', files };
  await writeFile('public/island/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Captured day, night and sharing images from browser build ${manifest.buildId}.`);
} finally {
  await browser.close();
  await rm(directory, { recursive: true, force: true });
}
