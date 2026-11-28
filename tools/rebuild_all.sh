#!/bin/bash
# Rebuild every generated file in web/ from sources/ (run tools/download_sources.sh first).
# Memory-capped where heavy. Takes ~5 minutes plus the optional network steps.
set -euo pipefail
cd "$(dirname "$0")/.."
PY=.venv/bin/python
[ -x "$PY" ] || { python3 -m venv .venv && .venv/bin/pip install -q numpy pillow tifffile imagecodecs scipy shapely; }
CAP=""; command -v systemd-run >/dev/null && CAP="systemd-run --user --scope -q -p MemoryMax=2500M"
$CAP nice -n 15 $PY tools/build_terrain.py     # web/tiles/terrain (z0-z6)
$PY tools/build_vectors.py                      # web/data/vectors.js
$PY tools/build_relief.py                       # web/data/relief.js
[ "${WITH_NETWORK:-0}" = 1 ] && python3 tools/build_photos.py   # web/data/photos.js (film stills, LOTR wiki API)
if [ -d sources/arda-ref/pages ]; then          # web/data/arda.js (needs tools/arda_crawl.sh)
  python3 tools/arda_compare.py && $PY tools/arda_apply.py
fi
# ports and river towns onto the drawn water (needs Playwright: cd tools/test && npm i)
[ -d tools/test/node_modules ] && $CAP nice node tools/fix_waterside.js
echo "rebuilt."
