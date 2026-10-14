const MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/;

const LABELS = {
  note: 'NOTE · 注释',
  tip: 'TIP · 技巧',
  important: 'IMPORTANT · 重要',
  warning: 'WARNING · 注意',
  caution: 'CAUTION · 警示',
};

function firstTextNode(node) {
  if (!node) return null;
  if (node.type === 'text') return node;
  for (const child of node.children ?? []) {
    const found = firstTextNode(child);
    if (found) return found;
  }
  return null;
}

function visit(node) {
  if (node.type === 'element' && node.tagName === 'blockquote') {
    transform(node);
  }
  for (const child of node.children ?? []) visit(child);
}

function transform(blockquote) {
  const firstP = blockquote.children?.find((c) => c.type === 'element' && c.tagName === 'p');
  const text = firstTextNode(firstP);
  if (!text) return;
  const match = text.value.match(MARKER);
  if (!match) return;
  const type = match[1].toLowerCase();
  text.value = text.value.slice(match[0].length);

  const parent = firstP.children.includes(text)
    ? firstP
    : firstP.children.find((c) => c.type === 'element' && firstTextNode(c) === text);
  if (parent) {
    const idx = parent.children.indexOf(text);
    let probe = idx + 1;
    if (text.value === '') {
      parent.children.splice(idx, 1);
      probe = idx;
    }
    const next = parent.children[probe];
    if (next && next.type === 'element' && next.tagName === 'br') {
      parent.children.splice(probe, 1);
    }
  }

  const cls = blockquote.properties.className ?? [];
  blockquote.properties.className = ['markdown-alert', `markdown-alert-${type}`, ...cls];
  blockquote.children.unshift({
    type: 'element',
    tagName: 'p',
    properties: { className: ['markdown-alert-title'] },
    children: [{ type: 'text', value: LABELS[type] ?? match[1] }],
  });
}

export default function rehypeGithubAlerts() {
  return (tree) => visit(tree);
}
