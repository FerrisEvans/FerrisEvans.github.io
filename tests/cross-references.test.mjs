import test from 'node:test';
import assert from 'node:assert/strict';
import { fromHtml } from 'hast-util-from-html';
import config from '../astro.config.mjs';

const { processor, ...options } = config.markdown;
const renderer = await processor.createRenderer(options);
const elements = html => {
  const nodes = [];
  const visit = node => { if (node.type === 'element') nodes.push(node); for (const child of node.children ?? []) visit(child); };
  visit(fromHtml(html, { fragment: true }));
  return nodes;
};
const text = node => node.type === 'text' ? node.value : (node.children ?? []).map(text).join('');
const hasClass = (node, name) => node.properties.className?.includes(name);
const definition = (id, content) => `:::numbered{#${id}}\n${content}\n:::`;

test('prose and formulas share document-order numbers with forward and repeated references', async () => {
  const result = await renderer.render(`先看 :ref[energy]。\n\n${definition('term', '**幂等性**的定义。')}\n\n${definition('energy', '$$\nE=mc^2\n$$')}\n\n参见 :ref[term] 与 :ref[energy]。`);
  const nodes = elements(result.code);
  assert.deepEqual(nodes.filter(node => hasClass(node, 'numbered-reference')).map(node => node.properties.id), ['xref-term', 'xref-energy']);
  assert.deepEqual(nodes.filter(node => hasClass(node, 'reference-number')).map(text), ['(1)', '(2)']);
  const refs = nodes.filter(node => hasClass(node, 'cross-reference'));
  assert.deepEqual(refs.map(node => [node.properties.href, text(node)]), [['#xref-energy', '(2)'], ['#xref-term', '(1)'], ['#xref-energy', '(2)']]);
  assert(refs.every(node => node.properties.ariaLabel));
  assert.equal(result.metadata.frontmatter.hasMath, true);
  assert(nodes.some(node => hasClass(node, 'katex-display')));
  assert(!nodes.some(node => node.properties.dataFootnoteRef !== undefined), 'numbered references must not become footnotes');
});

test('reordering changes displayed numbers while stable label destinations survive, and counters reset per document', async () => {
  const block = definition('definition', '目标内容。');
  const outputs = await Promise.all([renderer.render(`${block}\n\n:ref[definition]`), renderer.render(`${definition('earlier', '新内容。')}\n\n${block}\n\n:ref[definition]`), renderer.render(`${block}\n\n:ref[definition]`)]);
  assert.deepEqual(outputs.map(output => elements(output.code).filter(node => hasClass(node, 'cross-reference')).map(node => [node.properties.href, text(node)])), [[['#xref-definition', '(1)']], [['#xref-definition', '(2)']], [['#xref-definition', '(1)']]]);
});

test('invalid numbered targets and dangling references fail the build with actionable labels', async t => {
  t.mock.method(console, 'error', () => {});
  const cases = [
    [':ref[missing]', /Unknown numbered reference: missing/],
    [`${definition('same', '一。')}\n\n${definition('same', '二。')}`, /Duplicate numbered label: same/],
    [':::numbered\n缺少标签。\n:::', /needs a label/],
    [definition('bad_id', '不合法。'), /needs a label/],
    ['::::numbered{#outer}\n:::numbered{#inner}\n嵌套。\n:::\n::::', /cannot be nested/],
    ['::ref[example]', /Use :ref\[label\]/],
    [`[^unused]:\n    :::numbered{#hidden}\n    Definition\n    :::\n\n:ref[hidden]`, /outside footnote definitions/],
    [`${definition('term', '定义。')}\n\n[See :ref[term]](https://example.com)`, /outside other links/],
    [`${definition('term', '定义。')}\n\n[See :ref[term]][external]\n\n[external]: https://example.com`, /outside other links/],
    [`## xref-term\n\n${definition('term', '定义。')}\n\n:ref[term]`, /destination xref-term must occur exactly once/],
    [`<span id="xref-term">旧锚点</span>\n\n${definition('term', '定义。')}\n\n:ref[term]`, /destination xref-term must occur exactly once/],
  ];
  for (const [markdown, error] of cases) await assert.rejects(renderer.render(markdown), error);
});

test('code examples stay literal, unrelated directives survive, and existing code groups and footnotes coexist', async () => {
  const source = '`'+':ref[not-a-reference]'+'`\n\n```markdown\n:::numbered{#not-a-target}\nLiteral.\n:::\n```\n\n:unknown[keep-me]\n\n::: unknown-block\nStill ordinary text.\n:::\n\n'+definition('real', '正文。')+'\n\n:ref[real]，补充说明。[^note]\n\n[^note]: 保留脚注。\n\n::: code-group labels=[JS, Python]\n\n```js\nconsole.log(1);\n```\n\n```python\nprint(1)\n```\n\n:::';
  const result = await renderer.render(source);
  const nodes = elements(result.code);
  assert.equal(nodes.filter(node => hasClass(node, 'numbered-reference')).length, 1);
  assert(nodes.some(node => node.tagName === 'code' && text(node) === ':ref[not-a-reference]'));
  assert(result.code.includes(':unknown[keep-me]'));
  assert.equal(nodes.filter(node => hasClass(node, 'rehype-code-group')).length, 1);
  assert.equal(nodes.filter(node => node.properties.role === 'tab').length, 2);
  assert(nodes.some(node => node.properties.dataFootnoteRef !== undefined));
});
