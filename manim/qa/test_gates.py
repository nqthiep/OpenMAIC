"""Tests of the clip QA gates (task 3A-05): they pass on a good synthetic clip and fail, at the right place,
on deliberately wrong ones. The clips are made by ffmpeg (no Manim needed): a moving test pattern that ends in a still hold.
Run: pytest manim/qa/test_gates.py
"""
import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest

import check_bbox
import check_ssim
import check_video

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None, reason="ffmpeg not installed")


def make_video(path: Path, seconds: float, *, size="1280x720", fps=30, pix_fmt="yuv420p", source="testsrc2", hold=2.0, codec="libx264"):
    """A clip of `seconds` in total: `source` moving, then (when hold > 0) the last frame held still for `hold` seconds."""
    moving = max(seconds - hold, 0.1)
    vf = f"tpad=stop_mode=clone:stop_duration={hold}" if hold > 0 else "null"
    src = f"{source}=size={size}:rate={fps}:duration={moving if hold > 0 else seconds}" if source in ("testsrc2", "testsrc") else f"{source}=c=black:size={size}:rate={fps}:duration={seconds}"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", src, "-vf", vf, "-c:v", codec, "-pix_fmt", pix_fmt,
                    "-preset", "ultrafast", "-crf", "34", str(path)], check=True, timeout=120)


def make_poster(video: Path, png: Path):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-frames:v", "1", str(png)], check=True, timeout=60)


def build_clip(tmp: Path, lengths=(10, 10, 10), **kw) -> Path:
    chapters, t = [], 0.0
    for i, n in enumerate(lengths):
        name = f"c{i}"
        make_video(tmp / f"{name}.mp4", n, **kw)
        make_poster(tmp / f"{name}.mp4", tmp / f"{name}.png")
        chapters.append({"id": name, "file": f"{name}.mp4", "posterFile": f"{name}.png", "startSec": t, "endSec": t + n})
        t += n
    manifest = {"clipId": "demo", "w": 1280, "h": 720, "fps": 30, "durationSec": t, "chapters": chapters}
    path = tmp / "manifest.json"
    path.write_text(json.dumps(manifest))
    return path


@pytest.fixture(scope="module")
def good(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("good")
    return tmp, build_clip(tmp)


# --- check_video ---------------------------------------------------------------------------------------------------

def test_a_good_clip_passes_every_video_check(good):
    _, manifest = good
    assert check_video.check_clip(manifest, ["c0", "c1", "c2"]) == []


def test_cli_exit_codes(good, tmp_path):
    _, manifest = good
    ok = subprocess.run(["python3", str(Path(check_video.__file__)), str(manifest)], capture_output=True, text=True)
    assert ok.returncode == 0 and ok.stdout == ""
    bad = subprocess.run(["python3", str(Path(check_video.__file__)), str(manifest), "--entry-chapters", "c0,c1"], capture_output=True, text=True)
    assert bad.returncode == 1 and "differ" in bad.stdout


def test_wrong_size_codec_pixfmt_and_fps_are_caught(tmp_path):
    cases = [
        ({"size": "640x360"}, "size is 640x360"),
        ({"fps": 24}, "frame rate is 24"),
        ({"pix_fmt": "yuv444p"}, "pixel format is yuv444p"),
    ]
    for kw, expect in cases:
        d = tmp_path / expect.replace(" ", "_")
        d.mkdir()
        manifest = build_clip(d, **kw)
        problems = check_video.check_clip(manifest)
        assert any(expect in p for p in problems), (kw, problems)


def test_chapter_and_clip_lengths(tmp_path):
    short = build_clip(tmp_path / "s" if (tmp_path / "s").mkdir() is None else tmp_path, lengths=(5, 5, 5))
    problems = check_video.check_clip(short)
    assert sum("outside 8-25s" in p for p in problems) == 3
    assert any("total length 15.00s is outside 20-90s" in p for p in problems)


def test_length_that_differs_from_the_manifest_by_more_than_five_percent(tmp_path):
    manifest_path = build_clip(tmp_path)
    m = json.loads(manifest_path.read_text())
    m["chapters"][1]["endSec"] = m["chapters"][1]["startSec"] + 12  # the file is 10 s long, the manifest says 12 s
    manifest_path.write_text(json.dumps(m))
    problems = check_video.check_clip(manifest_path)
    assert any(p.startswith("c1:") and "differs from the manifest" in p for p in problems)


def test_manifest_must_list_the_entry_chapters_in_order(good):
    _, manifest = good
    assert check_video.check_clip(manifest, ["c0", "c2", "c1"])  # wrong order
    problems = check_video.check_clip(manifest, ["c0", "c1", "c2", "c3"])
    assert any("missing ['c3']" in p for p in problems)
    m = json.loads(manifest.read_text())
    assert check_video.check_manifest_chapters({"chapters": []}, None) == ["manifest: no chapters"]
    m["chapters"][1]["startSec"] = 11
    assert any("starts at 11" in p for p in check_video.check_manifest_chapters(m, None))


def test_missing_files_are_reported(tmp_path):
    manifest_path = build_clip(tmp_path)
    (tmp_path / "c1.mp4").unlink()
    (tmp_path / "c2.png").unlink()
    problems = check_video.check_clip(manifest_path)
    assert "c1: file c1.mp4 is missing" in problems
    assert any("c2: poster" in p for p in problems)


# --- check_bbox ----------------------------------------------------------------------------------------------------

def kf(items, t=1.0):
    return {"t": t, "items": items}


def item(i, bbox, tokens=2, font=36):
    return {"id": i, "kind": "Text", "bbox": bbox, "tokens": tokens, "fontSize": font}


def test_clean_layout_passes():
    report = {"frame": {"w": 14.2222, "h": 8.0}, "keyframes": [kf([item("a", [-3, 1, -1, 2]), item("b", [1, -2, 3, -1])])]}
    assert check_bbox.check_layout(report) == []


def test_box_outside_the_frame_or_in_the_margin():
    problems = check_bbox.check_keyframe(kf([item("edge", [6.9, 0, 7.1, 1])]))  # half width is 7.11, margin 0.3 -> limit 6.81
    assert any("outside the frame margin" in p for p in problems)
    assert check_bbox.check_keyframe(kf([item("ok", [6.7, 0, 6.8, 1])])) == []
    assert any("outside" in p for p in check_bbox.check_keyframe(kf([item("top", [0, 3.8, 1, 4.5])])))


def test_overlapping_text_is_caught_but_touching_edges_are_fine():
    problems = check_bbox.check_keyframe(kf([item("a", [0, 0, 2, 1]), item("b", [1.5, 0.5, 3, 1.5])]))
    assert problems == ["t=1.0: a overlaps b"]
    assert check_bbox.check_keyframe(kf([item("a", [0, 0, 2, 1]), item("b", [2, 0, 3, 1])])) == []


def test_more_than_twelve_tokens_or_tiny_font():
    problems = check_bbox.check_keyframe(kf([item("a", [-3, 0, -1, 1], tokens=7), item("b", [1, 0, 3, 1], tokens=6)]))
    assert any("13 tokens on screen" in p for p in problems)
    assert check_bbox.check_keyframe(kf([item("a", [-3, 0, -1, 1], tokens=12)])) == []
    assert any("font size 18" in p for p in check_bbox.check_keyframe(kf([item("a", [0, 0, 1, 1], font=18)])))


def test_missing_or_broken_boxes_and_empty_reports():
    assert any("no bounding box" in p for p in check_bbox.check_keyframe(kf([{"id": "x", "tokens": 1}])))
    assert any("empty bounding box" in p for p in check_bbox.check_keyframe(kf([item("z", [1, 1, 1, 2])])))
    assert check_bbox.check_layout({"keyframes": []}) == ["layout: no keyframes"]


def test_bbox_cli(tmp_path):
    p = tmp_path / "layout.json"
    p.write_text(json.dumps({"keyframes": [kf([item("a", [0, 0, 2, 1]), item("b", [1, 0, 3, 1])])]}))
    r = subprocess.run(["python3", str(Path(check_bbox.__file__)), str(p)], capture_output=True, text=True)
    assert r.returncode == 1 and "overlaps" in r.stdout


# --- check_ssim ----------------------------------------------------------------------------------------------------

def test_ssim_is_one_for_equal_images_and_low_for_different_ones():
    rng = np.random.default_rng(0)
    a = rng.integers(0, 255, (180, 320)).astype(np.float64)
    assert check_ssim.ssim(a, a) == pytest.approx(1.0)
    b = rng.integers(0, 255, (180, 320)).astype(np.float64)
    assert check_ssim.ssim(a, b) < 0.2
    assert check_ssim.ssim(a, a + 2) > 0.95  # a slight brightness shift still passes
    with pytest.raises(ValueError):
        check_ssim.ssim(a, a[:100])


def test_a_good_video_has_no_black_or_frozen_frames_and_a_closing_hold(good):
    tmp, _ = good
    frames = check_ssim.read_frames(tmp / "c0.mp4", 5)
    assert len(frames) == 50
    assert check_ssim.check_frames(frames, 5) == []


def test_black_video_is_caught(tmp_path):
    make_video(tmp_path / "black.mp4", 10, source="color", hold=0)
    frames = check_ssim.read_frames(tmp_path / "black.mp4", 5)
    problems = check_ssim.check_frames(frames, 5)
    assert any("black frame" in p for p in problems)


def test_a_frozen_video_is_caught_but_a_two_second_hold_is_not(tmp_path):
    make_video(tmp_path / "frozen.mp4", 10, source="testsrc", hold=8.0)  # moves for 2 s, then stands still for 8 s
    problems = check_ssim.check_frames(check_ssim.read_frames(tmp_path / "frozen.mp4", 5), 5)
    assert any("picture frozen" in p for p in problems)
    make_video(tmp_path / "held.mp4", 10, hold=2.0)
    assert check_ssim.check_frames(check_ssim.read_frames(tmp_path / "held.mp4", 5), 5) == []


def test_missing_closing_hold(tmp_path):
    make_video(tmp_path / "nohold.mp4", 10, hold=0.0)  # moves until the very last frame
    problems = check_ssim.check_frames(check_ssim.read_frames(tmp_path / "nohold.mp4", 5), 5)
    assert any("no closing hold" in p for p in problems)


def test_golden_frame_comparison(good, tmp_path):
    tmp, _ = good
    frames = check_ssim.read_frames(tmp / "c0.mp4", 5)
    gold = tmp_path / "gold"
    gold.mkdir()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "9", "-i", str(tmp / "c0.mp4"), "-frames:v", "1", str(gold / "t9000.png")], check=True)
    assert check_ssim.check_golden(frames, 5, gold) == []
    # (the golden time is inside the closing hold, where the picture does not move, so the two decodes agree)
    # a golden frame of a different picture fails
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=white:size=1280x720", "-frames:v", "1", str(gold / "t9000.png")], check=True)
    assert any("SSIM" in p for p in check_ssim.check_golden(frames, 5, gold))


def test_no_frames_is_a_problem():
    assert check_ssim.check_frames([], 5) == ["video: no frames could be read"]
