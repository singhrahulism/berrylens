#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

LIMIT=230

FILES="$(cloc . --by-file --exclude-dir=node_modules,dist,dist-tarballs,.git --fullpath \
  --not-match-f='package-lock\.json' --csv --quiet 2>/dev/null \
  | awk -F',' '$1!="SUM" && $1!="language" {print $2}' \
  | grep -viE '\.test\.|\.md$' || true)"

VIOLATIONS=""
while IFS= read -r file; do
  [ -z "$file" ] && continue
  count="$(wc -l < "$file" | tr -d ' ')"
  if [ "$count" -gt "$LIMIT" ]; then
    VIOLATIONS="${VIOLATIONS}${count}  ${file}"$'\n'
  fi
done <<< "$FILES"

if [ -z "$VIOLATIONS" ]; then
  echo "No files over $LIMIT lines."
  exit 0
fi

echo "Files over $LIMIT lines:"
echo
printf '%s' "$VIOLATIONS"
exit 1
