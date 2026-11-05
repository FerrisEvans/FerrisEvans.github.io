import { globSync, readFileSync } from 'node:fs';
import yaml from 'js-yaml';

/** Publication is atomic across languages; drafts do not satisfy a published counterpart. */
export function translationErrors(entries) {
  const groups = new Map(), errors = [];
  for (const entry of entries) {
    const { locale, translationKey } = entry.data;
    if (!['en','zh'].includes(locale) || !translationKey) {
      errors.push({ file: entry.path, message: 'Every article needs locale (en or zh) and a translationKey.' });
      continue;
    }
    const group = groups.get(translationKey) ?? new Map();
    if (group.has(locale)) errors.push({ file: entry.path, message: `${translationKey}: duplicate ${locale} version (${group.get(locale).path}).` });
    else group.set(locale, entry);
    groups.set(translationKey, group);
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
  return [...globSync('posts/{en,zh}/**/*.md', { cwd: root })].map(path => {
    const raw = readFileSync(`${root}/${path}`, 'utf8');
    const match = raw.match(/^---\s*\r?\n([\s\S]*?)^---\s*$/m);
    if (!match) throw new Error(`${path}: missing front matter`);
    return { path, data: yaml.load(match[1]) };
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
