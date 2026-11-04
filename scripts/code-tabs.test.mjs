import test from 'node:test';
import assert from 'node:assert/strict';
import { fromHtml } from 'hast-util-from-html';
import config from '../astro.config.mjs';

const { processor, ...sharedOptions } = config.markdown;
const renderer = await processor.createRenderer(sharedOptions);
const fence = (language, code) => `\`\`\`${language}\n${code}\n\`\`\``;
const group = (labels, blocks) => `::: code-group labels=[${labels.join(', ')}]\n\n${blocks.join('\n\n')}\n\n:::`;
const pair = group(['GDScript', 'C#'], [fence('gdscript', 'print("你好")'), fence('csharp', 'GD.Print("你好");')]);
const elements = html => {
  const result = [];
  const visit = node => {
    if (node.type === 'element') result.push(node);
    for (const child of node.children ?? []) visit(child);
  };
  visit(fromHtml(html, { fragment: true }));
  return result;
};
const textContent = node => node.type === 'text' ? node.value : (node.children ?? []).map(textContent).join('');

test('line gutters preserve blank lines, indentation, escaped source and a trailing newline without adding copyable text', async () => {
  const source = ['const text = "<tag>&值";', '', '\tif (text) {', '  console.log(text);', '}', '', 'seven', 'eight', 'nine', 'ten', ''].join('\n');
  for (const language of ['js', 'text', '']) {
    const { code } = await renderer.render(fence(language, source));
    const nodes = elements(code);
    const pre = nodes.find(node => node.tagName === 'pre');
    const codeNode = nodes.find(node => node.tagName === 'code');
    assert.equal(textContent(codeNode), source, 'the code text must be byte-for-byte unchanged');
    assert.equal(pre.properties.dataLineNumbers, '');
    assert.match(pre.properties.style, /--code-line-digits:2(?:;|$)/);
    const lines = codeNode.children.filter(node => node.type === 'element' && node.properties.className?.includes('line'));
    assert.equal(lines.length, source.split('\n').length);
    for (const [index, line] of lines.entries()) {
      const gutter = line.children[0];
      assert(gutter.properties.className.includes('code-line-number'));
      assert.equal(gutter.properties.dataLineNumber, String(index + 1));
      assert.equal(gutter.properties.ariaHidden, 'true');
      assert.deepEqual(gutter.children, [], 'the number lives only in an attribute, never in copied code');
      assert.equal(textContent(line), source.split('\n')[index]);
    }
    assert(!nodes.some(node => node.tagName === 'tag'), 'escaped code stays text');
  }
});

test('each tab panel starts line numbering at one and keeps every source line without JavaScript', async () => {
  const sources = ['first\n\n  third', 'alpha\nbeta\n'];
  const { code } = await renderer.render(group(['Text A', 'Text B'], sources.map(source => fence('text', source))));
  const nodes = elements(code);
  const panels = nodes.filter(node => node.properties.role === 'tabpanel');
  assert.equal(panels.length, 2);
  for (const [index, panel] of panels.entries()) {
    assert.equal(panel.properties.hidden, undefined);
    const pre = panel.children.find(node => node.tagName === 'pre');
    const codeNode = pre.children.find(node => node.tagName === 'code');
    assert.equal(textContent(codeNode), sources[index]);
    const lines = codeNode.children.filter(node => node.type === 'element');
    assert.deepEqual(lines.map(line => line.children[0].properties.dataLineNumber), ['1', '2', '3']);
  }
});

test('installed code-group plugin preserves real Shiki highlighting, accessible associations and no-JS content', async () => {
  const { code } = await renderer.render(pair);
  const nodes = elements(code);
  assert.equal(nodes.filter(node => node.properties.className?.includes('rehype-code-group')).length, 1);
  const tabs = nodes.filter(node => node.properties.role === 'tab');
  const panels = nodes.filter(node => node.properties.role === 'tabpanel');
  assert.equal(tabs.length, 2);
  assert.equal(panels.length, 2);
  for (let i = 0; i < tabs.length; i++) {
    assert.deepEqual(tabs[i].properties.ariaControls, [panels[i].properties.id]);
    assert.deepEqual(panels[i].properties.ariaLabelledBy, [tabs[i].properties.id]);
    assert.equal(panels[i].properties.hidden, undefined, 'no JavaScript must leave every panel readable');
  }
  assert.equal((code.match(/class="astro-code/g) ?? []).length, 2);
  assert.match(code, /--shiki-dark:/);
  assert.match(code, /data-language="gdscript"/);
  assert.match(code, /data-language="csharp"/);
  assert.doesNotMatch(code, /<script|<style|::: code-group/);
});

test('multiple groups receive distinct IDs and ordinary code remains outside the tabs', async () => {
  const { code } = await renderer.render(`${pair}\n\nAnother example.\n\n${pair}\n\n${fence('js', 'console.log("plain");')}`);
  const nodes = elements(code);
  assert.equal(nodes.filter(node => node.properties.role === 'tablist').length, 2);
  assert.equal(nodes.filter(node => node.tagName === 'pre').length, 5);
  const ids = nodes.map(node => node.properties.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
  assert.match(code, /<p>Another example\.<\/p>/);
});

test('one code block works as one labelled panel without removing code', async () => {
  const { code } = await renderer.render(group(['Python'], [fence('python', 'print(42)')]));
  const nodes = elements(code);
  assert.equal(nodes.filter(node => node.properties.role === 'tab').length, 1);
  assert.equal(nodes.filter(node => node.properties.role === 'tabpanel').length, 1);
  assert.match(code, /data-language="python"/);
});

test('label text and code cannot inject HTML or event handlers', async () => {
  const { code } = await renderer.render(group(['&lt;img src=x onerror=bad&gt;', 'Python 3'], [fence('js', 'const value = "<script>";'), fence('python', 'print("safe")')]));
  const nodes = elements(code);
  assert.equal(nodes.filter(node => node.properties.role === 'tab').length, 2);
  assert(!nodes.some(node => ['img', 'script'].includes(node.tagName)));
  assert(nodes.every(node => !Object.keys(node.properties ?? {}).some(key => /^on/i.test(key))));
});

test('a mismatched label count fails with an actionable authoring error', async t => {
  t.mock.method(console, 'error', () => {});
  await assert.rejects(renderer.render(group(['Only one'], [fence('js', 'one()'), fence('python', 'two()')])), /Code group has 1 labels but 2 panels/);
});

test('groups work in blockquotes and example fences do not become tabs', async () => {
  const quoted = pair.split('\n').map(line => `> ${line}`).join('\n');
  const example = `\`\`\`\`markdown\n${pair}\n\`\`\`\``;
  const { code } = await renderer.render(`${quoted}\n\n${example}`);
  assert.equal(elements(code).filter(node => node.properties.role === 'tablist').length, 1);
  assert.match(code, /<blockquote>/);
  assert.match(code, /data-language="markdown"/);
});
