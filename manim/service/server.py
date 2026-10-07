"""HTTP API of the manim-service (task 3C-01, INTERFACES §6). Python standard library only.

  POST   /render                         202 {jobId, cacheKey} | 400 | 401 | 404 | 409 | 429 {error, reason}
  GET    /render/:jobId                  {status, progress, error?}
  GET    /render/:jobId/download?chapter=<id>|<id>.png|manifest
  DELETE /render/:jobId                  204
  GET    /health                         resources, imageDigest, templateRevs, accepting

Every request carries `x-manim-token` (compared in constant time); `x-openmaic-client` is the owner id the per-person
limit counts (never an IP). Configuration comes from the environment (OPERATIONS §2, §8). Run: python server.py
"""
from __future__ import annotations

import hmac
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import jobs as jobsmod
import spec as specmod

MAX_BODY_BYTES = 16 * 1024
HERE = Path(__file__).resolve().parent


def load_specs(path: Path = HERE / "templates.json") -> dict[str, Any]:
    specs = json.loads(path.read_text(encoding="utf8"))
    for tid, t in specs["templates"].items():
        bad = specmod.unsupported_kinds(t["inputSpec"])
        if bad:
            raise SystemExit(f"template {tid} uses spec kinds the service cannot check: {bad}")
    return specs


class Handler(BaseHTTPRequestHandler):
    server_version = "manim-service"
    protocol_version = "HTTP/1.1"
    manager: jobsmod.JobManager
    token: str
    image_digest: str

    # --- helpers ---------------------------------------------------------------------------------------------------

    def log_message(self, fmt: str, *args: Any) -> None:  # keep stderr for real problems
        return

    def _send(self, status: int, body: Any = None, *, headers: dict[str, str] | None = None) -> None:
        raw = b"" if body is None else json.dumps(body).encode("utf8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if raw and self.command != "HEAD":
            self.wfile.write(raw)

    def _authorised(self) -> bool:
        given = self.headers.get("x-manim-token", "")
        # constant time on the bytes; a missing header compares against an empty string and fails
        return hmac.compare_digest(given.encode("utf8"), self.token.encode("utf8")) and bool(self.token)

    def _client(self) -> str:
        return (self.headers.get("x-openmaic-client") or "anonymous")[:128]

    # --- routes ----------------------------------------------------------------------------------------------------

    def do_POST(self) -> None:  # noqa: N802
        if not self._authorised():
            return self._send(401, {"error": "unauthorized"})
        if urlparse(self.path).path != "/render":
            return self._send(404, {"error": "not-found"})
        try:
            length = int(self.headers.get("content-length", "0"))
        except ValueError:
            return self._send(400, {"error": "bad-request"})
        if length <= 0 or length > MAX_BODY_BYTES:
            return self._send(400 if length <= 0 else 413, {"error": "bad-body-size"})
        try:
            body = json.loads(self.rfile.read(length))
        except ValueError:
            return self._send(400, {"error": "bad-json"})
        try:
            job = self.manager.submit(self._client(), body)
        except jobsmod.Rejected as r:
            return self._send(r.status, r.body)
        self._send(202, {"jobId": job.id, "cacheKey": job.cache_key})

    def do_GET(self) -> None:  # noqa: N802
        if not self._authorised():
            return self._send(401, {"error": "unauthorized"})
        url = urlparse(self.path)
        parts = [p for p in url.path.split("/") if p]
        if parts == ["health"]:
            return self._send(200, self._health())
        if len(parts) >= 2 and parts[0] == "render":
            job = self.manager.get(parts[1])
            if job is None:
                return self._send(404, {"error": "not-found"})
            if len(parts) == 2:
                return self._send(200, self.manager.status_body(job))
            if len(parts) == 3 and parts[2] == "download":
                return self._download(job, (parse_qs(url.query).get("chapter") or [""])[0])
        self._send(404, {"error": "not-found"})

    def do_DELETE(self) -> None:  # noqa: N802
        if not self._authorised():
            return self._send(401, {"error": "unauthorized"})
        parts = [p for p in urlparse(self.path).path.split("/") if p]
        if len(parts) == 2 and parts[0] == "render":
            job = self.manager.get(parts[1])
            if job is None:
                return self._send(404, {"error": "not-found"})
            self.manager.cancel(job)
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        self._send(404, {"error": "not-found"})

    def _download(self, job: jobsmod.Job, what: str) -> None:
        if self.manager.status_body(job)["status"] != "succeeded":
            return self._send(409, {"error": "not-ready"})
        found = self.manager.file_for(job, what)
        if found is None:
            return self._send(404, {"error": "not-found"})
        path, mime = found
        size = path.stat().st_size
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(size))
        self.end_headers()
        with path.open("rb") as f:
            while chunk := f.read(1 << 16):
                self.wfile.write(chunk)

    def _health(self) -> dict[str, Any]:
        m = self.manager
        with m.lock:
            active = m._active()
            return {
                "accepting": len(active) < m.limits.max_global,
                "imageDigest": self.image_digest,
                "templateRevs": {k: v["templateRev"] for k, v in m.specs["templates"].items()},
                "resources": {"concurrency": m.limits.concurrency, "queued": len(m.queue), "active": len(active),
                              "maxQueue": m.limits.max_queue, "rejected429": m.counters["429"]},
            }


def make_server(manager: jobsmod.JobManager, token: str, host: str = "0.0.0.0", port: int = 8080,
                image_digest: str = "sha256:unpinned") -> ThreadingHTTPServer:
    handler = type("BoundHandler", (Handler,), {"manager": manager, "token": token, "image_digest": image_digest})
    return ThreadingHTTPServer((host, port), handler)


def main() -> int:
    token = os.environ.get("MANIM_SERVICE_TOKEN", "")
    if not token:
        print("MANIM_SERVICE_TOKEN is not set", file=sys.stderr)
        return 2
    import runner as runnermod  # the real, isolated runner (task 3C-02)
    specs = load_specs()
    digest = os.environ.get("MANIM_IMAGE_DIGEST", "sha256:unpinned")
    limits = jobsmod.Limits.from_env(dict(os.environ))
    manager = jobsmod.JobManager(specs, runnermod.make_runner(HERE.parent / "templates", HERE.parent / "qa"),
                                 Path(os.environ.get("MANIM_WORK_DIR", "/work")), limits=limits, image_digest=digest)
    manager.start()
    server = make_server(manager, token, port=int(os.environ.get("MANIM_PORT", "8080")), image_digest=digest)
    try:
        server.serve_forever()
    finally:
        manager.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
