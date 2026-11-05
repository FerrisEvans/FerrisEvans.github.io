# Island delivery pipeline

The homepage directly loads a forest reading courtyard assembled from official
CC0 KayKit Forest/Furniture and Tiny Treats Park/Plants/Picnic sources, with the
original bear and its coordinated animation. HTML panels supply the site content.
`build_scene.py` and its Python modules are the reproducible authoring source;
`assets/island/island.blend` is editable. Its complete uncompressed export is
`assets/island/island.glb`, outside the public delivery directory. Model provenance and mesh statistics
live beside the exported model in `public/island/model-report.json`.
Original vendor glTF/BIN/PNG files, licenses and provenance hashes are preserved
under `assets/island/vendor/`; both the Blender
generator and publication source seal check them. No paid source was used.

1. Run Blender in a **separate background process**, never replace an open file:
   `npm run assets:build` (the macOS application path is explicit in this script).
   Another workstation can run its Blender executable with
   `--background --python scripts/island/build_scene.py`.
2. Run `npm run assets:model` after geometry or runtime scene changes. This first
   packs the source with Meshopt (no quantization, reordering or decimation),
   lossless WebP textures and gzip into `public/island/island.glb.bin`.
   The packer compares decoded vertex attributes, indices, animation data,
   nodes, materials and RGBA texture pixels to the source before writing.
   `transport.json` records the exact source/packer/output hashes and sizes.
   The same command then seals the model bytes, Blender and raw glTF sources,
   packer, every `scripts/island/*.py` authoring module,
   vendor sources, runtime rendering sources, the three shared `naive-icons` SVG sign assets,
   and installed Three.js version into `public/island/manifest.json`.
3. Start the local development server at port 4327. Run
   `BASE_URL=http://127.0.0.1:4327 npm run assets:posters`. The script waits for
   actual browser WebGL readiness at `/en/?capture=1` and the matching build ID before capturing.
   Light and dark covers are 1440 × 1200; the sharing image is 1200 × 630.
   These are browser renders, not Blender previews or concept artwork.
4. `npm run assets:check` rejects stale packing receipts, changed sources, mismatched poster seals or a
   model over the initial 5 MB budget. `--model-only` is available solely for
   bootstrap checks and is never used by the production build.
5. Run `npm test`, `npm run check`, `npm run build`, `npm run verify:build`, and
   the applicable browser tests. Build output removes old study assets, movie,
   panoramas and CRT font. Their original sources are recoverable at `08844b2`.

The runtime caches the hashed compressed bytes using the existing persistent
asset cache, expands gzip with the browser's native DecompressionStream, and
uses Three.js's bundled Meshopt decoder. Scene readiness triggers best-effort
pruning of older revisions of the owned model path, retaining current + previous.
Other cache paths are untouched. The raw authoring GLB is never published.

The generated avatar follows the same source/delivery separation: its original
PNG is in `assets/brand/`, while `npm run assets:brand` generates a 512px WebP for
the site's 88–112px avatar displays. Neither the original art nor its source hash
changes during optimization.

The model budget is a transfer target, not an FPS guarantee. GitHub Pages already
applies HTTP gzip to the original GLB; compare actual encoded transfer bytes as
well as file sizes when reporting savings. Report actual
browser, device, viewport, DPR, cache conditions, frame time and draw calls in
the acceptance record. Mobile browser emulation is not a physical device test.
The interactive routes are `/en/` and `/zh/`; `/` selects the default English
homepage, while `/island/` and `/room/` are compatibility redirects. `/island/`
remains the static asset directory. The physical signs use the same book, grid
and tag icons as the navigation, so the model and captured posters are shared
between languages. The upstream MIT notice is retained under
`public/vendor/naive-icons/`. Homepage model loading
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
