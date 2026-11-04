# Island delivery pipeline

The homepage directly loads a forest reading courtyard assembled from official
CC0 KayKit Forest/Furniture and Tiny Treats Park/Plants/Picnic sources, with the
original bear and its coordinated animation. HTML panels supply the site content.
`build_scene.py` and its Python modules are the reproducible authoring source;
`assets/island/island.blend` is editable. Model provenance and mesh statistics
live beside the exported model in `public/island/model-report.json`.
Original vendor glTF/BIN/PNG files, licenses and provenance hashes are preserved
under `assets/island/vendor/`; both the Blender
generator and publication source seal check them. No paid source was used.

1. Run Blender in a **separate background process**, never replace an open file:
   `npm run assets:build` (the macOS application path is explicit in this script).
   Another workstation can run its Blender executable with
   `--background --python scripts/island/build_scene.py`.
2. Run `npm run assets:model` after geometry or runtime scene changes. This seals
   the model bytes, Blender source, every `scripts/island/*.py` authoring module,
   vendor sources, runtime rendering sources
   and installed Three.js version into `public/island/manifest.json`.
3. Start the local development server at port 4327. Run
   `BASE_URL=http://127.0.0.1:4327 npm run assets:posters`. The script waits for
   actual browser WebGL readiness at `/?capture=1` and the matching build ID before capturing.
   Light and dark covers are 1440 × 1200; the sharing image is 1200 × 630.
   These are browser renders, not Blender previews or concept artwork.
4. `npm run assets:check` rejects changed sources, mismatched poster seals or a
   model over the initial 5 MB budget. `--model-only` is available solely for
   bootstrap checks and is never used by the production build.
5. Run `npm test`, `npm run check`, `npm run build`, `npm run verify:build`, and
   the applicable browser tests. Build output removes old study assets, movie,
   panoramas and CRT font. Their original sources are recoverable at `08844b2`.

The model budget is a transfer target, not an FPS guarantee. Report actual
browser, device, viewport, DPR, cache conditions, frame time and draw calls in
the acceptance record. Mobile browser emulation is not a physical device test.
The canonical interactive route is `/`; `/island/` and `/room/` are compatibility
redirects. `/island/` remains the static asset directory. Homepage model loading
is automatic, and unavailable JavaScript/WebGL retains the poster and directory.

The export retains `extras.vendorAssets` on imported/merged geometry. Model
tests compare those actual source IDs with the usage report, then verify the
preserved license, source bytes and selected-model inventory. A provenance entry
alone is not sufficient proof that a model appears in the delivered scene.

## Test migration

The default suite preserves shared publishing contracts (`scripts/content.test.mjs`)
and used binary loader/cache/timing contracts (`scripts/room/assets.test.mjs` and
`load-timings.test.mjs`). Island-specific asset seals and interaction tests are
under this directory. Markdown, guides and search retain their existing tests.

The removed shape-specific tests are recoverable at Git commit `08844b2`:
fixed CRT/VHS model names, reflective/baked materials, paper deformation,
television/media controls, window cameras and the former desktop-only DPR
policy. Those are not requirements for the island. The mixed old
`content.test.mjs` had its public-content tests extracted into the default suite;
the fixed tapes and CRT text assertions were retired with those features.
The former pixel font pipeline and its `font:*` commands were also removed:
Markdown now has no scene-specific font-build prerequisite.
See [`docs/island/migration.md`](../../docs/island/migration.md) for the complete
contract mapping.

The former film worker is replaced at its original URL by a passive retirement
worker with no fetch listener. It clears only this site's old root Chirpy and
video caches, preserves other applications, and is not registered for new
visitors. `legacy-worker-browser.mjs` retains that migration regression.
