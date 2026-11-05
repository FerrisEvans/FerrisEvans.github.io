import type { APIContext } from 'astro';
import { locales, type Locale, languageTag } from '../../i18n';
import { siteFor } from '../../data/site';
export const getStaticPaths = () => locales.map(locale => ({ params: { locale } }));
export function GET({ params }: APIContext) {
  const locale = params.locale as Locale, site = siteFor(locale);
  return new Response(JSON.stringify({ name: site.title, short_name: site.title, description: site.description, lang: languageTag(locale), start_url: `/${locale}/`, display: 'browser', background_color: '#fff7e7', theme_color: '#8bc4a8', icons: [192,512].map(size => ({ src: `/brand/favicon-${size}x${size}.png?v=${site.brandVersion}`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' })) }), { headers: { 'Content-Type': 'application/manifest+json' } });
}
