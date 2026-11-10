import { globSync, readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { articleLocale, articleMetadataErrors } from '../../src/utils/article-metadata.mjs';

/** Publication is atomic across languages; drafts do not satisfy a published counterpart. */
export function translationErrors(entries) {
  const groups = new Map(), errors = [];
  for (const entry of entries) {
    let locale;
    try { locale = articleLocale(entry.path); }
    catch (error) { errors.push({ file: entry.path, message: error.message }); continue; }
    const { key } = entry.data;
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]+$/.test(key)) {
      errors.push({ file: entry.path, message: 'Every article needs a key using letters, numbers, underscores, or hyphens.' });
      continue;
    }
    const group = groups.get(key) ?? new Map();
    if (group.has(locale)) errors.push({ file: entry.path, message: `${key}: duplicate ${locale} version (${group.get(locale).path}).` });
    else group.set(locale, entry);
    groups.set(key, group);
  }
  for (const [key, group] of groups) {
    const published = [...group.values()].find(entry => entry.data.draft !== true);
    if (!published) continue;
    for (const locale of ['en','zh']) {
      const version = group.get(locale);
      if (!version || version.data.draft === true) errors.push({ file: version?.path ?? published.path,
        message: `${key}: ${locale} translation ${version ? 'is still a draft' : 'is missing'}. Both en and zh must be non-draft before publishing. Existing version: ${published.path}` });
    }
  }
  return errors;
}
export function readArticles(root = process.cwd()) {
  return [...globSync('posts/**/*.md', { cwd: root })].map(path => {
    const raw = readFileSync(`${root}/${path}`, 'utf8');
    const match = raw.match(/^---\s*\r?\n([\s\S]*?)^---\s*$/m);
    if (!match) throw new Error(`${path}: missing front matter`);
    const data = yaml.load(match[1]);
    const obsolete = articleMetadataErrors(data);
    if (obsolete.length) throw new Error(`${path}: ${obsolete.map(error => error.message).join(' ')}`);
    return { path, data: { ...data, locale: articleLocale(path) } };
  });
}
export function reportTranslationErrors(errors) {
  for (const error of errors) {
    console.error(`${error.file}: ${error.message}`);
    if (process.env.GITHUB_ACTIONS) {
      const escape = value => value.replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A');
      console.error(`::error file=${escape(error.file)},title=Incomplete bilingual article::${escape(error.message)}`);
    }
  }
}
