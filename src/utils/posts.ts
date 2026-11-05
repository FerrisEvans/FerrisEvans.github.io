import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;

import { type Locale, tagId } from '../i18n';

/** Drafts are opt-in for local previews and can never enter a production build. */
export async function getPosts(options: { includeDrafts?: boolean; locale?: Locale } = {}): Promise<Post[]> {
  const includeDrafts = import.meta.env.DEV && options.includeDrafts === true;
  const posts = await getCollection('blog', ({ data }) => data.locale === (options.locale ?? 'en') && (!data.draft || includeDrafts));
  return posts.map(post => ({ ...post, data: { ...post.data, tags: post.data.tags.map(tagId) } })).sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export function postSlug(post: Post): string {
  return post.data.translationKey;
}

export function formatDate(date: Date, locale: Locale = 'zh'): string {
  if (locale === 'en') return new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
}

function readingMetrics(post: Post) {
  const text = (post.body ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  const chinese = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const words = text.replace(/[\u3400-\u9fff]/g, ' ').match(/[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*/g)?.length ?? 0;
  return { chinese, words };
}

export function wordCount(post: Post): number {
  const { chinese, words } = readingMetrics(post);
  return chinese + words;
}

export function readingTime(post: Post): number {
  const { chinese, words } = readingMetrics(post);
  return Math.max(1, Math.ceil(chinese / 350 + words / 200));
}

export function postUrl(post: Post): string {
  return `/${post.data.locale}/posts/${postSlug(post)}/`;
}
