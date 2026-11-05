const labelPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const directiveTypes = new Set(['containerDirective', 'leafDirective', 'textDirective']);

/** remark-directive parses the syntax; this transform supplies page-local numbering. */
export default function remarkCrossReferences() {
  return (tree, file) => {
    const english = /[\/]en[\/]/.test(file.path ?? '') || file.data?.astro?.frontmatter?.locale === 'en';
    const labels = new Map();
    const references = [];
    const source = String(file.value);

    function collect(node, { inNumbered = false, inFootnote = false, inLink = false } = {}) {
      if (directiveTypes.has(node.type)) {
        if (node.name === 'numbered') {
          if (node.type !== 'containerDirective') file.fail('Use :::numbered{#label} for a numbered block.', node);
          if (inNumbered) file.fail('Numbered blocks cannot be nested.', node);
          if (inFootnote) file.fail('Put numbered blocks in the article body, outside footnote definitions.', node);
          const id = node.attributes?.id;
          if (!id || !labelPattern.test(id)) file.fail('A numbered block needs a label such as {#term-definition}: lowercase letters, digits and hyphens.', node);
          if (Object.keys(node.attributes).some(key => key !== 'id')) file.fail('Numbered blocks only accept the #label attribute.', node);
          if (labels.has(id)) file.fail(`Duplicate numbered label: ${id}`, node);
          if (!node.children?.length) file.fail(`Numbered block ${id} must contain text or a formula.`, node);
          const number = labels.size + 1;
          labels.set(id, { number, anchor: `xref-${id}` });
          for (const child of node.children) collect(child, { inNumbered: true, inFootnote, inLink });
          return;
        }
        if (node.name === 'ref') {
          if (inLink) file.fail('Put :ref[label] outside other links; it creates its own numbered link.', node);
          if (node.type !== 'textDirective' || Object.keys(node.attributes ?? {}).length || node.children.length !== 1 || node.children[0].type !== 'text' || !labelPattern.test(node.children[0].value)) {
            file.fail('Use :ref[label] to refer to a numbered block.', node);
          }
          references.push(node);
          return;
        }
        // Other directive-like prose remains literal; installing the parser
        // must not silently discard unrelated text or invent HTML elements.
        const value = source.slice(node.position.start.offset, node.position.end.offset);
        Object.assign(node, { type: 'text', value });
        delete node.children;
        return;
      }
      for (const child of node.children ?? []) collect(child, {
        inNumbered,
        inFootnote: inFootnote || node.type === 'footnoteDefinition',
        inLink: inLink || node.type === 'link' || node.type === 'linkReference',
      });
    }
    collect(tree);
    file.data.crossReferenceTargets = [...labels.values()].map(target => target.anchor);

    for (const node of references) {
      const id = node.children[0].value;
      const target = labels.get(id);
      if (!target) file.fail(`Unknown numbered reference: ${id}. Add :::numbered{#${id}} or correct the label.`, node);
      Object.assign(node, {
        type: 'link', url: `#${target.anchor}`,
        data: { hProperties: { className: ['cross-reference'], ariaLabel: english ? `See reference ${target.number}` : `参见编号 ${target.number}` } },
        children: [{ type: 'text', value: `(${target.number})` }],
      });
    }

    function render(node) {
      for (const child of node.children ?? []) render(child);
      if (node.type !== 'containerDirective' || node.name !== 'numbered') return;
      const { number, anchor } = labels.get(node.attributes.id);
      const content = node.children;
      Object.assign(node, {
        type: 'blockquote',
        data: { hName: 'div', hProperties: { id: anchor, className: ['numbered-reference'], tabIndex: -1 } },
        children: [
          { type: 'blockquote', data: { hName: 'div', hProperties: { className: ['numbered-content'] } }, children: content },
          { type: 'paragraph', data: { hName: 'a', hProperties: { href: `#${anchor}`, className: ['reference-number'], ariaLabel: english ? `Permalink to reference ${number}` : `编号 ${number} 的永久链接` } }, children: [{ type: 'text', value: `(${number})` }] },
        ],
      });
    }
    render(tree);
  };
}
