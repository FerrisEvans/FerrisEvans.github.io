# Room content maintenance

## Articles and the curated tape shelf

Add normal articles under `src/content/blog/`. The existing `getPosts()` excludes
`draft: true` and sorts by `pubDate` descending. POSTS uses all returned articles;
adding an article does not create a VHS programme or add it to WORK. The existing
publication-date policy is unchanged, including future dates that are not drafts.

WORK is a manually maintained set of twelve animated programmes. Keep the
physical order `VHS_A_1`–`VHS_A_5`, then `VHS_B_1`–`VHS_B_7` in
`src/data/room-tapes.json`. To include a later article, deliberately implement its
Canvas animation in `src/scripts/room/tapes.ts`, register a required `kind`, then
edit the selected physical tape slot's metadata and case-correct article `href`.
Existing animations remain available until explicitly replaced. There is no
generic visual fallback and no automatic conversion from article prose.

Run `npm run test:content`. The tests check physical slot order, unique IDs,
implemented animation kinds, English label length and published article links.

## About has one text source

Edit `src/data/room-about.json`. `src/data/room-about.ts` exposes `ABOUT`,
`aboutGreeting(author)`, `aboutInterests()` and `aboutPlainText(paragraph)` to the
normal About page and the room computer. Interest entries are category slugs;
their names and descriptions continue to come from `src/data/site.ts`.
Formatting paragraphs use text runs with optional `strong`, `code`, `em`, `sub`,
`span` or `u` tags, retaining the ordinary page's typography and the computer's
plain text without maintaining two copies of the wording.

The computer packs short sections continuously into pages of at most eight
lines. A heading inside a page marks a section change; subsequent pages keep
the active section in their page title. Content tests check text completeness,
ordering, long paragraphs, oversized tokens and section continuity.

## Pixel font coverage

`npm run build` runs `font:check` and `test:content` before Astro. The coverage
check uses Node only: it collects current text from `font-inputs.json`, checks
the generated Unicode coverage manifest and verifies the exact webfont SHA-256
and pinned source hash. It needs neither Python nor the ignored full source font.
New unsupported characters fail with their Unicode values. System fallbacks are
explicitly documented in `font-inputs.json`; they are not silently expanded.

Regeneration uses the same Node character collector, plus an existing Python
environment with fontTools. The source font must match `font-source.json` and
normally lives in `.room-build/fonts/`. No tool installs dependencies or downloads
fonts during a build.

```sh
npm run font:check
npm run font:generate -- --fonttools-path /path/to/existing/site-packages
npm run font:check
npm run test:content
```

If fontTools is already importable, omit `--fonttools-path`. The environment
variable `ROOM_FONTTOOLS_PATH` is an alternative to the flag. To choose another
Python interpreter, invoke `scripts/room/subset-font.py` with that interpreter.
Commit the regenerated `public/fonts/room-pixel-zh.woff2` and its paired
`room-pixel-zh.coverage.json` together. Article bodies are excluded from the
font payload; UI, shared About content and article front matter are included.
