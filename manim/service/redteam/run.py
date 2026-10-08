"""Red-team of the manim-service sandbox (card 3C-04, SCHEMA S6). Host side; needs Docker and the image `manim-service:real`
(docker build -f manim/Dockerfile -t manim-service:real .).

  python3 manim/service/redteam/run.py [--image manim-service:real] [--only attack,attack]

One long-lived container, hardened as in docker-compose.yml (read-only root, no capabilities, no-new-privileges, 4 GiB, 2 CPUs,
256 processes, an INTERNAL network with no route out). Its renderer command is redteam/dispatch.py: the job of the clip
`cs-projection` runs the named attack as the renderer process, any other clip renders for real. After every attack the victim
job (`amgm-semicircle`) must still render and pass the gates. Canaries: a file only root can read, the service token and a
canary variable in the service environment, and a TCP listener on the host that a control container on the ordinary bridge
network CAN reach (so the listener is proven to work). Exit 0 only when nothing escaped and every victim succeeded.
"""
import argparse
import json
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
NAME = "rt-ms"
NET = "manim-redteam"
TOKEN = "rt-token"
DEADLINE_MS = 15000
ATTACKS = ["env_leak", "read_root_canary", "tex_input_passwd", "tex_write18", "tex_write_outside", "os_system", "socket_attack",
           "fork_bomb", "mem_bomb", "disk_bomb", "infinite_loop"]
JOB = {"templateId": "cs-projection", "templateRev": 1, "params": {"ux": 3, "uy": 1, "vx": 1, "vy": 2}}
VICTIM = {"templateId": "amgm-semicircle", "templateRev": 1, "params": {"a": 2, "b": 8}}


def sh(*args: str, check: bool = True, timeout: int = 600) -> str:
    r = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if check and r.returncode != 0:
        raise RuntimeError(f"{' '.join(args)}: {r.stderr.strip()[-300:]}")
    return r.stdout.strip()


def call(method: str, path: str, body: dict | None = None, client: str = "rt") -> tuple[int, dict]:
    code = (
        "import json,sys,urllib.request,urllib.error\n"
        f"req=urllib.request.Request('http://127.0.0.1:8080{path}',method='{method}',data={json.dumps(json.dumps(body)) if body else 'None'}"
        f".encode() if {bool(body)} else None,headers={{'x-manim-token':'{TOKEN}','x-openmaic-client':'{client}','content-type':'application/json'}})\n"
        "try:\n r=urllib.request.urlopen(req); print(r.status, r.read().decode())\n"
        "except urllib.error.HTTPError as e: print(e.code, e.read().decode())\n"
    )
    out = sh("docker", "exec", NAME, "python3", "-c", code)
    status, _, text = out.partition(" ")
    return int(status), (json.loads(text) if text.strip().startswith("{") else {})


def run_job(body: dict, wait_s: int = 240) -> tuple[dict, float]:
    t0 = time.time()
    status, sub = call("POST", "/render", body)
    if status != 202:
        return {"status": "rejected", "error": f"{status} {sub}"}, time.time() - t0
    while time.time() - t0 < wait_s:
        _, st = call("GET", f"/render/{sub['jobId']}")
        if st.get("status") in ("succeeded", "failed", "cancelled"):
            return st, time.time() - t0
        time.sleep(1)
    return {"status": "timeout"}, time.time() - t0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", default="manim-service:real")
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    attacks = [a for a in ATTACKS if not args.only or a in args.only.split(",")]

    # canary listener on the host
    srv = socket.socket()
    srv.bind(("0.0.0.0", 0))
    srv.listen(8)
    port = srv.getsockname()[1]
    hits: list[str] = []

    def accept() -> None:
        while True:
            try:
                c, addr = srv.accept()
            except OSError:
                return
            hits.append(addr[0])
            c.close()

    threading.Thread(target=accept, daemon=True).start()

    sh("docker", "rm", "-f", NAME, check=False)
    sh("docker", "network", "create", "--internal", NET, check=False)
    (HERE / "current").write_text("env_leak")
    sh("docker", "run", "-d", "--name", NAME, "--network", NET, "--read-only", "--cap-drop", "ALL",
       "--security-opt", "no-new-privileges:true", "--memory", "4g", "--memory-swap", "4g", "--cpus", "2", "--pids-limit", "256",
       "--tmpfs", "/work:size=2g,uid=1000", "--tmpfs", "/tmp", "--tmpfs", "/home/manimuser:uid=1000", "--tmpfs", "/root:mode=0700",
       "-v", f"{HERE}:/redteam", "-e", f"MANIM_SERVICE_TOKEN={TOKEN}", "-e", "CANARY_ENV=canary-secret",
       "-e", "MANIM_RENDER_CMD=python3 /redteam/dispatch.py", "-e", f"MANIM_JOB_DEADLINE_MS={DEADLINE_MS}",
       "-e", "MANIM_MAX_JOBS_PER_USER=4", "-e", "MANIM_MAX_GLOBAL=8", "-e", f"REDTEAM_CANARY_PORT={port}", args.image)
    sh("docker", "exec", "-u", "root", NAME, "sh", "-c", "echo secret > /root/redteam-canary && chmod 600 /root/redteam-canary")
    for _ in range(30):
        if call("GET", "/health")[0] == 200:
            break
        time.sleep(1)

    # control: the same canary from the ordinary bridge network IS reachable, so a silent canary means something
    (HERE / "current").write_text("socket_attack")
    ctl = sh("docker", "run", "--rm", "--add-host", "host.docker.internal:host-gateway", "-v", f"{HERE}:/redteam:ro",
             "-e", f"REDTEAM_CANARY_PORT={port}", "--entrypoint", "python3", args.image, "/redteam/attacks.py", "socket_attack", check=False)
    control_hits = len(hits)
    print(f"control (bridge network) reached the canary listener: {control_hits > 0}")
    hits.clear()

    rows, failed = [], False
    for name in attacks:
        (HERE / "current").write_text(name)
        st, secs = run_job(JOB)
        text = st.get("error", "")
        escaped = [l for l in text.replace("; ", "\n").splitlines() if "ESCAPED" in l]
        blocked = text.count("BLOCKED")
        t_kill = round(secs, 1)
        v, vsecs = run_job(VICTIM)
        inspect = json.loads(sh("docker", "inspect", NAME))[0]["State"]
        procs = sh("docker", "exec", NAME, "sh", "-c", "ps -eo pid,args | grep -v -E 'ps -eo|grep|server.py|^ *PID' | wc -l")
        row = {"attack": name, "status": st.get("status"), "seconds": t_kill, "blocked": blocked, "escaped": escaped,
               "victim": v.get("status"), "victim_seconds": round(vsecs, 1), "oom_killed": inspect["OOMKilled"],
               "running": inspect["Running"], "leftover_processes": procs, "error": text[-200:]}
        rows.append(row)
        if escaped or v.get("status") != "succeeded" or inspect["OOMKilled"] or not inspect["Running"]:
            failed = True
        if name == "infinite_loop" and not (st.get("error") == "deadline" and secs <= DEADLINE_MS / 1000 + 5):
            failed = True
        print(json.dumps(row, ensure_ascii=False))
    if hits:  # the canary listener was reached from the internal network
        print(f"CANARY NETWORK REACHED FROM THE SANDBOX: {hits}")
        failed = True
    srv.close()
    sh("docker", "rm", "-f", NAME, check=False)
    sh("docker", "network", "rm", NET, check=False)
    print("RESULT:", "FAIL" if failed else "PASS (nothing escaped; every victim job rendered)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
