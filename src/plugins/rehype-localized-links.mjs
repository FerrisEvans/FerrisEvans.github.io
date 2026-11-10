import { markdownLocale } from './markdown-locale.mjs';

/** Keep authored internal links in the article's language; asset URLs stay shared. */
export default function rehypeLocalizedLinks() {
  return (tree, file = {}) => {
    const locale = markdownLocale(file);
    function visit(node) {
      if (node.type === 'element' && node.tagName === 'a') {
        const href = node.properties?.href;
        if (typeof href === 'string' && /^\/(?:posts|about|notes|tags|categories|archives|search|explore)(?:\/|[?#]|$)/.test(href)) node.properties.href = `/${locale}${href}`;
      }
      for (const child of node.children ?? []) visit(child);
    }
    visit(tree);
  };
}
