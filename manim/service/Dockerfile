# manim-service (card 3C-03). Build from the repository root:  docker build -f manim/service/Dockerfile -t manim-service .
# [Unverified] never built: the Docker daemon was not available when this was written.
#
# BASE must be the pinned Manim image (card 3A-04: Manim CE, TeX Live, ffmpeg, fonts). The default is a plain Python
# image, which runs the service and its tests but cannot render; pin the real base by digest in production.
ARG BASE=python:3.12-slim
FROM ${BASE}

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m pip install --no-cache-dir numpy pillow \
    && useradd --create-home --uid 10001 render

WORKDIR /app
COPY manim/qa /app/qa
COPY manim/service /app/service
COPY manim/templates /app/templates

ENV MANIM_WORK_DIR=/work MANIM_PORT=8080
RUN mkdir /work && chown render /work
USER render
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD python3 -c "import os,urllib.request as u;u.urlopen(u.Request('http://127.0.0.1:8080/health',headers={'x-manim-token':os.environ.get('MANIM_SERVICE_TOKEN','')}))"
CMD ["python3", "/app/service/server.py"]
