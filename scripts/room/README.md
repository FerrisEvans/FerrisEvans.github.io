# Room study

The current `/` is the rainy-night desktop experience; `/room/` is a compatible
noindex alias with a root canonical. `/lofi/` preserves the reading homepage;
article routes, existing `/page/2/` pagination, categories and About remain available.
It does not replace the blog content pipeline. Historical stage notes below are
retained as a record; their asset sizes, deferred work and limitations describe
those earlier builds, not the current build.

## Current build — 2026-10-31, high-quality desktop scene

The subsequent [immersion pass](IMMERSION.md) records complete panorama browsing,
native movie streaming, loading stage measurements, delayed runtime advice and
paper contact motion. It removes the manual reduced-motion preset; only the OS
accessibility preference and internal poster capture request a high-quality still.

The visitor chooses high-quality 3D or the existing LO-FI blog. The renderer
targets 60 FPS, renders DPR-1 displays at 1.5 and allows native DPR 2. Texture
anisotropy uses the device maximum up to 16. Software renderers, missing WebGL
and explicit capability limits enter LO-FI before downloading scene assets.
Sustained slow rendering offers LO-FI once; it never silently changes materials,
DPR or frame rate. Reduced motion remains an on-demand, high-quality still.

The hero assets retain HomeCamera and the established interaction names. The
plant uses the locally hosted CC0 Potted Plant 02 source, with independently
animated thin leaf blades, cutout albedo and separate soil/pot materials.
Source, licence and hashes are in `sources/potted-plant-02/`. CRT/VCR assembly,
telephone handset, keycaps and shared VHS shells/reels/windows are authored in
the Blender recipe. Work retains its camera and content on thin, gently curved
paper with a backing and page block. Its screen and native controls follow the
same bend. Paper atlas resolution was reduced only after same-view inspection;
this saves 8 MiB of decoded texture memory without a visible loss in Work.

The beauty pass retains default-framebuffer MSAA and AgX. A restrained,
occluded half-resolution bloom pass includes only light-emitting objects;
ordinary paper, wood and plastic do not bloom. Actual same-view comparisons of
128/256/512 PMREM did not establish a visible benefit from higher resolution,
so the retained static probe stays 128. Material profiles, curved geometry and
baked contact light supply the visible improvements. This remains one static
room probe, not dynamic ray-traced reflection.

The Home programme is a local 48-second, 960×720, 24-FPS original Blender film.
See `film/README.md` for its source, rendering, encoding and independent decode
validation. Its actual video clock drives the existing score and a precomputed
linear-sRGB lighting table. One fully buffered MP4, one VideoTexture and one
decoder replace continuous Canvas drawing; the original Canvas remains a
legacy/storyboard fallback. Home and TV close-up share playback. Navigation,
power, reduced motion and visibility pause it without resetting its position;
standby explicitly resets it. The MP4 has no audio track. CD and Home score
remain mutually exclusive, and PCM synthesis yields in short chunks instead of
blocking a frame for the complete buffer. Each score buffer is cached once.

The original city panorama has independent left/right architecture, a manually
aligned soft/hard depth mask, bounded camera-position parallax and explicit
train occlusion. See `window/README.md`. It is a 2172×724 source plate, not 4K
or a fully modelled exterior; close inspection still shows its two-dimensional
origin. Existing glass/rain work is retained.

Loading percentage measures download bytes, model preparation, texture upload,
reflection preparation, shader compilation and two real first-frame renders.
GPU preparation yields between bounded jobs. It does not replace completed
events with a timer. Poster URLs include the packed asset build ID.

### Final validation and measured costs

Build `b30a3bd377630788` passed `npm run check`, all 58 room tests, font coverage
verification and `npm run build`. Its 76 model/atlas/poster hashes match the
promotion receipt. The approximately 941 KB Three-related chunk warning remains.
The first-frame asset list is 69 files / 21,964,481 bytes (20.95 MiB), versus
45 / 11,401,483 bytes (10.87 MiB) before this round. The film package accounts
for 5.91 MiB. Lamp-off maps defer 3,024,894 bytes until the first toggle and add
about 23 MiB of decoded texture storage, retained for subsequent toggles.

Actual Chrome 156 on Apple M3 Max, at 1440×900 CSS pixels, measured approximately
60 FPS at render DPR 1.5 and 2. A separate 156-second DPR-2 run measured 59.88 FPS,
P95 18.6 ms and worst 33.5 ms, without a ≥50 ms main-thread task. Texture and
geometry counts remained 87/122; one additional video frame was dropped across
3,695 decoded frames. Complete frames use 287 draw calls / 841,955 triangles,
including the selective bloom pass. Allocated texture storage is approximately
469 MiB at DPR 2; default framebuffer MSAA/depth, driver caches and video decoder
surfaces are additional. This is a single high-end device measurement, not a
universal performance or long-term leak guarantee.

Cold-load verification exposed a synchronous gzip/mesh construction stall.
Native streaming decompression and short mesh batches keep the loading OSD
responsive and report actual completed meshes. In matched Fast-4G simulations,
the longest model task fell from 696 to 61 ms; the longest whole-load task was
197 ms, and total readiness increased from 26.45 to 30.75 seconds. Individual
large texture uploads still block briefly. This tradeoff is recorded rather
than claiming the entire initialization is nonblocking.

Actual browser checks cover Home/TV continuity with one score source, Posts
pause/resume, TV power/LED, CD exclusion, Work selection/pause/eject, article
navigation and BFCache return, About/Online/history/ESC, window drag/zoom bounds,
reduced motion, mobile LO-FI and deferred lamp maps. Software/low-capability/no
WebGL fallback was tested by browser capability injection, not extra physical
devices. Visibility-state injection pauses movie and sound; real article
navigation separately exercises pagehide. Native background-tab hiding was
not reliably reproduced by the automation environment.

The review includes same-view DPR-1/2 Home, TV, Work and window images plus
actual before/after browser recordings. Plant silhouettes and film depth have
clear visible gains. Paper thickness and plastic microfinish have smaller
gains; the soft 2D city, static reflection and some material integration remain
below the reference's photographic finish. One auxiliary-browser window test
triggered a 33-FPS LO-FI suggestion before recovering; quality did not degrade.

### Rebuild and promote a matching asset set

`build-assets.py` is the current entry point. It composes the established refine
modules into a private candidate, verifies required mesh names and both UV sets,
and hashes the packed files. Do not use the historical `build.py` below.

```sh
python3 scripts/room/build-assets.py bake --candidate .room-build/my-candidate
python3 scripts/room/build-assets.py audit --candidate .room-build/my-candidate
python3 scripts/room/build-assets.py site --candidate .room-build/my-candidate
# Run npm run build with cwd=.room-build/my-candidate/site, then preview its dist.
# Capture actual WebGL loading.png (1440×1440), reading.png (1440×900),
# and share.png (1200×630). Read #room.dataset.assetBuildId from that page.
python3 scripts/room/build-assets.py seal-posters --candidate .room-build/my-candidate --poster-dir /path/to/captures --capture-build-id ACTUAL_BUILD_ID
python3 scripts/room/build-assets.py promote --candidate .room-build/my-candidate
```

Promotion requires a final bake, a valid packed-file hash and matching poster
receipt. It backs up the previous public bundle and preserves the separately
authored city and film bindings. Film sources and temporary rendered frames do
not download with the website. The current validation report records actual
browser evidence and full resource costs separately from pipeline checks.

## Previous build — 2026-10-30, Home playback and programme refinement

Home-channel playback now accepts both the `home` and `tv` viewing states.
Power, channel, active/hidden state and reduced motion still gate the same clock;
navigation and the deck state machine are unchanged. Actual production-browser
reproduction froze `homeTime` at 25.954 in TV close-up before the fix. Afterwards,
it advanced 15.284 → 17.301 over two seconds; returning Home did not stop or
replace the score source. Posts/power transitions retain the position, and CD
music owns the audio output until stopped. Tests cover the TV viewing gate and
audio-source reuse, rather than only testing the isolated timeline.

The original 48-second, three-chapter NIGHT LOG stays local Canvas content.
Rounded train/terminal/cup forms, graded lighting, contact shadows, layered hills,
a gentle push-in and short fades through dark improve continuity with the room.
The retained 24 FPS option visibly improves train/parallax cadence over 12 FPS;
typing keeps its original character rate. Average screen colour still drives
room lighting. This is a refined illustrated film, not photorealistic footage.
No video, audio download, decoder or per-frame texture allocation was added.

An actual Chrome regression was found during final review: the main CRT canvas
had `willReadFrequently: true`, although pixel reads occur only on a separate
32x24 sample canvas. Removing that hint from the drawing canvas restored the
same final assets/programme at DPR 1.5 from roughly 33–49 FPS to 56.5–60 FPS
over a complete 48-second loop. The sample canvas retains its readback hint.
The same-assets DPR-1 control was also slow, so supersampling alone did not
explain the regression. Do not substitute the earlier fast IAB sample below
for this Chrome check. Longer final measurements are recorded in the local
review report alongside chapter-specific samples and memory observations. Final production Home at 1440x900 /
DPR 1.5 ran for 208 seconds: each chapter median was 60 FPS, overall range
47.1–60; 53 textures and 83 geometries remained constant. Thirteen >=50 ms
long tasks occurred (max 249 ms; four after the first minute). Browser-reported
JS heap fluctuated around 138–247 MB and ended below its initial reading; this
is not a precise GPU-memory measure or proof of zero stalls.

The adaptive monitor additionally measures mean throughput. Repeated stalls
can now trigger a downgrade even when fewer than 60% of frames miss their
deadline. Two four-second windows, transition/hidden exclusions and the 15-second
cooldown remain. The observed Chrome regression dropped to balanced after about
10 seconds with this safeguard; normal 30/60 FPS and isolated pauses do not
trigger it. The regression test uses one 85 ms stall per four healthy frames.

Check, 43 room tests, font coverage and production build pass. Final production
smoke covers Home/Z/Posts, tape select/play/pause/EJECT, two-stage ESC, power/LED,
CD exclusivity, About/Online, history, reduced motion and mobile fallback/LO-FI.
Audio assertions inspect actual Web Audio sources, not subjective listening.
Visibility freezing is tested with an injected visibility event because the
automation environment keeps native background tabs visible; native background
transition behavior is therefore not certified by this run.

Assets remain round 11 / manifest v17 with all three posters at cache v18.
The final asset/download totals and remaining material limits below still apply.
The coordinating chat's `mainloop-review.html` includes 1440x900 Home/Work/window
before/after images, reference views and a full-length synchronized film comparison.

## Asset checkpoint — 2026-10-30, round 11 / material manifest v17

This follows the desk/wall pass below. `refine_ceramic.py` authors a continuous
hollow stoneware shell, rounded rim/foot and a slimmer D handle. The runtime
preserves those baked parts when `ceramicInterior` is present; older GLBs retain
the existing hollow-shell fallback. Sip, liquid level and steam behavior remain.
The actual browser shows lift/tilt, return to the tabletop, liquid reduction,
lamp-off shading and a still/steam-free reduced-motion action. Three behavioral
unit tests cover authored material retention, rest restoration, draining and the
legacy path. Geometry audit: only Mug_Body/Handle change; 560 other mesh/camera
nodes are unchanged relative to round 10.

`city-night-v3` is a built-in imagegen lighting edit of our existing local plate.
Warm/cool windows, wet roof reflections and the existing MAINLOOP billboard gain
separation; building/rail silhouettes and the approximate hard occlusion mask
are visually checked together. No weather shader or new remote dependency.
The output remains 1672x941, **not native 4K**. Generation details and prompt are
in `public/room/city-night-v3.generation.json` and `city-night-v3.prompt.txt`.
The Blender camera-only plate is refreshed; its constant diffuse-bounce branch
is unchanged, so no lighting rebake is needed solely for the photo replacement.
The mug/model/atlas set was fully regenerated before this plate-only change.

Final initial scene assets: 11,401,483 bytes (+4.8% over round 10, +16.0% over
pre-desk baseline); the measured IAB 1440x900, DPR 1.5 high-quality sample was
60 FPS, 147 draws and 427,304 triangles. This is a device-specific observation,
not proof for every GPU. Adaptive downgrades and the mobile LO-FI fallback remain.
All three production WebGL posters are regenerated (cache v18). Check, 42 room
tests and production build pass. Before/after/reference images, window edge
checks and mug animation frames live in `reference/round11` in the task's
visualization folder; acceptance metrics live in `.room-build/round11`.

The retained gains are more physical cup contours/shading and clearer city light
layers. CRT/VCR plastic and tape print detail remain below the reference; they
were inspected, not remodeled in this pass. The city is still a bounded photo,
not an explorable 3D exterior. Whole-room photographic parity is not achieved.
The authorized coordinating thread owns the concurrent Home programme/P0 and
final broad interaction verification; this section describes the asset pass.

## Previous build — 2026-10-30, round 10 / material manifest v16

`refine_desk.py` keeps the tabletop at z=.685 and floor at z=-.265. Its slab is
.065 thick instead of .11, with smaller eased edges, six connected legs and eight
aprons including the return's inner support. No props or cameras were moved.
The pot's underside alone extends .005 to meet the table. Walnut follows each
member's length, with distinct end grain, fine fibres and restrained arris wear.
Colour is baked at 4096; normal/ORM and room illumination remain 2048. The 4K
colour texture costs about 516 KiB; it combines the existing broad grain image
with newly sampled procedural fibres, not a newly photographed 4K wood scan.

The reported left black seam was coplanar wall overlap; the right blue/gray hole
was an actual gap below the pier. A closed back-wall ring replaces six overlapping
sections. Ray probes cover both defects and the intentionally open window. Outer
crossrails now stop at the correct side-post faces. Lamp, curtains, foliage and
camera geometry remain fixed. A temporary prop repack produced blotchy CRT side
lighting and was rejected. `preserve_props_uv.py` reserves the pre-desk prop layout
before removing its structural members; small smart-projected islands need not be
bit-identical, so acceptance also checks the actual browser rendering.

High-capability DPR-1 devices now render at 1.5x; existing adaptive downgrades
remove that supersampling. The verified 1440x900 full-motion sample remains 60 FPS.
Initial scene assets: 10,877,943 bytes vs 9,830,039 (+10.7%); deferred lamp-off maps:
3,344,650 bytes. The first 13.80 MB candidate was rejected. Low-frequency wall and
TV irradiance resize in linear light before lossless RGBM encoding. No global
exposure, camera, navigation or VCR state-machine change belongs to this pass.

Home/Work/reference, both defect crops and rejected-candidate evidence are in
`reference/round10` of the task visualization folder. All three WebGL posters are
regenerated at their native sizes (cache v17). Check, 39 room tests and production
build pass at this checkpoint, including the concurrent TV/Home playback fix.
Visible gains are closed seams, better tabletop proportions and clearer grain;
wear remains subtle and photographic material/light quality is still below the
reference. This is not a claim that the whole room has reached photographic parity.

## Previous build — 2026-10-30, round 9 / material manifest v15

Window-only joinery pass. `refine_window.py` adds eased shoulders and glass
retaining rebates, stops the crossrails at the central mullion, rounds the sill
nose, and gives the existing handle returns and a mounting plate. Longitudinal
shellac oak replaces the blotchy timber finish. A first high-contrast grain
candidate looked striped in Home and was rejected; the retained grain is quieter.
The window opening, HomeCamera and all lamp/plant/curtain geometry stay fixed.

The accepted architecture charts are restored before the window refiner runs.
Only window parts move to a dedicated atlas, so walls and previous cloth charts
do not repack. Final geometry audit: 18 window meshes changed, 544 other nodes
unchanged, no added/removed nodes, no non-window UV mapping changes. All baked
maps and WebGL posters were regenerated together; poster cache is v16.

Window inspection still turns at the glass. Lens bounds now account for both
axes and are resolved before orientation bounds, including the final transition
frame. A regression test sweeps each animation frame through drag/pan/zoom and
seven aspect ratios. Ratios at or below 6/5 still use the existing LO-FI fallback;
the smaller ratios in the navigation test are defensive coverage. Production
checks at 1440×900 and 1250×1000 found no gray/black mask, before or after this
pass. The automated sweep did expose transient photo-bound overruns before the
fix. Do not confuse the blank overcast sky with missing geometry. The city is
still a bounded photographic plate, not an explorable 3D environment.

At 1440×900 / DPR 1 the final scene downloads 9,830,039 bytes, versus 9,550,087
(+2.9%). Full-motion draws are 145 versus 143, triangles 421,552 versus 412,376;
the local render-counter sample is 60 FPS. Window colour stays 1024px, other
maps 512px and its weak TV contribution 256px. Other atlas quality is unchanged.
Reference/before/after captures live in `reference/round9`. The visible gain is
cleaner joinery, edge depth and calmer grain; photographic patina and soft light
remain below the reference. Check, 37 room tests and production build pass.
Browser smoke checks also cover lamp-off/on, reduced-motion inspection, Work
selection/play/pause/eject, Home return and the 390×844 fallback/LO-FI link.

## Previous build — 2026-10-30, round 8 / material manifest v14

Curtain-only art pass. `refine_curtains.py` now builds unequal, relaxing folds,
a closed 1.4 mm shell, turned side edges and a weighted 48 mm hem. The bottom
is 0.14 scene units higher so the hem clears the objects below the sill; hanging
height, width and object transforms stay fixed. The old coarse header was removed
after the square poster revealed pinched, blocky shadows. No camera was changed.

Four continuous front/back cloth charts replace fragmented smart-projected
islands. Linen has restrained yarn/roughness variation, a small normal relief,
and runtime MeshPhysicalMaterial fibre sheen. Other materials, lights and AgX
exposure retain their previous settings. Room/lamp-off cloth irradiance is 512px,
its weak TV illumination 256px, and colour remains 1024px. RGBM is resized in
linear space and encoded as lossless WebP. The existing cloth animation remains; reducing motion now
restores its original normals as well as positions.

`architecture-uv.glb` is an authoring UV reference extracted from accepted v13
geometry, containing only 29 building meshes. `preserve_architecture_uv.py`
verifies their spatial geometry before reusing those charts; it is not a runtime
request. Re-author this reference if building geometry changes. A new automatic
unwrap altered window/wall shading; reducing padding did not solve that regression
and was rejected. Final audit: 560 other nodes retain geometry, all non-curtain UV
mappings stay unchanged, and HomeCamera is identical. All bake maps and three
production WebGL posters were regenerated together; poster cache is v15.

Production Home at 1440×900 / DPR 1: 9,550,087 initial scene bytes, versus 8,928,344
before (+7.0%). Full-motion draws remain 143; rendered triangles are 412,376 versus
382,040. The local high-quality render-counter sample is 60 FPS, not a cross-device
performance guarantee. No external image/media dependency was added.

Actual reference/before/after captures are in `reference/round8`: Home, Work,
curtain crop, lamp-off and full-height poster. The accepted result has broader
relaxed cloth faces and a clearer, unequal hem. It still lacks the reference's
photographic fibre detail and light diffusion. The first deeper, hard-looking
fold candidate and the old-header transition were discarded. TypeScript, 36 room
tests, font/content checks and production build pass; normal/reduced cloth motion,
lamp on/off and the existing navigation/media flows were checked in production.
The 390×844 fallback shows the updated poster and opens the LO-FI reading page.

## Previous build — 2026-10-30, round 7 / material manifest v13

`refine_plant.py` replaces the seven broad blades with 16 individually cupped,
veined leaves on three branches. The clay pot has a tapered foot, rolled rim,
inner wall and separate soil. Baked leaf-base metadata survives atlas separation;
the runtime uses it for delayed leaf recoil, retaining the whole-plant root sway.
Actual Chrome leaf and pot clicks worked before this change: the old animation
was too subtle and rigid, not a missing event handler. Animated hit boxes now
follow the blades; reduced motion gives an explicit non-animation response.
Branches are batched within the moving root, while leaf pivots remain independent.

`refine_room.py` trims side walls and floor at the rear wall, closes the header,
reveal and ceiling, gives the return two supports, closes the 0.01-unit leg gap,
and replaces the overlapping desk slabs with a joint. Desk height relative to
the floor is 0.95 scene units (previously 0.685), while the tabletop, props and
HomeCamera stay fixed. Oak follows each timber, return walnut follows its long
axis, and wood/linen roughness and colour variation are more restrained.

Window inspection turns in place instead of orbiting the distant card. Its
horizontal and vertical field of view is bounded by the exterior's valid area;
four-corner ray tests cover drag and zoom limits. An initial wider-view candidate
exposed mirrored buildings and then a bottom edge; both were rejected and the
inspection constraints revised. Outside the close inspection, the existing 2.5D
plate has edge haze continuation. This remains a photographic backdrop, not a
freely explorable 3D city. The camera transition to the white computer already
worked in normal motion: physical shell/screen clicks were verified, not rewritten.

All model/irradiance/surface atlases were regenerated together. Loading, reading
and share posters are production WebGL captures, cache v14. Geometry-bound audit:
506 existing nodes unchanged, no unexpected moved objects, HomeCamera identical.
Production Home at 1440×900 / DPR 1: 8,928,344 initial scene bytes (was 8,809,780),
382,040 full-motion triangles (was 376,504), 143 draws (was 137). A two-second
render-counter sample reported 60 FPS at high quality; this is a local spot check,
not a cross-device performance guarantee. `data-render-fps` exposes the sample
without adding a visible debug control.

TypeScript, font/content checks, 36 room tests and production build pass. Browser
checks cover plant clicks, normal/reduced motion, window inspection, computer
approach, Work selection/play/pause/eject, TV power/LED, sound toggles, Posts,
article opening, About/Online, history/ESC, mobile fallback and LO-FI. Screenshot
evidence is in the task's `reference/round7` folder. Home and Work comparisons
show real geometry/material improvements, but not photographic parity: cloth
weave, close leaf detail, baked shading and the exterior still need art direction.
The first sparse plant candidate was replaced; linen improvement remains modest.

## Previous build — 2026-10-30, round 6 / material manifest v12

Lamp-only revision: `refine_lamp.py` replaces the straight diagonal rod with a
continuous curved tube, a thin spun-metal shade, separate lining, rounded shallow
base, foot collar and socket. Parts use their real spatial dimensions; the old
camera-plane shade deformation is no longer used. The base stays in front of the
existing card file after a first, occluded placement was rejected in rendering.
Copper, enamel, brass and ivory lining have separate roughness/metalness. The
existing warm reflection source was repositioned overhead at the same intensity
to form a readable highlight on the new shade. A frontward-source experiment
flattened the copper and was rejected; base tint changed only modestly. A small
frosted bulb follows the existing lamp transition. Shade and lining move together.

All illumination atlases were rebaked for the new geometry. Non-lamp albedo, ORM
and normal maps were preserved from round 5 after checking their UVs were identical.
The final audit found all 526 non-lamp nodes, their geometry/UV data and camera
transforms identical to round 5.
Loading/reading/share posters were recaptured from production WebGL, cache v13.

1440×900 reference/before/after images show a clearer curved stem, thinner base
and separated finishes. This is an improvement to the lamp, not photographic
parity or acceptance of the rest of the room. Production checks verified on/off
with reduced and full motion, a dark bulb when off, and continuing Home playback.
Normal motion was restored after the static comparison. TypeScript, 32 room tests
and production build pass. First-load scene bytes: 8,858,178 → 8,809,780; reduced
Home triangles: 373,048 → 376,216; draws: 132 → 134. These counts do not establish
long-session or cross-device FPS performance.

Next items requested by the user, intentionally not bundled with this lamp change:
pot/leaves/window-frame/curtain/desk materials; plant and computer click animations;
window exploration; exposed grey/black exterior boundaries; desk/room proportions;
other physically implausible contacts or geometry. The exposed boundaries were
observed. The animation reports need reproduction with full motion enabled, as
the comparison capture had reduced motion enabled; do not label them fixed yet.

## Previous build — 2026-10-30, round 5 / material manifest v11

Home now runs an original 48-second Canvas station film, NIGHT LOG: a train,
a small idea at a terminal, then an inhabited pixel landscape. Its 12 FPS canvas
updates reuse the existing texture and linear average; the room render loop owns
the only timeline. Leaving Home, changing input, switching TV power off or reducing
motion pauses it; returning resumes, and standby resets it. Reduced motion uses
a fixed city frame. A gesture-gated synthesized score shares that clock, yields to
the CD and stops with SOUND OFF. No media downloads or remote station assets.

The TV power LED now has its own material and follows the deck power, including a
dark standby colour and a fixed reduced-motion state. The computer LED is separate.
TV baked contribution and analytic reflection were adjusted together; global AgX
exposure is unchanged. Window optical mixing now retains more city detail, with
selective existing light halos. VHS jackets have a lighter, less saturated paper
finish, hero plastics a restrained roughness correction, the existing pencil is
visible near the desk front, and Work paper has a slight spatial tilt.

No Blender geometry, camera or RGBM atlas was changed. RGBM decoding was checked
against the exporter and no mismatch was found. Loading, reading and share posters
were recaptured from the production renderer. `?capture=poster` captures the ready
state at 1440×1440; `?capture=reading` enters a silent, reduced-motion Home with UI
hidden (1440×900 reading, 1200×630 share). These flags only support asset capture.

Round 5 evidence compares reference/before/after at 1440×900. It shows a real but
limited improvement in Home activity and TV colour response, not photographic
parity. A paper curvature/fibre experiment became grey and was reverted; increasing
lamp reflection from 36 to 50 was visually ineffective and reverted. Lamp softness,
plant detail, natural VHS stacking and convincing paper remain unfinished. The
city still uses a 2D plate; its rain model was not replaced in this round.

Verification: TypeScript check, 32 room tests and production build (including font
coverage). IAB production checks cover navigation, tapes 1/6/12, play/pause, Eject
via the keyboard menu, power/LED, Posts boundaries/article opening, history/ESC,
Sound UI/context, reduced-motion UI and 390×844 LO-FI. A physical tape-slot click
was not accepted as an Eject pass. Actual OS reduced-motion/hidden-tab behaviour
and audible mixing were not verified in this browser. Its tab switch kept
`document.hidden=false`; existing visibility handling remains in place.

An isolated short same-device rendered-frame sample was 60 FPS before and 57 FPS
after at 1440×900/DPR 1; a longer mixed QA session reached the adaptive balanced
30 FPS tier, so this is not a cross-device or long-session performance acceptance.
Scene asset downloads stayed at 8,858,178 bytes (excludes page JS and posters),
with 131→135 draws and unchanged 373,336 rendered triangles in animated Home.
The production build does not include the temporary frame measurement snippet.

## Previous build — 2026-10-30, round 4 / material manifest v11

Work is a manually curated collection of articles with authored animations. Posts
is generated from `getPosts()` and remains the complete published catalogue.
New posts do not need an animation; follow `content-maintenance.md` when adding one.
About now uses one source (`src/data/room-about.json`), and `npm run build` checks
pixel-font coverage and source/hash consistency. Font generation is an explicit
maintenance step; normal builds do not need Python/fontTools.

The VCR state model separates selected media, transport, time, television power
and input. Work opens without autoplay; Stop rewinds inserted media, Eject clears
it, and TV power restores the previous input. Browser navigation preserves Posts
pagination. Narrow/no-WebGL/no-JavaScript visitors receive a real scene poster,
static recent links and an explicit LO-FI entry.

P1 keeps the existing Blender model and baked materials. Only the desk lighting
excludes the movable notepad during its three illumination bakes, preventing a
black rectangle after pickup. Exported GLB geometry and cameras match v10 exactly.
Posts/Work/computer runtime cameras, restrained scene controls, environment-lit
paper, reflective computer phosphor, screen-local CRT glow and independently
softened depth/hard train masking were refined. These are incremental changes,
not a claim of photographic equivalence to the reference.

P2 selects a conservative initial tier from WebGL capabilities, then lowers it
only after sustained slow rendered frames. High uses 60 FPS / DPR cap 1.75;
balanced 30 / 1.4; low 30 / 1. Software renderers default to LO-FI and require an
explicit “try low quality” action. Reduced motion renders on demand; background
pages stop rendering. Lamp-off irradiance is deferred until needed, and switching
the lamp waits for complete maps; a failed request leaves the lamp lit for retry.
The Three.js shared chunk is measured but retained rather than split arbitrarily.

Verification commands: `npm run check`, `node --test scripts/room/*.test.mjs`,
`npm run build`. The round4 browser comparison contains 1440×900 reference,
before and after views. The reference, independently authored city, Chinese
content and geometry/material differences are documented there; mobile 3D and
exhaustive Safari/Edge coverage are not claimed for this round.

## Historical visual build — 2026-10-29, round 3 / material manifest v10

Round 3 refines the independent model and material treatment: hollow round-bellied
plant pot, curved leaves with baked soft veins, irregular cloth folds, double
window rails, a thinner CRT bevel with recessed controls, a rounder lamp shade,
VCR fascia details and twelve varied VHS sleeves. `refine_geometry.py` and
`refine_curtains.py` run inside `materials.py`; neither changes HomeCamera.

The lamp uses a 160 W, 100-degree source and a separate 512-pixel light atlas.
Architecture is 1024; desk and props are 2048. Normal, ORM and RGBM data retain
lossless transport. The city and walnut assets were independently generated;
their exact prompts, output dimensions and provenance are recorded in
`public/room/city-night-v2.generation.json` and
`public/room/walnut-grain-v1.generation.json`. The wood is a synthetic albedo
approximation, not a measured scan or mathematically seamless texture. The main
desktop uses one image span, avoiding an internal repeat seam.

The city card is farther behind the glass while retaining its Home projection.
Window inspection uses bounded orbit, pan, zoom and an eased lens to keep the
near view within the exterior. The loading poster is a v10 WebGL ready-state
capture. Near-square layouts still use LO-FI by design.

Current evidence: TypeScript check, 2 loader tests, production build (61 routes,
18 indexed articles), Chromium Home and close views, all 12 playback selections,
one physical tape hit, lamp toggle, layered Work Escape, About paging and 390×844
LO-FI. The v10 Home load measured 11,821,766 bytes including manifest/fonts,
128 draws and 373,048 triangles at DPR 1 with reduced motion; these are scene
observations, not a frame-rate benchmark. Browser warnings/errors were empty.
Safari and Edge coverage below belongs to round 2 and was not repeated for v10.

The nine-item comparison includes remaining limits: static reflection probe,
baked lighting retained on small prop movements, a 2D exterior, and differences
in fine wear, glow, plant complexity and secondary props. Passing interaction
checks does not establish photographic equivalence.

## Retained interaction implementation — round 2

- Main views: Home, Work, Posts, About and Online. Window, TV, CD and calculator
  are transient inspections: the route remains unchanged and Escape restores the
  preceding view. Mouse left drag orbits; right drag pans; the wheel zooms inside
  bounded limits. Bare pointer movement does not steer the camera.
- Twelve independent, locally rendered concept programmes use the existing blog
  subjects and real article links. Each physical VHS and paper directory item
  selects its own programme. Cassette return/insertion is queued; latest choice
  wins. REW/FF select adjacent programmes. Play, Stop, Eject and write-protected
  Record have separate actions.
- Work raises a physical notebook into the right foreground. First Escape or
  outside click lowers it while playback continues; second Escape returns Home.
  After lowering it, changing tapes across Home preserves that choice. N or the
  Work navigation explicitly raises the notebook again.
- About displays all existing About content in a 16-page computer reader.
  Arrows scroll a line, PageUp/PageDown/Space page, Q returns to the computer
  terminal. Online stays on the same computer with a modem/BBS sequence and
  GitHub/email links; Q hangs up to the terminal.
- Model v7 includes an independent 6-button CRT control panel and power switch,
  volume/tracking/chroma knobs, 20-key calculator, phone, CD player, pager,
  floppy, glasses, clock, pencil, rolodex, walkman and RSS card. These are our own
  geometry and content. No original-site asset or executable is a runtime dependency.
- Warm lamp-on and lamp-off irradiance are separately baked in Blender. The TV
  diffuse bake follows the linear screen average independently; scene-probe and
  analytic highlights supply reflections. Lamp fading therefore changes light
  rather than dimming the entire framebuffer. CRT plastic, wood and paper have
  restrained roughness/normal wear. Curtains are subdivided for ambient movement;
  reference research did not establish a clickable curtain interaction.
- Coffee has a hollow cup, sip motion, diminishing liquid and steam; the pager
  has a local LCD texture, brief vibration and fading backlight. Reduced motion
  disables physical coffee/steam movement.
- Sound remains explicit opt-in, with local rain/hum/control tones and an original
  synthesized CD loop. Backgrounding and standby mute audio. Reduced motion snaps
  current transitions to their endpoints without navigating away or raising paper.
- A selected Mainloop loop-and-pixel SVG wordmark and matching favicon sizes
  replace the previous identity. Short room UI uses locally hosted VT323 and a
  renamed OFL Fusion Pixel Chinese subset; article body fonts remain unchanged.
- Existing article, LO-FI, search, tags and category routes are retained. Mobile
  and narrow viewports take the LO-FI path before Three.js imports or scene fetches.
  Desktop WebGL 2 is checked before downloading the scene. Loading/context failures
  retain retry and LO-FI paths. The loading poster is a capture of this renderer.
- Static geometry is batched, dynamic assemblies are grouped by material. DPR is
  capped at 1.75 and continuous animation at 30 fps; hidden pages stop rendering.
  Material data is lossless WebP, albedo/city use WebP, and the GLB uses lossless
  gzip transport. Raw reproducible sources stay under ignored `.room-build/`.

### Round 2 verification and limits

The v7 asset readback confirms 12 VHS objects, 6 CRT control buttons plus separate
power, all required prop names, both material/light UV sets and exact GLB gzip
round-trip. The compressed model/maps/city total 10,292,693 bytes; loading-font and
manifest bytes are counted separately in the actual loader. Do not reuse v5 byte
counts or draw-call measurements for this build.

Independent Chromium review exercised all 12 physical VHS hit regions and all
12 paper controls, paper state across Home, Work Escape layers, calculator 7+8=15,
left-drag orbit, lamp on/off, Window route preservation and Online dial sequence.
The reviewer found an About Space/focused-navigation conflict, subsequently fixed.
Main implementation verification additionally covers calculator physical controls,
Online Q/terminal navigation, reduced-motion/standby cleanup, mobile 390×844,
light/dark wordmark, existing article navigation and Chinese full-text search.
Final build-specific results and screenshots are delivered in the local audit HTML.
The latest candidate also passed native Safari entry, Work selection, layered
Escape and About Space paging, plus native Edge entry, Window and explicit
sound/background-mute behavior. This is core-path coverage, not an exhaustive
cross-browser interaction matrix.

Composition measurements are comparisons to screenshot estimates, not original
mesh measurements: the CRT boundary differs at most 6.71 px and the lamp shade
0.56 px at 1440×960. CRT bulge is 37 mm and notebook thickness is 14.4 mm. These
numbers do not prove photographic equivalence. The city, secondary prop placement,
programmes and biography are independently authored/adapted for this blog. Posts
use five Chinese rows per page; the reference uses eight. The walkman shows an
original audio note instead of borrowing the reference's podcast catalogue.

### Rebuild the scene

The normal website needs only `npm run dev` or `npm run build && npm run preview`.
Do not rebake merely to change article content, CSS or navigation text.

For scene/model/material changes, run these from the repository root, in order:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python scripts/room/greybox.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python scripts/room/materials.py -- --skip-render
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python scripts/room/interactions.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python scripts/room/screen_projection.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python scripts/room/audit.py
python3 scripts/room/optimize.py --activate
npm run check
node --test scripts/room/assets.test.mjs
npm run build
```

`optimize.py` needs Pillow and NumPy. This machine used the existing bundled
Python runtime; no global installation was performed. The command deliberately
rejects already optimized assets: regenerate a fresh bake first. Raw sources and
Blender files are retained under ignored `.room-build/`. Geometry changes require
regenerating interaction anchors. Light/camera/weather changes require a new
1440 × 1440 loading capture and the three-size alignment check described below.
Do not use `.room-build/review` or `.room-build/polish` snapshots as current source.

### Visual scope

This is an independent recreation with a verified interaction map, not an exact
copy of the original models or photographs. City geometry/depth, wear distribution,
secondary props and localized interface content still differ. Original recordings,
personal employment history and podcast media are not transplanted. Mobile uses
LO-FI by design. Do not call it 100% or photo-identical to the reference.

## Historical stage record

## Generate and preview

From the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 --python scripts/room/greybox.py
npm run dev
```

Open `http://localhost:4321/room/`. The generator writes:

- `public/room/greybox.glb`: geometry, grey materials and `HomeCamera`.
- `public/room/greybox.json`: 1440 × 960 camera projection checkpoints.
- `.room-build/study-greybox.blend`: reproducible Blender working file, ignored by Git.

Blender must be able to initialize Metal. In the Codex sandbox on this machine,
background startup crashed during GPU initialization; the same command passed
outside the sandbox. No global installation or preference changes are needed.

The browser uses the exported camera and derives its horizontal field of view
from that camera. It does not run an animation loop: it renders after loading,
resizing, and returning to the visible tab. The model uses no remote resources.
The reference outlines are estimates from a 1440 × 960 screenshot, not exact
measurements of the original scene. They follow the same horizontal framing when
the viewport changes. Escape hides the outlines.

## Stage 2 acceptance

Compared at 1440 × 960 / DPR 1 against the reference Home view:

- CRT case: approximately (516, 381) to (876, 746) pixels.
- Screen centre: approximately (696, 528) pixels.
- Lamp shade: approximately (179, 392) to (336, 516) pixels.
- Window sill: approximately y = 598–635 pixels.
- Main view: about 19,084 rendered triangles, 73 draw calls, approximately 1 MB GLB.

The primary composition is accepted for the material stage. Remaining small
differences include the lamp base about 20 pixels low, VCR bottom about 12 pixels
low and the right VHS stack about 18 pixels short of the reference right edge.
These are screenshot estimates, with roughly 5–10 pixels of reference uncertainty.

Verified: browser WebGL 2 rendering, 1440 × 960 and 1280 × 800 desktop framing,
reference-outline toggle and Escape, and a 390 × 844 phone view with a working
link to the original blog. On a phone the preview does not create a WebGL canvas.
No WebGL and no JavaScript also have reading links; comprehensive fallback and
cross-browser testing remains part of stage 7.

The greybox contains no material textures or effects. Its camera and primary
geometry remain the starting point for the material study below.

## Stage 3 pipeline

After generating the greybox, run:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 --python scripts/room/materials.py
```

`--draft` uses 512 px atlases and 48 diffuse samples; the normal run uses 1024 px
architecture and 2048 px desk/prop atlases with 128 diffuse samples. Use
`--render-only` to inspect the physical light setup, or `--skip-render` to bake
without the reference Cycles render. The camera is inherited without modification.

Every atlas has albedo, ORM, tangent normal, room illumination, and white-TV
illumination. MaterialUV and LightUV are distinct named UV sets (initially sharing
the same non-overlapping layout), exported as TEXCOORD_0 and TEXCOORD_1. Runtime
lighting samples LightUV. The 105 baked meshes retain their names and an atlas
identifier for later interactions; the screen and city plate stay separate.

Albedo is explicitly encoded as sRGB. ORM and normals are linear data. Cycles
DIFFUSE DIRECT + INDIRECT passes exclude COLOR, and are denoised in linear HDR
with Blender's compositor Denoise node before RGBM8 encoding. Each light map has
its own power-of-two range in manifest.json. PNG export never applies the AgX
display transform to data maps. The generator rejects non-finite pixels.

The runtime decodes both RGBM maps and evaluates:

```
albedo × (roomIllumination + whiteTvIllumination × meanLinearScreenColor)
```

Three.js's Lambert BRDF divides by pi; lightMapIntensity=pi compensates for the
Cycles diffuse-without-color pass. Real-time area lights supply specular only,
so their diffuse contribution is not counted twice. An unshadowed analytic lamp
inside the shade was removed after it produced a hard-edged reflection through
the shell. Static lamp illumination remains in the bake.

The TV Canvas test patterns are blue, white, amber and off. Their pixel average
is computed after sRGB-to-linear conversion; off explicitly zeroes the TV light.
This is a lighting test screen, not the final CRT interface. The screen uses a
glass-like clearcoat. A single 128 px reflection probe samples this same scene
with the TV off; the probe adds specular reflections only. It is an approximation
for the fixed composition, not ray-traced or per-object reflection.

The original city plate at `public/room/city-night-v1.png` was generated with
image_gen for this project (1672 × 941). It is not a downloaded reference-site
asset. A restrained linear atmosphere blend lowers background contrast. Rain,
window droplets and animation are not part of this material stage.

The current uncompressed material bundle is about 27.7 MB including the 2.9 MB
GLB, plus the city plate. Texture compression and mobile delivery belong to
stage 7. The mobile preview currently starts no WebGL renderer and keeps the
existing LO-FI entry. Loading still uses a plain status message; the matching
static loading image and transition belong to stage 4.

Stage 3 visual review must distinguish pipeline correctness from photographic
fidelity. Check all four screen channels, contact shadows, atlas seams, metal and
glass reflections, and the warm-left/cool-centre relationship at 1440 × 960. The
reference has more convincing weathered surfaces, brighter localized lamp
highlights, additional set dressing and a different city silhouette. Do not
describe this study as a completed photorealistic recreation.

## Stage 3 first-pass checks recorded on 2026-10-29

- `npm run check` and the static production build passed (61 routes; Pagefind
  indexed 18 article pages). The Three.js bundle-size warning is still present.
- Chrome at 1440 × 960 / DPR 1: 42,506 rendered triangles, 102 draws, all four
  TV states rendered. Console errors/warnings: zero. All 67 observed network
  requests returned 200 or 304; no missing assets.
- The blue/white/amber states changed 61,100 / 86,537 / 67,733 pixels outside
  the TV screen by more than 2/255 relative to off. VCR-top average RGB deltas
  were [0.59, 3.43, 11.89], [16.14, 17.00, 17.42], [13.33, 6.52, 1.29]. The sky
  control region differed by at most 1/255. This validates localized light
  changes rather than a full-image tint.
- At 390 × 844 the preview created no canvas, fetched no material/city assets,
  and the actual LO-FI link opened the existing blog with its article list.
- Independent review found no obvious atlas seams or noisy patches in the Home
  view. Close-up inspection is still required before navigation cameras ship.
- Pipeline acceptance does not imply photographic acceptance: the metal shade
  still lacks the reference's concentrated highlight, the glass is insufficiently
  curved, and equipment surface detail is sparse. Continue material refinement
  before declaring the visual stage accepted.

## Stage 3 surface refinement

`surfaces.py` refines two local surfaces while retaining HomeCamera and the
accepted projected lamp bounds (approximately x179–336, y392–516):

- A 96-segment spun-metal shade replaces the faceted cone. Its opening faces
  the viewer and has a separate warm lining and a small baked interior light.
  A constrained camera-plane fit retains the original outline after tilting.
- The CRT glass is a real convex mesh with a 37 mm bulge. Nonuniform rows give
  each rounded corner eight segments, avoiding the cut-off corners produced by
  the first uniform grid. ScreenUV remains regular for the Canvas display.
- Copper uses smoother normals, lower roughness and greater metalness. The
  overhead reflection source was positioned from a ray-cast surface normal at
  pixel (270, 437), instead of progressively raising global exposure.
- Glass reflectance is restrained using clearcoat 0.2 and specularIntensity 0.7;
  the first full-strength clearcoat doubled the upper-left highlight too strongly.
- Material noise also modulates roughness. ORM baking now preserves linked
  roughness inputs rather than silently baking only their default scalar.
- Existing equipment has speaker grooves, smaller TV buttons, printed control
  labels, VCR buttons, a static seven-segment readout, a power indicator and
  remote-control keys. These are surface details, not interactive controls yet.

Blender ray casting found the original TV branding fully occluded by CRT_Recess.
The branding now sits on the top border. Small printed meshes use their original
materials rather than tiny atlas islands. Their parent transforms are saved
before joint baking and restored afterwards; otherwise unbaked VHS labels move
to the origin when their baked parent meshes are joined.

The exported version 2 manifest identifies `curved-glass-spun-metal`. The model
contains 152 meshes and the glass has 3,705 vertices; the verified local depth
range is 0.037 m. The material bundle is approximately 32.6 MB including the
3.5 MB model, plus the city plate. Compression is still a later performance step.

Refinement acceptance at 1440 × 960 / DPR 1: 67,372 rendered triangles and 145
draws, no console errors/warnings, all 67 observed requests returned 200/304.
The lamp highlight/midtone ratio is 2.06 (first draft 1.02), with highlight P90
210/255. The warm lining and soft glass reflections are visible, rounded corners
are continuous, and printed labels and VCR digits are readable. This is sufficient
to proceed to stage 4, not a claim of overall photographic fidelity.

Two numerical targets remain for stage 8: the fixed TV top-border region has
median screenshot luminance 27/255 versus the proposed 40–75 range, and VCR digit
P90 is 162/255 versus the proposed 180–230 range. The first pair of glass reflection
samples also differs by 23/255, above an initial 5–15 suggestion; visual review
accepted the softened result because it preserves a visible curved surface without
obscuring blue-screen text. Do not report that every numerical target passed.

## Stage 4: loading and CRT

The default `/room/` now uses the entry flow. Keep `?study=materials` and
`?study=greybox` for the accepted earlier studies. The existing `/` homepage,
article routes, content, layouts and search have not been replaced.

`room.astro` builds a fixed list of local resource sizes. `assets.ts` counts
actual streamed response bytes for the GLB, fifteen atlas images, city plate,
material manifest and font. The percentage stops at 99 while images decode,
the reflection probe is prepared, shaders compile and a real blank-screen frame
renders. Only then is the native enter button enabled. There is no timed progress
simulation. Only a complete lack of activity across the entire resource bundle
for 60 seconds fails with retry and LO-FI controls; leaving the page aborts
outstanding requests. Do not give each queued HTTP request its own header timeout:
Slow 4G exposed a false failure at 29% while another stream was still receiving
bytes. `node --test scripts/room/assets.test.mjs` covers headers queued for 90
seconds with continued progress, genuine stalls, deduplication and cancellation.

The loading photograph is a capture of our own WebGL scene, not a Blender render
with different tone mapping. A **1440 × 1440** capture preserves vertical coverage
for 4:3 windows; a 1440 × 960 image would expose strips above and below the scene.
The image is scaled by viewport width and centered vertically, matching the
camera's fixed horizontal field of view. Narrow windows (width <= 700 or aspect
ratio <= 6/5) use the existing reading experience: at near-square ratios the
current model's upper boundary becomes visible. Revisit that boundary in stage 7.

To regenerate after a camera/material/scene change:

1. Run `screen_projection.py` in background Blender. It reads the saved scene
   and exports the four CRT plane corners to `screen-projection.json`.
2. Open `/room/?capture=poster` in Chrome at 1440 × 1440, DPR 1; wait for
   `#room[data-state=ready]`. The capture mode hides all UI and the dev toolbar.
3. Save a full-viewport PNG to `.room-build/loading-source.png` and convert:
   `sips -s format jpeg -s formatOptions 91 .room-build/loading-source.png --out public/room/loading.jpg`.
4. Compare at 1440 × 960, 1920 × 1080 and 1024 × 768 before accepting.

`osd.ts` maps a 768 × 576 loading Canvas to the exported plane with a projective
transform. The entry state machine is loading → preparing → ready → entering →
active. Repeated entry clicks are ignored. ESC/standby returns to an already
loaded blank screen; it does not fetch another copy of the scene. The 650 ms
crossfade keeps the camera fixed and gradually reveals content and TV illumination.
The root uses `overflow: clip`, not a hidden scroll container: browser focus
scrolling otherwise shifts the entire scene when the taller poster overflows.
Reduced-motion preference removes the transition and continuous animation.

`crt.ts` supplies the CanvasTexture, restrained scanlines with derivative-based
antialiasing, slight barrel distortion, edge falloff, subpixel color offset,
slow low-contrast band and grain. A channel change has a 150 ms signal interruption.
Effects are restricted to the emissive screen; the physical glass reflections
remain. Canvas pixels are averaged in linear light at content changes, then
combined with the existing white-TV bake. Very small shader noise/band modulation
is not re-integrated into environment lighting every frame.

Three sample programs test blue, warm and teal illumination. They are display
samples, not the Work/Posts navigation planned for stage 5. Motion renders at
at most 30 fps and stops while the document is hidden; reduced-motion scenes
render on changes only. The lightweight entry code chooses the mobile fallback
before importing Three.js or requesting scene textures.

Sound defaults to OFF and does not initialize AudioContext on entry. Explicitly
switching sound on resumes a context in that user gesture and plays a quiet,
procedural confirmation tone; entry/channel changes then have short tones.
Turning it off or hiding the page stops audio, and returning does not automatically
turn it back on. Rain/room ambience is deferred to stage 6.

VT323 is self-hosted from the official Google Fonts repository:
https://github.com/google/fonts/tree/main/ofl/vt323 . Its SIL Open Font License is
included at `public/room/fonts/OFL.txt`. Chinese controls use system fonts because
VT323 does not include Chinese glyphs. No font service is contacted at runtime.

Stage 4 Chrome verification uses the production preview on localhost:4322 rather
than Vite HMR, which resets state during edits. At DPR 1, 1440 × 960, 1024 × 768
and 1920 × 1080 screenshots retain the same composition; an integer-pixel search
across eleven visible structural patches found best displacement (0, 0).
Keyboard entry, repeated channel changes, ESC/Space re-entry, real audio
start/end/suspend and reduced-motion rendering were exercised. The complete
Slow 4G cold load took about 201 seconds after the timeout fix; progress remained
monotonic and enter stayed disabled until the first frame. A warm-cache run took
about 0.56 seconds. A simulated critical-texture 404 fell back correctly and
recovered through retry. These timings are local QA observations, not production
performance guarantees. Critical assets total 35,215,797 bytes (19 files), and
the loading JPEG is 363,947 bytes. Edge/Safari and compression remain stage 7 work.

The final QA also verified that 390 × 844 requests no scene assets and creates
no WebGL canvas, the real LO-FI link opens the existing article list, simulated
audio denial keeps SOUND OFF while allowing entry, reduced-motion has no running
RAF loop, and double entry followed immediately by ESC leaves one canvas in the
ready state. Near-square windows follow the same explicit fallback boundary.

## Earlier experiment

`build.py`, `public/room/room-preview.jpg` and `public/room/architecture.jpg` are
unaccepted earlier experiments. They are not loaded by `/room/`. That script uses
a combined bake and must not be treated as the production lighting pipeline.
