import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { translationErrors, readArticles, reportTranslationErrors } from '../ci/i18n-contract.mjs';
import { articleLocale } from '../../src/utils/article-metadata.mjs';
const entry = (locale, draft = false, key = 'a') => ({ path: `posts/${locale}/${key}.md`, data: { key, draft } });
test('published translations must exist and be published in both languages', () => {
  assert.deepEqual(translationErrors([entry('en'),entry('zh')]), []);
  for (const locale of ['en','zh']) {
    const other = locale === 'en' ? 'zh' : 'en';
    assert.match(translationErrors([entry(locale)])[0].message, new RegExp(`${other} translation is missing`));
    assert.match(translationErrors([entry(locale),entry(other,true)])[0].message, /still a draft/);
  }
});
test('draft-only article groups may be incomplete and do not suppress published failures', () => {
  assert.deepEqual(translationErrors([entry('en',true)]), []);
  assert.deepEqual(translationErrors([entry('en',true),entry('zh',true)]), []);
  assert.equal(translationErrors([entry('en',true,'draft'),entry('en',false,'published')]).length,1);
});
test('ambiguous translation identity and unsupported languages are rejected', () => {
  assert.match(translationErrors([entry('en'),{ ...entry('en'), path: 'posts/en/another-filename.md' },entry('zh')])[0].message,/duplicate/);
  assert.match(translationErrors([entry('fr',true)])[0].message,/locale/);
  for (const key of ['', 'has spaces', '../path', 123]) {
    assert.match(translationErrors([entry('en', true, key)])[0].message, /key|locale/);
  }
});
test('article languages require valid source directories, including nested articles', () => {
  assert.equal(articleLocale('posts/en/nested/GDScript.md'), 'en');
  assert.equal(articleLocale('posts\\zh\\nested\\note.md'), 'zh');
  for (const path of [undefined, 'en/note.md', 'posts/note.md', 'posts/fr/note.md', '/posts/en/note.md', 'posts/en/../zh/note.md', 'posts/en//note.md', 'posts/en/note.txt']) {
    assert.throws(() => articleLocale(path), /Article locale/);
  }
});
test('article readers derive locale and reject obsolete metadata or misplaced Markdown', t => {
  const root = mkdtempSync(join(tmpdir(), 'article-metadata-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'posts/en/nested'), { recursive: true });
  const file = join(root, 'posts/en/nested/other-filename.md');
  const valid = 'key: GDScript\ntitle: Example\ndate: 2026-01-01\ncategory: lang\n';
  const write = metadata => writeFileSync(file, `---\n${metadata}---\nBody\n`);
  write(valid);
  const [article] = readArticles(root);
  assert.equal(article.data.locale, 'en');
  assert.equal(article.data.key, 'GDScript');
  for (const oldField of ['locale: zh', 'translationKey: old-key', 'pubDate: 2025-01-01']) {
    write(`${valid}${oldField}\n`);
    assert.throws(() => readArticles(root), /Remove locale|Use key|Use date/);
  }
  write(valid);
  writeFileSync(join(root, 'posts/misplaced.md'), `---\n${valid}---\n`);
  assert.throws(() => readArticles(root), /Article locale/);
});
test('all real published articles have complete bilingual pairs', () => {
  const errors = translationErrors(readArticles()); reportTranslationErrors(errors);
  assert.deepEqual(errors, []);
});
