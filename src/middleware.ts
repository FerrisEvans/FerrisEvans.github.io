import { defineMiddleware } from 'astro:middleware';

// Locale pages and legacy redirects are generated explicitly in src/pages.
// Keep Astro's automatic locale redirects disabled so old Chinese URLs retain
// their Chinese destinations and every locale has a stable static URL.
export const onRequest = defineMiddleware((_context, next) => next());
