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
  return `/posts/${postSlug(post)}/`;
}
