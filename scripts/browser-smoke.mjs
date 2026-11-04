import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { verifyLegacyWorkerRetirement } from './legacy-worker-browser.mjs';
import { verifyRoomAssetCache } from './room/asset-cache-browser.mjs';
import { verifyVideoCache } from './room/video-cache-browser.mjs';

const base = process.env.BASE_URL || 'http://127.0.0.1:4327';
const screenshots = process.env.SMOKE_SCREENSHOT_DIR;
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined });
const url = (path) => new URL(path, base).href;

async function screenshot(page, name) {
  if (!screenshots) return;
  await page.waitForLoadState('load');
  // Navigation snapshots can remain above the new document after URL/load
  // completion. Poll from Node so this also works with JavaScript disabled.
  let settled = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    settled = await page.evaluate(() => !document.getAnimations().some((animation) =>
      animation.playState === 'running' && Number.isFinite(animation.effect?.getComputedTiming().endTime),
    ));
    if (settled) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert(settled, `Finite animations must settle before capturing ${name}`);
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: join(screenshots, `${name}.png`) });
}

async function waitForLinkHitTarget(link) {
  // With JavaScript disabled, page-side RAF polling does not advance. Poll from
  // Node while CSS navigation transitions finish, then use an ordinary click.
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await link.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
    })) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`Navigation link remains blocked: ${await link.getAttribute('href')}`);
}

async function assertVisibleTitle(page) {
  const title = page.getByRole('heading', { level: 1 });
  assert.match(await title.innerText(), /保持好奇/);
  const invisible = await title.evaluate((heading) =>
    [heading, ...heading.querySelectorAll('*')].some((element) => {
      const style = getComputedStyle(element);
      return style.opacity === '0' || style.visibility === 'hidden' || style.display === 'none';
    }),
  );
  assert.equal(invisible, false, 'LO-FI title must be visible without hydration');
}

try {
  await verifyRoomAssetCache();
  await verifyVideoCache();
  await verifyLegacyWorkerRetirement(browser);
  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const noJsPage = await noJs.newPage();
  await noJsPage.goto(url('/lofi/'));
  await assertVisibleTitle(noJsPage);
  await screenshot(noJsPage, 'lofi-no-js');
  const fallbackNav = noJsPage.locator('.no-script-navigation');
  for (const path of ['/lofi/', '/categories/', '/tags/', '/archives/', '/about/', '/']) {
    const link = fallbackNav.locator(`a[href="${path}"]`);
    assert(await link.isVisible(), `navigation to ${path} must be available without JavaScript`);
    if (noJsPage.url() !== url(path)) {
      // Cross-document transitions briefly intercept input. Wait for the actual
      // link to be hit-testable instead of force-clicking through that overlay.
      await waitForLinkHitTarget(link);
      await Promise.all([noJsPage.waitForURL(url(path)), link.click()]);
    }
    assert(await noJsPage.getByRole('heading', { level: 1 }).first().isVisible(), `${path} must remain readable without JavaScript`);
  }
  await noJs.close();
  console.log('PASS: mobile navigation links remain reachable with JavaScript disabled');

  const blockedJs = await browser.newContext();
  await blockedJs.route('**/*', (route) => route.request().resourceType() === 'script' ? route.abort() : route.continue());
  const blockedPage = await blockedJs.newPage();
  await blockedPage.goto(url('/lofi/'));
  await assertVisibleTitle(blockedPage);
  await screenshot(blockedPage, 'lofi-blocked-js');
  await blockedJs.close();
  console.log('PASS: LO-FI title survives disabled JavaScript and failed script requests');

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route('https://giscus.app/**', (route) => route.abort());
  const page = await context.newPage();
  await page.goto(url('/page/2/'));
  await page.getByRole('link', { name: '上一页', exact: true }).click();
  await page.waitForURL(url('/lofi/'));
  console.log('PASS: pagination returns from page 2 to the LO-FI article list');
  if (await page.evaluate(() => document.documentElement.classList.contains('dark'))) {
    await page.locator('#theme-toggle').click();
  }
  await screenshot(page, 'lofi-desktop-light');

  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot(page, 'lofi-mobile-light');
  const menu = page.locator('#menu-toggle');
  await menu.click();
  assert.equal(await menu.getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('#mobile-menu').evaluate((element) => element.inert), false);
  await page.keyboard.press('Escape');
  assert.equal(await menu.getAttribute('aria-expanded'), 'false');
  assert.equal(await menu.evaluate((element) => document.activeElement === element), true);
  await menu.click();
  await page.locator('#mobile-menu').getByRole('link', { name: '关于', exact: true }).click();
  await page.waitForURL(url('/about/'));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  console.log('PASS: mobile navigation opens, closes with Escape, and follows links');

  await page.goto(url('/tags/'));
  const tagFilter = page.getByRole('searchbox', { name: '筛选标签' });
  const tagCount = await page.locator('.tag-item').count();
  const firstTag = await page.locator('.tag-item').first().getAttribute('data-tag');
  await tagFilter.fill(firstTag.toUpperCase());
  const matchingTags = await page.locator('.tag-item:visible').evaluateAll((items) => items.map((item) => item.getAttribute('data-tag')));
  assert(matchingTags.length > 0 && matchingTags.every((tag) => tag.includes(firstTag)), 'tag filtering must find matching topics regardless of case');
  await tagFilter.fill('no-matching-topic-8b31a5');
  assert.equal(await page.locator('.tag-item:visible').count(), 0);
  assert(await page.locator('#tag-empty').isVisible(), 'an empty tag search must explain the absence of results');
  await page.getByRole('button', { name: '清空筛选' }).click();
  assert.equal(await tagFilter.inputValue(), '');
  assert.equal(await page.locator('.tag-item:visible').count(), tagCount);
  assert.equal(await page.locator('#tag-empty').isVisible(), false);
  assert(await tagFilter.evaluate((input) => document.activeElement === input), 'reset must return focus to the filter');
  console.log('PASS: tag filtering handles matches, empty results, and keyboard-friendly reset');

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(url('/posts/agent_dev_tutorial/'));
  const reading = await page.evaluate(() => {
    const prose = document.querySelector('.prose-custom');
    return {
      width: prose.getBoundingClientRect().width,
      bodySize: parseFloat(getComputedStyle(prose.querySelector('p')).fontSize),
      footnoteSize: parseFloat(getComputedStyle(prose.querySelector('[data-footnotes] p')).fontSize),
      fonts: [getComputedStyle(prose).fontFamily, getComputedStyle(document.querySelector('article h1')).fontFamily],
    };
  });
  assert(reading.width >= 760, 'a 1280px desktop must leave a broad reading column instead of squeezing the article beside its directory');
  assert.equal(await page.locator('.reading-bookmarks').isVisible(), false, 'the desktop directory must collapse before it crowds the reading column');
  const compactToc = page.locator('.notebook-mobile-toc');
  await compactToc.locator('summary').click();
  assert(await compactToc.locator('.toc-link').first().isVisible(), 'the collapsed directory must remain reachable');
  await compactToc.locator('summary').click();
  for (const font of reading.fonts) {
    assert.match(font, /sans-serif/, 'article headings and prose must use the surrounding sans-serif visual language');
    assert.doesNotMatch(font, /Songti|Noto Serif|STSong|(?:^|,\s*)serif(?:,|$)/i);
  }
  assert(reading.footnoteSize < reading.bodySize, 'footnotes must remain subordinate to the article text');
  await screenshot(page, 'article-readable-desktop');
  console.log('PASS: common desktop widths retain a broad sans-serif article and smaller footnotes');

  const imageButton = page.locator('.image-zoom').first();
  // Lazy images can initially have zero height; move the real button into view
  // before decoding and clicking, matching a reader scrolling through the post.
  await imageButton.evaluate((button) => button.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await imageButton.locator('img').evaluate((image) => image.decode());
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await imageButton.click();
    await page.waitForFunction(() => {
      const viewer = document.getElementById('image-viewer');
      const bounds = document.getElementById('image-viewer-image').getBoundingClientRect();
      return viewer.open && bounds.width > 0 && Math.abs(bounds.x + bounds.width / 2 - innerWidth / 2) <= 2 && Math.abs(bounds.y + bounds.height / 2 - innerHeight / 2) <= 2;
    });
    const image = await page.locator('#image-viewer-image').boundingBox();
    assert(image && image.x >= 0 && image.y >= 0 && image.x + image.width <= width + 2 && image.y + image.height <= 902, 'the enlarged image must fit inside the viewport');
    await screenshot(page, `article-image-preview-${width}`);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#image-viewer').evaluate((dialog) => dialog.open), false, 'Escape must close image preview');
  }
  console.log('PASS: real article images open centered within desktop and mobile viewports');

  await page.setViewportSize({ width: 390, height: 844 });
  const codeScroll = await page.locator('.prose-custom pre').evaluateAll((blocks) => {
    const block = blocks.find((item) => item.scrollWidth > item.clientWidth);
    if (!block) return null;
    block.scrollLeft = block.scrollWidth;
    return { width: block.clientWidth, scrollWidth: block.scrollWidth, scrollLeft: block.scrollLeft, whiteSpace: getComputedStyle(block.querySelector('code')).whiteSpace, overflow: getComputedStyle(block).overflowX };
  });
  assert(codeScroll, 'the fixture must exercise a code block wider than the mobile reading column');
  assert.match(codeScroll.overflow, /auto|scroll/);
  assert.equal(codeScroll.whiteSpace, 'pre', 'code must preserve its original lines');
  assert(Math.abs(codeScroll.scrollLeft - (codeScroll.scrollWidth - codeScroll.width)) <= 2, 'a reader must be able to scroll to the end of a long code line');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'wide code must scroll internally without widening the page');
  // Keep the OS clipboard untouched while exercising the real copy control.
  await page.evaluate(() => {
    navigator.clipboard.writeText = async (text) => { window.__smokeCopiedCode = text; };
  });
  const firstCode = page.locator('.code-block').first();
  const expectedCode = await firstCode.locator('pre').innerText();
  await firstCode.getByRole('button', { name: '复制代码' }).click();
  await page.waitForFunction(() => typeof window.__smokeCopiedCode === 'string');
  assert.equal(await page.evaluate(() => window.__smokeCopiedCode), expectedCode);
  assert.equal(await firstCode.getByRole('button', { name: '复制代码' }).innerText(), '已复制');
  console.log('PASS: mobile code retains its formatting, scrolls to the end, and remains copyable');

  await page.setViewportSize({ width: 1536, height: 900 });
  await page.goto(url('/posts/agent_dev_tutorial/'));
  await page.evaluate(() => scrollTo({ top: 1200, behavior: 'instant' }));
  const toc = await page.locator('.toc-scroll').boundingBox();
  assert(toc && toc.y >= 80 && toc.y <= 110, 'desktop article directory must remain visible beside the reading sheet');
  await screenshot(page, 'article-toc');
  console.log('PASS: desktop article directory remains visible while scrolling');

  await page.goto(url('/posts/cpp_pointer01/'));
  const formula = page.locator('.katex').first();
  await formula.waitFor({ state: 'visible' });
  assert.equal(await page.locator('.katex-error').count(), 0);
  assert.match(await formula.evaluate((element) => getComputedStyle(element).fontFamily), /KaTeX_Main/);
  assert(await page.evaluate(async () => (await document.fonts.load('16px KaTeX_Main')).length > 0), 'math fonts must load from the production CSS');
  console.log('PASS: production math includes KaTeX styling and loaded fonts');

  await page.goto(url('/search/'));
  await page.locator('.pagefind-ui__search-input').fill('指针');
  await page.locator('.pagefind-ui__result').first().waitFor({ state: 'visible' });
  const result = await page.locator('.pagefind-ui__result-link').first().getAttribute('href');
  assert(new URL(result, base).pathname.startsWith('/posts/'), 'search results must link to articles');
  await screenshot(page, 'search-results');
  console.log('PASS: production Pagefind search returns article results');
  await context.close();
} finally {
  await browser.close();
}
