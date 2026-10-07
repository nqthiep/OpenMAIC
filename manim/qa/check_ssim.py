"""Frame gate of the clip QA (task 3A-05, SCHEMA Phase 3 §6.1 step 3, ADR 0007 decision 7c).

Samples one frame per second and at each chapter boundary, and checks:
  * no black frame (mean brightness below 3 of 255);
  * no frozen stretch: the picture may not stand still longer than 4 s (the closing hold is 1.5-4 s);
  * every chapter ends with a hold of at least 1.5 s (the frame that is also its poster);
  * SSIM against the golden frame of the same time is at least 0.95 (golden frames are PNG files named t<ms>.png).
SSIM is the mean structural similarity of the grayscale images over 8 x 8 blocks (numpy only).

Usage: python check_ssim.py VIDEO.mp4 [GOLDEN_DIR]   -> prints problems, exit 1 when there are any.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

BLACK_MEAN = 3.0
MAX_FROZEN_S = 4.0
MIN_HOLD_S = 1.5
MIN_SSIM = 0.95
C1 = (0.01 * 255) ** 2
C2 = (0.03 * 255) ** 2


def ssim(a: np.ndarray, b: np.ndarray, block: int = 8) -> float:
    """Mean SSIM of two grayscale images of the same shape, over non-overlapping blocks."""
    if a.shape != b.shape:
        raise ValueError("images differ in shape")
    h, w = (a.shape[0] // block) * block, (a.shape[1] // block) * block
    a = a[:h, :w].astype(np.float64)
    b = b[:h, :w].astype(np.float64)

    def blocks(x: np.ndarray) -> np.ndarray:
        return x.reshape(h // block, block, w // block, block).transpose(0, 2, 1, 3).reshape(-1, block * block)

    ba, bb = blocks(a), blocks(b)
    mu_a, mu_b = ba.mean(axis=1), bb.mean(axis=1)
    var_a, var_b = ba.var(axis=1), bb.var(axis=1)
    cov = ((ba - mu_a[:, None]) * (bb - mu_b[:, None])).mean(axis=1)
    s = ((2 * mu_a * mu_b + C1) * (2 * cov + C2)) / ((mu_a**2 + mu_b**2 + C1) * (var_a + var_b + C2))
    return float(s.mean())


def shrink(img: np.ndarray, factor: int = 2) -> np.ndarray:
    """Block-average a grayscale image by `factor` (drops the edge rows and columns that do not fill a block)."""
    h, w = (img.shape[0] // factor) * factor, (img.shape[1] // factor) * factor
    return img[:h, :w].reshape(h // factor, factor, w // factor, factor).mean(axis=(1, 3))


def read_frames(video: Path, fps: int = 5, size: tuple[int, int] = (320, 180)) -> list[np.ndarray]:
    """Grayscale frames sampled at `fps` per second, scaled down, as float arrays 0-255.

    ffmpeg decodes to RGB (it expands the video's limited colour range) and the luma is taken with the ITU-R 601
    weights, the same as PIL's convert("L"), so a frame compares fairly with a golden PNG.
    """
    w, h = size
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(video), "-vf", f"fps={fps},scale={w}:{h}:flags=area,format=rgb24", "-f", "rawvideo", "-"],
        capture_output=True, check=True, timeout=300,
    ).stdout
    n = len(raw) // (w * h * 3)
    rgb = np.frombuffer(raw, dtype=np.uint8, count=n * w * h * 3).reshape(n, h, w, 3).astype(np.float64)
    gray = rgb @ np.array([0.299, 0.587, 0.114])
    return [gray[i] for i in range(n)]


def find_black(frames: list[np.ndarray], fps: int) -> list[float]:
    """Times (s) of frames that are black."""
    return [i / fps for i, f in enumerate(frames) if float(f.mean()) < BLACK_MEAN]


def still_runs(frames: list[np.ndarray], fps: int, eps: float = 0.5) -> list[tuple[float, float]]:
    """(start, length) in seconds of every run of consecutive frames that do not change (mean abs difference < eps)."""
    runs: list[tuple[float, float]] = []
    start = 0
    for i in range(1, len(frames) + 1):
        same = i < len(frames) and float(np.abs(frames[i] - frames[i - 1]).mean()) < eps
        if not same:
            length = (i - start) / fps
            if i - start > 1:
                runs.append((start / fps, length))
            start = i
    return runs


def check_frames(frames: list[np.ndarray], fps: int, chapter_ends: list[float] | None = None) -> list[str]:
    problems: list[str] = []
    if not frames:
        return ["video: no frames could be read"]
    for t in find_black(frames, fps):
        problems.append(f"t={t:.1f}: black frame")
    duration = len(frames) / fps
    runs = still_runs(frames, fps)
    ends = chapter_ends or [duration]
    for start, length in runs:
        if length > MAX_FROZEN_S:
            problems.append(f"t={start:.1f}: picture frozen for {length:.1f}s")
    for e in ends:
        # the closing hold: the frames in the last 1.5 s before the chapter end must be one still picture
        lo = max(int((e - MIN_HOLD_S) * fps), 0)
        hi = min(int(e * fps), len(frames))
        window = frames[lo:hi]
        if len(window) < 2 or any(float(np.abs(window[k] - window[0]).mean()) >= 1.0 for k in range(1, len(window))):
            problems.append(f"t={e:.1f}: no closing hold of {MIN_HOLD_S:g}s")
    return problems


def check_golden(frames: list[np.ndarray], fps: int, golden_dir: Path) -> list[str]:
    """Compare the frame at each golden time with the golden PNG (scaled to the sampling size)."""
    problems: list[str] = []
    for png in sorted(golden_dir.glob("t*.png")):
        ms = int(png.stem[1:])
        idx = min(int(round(ms / 1000 * fps)), len(frames) - 1)
        h, w = frames[0].shape
        gold = np.asarray(Image.open(png).convert("L").resize((w, h), Image.BOX), dtype=np.float64)
        # compare at half size: colour-edge differences between two decodes of the same picture average out
        score = ssim(shrink(frames[idx]), shrink(gold))
        if score < MIN_SSIM:
            problems.append(f"{png.name}: SSIM {score:.3f} is below {MIN_SSIM}")
    return problems


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: check_ssim.py VIDEO.mp4 [GOLDEN_DIR]", file=sys.stderr)
        return 2
    fps = 5
    frames = read_frames(Path(argv[1]), fps)
    problems = check_frames(frames, fps)
    if len(argv) > 2:
        problems += check_golden(frames, fps, Path(argv[2]))
    for p in problems:
        print(p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
