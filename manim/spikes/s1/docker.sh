#!/bin/sh
# Spike S1 (card 3-S1) in the pinned image: render time and peak RSS of real clips at 720p30 and 1080p60 on 2 and 4 vCPU
# (docker --cpus), plus the image size and the cold start. Build the image first: docker build -f manim/Dockerfile -t manim-service .
# Usage: docker.sh [image]   Prints one line per measurement.
IMAGE="${1:-manim-service:real}"
echo "image $IMAGE: $(docker images "$IMAGE" --format "{{.Size}}") on disk, $(docker image inspect "$IMAGE" --format "{{.Size}}" | awk "{printf \"%.0f MB\", \$1/1048576}") of compressed content"
start=$(date +%s)
docker run --rm --entrypoint python3 "$IMAGE" -c "import manim" >/dev/null 2>&1
echo "cold start (container start + import manim): $(( $(date +%s) - start )) s"
run() { # clip params w h fps cpus
  docker run --rm --cpus "$6" --entrypoint python3 -e CLIP_TEMPLATE="/app/templates/$1.py" -e CLIP_PARAMS="$2" -e CLIP_OUT=/tmp/o \
    -e SPIKE_W="$3" -e SPIKE_H="$4" -e SPIKE_FPS="$5" "$IMAGE" -c "
import resource, subprocess, time
t = time.time()
r = subprocess.run(['python3', '/app/render_clip.py'], capture_output=True)
print('$1 ${3}x${4}@$5 cpus=$6 render=%.1fs rss=%dMB ok=%s' % (time.time() - t, resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss // 1024, r.returncode == 0))
"
}
for spec in 'amgm_semicircle|{"a":2,"b":8}' 'concurrency_dynamic|{"x1":0,"y1":0,"x2":6,"y2":0,"x3":2,"y3":5,"center":"orthocenter"}' 'secant_tangent|{"c":[0,0,1],"x0":1}'; do
  clip=${spec%%|*}; params=${spec#*|}
  for cpus in 2 4; do
    run "$clip" "$params" 1280 720 30 $cpus
    run "$clip" "$params" 1920 1080 60 $cpus
  done
done
