"""Job queue of the manim-service (task 3C-01): admission limits, deduplication by cache key, workers, TTL and deadline.

The queue knows nothing about Manim: a *runner* is injected (`runner(job, out_dir, cancelled)` writes `manifest.json`
and the chapter files into `out_dir`, or raises). Task 3C-02 provides the real runner, the tests a fake one.
Time comes from an injected clock, so TTL and deadline are tested without waiting.
"""
from __future__ import annotations

import json
import shutil
import threading
import time
import uuid
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

import spec as specmod


@dataclass
class Limits:
    concurrency: int = 1
    max_queue: int = 3
    max_per_identity: int = 1
    max_global: int = 4
    ttl_ms: int = 1_800_000
    deadline_ms: int = 600_000

    @staticmethod
    def from_env(env: dict[str, str]) -> "Limits":
        def num(name: str, default: int) -> int:
            try:
                return max(int(env.get(name, default)), 1)
            except ValueError:
                return default
        d = Limits()
        return Limits(num("MANIM_MAX_CONCURRENCY", d.concurrency), num("MANIM_MAX_QUEUE", d.max_queue),
                      num("MANIM_MAX_JOBS_PER_USER", d.max_per_identity), num("MANIM_MAX_GLOBAL", d.max_global),
                      num("MANIM_JOB_TTL_MS", d.ttl_ms), num("MANIM_JOB_DEADLINE_MS", d.deadline_ms))


@dataclass
class Job:
    id: str
    cache_key: str
    template_id: str
    params: Any
    locale: str | None
    client: str
    out_dir: Path
    status: str = "queued"  # queued | running | succeeded | failed | cancelled
    error: str | None = None
    started: float | None = None
    finished: float | None = None
    cancelled: threading.Event = field(default_factory=threading.Event)


class Rejected(Exception):
    def __init__(self, status: int, body: dict[str, Any]):
        super().__init__(body.get("error", "rejected"))
        self.status = status
        self.body = body


Runner = Callable[[Job, Path, threading.Event], None]


class JobManager:
    def __init__(self, specs: dict[str, Any], runner: Runner, work_root: Path, *, limits: Limits | None = None,
                 clock: Callable[[], float] = time.monotonic, image_digest: str = "sha256:unpinned"):
        self.specs = specs
        self.runner = runner
        self.work_root = work_root
        self.limits = limits or Limits()
        self.clock = clock
        self.image_digest = image_digest
        self.jobs: dict[str, Job] = {}
        self.queue: deque[str] = deque()
        self.lock = threading.RLock()
        self.wake = threading.Condition(self.lock)
        self.stop = False
        self.threads: list[threading.Thread] = []
        self.counters = {"429": 0}
        work_root.mkdir(parents=True, exist_ok=True)

    # --- admission -------------------------------------------------------------------------------------------------

    def _active(self) -> list[Job]:
        return [j for j in self.jobs.values() if j.status in ("queued", "running")]

    def submit(self, client: str, body: Any) -> Job:
        if not isinstance(body, dict) or not isinstance(body.get("templateId"), str):
            raise Rejected(400, {"error": "bad-request"})
        tpl = self.specs["templates"].get(body["templateId"])
        if tpl is None:
            raise Rejected(404, {"error": "unknown-template"})
        rev = body.get("templateRev")
        if not specmod.is_int(rev) or rev != tpl["templateRev"]:
            raise Rejected(409, {"error": "template-rev-mismatch", "current": tpl["templateRev"]})
        problems = specmod.validate_params(tpl["inputSpec"], body.get("params"))
        if problems:
            raise Rejected(400, {"error": "invalid-params", "issues": problems[:5]})
        locale = body.get("locale")
        if locale is not None and not isinstance(locale, str):
            raise Rejected(400, {"error": "bad-locale"})
        key = specmod.cache_key(body["templateId"], tpl["templateRev"], body["params"], tpl["inputSpec"],
                                locale if tpl["bakedText"] else None, self.specs["profile"], self.image_digest)
        with self.lock:
            self._expire()
            # two POSTs with the same cache key share one job (no new work, so no limit applies)
            for j in self.jobs.values():
                if j.cache_key == key and j.status in ("queued", "running", "succeeded"):
                    return j
            active = self._active()
            lim = self.limits
            if len(active) >= lim.max_global:
                self.counters["429"] += 1
                raise Rejected(429, {"error": "busy", "reason": "global_limit"})
            if sum(1 for j in active if j.client == client) >= lim.max_per_identity:
                self.counters["429"] += 1
                raise Rejected(429, {"error": "busy", "reason": "per_identity_limit"})
            running = sum(1 for j in active if j.status == "running")
            if running >= lim.concurrency and len(self.queue) >= lim.max_queue:
                self.counters["429"] += 1
                raise Rejected(429, {"error": "busy", "reason": "queue_full"})
            job_id = uuid.uuid4().hex
            job = Job(job_id, key, body["templateId"], body["params"], locale, client, self.work_root / job_id)
            self.jobs[job_id] = job
            self.queue.append(job_id)
            self.wake.notify()
            return job

    # --- reading ---------------------------------------------------------------------------------------------------

    def get(self, job_id: str) -> Job | None:
        with self.lock:
            self._expire()
            return self.jobs.get(job_id)

    def status_body(self, job: Job) -> dict[str, Any]:
        with self.lock:
            self._check_deadline(job)
            body: dict[str, Any] = {"status": job.status, "progress": {"queued": 0.0, "running": 0.5}.get(job.status, 1.0)}
            if job.error:
                body["error"] = job.error
            return body

    def cancel(self, job: Job) -> None:
        with self.lock:
            if job.status in ("queued", "running"):
                job.cancelled.set()
                job.status = "cancelled"
                job.finished = self.clock()
                if job.id in self.queue:
                    self.queue.remove(job.id)

    # --- time: TTL and deadline --------------------------------------------------------------------------------------

    def _check_deadline(self, job: Job) -> None:
        if job.status == "running" and job.started is not None and (self.clock() - job.started) * 1000 > self.limits.deadline_ms:
            job.status = "failed"
            job.error = "deadline"
            job.finished = self.clock()
            job.cancelled.set()  # the runner is told to stop; the deadline is reported through the poll

    def _deadline(self, job: Job) -> None:
        with self.lock:
            if job.status == "running":
                job.status, job.error, job.finished = "failed", "deadline", self.clock()
                job.cancelled.set()

    def _expire(self) -> None:
        now = self.clock()
        for jid in list(self.jobs):
            j = self.jobs[jid]
            self._check_deadline(j)
            if j.finished is not None and (now - j.finished) * 1000 > self.limits.ttl_ms:
                shutil.rmtree(j.out_dir, ignore_errors=True)
                del self.jobs[jid]

    # --- running ---------------------------------------------------------------------------------------------------

    def run_one(self) -> bool:
        """Takes the next queued job and runs it in this thread; False when the queue is empty."""
        with self.lock:
            while self.queue:
                job = self.jobs.get(self.queue.popleft())
                if job is not None and job.status == "queued":
                    job.status = "running"
                    job.started = self.clock()
                    break
            else:
                return False
        # the deadline is enforced here, by the worker, and not only when somebody polls the status: a job that never ends is
        # told to stop (the runner kills its process group) even if nobody asks about it
        watchdog = threading.Timer(self.limits.deadline_ms / 1000, self._deadline, args=(job,))
        watchdog.daemon = True
        watchdog.start()
        try:
            job.out_dir.mkdir(parents=True, exist_ok=True)
            self.runner(job, job.out_dir, job.cancelled)
            outcome, error = "succeeded", None
        except Exception as e:  # noqa: BLE001 - a runner failure is a failed job, never a crashed worker
            outcome, error = "failed", str(e)[:500] or e.__class__.__name__
        finally:
            watchdog.cancel()
        with self.lock:
            self._check_deadline(job)  # a runner that ignored the deadline still ends as failed
            if job.status == "running":  # not cancelled or timed out meanwhile
                job.status, job.error = outcome, error
                job.finished = self.clock()
        return True

    def start(self) -> None:
        for n in range(self.limits.concurrency):
            t = threading.Thread(target=self._worker, name=f"manim-worker-{n}", daemon=True)
            t.start()
            self.threads.append(t)

    def _worker(self) -> None:
        while True:
            with self.lock:
                while not self.queue and not self.stop:
                    self.wake.wait(timeout=0.2)
                if self.stop:
                    return
            self.run_one()

    def shutdown(self) -> None:
        with self.lock:
            self.stop = True
            self.wake.notify_all()
        for t in self.threads:
            t.join(timeout=2)

    # --- download --------------------------------------------------------------------------------------------------

    def file_for(self, job: Job, what: str) -> tuple[Path, str] | None:
        """The file behind `?chapter=`: a chapter id (its mp4), `<id>.png` (its poster) or `manifest`; None when unknown."""
        manifest_path = job.out_dir / "manifest.json"
        if what == "manifest":
            return (manifest_path, "application/json") if manifest_path.is_file() else None
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf8"))
        except (OSError, ValueError):
            return None
        for c in manifest.get("chapters", []):
            if what == c.get("id"):
                p, mime = job.out_dir / str(c.get("file")), "video/mp4"
            elif what == f"{c.get('id')}.png":
                p, mime = job.out_dir / str(c.get("posterFile")), "image/png"
            else:
                continue
            # the manifest is trusted but the file name still must not leave the job directory
            return (p, mime) if p.resolve().parent == job.out_dir.resolve() and p.is_file() else None
        return None
