# Mainloop NIGHT LOG — delivery record

The original Home film is now a local Blender-rendered 4:3 movie: 48 seconds,
960×720, native 24 FPS, three 16-second chapters. It has no audio track; the
application's existing synthesized score remains separate and authoritative.

The shots preserve the original story: a last train, a small idea typed on a
physical computer, and an architectural paper model becoming a world. The
computer chapter uses real screen lettering, geometry, keyboard movement and
camera motion; it does not film the old Canvas programme. Train glazing,
interiors, closed carriage ends and gangways were revised after actual frame
review. The third chapter deliberately retains a handmade model appearance.

## Runtime assets and cost

| File | Bytes |
| --- | ---: |
| `public/room/film/night-log.mp4` | 6,101,941 |
| `public/room/film/night-log-still.webp` | 62,442 |
| `public/room/film/night-log-light.json` | 33,111 |
| `public/room/film/manifest.json` | 1,595 |
| Total programme download | 6,199,089 (5.912 MiB) |

The MP4 is H.264 High 3.1, YUV420, CRF 22, fast-start, with BT.709 primaries and
matrix, explicit sRGB transfer, and limited YUV range. The lighting table samples
all 1,152 decoded frames into linear-sRGB averages; the browser can index it by
media time without per-frame pixel readback. The poster corresponds to 191/24
seconds. The manifest includes SHA-256 hashes of all three payload files.

An RGBA video texture is 2,764,800 bytes (2.637 MiB), and one YUV420 frame is
1,036,800 bytes (0.989 MiB). These are per-frame estimates, not a claim about the
browser's total decoder memory. The 2026-10-31 immersion pass replaced full-file
Blob buffering with allowlisted native HTTP/Range playback. Readiness validates
metadata and at least four contiguous seconds at the playhead; native preload
may still cache the entire file. Decoder surfaces and the full room's GPU cost
are separate from these per-frame estimates. See `../IMMERSION.md` for the
integrated production measurements and limits.

CRF 19 / 22 / 24 were compared using the same 72 native frames. Their sample files
were 615,961 / 411,003 / 316,558 bytes. Native-pixel crops of train glazing,
computer lettering and model facades showed no material loss at 22; 24 softened
fine edges. A matched 12 FPS clip was 381,082 bytes versus 411,003 at 24 FPS:
halving temporal samples saved only 7.3%, so native 24 FPS was retained.

## Verification actually performed

- Python syntax checks and scoped whitespace checks passed.
- `validate.py` independently decoded the final file: 1,152 frames, 48 seconds,
  960×720, 24 FPS, no audio, fast-start atom order and explicit colour tags.
- First and last decoded frames had mean RGB difference `[0, 0, 0]`.
- Manifest hashes, poster size and the lighting table's length/range passed.
- Original rendered keyframes, native motion samples, later-shot frames and a
  contact sheet from the final compressed movie were visually inspected.
- The final movie played through all three chapters and one natural loop in the
  Codex in-app browser. There was no media error or mid-program waiting event.
  The loop reported a 10 ms waiting interval during the matching dark frames.
- That background IAB session reported 31 dropped frames out of 1,400 total
  frames (about 2.2%). This is recorded, not represented as zero-drop performance
  or as the primary Chrome/WebGL room benchmark. The review tab and temporary
  HTTP server were closed before the coordinating task's isolated measurements.

Detailed local evidence is under `.room-build/high-quality/film/`:
`validation.json`, `browser-validation.json`, `full-film-contact.jpg`,
`compression-review.json`, and `compression-native-crops.png`.

## Rebuilding and limits

`README.md` documents the render/encode/validate entry points and pause/resume
workflow. `source/idea-room.blend` is the durable 8,235,367-byte authoring source;
its two image dependencies are packed, and its checksum/provenance are in
`source/manifest.json`. It is outside `public` and adds no runtime download.
The source retains off-camera geometry because it contributes reflections,
shadows and indirect light in the approved computer shot. Font files and the
temporary FFmpeg binary are not redistributed as movie assets.

The physical material, lighting and depth are a visible change from the old
flat Canvas programme. This is still a stylized original rendered film, not a
claim of photographic parity with the reference site's footage. The train's
background architecture remains simplified; the paper city is intentionally a
miniature. Whole-room interactions, Home/TV transport, score/CD exclusivity,
reduced motion and integrated memory/performance remain the coordinating task's
production-browser acceptance scope.
