import { frontmatter as writing } from '../content/pages/writing-guide.md';
import { frontmatter as markdown } from '../content/pages/markdown-features.md';
import { ABOUT } from './room-about';

/** Reading pages live outside the dated blog feed and its category indexes. */
export const ABOUT_GUIDES = [
  { href: '/about/python-zen/', id: 'python-zen', title: ABOUT.zen.title, description: '十九条关于简洁、明确与可读性的编程思考，中英对照。', label: '编程哲学 · Tim Peters', icon: 'leaf' },
  { href: '/about/writing/', id: 'writing-guide', title: writing.title, description: writing.description, label: '写作与排版', icon: 'book' },
  { href: '/about/markdown/', id: 'markdown-features', title: markdown.title, description: markdown.description, label: '语法与效果', icon: 'code' },
];
