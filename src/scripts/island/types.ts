import { t, type Locale } from '../../i18n';

export const views = ['library', 'recent', 'categories', 'about', 'tags', 'mail'] as const;
export type IslandView = typeof views[number];
export const hoverTargets = [...views, 'bear', 'rabbit'] as const;
export type HoverTarget = typeof hoverTargets[number];
export const viewObjects: Record<IslandView, string> = {
  library: 'Library', recent: 'Noticeboard', categories: 'Categories',
  about: 'Dog', tags: 'Tags', mail: 'Mailbox',
};
export const hoverObjects: Record<HoverTarget, string> = { ...viewObjects, bear: 'Bear', rabbit: 'Rabbit' };
export function isIslandView(value: HoverTarget | null | undefined): value is IslandView {
  return value != null && views.includes(value as IslandView);
}
export function getViewLabels(locale: Locale): Record<IslandView, string> {
  return {
    library: t(locale, '笔记', 'Notes'), recent: t(locale, '最近更新', 'Recent updates'),
    categories: t(locale, '分类', 'Categories'), about: t(locale, '关于与指南', 'About & guides'),
    tags: t(locale, '标签', 'Tags'), mail: t(locale, '订阅与联系', 'Subscribe & contact'),
  };
}
export function parseView(hash: string): IslandView | null {
  const value = hash.replace(/^#/, '');
  return views.includes(value as IslandView) ? value as IslandView : null;
}
