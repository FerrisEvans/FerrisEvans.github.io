import translations from './messages.json';

export const locales = ['en', 'zh'] as const;
export type Locale = typeof locales[number];
export const languageTag = (locale: Locale) => locale === 'zh' ? 'zh-CN' : 'en';
export function getLocale(pathname: string): Locale {
  return /^\/zh(?:\/|$)/.test(pathname) ? 'zh' : 'en';
}
export function localeForDocument(): Locale {
  return typeof document !== 'undefined' && document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';
}
export function stripLocale(path: string): string {
  return path.replace(/^\/(?:en|zh)(?=\/|[?#]|$)/, '') || '/';
}
export function localizePath(path: string, locale: Locale): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  const plain = stripLocale(path);
  if (/^\/(?:_astro|assets|brand|island|fonts|vendor|pagefind|cursors)\//.test(plain) || /^\/(?:favicon|sw\.|release\.json)/.test(plain)) return path;
  return `/${locale}${plain.startsWith('/') ? plain : '/' + plain}`;
}
export function t(locale: Locale, zh: string, en?: string): string {
  if (locale === 'zh') return zh;
  return en ?? messages[zh] ?? zh;
}
export const messages: Record<string, string> = translations;

export function countLabel(locale: Locale, count: number, zh: string, singular: string, plural = `${singular}s`): string {
  return `${count} ${locale === 'zh' ? zh : count === 1 ? singular : plural}`;
}

const tags: Record<string, [string, string]> = {
  writing: ['写作', 'Writing'], 'code-examples': ['代码示例', 'Code examples'],
};
export const tagId = (name: string) => Object.entries(tags).find(([,labels]) => labels.includes(name))?.[0] ?? name;
export const tagLabel = (id: string, locale: Locale) => tags[tagId(id)]?.[locale === 'zh' ? 0 : 1] ?? id;
