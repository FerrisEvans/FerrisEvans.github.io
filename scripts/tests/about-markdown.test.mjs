import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromHtml } from 'hast-util-from-html';
import config from '../../astro.config.mjs';

const { processor, ...options } = config.markdown;
const renderer = await processor.createRenderer(options);
const fileURL = new URL('../../src/content/pages/markdown-features.md', import.meta.url);
const markdown = readFileSync(fileURL, 'utf8')
  .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
const rendered = await renderer.render(markdown, { fileURL });
const nodes = [];
const visit = node => {
  if (node.type === 'element') nodes.push(node);
  for (const child of node.children ?? []) visit(child);
};
visit(fromHtml(rendered.code, { fragment: true }));
const hasClass = (node, name) => node.properties.className?.includes(name);
const textContent = node => node.type === 'text' ? node.value : (node.children ?? []).map(textContent).join('');

test('the reference separates syntax layers and renders actual GFM extensions', () => {
  assert.equal(config.markdown.processor.options.gfm, true);
  assert.deepEqual(nodes.filter(node => node.tagName === 'h2' && node.properties.id !== 'footnote-label').map(textContent), [
    'CommonMark 基础', 'GFM 正式扩展', '内嵌 HTML', '本站插件与渲染增强', '发布元数据',
  ]);
  assert(!nodes.some(node => node.tagName === 'h1'), 'the page layout owns the only h1');
  assert.equal(nodes.filter(node => node.tagName === 'hr').length, 1, 'the CommonMark thematic-break example keeps native separator semantics');
  assert(nodes.some(node => node.tagName === 'code' && textContent(node).includes('\n---\n')), 'the thematic-break source example remains literal code');
  const exampleTable = nodes.find(node => node.tagName === 'table' && textContent(node).includes('用时（ms）'));
  assert(exampleTable, 'the GFM table example must render as a table');
  const columns = [];
  const collectHeaders = node => {
    if (node.tagName === 'th') columns.push(node);
    for (const child of node.children ?? []) collectHeaders(child);
  };
  collectHeaders(exampleTable);
  assert.deepEqual(columns.map(node => node.properties.align), ['left', 'center', 'right']);
  assert(textContent(exampleTable).includes('A|B'), 'escaped pipes stay in a table cell');
  assert(nodes.some(node => node.tagName === 'del' && textContent(node).includes('每次重新计算')));
  assert(nodes.some(node => node.tagName === 'a' && node.properties.href === 'https://example.com' && textContent(node) === 'https://example.com'));
  assert(nodes.some(node => node.tagName === 'a' && node.properties.href === 'mailto:writer@example.com'));
  const tasks = nodes.filter(node => node.tagName === 'input' && node.properties.type === 'checkbox');
  assert(tasks.some(node => node.properties.checked === true));
  assert(tasks.some(node => node.properties.checked !== true));
  assert(tasks.every(node => node.properties.disabled === true));
  assert(nodes.some(node => node.tagName === 'code' && textContent(node).includes('| :--- | :---: | ---: |')), 'source examples remain literal code');
});

test('the syntax reference renders every documented alert and one two-language code group', () => {
  const alerts = nodes.filter(node => hasClass(node, 'markdown-alert'));
  assert.equal(alerts.length, 5);
  for (const type of ['note', 'tip', 'important', 'warning', 'caution']) {
    assert(alerts.some(node => hasClass(node, `markdown-alert-${type}`)));
  }
  assert.equal(nodes.filter(node => hasClass(node, 'rehype-code-group')).length, 1);
  assert.equal(nodes.filter(node => node.properties.role === 'tab').length, 2);
  const panels = nodes.filter(node => node.properties.role === 'tabpanel');
  assert.equal(panels.length, 2);
  assert(panels.every(node => node.properties.hidden !== true), 'all examples remain readable without JavaScript');
  const ids = nodes.map(node => node.properties.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, 'code groups and document anchors must not share IDs');
});

test('guide formulas, footnote round trips and heading links have real rendered destinations', () => {
  assert.equal(rendered.metadata.frontmatter.hasMath, true);
  assert(nodes.some(node => hasClass(node, 'katex-display')));
  assert.equal(nodes.filter(node => node.properties.dataFootnoteRef === '').length, 1);
  const byId = new Map(nodes.filter(node => node.properties.id).map(node => [node.properties.id, node]));
  const internalLinks = nodes.filter(node => node.tagName === 'a' && node.properties.href?.startsWith('#'));
  assert(internalLinks.length >= 5);
  for (const link of internalLinks) {
    assert(byId.has(decodeURIComponent(link.properties.href.slice(1))), `missing target for ${link.properties.href}`);
  }
  for (const id of ['small-example']) {
    assert(byId.has(`user-content-fn-${id}`));
    assert(byId.has(`user-content-fnref-${id}`));
  }
  assert.deepEqual(nodes.filter(node => hasClass(node, 'reference-number')).map(textContent), ['(1)', '(2)']);
  assert.deepEqual(nodes.filter(node => hasClass(node, 'cross-reference')).map(node => node.properties.href), ['#xref-idempotency', '#xref-energy']);
  assert(byId.has('xref-idempotency') && byId.has('xref-energy'));
  assert.match(rendered.code, /<details>\s*<summary>查看推导思路<\/summary>\s*<p>先确认<strong>输入条件<\/strong>/);
  assert.equal(nodes.filter(node => node.tagName === 'kbd').length, 4);
  assert(nodes.some(node => node.tagName === 'sub' && textContent(node) === '2'));
  assert(nodes.some(node => node.tagName === 'sup' && textContent(node) === '2'));
  assert.deepEqual(rendered.metadata.localImagePaths, ['../../../posts/img/rag.jpeg']);
  assert(nodes.some(node => {
    if (node.tagName !== 'img' || !node.properties.__astro_image_) return false;
    const image = JSON.parse(node.properties.__astro_image_);
    return image.src === '../../../posts/img/rag.jpeg' && image.alt === '检索增强生成的流程示意图';
  }));
  assert(nodes.some(node => node.tagName === 'a' && node.properties.href === '/zh/about/writing/'));
});

test('the English syntax guide preserves rendered features and localizes reader-facing labels', async () => {
  const fileURL = new URL('../../src/content/pages/en/markdown-features.md', import.meta.url);
  const source = readFileSync(fileURL, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  const english = await renderer.render(source, { fileURL });
  const elements = [];
  function collect(node) {
    if (node.type === 'element') elements.push(node);
    for (const child of node.children ?? []) collect(child);
  }
  collect(fromHtml(english.code, { fragment: true }));
  const byId = new Map(elements.filter(node => node.properties.id).map(node => [node.properties.id, node]));
  for (const link of elements.filter(node => node.tagName === 'a' && node.properties.href?.startsWith('#'))) {
    assert(byId.has(decodeURIComponent(link.properties.href.slice(1))), `missing English target for ${link.properties.href}`);
  }
  assert.equal(elements.filter(node => hasClass(node, 'markdown-alert')).length, 5);
  assert.equal(elements.filter(node => hasClass(node, 'rehype-code-group')).length, 1);
  assert.equal(elements.filter(node => hasClass(node, 'numbered-reference')).length, 2);
  assert.equal(english.metadata.frontmatter.hasMath, true);
  assert(elements.some(node => node.properties['aria-label']?.startsWith('Enlarge image') || node.properties.ariaLabel?.startsWith('Enlarge image')));
  assert(elements.some(node => node.tagName === 'a' && node.properties.href === '/en/about/writing/'));
  assert.doesNotMatch(textContent(fromHtml(english.code, { fragment: true })), /[\u3400-\u9fff]/u);
});
