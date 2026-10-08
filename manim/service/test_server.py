"""Tests of the manim-service (3C-01): parity with TypeScript, admission limits, HTTP contract. A fake runner stands in
for Manim, and a fake clock for TTL and deadline."""
import json
import threading
import urllib.error
import urllib.request
from pathlib import Path

import pytest

import jobs as jobsmod
import server as srv
import spec as specmod

HERE = Path(__file__).resolve().parent
SPECS = json.loads((HERE / "templates.json").read_text(encoding="utf8"))
PARITY = json.loads((HERE / "fixtures" / "parity.json").read_text(encoding="utf8"))
TID = "alg-identity-area"
TPL = SPECS["templates"][TID]
GOOD = {"id": "square-sum", "a": 3, "b": 2}


def test_every_template_is_supported():
    assert srv.load_specs() and all(not specmod.unsupported_kinds(t["inputSpec"]) for t in SPECS["templates"].values())


@pytest.mark.parametrize("c", PARITY["keys"], ids=lambda c: f"{c['templateId']}-{c['key'][7:13]}")
def test_cache_key_equals_typescript(c):
    assert specmod.cache_key(c["templateId"], c["templateRev"], c["params"], c["inputSpec"], c["locale"], c["profile"],
                             c["imageDigest"]) == c["key"]


@pytest.mark.parametrize("c", PARITY["params"], ids=lambda c: f"{c['templateId']}-{json.dumps(c['params'])[:40]}")
def test_validation_equals_typescript(c):
    spec = SPECS["templates"][c["templateId"]]["inputSpec"]
    assert (specmod.validate_params(spec, c["params"]) == []) is c["valid"]


def write_ok(job, out, cancelled):
    (out / "manifest.json").write_text(json.dumps({"chapters": [{"id": "c1", "file": "c1.mp4", "posterFile": "c1.png"}]}))
    (out / "c1.mp4").write_bytes(b"video")
    (out / "c1.png").write_bytes(b"poster")


class Clock:
    t = 0.0

    def __call__(self):
        return self.t


def manager(runner=write_ok, tmp=None, clock=None, **lim):
    return jobsmod.JobManager(SPECS, runner, tmp, limits=jobsmod.Limits(**lim), clock=clock or Clock())


def body(**kw):
    return {"templateId": TID, "templateRev": TPL["templateRev"], "params": GOOD, **kw}


def test_rejections(tmp_path):
    m = manager(tmp=tmp_path)
    for b, status in [(None, 400), ({"templateId": "nope"}, 404), (body(templateRev=99), 409),
                      (body(params={**GOOD, "a": 99}), 400), (body(locale=5), 400)]:
        with pytest.raises(jobsmod.Rejected) as e:
            m.submit("u", b)
        assert e.value.status == status
    with pytest.raises(jobsmod.Rejected) as e:
        m.submit("u", body(templateRev=99))
    assert e.value.body == {"error": "template-rev-mismatch", "current": TPL["templateRev"]}


def test_same_key_same_job_and_limits(tmp_path):
    m = manager(tmp=tmp_path, concurrency=1, max_queue=1, max_per_identity=1, max_global=3)
    a = m.submit("u1", body())
    assert m.submit("u2", body()).id == a.id  # dedup: no new work, no limit
    with pytest.raises(jobsmod.Rejected) as e:  # u1 already has an active job
        m.submit("u1", body(params={**GOOD, "a": 4}))
    assert e.value.body["reason"] == "per_identity_limit"
    m.run_one()  # a runs and finishes, so the queue is empty again
    assert m.submit("u1", body(params={**GOOD, "a": 4})).status == "queued"


def test_queue_full_and_global_limit(tmp_path):
    release = threading.Event()
    started = threading.Event()

    def slow(job, out, cancelled):
        started.set()
        release.wait(5)

    m = manager(slow, tmp_path, concurrency=1, max_queue=1, max_per_identity=9, max_global=3)
    m.submit("u", body())
    t = threading.Thread(target=m.run_one)
    t.start()
    started.wait(5)
    m.submit("u", body(params={**GOOD, "a": 4}))  # one waiting
    with pytest.raises(jobsmod.Rejected) as e:
        m.submit("u", body(params={**GOOD, "a": 5}))
    assert e.value.body["reason"] == "queue_full"
    m2 = manager(tmp=tmp_path / "g", max_queue=9, max_per_identity=9, max_global=1)
    m2.submit("u", body())
    with pytest.raises(jobsmod.Rejected) as e:
        m2.submit("v", body(params={**GOOD, "a": 4}))
    assert e.value.body["reason"] == "global_limit"
    release.set()
    t.join()


def test_failure_deadline_ttl_and_cancel(tmp_path):
    def boom(job, out, cancelled):
        raise RuntimeError("renderer exited 1")

    m = manager(boom, tmp_path)
    j = m.submit("u", body())
    m.run_one()
    assert m.status_body(j) == {"status": "failed", "progress": 1.0, "error": "renderer exited 1"}

    clock = Clock()
    seen = {}

    def wait_for_cancel(job, out, cancelled):
        seen["cancelled"] = cancelled
        clock.t += 700  # 700 s on the fake clock, past the 600 s deadline

    m = manager(wait_for_cancel, tmp_path / "d", clock=clock)
    j = m.submit("u", body())
    m.run_one()
    assert m.status_body(j)["error"] == "deadline" and seen["cancelled"].is_set()

    m = manager(write_ok, tmp_path / "t", clock=clock)
    j = m.submit("u", body())
    m.run_one()
    assert m.get(j.id) is j
    clock.t += 1_801
    assert m.get(j.id) is None and not j.out_dir.exists()

    m = manager(tmp=tmp_path / "c")
    j = m.submit("u", body())
    m.cancel(j)
    assert m.status_body(j)["status"] == "cancelled" and m.run_one() is False


def test_download_files_and_traversal(tmp_path):
    m = manager(tmp=tmp_path)
    j = m.submit("u", body())
    m.run_one()
    assert m.file_for(j, "c1")[1] == "video/mp4" and m.file_for(j, "c1.png")[1] == "image/png"
    assert m.file_for(j, "manifest")[1] == "application/json" and m.file_for(j, "nope") is None
    (j.out_dir / "manifest.json").write_text(json.dumps({"chapters": [{"id": "x", "file": "../x.mp4", "posterFile": "p"}]}))
    assert m.file_for(j, "x") is None


@pytest.fixture
def http(tmp_path):
    m = manager(tmp=tmp_path, max_per_identity=2)
    m.start()
    s = srv.make_server(m, "secret", "127.0.0.1", 0)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{s.server_address[1]}"

    def call(method, path, data=None, token="secret", client="u"):
        req = urllib.request.Request(base + path, method=method, data=None if data is None else json.dumps(data).encode(),
                                     headers={"x-manim-token": token, "x-openmaic-client": client,
                                              "content-type": "application/json"})
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    yield call
    s.shutdown()
    m.shutdown()


def test_http_flow(http):
    assert http("GET", "/health", token="wrong")[0] == 401 and http("POST", "/render", body(), token="")[0] == 401
    status, raw = http("GET", "/health")
    assert status == 200 and json.loads(raw)["templateRevs"][TID] == TPL["templateRev"]
    status, raw = http("POST", "/render", body())
    assert status == 202
    sub = json.loads(raw)
    assert sub["cacheKey"].startswith("sha256:")
    assert http("POST", "/render", body(templateRev=9))[0] == 409
    for _ in range(100):
        st = json.loads(http("GET", f"/render/{sub['jobId']}")[1])
        if st["status"] == "succeeded":
            break
        threading.Event().wait(0.05)
    assert st["status"] == "succeeded"
    assert http("GET", f"/render/{sub['jobId']}/download?chapter=c1") == (200, b"video")
    assert http("GET", f"/render/{sub['jobId']}/download?chapter=zzz")[0] == 404
    assert http("DELETE", f"/render/{sub['jobId']}")[0] == 204
    assert http("GET", "/render/missing")[0] == 404


def test_deadline_stops_a_job_nobody_asks_about(tmp_path):
    """An endless render is told to stop by the worker's own watchdog, with no status poll and no clock tricks."""
    stopped = threading.Event()

    def endless(job, out, cancelled):
        if cancelled.wait(5):
            stopped.set()

    m = manager(endless, tmp_path, deadline_ms=200)
    j = m.submit("u", body())
    t = threading.Thread(target=m.run_one)
    t.start()
    assert stopped.wait(3), "the runner was never told to stop"
    t.join(3)
    assert j.status == "failed" and j.error == "deadline"
