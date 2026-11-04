#!/usr/bin/env node
/** Verify the three About guides against an already-running local preview. */
import assert from 'node:assert/strict';
import { mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const base = process.env.BASE_URL || 'http://127.0.0.1:4327';
const screenshotDirectory = process.env.SCREENSHOT_DIR
  ? resolve(process.env.SCREENSHOT_DIR)
  : join(tmpdir(), 'praxis-guide-browser');
const paths = ['/about/python-zen/', '/about/writing/', '/about/markdown/'];
const pageErrors = [];
const consoleErrors = [];

async function exists(path) {
  try { await stat(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function visit(page, path) {
  const response = await page.goto(new URL(path, base).href);
  assert.equal(response?.status(), 200, `${path} is available`);
  await settleImages(page);
}

async function settleImages(page) {
  await page.evaluate(async () => {
    for (const image of document.querySelectorAll('article img')) image.loading = 'eager';
    await Promise.all([...document.querySelectorAll('article img')].map(image => image.decode().catch(() => {})));
    await document.fonts.ready;
  });
}

function observe(page) {
  page.on('pageerror', error => pageErrors.push({ url: page.url(), message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push({ url: page.url(), message: message.text() });
  });
}

async function screenshot(page, name) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    scrollTo({ top: 0, behavior: 'instant' });
    for (const bookmarks of document.querySelectorAll('.guide-bookmarks')) bookmarks.scrollTop = 0;
  });
  for (let attempt = 0; attempt < 40; attempt++) {
    const settled = await page.evaluate(() => {
      const first = document.querySelector('.prose-custom h2[id]');
      return [...document.querySelectorAll('.toc-link.active')].every(link =>
        first && first.getBoundingClientRect().top <= 140 && link.getAttribute('href') === `#${first.id}`);
    });
    if (settled) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  await page.screenshot({ path: join(screenshotDirectory, `${name}.png`), fullPage: true, animations: 'disabled' });
}

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert(dimensions.scrollWidth <= dimensions.width + 1, `${label} overflows: ${JSON.stringify(dimensions)}`);
}

async function assertAnchorTargets(page) {
  const anchors = await page.evaluate(() => [...document.querySelectorAll('main a[href]')].flatMap(link => {
    const url = new URL(link.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname || url.hash.length < 2) return [];
    const id = decodeURIComponent(url.hash.slice(1));
    return [{ href: link.getAttribute('href'), found: Boolean(document.getElementById(id)) }];
  }));
  assert(anchors.length > 0, 'guide exposes internal heading links');
  for (const anchor of anchors) assert(anchor.found, `missing destination for ${anchor.href}`);
}

async function clickAnchor(page, link) {
  const href = await link.getAttribute('href');
  const target = new URL(href, page.url());
  await link.click();
  await page.waitForURL(url => url.pathname === target.pathname && decodeURIComponent(url.hash) === decodeURIComponent(target.hash));
  assert(await page.evaluate(hash => Boolean(document.getElementById(decodeURIComponent(hash.slice(1)))), target.hash));
}

async function clickWithoutJavaScript(link) {
  // Cross-document view transitions may still cover the newly loaded page.
  // Poll from Node because page-side RAF polling stops with JavaScript disabled.
  await link.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  for (let attempt = 0; attempt < 100; attempt++) {
    const reachable = await link.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
    });
    if (reachable) { await link.click(); return; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.fail(`No-JS navigation remains blocked: ${await link.getAttribute('href')}`);
}

async function assertGuideNavigation(page, path) {
  assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1, `${path} has one H1`);
  assert.equal(await page.locator('article[data-pagefind-body]').count(), 1, `${path} exposes its searchable article body`);
  const related = page.getByRole('navigation', { name: '相关阅读' });
  assert.equal(await related.count(), 1, 'related guides have a named navigation region');
  for (const other of paths.filter(value => value !== path)) {
    assert(await related.locator(`a[href="${other}"]`).count() > 0, `${path} links to ${other}`);
  }
  assert(await page.getByRole('link', { name: /返回关于作者/ }).count() > 0, 'guide can return to About');
  await assertAnchorTargets(page);
}

async function assertAboutCards(page) {
  const cards = page.locator('.about-guides .guide-card');
  assert.equal(await cards.count(), 3, 'About has three guide cards');
  assert(await page.evaluate(() => {
    const profile = document.querySelector('.profile-note');
    const guides = document.querySelector('.about-guides');
    const notes = document.querySelector('.about-note-grid');
    return Boolean(profile && guides && notes &&
      (profile.compareDocumentPosition(guides) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      (guides.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING));
  }), 'guide cards occupy the former interests position between author profile and principles');
  for (const [viewport, size] of [
    ['desktop', { width: 1440, height: 1000 }],
    ['mobile', { width: 390, height: 844 }],
  ]) {
    await page.setViewportSize(size);
    const boxes = await Promise.all((await cards.all()).map(card => card.boundingBox()));
    assert(boxes.every(Boolean));
    if (viewport === 'desktop') assert(Math.abs(boxes[0].y - boxes[2].y) <= 1, 'desktop cards share one row');
    else assert(boxes[0].y + boxes[0].height <= boxes[1].y && boxes[1].y + boxes[1].height <= boxes[2].y, 'mobile cards form a single column');
    for (const dark of [false, true]) {
      await setTheme(page, dark);
      await assertNoOverflow(page, `About ${viewport} ${dark ? 'dark' : 'light'}`);
      await screenshot(page, `about-${viewport}-${dark ? 'dark' : 'light'}`);
      if (viewport === 'desktop' && !dark) {
        await page.locator('.about-guides').screenshot({ path: join(screenshotDirectory, 'about-cards-desktop.png'), animations: 'disabled' });
      }
    }
  }
}

async function setTheme(page, dark) {
  if (await page.evaluate(() => document.documentElement.classList.contains('dark')) !== dark) {
    await page.locator('#theme-toggle').click();
  }
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), dark);
}

async function assertResponsiveGuide(page, path) {
  const name = path.split('/').filter(Boolean).at(-1);
  for (const [viewport, size] of [
    ['desktop', { width: 1440, height: 1000 }],
    ['mobile', { width: 390, height: 844 }],
  ]) {
    await page.setViewportSize(size);
    const desktop = page.locator('.guide-toc-desktop');
    const mobile = page.locator('details.guide-toc-mobile');
    assert.equal(await desktop.isVisible(), viewport === 'desktop', 'desktop ToC matches viewport');
    assert.equal(await mobile.isVisible(), viewport === 'mobile', 'mobile ToC matches viewport');
    if (viewport === 'mobile') {
      if (!await mobile.evaluate(element => element.open)) await mobile.locator(':scope > summary').click();
      await clickAnchor(page, mobile.locator('a[href*="#"]').first());
    } else {
      const [tocBox, articleBox] = await Promise.all([
        desktop.boundingBox(), page.locator('article[data-pagefind-body]').boundingBox(),
      ]);
      assert(tocBox && articleBox && tocBox.x >= articleBox.x + articleBox.width, 'desktop ToC sits beside the article without overlap');
      await clickAnchor(page, desktop.locator('a[href*="#"]').first());
      await clickAnchor(page, desktop.locator('a[href*="#"]').last());
    }
    for (const dark of [false, true]) {
      await setTheme(page, dark);
      if (path === '/about/markdown/') {
        await assertNativeMarkdownReading(page, { checkKeyboardScroll: viewport === 'mobile' });
        await assertCrossReferences(page);
        if (!dark) {
          await page.mouse.move(0, 0);
          await page.screenshot({ path: join(screenshotDirectory, `markdown-${viewport}-cross-references.png`), animations: 'disabled' });
        }
      }
      await assertNoOverflow(page, `${path} ${viewport} ${dark ? 'dark' : 'light'}`);
      await screenshot(page, `${name}-${viewport}-${dark ? 'dark' : 'light'}`);
      if (path === '/about/markdown/' && !dark) {
        if (viewport === 'mobile') await page.locator('article .rehype-code-group').first().scrollIntoViewIfNeeded();
        await page.screenshot({ path: join(screenshotDirectory, `markdown-${viewport}-detail.png`), animations: 'disabled' });
      }
      if (path === '/about/markdown/') {
        await page.locator('article .rehype-code-group').first().scrollIntoViewIfNeeded();
        await page.screenshot({ path: join(screenshotDirectory, `markdown-${viewport}-code-${dark ? 'dark' : 'light'}.png`), animations: 'disabled' });
      }
    }
  }
}

async function assertSelected(tab) {
  assert.equal(await tab.getAttribute('aria-selected'), 'true');
  assert.equal(await tab.getAttribute('tabindex'), '0');
}

async function assertLineNumbers(code) {
  const lines = await code.locator(':scope > .line').evaluateAll(elements => elements.map(line => {
    const marker = line.firstElementChild;
    return {
      marker: marker?.classList.contains('code-line-number'),
      number: marker?.getAttribute('data-line-number'),
      hidden: marker?.getAttribute('aria-hidden'),
      text: marker?.textContent,
      display: marker ? getComputedStyle(marker, '::before').content : null,
      width: marker?.getBoundingClientRect().width,
    };
  }));
  assert(lines.length > 0, 'highlighted code exposes source lines');
  for (const [index, line] of lines.entries()) {
    assert(line.marker, 'line number precedes the syntax tokens');
    assert.equal(line.number, String(index + 1), 'each code panel numbers continuously from 1');
    assert.equal(line.hidden, 'true', 'decorative numbers are hidden from assistive technology');
    assert.equal(line.text, '', 'line number marker does not change the code text');
    assert.equal(line.display, JSON.stringify(String(index + 1)), 'line number is visibly rendered by CSS');
    assert(line.width > 0, 'line number occupies a visible gutter');
  }
}

async function assertCodeGroup(page) {
  const groups = page.locator('article .rehype-code-group');
  assert.equal(await groups.count(), 1, 'syntax guide has one two-language code group');
  const group = groups.first();
  const tabs = group.getByRole('tab');
  assert.equal(await tabs.count(), 2);
  await assertSelected(tabs.nth(0));
  await assertLineNumbers(group.getByRole('tabpanel').locator('pre > code'));
  await tabs.nth(1).click();
  await assertSelected(tabs.nth(1));
  await assertLineNumbers(group.getByRole('tabpanel').locator('pre > code'));
  assert.equal(await group.getByRole('tabpanel').count(), 1, 'only the selected panel is exposed');
  for (const [key, index] of [['Home', 0], ['ArrowRight', 1], ['ArrowRight', 0], ['End', 1], ['ArrowLeft', 0]]) {
    await page.keyboard.press(key);
    const tab = tabs.nth(index);
    await assertSelected(tab);
    assert(await tab.evaluate(element => document.activeElement === element), `${key} moves focus and selection together`);
  }
  await tabs.nth(1).click();
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async text => { window.__guideCopied = text; } },
  }));
  const expected = await group.getByRole('tabpanel').locator('pre > code').textContent();
  assert(expected.includes('\n') && /\n {4}\S/.test(expected), 'sample exercises source newlines and indentation');
  const copy = group.getByRole('button', { name: '复制代码', exact: true });
  assert.equal((await copy.innerText()).trim(), '', 'copy control displays an icon without text');
  const icon = copy.locator('svg');
  assert(await icon.count() > 0);
  for (const svg of await icon.all()) assert.equal(await svg.getAttribute('aria-hidden'), 'true');
  await copy.click();
  await page.waitForFunction(() => typeof window.__guideCopied === 'string');
  assert.equal(await page.evaluate(() => window.__guideCopied), expected, 'copy preserves exact source whitespace without decorative line numbers');
  assert.equal(await copy.getAttribute('data-copied'), 'true');
  assert.equal(await copy.getAttribute('title'), '已复制');
  assert.equal(await copy.getAttribute('aria-label'), '复制代码', 'copy control keeps a stable accessible name');
  assert.equal((await copy.innerText()).trim(), '', 'success feedback remains icon-only');
  const color = await tabs.nth(1).evaluate(element => getComputedStyle(element).backgroundColor);
  await setTheme(page, !await page.evaluate(() => document.documentElement.classList.contains('dark')));
  await page.waitForFunction(previous => getComputedStyle(document.querySelector('article .rehype-code-group .rcg-tab.active')).backgroundColor !== previous, color, { timeout: 2_000 });
}

async function assertMarkdownFeatures(page) {
  const article = page.locator('article[data-pagefind-body]');
  const alerts = article.locator('.markdown-alert');
  assert.equal(await alerts.count(), 5, 'all five supported alert types have rendered examples');
  for (const type of ['note', 'tip', 'important', 'warning', 'caution']) {
    assert.equal(await article.locator(`.markdown-alert-${type}`).count(), 1);
  }
  assert(await article.locator('kbd').count() > 0);
  assert(await article.locator('.katex-display').count() > 0);
  assert.equal(await article.locator('.katex-error').count(), 0);
  assert.match(await article.locator('.katex').first().evaluate(element => getComputedStyle(element).fontFamily), /KaTeX_Main/, 'KaTeX stylesheet applies');
  assert(await page.evaluate(async () => (await document.fonts.load('16px KaTeX_Main')).length > 0), 'math font loads');
  const references = article.locator('a[data-footnote-ref]');
  assert.equal(await references.count(), 1, 'the separate footnote example remains a footnote');
  assert.equal(await article.locator('#user-content-fn-energy-symbols').count(), 0, 'formula references no longer use a footnote destination');
  for (const reference of await references.all()) {
    const href = await reference.getAttribute('href');
    await clickAnchor(page, reference);
    const note = page.locator(`[id=${JSON.stringify(decodeURIComponent(href.slice(1)))}]`);
    await clickAnchor(page, note.locator('a[data-footnote-backref]').first());
  }
}

async function assertNativeMarkdownReading(page, { checkKeyboardScroll = false, noJavaScript = false } = {}) {
  const prose = page.locator('article[data-pagefind-body] .prose-custom');
  const tasks = prose.getByRole('checkbox');
  const taskStates = () => tasks.evaluateAll(inputs => inputs.map(input => ({
    disabled: input.disabled, checked: input.checked, authored: input.hasAttribute('checked'),
  })));
  const originalTasks = await taskStates();
  assert(originalTasks.length >= 2, 'task list includes checked and unchecked examples');
  assert(originalTasks.every(task => task.disabled && task.checked === task.authored), 'task statuses remain disabled and match Markdown');
  assert(originalTasks.some(task => task.checked) && originalTasks.some(task => !task.checked));

  const disclosure = prose.locator('details').first();
  assert.equal(await disclosure.count(), 1, 'the document has a native disclosure example distinct from its mobile ToC');
  const summary = disclosure.locator(':scope > summary');
  const content = disclosure.locator(':scope > p').first();
  const clickSummary = () => noJavaScript ? clickWithoutJavaScript(summary) : summary.click();
  if (await disclosure.evaluate(element => element.open)) await clickSummary();
  assert.equal(await content.isVisible(), false, 'closed disclosure hides its body');
  await clickSummary();
  assert(await disclosure.evaluate(element => element.open), 'clicking the summary expands its native details');
  assert(await content.isVisible(), 'expanded disclosure exposes its Markdown body');
  await clickSummary();
  assert.equal(await disclosure.evaluate(element => element.open), false, 'clicking again collapses the body');
  await summary.focus();
  await page.keyboard.press('Enter');
  assert(await disclosure.evaluate(element => element.open), 'Enter expands the focused summary');
  assert(await content.isVisible());
  await page.keyboard.press('Space');
  assert.equal(await disclosure.evaluate(element => element.open), false, 'Space collapses the focused summary');
  assert(await summary.evaluate(element => document.activeElement === element), 'disclosure keyboard activation preserves focus');

  const tables = prose.getByRole('table');
  const regions = prose.locator('.prose-table-scroll');
  assert(await tables.count() > 0, 'GFM still renders native tables');
  assert.equal(await regions.count(), await tables.count(), 'each table has one independent scrolling region');
  let overflowingRegion;
  for (const region of await regions.all()) {
    assert.equal(await region.getAttribute('tabindex'), '0', 'table scrolling region is keyboard focusable');
    assert.equal(await region.getAttribute('role'), 'region');
    assert((await region.getAttribute('aria-label'))?.trim(), 'table scrolling region has an accessible name');
    const table = region.locator(':scope > table');
    assert.equal(await table.count(), 1, 'scrolling wrapper preserves the native table');
    assert(await table.locator(':scope > thead > tr > th').count() > 0, 'table retains column-header semantics');
    assert(await table.locator(':scope > tbody > tr > td').count() > 0, 'table retains body-cell semantics');
    if (await region.evaluate(element => element.scrollWidth > element.clientWidth)) overflowingRegion ??= region;
  }
  const alignments = await prose.locator('th[align], td[align]').evaluateAll(cells => cells.map(cell => ({
    authored: cell.getAttribute('align'), rendered: getComputedStyle(cell).textAlign,
  })));
  assert(alignments.length >= 3, 'table demonstrates explicit column alignments');
  for (const { authored, rendered } of alignments) assert.equal(rendered, authored, 'authored GFM alignment applies to headers and data cells');
  if (checkKeyboardScroll) {
    assert(overflowingRegion, 'the narrow viewport exercises horizontal table scrolling');
    await overflowingRegion.evaluate(element => { element.scrollLeft = 0; });
    await overflowingRegion.focus();
    assert(await overflowingRegion.evaluate(element => document.activeElement === element));
    await page.keyboard.press('ArrowRight');
    for (let attempt = 0; attempt < 40; attempt++) {
      if (await overflowingRegion.evaluate(element => element.scrollLeft > 0)) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert(await overflowingRegion.evaluate(element => element.scrollLeft > 0), 'ArrowRight scrolls the focused table region');
    await overflowingRegion.evaluate(element => { element.scrollLeft = 0; });
  }

  assert.equal(await prose.locator('hr').count(), 1, 'the thematic-break example remains an hr');
  assert.equal(await prose.getByRole('separator').count(), 1, 'the thematic break retains accessible separator semantics');
  assert(await prose.getByRole('separator').isVisible());
  assert.deepEqual(await taskStates(), originalTasks, 'reading and keyboard interactions do not change authored task states');
  await assertNoOverflow(page, `native Markdown ${noJavaScript ? 'without JavaScript' : 'with JavaScript'}`);
}

async function assertCrossReferences(page, { noJavaScript = false } = {}) {
  const article = page.locator('article[data-pagefind-body]');
  assert.equal(await article.locator('.numbered-reference').count(), 2, 'definition and equation share one numbered sequence');
  for (const [index, id] of ['xref-idempotency', 'xref-energy'].entries()) {
    const target = article.locator(`#${id}`);
    assert.equal(await target.count(), 1, `stable label ${id} is unique`);
    assert.equal(await target.locator(':scope > a.reference-number').textContent(), `(${index + 1})`, 'number is real HTML text');
    assert.equal(await target.locator(':scope > a.reference-number').getAttribute('href'), `#${id}`, 'number is a permanent link to the definition');
    assert.equal(await target.evaluate(element => Boolean(element.closest('[data-footnotes], .footnotes'))), false, 'definition stays in the article body');
    assert((await target.locator('.numbered-content').innerText()).trim().length > 0, 'numbered block retains its definition');
    if (id === 'xref-energy') assert(await target.locator('.katex').count() > 0, 'equation remains rendered inside its numbered definition');
    const [bodyBox, numberBox, targetBox] = await Promise.all([
      target.locator(':scope > .numbered-content').boundingBox(),
      target.locator(':scope > .reference-number').boundingBox(),
      target.boundingBox(),
    ]);
    assert(bodyBox && numberBox && targetBox);
    assert(numberBox.x >= bodyBox.x + bodyBox.width - 1, 'number sits to the right of the definition');
    assert(numberBox.x + numberBox.width <= targetBox.x + targetBox.width + 1, 'number stays inside the block');
    const reference = article.locator(`a.cross-reference[href="#${id}"]`).first();
    assert(await reference.count() > 0, `body text links to ${id}`);
    assert.equal(await reference.textContent(), `(${index + 1})`, 'reference uses the generated number');
    if (noJavaScript) {
      await clickWithoutJavaScript(reference);
      await page.waitForURL(url => url.hash === `#${id}`);
    } else await clickAnchor(page, reference);
    const appearance = await target.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { targeted: element.matches(':target'), top: rect.top, bottom: rect.bottom, viewport: innerHeight, outlineStyle: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth) };
    });
    assert(appearance.targeted, 'clicked definition becomes the CSS :target');
    assert(appearance.outlineStyle !== 'none' && appearance.outlineWidth > 0, 'target has a visible outline');
    assert(appearance.top >= 0 && appearance.bottom <= appearance.viewport + 1, 'reference scrolls its definition into the viewport');
    assert.equal(new URL(page.url()).hash, `#${id}`, 'reference goes to the body definition, not a footnote');
  }
}

async function assertImageViewer(page) {
  const zoom = page.getByRole('button', { name: /放大图片/ }).first();
  assert(await zoom.count() > 0, 'guide includes a real image example');
  await zoom.scrollIntoViewIfNeeded();
  const image = zoom.locator('img');
  await image.evaluate(element => element.decode());
  assert(await image.evaluate(element => element.naturalWidth > 0), 'source image loads');
  const source = await image.evaluate(element => element.currentSrc || element.src);
  await zoom.click();
  const dialog = page.getByRole('dialog', { name: '图片预览' });
  assert(await dialog.isVisible(), 'image opens in the viewer');
  assert.equal(await dialog.locator('img').evaluate(element => element.src), source);
  await dialog.locator('img').evaluate(element => element.decode());
  await dialog.getByRole('button', { name: /关闭/ }).click();
  assert.equal(await dialog.isVisible(), false, 'close button dismisses image viewer');
  await zoom.click();
  await page.keyboard.press('Escape');
  assert.equal(await dialog.isVisible(), false, 'Escape dismisses image viewer');
}

const channel = process.env.BROWSER_CHANNEL || (await exists(chromium.executablePath()) ? undefined : 'chrome');
const browser = await chromium.launch({ channel });
await mkdir(screenshotDirectory, { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', reducedMotion: 'reduce' });
  const page = await context.newPage();
  observe(page);
  await visit(page, '/about/');
  for (const path of paths) assert(await page.locator(`main a[href="${path}"]`).count() > 0, `About links to ${path}`);
  await assertAboutCards(page);
  for (const path of paths) {
    await visit(page, '/about/');
    await page.locator(`main a[href="${path}"]`).first().click();
    await page.waitForURL(new URL(path, base).href);
    await settleImages(page);
    await assertGuideNavigation(page, path);
    if (path === '/about/markdown/') {
      await assertCodeGroup(page);
      await assertMarkdownFeatures(page);
      await assertImageViewer(page);
    }
    await assertResponsiveGuide(page, path);
    const related = paths.find(value => value !== path);
    await page.getByRole('navigation', { name: '相关阅读' }).locator(`a[href="${related}"]`).click();
    await page.waitForURL(new URL(related, base).href);
    await page.getByRole('link', { name: /返回关于作者/ }).first().click();
    await page.waitForURL(new URL('/about/', base).href);
    console.log(`PASS: ${path} navigation, heading/anchor targets, desktop/mobile ToCs and light/dark layouts`);
  }
  await context.close();

  const plainContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const plain = await plainContext.newPage();
  observe(plain);
  for (const path of paths) {
    await visit(plain, path);
    await assertGuideNavigation(plain, path);
    const mobile = plain.locator('details.guide-toc-mobile');
    if (!await mobile.evaluate(element => element.open)) await mobile.locator(':scope > summary').click();
    await clickAnchor(plain, mobile.locator('a[href*="#"]').first());
    await assertNoOverflow(plain, `${path} without JavaScript`);
    if (path === '/about/markdown/') {
      const panels = plain.locator('article .rcg-block');
      assert.equal(await panels.count(), 2);
      for (const panel of await panels.all()) {
        assert(await panel.isVisible(), 'every language remains readable without JavaScript');
        assert((await panel.innerText()).trim().length > 0);
        await assertLineNumbers(panel.locator('pre > code'));
      }
      await assertNativeMarkdownReading(plain, { checkKeyboardScroll: true, noJavaScript: true });
      await assertCrossReferences(plain, { noJavaScript: true });
      await assertNoOverflow(plain, 'numbered definitions without JavaScript');
    }
    await screenshot(plain, `${path.split('/').filter(Boolean).at(-1)}-mobile-no-js`);
    await clickWithoutJavaScript(plain.getByRole('link', { name: /返回关于作者/ }).first());
    await plain.waitForURL(new URL('/about/', base).href);
    await clickWithoutJavaScript(plain.locator(`main a[href="${path}"]`).first());
    await plain.waitForURL(new URL(path, base).href);
  }
  await plainContext.close();
  assert.deepEqual(pageErrors, [], 'guides must not throw browser JavaScript errors');
  if (consoleErrors.length) console.warn(`Console diagnostics: ${JSON.stringify(consoleErrors)}`);
  console.log('PASS: code tab switching/line numbers/icon-only copying/keyboard/theme, alerts, native details and table keyboard scrolling, table semantics/alignment, unchanged task states, separators, math, numbered body-reference targets/layout, footnote round trips, image viewer and no-JS navigation/reading');
  console.log(`Screenshots: ${screenshotDirectory}`);
} catch (error) {
  if (pageErrors.length) console.error(`Browser errors: ${JSON.stringify(pageErrors)}`);
  if (consoleErrors.length) console.error(`Console diagnostics: ${JSON.stringify(consoleErrors)}`);
  throw error;
} finally {
  await browser.close();
}
