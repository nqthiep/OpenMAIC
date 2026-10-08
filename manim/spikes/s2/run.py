"""Spike S2 (card 3-S2): Vietnamese in Manim. Run with the Manim venv and TeX on PATH:

  python manim/spikes/s2/run.py [--latex-count N]

1. glyph coverage (fontTools) of every string in Noto Sans and Be Vietnam Pro;
2. Text() renders of 50 phrases in each font to review/ (for the leader to check stacked marks);
3. compile rate of the 200 strings as MathTex with xelatex (fontspec, Noto Sans) and with pdflatex + babel-vietnamese;
4. compile rate with MathTypst.
Prints a JSON summary; RESULT.md quotes it.
"""
import json
import os
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from strings import all_strings  # noqa: E402

FONTS = {
    "Noto Sans": Path.home() / "Library/Fonts/NotoSans-Regular.ttf",
    "Be Vietnam Pro": Path.home() / "Library/Fonts/BeVietnamPro-Regular.ttf",
}


def glyph_report(strings):
    from fontTools.ttLib import TTFont
    out = {}
    for name, path in FONTS.items():
        cmap = TTFont(str(path)).getBestCmap()
        missing = sorted({c for s in strings for c in s if not c.isspace() and ord(c) not in cmap})
        out[name] = {"file": path.name, "missing_chars": missing, "missing_count": len(missing)}
    return out


def render_samples(strings):
    from manim import Scene, Text, VGroup, config, DOWN
    review = HERE / "review"
    review.mkdir(exist_ok=True)
    phrases = [s for s in strings if len(s.split()) >= 2][:50]
    config.pixel_width, config.pixel_height, config.frame_rate = 1280, 720, 30
    config.verbosity = "ERROR"
    config.disable_caching = True
    config.write_to_movie = False
    config.save_last_frame = True
    config.media_dir = str(HERE / "_media")
    for font in FONTS:
        for k in range(5):
            chunk = phrases[k * 10:(k + 1) * 10]

            class Sheet(Scene):
                def construct(self):
                    g = VGroup(*[Text(t, font=font, font_size=34) for t in chunk]).arrange(DOWN, buff=0.18)
                    self.add(g)
            name = f"{font.replace(' ', '')}-{k + 1}"
            config.output_file = name
            Sheet().render()
            produced = list((HERE / "_media").rglob(f"{name}.png"))
            if produced:
                produced[0].replace(review / f"{name}.png")
    return sorted(p.name for p in review.glob("*.png"))


def latex_rate(strings, template, label):
    from manim import MathTex
    ok, failed = 0, []
    t0 = time.time()
    for s in strings:
        try:
            MathTex(r"\text{" + s + "}", tex_template=template)
            ok += 1
        except Exception as e:  # noqa: BLE001
            failed.append((s, str(e).splitlines()[0][:80]))
    return {"label": label, "ok": ok, "total": len(strings), "failed_examples": failed[:3], "seconds": round(time.time() - t0, 1)}


def typst_rate(strings):
    from manim import MathTypst
    ok, failed = 0, []
    t0 = time.time()
    for s in strings:
        try:
            MathTypst(f'"{s}"')
            ok += 1
        except Exception as e:  # noqa: BLE001
            failed.append((s, str(e).splitlines()[0][:80]))
    return {"label": "MathTypst", "ok": ok, "total": len(strings), "failed_examples": failed[:3], "seconds": round(time.time() - t0, 1)}


def main():
    from manim import TexTemplate, config
    config.verbosity = "ERROR"
    config.media_dir = str(HERE / "_media")
    strings = all_strings()
    n = int(sys.argv[sys.argv.index("--latex-count") + 1]) if "--latex-count" in sys.argv else len(strings)
    result = {"strings": len(strings), "glyphs": glyph_report(strings), "samples": render_samples(strings)}
    xe = TexTemplate(tex_compiler="xelatex", output_format=".xdv")
    xe.add_to_preamble(r"\usepackage{fontspec}\setmainfont{Noto Sans}")
    result["xelatex_noto"] = latex_rate(strings[:n], xe, "xelatex + fontspec Noto Sans")
    babel = TexTemplate()
    # the default preamble loads babel with [english]; a second babel with other options is an option clash
    babel.preamble = babel.preamble.replace(r"\usepackage[english]{babel}", r"\usepackage[T5]{fontenc}\usepackage[vietnamese]{babel}")
    result["pdflatex_babel"] = latex_rate(strings[:n], babel, "pdflatex + T5 + babel vietnamese")
    try:
        result["typst"] = typst_rate(strings[:n])
    except Exception as e:  # noqa: BLE001
        result["typst"] = {"error": str(e)[:200]}
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
