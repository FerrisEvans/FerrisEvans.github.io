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
If a referenced article is deleted or becomes a draft, the notebook automatically
hides its reading link while retaining the animation and physical tape slot.
Publishing that article again restores the link without changing tape metadata.

Run `npm run test:content`. The tests check physical slot order, unique IDs,
implemented animation kinds, English label length and article reference format.
Surface tests verify that reading links only expose currently published articles.

## About has one text source

Edit `src/data/room-about.json` for the biography and bilingual Python Zen.
`src/data/room-about.ts` exposes `ABOUT`, `aboutGreeting(author)` and
`aboutInterests()` to the normal About page, the Zen reading page and the room
computer. Interest entries are category slugs; their names and descriptions
continue to come from `src/data/site.ts`.

The web About page links to three independent reading pages. Writing conventions
and syntax examples live in `src/content/pages/writing-guide.md` and
`src/content/pages/markdown-features.md`, sharing the blog renderer and reading
tools. They are outside the room computer's fixed UI and pixel-font character set.
The former inline formatting rules have been removed from the room computer;
the full writing guide is the authoritative reference.

The computer packs short sections continuously into pages of at most eight
lines. A heading inside a page marks a section change; subsequent pages keep
the active section in their page title. Content tests check text completeness,
ordering, long paragraphs, oversized tokens and section continuity.

## Pixel font coverage

`npm run build` runs `font:check` and `test:content` before Astro. The coverage
check uses Node only: it collects current text from `font-inputs.json`, checks
the generated Unicode coverage manifest and verifies the exact webfont SHA-256
and pinned source hash. It needs neither Python nor the ignored full source font.
New unsupported characters in the fixed room UI fail with their Unicode values.
Its exceptions are explicitly documented in `font-inputs.json`; they are not
silently expanded.

Articles are excluded from pixel-font collection, including titles, descriptions,
tags, drafts and bodies. Publishing or editing a Markdown article never requires
regenerating the room font. The TV's POSTS titles use `RoomPixelZH` where covered,
then `PingFang SC` or the platform's `sans-serif` fallback; text wrapping measures
that same font stack. The ordinary reading fallback uses `system-ui`.

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
When fixed UI, shared About content or curated tape text introduces new
characters, commit the regenerated `public/fonts/room-pixel-zh.woff2` and its
paired `room-pixel-zh.coverage.json` together. Ordinary article publication does
not change either file.
