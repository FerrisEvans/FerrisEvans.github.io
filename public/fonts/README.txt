Mainloop UI Pixel
=================

This is a locally generated UI-only subset of Fusion Pixel Font 12px
proportional zh-Hans, release 2026.10.25, by TakWolf and the upstream
contributors. The subset is renamed Mainloop UI Pixel. The font remains under
the SIL Open Font License 1.1; preserve LICENSE-Fusion-Pixel.txt and LICENSES/.
No global software or fonts were installed.

Source:
https://github.com/TakWolf/fusion-pixel-font/releases/tag/2026.10.25
Pinned download URLs and SHA-256 hashes: scripts/room/font-source.json.
The original font and release archive are in ignored .room-build/fonts/.

Intended use
------------
Use for the short Chinese labels, teletext titles, compact navigation and
terminal-style UI in the room. Suggested CSS sizes are 12, 24 or 36 px, which
are integer multiples of the source's 12 px grid. At other sizes, antialiasing
and the 3D perspective can soften the pixel structure. Do not apply the font to
long article body copy or code blocks; their existing fonts stay more readable.
The Latin VT323 font may remain first in a mixed font stack for its familiar
terminal proportions, with this subset providing Chinese glyphs.

CSS registration used by the room:

@font-face {
  font-family: 'RoomPixelZH';
  src: url('/fonts/room-pixel-zh.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

font-family: RoomPixel, RoomPixelZH, 'PingFang SC', 'Microsoft YaHei', sans-serif;

Canvas text must await the loaded FontFace before painting or repaint after
font loading. Otherwise its first CanvasTexture will permanently contain the
fallback glyphs. Keep the system-font fallback: this is intentionally a subset,
not the entire CJK font. The current source font lacks the category symbol
U+2211 (summation) and U+2260 (not equal); the system font provides those characters.

Regeneration and checking
------------------------
Run from the repository root using an existing Python environment with
fontTools. Node.js is used for Brotli only if the optional Python Brotli module
is missing. The script never downloads or installs dependencies.

python3 scripts/room/subset-font.py
python3 scripts/room/subset-font.py --check

This machine's pyftsubset launcher points to a removed Python installation.
The still-present pure-Python fontTools package was reused with:

/Users/ferris/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/room/subset-font.py --fonttools-path /opt/homebrew/lib/python3.11/site-packages

Source collection includes room TypeScript, room.astro, site metadata, Astro
components, src/data/room*.json and optional room*.ts and article front matter. Long article
bodies are excluded. Run the script after adding short UI text or article
titles, then run --check. room-pixel-zh.coverage.json records the source files,
Unicode set, unsupported characters and output hash for the current build.

The script checks supported source characters against the resulting font cmap.
That is a glyph-coverage check, not a browser rendering/contrast/legibility test.
