import type { APIContext } from 'astro';
import { feed } from './[locale]/rss.xml';
export async function GET(context: APIContext) {
  return feed('zh', context.site!);
}
