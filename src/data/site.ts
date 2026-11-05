import { type Locale, t } from '../i18n';
const BLOG_NAME = '未尽';
const BRAND_VERSION = 'weijin-2';
const AUTHOR_NAME = 'Ferris';
const BLOG_INTRO = '记录编程语言、游戏开发与人工智能的学习、实践和思考。';

export const SITE = {
  title: BLOG_NAME,
  brandVersion: BRAND_VERSION,
  tagline: '保持好奇，慢慢来',
  description: `${BLOG_NAME} 是 ${AUTHOR_NAME} 的个人博客。${BLOG_INTRO}`,
  intro: BLOG_INTRO,
  author: AUTHOR_NAME,
  email: 'ferris.evans@outlook.com',
  avatar: `/brand/island/ferris-dog-avatar.webp?v=${BRAND_VERSION}`,
  github: 'https://github.com/FerrisEvans',
  twitter: 'https://twitter.com/ferrisgeek',
  postsPerPage: 9,
  giscus: {
    repo: 'FerrisEvans/FerrisEvans.github.io',
    repoId: 'R_kgDONhZGoQ',
    category: 'Announcements',
    categoryId: 'DIC_kwDONhZGoc4Cld4y',
  },
} as const;

export interface CategoryDef {
  slug: string;
  label: string;
  description: string;
  accent: string;
  mark: string;
  subcategories: Record<string, string>;
  /**
   * Magazine wall slot. When true, a category with zero posts still renders
   * an empty state ("尚无文章"). Otherwise count 0 stays hidden.
   */
  wall?: boolean;
  /**
   * False for slugs discovered from posts and missing from CATEGORIES.
   * Generated labels are placeholders, not the final display name.
   */
  configured?: boolean;
}

/**
 * Published posts determine which categories exist in blog indexes and routes.
 * `CATEGORIES` only supplies display metadata and ordering; keeping a custom
 * definition here must not create an empty category after its last post is
 * removed. New slugs receive generated metadata without a configuration edit.
 */

export const CATEGORIES: CategoryDef[] = [
  {
    slug: 'programming-language',
    label: '编程语言',
    description: 'C/C++、Java 等语言的底层机制、内存模型与深入笔记',
    accent: '#7161c5',
    mark: '</>',
    subcategories: { cpp: 'C/C++', java: 'Java' },
    wall: true,
  },
  {
    slug: 'data-structures',
    label: '数据结构与算法',
    description: '线性表、链表、栈与算法复杂度——计算机科学的核心基石',
    accent: '#168ba0',
    mark: '∑',
    subcategories: {},
    wall: true,
  },
  {
    slug: 'game-dev',
    label: '游戏开发',
    description: 'Godot 引擎架构、节点系统、渲染帧率与游戏设计笔记',
    accent: '#c66a24',
    mark: '◇',
    subcategories: { godot: 'Godot', 'game-design': '游戏设计' },
    wall: true,
  },
  {
    slug: 'ai',
    label: '人工智能',
    description: 'AI Agent 架构、RAG 检索优化、向量数据库与大模型工程化',
    accent: '#31856b',
    mark: 'AI',
    subcategories: { agent: 'Agent' },
    wall: true,
  },
];

const CATEGORY_ACCENTS = ['#7161c5', '#168ba0', '#c66a24', '#31856b', '#4f6bd8', '#a34a0c'];
const generatedCategories = new Map<string, CategoryDef>();

export function labelFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function markFromSlug(slug: string): string {
  const parts = slug.split('-').filter(Boolean);
  const mark = parts.length > 1
    ? parts.map((part) => part.charAt(0)).join('').slice(0, 3)
    : slug.slice(0, 2);
  return mark.toUpperCase();
}

function accentFromSlug(slug: string): string {
  let hash = 0;
  for (let index = 0; index < slug.length; index++) {
    hash = (hash * 31 + slug.charCodeAt(index)) >>> 0;
  }
  return CATEGORY_ACCENTS[hash % CATEGORY_ACCENTS.length];
}

export function categoryOf(slug: string, locale: Locale = 'zh'): CategoryDef {
  const configured = CATEGORIES.find((category) => category.slug === slug);
  if (configured) return locale === 'zh' ? configured : { ...configured, label: t(locale, configured.label), description: t(locale, configured.description), subcategories: Object.fromEntries(Object.entries(configured.subcategories).map(([key,label]) => [key,t(locale,label)])) };
  const cached = generatedCategories.get(slug);
  if (cached) return locale === 'zh' ? cached : { ...cached, description: `Notes on ${cached.label}` };

  const label = labelFromSlug(slug);
  const generated: CategoryDef = {
    slug,
    label,
    description: `${label} 相关文章`,
    accent: accentFromSlug(slug),
    mark: markFromSlug(slug),
    subcategories: {},
    configured: false,
  };
  generatedCategories.set(slug, generated);
  console.warn(`[category] "${slug}" is using generated metadata. Customize it in src/data/site.ts (CATEGORIES).`);
  return locale === 'zh' ? generated : { ...generated, description: `Notes on ${label}` };
}

export function categoriesFor(slugs: Iterable<string>, locale: Locale = 'zh'): CategoryDef[] {
  const publishedSlugs = new Set(slugs);
  const configuredSlugs = new Set(CATEGORIES.map((category) => category.slug));
  const discovered = [...publishedSlugs]
    .filter((slug) => !configuredSlugs.has(slug))
    .sort()
    .map(slug => categoryOf(slug, locale));
  return [...CATEGORIES.filter((category) => publishedSlugs.has(category.slug)).map(category => categoryOf(category.slug, locale)), ...discovered];
}

export function categoryCounts(slugs: Iterable<string>, categories: CategoryDef[] = CATEGORIES): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const category of categories) counts[category.slug] = 0;
  for (const slug of slugs) counts[slug] = (counts[slug] ?? 0) + 1;
  return counts;
}

/** count > 0, plus wall slots when emptySlots is set. Never a fixed column count. */
export function categoriesForWall(
  categories: CategoryDef[],
  counts: Record<string, number>,
  options?: { emptySlots?: boolean },
): CategoryDef[] {
  const emptySlots = options?.emptySlots ?? false;
  return categories.filter((category) => {
    const count = counts[category.slug] ?? 0;
    if (count > 0) return true;
    return emptySlots && category.wall === true;
  });
}

export function siteFor(locale: Locale) {
  return locale === 'zh' ? SITE : { ...SITE, title: 'Elsewhere', tagline: 'Stay curious. Take your time.', intro: 'Notes on programming languages, game development, and AI—what I learn, build, and think about.', description: 'Elsewhere is Ferris’s personal blog about programming languages, game development, and AI.' };
}
