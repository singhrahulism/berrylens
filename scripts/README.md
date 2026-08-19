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

## smoke-app.ts

A stand-in for a React Native app, used to verify the SDK to CLI pipeline
without needing a device or simulator. Run with `npm run smoke` from the
repo root while a `berrylens` CLI instance is running on the default port.
See the file itself for details.
