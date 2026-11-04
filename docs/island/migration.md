# Study-to-island migration contracts

The former rain-glass entrance and rainy study were last present together at
Git commit `08844b2` on `astro-redesign`. That commit is the recovery/reference
point for original models, source scripts, runtime and tests. The ignored
`.room-build/` working snapshots are not part of this migration and must not be
deleted by cleanup.

The island is a new scene. Its acceptance criteria retain useful behavior while
allowing the model names, cameras, material pipeline and presentation to change.

## Final identity and route integration

The initial prototype used the old Praxis name and separate reading/scene entry
points. The final site is **未尽**: one blog with the same header, footer, brand,
fonts, native cursor artwork and saved theme on the homepage and reading pages.
The interactive scene is now the homepage itself, not a separate destination.
Normal rendering consists of the scene, a compact toolbar and accessible object
navigation; there is no additional article/category homepage stacked beneath it.
The complete static directory is retained for loading, no-JavaScript and failure
states, then enhanced into the same content panels when ready.
The header directly lists Home, Notes, Categories, Tags, Archives and About. The site mark
is an original open book and sprout; the existing bear remains the author avatar.
`public/brand/island/mark.svg` is the editable source. `npm run assets:brand`
regenerates PNG/ICO favicons, compatibility aliases, `site.webmanifest` and the
identity record. Layouts use the shared `weijin-1` brand resource version.

| Previous public route | Canonical destination |
| --- | --- |
| `/room/`, `/island/` | `/` with the interactive courtyard |
| `/lofi/`, `/page/1/` | `/notes/` |
| `/page/<n>/` | `/notes/page/<n>/` |
| `/posts/<slug>/` | Unchanged; breadcrumb now returns to `/notes/` |

Compatibility pages set the destination canonical and `noindex`; the sitemap
contains the new paths rather than aliases. JavaScript redirects preserve query
strings and fragments. Without JavaScript, meta refresh and an ordinary link
still reach the canonical page; query/fragment preservation is not promised in
that fallback. The new island recognizes its current content section fragments.
The notes directory now has a compact heading, count, search and archive links;
it retains real categories, featured content, article lists and pagination,
without repeating the homepage welcome scene.

The first island prototype used only original models; a second iteration added
four CC0 picnic props. The current direction is an open reading courtyard built
around licensed environment assets and the retained original bear/animation.
Exact adopted models, actual package licenses, receipts and source hashes live
in [`scripts/island/SOURCES.md`](../../scripts/island/SOURCES.md); historical
asset counts are not current delivery claims. The visual bookshelf, desk,
fountain, bear, plant corner and radio retain the internal semantic keys
`Library`, `Noticeboard`, `Categories`, `Bear`, `Tags` and `Mailbox`.
The bookshelf panel links to the full notes directory and search; the desk panel
links to chronological archives. Categories, tags and author pages are likewise
reachable through their corresponding scene panels.

Internal compatibility identifiers, including `praxis-room-assets`, existing
worker protocol/plugin names and historical GLB authoring metadata, are not
visible brand text and are deliberately retained. Renaming the site does not
require invalidating these caches or re-exporting geometry.

## Runtime and delivery contracts

| Previous area | Island replacement / retained evidence |
| --- | --- |
| Separate scene entrance and hover-triggered prefetch | Homepage displays the current-theme poster, then automatically loads the real scene; reading routes stay HTML-only. The old explore button and preload script are removed |
| Versioned binary loader and cache | Retained `src/scripts/room/assets.ts`, `asset-cache.ts`, `load-timings.ts`; existing generic asset/timing tests and isolated cache browser test |
| Baked reflection/material/entry-lighting seals | `scripts/island/manifest.mjs` verifies model bytes, editable sources, runtime/Three version and matching actual WebGL day/night/share captures |
| Model names for CRT, VCR and 12 tapes | GLB delivery tests preserve new generic semantic groups and coordinated `Idle`, `Attention`, `Wave` clips; no per-article geometry is required |
| Fixed paper/CRT title and Chinese pixel font | HTML panels with the shared font stack; Markdown publication tests prove new categories, tags and text need no model/font update |
| Fixed television, cassette, audio and window state machines | Removed feature scope; the island is silent and has no TV/media transport. These old feature assertions are not generic scene requirements |
| Desktop-only camera and DPR 2 policy | Constrained orthographic desktop/portrait views and bounded DPR. Ordinary wheel scrolls the page; modifier-wheel zooms. Touch permits vertical page scrolling and horizontal orbit |
| Loading and navigation recovery | Byte-based loading, fallback/retry, native-dialog close/focus/history/deep links on the homepage, visibility pause, context loss and repeated-entry browser checks |
| About text painted on CRT | Shared author data and three reading-guide links in an accessible HTML panel |
| Old root worker and film cache | Passive replacement at `/sw.min.js`, no fetch handler; migration regression preserves unrelated app caches and removes obsolete site movie caches |
| Publish, draft and deletion behavior | Shared first five publishing/category tests extracted into `scripts/content.test.mjs`; disposable authoring smoke now includes both homepage and island |

Old shape-specific tests are not weakened to make an incompatible model pass.
The general contracts above have explicit surviving tests or replacements.
After the island flow passed, cleanup removed the old public study payload,
CRT font, rain-glass controller, unused source implementation and shape-specific
tests. The Git recovery point remains available. `scripts/room/ASSET_PIPELINE.md`
is retained as a redirect, and the three used runtime modules and their generic
tests retain their paths. No deployment or remote Git action is part of this
migration.

Browser flow evidence distinguishes synthetic visibility events from real tab
backgrounding. Mobile viewport emulation and desktop GPU measurements do not
establish performance on a physical phone or Safari.
