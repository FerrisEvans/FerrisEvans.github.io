import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { locales, type Locale } from '../../i18n';
import { siteFor } from '../../data/site';
import { getPosts, postUrl } from '../../utils/posts';
export const getStaticPaths = () => locales.map(locale => ({ params: { locale } }));
export async function GET(context: APIContext) {
  return feed(context.params.locale as Locale, context.site!);
}
export async function feed(locale: Locale, siteUrl: URL) {
  const site = siteFor(locale);
  const posts = await getPosts({ locale });
  return rss({ title: site.title, description: site.description, site: siteUrl,
    customData: `<language>${locale === 'zh' ? 'zh-CN' : 'en'}</language>`,
    items: posts.map(post => ({ title: post.data.title, description: post.data.description ?? '', pubDate: post.data.date, link: postUrl(post) })),
  });
}
