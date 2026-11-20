"""Shared constants for the Middle-earth map build.

Map coordinates ("map units", mu) used everywhere in this project:
  mx = easting  - X0      (0 at the west edge, grows east)
  my = YT - northing      (0 at the north edge, grows south)
Both range over [0, WORLD]. One map unit is one metre of the source (ME-DEM) projection,
but ME-DEM "kilometres" are really close to Tolkien's miles, so a real-world metre is
about MU_TO_M map units (see README, "Scale").
"""
X0 = -1000.05                    # west edge (UTM easting of the ME-DEM mosaic)
YT = 2001200.05                  # north edge (UTM northing)
SRC_N = 32257                    # 32k DEM mosaic size in pixels
SRC_PX = 62.033047090554         # map units per source pixel
WORLD = SRC_N * SRC_PX           # 2,001,000 mu square

SEA_V = 5590                     # raw DEM value of sea level (just above the 5584 terrace)
K_M = 0.06                       # metres of elevation per raw DEM unit (tunable, see README)
MU_TO_M = 1.609344               # 1 ME-DEM km is about 1 Tolkien mile

TILE = 256
PAD = 2                          # data tiles carry 2 px of their neighbours on every side
MAXZ = 6                         # deepest data zoom: 16384 px over the world, ~122 mu/px

# landcover classes stored in the C plane of terrain tiles (keep in sync with web/js/render-common.js)
C_OPEN, C_FOREST, C_FOREST_DARK, C_FOREST_GOLD, C_WETLAND, C_LAKE, C_SEA, C_VOLCANIC, C_STONE = range(9)


def to_map(x, y):
    return x - X0, YT - y
