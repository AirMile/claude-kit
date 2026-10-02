#!/usr/bin/env bash
# A folder of projects (like ~/Projects): /setup must make a new project folder, not set up here.
set -euo pipefail
for p in shop blog; do
  mkdir -p "$p" && git -C "$p" init -q -b main
  echo '{"name":"'"$p"'"}' > "$p/package.json"
done
