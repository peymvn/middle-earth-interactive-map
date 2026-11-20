#!/bin/bash
# usage: tools/test/multi.sh name "#hash" [name "#hash" ...]  -> /tmp/me/<name>.png
cd "$(dirname "$0")/../.."
export CHROME=$(ls ~/.cache/ms-playwright/chromium_headless_shell-1248/*/chrome-headless-shell)
while [ $# -gt 1 ]; do
  timeout 170 systemd-run --user --scope -q -p MemoryMax=2500M nice -n 10 env CHROME=$CHROME node tools/test/shot.js /tmp/me/$1.png "$2" ${W:-1280} ${H:-800} ${DPR:-1} 2>&1 | tail -4
  shift 2
done
