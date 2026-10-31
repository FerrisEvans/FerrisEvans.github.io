# Immersion pass — 2026-10-31

This pass preserves the existing Astro / Three.js / Blender assets, the 48-second
Home film, Chinese content, Work camera, article routes, VCR state machine and
high-quality desktop / LO-FI split. No commit, deployment or global installation.
The manual reduced-motion button and its session preference were removed at the
user's request. Operating-system reduced motion remains an accessibility input,
with the same resolution/material quality, not a third quality tier.

## Accepted changes

- Complete window overview on entry, 2.1× detail / 3× maximum, pointer-anchored
  zoom, constrained pan, 0 / double-click reset, prior-view ESC, valid resize.
  Independent inspection rendering reuses the city/depth/weather maps and bloom
  buffers; room walls and hidden room picking targets do not leak into the view.
- Window UI fades after 3.5 seconds, with keyboard/focus access retained. An exit
  fade masks the switch back to the room lens; hidden Posts/About keyboard routes
  are suppressed while inspecting the window.
- Loading yields prefer rAF but have a 48 ms deadline and abort cleanup. Work is
  still split per texture, so a throttled rAF cannot add a second to each upload.
- Native allowlisted HTTP/Range movie requests replace the MP4 ArrayBuffer/Blob.
  Metadata, 4 contiguous buffered seconds and readyState >= 3 gate readiness;
  the movie buffers alongside atlas preparation. Error, cancellation, resource
  disposal and actual-media-clock transport are retained.
- Stage and per-atlas timing instrumentation distinguishes decode, queue, driver
  submission, probe, compilation and first-frame submission. Localhost/debug
  exposes `window.__roomLoadTimings()` and a JSON DOM snapshot at ready.
- Runtime advice waits for 20 seconds of stable continuous rendering plus three
  slow 6-second windows. A small dismissible LO-FI hint replaces the large panel;
  dismissal persists for the session. It never lowers render quality.
- Paper lifts before rotating and levels before landing, with a small fading
  contact cue. Final reading pose/content hit alignment is unchanged. ABS
  specular intensity changes from .45 to .65; no albedo/roughness/metalness edits.

## Measurements and verification

Production `npm run check`, all 84 room tests, font coverage, Astro build and
Pagefind passed. The model/Three chunk is 945,450 bytes versus 941,380 in the
frozen baseline; the >500 KB warning remains.

| Scenario | Before ready | After ready |
| --- | ---: | ---: |
| Normal local observation | 2.237 s | 2.213 s |
| Deliberate loading-only 1 Hz rAF | 78.451 s | 5.700 s |
| Fresh-context Fast 4G | 24.498 s | 18.500 s |

These are single observations, not medians. Normal samples have different motion
settings and prove no meaningful speedup. The 1 Hz experiment isolates scheduler
waiting, not the cause of the user's specific 60-second wait. Warm-cache and a
build-overlap/404 run were explicitly excluded. Timings surround CPU/API calls,
not GPU completion or display presentation; parallel intervals must not be summed.

The native movie passed HTTP 206 Range verification. The cold Fast 4G run reached
video readiness with 4.395 seconds buffered, continued through a complete loop,
and decoded 1,875 frames with zero dropped frames during ~78 seconds of playback.
A 0.6 ms waiting event occurred at the loop seam. `preload=auto` may download the
entire 6,101,941-byte file: the change removes the full-download gate and JS copy,
not the full eventual network cost.

60 atlas images account for 281.25 MiB RGBA8 base-level pixels / 375 MiB including
mips. Whole-scene texture estimates are 421.40 MB plus ~14.1 MB glow targets at
1440×900 / render DPR 1.5. The new contact cue adds 16 KiB. These estimates exclude
driver copies, video decoder surfaces and default MSAA buffers, and are not a
process-memory peak or long-duration leak test. No image/model/audio file was
enlarged. The 128 px probe takes ~114–117 ms locally and was retained; no offline
probe or KTX2 conversion was promoted without a demonstrated quality benefit.

Window overview was captured at 1440×900, 1920×1080 and 1024×768; native pan,
boundaries, wheel, reset, resize, ESC and hidden-page key isolation were verified.
Home/TV clock continuity, Posts pause/resume, Work tape selection/play/pause/eject,
power/LED, score/CD exclusivity, About/Online, history, OS reduced motion and
mobile fallback → LO-FI were exercised. CD and Home had respectively 32- and
48-second active buffers, never together. Application console had no warnings.
Real hidden-tab pause remains unverified: both browser tools continued reporting
visible after tab switches. Visibility was not mocked to fabricate a pass.

## Visual limits

The overview now exposes the full image, but still feels like a framed panorama;
3× detail is soft. A projecting sill/jamb trial looked too flat and oversized,
so only that trial was withdrawn. ABS edge highlights improve slightly, with
limited Home-wide benefit. Paper motion improves more clearly than the subtle
contact shadow; its held pose can still read as a floating panel. Ceramic, wood,
plants, source models, atlases, bakes and posters were left intact.

Evidence (same-viewport sliders, production paper videos, stage/per-atlas tables,
raw timings and limitations):
`/Users/ferris/.codex/visualizations/2026/10/30/01a18cd6-11e5-7932-bff0-158a2bceda1e/immersion/index.html`.
