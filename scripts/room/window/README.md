# Panoramic exterior

## Current browsing contract — immersion pass, 2026-10-31

The previous room-card UV projection crops the bottom 18.9% of this source;
it cannot provide a complete overview through camera limits alone. Home keeps
that authored composition. Window inspection now uses the complete source on
a separate plane with the same weather/depth uniforms, bounded eye displacement,
dark surround and thin frame, without intersecting room walls.

`window-navigation.ts` defines contain-fit overview at 1×, detail at 2.5× and
maximum 3×. `navigation.ts` applies pointer-anchored zoom and constrained pan,
preserves valid coverage on resize, and resets with 0 or double click. ESC
returns to the prior room view. The three required desktop sizes were tested.
This fixes content access, not native image resolution or photographic realism:
the overview still feels like a framed panorama, and maximum zoom remains soft.
See `../IMMERSION.md`. The remaining paragraphs document the earlier exterior
asset integration, not the new inspection coverage guarantee.

The source is an original image generated with the built-in imagegen tool from
our project's previously generated `public/room/city-night-v3.png`, not an image
from the reference website or a downloaded third-party photograph.

`public/room/window/city-panorama-v1.png` is the unscaled native output: 2172×724,
3:1. It must not be described as 4K. `city-panorama-v1.webp` is the same image
encoded with `cwebp -q 94`, with no sharpening or upscaling. The adjacent generation
record documents the prompt and source.

The panorama fills the entire existing authored 29.12 m-wide exterior card once.
Its vertical mapping retains the 3:1 aspect ratio and places the horizon at the
same approximate elevation as the earlier city. Only the featureless overcast
sky above the plate is continued. Horizontal architecture is never mirrored.

`weather.ts` traces this panorama independently: softened inverse-depth in R and
binary rail occlusion in G. The rail follows a cubic curve matching the new
vanishing point rather than the previous straight line. Camera displacement
controls the small depth offset; window inspection turns while moving the eye
at most 18 cm horizontally / 8 cm vertically. The Home camera is unchanged.

This remains a depth-warped photographic plate, not reconstructed 3D architecture.
Large disocclusions are intentionally avoided. Native resolution and mask accuracy
must be checked in the actual browser at DPR 1 and 2 before claiming acceptance.

## Unbranded scene asset, 2026-10-31

The current binding is `city-panorama-v2.webp`. Its source retains every pixel
outside the 53×21 px billboard interior from v1. The blank sign interior came
from a built-in imagegen edit; the generation record includes the integration
rectangle and hashes. Existing depth and rail masks therefore remain aligned.
Page branding is intentionally separate and unchanged.

## Integration (original v1)

Set the material manifest `city` to `/room/window/city-panorama-v1.webp` and
update the preload byte count to 625664. The shader and image are a matched pair.
`createWeather().update(time, driftX, driftY)` retains its existing call signature;
the two drift arguments are no longer used. Three's built-in `cameraPosition`
supplies actual world-space eye movement. No caller must pass unbounded offsets.
The UV displacement is capped before depth weighting to avoid stretching the
plate at large Home or window drag limits. Window inspection stays inside the
room and moves at most 18 cm horizontally / 8 cm vertically.

The model's UVs must remain unchanged. If Blender camera-only preview renders
use this plate, a material-node mapping (not a geometry UV edit) must apply scale
`[0.5, 0.84375]` and offset `[0.25, 0.10425]` to Blender UVs. The Y offset differs
from the runtime's `[0.25, 0.052]` because GLTF image coordinates flip Y. Do not
apply both transforms to the exported model.

## Cost and verification, 2026-10-31

- WebP increases from 451500 to 625664 bytes: +174164 bytes (170.1 KiB).
- Decoded source pixels stay effectively flat: 1.573M before, 1.573M after.
  RGBA8 with mipmaps is approximately 8.39 MB in both cases.
- Generated RGBA depth changes from 512×288 to 1024×342: 589824 to 1400832 bytes,
  a +811008 byte allocation. It is generated once, not downloaded or rebuilt
  each frame. A second shader texture pass is not added.
- Rain layer, rain-run count and city draw-call count are unchanged.
- Eight weather/navigation tests pass. They cover actual curve masking,
  deterministic separate soft/hard channels, unique panorama projection, and
  corner-ray bounds across drag, zoom, animation and seven aspect ratios.
- A separate Astro production build passed into
  `.room-build/high-quality/window/candidate-dist`; main `dist` was not used.
- In the real browser at 1440×900, Home, window centre, left/right, up/down,
  zoom limits and ESC return were checked. The narrow tan strip at the far-right
  limit is the actual `Window_Upright001` mesh, verified by raycast through the
  production GLB; it is not missing photo coverage.
- The photographic rail curve and hard-mask overlay were reviewed together.
  New masks follow the roofs and major catenary posts. Trees remain approximate
  silhouettes, not branch-by-branch reconstruction.

The candidate has clearer unique side content and more believable rail/light
placement. It remains soft in the window close-up because that view stretches
only part of the 2172-pixel-wide source across the screen. A second attempt to
obtain native 3840×1280 output still returned 2172×724 and was rejected rather
than falsely reported as a resolution upgrade. Final Chrome DPR 2, isolated
performance measurement, and whole-site regression acceptance belong to the
integrated build; the subtask's IAB native DPR was 1 (render ratio 1.5).

Evidence is under the shared visualization folder
`high-quality/window/candidate-*-final.jpg` and `mask-rail-audit.jpg`.
