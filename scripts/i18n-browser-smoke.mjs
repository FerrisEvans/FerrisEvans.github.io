import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.BASE_URL || 'http://127.0.0.1:4327';
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.route('https://giscus.app/**', route => route.abort());
const errors = [];
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const visit = async path => { const response = await page.goto(new URL(path,base).href); assert.equal(response.status(),200,path); };
try {
  await visit('/'); await page.waitForURL(new URL('/en/',base).href);
  await visit('/posts/GDScript/'); await page.waitForURL(new URL('/zh/posts/GDScript/',base).href);
  for (const locale of ['en','zh']) {
    const other = locale === 'en' ? 'zh' : 'en';
    for (const path of ['', 'notes/', 'categories/', 'tags/', 'archives/', 'about/', 'search/', 'posts/cpp_pointer01/', 'posts/java_generic/', 'about/writing/', 'about/markdown/', 'about/python-zen/']) {
      await visit(`/${locale}/${path}`);
      assert.equal(await page.locator('html').getAttribute('lang'),locale === 'en' ? 'en' : 'zh-CN');
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      assert.equal(new URL(canonical).pathname,`/${locale}/${path}`);
      assert.equal(new URL(await page.locator(`link[hreflang="${other === 'zh' ? 'zh-CN' : 'en'}"]`).getAttribute('href')).pathname,`/${other}/${path}`);
      for (const link of await page.locator('.desktop-navigation > a').all()) {
        assert(await link.getAttribute('aria-label'));
        assert.equal((await link.innerText()).trim(),'','desktop navigation stays icon-only');
      }
      if (locale === 'en' && path !== 'about/writing/') {
        const text = await page.locator('main').innerText();
        assert(!/\p{Script=Han}/u.test(text),`Untranslated English page: ${path}: ${text.match(/.{0,30}\p{Script=Han}.{0,30}/u)?.[0]}`);
      }
    }
    await visit(`/${locale}/posts/cpp_pointer01/`);
    const term = await page.locator('script[src="https://giscus.app/client.js"]').getAttribute('data-term');
    assert.equal(term,'posts/cpp_pointer01/','both versions retain the original shared discussion term (Giscus removes the leading slash)');
    const languageButton = page.locator('.nav-language > summary');
    await languageButton.focus();
    await page.keyboard.press('Enter');
    const switcher = page.locator(`[data-language-switch][lang="${other === 'zh' ? 'zh-CN' : 'en'}"]`);
    assert(await switcher.isVisible(),'keyboard opens the language picker');
    await page.keyboard.press('Escape');
    assert(!(await switcher.isVisible()),'Escape dismisses the picker');
    assert(await languageButton.evaluate(button => button === document.activeElement),'Escape restores focus');
    await languageButton.click();
    await page.locator('h1').click();
    assert(!(await switcher.isVisible()),'clicking outside dismisses the picker');
    await page.evaluate(() => history.replaceState(null, '', `${location.pathname}?source=language-check#comments`));
    await languageButton.click();
    await switcher.click();
    await page.waitForURL(new URL(`/${other}/posts/cpp_pointer01/?source=language-check#comments`,base).href);
    await visit(`/${locale}/search/`);
    await page.locator('.pagefind-ui__search-input').fill(locale === 'en' ? 'pointer' : '指针');
    await page.locator('.pagefind-ui__result-link').first().waitFor();
    const results = await page.locator('.pagefind-ui__result-link').evaluateAll(links=>links.map(link=>new URL(link.href).pathname));
    assert(results.length && results.every(path=>path.startsWith(`/${locale}/`)),`search stays in ${locale}`);
  }
  for (const width of [320,390,1000,1280]) {
    await page.setViewportSize({width,height:844});
    for (const path of ['/en/','/en/notes/','/en/about/','/en/posts/java_generic/']) {
      await visit(path);
      await page.evaluate(()=>document.fonts.ready);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth + 1),`overflow at ${width}: ${path}`);
      const bounds = await page.locator('.nav-language').boundingBox();
      assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width,`language switch fits at ${width}`);
    }
  }
  const noJs = await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
  const staticPage = await noJs.newPage();
  await staticPage.goto(new URL('/en/',base).href);
  assert(await staticPage.locator('#island-directory a[href="/en/notes/"]').first().isVisible());
  await staticPage.goto(new URL('/en/posts/cpp_pointer01/',base).href);
  assert(await staticPage.getByRole('heading',{level:1}).isVisible());
  await staticPage.locator('.nav-language > summary').click();
  const chineseLink = staticPage.locator('[data-language-switch][lang="zh-CN"]');
  assert(await chineseLink.isVisible(),'language picker remains usable without JavaScript');
  await chineseLink.click();
  await staticPage.waitForURL(new URL('/zh/posts/cpp_pointer01/',base).href);
  await noJs.close();
  assert.deepEqual(errors,[]);
  console.log('PASS: bilingual routes, metadata, shared comments, locale search, icon navigation, responsive English pages and no-JS reading');
} finally { await browser.close(); }
