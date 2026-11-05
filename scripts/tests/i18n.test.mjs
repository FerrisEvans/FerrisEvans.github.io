import test from 'node:test';
import assert from 'node:assert/strict';
import { translationErrors, readArticles, reportTranslationErrors } from '../ci/i18n-contract.mjs';
const entry = (locale, draft = false, key = 'a') => ({ path: `posts/${locale}/${key}.md`, data: { locale, translationKey: key, draft } });
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
  assert.match(translationErrors([entry('en'),entry('en'),entry('zh')])[0].message,/duplicate/);
  assert.match(translationErrors([entry('fr',true)])[0].message,/locale/);
});
test('all real published articles have complete bilingual pairs', () => {
  const errors = translationErrors(readArticles()); reportTranslationErrors(errors);
  assert.deepEqual(errors, []);
});
