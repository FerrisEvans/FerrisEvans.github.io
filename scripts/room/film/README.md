# NIGHT LOG offline film

Original three-shot physical-scene film for Mainloop's CRT: the last train,
a small idea at the computer, and an architectural model becoming a world.
The public output is 48 seconds, 960×720, 24 FPS H.264/MP4 without an audio track.
The application's existing score remains the only programme soundtrack.

Authoring was verified with Blender 5.2.1 LTS (Cycles/Metal), Python 3.12.14,
Pillow 12.3.0, and FFmpeg 7.1 from imageio-ffmpeg 0.7.0. Python dependencies are
listed in the adjacent `requirements.txt`; use an existing suitable environment
or a project-local virtual environment. No global installation is required.

`render.py` generates original geometry, procedural materials and lights. The
computer chapter reads the preserved authoring source at
`scripts/room/film/source/idea-room.blend`. The two image dependencies are packed
inside that compressed file, so the movie can be rebuilt without `.room-build`
or an earlier round's mutable image paths. Off-camera room geometry and lights
are retained because they contribute shadows, bounce and reflections in the
approved computer shot. Only this authoring source is stored, not baked frame
sequences; it is not part of the website's runtime download. Its checksum and
original source provenance are recorded beside it.

Render three reviewed representative frames first; examine them before committing
to a full render. Then render each shot's frames 1–384:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/room/film/render.py -- --shot train --frame 192
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/room/film/render.py -- --shot idea --frame 192
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/room/film/render.py -- --shot world --frame 300
# The approved full render uses 64 samples. Complete all three shots and encode:
python3 scripts/room/film/render_all.py --resume --encode
python3 scripts/room/film/validate.py
```

Before the full render, a native-24-FPS motion check uses train/idea frames
190–213 and world frames 70–93, followed by `encode.py --motion-preview`.
This produces a three-second review file outside public assets. Check train
movement, screen lettering, paper-building emergence and temporal noise there.
`--resume` explicitly keeps already-reviewed frames after an interruption. Create
`.room-build/high-quality/film/pause-render` to finish the current frame and yield
the GPU safely; remove that file before resuming. Never reuse old frames after
changing the scene recipe—start a new output revision or rerender them.

Use the existing bundled Python with Pillow. `encode.py` takes ffmpeg from
`FFMPEG_BINARY`, PATH, or a project-local imageio-ffmpeg installation beneath
the film's temporary build directory. The encoder writes the H.264 `moov` atom
before the video payload (`+faststart`), no audio, a high-quality static WebP and
a manifest of checksums, dimensions and byte sizes. A 24 Hz linear-sRGB lighting
track is measured from the encoded video's decoded 32x24 samples; the browser
can index it by actual media time without repeated video readback. Every chapter fades through
black; the first and final decoded frames use the same colour.

The 2.76 MB RGBA video texture and roughly 1.04 MB YUV420 frame are per-frame
estimates, not the whole decoder's memory budget. The movie is fully preloaded by
the application before entry; actual decode cadence and browser memory need
production-browser measurement after integration.

`validate.py` independently decodes the delivered MP4, checks its 1,152 frames,
48-second/24-FPS format, lack of an audio track, fast-start atom order, LUT bounds,
file hashes, and first/last decoded-frame agreement. It creates a contact sheet
and quantitative report under the temporary film build directory. These checks
are complementary to watching motion and chapter transitions in a browser.

The PNG renders contain display-referred sRGB values. Encoding converts the RGB
matrix/range to limited-range BT.709 YUV and explicitly preserves the sRGB
transfer tag (IEC 61966-2-1) with BT.709/sRGB primaries. `setparams` is deliberate:
encoder flags alone left the frame primaries/transfer unspecified in this FFmpeg
version. The validator checks the final stream tags, not just command options.
`encode.py --reuse-edited` may reuse the already-captioned frames for codec/tag
changes; do not use it after changing renders, typography, grading or fades.

All geometry and procedural materials are authored for Mainloop. The room snapshot
and VT323 font were already part of this repository. VT323 is SIL OFL (see
`public/room/fonts/OFL.txt`). Carriage livery, plan labels and captions rasterize the locally
installed macOS Arial font; its font file is never redistributed. On platforms
without that font Blender's built-in font is used, so exact glyph shapes may vary.
No original-site video, remote imagery or third-party model is copied or hotlinked.

The selected encoder quality is CRF 22 (`--crf` can override it). An actual
72-frame comparison produced 615,961 bytes at CRF 19, 411,003 at CRF 22, and
316,558 at CRF 24. Native-pixel crops of carriage glazing, physical CRT lettering
and model facades showed no material loss at 22; 24 softened edges. This
comparison chooses the smaller useful file, not a nominal bitrate target.
