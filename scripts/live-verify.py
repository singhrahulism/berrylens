#!/usr/bin/env python3
"""
Drives the real berrylens CLI binary inside a pseudo-terminal and asserts on
its rendered output: the automated version of the manual pty checks used
throughout development. Runs the actual compiled binary under a real pty
(Ink sees a genuine isTTY, raw mode, real terminal size), not a mocked
renderer, which is why this exists alongside the ink-testing-library suite
rather than replacing it: ref-forwarding, raw-mode key handling, and ANSI
output are exactly the kind of thing that can look fine in a mock and still
misbehave live.

Usage:
    python3 scripts/live-verify.py --scenario scripts/scenarios/timeline.json
    python3 scripts/live-verify.py --scenario <file> --skip-build --port 7950

Scenario JSON shape:
{
  "events": [
    {"type": "hello", "appName": "verify", "platform": "ios"},
    {"type": "event", "event": {"id": "net1", "timestamp": 0, "category": "network",
                                 "label": "...", "data": {...}}}
  ],
  "steps": [
    {"keys": ["tab", "tab", "enter"], "wait": 0.8,
     "expect": ["REQUEST"], "not_expect": ["nothing here"]}
  ]
}

"events" is optional (omit for dashboard-only checks). Each step sends its
"keys" in order, waits, then checks "expect" substrings are present and
"not_expect" substrings are absent in the accumulated (ANSI-stripped) output
since the step started. Key names: single characters are sent literally;
"tab", "shift+tab", "enter"/"return", "esc"/"escape", "up", "down", "left",
"right" are recognized as named keys.
"""
import argparse
import json
import os
import pty
import re
import select
import subprocess
import sys
import time

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CLI_ENTRY = os.path.join(REPO_ROOT, "packages", "cli", "dist", "index.js")
WS_INJECT = os.path.join(REPO_ROOT, "scripts", "lib", "ws-inject.cjs")

KEY_BYTES = {
    "tab": b"\t",
    "shift+tab": b"\x1b[Z",
    "enter": b"\r",
    "return": b"\r",
    "esc": b"\x1b",
    "escape": b"\x1b",
    "up": b"\x1b[A",
    "down": b"\x1b[B",
    "right": b"\x1b[C",
    "left": b"\x1b[D",
}

ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07")


def key_to_bytes(key: str) -> bytes:
    if key in KEY_BYTES:
        return KEY_BYTES[key]
    return key.encode("utf-8")


class PtySession:
    def __init__(self, port: int, metro: str | None):
        self.buffer = b""
        env = os.environ.copy()
        env["BERRYLENS_PORT"] = str(port)
        args = ["node", CLI_ENTRY]
        if metro:
            args += ["--metro", metro]
        pid, fd = pty.fork()
        if pid == 0:
            os.chdir(REPO_ROOT)
            os.execvpe(args[0], args, env)
        self.pid = pid
        self.fd = fd

    def read_available(self, timeout: float) -> None:
        end = time.time() + timeout
        while time.time() < end:
            ready, _, _ = select.select([self.fd], [], [], 0.1)
            if self.fd in ready:
                try:
                    chunk = os.read(self.fd, 65536)
                    if not chunk:
                        break
                    self.buffer += chunk
                except OSError:
                    break

    def send(self, key: str) -> None:
        os.write(self.fd, key_to_bytes(key))

    def clean(self) -> str:
        return ANSI_RE.sub("", self.buffer.decode(errors="replace"))

    def close(self) -> None:
        try:
            os.kill(self.pid, 9)
        except ProcessLookupError:
            pass


def inject_events(port: int, events: list) -> None:
    events_file = os.path.join(REPO_ROOT, ".live-verify-events.json")
    with open(events_file, "w") as f:
        json.dump(events, f)
    try:
        result = subprocess.run(
            ["node", WS_INJECT, str(port), events_file],
            cwd=os.path.join(REPO_ROOT, "packages", "cli"),
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode != 0:
            print(f"  event injection failed: {result.stderr.strip()}", file=sys.stderr)
    finally:
        os.remove(events_file)


def run_scenario(scenario_path: str, port: int, metro: str | None) -> bool:
    with open(scenario_path) as f:
        scenario = json.load(f)

    session = PtySession(port, metro)
    session.read_available(1.5)

    events = scenario.get("events")
    if events:
        inject_events(port, events)
        session.read_available(1.0)

    passed = True
    for i, step in enumerate(scenario.get("steps", []), start=1):
        checkpoint = len(session.buffer)
        for key in step.get("keys", []):
            session.send(key)
            session.read_available(step.get("wait", 0.5))
        frame_since_step = ANSI_RE.sub("", session.buffer[checkpoint:].decode(errors="replace"))

        for needle in step.get("expect", []):
            if needle not in frame_since_step:
                print(f"  step {i}: FAIL, expected {needle!r} not found")
                passed = False
        for needle in step.get("not_expect", []):
            if needle in frame_since_step:
                print(f"  step {i}: FAIL, unexpected {needle!r} found")
                passed = False

    session.close()
    return passed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--scenario", required=True, help="path to a scenario JSON file")
    parser.add_argument("--port", type=int, default=7950)
    parser.add_argument("--metro", default=None)
    parser.add_argument("--skip-build", action="store_true")
    args = parser.parse_args()

    if not args.skip_build:
        print("building berrylens-cli...", flush=True)
        result = subprocess.run(["npm", "run", "build", "-w", "berrylens-cli"], cwd=REPO_ROOT)
        if result.returncode != 0:
            print("build failed", file=sys.stderr)
            sys.exit(1)

    print(f"running scenario: {args.scenario}", flush=True)
    ok = run_scenario(args.scenario, args.port, args.metro)

    if ok:
        print("PASS")
        sys.exit(0)
    else:
        print("FAIL")
        sys.exit(1)


if __name__ == "__main__":
    main()
