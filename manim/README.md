# manim/

Clip renderer: `templates/` (one `<clip_id>.py` per clip, plus `_base.py`), `render_clip.py` (the driver behind
`MANIM_RENDER_CMD`), `qa/` (gates, see CI job `manim-qa`) and `service/` (HTTP render service).

## Local setup (macOS, no sudo) [Verified on this machine, 2026-10-08]

```bash
brew install cairo pango pkgconf
uv venv --python 3.12 ~/.venvs/manim && uv pip install --python ~/.venvs/manim/bin/python "manim==0.21.0"
curl -sL https://yihui.org/tinytex/install-bin-unix.sh | sh      # TinyTeX into ~/Library/TinyTeX (answer no to the PATH sudo)
export PATH=$PATH:$HOME/Library/TinyTeX/bin/universal-darwin
export MANIM_RENDER_CMD="$HOME/.venvs/manim/bin/python manim/render_clip.py"
pnpm exec tsx scripts/render-clips.ts --only amgm-semicircle      # allowlist, render, QA gates, manifest check, place in public/clips
```

A template calls `self.chapter_end(<id>)` at the end of each chapter; the base holds the last picture until the planned end
and refuses a closing hold outside 1.5-4 s (the frame gate's rule). Background is `#20263A`, because the frame gate rejects
near-black pictures.
