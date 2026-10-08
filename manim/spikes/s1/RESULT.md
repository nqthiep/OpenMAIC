# Spike S1: Manim performance (card 3-S1)

Date: 2026-10-08. Reproduce: `manim/spikes/s1/run.sh` (Manim venv, TeX on PATH). Machine: Apple M5, 10 cores, 32 GB, macOS (no Docker,
no CPU limit possible per process), Manim CE 0.21.0, TinyTeX, Homebrew ffmpeg. Other jobs (network-bound LLM reviews) were running.
Three real clips of this repo, one run each (no repeats, so treat the seconds as ±20%).

| Clip | Profile | Clip length | Render time | Peak RSS | MP4 total (chapters) |
| --- | --- | --- | --- | --- | --- |
| `amgm-semicircle` | 720p30 | 49 s | 12.7 s | 624 MB | 0.3 MB |
| `amgm-semicircle` | 1080p60 | 49 s | 43.8 s | 1839 MB | 0.9 MB |
| `concurrency-dynamic` | 720p30 | 58 s | 18.3 s | 512 MB | 1.0 MB |
| `concurrency-dynamic` | 1080p60 | 58 s | 60.9 s | 1732 MB | 2.2 MB |
| `secant-tangent` | 720p30 | 53 s | 14.2 s | 629 MB | 0.4 MB |
| `secant-tangent` | 1080p60 | 53 s | 46.0 s | 1753 MB | 1.0 MB |

Thresholds of SCHEMA §8 (S1): 30 s at 720p30 within 3 minutes on 2 vCPU; RSS at most 2 GiB; MP4 at most 15 MB per 30 s.
- Time: 720p30 renders at about 0.26 to 0.31 times the clip length on 10 cores, so a 30 s clip takes about 9 s. A 2 vCPU container would
  be slower, by up to roughly 5 times if the render scales with cores [Inference, not measured]: that is still about 45 s, far inside 3 minutes.
- Memory: 0.5 to 0.6 GB at 720p30, 1.7 to 1.8 GB at 1080p60: inside 2 GiB, but 1080p60 is close; the shipped profile is 720p30.
- Size: well under 15 MB per 30 s (the clips are flat vector drawings).

**Not done** (the card asks for them): the Docker image (size, cold start), 15 s and 60 s scenes, 2 and 4 vCPU runs, repeated runs.
The thresholds are met on this machine by a wide margin, so the open risk is only the image build, not the render cost.

## In the pinned image (Docker Desktop, 2026-10-08, `manim/spikes/s1/docker.sh`)

Image `manim/Dockerfile` on `manimcommunity/manim:v0.21.0` (linux/arm64): **2.33 GB** on disk (612 MB of compressed content), cold start
(container start plus `import manim`) **2 s**. `docker run --cpus N`, the same three clips, one run each, while LLM reviews and
browser tests were also running on the machine (so the seconds are pessimistic, ±30%):

| Clip (length) | Profile | 2 vCPU: time, RSS | 4 vCPU: time, RSS |
| --- | --- | --- | --- |
| `amgm-semicircle` (49 s) | 720p30 | 22.9 s, 646 MB | 16.8 s, 651 MB |
| | 1080p60 | 83.7 s, 1986 MB | 57.2 s, 2005 MB |
| `concurrency-dynamic` (58 s) | 720p30 | 33.4 s, 612 MB | 33.6 s, 551 MB (disturbed by a parallel job) |
| | 1080p60 | 133.8 s, 2124 MB | 90.2 s, 2074 MB |
| `secant-tangent` (53 s) | 720p30 | 33.3 s, 630 MB | 20.7 s, 640 MB |
| | 1080p60 | 128.0 s, 1884 MB | 68.1 s, 1838 MB |

Against SCHEMA §8 (S1): a **30 s clip at 720p30 on 2 vCPU takes about 14-20 s (threshold 3 minutes): met by a factor of 9 or more**; RSS at
720p30 is at most 0.65 GB (threshold 2 GiB): met. At **1080p60** RSS reaches 1.84 to 2.12 GB: `concurrency-dynamic` goes slightly over 2 GiB
(2124 MB = 2.07 GiB), so 1080p60 does not fit the 2 GiB budget and is not the shipped profile. MP4 sizes are the ones above (at most 2.2 MB per
clip): far under 15 MB per 30 s.

**Not done.** 15 s and 60 s scenes (the three clips are 49 to 58 s), repeated runs, a real 2/4 vCPU host (Docker Desktop's VM shares this Mac's
10 cores with the other jobs), an amd64 timing (the emulated run is not a measure). Decision for the budget [Inference]: keep 720p30, size the
container at 4 GiB memory (as `docker-compose.yml` does) and `MANIM_JOB_DEADLINE_MS` at 10 minutes, which is more than 4 times the slowest
720p30 render measured here.
