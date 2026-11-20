import { tagId } from './tags.mjs';

// Retired entry points, not tag synonyms. Published content may reclaim a path.
export const legacyRoutes = Object.freeze({
  '/categories/programming-language/': '/notes/',
  '/posts/markdown-writing-guide/': '/about/writing/',
  '/about/markdown/': '/about/writing/',
  '/about/markdown-writing/': '/about/writing/',
  '/categories/writing/': '/about/writing/',
  '/tags/markdown/': '/about/writing/',
  '/tags/writing/': '/about/writing/',
  '/tags/code-examples/': '/about/writing/',
  '/tags/写作/': '/about/writing/',
  '/tags/代码示例/': '/about/writing/',
  '/tags/godot/': '/notes/',
  '/tags/agent/': '/categories/ai/',
  '/tags/frame/': '/notes/',
  '/tags/oop/': '/notes/',
  '/tags/reference/': '/notes/',
  '/tags/open-source/': '/notes/',
});

/** @param {Iterable<string>} activePaths Unlocalized published route paths. */
export function legacyRedirects(activePaths = []) {
  const active = new Set([...activePaths].map(path => decodeURIComponent(path)));
  return Object.entries(legacyRoutes).filter(([from]) => !active.has(from));
}

/**
 * @param {Iterable<{data: {key: string, category: string, tags?: string[]}}>} articles
 * @returns {Set<string>}
 */
export function articleRoutePaths(articles) {
  const paths = new Set();
  for (const { data } of articles) {
    paths.add(`/posts/${data.key}/`);
    paths.add(`/categories/${data.category}/`);
    for (const tag of data.tags ?? []) paths.add(`/tags/${tagId(tag)}/`);
  }
  return paths;
}
