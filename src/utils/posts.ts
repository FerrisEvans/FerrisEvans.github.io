import { readdirSync } from 'node:fs';
import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;

const caseMap = new Map(
  readdirSync('./src/content/blog')
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const name = f.slice(0, -'.md'.length);
      return [name.toLowerCase(), name];
    })
);

export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export function postSlug(post: Post): string {
  return caseMap.get(post.id) ?? post.id;
}

export function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
}

export function formatShortDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function postUrl(post: Post): string {
  return `/posts/${postSlug(post)}/`;
}

export function getWordCount(post: Post): number {
  const raw = (post.body ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/[#>*_~\[\]()!-]/g, ' ');
  const cjk = (raw.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const words = (raw.replace(/[\u4e00-\u9fa5]/g, ' ').match(/[a-zA-Z0-9_]+/g) ?? []).length;
  return Math.max(50, cjk + words);
}

export function getReadingTime(post: Post): number {
  const count = getWordCount(post);
  return Math.max(1, Math.round(count / 320));
}
