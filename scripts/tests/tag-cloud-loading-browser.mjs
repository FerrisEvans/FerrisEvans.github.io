import assert from 'node:assert/strict';

async function observeLoadingFrames(page) {
  await page.addInitScript(() => {
    window.tagCloudLoadingFrames = [];
    function sample() {
      const cloud = document.querySelector('.tag-word-cloud');
      const word = cloud?.querySelector('.tag-item');
      if (word && getComputedStyle(cloud).display === 'flex') {
        const items = [...cloud.querySelectorAll('li:not([hidden])')];
        window.tagCloudLoadingFrames.push({
          visible: word.checkVisibility({ visibilityProperty: true, opacityProperty: true }),
          placed: items.every(item => getComputedStyle(item).position === 'absolute'),
        });
      }
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
}

async function assertStableEntrance(page, label) {
  await page.locator('.tag-word-cloud[data-ready="true"] .tag-item').first().waitFor({ state: 'visible' });
  // Include painted frames after the React commit, not only the DOM mutation.
  await page.waitForTimeout(100);
  const frames = await page.evaluate(() => window.tagCloudLoadingFrames);
  assert(frames.some(frame => frame.visible), `${label}: observe the visible cloud`);
  assert(frames.filter(frame => frame.visible).every(frame => frame.placed), `${label}: no painted frame exposes the temporary rows`);
  const firstVisible = frames.findIndex(frame => frame.visible);
  assert(frames.slice(firstVisible).every(frame => frame.visible), `${label}: the cloud does not disappear again after its entrance`);
}

/** Check first paint independently of hydration and web-font download speed. */
export async function verifyTagCloudLoading(browser, base) {
  for (const [locale, width] of [['zh', 1280], ['en', 390]]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let releaseScripts, releaseFonts;
    const scripts = new Promise(resolve => { releaseScripts = resolve; });
    const fonts = new Promise(resolve => { releaseFonts = resolve; });
    let fontRequests = 0;
    try {
      await observeLoadingFrames(page);
      await page.route('**/*', async route => {
        const type = route.request().resourceType();
        if (type === 'script') await scripts;
        if (type === 'font') { fontRequests++; await fonts; }
        await route.continue();
      });
      await page.goto(new URL(`/${locale}/tags/`, base).href, { waitUntil: 'commit' });
      const firstWord = page.locator('.tag-word-cloud .tag-item').first();
      await firstWord.waitFor({ state: 'attached' });
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.tag-word-cloud')).display === 'flex');
      await page.waitForTimeout(150);
      assert.equal(await firstWord.isVisible(), false, `${locale}: delayed hydration must not expose the SSR rows`);

      releaseScripts();
      await page.locator('astro-island:not([ssr]) .tag-word-cloud').waitFor({ state: 'attached' });
      await page.waitForTimeout(150);
      assert(fontRequests > 0, 'exercise actual delayed web-font requests');
      assert.equal(await firstWord.isVisible(), false, `${locale}: hydration must still wait for final font metrics`);
      releaseFonts();
      await assertStableEntrance(page, `${locale} cold load`);

      await page.reload({ waitUntil: 'commit' });
      await assertStableEntrance(page, `${locale} refresh`);
      const filter = page.locator('#tag-filter');
      const total = await page.locator('.tag-word-cloud .tag-item').count();
      await filter.fill(await firstWord.getAttribute('data-tag'));
      await page.waitForTimeout(100);
      const matches = await page.locator('.tag-word-cloud > li:not([hidden])').count();
      assert(matches > 0 && matches < total, 'exercise expansion from a filtered subset');
      await page.evaluate(() => { window.tagCloudLoadingFrames = []; });
      await filter.fill('');
      await assertStableEntrance(page, `${locale} expanding filtered results`);

      await filter.fill('no-matching-topic-8b31a5');
      await page.locator('#tag-empty').waitFor();
      await page.waitForTimeout(100);
      await page.evaluate(() => { window.tagCloudLoadingFrames = []; });
      await page.locator('#tag-reset').click();
      await assertStableEntrance(page, `${locale} resetting empty results`);
      assert.deepEqual(errors, [], `${locale}: loading and refreshing must not produce browser errors`);
    } finally {
      releaseScripts(); releaseFonts();
      await context.close();
    }
  }

  for (const javaScriptEnabled of [false, true]) {
    const context = await browser.newContext({ javaScriptEnabled, viewport: { width: 390, height: 900 } });
    try {
      if (javaScriptEnabled) {
        await context.route('**/*', route => route.request().resourceType() === 'script' ? route.abort() : route.continue());
      }
      const page = await context.newPage();
      await page.goto(new URL('/zh/tags/', base).href, { waitUntil: 'domcontentloaded' });
      const firstWord = page.locator('.tag-word-cloud .tag-item').first();
      await firstWord.waitFor({ state: 'visible', timeout: 7000 });
      assert(await firstWord.getAttribute('href'), 'disabled or failed scripts retain ordinary navigable tag links');
      assert.equal(await page.locator('.tag-word-cloud').getAttribute('data-packed'), 'false');
    } finally {
      await context.close();
    }
  }

  // Once a very slow download has exposed the fallback, late hydration must
  // keep that layout instead of creating the original visible jump again.
  const context = await browser.newContext();
  const page = await context.newPage();
  let releaseScripts;
  const scripts = new Promise(resolve => { releaseScripts = resolve; });
  try {
    await page.route('**/*', async route => {
      if (route.request().resourceType() === 'script') await scripts;
      await route.continue();
    });
    await page.goto(new URL('/en/tags/', base).href, { waitUntil: 'commit' });
    const firstWord = page.locator('.tag-word-cloud .tag-item').first();
    await firstWord.waitFor({ state: 'visible', timeout: 7000 });
    const before = await firstWord.boundingBox();
    releaseScripts();
    await page.locator('astro-island:not([ssr]) .tag-word-cloud[data-ready="true"]').waitFor();
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.tag-word-cloud').getAttribute('data-packed'), 'false', 'late hydration preserves the already-visible fallback');
    assert.deepEqual(await firstWord.boundingBox(), before, 'late hydration does not move the already-visible words');
  } finally {
    releaseScripts();
    await context.close();
  }
  console.log('PASS: tag clouds reveal only after packing and fonts; refresh, filtering, disabled scripts and delayed hydration remain stable');
}
