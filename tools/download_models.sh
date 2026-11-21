#!/bin/bash
# Fetch what the 3D-model build needs (not stored in git): headless Blender 4.1 and the CC0 Poly Haven assets.
#   tools/download_models.sh && <blender> -b --factory-startup -P tools/blender/build_models.py && python3 tools/pack_models.py
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p sources/blender
if [ ! -x sources/blender/blender-4.1.1-linux-x64/blender ]; then
  curl -fL https://download.blender.org/release/Blender4.1/blender-4.1.1-linux-x64.tar.xz | tar xJ -C sources/blender
fi
PY=.venv/bin/python; [ -x "$PY" ] || PY=python3
$PY tools/blender/fetch_polyhaven.py
$PY tools/blender/make_textures.py
echo "ready: sources/blender/blender-4.1.1-linux-x64/blender -b --factory-startup -P tools/blender/build_models.py"
