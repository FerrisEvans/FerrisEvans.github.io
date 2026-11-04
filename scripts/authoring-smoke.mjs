#!/usr/bin/env node
/** Exercise draft -> publish -> delete using one Markdown file in a disposable site. */
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { fromHtml } from 'hast-util-from-html';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// macOS exposes /var through /private/var; use one canonical root for Vite IDs.
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'praxis-authoring-')));
const fixtureId = randomUUID().slice(0, 8);
const slug = `authoring-contract-${fixtureId}`;
const title = `旅行与烘焙：Markdown 发布验证 ${fixtureId}`;
// Verify this full marker in result content; search tokenization may also match other posts.
const marker = 'praxisunpublishedfjordquasar';
const category = 'authoring-fixture';
const tag = 'authoring-contract';
const postPath = `/posts/${slug}/`;
const fixturePath = join(temporary, 'src/content/blog', `${slug}.md`);
const immutable = ['public/fonts/room-pixel-zh.woff2', 'public/fonts/room-pixel-zh.coverage.json', 'src/data/site.ts'];
const children = new Set();
const screenshotDirectory = process.env.AUTHORING_SCREENSHOT_DIR ? resolve(process.env.AUTHORING_SCREENSHOT_DIR) : null;
const revision = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const environment = { ...process.env, GITHUB_SHA: revision, ASTRO_TELEMETRY_DISABLED: '1' };
let browser;

const fixture = `---
title: "${title}"
description: "旅行摄影与烘焙食谱，验证新增汉字无需生成字体。"
pubDate: 2099-01-01
category: ${category}
tags: [${tag}]
draft: true
---

${marker} is the unique searchable publication marker.

## 公式与图片

行内公式 $a^2+b^2=c^2$ 不需要手动开启数学开关。

$$
\\frac{1}{2} + \\sqrt{x}
$$

![发布验证配图](/assets/lib/rag.jpeg)

## 第一组代码

::: code-group labels=[GDScript, C#]

\`\`\`gdscript
print("first-gdscript-${'wide-code-'.repeat(22)}")
\`\`\`

\`\`\`cs
GD.Print("first-csharp-${'wide-code-'.repeat(22)}");
\`\`\`

:::

## 第二组代码

::: code-group labels=[GDScript, C#]

\`\`\`gdscript
print("second-gdscript-independent")
\`\`\`

\`\`\`cs
GD.Print("second-csharp-independent");
\`\`\`

:::
`;

async function exists(path) {
  try { await stat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function snapshot(base) {
  return Object.fromEntries(await Promise.all(immutable.map(async (path) =>
    [path, createHash('sha256').update(await readFile(join(base, path))).digest('hex')])));
}

function command(commandName, args) {
  const child = spawn(commandName, args, {
    cwd: temporary, env: environment, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32',
  });
  children.add(child);
  let output = '';
  const capture = (chunk) => { output = (output + chunk.toString()).slice(-4_000_000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  const completion = new Promise((resolveCompletion, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => { children.delete(child); resolveCompletion({ code, signal }); });
  });
  // Server startup failures are surfaced by the readiness loop.
  completion.catch(() => {});
  return { child, completion, output: () => output };
}

async function stop(task) {
  const child = task?.child ?? task;
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const signal = (name) => {
    try {
      if (process.platform !== 'win32') process.kill(-child.pid, name);
      else child.kill(name);
    } catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  signal('SIGTERM');
  await Promise.race([
    new Promise((done) => child.once('close', done)),
    new Promise((done) => setTimeout(done, 2_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) signal('SIGKILL');
}

async function build(label) {
  console.log(`Building isolated ${label} fixture…`);
  const task = command(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build']);
  const timeout = setTimeout(() => { void stop(task); }, 180_000);
  try {
    const { code, signal } = await task.completion;
    if (code !== 0) throw new Error(`${label} build failed (${signal ?? code})\n${task.output()}`);
  } finally { clearTimeout(timeout); }
}

async function availablePort() {
  const server = createServer();
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const { port } = server.address();
  await new Promise((done, reject) => server.close((error) => error ? reject(error) : done()));
  return port;
}

async function startServer(mode) {
  const port = await availablePort();
  const base = `http://127.0.0.1:${port}`;
  // The disposable site's dependencies are symlinked outside its Vite root.
  // Allow that dependency directory through Astro's programmatic dev override;
  // this does not change the checkout or its copied Astro configuration.
  const devOptions = {
    root: temporary,
    server: { host: '127.0.0.1', port },
    vite: { server: { fs: { allow: [temporary, await realpath(join(root, 'node_modules'))] } } },
  };
  // The API remains foreground. For the CLI, --ignore-lock prevents Astro 7's
  // automatic agent backgrounding so every server stays in our process group.
  const args = mode === 'dev'
    ? ['--input-type=module', '--eval', `import { dev } from 'astro'; await dev(${JSON.stringify(devOptions)});`]
    : [join(root, 'node_modules/astro/bin/astro.mjs'), mode, '--ignore-lock', '--host', '127.0.0.1', '--port', String(port)];
  const task = command(process.execPath, args);
  for (let attempt = 0; attempt < 160; attempt++) {
    if (task.child.exitCode !== null || task.child.signalCode !== null) {
      throw new Error(`${mode} server exited before readiness\n${task.output()}`);
    }
    let response;
    try { response = await fetch(`${base}/lofi/`, { signal: AbortSignal.timeout(2_000) }); }
    catch { /* Initial startup can precede the listening socket. */ }
    if (response?.ok) return { ...task, base };
    if (response?.status >= 500) throw new Error(`${mode} server returned HTTP ${response.status}\n${task.output().slice(-12_000)}`);
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(`${mode} server did not become ready\n${task.output().slice(-12_000)}`);
}

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory()
    ? filesUnder(join(directory, entry.name)) : [join(directory, entry.name)]))).flat();
}

async function screenshot(page, name) {
  if (!screenshotDirectory) return;
  await mkdir(screenshotDirectory, { recursive: true });
  await page.waitForFunction(() => !document.getAnimations().some((animation) =>
    animation.playState === 'running' && Number.isFinite(animation.effect?.getComputedTiming().endTime)), undefined, { polling: 100 });
  await page.screenshot({ path: join(screenshotDirectory, `${name}.png`), fullPage: true });
}

async function newContext(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });
  await context.route('https://giscus.app/**', (route) => route.abort());
  return context;
}

async function searchResults(base) {
  const context = await newContext();
  try {
    const page = await context.newPage();
    await page.goto(`${base}/search/`);
    return await page.evaluate(async (query) => {
      const pagefind = await import('/pagefind/pagefind.js');
      const results = await pagefind.search(query);
      return await Promise.all(results.results.map(async (result) => {
        const { url, content } = await result.data();
        return { url, content };
      }));
    }, marker);
  } finally { await context.close(); }
}

async function assertMathAndImage(page) {
  assert.equal(await page.locator('.katex').count(), 2, 'inline and display formulas render without a math flag');
  assert.equal(await page.locator('.katex-display').count(), 1);
  assert.equal(await page.locator('.katex-error').count(), 0);
  assert.match(await page.locator('.katex').first().evaluate((element) => getComputedStyle(element).fontFamily), /KaTeX_Main/);
  assert(await page.evaluate(async () => (await document.fonts.load('16px KaTeX_Main')).length > 0));
  const image = page.locator('.prose-custom img').first();
  await image.scrollIntoViewIfNeeded();
  await image.evaluate((element) => element.decode());
  assert(await image.evaluate((element) => element.naturalWidth > 0), 'ordinary Markdown image loads');
}

async function assertSelected(tab) {
  assert.equal(await tab.getAttribute('aria-selected'), 'true');
  assert.equal(await tab.getAttribute('tabindex'), '0');
}

async function assertCodeTabs(page) {
  const groups = page.locator('.rehype-code-group');
  assert.equal(await groups.count(), 2, 'both Markdown directives produce code groups');
  const first = groups.nth(0);
  const second = groups.nth(1);
  const firstGdscript = first.getByRole('tab', { name: 'GDScript', exact: true });
  const firstCsharp = first.getByRole('tab', { name: 'C#', exact: true });
  const secondGdscript = second.getByRole('tab', { name: 'GDScript', exact: true });
  const secondCsharp = second.getByRole('tab', { name: 'C#', exact: true });
  await assertSelected(firstGdscript);
  await assertSelected(secondGdscript);
  await firstCsharp.click();
  await assertSelected(firstCsharp);
  await assertSelected(secondGdscript);
  assert.equal(await first.getByRole('tabpanel').count(), 1, 'only the active code panel is visible with JavaScript');

  for (const [key, expected] of [['Home', firstGdscript], ['ArrowRight', firstCsharp], ['ArrowRight', firstGdscript], ['End', firstCsharp], ['ArrowLeft', firstGdscript]]) {
    await page.keyboard.press(key);
    await assertSelected(expected);
    assert(await expected.evaluate((element) => document.activeElement === element), `${key} moves focus with selection`);
  }
  await secondCsharp.click();
  await assertSelected(secondCsharp);
  await assertSelected(firstGdscript);
  await firstCsharp.click();
  await assertSelected(firstCsharp);

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text) => { window.__authoringCopied = text; } },
    });
  });
  const expectedCode = await first.getByRole('tabpanel').locator('pre > code').textContent();
  const copy = first.getByRole('button', { name: '复制代码', exact: true });
  assert.equal((await copy.innerText()).trim(), '', 'copy control is icon-only');
  const copyIcons = copy.locator('svg');
  assert(await copyIcons.count() > 0);
  for (const icon of await copyIcons.all()) assert.equal(await icon.getAttribute('aria-hidden'), 'true');
  await copy.click();
  await page.waitForFunction(() => typeof window.__authoringCopied === 'string');
  assert.equal(await page.evaluate(() => window.__authoringCopied), expectedCode, 'copy uses the current tab only');
  assert.equal(await copy.getAttribute('data-copied'), 'true');
  assert.equal(await copy.getAttribute('title'), '已复制');
  assert.equal(await copy.getAttribute('aria-label'), '复制代码');
  assert.equal((await copy.innerText()).trim(), '', 'success feedback remains icon-only');
  assert(expectedCode.includes('first-csharp-') && !expectedCode.includes('first-gdscript-'));

  const lightColor = await firstCsharp.evaluate((element) => getComputedStyle(element).backgroundColor);
  await screenshot(page, 'authoring-desktop-light');
  await page.locator('#theme-toggle').click();
  assert(await page.evaluate(() => document.documentElement.classList.contains('dark')));
  await assertSelected(firstCsharp);
  const darkColor = await firstCsharp.evaluate((element) => getComputedStyle(element).backgroundColor);
  assert.notEqual(darkColor, lightColor, 'selected code tabs adapt to the page theme');
  await screenshot(page, 'authoring-desktop-dark');

  await page.setViewportSize({ width: 390, height: 844 });
  const scrolling = await first.getByRole('tabpanel').locator('pre').evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    const style = getComputedStyle(element);
    return { width: element.clientWidth, scrollWidth: element.scrollWidth, scrollLeft: element.scrollLeft, overflowX: style.overflowX };
  });
  assert(scrolling.scrollWidth > scrolling.width, 'fixture exercises a wide code line');
  assert.match(scrolling.overflowX, /auto|scroll/);
  assert(Math.abs(scrolling.scrollLeft - (scrolling.scrollWidth - scrolling.width)) <= 2, 'wide code can scroll to its end');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'code does not widen the mobile page');
  await screenshot(page, 'authoring-mobile-dark');
  await page.locator('#theme-toggle').click();
  await screenshot(page, 'authoring-mobile-light');
}

async function verifyAbsentProduction(label) {
  const dist = join(temporary, 'dist');
  for (const path of [postPath, `/categories/${category}/`, `/tags/${tag}/`, '/drafts/']) {
    assert.equal(await exists(join(dist, path, 'index.html')), false, `${path} is absent from production`);
  }
  for (const path of (await filesUnder(dist)).filter((path) => /\.(?:html|xml)$/.test(path))) {
    const content = await readFile(path, 'utf8');
    for (const token of [slug, marker, category, tag]) assert(!content.includes(token), `${path} must not expose ${label} fixture ${token}`);
    // Guides may explain the /drafts/ URL as literal code. Only an actual
    // navigation link advertises a production entry; route absence is checked above.
    if (path.endsWith('.html')) {
      const visitLinks = node => {
        if (node.tagName === 'a') {
          const href = node.properties?.href ?? '';
          assert(!/^\/drafts(?:\/|[?#]|$)/.test(href), `${path} must not link to a production draft entry`);
        }
        for (const child of node.children ?? []) visitLinks(child);
      };
      visitLinks(fromHtml(content));
    }
  }
  const server = await startServer('preview');
  try {
    const results = await searchResults(server.base);
    for (const { url, content } of results) {
      assert.notEqual(new URL(url, server.base).pathname, postPath, `${label} URL is absent from Pagefind`);
      assert.equal(typeof content, 'string', 'Pagefind supplies indexed body content');
      assert(!content.includes(marker), `${label} body marker is absent from Pagefind results`);
    }
  }
  finally { await stop(server); }
  console.log(`PASS: ${label} fixture is absent from production routes, indexes, RSS, sitemap and Pagefind`);
}

async function verifyDraftDevelopment() {
  const server = await startServer('dev');
  const context = await newContext();
  const fontFailures = new Map();
  const isFont = (url) => /\.(?:woff2?|ttf|otf)(?:[?#]|$)/i.test(url);
  context.on('requestfailed', (request) => {
    if (isFont(request.url())) fontFailures.set(request.url(), { ...fontFailures.get(request.url()), failure: request.failure()?.errorText });
  });
  context.on('response', (response) => {
    if (isFont(response.url()) && response.status() >= 400) fontFailures.set(response.url(), { ...fontFailures.get(response.url()), status: response.status() });
  });
  try {
    const page = await context.newPage();
    const response = await page.goto(`${server.base}/drafts/`);
    assert.equal(response.status(), 200);
    assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
    const draftLink = page.locator(`a[href="${postPath}"]`);
    assert.equal(await draftLink.count(), 1);
    assert((await draftLink.innerText()).includes(title));
    await draftLink.click();
    await page.waitForURL(`${server.base}${postPath}`);
    assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
    assert(await page.locator('.draft-preview').isVisible());
    await assertMathAndImage(page);
    assert.equal(await page.getByRole('tab', { name: 'GDScript', exact: true }).count(), 2);
    await page.locator('.rehype-code-group').first().getByRole('tab', { name: 'C#', exact: true }).click();
    await assertSelected(page.locator('.rehype-code-group').first().getByRole('tab', { name: 'C#', exact: true }));
    await screenshot(page, 'authoring-draft-preview');
    for (const path of ['/lofi/', '/categories/', '/tags/', '/archives/', '/rss.xml', '/room/', '/explore/']) {
      const response = await fetch(`${server.base}${path}`);
      assert(response.ok, `${path} is available in development`);
      const html = await response.text();
      for (const token of [slug, marker, category, tag]) assert(!html.includes(token), `${path} does not mix drafts into its public collection`);
    }
  } catch (error) {
    throw new Error(`Draft preview verification failed:\n${error.stack ?? error}\nFont failures: ${JSON.stringify([...fontFailures])}\nDevelopment server output:\n${server.output().slice(-12_000)}`, { cause: error });
  } finally { await context.close(); await stop(server); }
  console.log('PASS: development draft list and detail render, while public collections remain published-only');
}

async function verifyPublished() {
  const dist = join(temporary, 'dist');
  const article = await readFile(join(dist, postPath, 'index.html'), 'utf8');
  assert(article.includes(marker));
  assert(!article.includes('name="robots" content="noindex'), 'published article is indexable');
  assert(!article.includes('class="draft-preview"'), 'published article has no draft banner');
  for (const path of ['lofi/index.html', `categories/${category}/index.html`, `tags/${tag}/index.html`, 'archives/index.html', 'rss.xml']) {
    assert((await readFile(join(dist, path), 'utf8')).includes(postPath), `${path} discovers the new article automatically`);
  }
  assert((await readFile(join(dist, 'categories/index.html'), 'utf8')).includes(`/categories/${category}/`));
  assert((await readFile(join(dist, 'tags/index.html'), 'utf8')).includes(`/tags/${tag}/`));
  const sitemap = (await Promise.all((await readdir(dist)).filter((name) => /^sitemap.*\.xml$/.test(name)).map((name) => readFile(join(dist, name), 'utf8')))).join('\n');
  assert(sitemap.includes(postPath), 'published article enters the sitemap');
  assert(!sitemap.includes('/drafts/'));
  assert.equal(await exists(join(dist, 'drafts/index.html')), false);

  const server = await startServer('preview');
  const context = await newContext();
  try {
    const results = await searchResults(server.base);
    assert(results.some(({ url, content }) => new URL(url, server.base).pathname === postPath && content.includes(marker)),
      'published article is searchable and its indexed content contains the full body marker');
    const page = await context.newPage();
    const response = await page.goto(`${server.base}${postPath}`);
    assert.equal(response.status(), 200);
    await assertMathAndImage(page);
    await assertCodeTabs(page);

    const noJs = await newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    try {
      const staticPage = await noJs.newPage();
      await staticPage.goto(`${server.base}${postPath}`);
      const panels = staticPage.locator('.rcg-block');
      assert.equal(await panels.count(), 4);
      for (const panel of await panels.all()) assert(await panel.isVisible(), 'every code alternative stays readable without JavaScript');
      for (const text of ['first-gdscript-', 'first-csharp-', 'second-gdscript-independent', 'second-csharp-independent']) {
        assert((await staticPage.locator('.prose-custom').innerText()).includes(text));
      }
      assert.equal(await staticPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await screenshot(staticPage, 'authoring-mobile-no-js');
    } finally { await noJs.close(); }
  } finally { await context.close(); await stop(server); }
  console.log('PASS: one Markdown file publishes to all indexes; math, images, independent code tabs, copying and mobile/no-JS reading work');
}

try {
  const original = await snapshot(root);
  await Promise.all(['src', 'public', 'scripts', 'astro.config.mjs', 'package.json', 'package-lock.json', 'tsconfig.json'].map((path) =>
    cp(join(root, path), join(temporary, path), { recursive: true })));
  await symlink(join(root, 'node_modules'), join(temporary, 'node_modules'), 'dir');
  assert.deepEqual(await snapshot(temporary), original);
  await writeFile(fixturePath, fixture);
  await build('draft');
  const channel = process.env.BROWSER_CHANNEL || (await exists(chromium.executablePath()) ? undefined : 'chrome');
  browser = await chromium.launch({ channel });
  await verifyAbsentProduction('draft');
  await verifyDraftDevelopment();

  // This is the only author-side change between draft and publication.
  await writeFile(fixturePath, fixture.replace('draft: true', 'draft: false'));
  await build('published');
  await verifyPublished();
  await rm(fixturePath);
  await build('deleted');
  await verifyAbsentProduction('deleted');
  assert.deepEqual(await snapshot(temporary), original, 'publishing and deleting do not regenerate fonts or alter category configuration');
  assert.deepEqual(await snapshot(root), original, 'the source checkout remains unchanged');
  console.log('PASS: font bytes, coverage manifest and category configuration remain unchanged');
} catch (error) {
  console.error(error.stack ?? error);
  process.exitCode = 1;
} finally {
  const cleanup = await Promise.allSettled([browser?.close(), ...[...children].map(stop)]);
  await rm(temporary, { recursive: true, force: true });
  for (const result of cleanup) if (result.status === 'rejected') {
    console.error('Authoring test cleanup failed:', result.reason);
    process.exitCode = 1;
  }
}
