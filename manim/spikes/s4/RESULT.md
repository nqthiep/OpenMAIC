# Spike S4: determinism of the render (card 3-S4)

Date: 2026-10-08. Reproduce: `manim/spikes/s4/run.sh <template_stem> '<params json>'` (needs Manim CE 0.21.0, LaTeX on PATH, ffmpeg).

| Template | Params | Frames identical (ffmpeg framemd5) | MP4 files byte-identical |
| --- | --- | --- | --- |
| `amgm_semicircle` | a = 2, b = 8 | 1470 / 1470 | 4 / 4 |
| `concurrency_dynamic` | orthocenter of (0,0) (6,0) (2,5) | 1740 / 1740 | 5 / 5 |

Machine: Apple M5 (arm64), macOS, 10 cores, 32 GB, Python 3.12.13 (uv), Manim CE 0.21.0, TinyTeX, Homebrew ffmpeg. No Docker.

**Second round (2026-10-08, later): inside the pinned image, and on a second architecture.** Image `manim/Dockerfile` on the official
`manimcommunity/manim:v0.21.0` (digest `sha256:89ab433c...`), the clip `amgm-semicircle` with a = 2, b = 8, 1470 frames in 4 chapters.

| Pair | Identical decoded frames (framemd5) | Lowest SSIM over the sampled frames |
| --- | --- | --- |
| macOS arm64 (native Manim 0.21.0) against the same machine, second run | 1470 / 1470 | 1.0 |
| macOS arm64 native against the Linux **arm64** container (service over HTTP) | **1470 / 1470** | 1.0 |
| macOS arm64 native against the Linux **amd64** container (emulated by Docker Desktop) | 45 / 1470 | **0.99972** (setup 0.99994, height 0.99996, compare 0.99972, equality 0.99986) |

SCHEMA S8 asks for the same frames, or SSIM at least 0.99, on the same image and host: **met on both architectures.** Across the two
architectures the pictures are not byte-identical (floating point in the rasteriser) but visually the same; the cache key therefore
stays per image digest, and a cache hit never mixes architectures because `CLIP_IMAGE_DIGEST` is part of the key.

**What it shows.** Two renders of the same template with the same parameters give the same frames and the same bytes on one machine,
and the same frames across a native macOS render and a Linux container of the same architecture. The content-hashed asset names do not
change from one render to the next.

**Limits.** One clip for the cross-architecture pair (the emulated amd64 render took 3.5 minutes, so it was not repeated). The amd64
side is emulation, not real hardware. Only SSIM on sampled frames (5 per second, luma, 320 x 180) was measured, not the encoded MP4 bytes.
