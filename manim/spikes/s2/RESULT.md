# Spike S2: Vietnamese in Manim (card 3-S2)

Date: 2026-10-08. Reproduce (Manim venv, TeX on PATH): `python manim/spikes/s2/run.py` (about 3 minutes).
Machine: Apple M5, macOS, Manim CE 0.21.0, TinyTeX (xelatex, pdflatex + `babel-vietnamese`, `vntex`), typst 0.15.0 (Python
binding), Noto Sans and Be Vietnam Pro installed from the Homebrew font casks into `~/Library/Fonts`.

**Strings.** 200 distinct strings (`strings.py`): every Vietnamese vowel with every tone in both cases (24), the letters Đ đ Ư ư Ơ ơ Ă ă Â â Ê ê Ô ô,
and 175 two to four word phrases from a 120 word vocabulary of the clips' own mathematics. 177 distinct characters in all.

| Measure | Result |
| --- | --- |
| Missing glyphs (fontTools, every character of the 200 strings), Noto Sans Regular | **0** |
| Missing glyphs, Be Vietnam Pro Regular | **0** |
| `MathTex` with `\text{...}`, xelatex + fontspec (Noto Sans) | **200 / 200** compile (96 s) |
| `MathTex` with `\text{...}`, pdflatex + T5 + babel `vietnamese` | **200 / 200** compile (43 s) |
| `MathTypst` | **200 / 200** compile (21 s) |
| Stacked marks in `Text()` (ế ể ậ ỗ ừ ự ...) | clean in the 10 review images, `manim/spikes/s2/review/` (50 phrases per font); no collision seen by the author of this spike |

**Two pitfalls found**
- Manim's default TeX preamble loads `babel` with `[english]`; adding `\usepackage[vietnamese]{babel}` after it is an option clash (every
  compile fails). Replace the default line (as `run.py` does) instead of appending.
- TinyTeX is minimal: `tlmgr install babel-vietnamese vntex` was needed for the pdflatex route; xelatex needs only `fontspec` and an installed font.

**Recommendation [Inference].** For text baked into a picture, `Text()` with Be Vietnam Pro (or Noto Sans) is enough and the cheapest. For
formulas with Vietnamese words, use xelatex + fontspec (no package surprises, one font for text and labels) or `MathTypst` (fastest, no TeX
install). pdflatex + babel also works but needs the extra packages. The current 21 clips draw no words, so none of this is needed yet.

**Not done / limits.** The check of "no diacritic collision" was one person's look at 10 images, not the leader's review the card asks for.
Only the Regular weight was tested. The test machine is macOS; Linux (the Docker image) needs the same fonts installed and was not run.
