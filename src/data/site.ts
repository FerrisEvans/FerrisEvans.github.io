export const SITE = {
  title: 'Mainloop',
  tagline: 'All problems are ultimately mathematical problems.',
  description:
    'From Web2 to Web3; From algorithms to artificial intelligence; From engine to game; From theory to practice.',
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
  /** CSS gradient used for generated covers and accents */
  gradient: string;
  subcategories: Record<string, string>;
}

export const CATEGORIES: CategoryDef[] = [
  {
    slug: 'programming-language',
    label: '编程语言',
    description: 'C/C++、Java 等语言的深入笔记',
    gradient: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #c026d3 100%)',
    subcategories: { cpp: 'C/C++', java: 'Java' },
  },
  {
    slug: 'data-structures',
    label: '数据结构与算法',
    description: '线性表、链表、栈……计算机科学的基本功',
    gradient: 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 50%, #14b8a6 100%)',
    subcategories: {},
  },
  {
    slug: 'game-dev',
    label: '游戏开发',
    description: 'Godot 引擎与游戏设计笔记',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #f97316 50%, #ef4444 100%)',
    subcategories: { godot: 'Godot', 'game-design': '游戏设计' },
  },
  {
    slug: 'ai',
    label: '人工智能',
    description: 'Agent、RAG 与大模型应用开发',
    gradient: 'linear-gradient(135deg, #10b981 0%, #22c55e 50%, #84cc16 100%)',
    subcategories: { agent: 'Agent' },
  },
];

export function categoryOf(slug: string): CategoryDef {
  const found = CATEGORIES.find((c) => c.slug === slug);
  if (!found) throw new Error(`Unknown category: ${slug}`);
  return found;
}
