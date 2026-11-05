import assert from 'node:assert/strict';

/** Exercise the first painted homepage before its deferred module can run. */
export async function verifyHomeLoading(browser, base) {
  for (const [locale, width] of [['en', 1280], ['zh', 390]]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    let releaseScripts, releaseModel;
    const scripts = new Promise(resolve => { releaseScripts = resolve; });
    const model = new Promise(resolve => { releaseModel = resolve; });
    try {
      await page.goto(new URL(`/${locale}/notes/`, base).href);
      await page.addInitScript(() => {
        window.homeLoadingFrames = [];
        function sample() {
          const root = document.querySelector('#island-root');
          const directory = document.querySelector('#island-directory');
          if (root && directory && getComputedStyle(directory).position === 'absolute') {
            window.homeLoadingFrames.push({ state: root.dataset.state, visible: directory.checkVisibility({ visibilityProperty: true }) });
          }
          if (root?.dataset.state !== 'fallback') requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      });
      await page.route('**/*', async route => {
        if (route.request().resourceType() === 'script') await scripts;
        if (/\/island\/.*\.glb(?:\.bin)?(?:[?#]|$)/.test(route.request().url())) {
          await model;
          return route.abort();
        }
        await route.continue();
      });
      const home = new URL(`/${locale}/`, base).href;
      await Promise.all([
        page.waitForURL(home, { waitUntil: 'commit' }),
        page.locator('.site-header .island-brand').click({ noWaitAfter: true }),
      ]);
      await page.locator('#island-directory').waitFor({ state: 'attached' });
      await page.waitForFunction(() => getComputedStyle(document.querySelector('#island-directory')).position === 'absolute');
      // Leave enough painted frames for the normal cross-document transition.
      await page.waitForTimeout(350);
      assert.equal(await page.locator('#island-root').getAttribute('data-boot-pending'), 'true');
      assert.equal(await page.locator('#island-root').getAttribute('data-booted'), null);
      assert.equal(await page.locator('#island-directory').isVisible(), false, 'slow module download must not flash the reading directory');
      assert(await page.locator('.island-loading').isVisible(), 'the poster has a loading status before the scene module runs');
      releaseScripts();
      await page.waitForFunction(() => document.querySelector('#island-root')?.dataset.booted === 'true');
      assert.equal(await page.locator('#island-directory').isVisible(), false, 'the directory remains hidden while model data is pending');
      releaseModel();
      await page.waitForFunction(() => document.querySelector('#island-root')?.dataset.state === 'fallback');
      assert(await page.locator(`#island-directory a[href="/${locale}/notes/"]`).first().isVisible(), 'failed graphics restore the reading links');
      const frames = await page.evaluate(() => window.homeLoadingFrames);
      assert(frames.length > 1, 'inspect multiple painted loading frames');
      assert(frames.filter(frame => frame.state !== 'fallback').every(frame => !frame.visible), 'no loading or preparing frame may expose the fallback directory');
    } finally {
      releaseScripts(); releaseModel();
      await context.close();
    }
  }

  for (const javaScriptEnabled of [true, false]) {
    const context = await browser.newContext({ javaScriptEnabled });
    try {
      if (javaScriptEnabled) await context.route('**/*', route => route.request().resourceType() === 'script' ? route.abort() : route.continue());
      const page = await context.newPage();
      await page.goto(new URL('/zh/', base).href, { waitUntil: 'domcontentloaded' });
      assert(await page.locator('#island-directory a[href="/zh/notes/"]').first().isVisible(), 'disabled or failed modules expose the directory immediately after parsing');
      assert.equal(await page.locator('.island-loading').isVisible(), false, 'unavailable modules must not leave a permanent loading indicator');
    } finally {
      await context.close();
    }
  }
  console.log('PASS: homepage first paint hides the fallback directory; module and graphics failures preserve reading');
}
