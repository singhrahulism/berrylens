#!/usr/bin/env bash
#
# Builds and `npm pack`s the publishable workspace packages into
# `dist-tarballs/` — the tarball-install verification loop documented in
# README.md ("Rebuild the tarballs after any SDK change") and used
# throughout plan/phases.md to confirm a package resolves correctly from
# outside the monorepo, same as a real registry install would.
#
# Single file, switch-driven. Deliberately avoids bash 4+ features
# (associative arrays, etc.) — macOS ships bash 3.2 by default.
#
#   scripts/generate-packages.sh                    # build + pack all three
#   scripts/generate-packages.sh --sdk --protocol
#   scripts/generate-packages.sh --cli --skip-build
#   scripts/generate-packages.sh --clean --out ./dist-tarballs
#   scripts/generate-packages.sh --help

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# protocol first: sdk and cli both depend on its built dist/ at pack time.
ALL_FLAGS="protocol sdk cli"

workspace_for() {
  case "$1" in
    protocol) echo "@berrylens/protocol" ;;
    sdk) echo "berrylens" ;;
    cli) echo "berrylens-cli" ;;
  esac
}

SELECTED=""
SKIP_BUILD=0
CLEAN=0
OUT_DIR="dist-tarballs"

print_help() {
  cat <<'EOF'
Usage: scripts/generate-packages.sh [switches]

Builds and npm-packs the publishable workspace packages into a tarball
directory, for the "install like a real registry package" verification loop.

Package selection (default: all three, if none of these are passed):
  --protocol        include @berrylens/protocol
  --sdk             include berrylens (the RN SDK)
  --cli             include berrylens-cli (the dashboard bin)
  --all             include all three (same as passing none)

Behavior switches:
  --skip-build      pack the existing dist/ as-is, don't rebuild first
  --clean           remove the output directory before packing
  --out <dir>       output directory (default: ./dist-tarballs at repo root)
  -h, --help        show this help and exit
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help)
      print_help
      exit 0
      ;;
    --all)
      # explicit --all is just "no filter" — handled below via SELECTED being empty
      ;;
    --skip-build)
      SKIP_BUILD=1
      ;;
    --clean)
      CLEAN=1
      ;;
    --out)
      shift
      if [ $# -eq 0 ]; then
        echo "--out requires a directory argument" >&2
        exit 1
      fi
      OUT_DIR="$1"
      ;;
    --protocol|--sdk|--cli)
      SELECTED="$SELECTED ${1#--}"
      ;;
    *)
      echo "Unknown switch: $1" >&2
      echo >&2
      print_help >&2
      exit 1
      ;;
  esac
  shift
done

if [ -z "$SELECTED" ]; then
  SELECTED="$ALL_FLAGS"
fi

DESTINATION="$OUT_DIR"
case "$DESTINATION" in
  /*) ;;
  *) DESTINATION="$REPO_ROOT/$DESTINATION" ;;
esac

if [ "$CLEAN" -eq 1 ] && [ -d "$DESTINATION" ]; then
  echo "Removing $DESTINATION"
  rm -rf "$DESTINATION"
fi
mkdir -p "$DESTINATION"

for flag in $SELECTED; do
  workspace="$(workspace_for "$flag")"

  if [ "$SKIP_BUILD" -eq 0 ]; then
    echo
    echo "=== building $flag ($workspace) ==="
    npm run build -w "$workspace"
  fi

  echo
  echo "=== packing $flag ($workspace) -> $DESTINATION ==="
  npm pack -w "$workspace" --pack-destination "$DESTINATION"
done

echo
echo "Done. Tarballs in $DESTINATION"
