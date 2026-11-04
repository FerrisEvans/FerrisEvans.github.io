import { rehypeHeadingIds } from '@astrojs/markdown-remark';
import { fromHtml } from 'hast-util-from-html';

/** Reject ambiguous fragment destinations instead of publishing wrong jumps. */
export default function rehypeCrossReferenceTargets() {
  const assignHeadings = rehypeHeadingIds();
  return (tree, file) => {
    const targets = file.data.crossReferenceTargets ?? [];
    if (!targets.length) return;
    // Astro assigns heading IDs after user plugins by default. Its public
    // plugin can run early, and the final pass preserves the assigned IDs.
    assignHeadings(tree, file);
    const counts = new Map(targets.map(id => [id, 0]));
    function visit(node) {
      if (node.type === 'raw') {
        visit(fromHtml(node.value, { fragment: true }));
        return;
      }
      const id = node.properties?.id;
      if (counts.has(id)) counts.set(id, counts.get(id) + 1);
      for (const child of node.children ?? []) visit(child);
    }
    visit(tree);
    for (const [id, count] of counts) {
      if (count !== 1) file.fail(`Numbered destination ${id} must occur exactly once (found ${count}). Change the numbered label or the conflicting heading/HTML id.`);
    }
  };
}
