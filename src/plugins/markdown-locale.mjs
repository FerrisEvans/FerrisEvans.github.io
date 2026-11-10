import { isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { articleLocale } from '../utils/article-metadata.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

/** Articles use their source directory; standalone documents retain their own locale. */
export function markdownLocale(file = {}) {
  const path = (file.path ?? '').replaceAll('\\', '/');
  const source = (isAbsolute(path) ? relative(root, path) : path).replaceAll('\\', '/');
  if (source.startsWith('posts/')) return articleLocale(source);
  return file.data?.astro?.frontmatter?.locale === 'en' ? 'en' : 'zh';
}
