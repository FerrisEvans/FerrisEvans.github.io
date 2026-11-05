import { readArticles, reportTranslationErrors, translationErrors } from './i18n-contract.mjs';
const articles = readArticles(), errors = translationErrors(articles);
reportTranslationErrors(errors);
if (errors.length) process.exitCode = 1;
else console.log(`Bilingual publication check passed (${articles.length} language versions).`);
