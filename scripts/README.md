# scripts/

## generate-packages.sh

Builds and `npm pack`s the publishable workspace packages
(`@berrylens/protocol`, `berrylens`, `berrylens-cli`) into `dist-tarballs/`.
This is the tarball install loop described in the root `README.md`, used to
confirm a package resolves correctly when installed from outside the
monorepo, the same way a real registry install would.

Plain bash, compatible with bash 3.2 (the version macOS ships by default, no
Homebrew bash required). No other dependencies beyond `npm`.

### Usage

```bash
scripts/generate-packages.sh                    # build and pack all three packages
scripts/generate-packages.sh --sdk --protocol    # only these two
scripts/generate-packages.sh --cli --skip-build  # pack the existing dist/, do not rebuild
scripts/generate-packages.sh --clean --out ./dist-tarballs
scripts/generate-packages.sh --help
```

Also available as `npm run generate-packages` from the repo root (forwards to
this script; extra flags after `--` still work, e.g.
`npm run generate-packages -- --sdk`).

### Switches

Package selection (default is all three if none of these are passed):

- `--protocol` include `@berrylens/protocol`
- `--sdk` include `berrylens` (the React Native SDK)
- `--cli` include `berrylens-cli` (the dashboard bin)
- `--all` include all three, same as passing none

Behavior:

- `--skip-build` pack the existing `dist/` as is, do not rebuild first
- `--clean` remove the output directory before packing
- `--out <dir>` output directory, default is `./dist-tarballs` at the repo root
- `-h`, `--help` show usage and exit

### Order

`protocol` is always built and packed before `sdk` and `cli` when more than
one is selected, since both depend on protocol's built `dist/` at pack time.

## check-file-size.sh

Checks that no source file in the repo exceeds 230 total lines (the
project's 200-line guideline with a 15% tolerance), counted with `wc -l`,
excluding test files and Markdown (including everything under `plan/`). Uses
`cloc` to find candidate source files.

```bash
scripts/check-file-size.sh
```

Prints the offending files and exits 1 if any are found, otherwise exits 0.

## live-verify.py

Drives the actual compiled CLI binary inside a real pseudo-terminal (Python's
stdlib `pty` module) and asserts on its rendered output. This is the
automated form of the manual pty checks used during development: it runs the
real binary under a genuine TTY (Ink sees real `isTTY`, real raw mode, a real
terminal size), not a mocked renderer, so it catches things
`ink-testing-library` cannot, in particular anything about ref-forwarding,
raw-mode key handling, or actual ANSI output.

Python (not Node or bash) because a real pty needs either a native addon
(`node-pty`, not a project dependency) or a language with pty support built
into its standard library. `python3` is assumed to be present (macOS ships
it); no pip packages are required. Event injection reuses `packages/cli`'s
existing `ws` dependency via a small committed helper
(`scripts/lib/ws-inject.cjs`), so no new npm dependency either.

```bash
python3 scripts/live-verify.py --scenario scripts/scenarios/timeline.json
python3 scripts/live-verify.py --scenario scripts/scenarios/network-detail.json --skip-build --port 7951
```

A scenario is a JSON file with two optional top-level keys:

- `events`: a list of protocol messages (`{"type": "hello", ...}`,
  `{"type": "event", "event": {...InspectorEvent}}`) sent to the running CLI
  before any keys, standing in for a connected app. Omit for dashboard-only
  checks that don't need data.
- `steps`: a list of `{"keys": [...], "wait": <seconds>, "expect": [...],
  "not_expect": [...]}`. Each step sends its keys in order (named keys:
  `tab`, `shift+tab`, `enter`/`return`, `esc`/`escape`, `up`/`down`/`left`/`right`;
  anything else is sent as a literal character), waits, then checks that
  every `expect` substring appeared and every `not_expect` substring did not,
  in the output produced since that step started (ANSI codes stripped
  first).

Exits 0 and prints `PASS` if every step's assertions held, otherwise prints
each failing assertion and exits 1. Builds `berrylens-cli` first by default;
pass `--skip-build` to run against the existing `dist/` as is. `--port`
defaults to 7950 (pick a free one if running scenarios in parallel or if
that port is already in use by another running CLI instance). See
`scripts/scenarios/` for working examples.

## smoke-app.ts

A stand-in for a React Native app, used to verify the SDK to CLI pipeline
without needing a device or simulator. Run with `npm run smoke` from the
repo root while a `berrylens` CLI instance is running on the default port.
See the file itself for details.
