import { frontmatter as writing } from '../content/pages/writing-guide.md';
import { frontmatter as markdown } from '../content/pages/markdown-features.md';
import { frontmatter as writingEn } from '../content/pages/en/writing-guide.md';
import { frontmatter as markdownEn } from '../content/pages/en/markdown-features.md';
import { type Locale, localizePath, t } from '../i18n';
import { aboutFor } from './room-about';

/** Reading pages live outside the dated blog feed and its category indexes. */
export function guidesFor(locale: Locale) {
  const about = aboutFor(locale);
  const writingGuide = locale === 'en' ? writingEn : writing;
  const markdownGuide = locale === 'en' ? markdownEn : markdown;
  return [
    { href: localizePath('/about/python-zen/', locale), id: 'python-zen', title: about.zen.title, description: t(locale, '十九条关于简洁、明确与可读性的编程思考，中英对照。', 'Nineteen thoughts on simplicity, clarity, and readable code.'), label: t(locale, '编程哲学 · Tim Peters', 'Programming philosophy · Tim Peters'), icon: 'leaf' },
    { href: localizePath('/about/writing/', locale), id: 'writing-guide', title: writingGuide.title, description: writingGuide.description, label: t(locale, '写作与排版', 'Writing and typography'), icon: 'book' },
    { href: localizePath('/about/markdown/', locale), id: 'markdown-features', title: markdownGuide.title, description: markdownGuide.description, label: t(locale, '语法与效果', 'Syntax and examples'), icon: 'code' },
  ];
}

export const ABOUT_GUIDES = guidesFor('zh');
