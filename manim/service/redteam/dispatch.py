"""MANIM_RENDER_CMD of the red-team container. The job of the clip `cs-projection` is the attacker: it runs the attack named in
/redteam/current. Any other clip is rendered for real (the victim jobs that must not be affected)."""
import os
import subprocess
import sys

if os.environ.get("CLIP_ID") == "cs-projection":
    sys.path.insert(0, "/redteam")
    import attacks
    attacks.ATTACKS[open("/redteam/current").read().strip()]()
    sys.exit(0)
sys.exit(subprocess.call(["python3", "/app/render_clip.py"]))
