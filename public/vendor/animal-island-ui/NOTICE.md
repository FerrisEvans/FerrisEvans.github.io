# Animal Island UI cursor attribution

The SVG artwork in `/cursors/animal-island-default.svg`, the 8 5 cursor hotspot,
and the selection colors in `src/styles/island-cursor.css` are from Animal Island UI.

- Copyright (c) 2026 guokaigdg
- License: MIT; the complete notice is preserved in `LICENSE.txt` beside this file.
- Upstream repository: https://github.com/guokaigdg/animal-island-ui
- Source commit: `02fa9da20534d303a4757563102229847e15b3c6`
- Source file: https://github.com/guokaigdg/animal-island-ui/blob/02fa9da20534d303a4757563102229847e15b3c6/src/components/Cursor/cursor.css

The SVG geometry, colors, stroke, dimensions, and hotspot are unchanged. This
site serves the SVG as a local file instead of an inline data URL. The CSS is
shared by all site layouts on fine pointing devices. Default and pointer states
use the same original artwork; text, disabled, grab/grabbing, zoom and resize
states retain their native semantic cursors. No React runtime or animated cursor
overlay is used.

The organic bordered tooltip outline in `src/scripts/island/tooltip.ts` is
adapted from the installed Animal Island UI 3.0.0 `Tooltip/Tooltip.js`, with the
same organic path and bordered-tail treatment. Its DOM positioning is adapted
for canvas object picking; the complete upstream MIT license also applies.
