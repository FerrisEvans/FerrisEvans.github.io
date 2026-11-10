import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import { fromHtml } from 'hast-util-from-html';
import { readArticles, translationErrors } from './i18n-contract.mjs';
import { articleRoutePaths, legacyRedirects } from '../../src/data/legacy-routes.mjs';

const distDir = path.resolve('dist');
const locales = ['en', 'zh'];
const languageTags = { en: 'en', zh: 'zh-CN' };
const sourceArticles = readArticles();
assert.deepEqual(translationErrors(sourceArticles), [], 'the source publication set must contain complete bilingual pairs');
const published = sourceArticles.filter(entry => entry.data.draft !== true);
const activeByLocale = new Map(locales.map(locale => [locale,
  articleRoutePaths(published.filter(entry => entry.data.locale === locale))]));
const retiredAliases = locales.flatMap(locale => legacyRedirects(activeByLocale.get(locale))
  .flatMap(([from, to]) => [[`/${locale}${from}`, `/${locale}${to}`], ...(locale === 'zh' ? [[from, `/zh${to}`]] : [])]));
const retiredPaths = new Set(retiredAliases.map(([from]) => from));
const outputPath = file => decodeURIComponent(`/${path.relative(distDir, file).replaceAll(path.sep, '/').replace(/index\.html$/, '')}`);
for (const source of ['assets', 'vendor', 'island/island.blend', 'island/island.glb', 'island/model-report.json', 'island/transport.json', 'brand/ferris-avatar.png', 'brand/ferris-dog-avatar.png', 'brand/identity.json']) {
  assert(!fs.existsSync(path.join(distDir, source)), `Authoring or retired assets must not be published: ${source}`);
}
// Every third-party license must survive source pruning without byte changes.
const vendorSource = path.resolve('public/island/vendor');
const vendorOutput = path.join(distDir, 'island/vendor');
assert.deepEqual(fs.readdirSync(vendorOutput).sort(), fs.readdirSync(vendorSource).sort());
for (const pack of fs.readdirSync(vendorSource)) {
  const notices = fs.readdirSync(path.join(vendorSource, pack))
    .filter(file => ['LICENSE.txt', 'NOTICE.md'].includes(file)).sort();
  assert(notices.includes('LICENSE.txt'), `Missing upstream license: ${pack}`);
  assert.deepEqual(fs.readdirSync(path.join(vendorOutput, pack)).sort(), notices,
    `Only licenses and notices may be published for ${pack}`);
  for (const file of notices) {
    assert(fs.readFileSync(path.join(vendorSource, pack, file)).equals(fs.readFileSync(path.join(vendorOutput, pack, file))),
      `Published license differs from upstream: ${pack}/${file}`);
  }
}
const requiredFiles = [
  'index.html',
  'en/index.html',
  'zh/index.html',
  'en/rss.xml',
  'zh/rss.xml',
  'en/categories/lang/index.html',
  'zh/categories/lang/index.html',
  ...retiredAliases.map(([from]) => `${from.slice(1)}index.html`),
  ...locales.map(locale => `${locale}/about/markdown-writing/index.html`),
  '404.html',
  'rss.xml',
  'sitemap-index.xml',
  'pagefind/pagefind-entry.json',
  '.nojekyll',
  'lofi/index.html',
  'notes/index.html',
  'about/index.html',
  'about/python-zen/index.html',
  'about/writing/index.html',
  'about/markdown/index.html',
  'about/markdown-writing/index.html',
  'room/index.html',
  'island/index.html',
  'release.json',
  'sw.min.js',
];

for (const rel of requiredFiles) {
  const full = path.join(distDir, rel);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing required build output: dist/${rel}`);
  }
}

function walkFiles(dir, extension) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkFiles(full, extension));
    else if (entry.isFile() && entry.name.endsWith(extension)) results.push(full);
  }
  return results;
}

const htmlFiles = walkFiles(distDir, '.html');
// Models are requested by JavaScript, so href/src checks alone miss stale bytes.
const island = JSON.parse(fs.readFileSync(path.join(distDir, 'island/manifest.json'), 'utf8'));
if (!/^[a-f0-9]{20}$/.test(island.buildId) || island.posters?.buildId !== island.buildId) throw new Error('Island model/poster build identities differ');
for (const [file, asset] of [[island.model.file, island.model], ...Object.entries(island.posters.files)]) {
  if (path.basename(file) !== file) throw new Error('Island assets must be local filenames');
  const bytes = fs.readFileSync(path.join(distDir, 'island', file));
  if (bytes.length !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error(`Missing or stale island resource: ${file}`);
}
if (fs.readdirSync(path.join(distDir, 'room')).some(file => file !== 'index.html')) throw new Error('Retired study assets must not enter the published room directory');
for (const file of walkFiles(path.join(distDir, '_astro'), '.js')) {
  const code = fs.readFileSync(file, 'utf8');
  if (/\/room\/(?:materials|film|window|fonts)\//.test(code)) throw new Error(`Retired study runtime dependency in ${path.relative(distDir, file)}`);
}
const rootPage = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
if (!rootPage.includes('href="/en/"')) throw new Error('Root must enter the English site');
const homepage = fs.readFileSync(path.join(distDir, 'zh/index.html'), 'utf8');
if (!homepage.includes('href="/zh/notes/"')) throw new Error('Homepage fallback must retain the reading destination');
for (const obsolete of ['home-enter-room', 'home-enter-blog', 'island-reset', 'island-panel-reset']) {
  if (homepage.includes(`id="${obsolete}"`)) throw new Error(`Obsolete homepage control must not return: ${obsolete}`);
}
if (/class="[^"]*island-dock/.test(homepage)) throw new Error('Fixed courtyard must not render a separate dock');
if (!homepage.includes('weijin-lettering')) throw new Error('Homepage brand must use the original SVG wordmark');
if (!homepage.includes('id="island-root"') || !homepage.includes('id="island-scene"')) throw new Error('Homepage must directly mount the interactive courtyard');
if (homepage.includes('id="home-enter-room"')) throw new Error('Homepage must not require a separate exploration entry');
for (const [file, destination] of [['lofi/index.html', '/zh/notes/'], ['room/index.html', '/zh/'], ['island/index.html', '/zh/'],
  ['about/markdown-writing/index.html', '/zh/about/markdown-writing/'],
  ...retiredAliases.map(([from, to]) => [`${from.slice(1)}index.html`, to]),
  ...htmlFiles.map(file => path.relative(distDir, file).replaceAll(path.sep, '/')).filter(file => /^page\/\d+\/index\.html$/.test(file)).map(file => [file, file === 'page/1/index.html' ? '/zh/notes/' : `/zh/notes/${file.replace(/index\.html$/, '')}`])]) {
  const html = fs.readFileSync(path.join(distDir, file), 'utf8');
  if (!html.includes(`href="${destination}"`) || !html.includes(`rel="canonical"`)) throw new Error(`Legacy alias lacks canonical/direct destination: ${file}`);
  if (!/<meta\b[^>]*name="robots"[^>]*content="noindex,follow"/.test(html)) throw new Error(`Legacy alias must not create a competing search entry: ${file}`);
  const tree = fromHtml(html);
  const canonical = elements(tree, 'link').filter(node => node.properties.rel?.includes('canonical'));
  assert.equal(canonical.length, 1, `${file}: one legacy canonical`);
  const canonicalURL = new URL(canonical[0].properties.href);
  const destinationURL = new URL(destination, canonicalURL.origin);
  assert.equal(canonicalURL.pathname, destinationURL.pathname, `${file}: canonical points directly to the destination`);
  assert.equal(canonicalURL.search + canonicalURL.hash, '', `${file}: canonical excludes query and fragment`);
  const script = elements(tree, 'script').map(node => node.children.map(child => child.value ?? '').join('')).find(code => code.includes('window.location.replace'));
  assert(script, `${file}: browser redirect exists`);
  for (const [search, hash] of [['?from=legacy%20link&view=all', '#group-1'], ['?from=legacy', ''], ['', '']]) {
    let redirected;
    runInNewContext(script, { URL, window: { location: { href: `https://legacy.invalid/${file}${search}${hash}`, search, hash, replace: value => { redirected = value; } } } });
    assert.equal(redirected, `${destinationURL.pathname}${search}${hash || destinationURL.hash}`, `${file}: redirect preserves query and incoming fragment, or the default destination fragment`);
  }
}
const sitemapUrls = fs.readdirSync(distDir).filter(file => /^sitemap.*\.xml$/.test(file)).flatMap(file =>
  [...fs.readFileSync(path.join(distDir, file), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1])));
for (const pathname of ['/en/', '/zh/', '/en/notes/', '/zh/notes/', '/en/categories/lang/', '/zh/categories/lang/', ...locales.map(locale => `/${locale}/about/markdown-writing/`)]) if (!sitemapUrls.some(url => url.pathname === pathname)) throw new Error(`Missing canonical sitemap route: ${pathname}`);
if (sitemapUrls.some(url => (!/^\/(en|zh)\//.test(url.pathname) && !url.pathname.endsWith('.xml')) || /\/page\/\d+\/$/.test(url.pathname) || retiredPaths.has(decodeURIComponent(url.pathname)))) throw new Error('Legacy aliases must stay out of the canonical sitemap');
const release = JSON.parse(fs.readFileSync(path.join(distDir, 'release.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(release.version) || !/^[a-f0-9]{40}$/.test(release.revision) || !release.roomBuildId) {
  throw new Error('Invalid release provenance');
}
const packageVersion = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const roomBuildId = island.buildId;
if (release.version !== packageVersion || release.roomBuildId !== roomBuildId || (process.env.GITHUB_SHA && release.revision !== process.env.GITHUB_SHA)) {
  throw new Error('Release provenance does not match the build inputs');
}
const postPages = htmlFiles.filter((f) =>
  /^\/(en|zh)\/posts\//.test(outputPath(f)) && !retiredPaths.has(outputPath(f))
);
if (postPages.length === 0) {
  throw new Error('No blog post pages were generated under dist/{en,zh}/posts/');
}

// Validate the published artifact against the source collection, rather than
// accepting two language shells around a single-language or stale collection.
const articlePath = ({ locale, key }) => `/${locale}/posts/${key}/`;
const expectedPostPaths = new Set(published.map(entry => articlePath(entry.data)));
const actualPostPaths = new Set(postPages.map(outputPath));
assert.deepEqual(actualPostPaths, expectedPostPaths, 'the build must contain exactly the current published language versions');
const siteOrigin = sitemapUrls.find(url => url.pathname === '/en/').origin;
const sitemapPaths = new Set(sitemapUrls.map(url => url.pathname));
const draftPaths = new Set(sourceArticles.filter(entry => entry.data.draft === true)
  .flatMap(entry => [...locales.map(locale => articlePath({ ...entry.data, locale })), `/posts/${entry.data.key}/`]));

function elements(tree, tagName) {
  const result = [];
  function visit(node) {
    if (node.type === 'element' && (!tagName || node.tagName === tagName)) result.push(node);
    for (const child of node.children ?? []) visit(child);
  }
  visit(tree);
  return result;
}

assert(published.every(entry => entry.data.category !== 'programming-language'), 'published articles use the current lang category ID');
assert(sourceArticles.every(entry => entry.data.key !== 'markdown-writing-guide'), 'the Markdown writing sample belongs to the guides, not the article collection');
const actualTaxonomyPaths = new Set(htmlFiles.map(outputPath)
  .filter(pathname => /^\/(en|zh)\/(categories|tags)\/[^/]+\/$/.test(pathname) && !retiredPaths.has(pathname)));
const expectedTaxonomyPaths = new Set(locales.flatMap(locale => [...activeByLocale.get(locale)]
  .filter(pathname => /^\/(categories|tags)\//.test(pathname)).map(pathname => `/${locale}${pathname}`)));
assert.deepEqual(actualTaxonomyPaths, expectedTaxonomyPaths, 'only published categories and tags are active archive pages');

for (const pathname of expectedTaxonomyPaths) {
  const tree = fromHtml(fs.readFileSync(path.join(distDir, pathname, 'index.html'), 'utf8'));
  const canonical = elements(tree, 'link').filter(node => node.properties.rel?.includes('canonical'));
  assert.equal(canonical.length, 1, `${pathname}: one taxonomy canonical`);
  assert.equal(canonical[0].properties.href, new URL(pathname, siteOrigin).href, `${pathname}: active taxonomy route is self-canonical`);
  assert(!elements(tree, 'meta').some(node => node.properties.name === 'robots' && /noindex/.test(node.properties.content)), `${pathname}: active taxonomy route is indexable`);
  assert(sitemapPaths.has(new URL(pathname, siteOrigin).pathname), `${pathname}: active taxonomy route is in the sitemap`);
}

for (const locale of locales) {
  const pathname = `/${locale}/about/markdown-writing/`;
  const tree = fromHtml(fs.readFileSync(path.join(distDir, pathname, 'index.html'), 'utf8'));
  assert.equal(elements(tree, 'html')[0]?.properties.lang, languageTags[locale], `${pathname}: guide document language`);
  const links = elements(tree, 'link');
  const canonical = links.filter(node => node.properties.rel?.includes('canonical'));
  assert.equal(canonical.length, 1, `${pathname}: one guide canonical`);
  assert.equal(canonical[0].properties.href, new URL(pathname, siteOrigin).href, `${pathname}: guide is self-canonical`);
  const alternates = links.filter(node => node.properties.rel?.includes('alternate') && node.properties.hrefLang);
  assert.equal(alternates.length, 3, `${pathname}: complete guide language alternatives`);
  for (const [lang, targetLocale] of [['en', 'en'], ['zh-CN', 'zh'], ['x-default', 'en']]) {
    const matches = alternates.filter(node => node.properties.hrefLang === lang);
    assert.equal(matches.length, 1, `${pathname}: one ${lang} guide alternative`);
    assert.equal(matches[0].properties.href, new URL(`/${targetLocale}/about/markdown-writing/`, siteOrigin).href, `${pathname}: ${lang} guide target`);
  }
  assert(elements(tree).some(node => Object.hasOwn(node.properties, 'dataPagefindBody')), `${pathname}: guide has searchable content`);
  assert(!elements(tree, 'script').some(node => node.properties.src === 'https://giscus.app/client.js'), `${pathname}: guide does not retain an article comment widget`);
  assert(!elements(tree, 'meta').some(node => node.properties.name === 'robots' && /noindex/.test(node.properties.content)), `${pathname}: guide is indexable`);

  const expected = published.filter(entry => entry.data.locale === locale).map(entry => articlePath(entry.data));
  const archive = fromHtml(fs.readFileSync(path.join(distDir, locale, 'archives/index.html'), 'utf8'));
  const archiveLinks = elements(archive, 'a').filter(node => node.properties.className?.includes('archive-title')).map(node => node.properties.href);
  assert.equal(archiveLinks.length, expected.length, `${locale}: archive article count excludes the migrated guide`);
  assert.deepEqual(new Set(archiveLinks), new Set(expected), `${locale}: archive contains exactly the published articles`);
  for (const kind of ['categories', 'tags']) {
    const index = fromHtml(fs.readFileSync(path.join(distDir, locale, kind, 'index.html'), 'utf8'));
    const linked = elements(index, 'a').map(node => node.properties.href)
      .filter(href => typeof href === 'string' && new RegExp(`^/${locale}/${kind}/[^/]+/$`).test(href))
      .map(href => decodeURIComponent(href));
    assert.deepEqual(new Set(linked), new Set([...expectedTaxonomyPaths].filter(pathname => pathname.startsWith(`/${locale}/${kind}/`))), `${locale}: ${kind} index advertises only active archives`);
  }

  if (retiredPaths.has(`/${locale}/tags/godot/`)) {
    const gameDev = fromHtml(fs.readFileSync(path.join(distDir, locale, 'categories/game-dev/index.html'), 'utf8'));
    const group = elements(gameDev, 'section').find(node => node.properties.ariaLabelledBy?.includes('group-0'));
    assert(group, `${locale}: the Godot legacy target has a first category group`);
    assert.equal(elements(group, 'h2')[0]?.children.map(node => node.value ?? '').join(''), 'Godot', `${locale}: group-0 remains the Godot group`);
    const linked = elements(group, 'a').map(node => node.properties.href).filter(href => typeof href === 'string' && href.startsWith(`/${locale}/posts/`));
    const godot = published.filter(entry => entry.data.locale === locale && entry.data.category === 'game-dev' && entry.data.subcategory === 'godot').map(entry => articlePath(entry.data));
    assert(godot.length > 0, `${locale}: Godot archive has published articles`);
    assert.deepEqual(new Set(linked), new Set(godot), `${locale}: the Godot legacy target contains all of its articles`);
  }
}

for (const locale of locales) {
  const pathname = `/${locale}/categories/lang/`;
  const tree = fromHtml(fs.readFileSync(path.join(distDir, pathname, 'index.html'), 'utf8'));
  const canonical = elements(tree, 'link').filter(node => node.properties.rel?.includes('canonical'));
  assert.equal(canonical.length, 1, `${pathname}: one category canonical`);
  assert.equal(canonical[0].properties.href, new URL(pathname, siteOrigin).href, `${pathname}: self-canonical`);
  assert(!elements(tree, 'meta').some(node => node.properties.name === 'robots' && /noindex/.test(node.properties.content)), `${pathname}: current category is indexable`);
  const expected = published.filter(entry => entry.data.locale === locale && entry.data.category === 'lang').map(entry => articlePath(entry.data));
  assert(expected.length > 0, `${pathname}: migrated category has published articles`);
  const linkedPosts = elements(tree, 'a').map(node => node.properties.href).filter(href => typeof href === 'string' && href.startsWith(`/${locale}/posts/`));
  assert.deepEqual(new Set(linkedPosts), new Set(expected), `${pathname}: category links contain exactly its published articles`);
}

for (const entry of published) {
  const { locale, key } = entry.data;
  const pathname = articlePath(entry.data);
  const tree = fromHtml(fs.readFileSync(path.join(distDir, pathname, 'index.html'), 'utf8'));
  assert.equal(elements(tree, 'html')[0]?.properties.lang, languageTags[locale], `${pathname}: document language`);
  const links = elements(tree, 'link');
  const canonical = links.filter(node => node.properties.rel?.includes('canonical'));
  assert.equal(canonical.length, 1, `${pathname}: exactly one canonical`);
  assert.equal(canonical[0].properties.href, new URL(pathname, siteOrigin).href, `${pathname}: self-canonical`);
  const alternates = links.filter(node => node.properties.rel?.includes('alternate') && node.properties.hrefLang);
  assert.equal(alternates.length, 3, `${pathname}: complete, unambiguous language alternatives`);
  for (const [lang, targetLocale] of [['en', 'en'], ['zh-CN', 'zh'], ['x-default', 'en']]) {
    const matches = alternates.filter(node => node.properties.hrefLang === lang);
    assert.equal(matches.length, 1, `${pathname}: one ${lang} alternative`);
    const target = articlePath({ locale: targetLocale, key });
    assert(expectedPostPaths.has(target), `${pathname}: ${lang} points to a published counterpart`);
    assert.equal(matches[0].properties.href, new URL(target, siteOrigin).href, `${pathname}: ${lang} target`);
  }
  const giscus = elements(tree, 'script').filter(node => node.properties.src === 'https://giscus.app/client.js');
  assert.equal(giscus.length, 1, `${pathname}: one comment widget`);
  assert.equal(giscus[0].properties.dataMapping, 'specific', `${pathname}: stable comment mapping`);
  // Giscus pathname mapping strips the leading slash (giscus/giscus client.ts).
  assert.equal(giscus[0].properties.dataTerm, `posts/${key}/`, `${pathname}: both translations retain the legacy discussion term`);
  assert.equal(giscus[0].properties.dataLang, languageTags[locale], `${pathname}: localized comment interface`);
  assert(sitemapPaths.has(pathname), `${pathname}: published version is in the sitemap`);
}

for (const locale of locales) {
  const rss = fs.readFileSync(path.join(distDir, locale, 'rss.xml'), 'utf8');
  assert(rss.includes(`<language>${languageTags[locale]}</language>`), `${locale}: RSS language`);
  const rssPaths = [...rss.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)].map(([, item]) => {
    const href = item.match(/<link>([^<]+)<\/link>/)?.[1];
    assert(href, `${locale}: every RSS item has a link`);
    return new URL(href).pathname;
  });
  const expected = published.filter(entry => entry.data.locale === locale).map(entry => articlePath(entry.data));
  assert.equal(rssPaths.length, expected.length, `${locale}: RSS has no duplicated or missing language versions`);
  assert.deepEqual(new Set(rssPaths), new Set(expected), `${locale}: RSS contains only its own published articles`);
}

// Inspect Pagefind's emitted document fragments using the same raw/gzip
// signature handling as its generated browser loader. This checks real indexed
// URLs, not merely the presence of language labels in pagefind-entry.json.
const pagefind = JSON.parse(fs.readFileSync(path.join(distDir, 'pagefind/pagefind-entry.json'), 'utf8'));
const indexedByLanguage = new Map();
for (const file of walkFiles(path.join(distDir, 'pagefind/fragment'), '.pf_fragment')) {
  const bytes = fs.readFileSync(file);
  const decoded = (bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString('utf8');
  assert(decoded.startsWith('pagefind_dcd'), `Unexpected Pagefind fragment format: ${file}`);
  const fragment = JSON.parse(decoded.slice('pagefind_dcd'.length));
  const language = Object.keys(pagefind.languages).find(language => path.basename(file).startsWith(`${language}_`));
  assert(language, `Pagefind fragment has no declared language: ${file}`);
  const pathname = new URL(fragment.url, siteOrigin).pathname;
  const paths = indexedByLanguage.get(language) ?? new Set();
  assert(!paths.has(pathname), `Duplicate Pagefind document: ${language} ${pathname}`);
  paths.add(pathname);
  indexedByLanguage.set(language, paths);
  assert.equal(typeof fragment.content, 'string', `Pagefind document has no body: ${pathname}`);
  assert(!draftPaths.has(pathname), `Draft is indexed by Pagefind: ${pathname}`);
  assert(!retiredPaths.has(decodeURIComponent(pathname)), `Legacy alias is indexed by Pagefind: ${pathname}`);
}
for (const locale of locales) {
  const language = languageTags[locale].toLowerCase();
  assert(pagefind.languages[language], `${locale}: Pagefind language index exists`);
  const paths = indexedByLanguage.get(language);
  assert(paths, `${locale}: Pagefind document fragments exist`);
  assert.equal(paths.size, pagefind.languages[language].page_count, `${locale}: all indexed documents have fragments`);
  assert([...paths].every(pathname => pathname.startsWith(`/${locale}/`)), `${locale}: search index must not include another language or legacy aliases`);
  assert(paths.has(`/${locale}/about/markdown-writing/`), `${locale}: the migrated guide is searchable at its canonical route`);
  for (const entry of published.filter(entry => entry.data.locale === locale)) {
    assert(paths.has(articlePath(entry.data)), `${articlePath(entry.data)}: article is present in its language search index`);
  }
}
for (const pathname of draftPaths) {
  assert(!fs.existsSync(path.join(distDir, pathname, 'index.html')), `Draft route leaked into the production build: ${pathname}`);
  assert(!sitemapPaths.has(pathname), `Draft route leaked into the sitemap: ${pathname}`);
}
for (const file of htmlFiles) {
  for (const node of elements(fromHtml(fs.readFileSync(file, 'utf8')), 'a')) {
    const href = node.properties.href;
    if (typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//')) continue;
    const pathname = new URL(href, siteOrigin).pathname;
    assert(!retiredPaths.has(decodeURIComponent(pathname)), `${path.relative(distDir, file)} links to a retired entry point: ${pathname}`);
    assert(!draftPaths.has(pathname), `${path.relative(distDir, file)} advertises a draft article`);
    assert(!/^\/(?:en\/|zh\/)?drafts(?:\/|$)/.test(pathname), `${path.relative(distDir, file)} advertises a production draft list`);
  }
}
console.log(`Verified ${published.length / 2} bilingual article pairs: language, canonical, hreflang, legacy comments, RSS, sitemap, search and draft exclusion.`);

const attrRegex = /\b(?:href|src)="([^"]+)"/g;
const brokenLinks = [];

// Stylesheets can exist even when their fonts/images were omitted from the
// production bundle. Validate those references as well as HTML href/src.
for (const file of walkFiles(distDir, '.css')) {
  const relative = path.relative(distDir, file).replaceAll(path.sep, '/');
  const css = fs.readFileSync(file, 'utf8');
  for (const match of css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)) {
    const raw = match[2].trim();
    if (!raw || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(raw)) continue;
    const pathname = decodeURIComponent(new URL(raw, `https://build.invalid/${relative}`).pathname);
    const target = path.join(distDir, pathname);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) brokenLinks.push(`${relative} -> ${raw}`);
  }
}

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const relFile = path.relative(distDir, file);
  for (const match of html.matchAll(attrRegex)) {
    const raw = match[1];
    if (
      !raw.startsWith('/') ||
      raw.startsWith('//') ||
      raw.startsWith('/cdn-cgi/')
    ) {
      continue;
    }
    const cleanPath = decodeURIComponent(raw.split('#')[0].split('?')[0]);
    const target = path.join(distDir, cleanPath);
    const exists =
      (fs.existsSync(target) && fs.statSync(target).isFile()) ||
      fs.existsSync(path.join(target, 'index.html')) ||
      fs.existsSync(`${target}.html`);
    if (!exists) {
      brokenLinks.push(`${relFile} -> ${raw}`);
    }
  }
}

if (brokenLinks.length > 0) {
  throw new Error(
    `Found ${brokenLinks.length} broken internal link(s):\n` +
      brokenLinks.slice(0, 20).join('\n')
  );
}

console.log(
  `Verified ${htmlFiles.length} HTML pages (${postPages.length} post pages), CSS resources and internal asset/page links.`
);
