import test from 'node:test';
import assert from 'node:assert/strict';
import katex from 'katex';
import { fromHtml } from 'hast-util-from-html';
import rehypeReading from '../../src/plugins/rehype-reading.mjs';
import config from '../../astro.config.mjs';

// Exercise the configured processor, including its plugin and option resolution.
const { processor, ...sharedOptions } = config.markdown;
const renderer = await processor.createRenderer(sharedOptions);

test('the configured pipeline renders inline and display math as accessible KaTeX HTML', async () => {
  const { code } = await renderer.render(String.raw`Inline $a^2+b^2=c^2$.

$$
\frac{1}{2} + \sqrt{x}
$$`);
  assert.equal((code.match(/class="katex"/g) ?? []).length, 2);
  assert.equal((code.match(/class="katex-display"/g) ?? []).length, 1);
  assert.match(code, /<math\b/);
  assert.match(code, /class="katex-html" aria-hidden="true"/);
  assert.match(code, /<annotation encoding="application\/x-tex">a\^2\+b\^2=c\^2<\/annotation>/);
  assert.doesNotMatch(code, /katex-error|language-math|math-inline|math-display/);
});

test('configured light and dark code highlighting preserves code and matching heading IDs', async () => {
  const { code, metadata } = await renderer.render('## 代码示例\n\n```ts\nconst value: string = "<node>";\n```');
  assert.match(code, /<pre\b[^>]*class="astro-code[^\"]*github-light-default[^\"]*github-dark-default/);
  assert.match(code, /data-language="ts"/);
  assert.match(code, /--shiki-dark:/);
  assert.match(code, /(?:&#x3C;|&lt;)node>/);
  assert.doesNotMatch(code, /<node>/);
  assert.equal(metadata.headings.length, 1);
  const heading = metadata.headings[0];
  assert.equal(heading.depth, 2);
  assert.equal(heading.text, '代码示例');
  assert(code.includes(`<h2 id="${heading.slug}">代码示例</h2>`));
});

test('math assets follow parsed formulas without requiring a frontmatter flag', async () => {
  for (const content of ['$x^2$', '$$\n\\sqrt{x}\n$$']) {
    const result = await renderer.render(content, { frontmatter: { math: false } });
    assert.equal(result.metadata.frontmatter.hasMath, true);
  }
  for (const content of ['普通文章。', '`$x^2$`', '```text\n$x^2$\n```', String.raw`A price is \$5.`]) {
    const result = await renderer.render(content, { frontmatter: { hasMath: true } });
    assert.equal(result.metadata.frontmatter.hasMath, false, content);
  }
});

test('configured alert and reading plugins retain notices and accessible image zoom controls', async () => {
  const { code } = await renderer.render('> [!NOTE]\n> 保留提醒内容。\n\n![示意图](/avatar.png)');
  assert.match(code, /<blockquote class="markdown-alert markdown-alert-note">/);
  assert.match(code, /class="markdown-alert-title">NOTE · 注释<\/p>/);
  assert.match(code, /保留提醒内容。/);
  assert.doesNotMatch(code, /\[!NOTE\]/);
  assert.match(code, /<figure><button\b[^>]*class="image-zoom"[^>]*aria-label="放大图片：示意图"/);
  assert.match(code, /<img\b[^>]*src="\/avatar.png"[^>]*loading="lazy"[^>]*decoding="async"/);
  assert.match(code, /<figcaption>示意图<\/figcaption>/);
});

test('reading tables retain GFM content and alignment inside one keyboard-scrollable region', async () => {
  const { code } = await renderer.render(String.raw`| Topic | Status | Time |
| :--- | :---: | ---: |
| [Guide](/about/markdown/) | **Ready** | 12 |
| \`A\|B\` | $x^2$ | 4 |

> | Nested | Value |
> | --- | --- |
> | Row | 2 |

\`\`\`text
| This is literal | code |
\`\`\``.replaceAll('\\`', '`'));
  const tree = fromHtml(code, { fragment: true });
  const tables = [];
  const collect = node => {
    for (const child of node.children ?? []) {
      if (child.tagName === 'table') tables.push({ table: child, wrapper: node });
      collect(child);
    }
  };
  collect(tree);
  assert.equal(tables.length, 2, 'code fences remain literal; nested tables are wrapped');
  for (const { table, wrapper } of tables) {
    assert.equal(wrapper.tagName, 'div');
    assert(wrapper.properties.className.includes('prose-table-scroll'));
    assert.equal(wrapper.properties.tabIndex, 0);
    assert.equal(wrapper.properties.role, 'region');
    assert(wrapper.properties.ariaLabel);
    assert.equal(wrapper.children.filter(node => node.type === 'element').length, 1);
  }
  const header = tables[0].table.children.find(node => node.tagName === 'thead');
  const row = header.children.find(node => node.tagName === 'tr');
  assert.deepEqual(row.children.filter(node => node.tagName === 'th').map(node => node.properties.align), ['left', 'center', 'right']);
  assert.match(code, /href="\/zh\/about\/markdown\/"/);
  assert.match(code, /<strong>Ready<\/strong>/);
  assert.match(code, /<code>A\|B<\/code>/);
  assert.match(code, /class="katex"/);
  const before = JSON.stringify(tree);
  rehypeReading()(tree);
  assert.equal(JSON.stringify(tree), before, 'running the reading transform again never nests table wrappers');
});

test('the site keeps math untrusted and KaTeX ignores prototype-inherited trust', async () => {
  // Official GHSA-238p-pmpm-9mq7 regression payload and pollution prerequisite:
  // https://github.com/KaTeX/KaTeX/commit/0adf7e77db6915d991803b29699f82b1ccf8d4f4
  const expression = String.raw`\href{javascript:alert(1)}{x}`;
  const inheritedOptions = Object.create({ trust: true });
  assert.doesNotMatch(katex.renderToString(expression, inheritedOptions), /<a\b/i);

  const { code } = await renderer.render(`$${expression}$`);
  assert.match(code, /class="katex"/);
  assert.doesNotMatch(code, /<a\b/i);

  const previousTrust = Object.getOwnPropertyDescriptor(Object.prototype, 'trust');
  Object.defineProperty(Object.prototype, 'trust', {
    value: true, configurable: true, enumerable: true, writable: true,
  });
  try {
    assert.doesNotMatch(katex.renderToString(expression), /<a\b/i);
  } finally {
    if (previousTrust) Object.defineProperty(Object.prototype, 'trust', previousTrust);
    else delete Object.prototype.trust;
  }
});
