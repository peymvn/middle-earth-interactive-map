#!/bin/bash
# Re-download the raw source data into sources/ (about 1 GB). Not stored in git.
#   - Arda 32k eroded DEM (4 GeoTIFF quadrants), CC BY 4.0, https://github.com/bburns/Arda
#   - ME-GIS vector layers (GeoPackage), via the Arda repository
# Then rebuild generated data with tools/rebuild_all.sh (only needed if you change the build tools).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p sources && cd sources
fetch() { [ -s "$2" ] && { echo "have $2"; return; }; echo "get  $2"; curl -fL --retry 4 -o "$2.part" "$1" && mv "$2.part" "$2"; }
for q in nw ne sw se; do
  fetch "https://github.com/bburns/Arda/releases/download/dem-32k-v1/dem_$q.tif" "dem_$q.tif"
done
fetch "https://raw.githubusercontent.com/bburns/Arda/main/data/vectors/vectors.gpkg" vectors.gpkg
fetch "https://raw.githubusercontent.com/bburns/Arda/main/data/rasters/32k/dem.vrt" dem.vrt
echo "sources ready in $(pwd)"
