import { ABOUT } from '../data/room-about';
import { ABOUT_GUIDES } from '../data/about-guides';
import { categoriesFor, categoryCounts, categoryOf, SITE } from '../data/site';
import { getPosts, postUrl, readingTime, type Post } from './posts';

/** One published collection feeds the cover, island and existing reading routes. */
export async function getIslandContent() {
  const posts = await getPosts();
  const categories = categoriesFor(posts.map(post => post.data.category));
  const counts = categoryCounts(posts.map(post => post.data.category), categories);
  const tagCounts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of new Set(post.data.tags)) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  const adapt = (post: Post) => ({
    title: post.data.title,
    description: post.data.description ?? '',
    href: postUrl(post),
    category: categoryOf(post.data.category).label,
    date: post.data.pubDate.toISOString().slice(0, 10),
    updated: (post.data.updatedDate ?? post.data.pubDate).toISOString().slice(0, 10),
    readingMinutes: readingTime(post),
    pinned: post.data.pin,
  });
  return {
    total: posts.length,
    posts: posts.map(adapt),
    featured: posts.filter(post => post.data.pin).map(adapt),
    recent: [...posts].sort((a, b) =>
      (b.data.updatedDate ?? b.data.pubDate).valueOf() - (a.data.updatedDate ?? a.data.pubDate).valueOf()
    ).slice(0, 4).map(adapt),
    categories: categories.map(category => ({
      slug: category.slug, title: category.label, description: category.description,
      href: `/categories/${category.slug}/`, count: counts[category.slug], accent: category.accent,
    })),
    tags: [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([title, count]) => ({ title, count, href: `/tags/${encodeURIComponent(title)}/` })),
    author: { name: SITE.author, intro: ABOUT.intro, href: '/about/', avatar: SITE.avatar },
    guides: ABOUT_GUIDES,
    links: [
      { title: '订阅 RSS', description: '把新笔记送到你的阅读器。', href: '/rss.xml', icon: 'rss' },
      { title: 'GitHub', description: '代码、实验和正在做的事。', href: SITE.github, icon: 'github' },
      { title: '写一封信', description: SITE.email, href: `mailto:${SITE.email}`, icon: 'mail' },
    ],
  };
}

export type IslandContent = Awaited<ReturnType<typeof getIslandContent>>;
