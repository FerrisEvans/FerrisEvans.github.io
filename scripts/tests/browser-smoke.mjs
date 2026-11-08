import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { verifyLegacyWorkerRetirement } from './legacy-worker-browser.mjs';
import { verifyRoomAssetCache } from './room/asset-cache-browser.mjs';
import { verifyHomeLoading } from './island/home-loading-browser.mjs';

const base = process.env.BASE_URL || 'http://127.0.0.1:4327';
const screenshots = process.env.SMOKE_SCREENSHOT_DIR;
const pageOnly = process.env.SMOKE_PAGE_ONLY === '1';
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

async function assertVisibleTitle(page, pattern) {
  const title = page.getByRole('heading', { level: 1, name: pattern });
  assert.match(await title.innerText(), pattern);
  const invisible = await title.evaluate((heading) =>
    [heading, ...heading.querySelectorAll('*')].some((element) => {
      const style = getComputedStyle(element);
      return style.opacity === '0' || style.visibility === 'hidden' || style.display === 'none';
    }),
  );
  assert.equal(invisible, false, 'page title must be visible without hydration');
}

async function assertStaticEntrances(page) {
  const sceneRequests = [];
  const watch = request => { if (/\/island\/.*\.glb(?:\.bin)?(?:[?#]|$)/.test(request.url())) sceneRequests.push(request.url()); };
  page.on('request', watch);
  await page.goto(url('/zh/'));
  await page.waitForTimeout(500);
  page.off('request', watch);
  assert.deepEqual(sceneRequests, [], 'disabled or blocked JavaScript leaves the static courtyard cover and reading links usable');
  assert.equal(await page.getByRole('heading', { level: 1, name: /未尽/ }).count(), 1, 'homepage retains an accessible name without a visible title overlay');
  assert.equal(await page.locator('#island-root').count(), 1, 'the actual courtyard belongs to the homepage');
  assert.equal(await page.locator('#home-enter-room').count(), 0, 'there is no separate exploration gateway');
  const readingLink = page.locator('#island-directory a[href="/zh/notes/"]').first();
  assert(await readingLink.isVisible(), 'the static fallback directory exposes the reading route');
  await readingLink.click();
  await page.waitForURL(url('/zh/notes/'));
  await assertVisibleTitle(page, /^笔记$/);
}

try {
  await verifyHomeLoading(browser, base);
  if (process.env.SMOKE_SKIP_INFRA !== '1') {
    await verifyRoomAssetCache();
    await verifyLegacyWorkerRetirement(browser);
  }
  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const noJsPage = await noJs.newPage();
  await assertStaticEntrances(noJsPage);
  await screenshot(noJsPage, 'lofi-no-js');
  const fallbackNav = noJsPage.locator('.no-script-navigation');
  for (const path of ['/zh/notes/', '/zh/categories/', '/zh/tags/', '/zh/archives/', '/zh/about/', '/zh/']) {
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
  await assertStaticEntrances(blockedPage);
  await screenshot(blockedPage, 'lofi-blocked-js');
  await blockedJs.close();
  console.log('PASS: homepage entrances and blog title survive disabled JavaScript and failed script requests');

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (pageOnly) await context.route('**/island/*.glb*', route => route.abort());
  await context.route('https://giscus.app/**', (route) => route.abort());
  const page = await context.newPage();
  const primaryNavigation = ['/zh/', '/zh/notes/', '/zh/categories/', '/zh/tags/', '/zh/archives/', '/zh/about/'];
  for (const path of ['/zh/', '/zh/notes/', '/zh/tags/', '/zh/archives/', '/zh/about/', '/zh/posts/agent_dev_tutorial/']) {
    await page.goto(url(path));
    await page.locator('.site-header').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.site-header').count(), 1, `${path} uses the shared site header`);
    const brands = page.locator('.island-brand-identity');
    assert(await brands.count() >= 2, 'header and footer share the actual SVG logo');
    for (const brand of await brands.all()) {
      assert.equal(await brand.getByRole('img', { name: '未尽', exact: true }).count(), 1, 'the shared wordmark has one accessible brand name');
      assert.equal(await brand.locator('svg[aria-hidden="true"]').count(), 1, 'decorative vector geometry does not announce the brand twice');
      assert.equal(await brand.locator('svg text, .island-brand-name').count(), 0, 'the visible wordmark is custom geometry, not ordinary font text');
      assert(await brand.locator('.weijin-lettering path').count() > 0, 'the wordmark contains editable vector geometry');
    }

    assert.equal(await page.locator('.site-header > .nav-bar > .island-brand').getAttribute('href'), '/zh/', 'the brand always returns to the actual homepage');
    assert.deepEqual(await page.locator('.desktop-navigation > a').evaluateAll(links => links.map(link => link.getAttribute('href'))), primaryNavigation, 'primary routes and ordering are consistent across experiences');
    assert.equal(await page.locator('.desktop-navigation details').count(), 0, 'all six primary destinations are directly visible');
    for (const selector of ['body', '.desktop-navigation > a']) {
      assert.match(await page.locator(selector).first().evaluate(element => getComputedStyle(element).cursor), /animal-island-default\.svg/, `${path} shares the native theme cursor`);
    }
  }
  for (const [legacy, current] of [['/lofi/', '/zh/notes/'], ['/page/1/', '/zh/notes/'], ['/page/2/', '/zh/notes/page/2/'], ['/room/', '/zh/'], ['/island/', '/zh/']]) {
    await page.goto(url(`${legacy}?source=legacy-check#about`));
    await page.waitForURL(url(`${current}?source=legacy-check#about`));
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), new URL(current, 'https://ferrisevans.github.io').href);
  }
  console.log('PASS: six direct shared navigation links, canonical homepage/notes routes and legacy aliases preserve query/hash');
  await page.goto(url('/zh/notes/page/2/'));
  await page.getByRole('link', { name: '上一页', exact: true }).click();
  await page.waitForURL(url('/zh/notes/'));
  console.log('PASS: notes pagination returns from page 2 to the canonical article list');
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
  await page.waitForURL(url('/zh/about/'));
  const currentAvatar = page.locator('.profile-photo img');
  await currentAvatar.evaluate(image => image.decode());
  assert.match(await currentAvatar.getAttribute('src'), /about-avatar/, 'about uses the selected transparent girl avatar');
  assert.match(await currentAvatar.getAttribute('alt'), /卡通/, 'the illustration is described as a cartoon, not the reference photograph');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  console.log('PASS: mobile navigation opens, closes with Escape, and follows links');

  await page.goto(url('/zh/tags/'));
  await page.locator('astro-island:not([ssr]) .tag-word-cloud').waitFor();
  const cloudMarks = page.locator('.tag-word-cloud .tag-item');
  assert(await cloudMarks.count() > 0, 'tag word cloud uses published article tags');
  const tagLinks = await cloudMarks.evaluateAll(links => links.map(link => link.getAttribute('href')));
  assert.equal(new Set(tagLinks).size, tagLinks.length, 'one tag has one cloud link, without a repeated list');
  assert.equal(await page.locator('[data-chart-mark], .tag-list').count(), 0, 'there is no second directional chart or repeated tag listing');
  assert.equal(await page.locator('.tag-word-cloud .tag-token-body').count(), 0, 'the tags page contains words, without the keyword panel capsule component');
  for (const dark of [false, true]) {
    if (await page.locator('html').evaluate(element => element.classList.contains('dark')) !== dark) await page.locator('#theme-toggle').click();
    await cloudMarks.first().hover();
    const wordStyles = await cloudMarks.evaluateAll(links => links.flatMap(link => [link, link.querySelector('.tag-word')].map(element => {
      if (!element) return null;
      const style = getComputedStyle(element);
      return { text: element.textContent, background: style.backgroundColor, image: style.backgroundImage,
        borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
        radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius],
        shadow: style.boxShadow, color: style.color };
    })));
    for (const style of wordStyles) {
      assert(style, 'every cloud link contains its plain text span');
      assert.equal(style.background, 'rgba(0, 0, 0, 0)', `tag word background is transparent in ${dark ? 'dark' : 'light'} mode: ${style.text}`);
      assert.equal(style.image, 'none');
      assert(style.borders.every(width => parseFloat(width) === 0), 'tag words have no capsule border');
      assert(style.radii.every(radius => parseFloat(radius) === 0), 'tag words have no capsule corner radius');
      assert.equal(style.shadow, 'none', 'tag words have no capsule shadow');
    }
    assert(new Set(wordStyles.map(style => style.color)).size > 1, 'the plain word cloud retains its varied text colors');
  }
  await page.locator('#theme-toggle').click();
  console.log('PASS: tag cloud computed styles are plain colored text without backgrounds, borders, rounded corners or shadows in light/dark modes');
  assert.match(await cloudMarks.first().getAttribute('aria-label'), /\d+ 篇笔记/);
  await cloudMarks.first().focus();
  await page.keyboard.press('ArrowRight');
  assert(await cloudMarks.first().evaluate(element => document.activeElement === element), 'arrow keys do not implement a separate directional navigation mode');
  await page.keyboard.press('Tab');
  const focusedHref = await page.locator('.tag-word-cloud .tag-item:focus').getAttribute('href');
  assert(focusedHref && focusedHref !== tagLinks[0], 'native Tab reaches the next ordinary tag link');
  await page.keyboard.press('Enter'); await page.waitForURL(url(focusedHref));
  await page.goto(url('/zh/tags/'));
  await page.locator('astro-island:not([ssr]) .tag-word-cloud').waitFor();
  const firstColor = await cloudMarks.first().getAttribute('data-token-color');
  await page.reload();
  await page.waitForFunction(before => document.querySelector('.tag-word-cloud .tag-item')?.getAttribute('data-token-color') !== before, firstColor);
  assert(await cloudMarks.first().getAttribute('data-token-color'), 'reopening randomizes from the shared tag palette');
  console.log('PASS: one tag cloud uses native Tab links, accessible counts and a fresh color assignment on reopening');
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
  await page.goto(url('/zh/posts/agent_dev_tutorial/'));
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
  const sourceCode = firstCode.locator('pre > code');
  const expectedCode = await sourceCode.textContent();
  const lineNumbers = await sourceCode.locator(':scope > .line').evaluateAll(lines => lines.map(line => {
    const marker = line.firstElementChild;
    return {
      marker: marker?.classList.contains('code-line-number'),
      number: marker?.getAttribute('data-line-number'),
      hidden: marker?.getAttribute('aria-hidden'),
      text: marker?.textContent,
      display: marker ? getComputedStyle(marker, '::before').content : null,
    };
  }));
  assert(lineNumbers.length > 0, 'ordinary code blocks have line numbers');
  for (const [index, line] of lineNumbers.entries()) {
    assert(line.marker);
    assert.equal(line.number, String(index + 1));
    assert.equal(line.hidden, 'true');
    assert.equal(line.text, '');
    assert.equal(line.display, JSON.stringify(String(index + 1)), 'line number is displayed by CSS');
  }
  const copy = firstCode.getByRole('button', { name: '复制代码', exact: true });
  assert.equal((await copy.innerText()).trim(), '', 'ordinary copy control is icon-only');
  const copyIcons = copy.locator('svg');
  assert(await copyIcons.count() > 0);
  for (const icon of await copyIcons.all()) assert.equal(await icon.getAttribute('aria-hidden'), 'true');
  await copy.click();
  await page.waitForFunction(() => typeof window.__smokeCopiedCode === 'string');
  assert.equal(await page.evaluate(() => window.__smokeCopiedCode), expectedCode, 'copy preserves exact source whitespace without line numbers');
  assert.equal(await copy.getAttribute('data-copied'), 'true');
  assert.equal(await copy.getAttribute('title'), '已复制');
  assert.equal(await copy.getAttribute('aria-label'), '复制代码');
  assert.equal((await copy.innerText()).trim(), '', 'successful copying does not add visible text');
  console.log('PASS: mobile code retains its formatting, scrolls to the end, and copies without decorative line numbers');

  await page.setViewportSize({ width: 1536, height: 900 });
  await page.goto(url('/zh/posts/agent_dev_tutorial/'));
  await page.evaluate(() => scrollTo({ top: 1200, behavior: 'instant' }));
  const toc = await page.locator('.toc-scroll').boundingBox();
  assert(toc && toc.y >= 80 && toc.y <= 110, 'desktop article directory must remain visible beside the reading sheet');
  await screenshot(page, 'article-toc');
  console.log('PASS: desktop article directory remains visible while scrolling');

  await page.goto(url('/zh/posts/cpp_pointer01/'));
  const formula = page.locator('.katex').first();
  await formula.waitFor({ state: 'visible' });
  assert.equal(await page.locator('.katex-error').count(), 0);
  assert.match(await formula.evaluate((element) => getComputedStyle(element).fontFamily), /KaTeX_Main/);
  assert(await page.evaluate(async () => (await document.fonts.load('16px KaTeX_Main')).length > 0), 'math fonts must load from the production CSS');
  console.log('PASS: production math includes KaTeX styling and loaded fonts');

  await page.goto(url('/zh/search/'));
  await page.locator('.pagefind-ui__search-input').fill('指针');
  await page.locator('.pagefind-ui__result').first().waitFor({ state: 'visible' });
  const result = await page.locator('.pagefind-ui__result-link').first().getAttribute('href');
  assert(new URL(result, base).pathname.startsWith('/zh/posts/'), 'search results must link to articles');
  await screenshot(page, 'search-results');
  console.log('PASS: production Pagefind search returns article results');
  await context.close();
} finally {
  await browser.close();
}
