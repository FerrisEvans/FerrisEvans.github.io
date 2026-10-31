import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const base = process.env.BASE_URL || 'http://127.0.0.1:4327';
const screenshots = process.env.SMOKE_SCREENSHOT_DIR;
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined });
const url = (path) => new URL(path, base).href;

async function screenshot(page, name) {
  if (!screenshots) return;
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: join(screenshots, `${name}.png`) });
}

async function assertVisibleTitle(page) {
  const title = page.getByRole('heading', { level: 1 });
  assert.match(await title.innerText(), /Mainloop/);
  const invisible = await title.evaluate((heading) =>
    [heading, ...heading.querySelectorAll('*')].some((element) => {
      const style = getComputedStyle(element);
      return style.opacity === '0' || style.visibility === 'hidden' || style.display === 'none';
    }),
  );
  assert.equal(invisible, false, 'LO-FI title must be visible without hydration');
}

try {
  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const noJsPage = await noJs.newPage();
  await noJsPage.goto(url('/lofi/'));
  await assertVisibleTitle(noJsPage);
  await screenshot(noJsPage, 'lofi-no-js');
  await noJs.close();

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

  await page.setViewportSize({ width: 390, height: 844 });
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

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(url('/posts/agent_dev_tutorial/'));
  await page.evaluate(() => scrollTo({ top: 1200, behavior: 'instant' }));
  const toc = await page.locator('.toc-scroll').boundingBox();
  assert(toc && toc.y >= 80 && toc.y <= 110, 'desktop article directory must stay below the sticky header');
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
