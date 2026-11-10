/**
 * Resolve an article's language from its project-relative source path, never its ID or key.
 * @param {string | undefined} filePath
 * @returns {'en' | 'zh'}
 */
export function articleLocale(filePath) {
  const parts = typeof filePath === 'string' ? filePath.replaceAll('\\', '/').split('/') : [];
  const locale = parts[1];
  if (parts[0] !== 'posts' || (locale !== 'en' && locale !== 'zh') || parts.length < 3
    || parts.some(part => !part || part === '.' || part === '..') || !parts.at(-1).endsWith('.md')) {
    throw new Error(`Article locale must come from posts/en/**/*.md or posts/zh/**/*.md: ${filePath ?? '(missing file path)'}`);
  }
  return locale;
}

/** Catch obsolete fields before a schema can silently discard them. */
export function articleMetadataErrors(data) {
  if (!data || typeof data !== 'object') return [];
  const replacements = {
    translationKey: 'Use key instead of translationKey.',
    pubDate: 'Use date instead of pubDate.',
    locale: 'Remove locale; the article language comes from its posts/en/ or posts/zh/ directory.',
  };
  return Object.entries(replacements)
    .filter(([field]) => Object.hasOwn(data, field))
    .map(([field, message]) => ({ field, message }));
}
