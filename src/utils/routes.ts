import { type Locale } from '../i18n';
/** Canonical language-specific article indexes. */
export const notesPageUrl = (page: number, locale: Locale = 'en') => page === 1 ? `/${locale}/notes/` : `/${locale}/notes/page/${page}/`;
