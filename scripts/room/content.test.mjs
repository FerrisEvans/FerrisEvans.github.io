import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, globSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
// js-yaml is already present in the locked Astro toolchain; no new dependency.
const yaml = require('js-yaml');
const read = path => readFileSync(resolve(root, path), 'utf8');

function loadTS(path, overrides = {}) {
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    if (filename.endsWith('.json')) return JSON.parse(readFileSync(filename, 'utf8'));
    const module = { exports: {} }; cache.set(filename, module);
    const js = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const localRequire = name => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (!name.startsWith('.')) return require(name);
      const base = resolve(dirname(filename), name), target = [base, `${base}.ts`, `${base}.json`].find(existsSync);
      if (!target) throw new Error(`Missing test module ${name}`);
      return load(target);
    };
    new Function('require', 'module', 'exports', js)(localRequire, module, module.exports);
    return module.exports;
  }
  return load(resolve(root, path));
}

function articles() {
  return [...globSync('src/content/blog/**/*.md', { cwd: root })].map(path => {
    const raw = read(path), front = raw.match(/^---\s*\r?\n([\s\S]*?)^---\s*$/m);
    assert(front, `${path} has front matter`);
    const slug = path.replaceAll('\\', '/').replace(/^src\/content\/blog\//, '').replace(/\.md$/, '');
    return { id: slug.toLowerCase(), href: `/posts/${slug}/`, data: yaml.load(front[1]) };
  });
}

test('published posts exclude drafts and retain the current publication-date ordering policy', async () => {
  const fixture = [
    { id: 'old', data: { pubDate: new Date('2024-01-01'), draft: false } },
    { id: 'draft', data: { pubDate: new Date('2100-01-01'), draft: true } },
    { id: 'new', data: { pubDate: new Date('2025-01-01'), draft: false } },
    { id: 'future', data: { pubDate: new Date('2099-01-01'), draft: false } },
  ];
  const { getPosts } = loadTS('src/utils/posts.ts', { 'astro:content': {
    getCollection: async (name, filter = () => true) => { assert.equal(name, 'blog'); return fixture.filter(filter); },
  } });
  assert.deepEqual((await getPosts()).map(post => post.id), ['future', 'new', 'old']);
});

test('all real non-draft articles are available, with case-correct article URLs', async () => {
  const collection = articles();
  const { getPosts, postUrl } = loadTS('src/utils/posts.ts', { 'astro:content': { getCollection: async (_name, filter = () => true) => collection.filter(filter) } });
  const posts = await getPosts(), expected = collection.filter(post => !post.data.draft);
  assert.deepEqual(new Set(posts.map(post => post.id)), new Set(expected.map(post => post.id)));
  assert(posts.every((post, index) => index === 0 || posts[index - 1].data.pubDate >= post.data.pubDate));
  for (const post of posts) assert.equal(postUrl(post), post.href);
});

test('the twelve manually selected tapes have implemented visuals and published article destinations', () => {
  const tapes = JSON.parse(read('src/data/room-tapes.json'));
  const source = ts.createSourceFile('tapes.ts', read('src/scripts/room/tapes.ts'), ts.ScriptTarget.Latest, true);
  const visualType = source.statements.find(node => ts.isTypeAliasDeclaration(node) && node.name.text === 'TapeKind');
  const kinds = new Set(visualType.type.types.map(node => node.literal.text));
  const painterDeclaration = source.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(source) === 'painters');
  const painters = new Set(painterDeclaration.initializer.properties.map(node => node.name.text));
  assert.deepEqual(kinds, painters);
  const published = new Set(articles().filter(post => !post.data.draft).map(post => post.href));
  const slots = [...Array.from({ length: 5 }, (_, i) => `VHS_A_${i + 1}`), ...Array.from({ length: 7 }, (_, i) => `VHS_B_${i + 1}`)];
  assert.deepEqual(tapes.map(tape => tape.object), slots);
  assert.equal(new Set(tapes.map(tape => tape.id)).size, tapes.length);
  for (const tape of tapes) {
    assert(kinds.has(tape.kind), `${tape.id} requires a deliberately implemented animation kind`);
    assert(published.has(tape.href), `${tape.id} must link to a real non-draft article`);
    assert(tape.title.trim() && tape.description.trim());
    assert(/^[\x20-\x7e]{1,14}$/u.test(tape.label), `${tape.id} has a short English label`);
  }
});

const { ABOUT, aboutGreeting, aboutInterests, aboutPlainText } = loadTS('src/data/room-about.ts');
const { SITE } = loadTS('src/data/site.ts');
const { computerPages, paginateComputerSections, paintComputer } = loadTS('src/scripts/room/computer.ts');
const normalize = value => value.replace(/\s+/gu, '');

test('computer pages preserve every shared About passage in order, including all bilingual Zen entries', () => {
  const pages = computerPages(SITE), visible = normalize(pages.flatMap(page => page.lines).join(''));
  const passages = [ABOUT.intro, ...aboutInterests().flatMap(item => [item.label, item.description]), ...ABOUT.principles,
    ...ABOUT.practice.quotes, ABOUT.practice.attribution, ABOUT.zen.author, ABOUT.zen.command, ...ABOUT.zen.lines,
    ...ABOUT.formatting.paragraphs.map(aboutPlainText)];
  let cursor = 0;
  for (const passage of passages) {
    const value = normalize(passage), at = visible.indexOf(value, cursor);
    assert(at >= cursor, `About passage was omitted, reordered or truncated: ${passage}`);
    cursor = at + value.length;
  }
  assert.equal(pages[0].title, aboutGreeting(SITE.author));
  assert(pages[0].lines.length > 3, 'the short introduction shares its page with the next section');
  assert(pages.every(page => page.title && page.lines.length > 0 && page.lines.length <= 8));
  const interestLabels = aboutInterests().map((item, i) => `${String(i + 1).padStart(2, '0')}  ${item.label}`);
  assert(pages.every(page => !interestLabels.includes(page.lines.at(-1))), 'interest headings stay with their descriptions');
  assert(pages.flatMap(page => page.lines).every(line => [...line].reduce((sum, c) => sum + (c.codePointAt(0) < 128 ? 1 : 2), 0) <= 54));
  const tags = new Set(['strong', 'code', 'em', 'sub', 'span', 'u']);
  for (const part of ABOUT.formatting.paragraphs.flat()) assert(!part.tag || tags.has(part.tag));
});

test('short sections flow together, while long paragraphs cross pages without losing content or context', () => {
  const long = '这是用于验证连续分页的段落。'.repeat(45);
  const pages = paginateComputerSections([
    { title: '介绍', paragraphs: ['短介绍。'] },
    { title: '原则', paragraphs: ['第一条。', long, '结束。'] },
    { title: '空章节', paragraphs: [] },
  ]);
  assert(pages[0].lines.includes('— 原则 —'));
  assert(pages.slice(1).every(page => page.title === '原则'));
  assert(pages.every(page => page.lines.length <= 8 && !/^— .* —$/u.test(page.lines.at(-1))));
  const text = normalize(pages.flatMap(page => page.lines).join(''));
  assert(text.includes(normalize(long)));
  assert(text.endsWith('结束。'));
  assert.deepEqual(paginateComputerSections([{ title: '空', paragraphs: [] }]), []);
});

test('oversized tokens and the last page are complete rather than ellipsized', () => {
  const text = 'x'.repeat(600) + '结尾';
  const pages = paginateComputerSections([{ title: '长词', paragraphs: [text] }]);
  assert.equal(pages.flatMap(page => page.lines).join(''), text);
  assert(pages.every(page => page.title === '长词' && page.lines.length <= 8));
});


test('Online paints the complete site introduction above the terminal footer', () => {
  const drawn = [];
  const context = new Proxy({}, { get: (target, key) => key === 'fillText'
    ? (value, x, y) => drawn.push({ value, x, y, font: target.font })
    : key in target ? target[key] : () => {} });
  paintComputer(context, { title: '', lines: [] }, 0, 1, 'online', SITE);
  const introduction = drawn.filter(item => item.y > 357 && item.y < 510);
  assert.equal(normalize(introduction.map(item => item.value).join('')), normalize(SITE.intro), 'no introduction text is clipped or omitted');
  assert(introduction.every(item => item.y + 6 < 492), 'font descenders stay above the panel bottom');
  assert(drawn.some(item => item.value === SITE.github && item.y < 257));
  assert(drawn.some(item => item.value === SITE.email && item.y < 357));
});
