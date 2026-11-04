/**
 * Decorative line gutters stay out of code text and copied selections.
 * CSS renders the number from the attribute; Shiki keeps all source whitespace.
 * @type {import('shiki').ShikiTransformer}
 */
export const codeLineNumbers = {
  name: 'praxis-code-line-numbers',
  line(node, line) {
    node.children.unshift({
      type: 'element',
      tagName: 'span',
      properties: {
        className: ['code-line-number'],
        dataLineNumber: String(line),
        ariaHidden: 'true',
      },
      children: [],
    });
  },
  pre(node) {
    node.properties.dataLineNumbers = '';
    const digits = String(this.lines.length).length;
    node.properties.style = `${node.properties.style ?? ''};--code-line-digits:${digits}`;
  },
};
