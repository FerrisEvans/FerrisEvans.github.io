/** Record actual rendered math, so authors do not need a frontmatter switch. */
export default function rehypeMathMetadata() {
  return (tree, file) => {
    let hasMath = false;
    function visit(node) {
      const classes = node.properties?.className ?? [];
      if (node.type === 'element' && classes.some?.(name => name === 'katex' || name === 'katex-error')) {
        hasMath = true;
      }
      for (const child of node.children ?? []) visit(child);
    }
    visit(tree);
    file.data.astro ??= {};
    file.data.astro.frontmatter ??= {};
    file.data.astro.frontmatter.hasMath = hasMath;
  };
}
