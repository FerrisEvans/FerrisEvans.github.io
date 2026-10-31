# Room asset pipeline

`build-assets.py` is the current candidate build entry. `build.py` is a historical
scene and must not replace the current public bundle.

Use an existing Python environment with Pillow and NumPy, and the installed
Blender application. No command installs software. From the repository root:

```sh
python3 scripts/room/build-assets.py geometry --candidate .room-build/high-quality/my-candidate
python3 scripts/room/build-assets.py bake --candidate .room-build/high-quality/my-candidate
python3 scripts/room/build-assets.py site --candidate .room-build/high-quality/my-candidate
```

The stages are deliberately separate:

1. `geometry` assembles the Blender scene without baking or replacing public files.
2. `bake` assembles a fresh scene, bakes PBR/RGBM maps, exports GLB, packs lossless
   data maps and audits the result. It records source hashes and a `buildId`.
   The packed manifest records `bakeBuildId` plus a content-derived web `buildId`.
   Re-running `pack` on an unchanged bake therefore invalidates old poster seals
   when the actual encoded files change, without requiring another light bake.
3. `site` builds a private Astro source root with matching model/atlas paths and
   byte counts. Run its normal `npm run build` and `npm run preview`. It preserves
   the current separately owned `city` and `homeFilm` manifest bindings.
4. Compare actual WebGL Home, Z, Work and window views at the same viewport.
   Check motion, native controls and reduced motion. A successful bake is not
   visual approval. Record runtime draw calls, texture budget, DPR and frame rate.
5. Capture actual WebGL posters named `loading.png` (1440×1440), `reading.png`
   (1440×900), and `share.png` (1200×630). Read `#room.dataset.assetBuildId` from
   that page, then seal the captures:

```sh
python3 scripts/room/build-assets.py seal-posters --candidate .room-build/high-quality/my-candidate --poster-dir /absolute/captures --capture-build-id THE_RENDERED_BUILD_ID
python3 scripts/room/build-assets.py promote --candidate .room-build/high-quality/my-candidate
```

`promote` requires a final-quality bundle and matching sealed posters, saves a
pre-promotion backup, and preserves the current city/movie bindings. It performs
no Git action or deployment. Run normal repository checks/build after promotion.

The `audit.json` budget includes decoded RGBA8 texture storage and full mip chains,
including deferred lamp-off maps. It excludes city, video, probes, Canvas textures
and render targets; use the runtime metrics to assess the complete scene.

Leaf sources are local under `sources/potted-plant-02`. `SOURCE.json` retains the
CC0 license link, author, original download URLs, original hashes and adapted-file
hashes. Only blades/petioles are imported; the Mainloop pot and soil stay authored.
The packed leaf albedo contains the byte-exact cutout mask in its alpha channel.

Do not rename `Plant_Leaf`/`Plant_Leaf.###`, CRT/VCR controls, `Work_Notepad`, or
the twelve content VHS roots without updating the corresponding picking tests.
`paper_bend` is shared by the mesh, ink tessellation and native hit targets.
`VHS_Master` supplies a visible static cassette and a shared moving clone.

## Static delivery preparation

After changing/promoting the model or baked maps, run these steps before the
site build. GitHub Pages receives the resulting static files; it does not run a
renderer on each request.

```sh
npm run assets:model
npm run assets:lighting
npm run assets:reflection
npm run assets:posters
npm run assets:check
npm run build
```

The four pinned glTF Transform/Meshoptimizer development dependencies perform
`assets:model`. The reflection and poster builders use the pinned project
Playwright dependency and require a local Chrome installation; no global package
or browser is installed by these commands. The optional `--playwright` argument
on the reflection builder can select another package directory. It starts a temporary loopback Vite server, captures with the pinned
Three.js version, and closes the browser/server. Normal site builds do not need
Chrome: `prebuild` verifies the already prepared payload, source hashes and Three
version and rejects stale input. Rebuild the reflection after shader/material
changes. Capture new posters only after the final build; its `buildId` changes
with the prepared model, materials and probe. `assets:posters` builds a temporary
production site, waits for complete lighting in each capture viewport, then
updates the three JPEGs and their `asset-build.json` receipt together. It leaves
source assets untouched if any capture fails. The normal build also checks that
all three JPEG hashes and the receipt's build ID match the prepared room.

`study.glb.bin` remains the original source. The normal build removes only its
unused copy from `dist`; the repository source remains available for repacking.
`study-meshopt.glb.bin` deduplicates
accessors, reorders the vertex cache, and encodes normals/UVs at 16 bits. Positions
are not quantized, meshes are not joined, and there is no decimation. The builder
round-trips its output and verifies every triangle's exact positions and winding,
and every node's name, transform, children, camera and extras. The current model
shrinks from 4,295,067 to 2,284,432 bytes. Runtime batching still owns draw-call
reduction; this packing does not claim to reduce steady-state draw calls.

The reflection uses the same 128-pixel cube faces and filtered CubeUV layout, stored as gzip-compressed
RGBA16F without pixel quantization. Its 384×512 layout is pinned to Three revision
186. It adds about 768 KB of transfer and replaces the runtime probe with a 1.5 MiB
texture, while moving scene capture and roughness filtering out of visitor startup. Lamp/TV area-light
highlights remain live. Hashes in the material manifest invalidate stale probes.

### Entry and full lighting

Only the desk/equipment/foliage/tape **room irradiance maps** have an entry tier.
The builder averages each 2×2 footprint in linear irradiance and re-encodes RGBM;
it does not resample the encoded RGB and multiplier independently. Albedos,
normal maps, roughness maps, screen content and geometry retain full detail.
These four files move from 2,976,530 bytes in the first-frame gate to 943,368 bytes,
a saving of 2,033,162 bytes. The full maps are fetched after the scene is ready,
then blended in linear light over 0.6 seconds while active. Reduced motion settles
the blend immediately. Loading failures leave the usable entry lighting intact
and may retry. `details.prepare` and `details.visible` separate this work from
first-frame timings.

This trades roughly 0.94 MB of additional eventual transfer for a shorter entry
wait. It is not an overall download reduction. All shared materials and the
lamp-off placeholder are rebound before entry maps are disposed; the normal full
texture budget is restored without permanently holding both tiers. The offline
reflection always captures full maps. Validate base/full Home at the same camera,
viewport and frozen film time, and check active playback on a throttled network.

### GPU-compressed texture pilot

A local Basis Universal 1.16.3 pilot preserved resolution and generated mipmaps.
No KTX2 payload was promoted: adding a decoder and these payloads would increase
first-load transfer, while ETC1S leaf edges would need additional visual review.
Exact-RGBA AVIF was also tested and rejected: equipment room lighting grew from
829,502 to 1,227,520 bytes; foliage room from 685,674 to 924,943; desk room from
730,196 to 867,204; foliage ORM from 345,434 to 582,745. All decoded bytes matched,
but transfer sizes regressed.
Current WebP atlas GPU storage remains uncompressed; model/probe optimizations
must not be described as reducing its approximately 402 MiB runtime estimate.

| Texture | Current WebP bytes | KTX2 bytes | Candidate |
| --- | ---: | ---: | --- |
| Desk albedo 4096² | 531,418 | 4,455,065 | UASTC, RDO 0.5 |
| Desk albedo 4096² | 531,418 | 879,863 | ETC1S quality 255 |
| Equipment albedo 2048² | 225,166 | 274,406 | ETC1S quality 255 |
| Foliage albedo 2048² | 779,046 | 771,128 | ETC1S quality 255 |
| Desk normal 2048² | 394,688 | 684,803 | UASTC, RDO 0.5 |
| Foliage normal 1024² | 305,632 | 429,197 | UASTC, RDO 0.5 |

To reproduce, losslessly decode the existing WebP to PNG, then use:

```sh
basisu -file INPUT.png -ktx2 -q 255 -comp_level 2 -mipmap -max_threads 6 -output_file OUTPUT.ktx2
basisu -file INPUT.png -ktx2 -uastc -uastc_level 2 -uastc_rdo_l .5 -ktx2_zstandard_level 18 -mipmap -max_threads 6 -output_file OUTPUT.ktx2
# Add -normal_map -mip_renorm for tangent-space normals.
```

This is a rejected transport experiment, not a statement that GPU compression is
always unsuitable. Reconsider per-texture formats with a tested transfer/decoder
budget and close-up visual comparisons if mobile 3D becomes a supported target.
