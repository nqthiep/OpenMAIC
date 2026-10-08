#!/bin/sh
# Spike S4 (card 3-S4): is the render deterministic? Renders the same preset twice with manim/render_clip.py and compares
# the decoded frames of every chapter with ffmpeg's framemd5. Usage: run.sh <template_stem> '<params json>'
# Needs MANIM_PY (python with manim), latex on PATH, ffmpeg.
set -e
cd "$(dirname "$0")/../../.."
PY="${MANIM_PY:-$HOME/.venvs/manim/bin/python}"
T="$1"; PARAMS="$2"
A=$(mktemp -d); B=$(mktemp -d)
for D in "$A" "$B"; do
  CLIP_TEMPLATE="manim/templates/$T.py" CLIP_PARAMS="$PARAMS" CLIP_OUT="$D" "$PY" manim/render_clip.py >/dev/null 2>&1
done
same=0; total=0; files_same=0; files_total=0
for f in $(ls "$A"/*.mp4); do
  n=$(basename "$f")
  ffmpeg -v error -i "$A/$n" -f framemd5 - | grep -v '^#' | awk -F, '{print $NF}' > "$A/$n.md5"
  ffmpeg -v error -i "$B/$n" -f framemd5 - | grep -v '^#' | awk -F, '{print $NF}' > "$B/$n.md5"
  t=$(wc -l < "$A/$n.md5"); s=$(paste -d' ' "$A/$n.md5" "$B/$n.md5" | awk '$1==$2' | wc -l)
  total=$((total + t)); same=$((same + s)); files_total=$((files_total + 1))
  cmp -s "$A/$n" "$B/$n" && files_same=$((files_same + 1))
done
echo "$T $PARAMS frames_identical=$same/$total files_byte_identical=$files_same/$files_total"
