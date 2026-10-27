export const SITE = {
  title: 'Mainloop',
  tagline: 'All problems are ultimately mathematical problems.',
  description:
    'From Web2 to Web3; From algorithms to artificial intelligence; From engine to game; From theory to practice.',
  intro: '记录编程语言、游戏开发与人工智能的学习、实践和思考。',
  author: 'Ferris',
  email: 'ferris.evans@outlook.com',
  avatar: '/avatar.png',
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
}

export const CATEGORIES: CategoryDef[] = [
  {
    slug: 'programming-language',
    label: '编程语言',
    description: 'C/C++、Java 等语言的底层机制、内存模型与深入笔记',
    accent: '#7161c5',
    mark: '</>',
    subcategories: { cpp: 'C/C++', java: 'Java' },
  },
  {
    slug: 'data-structures',
    label: '数据结构与算法',
    description: '线性表、链表、栈与算法复杂度——计算机科学的核心基石',
    accent: '#168ba0',
    mark: '∑',
    subcategories: {},
  },
  {
    slug: 'game-dev',
    label: '游戏开发',
    description: 'Godot 引擎架构、节点系统、渲染帧率与游戏设计实践笔记',
    accent: '#c66a24',
    mark: '◇',
    subcategories: { godot: 'Godot', 'game-design': '游戏设计' },
  },
  {
    slug: 'ai',
    label: '人工智能',
    description: 'AI Agent 架构、RAG 检索优化、向量数据库与大模型工程化',
    accent: '#31856b',
    mark: 'AI',
    subcategories: { agent: 'Agent' },
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

export function categoryOf(slug: string): CategoryDef {
  const configured = CATEGORIES.find((category) => category.slug === slug);
  if (configured) return configured;
  const cached = generatedCategories.get(slug);
  if (cached) return cached;

  const label = labelFromSlug(slug);
  const generated: CategoryDef = {
    slug,
    label,
    description: `${label} 相关文章`,
    accent: accentFromSlug(slug),
    mark: markFromSlug(slug),
    subcategories: {},
  };
  generatedCategories.set(slug, generated);
  console.warn(`[category] "${slug}" is using generated metadata. Customize it in src/data/site.ts (CATEGORIES).`);
  return generated;
}

export function categoriesFor(slugs: Iterable<string>): CategoryDef[] {
  const configuredSlugs = new Set(CATEGORIES.map((category) => category.slug));
  const discovered = [...new Set(slugs)]
    .filter((slug) => !configuredSlugs.has(slug))
    .sort()
    .map(categoryOf);
  return [...CATEGORIES, ...discovered];
}
