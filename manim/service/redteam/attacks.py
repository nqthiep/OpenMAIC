"""The attacks of the red-team (card 3C-04, SCHEMA S6). Each one is what a hostile template could do once it ran: they play the
part of the renderer process. `run(name)` prints one line per attempt, `BLOCKED <what>` when the sandbox held and
`ESCAPED <what>` when it did not; the service puts the tail of stderr into the job's error, the harness reads it from there.
Needs only the Python standard library and, for the TeX attacks, `latex`.
"""
import os
import resource
import socket
import subprocess
import sys
import tempfile
import time

CANARY_HOST = os.environ.get("REDTEAM_CANARY_HOST", "host.docker.internal")
CANARY_PORT = int(os.environ.get("REDTEAM_CANARY_PORT", "0") or 0)


def say(kind: str, what: str) -> None:
    print(f"{kind} {what}", file=sys.stderr, flush=True)


def env_leak() -> None:
    names = [k for k in os.environ if "TOKEN" in k or "CANARY" in k or "SECRET" in k]
    say("ESCAPED" if names else "BLOCKED", f"environment secrets: {names}")


def read_root_canary() -> None:
    try:
        data = open("/root/redteam-canary").read()
        say("ESCAPED", f"read /root/redteam-canary: {data[:20]!r}")
    except OSError as e:
        say("BLOCKED", f"read /root/redteam-canary: {e.__class__.__name__}")


def _tex(body: str) -> str:
    d = tempfile.mkdtemp()
    open(f"{d}/a.tex", "w").write("\\documentclass{article}\\begin{document}\n" + body + "\n\\end{document}\n")
    r = subprocess.run(["latex", "-interaction=nonstopmode", "a.tex"], cwd=d, capture_output=True, text=True, timeout=60)
    return r.stdout + (open(f"{d}/a.log").read() if os.path.exists(f"{d}/a.log") else "")


def tex_input_passwd() -> None:
    out = _tex("\\input{/etc/passwd}")
    say("ESCAPED" if "root:" in out else "BLOCKED", "TeX \\input{/etc/passwd}")


def tex_write18() -> None:
    marker = f"/tmp/pwned-write18-{os.getpid()}"
    _tex(f"\\immediate\\write18{{touch {marker}}}")
    say("ESCAPED" if os.path.exists(marker) else "BLOCKED", "TeX \\write18 shell escape")


def tex_write_outside() -> None:
    marker = f"/tmp/pwned-openout-{os.getpid()}"
    _tex(f"\\newwrite\\f\\immediate\\openout\\f={marker}\\immediate\\write\\f{{x}}")
    say("ESCAPED" if os.path.exists(marker) else "BLOCKED", "TeX \\openout to an absolute path")


def os_system() -> None:
    uid = os.getuid()
    say("ESCAPED" if uid == 0 else "BLOCKED", f"running as uid {uid}")
    caps = [l for l in open("/proc/self/status") if l.startswith("CapEff")][0].split()[1]
    say("ESCAPED" if int(caps, 16) else "BLOCKED", f"effective capabilities {caps}")
    for path in ("/app/qa/redteam-x", "/etc/redteam-x", "/usr/redteam-x"):
        try:
            open(path, "w").write("x")
            say("ESCAPED", f"wrote {path}")
        except OSError as e:
            say("BLOCKED", f"write {path}: {e.__class__.__name__}")
    r = subprocess.run("id -u; sudo -n true 2>&1 | head -1", shell=True, capture_output=True, text=True)
    say("BLOCKED", f"shell works but is the same user: {r.stdout.split()[0]}")


def socket_attack() -> None:
    targets = [("1.1.1.1", 53), ("93.184.216.34", 80)]
    if CANARY_PORT:
        targets.insert(0, (CANARY_HOST, CANARY_PORT))
    for host, port in targets:
        s = socket.socket()
        s.settimeout(4)
        try:
            s.connect((host, port))
            say("ESCAPED", f"connected to {host}:{port}")
        except OSError as e:
            say("BLOCKED", f"connect {host}:{port}: {e.__class__.__name__}")
        finally:
            s.close()
    try:
        socket.getaddrinfo("example.com", 80)
        say("ESCAPED", "DNS resolved example.com")
    except OSError:
        say("BLOCKED", "DNS lookup")


def fork_bomb() -> None:
    children = 0
    try:
        for _ in range(5000):
            pid = os.fork()
            if pid == 0:
                time.sleep(30)
                os._exit(0)
            children += 1
        say("ESCAPED", f"forked {children} processes")
    except OSError as e:
        say("BLOCKED", f"fork stopped after {children} children: {e.__class__.__name__}")
    finally:
        os.killpg(0, 9) if False else None


def mem_bomb() -> None:
    chunks = []
    try:
        for _ in range(64):
            chunks.append(bytearray(256 * 1024 * 1024))
            chunks[-1][::4096] = b"x" * len(chunks[-1][::4096])  # touch the pages
        say("ESCAPED", f"allocated {len(chunks) * 256} MB")
    except MemoryError:
        say("BLOCKED", f"MemoryError after {len(chunks) * 256} MB")


def disk_bomb() -> None:
    try:
        with open(os.path.join(os.environ.get("CLIP_OUT", "/tmp"), "bomb.bin"), "wb") as f:
            for _ in range(64):
                f.write(b"\0" * (128 * 1024 * 1024))
                f.flush()
        say("ESCAPED", "wrote 8 GB")
    except (OSError, ValueError) as e:
        say("BLOCKED", f"file size limit: {e.__class__.__name__}")


def infinite_loop() -> None:
    say("BLOCKED", "started an endless loop (the deadline must end it)")
    while True:
        pass


def limits() -> None:
    say("BLOCKED", f"limits as={resource.getrlimit(resource.RLIMIT_AS)} fsize={resource.getrlimit(resource.RLIMIT_FSIZE)}")


ATTACKS = {f.__name__: f for f in (env_leak, read_root_canary, tex_input_passwd, tex_write18, tex_write_outside, os_system,
                                   socket_attack, fork_bomb, mem_bomb, disk_bomb, infinite_loop)}

if __name__ == "__main__":
    ATTACKS[sys.argv[1]]()
