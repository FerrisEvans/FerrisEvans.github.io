/** Canonical article index routes, shared by generation, pagination and aliases. */
export const notesPageUrl = (page: number) => page === 1 ? '/notes/' : `/notes/page/${page}/`;
