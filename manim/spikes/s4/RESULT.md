# Spike S4: determinism of the render (card 3-S4)

Date: 2026-10-08. Reproduce: `manim/spikes/s4/run.sh <template_stem> '<params json>'` (needs Manim CE 0.21.0, LaTeX on PATH, ffmpeg).

| Template | Params | Frames identical (ffmpeg framemd5) | MP4 files byte-identical |
| --- | --- | --- | --- |
| `amgm_semicircle` | a = 2, b = 8 | 1470 / 1470 | 4 / 4 |
| `concurrency_dynamic` | orthocenter of (0,0) (6,0) (2,5) | 1740 / 1740 | 5 / 5 |

Machine: Apple M5 (arm64), macOS, 10 cores, 32 GB, Python 3.12.13 (uv), Manim CE 0.21.0, TinyTeX, Homebrew ffmpeg. No Docker.

**What it shows.** Two renders of the same template with the same parameters on the same machine give the same frames and the
same bytes. The content-hashed asset names (`<id>-<hash>`) therefore do not change from one render to the next on one machine.

**What it does not show** (the card asks for these; not done):
- the same render inside the pinned Docker image (no image was built: the Docker daemon was off);
- a render on a second architecture (amd64): only arm64 was available, so the SSIM of a cross-architecture pair is unknown.
  Until that is measured, treat the content hash as valid per (image, architecture); `CLIP_IMAGE_DIGEST` is part of the
  cache key for that reason.
