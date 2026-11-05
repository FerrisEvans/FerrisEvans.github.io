# Garden wayfinding (1.4.6)

Three physical signs explain the main reading entrances: the bookcase's hanging
paper sign opens notes, the fountain's wooden direction sign opens categories,
and the plant corner's stake opens tags. Signs are Three.js meshes parented to
the same interaction groups as their props, so normal depth, picking and outline
rules apply. Both faces carry readable text. The existing six keyboard entries
and header links remain available.

`wayfinding.ts` draws the six Chinese glyphs with the site's already bundled
Noto Sans SC font. `scene.ts` waits for those glyphs before making the texture.
Narrow screens enlarge just the plaques, preserving support contact points.
Header hover/focus and scene hover link notes, categories, tags and about. Archives
is not mapped to the desk's different “recent updates” purpose. No camera motion
or link interception is introduced by header hover.

`fountain.ts` shares one ballistic trajectory between each tapered stream and its
moving beads. Ripples fade before wrapping; all landings remain within the two
measured water surfaces. There is no water emission/glow, and reduced motion
suppresses the animated water. The dog in `friends.py` has a longer stuffed body,
continuous hanging arms and short outward-curving feet; existing pivots and the
head are retained.

Verification: local Chrome desktop (1440 × 900) and touch emulation (390 × 844),
all three sign hover/tap/open/close paths, two-way header feedback, native header
navigation, no viewport overflow, reduced motion and page errors. The dog was
also inspected from front/side/overhead/three-quarter views and two greeting
extremes. Physical phone and Safari verification were not performed.
