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
  enLabel: string;
  code: string;
  description: string;
  /** CSS gradient used for generated covers and accents */
  gradient: string;
  /** Solid accent color for badges and indicators */
  accent: string;
  subcategories: Record<string, string>;
}

export const CATEGORIES: CategoryDef[] = [
  {
    slug: 'programming-language',
    label: '编程语言',
    enLabel: 'Languages & Systems',
    code: 'SYS // 01',
    description: 'C/C++、Java 等语言的底层机制、内存模型与深入笔记',
    gradient: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 48%, #4f46e5 100%)',
    accent: '#6366f1',
    subcategories: { cpp: 'C/C++', java: 'Java' },
  },
  {
    slug: 'data-structures',
    label: '数据结构与算法',
    enLabel: 'Structures & Algorithms',
    code: 'DSA // 02',
    description: '线性表、链表、栈与算法复杂度——计算机科学的核心基石',
    gradient: 'linear-gradient(135deg, #0c4a6e 0%, #0e7490 50%, #0d9488 100%)',
    accent: '#06b6d4',
    subcategories: {},
  },
  {
    slug: 'game-dev',
    label: '游戏开发',
    enLabel: 'Game Engine & Design',
    code: 'ENG // 03',
    description: 'Godot 引擎架构、节点系统、渲染帧率与游戏设计实践笔记',
    gradient: 'linear-gradient(135deg, #431407 0%, #9a3412 48%, #ea580c 100%)',
    accent: '#f97316',
    subcategories: { godot: 'Godot', 'game-design': '游戏设计' },
  },
  {
    slug: 'ai',
    label: '人工智能',
    enLabel: 'AI & Agent Systems',
    code: 'AGI // 04',
    description: 'AI Agent 架构、RAG 检索优化、向量数据库与大模型工程化',
    gradient: 'linear-gradient(135deg, #064e3b 0%, #047857 50%, #10b981 100%)',
    accent: '#10b981',
    subcategories: { agent: 'Agent' },
  },
];

export function categoryOf(slug: string): CategoryDef {
  const found = CATEGORIES.find((c) => c.slug === slug);
  if (!found) throw new Error(`Unknown category: ${slug}`);
  return found;
}
