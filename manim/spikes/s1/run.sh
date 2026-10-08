#!/bin/sh
# Spike S1 (card 3-S1), the part that needs no Docker: render time, peak memory (RSS) and MP4 size of real clips at 720p30 and
# 1080p60. macOS cannot limit the CPUs of one process (the card asks for 2 and 4 vCPU in Docker), so every number is for the
# whole machine. Usage: run.sh   (needs MANIM_PY, latex on PATH). Prints one line per measurement.
set -e
cd "$(dirname "$0")/../../.."
PY="${MANIM_PY:-$HOME/.venvs/manim/bin/python}"
measure() { # clip params w h fps
  out=$(mktemp -d)
  /usr/bin/time -l env CLIP_TEMPLATE="manim/templates/$1.py" CLIP_PARAMS="$2" CLIP_OUT="$out" SPIKE_W=$3 SPIKE_H=$4 SPIKE_FPS=$5 "$PY" manim/render_clip.py >/dev/null 2>"$out.err" || true
  secs=$(awk '/ real /{print $1}' "$out.err")
  rss=$(awk '/maximum resident set size/{printf "%d", $1/1048576}' "$out.err")
  size=$(du -sk "$out" | awk '{printf "%d", $1/1024}')
  dur=$("$PY" -c "import json;print(json.load(open('$out/manifest.json'))['durationSec'])")
  echo "$1 ${3}x${4}@$5 clip=${dur}s render=${secs}s rss=${rss}MB mp4=$(du -ck "$out"/*.mp4 | tail -1 | awk '{printf "%.1f", $1/1024}')MB"
}
for spec in 'amgm_semicircle|{"a":2,"b":8}' 'concurrency_dynamic|{"x1":0,"y1":0,"x2":6,"y2":0,"x3":2,"y3":5,"center":"orthocenter"}' 'secant_tangent|{"c":[0,0,1],"x0":1}'; do
  clip=${spec%%|*}; params=${spec#*|}
  measure "$clip" "$params" 1280 720 30
  measure "$clip" "$params" 1920 1080 60
done
