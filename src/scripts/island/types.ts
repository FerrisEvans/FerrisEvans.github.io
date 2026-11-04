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
export const viewLabels: Record<IslandView, string> = {
  library: '笔记', recent: '最近更新', categories: '分类',
  about: '关于与指南', tags: '标签', mail: '订阅与联系',
};
export function parseView(hash: string): IslandView | null {
  const value = hash.replace(/^#/, '');
  return views.includes(value as IslandView) ? value as IslandView : null;
}
