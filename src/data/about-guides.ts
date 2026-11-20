import { frontmatter as writing } from '../guides/writing-guide.md';
import { frontmatter as writingEn } from '../guides/en/writing-guide.md';
import { type Locale, localizePath, t } from '../i18n';
import { aboutFor } from './room-about';

/** Reading pages live outside the dated blog feed and its category indexes. */
export function guidesFor(locale: Locale) {
  const about = aboutFor(locale);
  const writingGuide = locale === 'en' ? writingEn : writing;
  return [
    { href: localizePath('/about/python-zen/', locale), id: 'python-zen', title: about.zen.title, description: t(locale, '十九条关于简洁、明确与可读性的编程思考，中英对照。', 'Nineteen thoughts on simplicity, clarity, and readable code.'), label: t(locale, '编程哲学 · Tim Peters', 'Programming philosophy · Tim Peters'), icon: 'leaf' },
    { href: localizePath('/about/writing/', locale), id: 'writing-guide', title: writingGuide.title, description: writingGuide.description, label: t(locale, '写作与排版', 'Writing and typography'), icon: 'book' },
  ];
}
