"""Build the terrain data-tile pyramid used by the in-browser renderer.

Input : sources/dem_{nw,ne,sw,se}.tif (Arda 32k DEM, CC BY 4.0) + sources/vectors.gpkg (ME-GIS)
Output: web/tiles/terrain/{z}/{x}/{y}.js for z = 0..MAXZ

Each tile is (256 + 2*PAD)^2 samples, three planes:
  E int16  elevation in half metres above sea level; sea pixels hold -depth
  C uint8  landcover class (see common.py)
  D uint8  water depth in metres (lakes and sea, capped at 255)
E is coded with the LOCO-I/MED predictor, planes are split into bytes and deflated,
then base64-wrapped in a JS call so the map also works from file:// (no fetch needed).

Run (memory capped, low priority - the box is shared):
  systemd-run --user --scope -p MemoryMax=2500M nice -n 15 .venv/bin/python tools/build_terrain.py
"""
import base64
import os
import sys
import time
import zlib

import numpy as np
import tifffile
from PIL import Image, ImageDraw
from scipy import ndimage
from shapely.strtree import STRtree
from shapely.geometry import box

sys.path.insert(0, os.path.dirname(__file__))
from common import *  # noqa
from demreader import Mosaic
from gpkg import read_layer

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'sources')
OUT = os.path.join(ROOT, 'web', 'tiles', 'terrain')
TMP = os.path.join(ROOT, 'build_tmp')
GPKG = os.path.join(SRC, 'vectors.gpkg')
N6 = TILE << MAXZ


# ---------------------------------------------------------------- polygons
def load_polygons():
    """[(class, polygon in map units)] in paint order (later wins)."""
    from shapely.affinity import affine_transform
    T = [1, 0, 0, -1, -X0, YT]
    out = []

    def add(layer, cls_fn):
        for a, g in read_layer(GPKG, layer):
            if g is None:
                continue
            c = cls_fn(a)
            if c is None:
                continue
            for p in getattr(g, 'geoms', [g]):
                if not p.is_valid:
                    p = p.buffer(0)
                for q in getattr(p, 'geoms', [p]):
                    if q.geom_type == 'Polygon' and not q.is_empty:
                        out.append((c, affine_transform(q, T)))

    def forest(a):
        n = (a.get('name') or '')
        if a.get('type') == 'Forest Clearing':
            return None
        if 'Lothlorien' in n:
            return C_FOREST_GOLD
        if any(k in n for k in ('Mirkwood', 'Fangorn', 'Old Forest')):
            return C_FOREST_DARK
        return C_FOREST

    add('forests', forest)
    add('forests', lambda a: C_OPEN if a.get('type') == 'Forest Clearing' else None)
    add('Wetlands', lambda a: C_WETLAND)
    add('Stonefields', lambda a: C_STONE)
    add('Vulcanism', lambda a: C_VOLCANIC)
    add('lakes', lambda a: C_LAKE)
    return out


def raster_classes(polys, tree, x0, y0, scale, n):
    """Rasterize classes for an n x n grid whose pixel (0,0) centre is at (x0, y0) map units."""
    img = Image.new('L', (n, n), 0)
    d = ImageDraw.Draw(img)
    q = box(x0 - scale, y0 - scale, x0 + scale * (n + 1), y0 + scale * (n + 1))
    idx = sorted(tree.query(q))
    for i in idx:
        c, p = polys[i]

        def tr(coords):
            return [((x - x0) / scale + 0.5, (y - y0) / scale + 0.5) for x, y in coords]

        d.polygon(tr(p.exterior.coords), fill=c)
        for h in p.interiors:
            # holes are islands: back to open land (lakes) or clearings (forests)
            d.polygon(tr(h.coords), fill=C_OPEN)
    return np.asarray(img)


# ---------------------------------------------------------------- coarse global fields
def coarse_fields(polys):
    """Distance-to-shore and smoothed terrace bathymetry on a ~496 mu grid."""
    path = os.path.join(TMP, 'coarse.npz')
    if os.path.exists(path):
        f = np.load(path)
        return f['dist'], f['depth']
    print('coarse fields...', flush=True)
    q = {k: tifffile.TiffFile(f'{SRC}/dem_{k}.tif').series[0].levels[3].asarray() for k in ('nw', 'ne', 'sw', 'se')}
    n = 2016
    v = np.vstack([np.hstack([q['nw'][:n, :n], q['ne'][:n, :n]]), np.hstack([q['sw'][:n, :n], q['se'][:n, :n]])]).astype(np.float32)
    del q
    N = v.shape[0]
    scale = WORLD / N
    lakes = Image.new('L', (N, N), 0)
    d = ImageDraw.Draw(lakes)
    for c, p in polys:
        if c == C_LAKE:
            d.polygon([(x / scale, y / scale) for x, y in p.exterior.coords], fill=1)
    water = (v <= SEA_V) | (np.asarray(lakes) > 0)
    dist = ndimage.distance_transform_edt(water).astype(np.float32) * scale
    vs = np.where(v <= SEA_V, v, SEA_V)
    vs = ndimage.gaussian_filter(vs, 6)
    depth = terrace_depth(SEA_V - vs).astype(np.float32)
    np.savez(path, dist=dist, depth=depth)
    return dist, depth


def terrace_depth(draw):
    """Map raw-DEM depth below sea level (0..5590) to metres: a shallow shelf then the abyss."""
    r = np.clip(draw, 0, SEA_V) / SEA_V
    return 0.025 * np.clip(draw, 0, SEA_V) + 3200.0 * r ** 3


def bilinear(field, mx, my):
    N = field.shape[0]
    s = N / WORLD
    fx = np.clip(mx * s - 0.5, 0, N - 1.001)
    fy = np.clip(my * s - 0.5, 0, N - 1.001)
    x0 = fx.astype(int)
    y0 = fy.astype(int)
    tx = fx - x0
    ty = fy - y0
    a = field[y0, x0] * (1 - tx) + field[y0, x0 + 1] * tx
    b = field[y0 + 1, x0] * (1 - tx) + field[y0 + 1, x0 + 1] * tx
    return a * (1 - ty) + b * ty


# ---------------------------------------------------------------- level MAXZ from the DEM
def build_max_level(mosaic, polys, tree, dist, tdepth):
    E = np.lib.format.open_memmap(os.path.join(TMP, f'E{MAXZ}.npy'), 'w+', np.int16, (N6, N6))
    C = np.lib.format.open_memmap(os.path.join(TMP, f'C{MAXZ}.npy'), 'w+', np.uint8, (N6, N6))
    D = np.lib.format.open_memmap(os.path.join(TMP, f'D{MAXZ}.npy'), 'w+', np.uint8, (N6, N6))
    scale = WORLD / N6           # map units per output pixel
    r = scale / SRC_PX           # source pixels per output pixel (~1.97)
    t0 = time.time()
    ntiles = 1 << MAXZ
    for ty in range(ntiles):
        for tx in range(ntiles):
            j = np.arange(TILE) + tx * TILE
            i = np.arange(TILE) + ty * TILE
            mx = (j + 0.5) * scale
            my = (i + 0.5) * scale
            # box-filtered resample: average 3x3 bilinear sub-samples over the pixel footprint
            sx = mx / SRC_PX - 0.5
            sy = my / SRC_PX - 0.5
            c0 = int(np.floor(sx[0] - r)) - 1
            r0 = int(np.floor(sy[0] - r)) - 1
            c1 = int(np.ceil(sx[-1] + r)) + 2
            r1 = int(np.ceil(sy[-1] + r)) + 2
            win = mosaic.read(r0, r1, c0, c1).astype(np.float32)
            acc = np.zeros((TILE, TILE), np.float32)
            mn = np.full((TILE, TILE), 1e9, np.float32)
            for oy in (-r / 3, 0, r / 3):
                for ox in (-r / 3, 0, r / 3):
                    fx = sx + ox - c0
                    fy = sy + oy - r0
                    x0 = np.floor(fx).astype(int)
                    y0 = np.floor(fy).astype(int)
                    wx = (fx - x0)[None, :]
                    wy = (fy - y0)[:, None]
                    a = win[np.ix_(y0, x0)] * (1 - wx) + win[np.ix_(y0, x0 + 1)] * wx
                    b = win[np.ix_(y0 + 1, x0)] * (1 - wx) + win[np.ix_(y0 + 1, x0 + 1)] * wx
                    s = a * (1 - wy) + b * wy
                    acc += s
                    mn = np.minimum(mn, s)
            v = acc / 9
            MX, MY = np.meshgrid(mx, my)
            cls = raster_classes(polys, tree, mx[0], my[0], scale, TILE).copy()
            sea = v <= SEA_V
            elev = (v - SEA_V) * K_M
            dshore = bilinear(dist, MX, MY)
            dt = bilinear(tdepth, MX, MY)
            sdepth = np.maximum(0.8, np.minimum(dt, 1.0 + 0.0045 * dshore))
            ldepth = np.clip(1.0 + 0.0025 * dshore, 1, 80)
            lake = cls == C_LAKE
            # lakes drawn over sea stay sea; sea wins
            cls[sea] = C_SEA
            e = np.where(sea, -sdepth, np.maximum(elev, 0.5))
            dd = np.where(sea, np.minimum(sdepth, 255), np.where(lake, ldepth, 0))
            sl = np.s_[ty * TILE:(ty + 1) * TILE, tx * TILE:(tx + 1) * TILE]
            E[sl] = np.clip(np.round(e * 2), -32767, 32767).astype(np.int16)
            C[sl] = cls
            D[sl] = np.round(dd).astype(np.uint8)
        el = time.time() - t0
        print(f'  row {ty + 1}/{ntiles}  {el:.0f}s', flush=True)
    E.flush(); C.flush(); D.flush()
    return E, C, D


# ---------------------------------------------------------------- pyramid + encoding
def downsample(E, C, D):
    n = E.shape[0] // 2
    E2 = np.empty((n, n), np.int16)
    C2 = np.empty((n, n), np.uint8)
    D2 = np.empty((n, n), np.uint8)
    step = 1024
    for r in range(0, n, step):
        e = E[2 * r:2 * (r + step)].astype(np.int32)
        E2[r:r + step] = ((e[0::2, 0::2] + e[1::2, 0::2] + e[0::2, 1::2] + e[1::2, 1::2]) // 4).astype(np.int16)
        d = D[2 * r:2 * (r + step)].astype(np.int32)
        D2[r:r + step] = ((d[0::2, 0::2] + d[1::2, 0::2] + d[0::2, 1::2] + d[1::2, 1::2]) // 4).astype(np.uint8)
        c = C[2 * r:2 * (r + step)]
        q = [c[0::2, 0::2], c[1::2, 0::2], c[0::2, 1::2], c[1::2, 1::2]]
        best = q[0].copy()
        bestn = np.zeros(best.shape, np.int8)
        for cand in q:  # majority vote among the 4 children (first wins ties)
            cnt = sum((cand == o).astype(np.int8) for o in q)
            upd = cnt > bestn
            best[upd] = cand[upd]
            bestn[upd] = cnt[upd]
        C2[r:r + step] = best
    return E2, C2, D2


def med_residual(q):
    q = q.astype(np.int32)
    a = np.zeros_like(q); a[:, 1:] = q[:, :-1]
    b = np.zeros_like(q); b[1:, :] = q[:-1, :]
    c = np.zeros_like(q); c[1:, 1:] = q[:-1, :-1]
    mx = np.maximum(a, b)
    mn = np.minimum(a, b)
    p = np.where(c >= mx, mn, np.where(c <= mn, mx, a + b - c))
    return (q - p).astype(np.int16)


def write_level(z, E, C, D):
    n = 1 << z
    S = TILE + 2 * PAD
    total = 0
    for ty in range(n):
        for tx in range(n):
            rows = np.clip(np.arange(ty * TILE - PAD, ty * TILE + TILE + PAD), 0, E.shape[0] - 1)
            cols = np.clip(np.arange(tx * TILE - PAD, tx * TILE + TILE + PAD), 0, E.shape[1] - 1)
            e = E[np.ix_(rows, cols)]  # rows/cols are clamped at the world edge
            c = C[np.ix_(rows, cols)]
            d = D[np.ix_(rows, cols)]
            res = med_residual(e).astype('<i2').view(np.uint8).reshape(S, S, 2)
            payload = res[..., 0].tobytes() + res[..., 1].tobytes() + c.tobytes() + d.tobytes()
            blob = zlib.compress(payload, 9)
            b64 = base64.b64encode(blob).decode()
            folder = os.path.join(OUT, str(z), str(tx))
            os.makedirs(folder, exist_ok=True)
            with open(os.path.join(folder, f'{ty}.js'), 'w') as f:
                f.write(f'MEterrain("{z}/{tx}/{ty}","{b64}");\n')
            total += len(b64)
    print(f'  z{z}: {n * n} tiles, {total / 1e6:.1f} MB', flush=True)


def main():
    os.makedirs(TMP, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    polys = load_polygons()
    tree = STRtree([p for _, p in polys])
    print(len(polys), 'polygons', flush=True)
    dist, tdepth = coarse_fields(polys)
    mpath = os.path.join(TMP, f'E{MAXZ}.npy')
    if os.path.exists(mpath) and '--reuse' in sys.argv:
        E = np.load(mpath, mmap_mode='r')
        C = np.load(os.path.join(TMP, f'C{MAXZ}.npy'), mmap_mode='r')
        D = np.load(os.path.join(TMP, f'D{MAXZ}.npy'), mmap_mode='r')
    else:
        E, C, D = build_max_level(Mosaic(SRC), polys, tree, dist, tdepth)
    write_level(MAXZ, E, C, D)
    for z in range(MAXZ - 1, -1, -1):
        E, C, D = downsample(E, C, D)
        write_level(z, E, C, D)


if __name__ == '__main__':
    main()
