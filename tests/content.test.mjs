import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, globSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
// js-yaml is already present in the locked Astro toolchain; no new dependency.
const yaml = require('js-yaml');
const read = path => readFileSync(resolve(root, path), 'utf8');

function loadTS(path, overrides = {}, { development = false } = {}) {
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    if (filename.endsWith('.json')) return JSON.parse(readFileSync(filename, 'utf8'));
    const module = { exports: {} }; cache.set(filename, module);
    // Match Vite's compile-time environment replacement before loading TS in Node.
    const source = readFileSync(filename, 'utf8').replaceAll('import.meta.env.DEV', String(development));
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const localRequire = name => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (!name.startsWith('.')) return require(name);
      const base = resolve(dirname(filename), name);
      const target = [base, `${base}.ts`, `${base}.json`, resolve(base, 'index.ts')]
        .find(candidate => existsSync(candidate) && statSync(candidate).isFile());
      if (!target) throw new Error(`Missing test module ${name}`);
      return load(target);
    };
    new Function('require', 'module', 'exports', js)(localRequire, module, module.exports);
    return module.exports;
  }
  return load(resolve(root, path));
}

function articles() {
  return [...globSync('posts/{en,zh}/**/*.md', { cwd: root })].map(path => {
    const raw = read(path), front = raw.match(/^---\s*\r?\n([\s\S]*?)^---\s*$/m);
    assert(front, `${path} has front matter`);
    const slug = path.replaceAll('\\', '/').replace(/^posts\//, '').replace(/\.md$/, '');
    const data = yaml.load(front[1]);
    return { id: slug.toLowerCase(), href: `/${data.locale}/posts/${data.translationKey}/`, data };
  });
}

function post(id, data = {}, locale = 'en') {
  return { id: `${locale}/${id}`, data: { locale, translationKey: id, tags: [], ...data } };
}

test('published posts exclude drafts and retain the current publication-date ordering policy', async () => {
  const fixture = [
    post('old', { pubDate: new Date('2024-01-01'), draft: false }),
    post('draft', { pubDate: new Date('2100-01-01'), draft: true }),
    post('new', { pubDate: new Date('2025-01-01'), draft: false }),
    post('future', { pubDate: new Date('2099-01-01'), draft: false }),
    post('new', { pubDate: new Date('2025-01-01'), draft: false }, 'zh'),
  ];
  const { getPosts } = loadTS('src/utils/posts.ts', { 'astro:content': {
    getCollection: async (name, filter = () => true) => { assert.equal(name, 'blog'); return fixture.filter(filter); },
  } });
  assert.deepEqual((await getPosts()).map(post => post.id), ['en/future', 'en/new', 'en/old']);
  assert.deepEqual((await getPosts({ locale: 'zh' })).map(post => post.id), ['zh/new']);
});

test('draft previews require development mode and explicit opt-in; public indexes remain published-only', async () => {
  const fixture = [
    ...['en', 'zh'].flatMap(locale => [
      post('published', { pubDate: new Date('2026-01-01'), draft: false }, locale),
      post('unfinished', { pubDate: new Date('2026-02-01'), draft: true }, locale),
      post('another-draft', { pubDate: new Date('2025-12-01'), draft: true }, locale),
    ]),
  ];
  for (const development of [false, true]) {
    const { getPosts } = loadTS('src/utils/posts.ts', {
      'astro:content': { getCollection: async (_name, filter) => fixture.filter(filter) },
    }, { development });
    // Public consumers pass a locale, but never opt into draft content.
    for (const locale of ['en', 'zh']) {
      assert.deepEqual((await getPosts({ locale })).map(post => post.id), [`${locale}/published`]);
      assert.deepEqual((await getPosts({ locale, includeDrafts: false })).map(post => post.id), [`${locale}/published`]);
      assert.deepEqual((await getPosts({ locale, includeDrafts: true })).map(post => post.id),
        (development ? ['unfinished', 'published', 'another-draft'] : ['published']).map(id => `${locale}/${id}`));
    }
  }
});

test('preview URLs preserve stable article keys and their case independently of collection filenames', () => {
  const { postUrl } = loadTS('src/utils/posts.ts', { 'astro:content': {} });
  for (const locale of ['en', 'zh']) {
    assert.equal(postUrl(post('gdscript', { translationKey: 'GDScript' }, locale)), `/${locale}/posts/GDScript/`);
    assert.equal(postUrl(post('different-filename', { translationKey: 'stable-custom-url' }, locale)), `/${locale}/posts/stable-custom-url/`);
  }
});

test('all real non-draft articles are available, with case-correct article URLs', async () => {
  const collection = articles();
  const { getPosts, postUrl } = loadTS('src/utils/posts.ts', { 'astro:content': { getCollection: async (_name, filter = () => true) => collection.filter(filter) } });
  for (const locale of ['en', 'zh']) {
    const posts = await getPosts({ locale }), expected = collection.filter(post => !post.data.draft && post.data.locale === locale);
    assert.deepEqual(new Set(posts.map(post => post.id)), new Set(expected.map(post => post.id)));
    assert(posts.every((post, index) => index === 0 || posts[index - 1].data.pubDate >= post.data.pubDate));
    for (const post of posts) assert.equal(postUrl(post), post.href);
  }
});

test('category discovery removes empty categories while retaining their reusable display configuration', async t => {
  t.mock.method(console, 'warn', () => {});
  const { CATEGORIES, categoriesFor } = loadTS('src/data/site.ts');
  const configured = CATEGORIES.find(category => category.slug === 'data-structures');
  assert(configured, 'the category definition remains available for future posts');
  let collection = [
    post('published', { category: 'data-structures', pubDate: new Date('2026-01-01'), draft: false }),
    post('unfinished', { category: 'data-structures', pubDate: new Date('2026-02-01'), draft: true }),
    post('other', { category: 'new-topic', pubDate: new Date('2026-03-01'), draft: false }),
  ];
  const { getPosts } = loadTS('src/utils/posts.ts', {
    'astro:content': { getCollection: async (_name, filter) => collection.filter(filter) },
  });
  const discover = async () => categoriesFor((await getPosts()).map(post => post.data.category));
  assert.deepEqual((await discover()).map(category => category.slug), ['data-structures', 'new-topic']);
  assert.equal((await discover())[0], configured, 'existing names and colors remain authoritative');
  collection = collection.filter(post => post.id !== 'en/published');
  assert.deepEqual((await discover()).map(category => category.slug), ['new-topic'], 'a draft does not keep an empty published category alive');
  collection = [];
  assert.deepEqual(await discover(), [], 'neither configuration nor cached generated metadata creates a category');
  assert.equal(categoriesFor(['data-structures'])[0], configured, 'publishing another article restores the same configured category');
});
