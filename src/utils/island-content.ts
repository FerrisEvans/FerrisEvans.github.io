import { type Locale, localizePath, t, tagLabel } from '../i18n';
import { aboutFor } from '../data/room-about';
import { guidesFor } from '../data/about-guides';
import { categoriesFor, categoryCounts, categoryOf, siteFor } from '../data/site';
import { getPosts, postUrl, readingTime, type Post } from './posts';

/** One published collection feeds the cover, island and existing reading routes. */
export async function getIslandContent(locale: Locale = 'en') {
  const SITE = siteFor(locale);
  const ABOUT = aboutFor(locale);
  const ABOUT_GUIDES = guidesFor(locale);
  const posts = await getPosts({ locale });
  const categories = categoriesFor(posts.map(post => post.data.category), locale);
  const counts = categoryCounts(posts.map(post => post.data.category), categories);
  const tagCounts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of new Set(post.data.tags)) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  const adapt = (post: Post) => ({
    title: post.data.title,
    description: post.data.description ?? '',
    href: postUrl(post),
    category: categoryOf(post.data.category, locale).label,
    date: post.data.date.toISOString().slice(0, 10),
    updated: (post.data.updatedDate ?? post.data.date).toISOString().slice(0, 10),
    readingMinutes: readingTime(post),
    pinned: post.data.pin,
  });
  return {
    total: posts.length,
    posts: posts.map(adapt),
    featured: posts.filter(post => post.data.pin).map(adapt),
    recent: [...posts].sort((a, b) =>
      (b.data.updatedDate ?? b.data.date).valueOf() - (a.data.updatedDate ?? a.data.date).valueOf()
    ).slice(0, 4).map(adapt),
    categories: categories.map(category => ({
      slug: category.slug, title: category.label, description: category.description,
      href: localizePath(`/categories/${category.slug}/`, locale), count: counts[category.slug], accent: category.accent,
    })),
    tags: [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([title, count]) => ({ title: tagLabel(title, locale), count, href: localizePath(`/tags/${encodeURIComponent(title)}/`, locale) })),
    author: { name: SITE.author, intro: ABOUT.intro, href: localizePath('/about/', locale), avatar: SITE.avatar },
    guides: ABOUT_GUIDES,
    links: [
      { title: t(locale, '订阅 RSS', 'Subscribe via RSS'), description: t(locale, '把新笔记送到你的阅读器。', 'New notes, delivered to your feed reader.'), href: localizePath('/rss.xml', locale), icon: 'rss' },
      { title: 'GitHub', description: t(locale, '代码、实验和正在做的事。', 'Code, experiments, and work in progress.'), href: SITE.github, icon: 'github' },
      { title: t(locale, '写一封信', 'Write to me'), description: SITE.email, href: `mailto:${SITE.email}`, icon: 'mail' },
    ],
  };
}

export type IslandContent = Awaited<ReturnType<typeof getIslandContent>>;
