# Manim render service image (cards 3A-04, 3C-03). Build from the repository root:
#   docker build -f manim/Dockerfile -t manim-service .
# The base is the official Manim Community 0.21.0 image (Debian, Python, TeX Live, fonts), pinned by digest so the same
# Dockerfile gives the same renderer; raise it through a pull request with the golden-frame tests (RISKS: Manim upgrades).
# The official image has no ffmpeg binary (Manim uses PyAV), but our driver cuts chapters with ffmpeg and the QA gates use ffprobe.
ARG BASE=manimcommunity/manim:v0.21.0@sha256:89ab433ce59134a4dcf351deb2511e067ab354393c0bb7d1859f3e8f0b2406a3
FROM ${BASE}

USER root
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY manim/qa /app/qa
COPY manim/templates /app/templates
COPY manim/render_clip.py /app/render_clip.py
COPY manim/service /app/service

# the renderer command of the service: the driver renders one template and writes manifest.json, layout.json, chapters
ENV MANIM_RENDER_CMD="python3 /app/render_clip.py" MANIM_WORK_DIR=/work MANIM_PORT=8080
RUN mkdir /work && chown manimuser /work
USER manimuser
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD python3 -c "import os,urllib.request as u;u.urlopen(u.Request('http://127.0.0.1:8080/health',headers={'x-manim-token':os.environ.get('MANIM_SERVICE_TOKEN','')}))"
ENTRYPOINT []
CMD ["python3", "/app/service/server.py"]
