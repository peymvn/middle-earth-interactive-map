"""Tiny GeoPackage reader (no GDAL needed): yields (attrs, shapely geometry)."""
import sqlite3, struct
from shapely import wkb

ENV_BYTES = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}


def _text(v):
    if isinstance(v, bytes):
        try:
            return v.decode('utf-8')
        except UnicodeDecodeError:
            return v.decode('latin-1')
    return v


def parse_geom(blob):
    if blob is None:
        return None
    flags = blob[3]
    env = ENV_BYTES[(flags >> 1) & 7]
    return wkb.loads(bytes(blob[8 + env:]))


def read_layer(path, table):
    con = sqlite3.connect(path)
    con.text_factory = bytes
    cols = [r[1].decode() for r in con.execute(f'pragma table_info("{table}")')]
    gcol = con.execute("select column_name from gpkg_geometry_columns where table_name=?",
                       (table,)).fetchone()[0].decode()
    for row in con.execute(f'select * from "{table}"'):
        attrs = {c: _text(v) for c, v in zip(cols, row) if c != gcol}
        yield attrs, parse_geom(row[cols.index(gcol)])


def layers(path):
    con = sqlite3.connect(path)
    return [r[0] for r in con.execute("select table_name from gpkg_contents where data_type='features'")]
