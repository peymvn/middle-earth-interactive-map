"""Export ME-GIS vector layers to web/data/vectors.js (map units, integers).

Rivers get a width from their upstream drainage: the river network is turned into a
directed graph (downhill, using the terrain build's elevation grid), upstream length is
accumulated, and width = 3 + 4*sqrt(upstream km) map units, so the Anduin ends up ~600 mu
wide at its mouth and small streams ~10 mu.

Run after build_terrain.py (needs build_tmp/E6.npy):
  .venv/bin/python tools/build_vectors.py
"""
import json
import os
import sys
from collections import defaultdict

import numpy as np
from shapely.affinity import affine_transform

sys.path.insert(0, os.path.dirname(__file__))
from common import *  # noqa
from gpkg import read_layer

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
GPKG = os.path.join(ROOT, 'sources', 'vectors.gpkg')
OUT = os.path.join(ROOT, 'web', 'data', 'vectors.js')
T = [1, 0, 0, -1, -X0, YT]

# The source DBF text lost some accented letters (stored as U+FFFD). Restore known names.
FIX = {
    'Khazad-d�m': 'Khazad-dûm', 'Amr�n': 'Amrûn', 'Barad-d�r': 'Barad-dûr',
    'Carn D�m': 'Carn Dûm', 'Amon S�l': 'Amon Sûl', 'Ann�minas': 'Annúminas',
    'Dr�adan Forest': 'Drúadan Forest', 'Lothlorien': 'Lothlórien', 'Angs�l': 'Angsûl',
    'Shad�n': 'Shadûn', 'Amr�naur': 'Amrûnaur', 'L�most': 'Lómost', 'Er�das': 'Erûdas',
    'Cald�r': 'Caldûr', 'Mar�s': 'Marûs', 'Ard�mir': 'Ardûmir', 'Minas D�rlith': 'Minas Dûrlith',
    'S�rathondost': 'Sûrathondost', 'Lar-H�z': 'Lar-Hûz', 'Ost-in-Edhil': 'Ost-in-Edhil',
}

FIX.update({
    'Khazad D\ufffdm': 'Khazad-dûm', 'Amon D\ufffdn': 'Amon Dîn', 'Ud\ufffdn': 'Udûn', 'L\ufffdrien': 'Lórien',
    'An\ufffdrien': 'Anórien', 'Dr\ufffdwaith Iaur': 'Drúwaith Iaur', 'R. Lh\ufffdn': 'R. Lhûn',
    'R. Gwathl\ufffd': 'R. Gwathló', 'R. Onodl\ufffd': 'R. Onodló', 'R. Ringl\ufffd': 'R. Ringló',
    'R. S\ufffdr Ninglor': 'R. Sîr Ninglor', 'Haudh-in-Gwan\ufffdr': 'Haudh-in-Gwanûr',
    'Tiauar-in-Dr\ufffdedain': 'Tawar-in-Drúedain', 'Sea of Rh\ufffdn': 'Sea of Rhûn', 'Sea of N\ufffdrnen': 'Sea of Núrnen',
    'R. G\ufffdlduin': 'R. Galduin', 'Henneth Arnen': 'Henneth Annûn', 'Trollsahws': 'Trollshaws',
})


def fix(n):
    if not n:
        return n
    return FIX.get(n, n.replace('�', 'u'))


def lines(layer):
    for a, g in read_layer(GPKG, layer):
        if g is None:
            continue
        g = affine_transform(g, T)
        for ls in getattr(g, 'geoms', [g]):
            yield a, ls


def flat(ls, tol):
    s = ls.simplify(tol, preserve_topology=False)
    out = []
    for x, y in s.coords:
        out += [int(round(x)), int(round(y))]
    return out


def main():
    E = np.load(os.path.join(ROOT, 'build_tmp', f'E{MAXZ}.npy'), mmap_mode='r')
    N = E.shape[0]

    def elev(x, y):
        c = min(max(int(x / WORLD * N), 0), N - 1)
        r = min(max(int(y / WORLD * N), 0), N - 1)
        win = np.asarray(E[max(r - 1, 0):r + 2, max(c - 1, 0):c + 2], np.float32)
        return win.min() / 2

    # ---- rivers: build drainage graph
    riv = []
    for a, ls in lines('Rivers'):
        if ls.length < 1:
            continue
        p0, p1 = ls.coords[0], ls.coords[-1]
        if elev(*p0[:2]) < elev(*p1[:2]):  # flow downhill
            ls = type(ls)(list(ls.coords)[::-1])
        riv.append((a, ls))
    # each river flows into the nearest other river near its downstream end (tributaries usually
    # join in the middle of the main stem, not at its vertices)
    from shapely.strtree import STRtree
    from shapely.geometry import Point
    geoms = [ls for _, ls in riv]
    tree = STRtree(geoms)
    parent = [-1] * len(riv)
    children = defaultdict(list)
    for i, ls in enumerate(geoms):
        end = Point(ls.coords[-1][:2])
        best, bd = -1, 600.0
        for j in tree.query(end.buffer(600)):
            if j == i:
                continue
            d = geoms[j].distance(end)
            if d < bd:
                best, bd = j, d
        if best >= 0:
            parent[i] = best
            t = geoms[best].project(end, normalized=True)
            children[best].append((i, t))
    memo = {}

    def up_total(i, seen=()):
        if i in memo:
            return memo[i]
        if i in seen:
            return 0.0
        tot = geoms[i].length / 1000 + sum(up_total(c, seen + (i,)) for c, _ in children[i])
        memo[i] = tot
        return tot

    MAJOR = {'Anduin': 420, 'Baranduin': 90, 'Gwathló': 160, 'Lune': 140, 'Isen': 60, 'Entwash': 60, 'Celduin': 90,
             'Carnen': 70, 'Harnen': 60, 'Mitheithel': 70, 'Bruinen': 45, 'Forest River': 45, 'Poros': 45, 'Limlight': 45}
    rivers = []
    for i, (a, ls) in enumerate(riv):
        tot = up_total(i)
        start_up = sum(up_total(c) for c, t in children[i] if t < 0.05)
        name = fix(a.get('name'))
        w0 = 3 + 4 * np.sqrt(max(start_up, 0.5))
        w1 = 3 + 4 * np.sqrt(max(tot, 0.5))
        if a.get('type') == 'Stream':
            w0, w1 = min(w0, 40), min(w1, 40)
        if name in MAJOR:
            w0, w1 = max(w0, MAJOR[name] * 0.7), max(w1, MAJOR[name])
        rivers.append({'n': name, 'w': [round(w0, 1), round(w1, 1)], 'p': flat(ls, 15)})
    print('rivers', len(rivers), 'max width', max(r['w'][1] for r in rivers))

    # ---- roads
    roads = []
    rw = {'PRIMARY': 1, 'SECONDARY': 2, 'TERTIARY': 3}
    for a, ls in lines('Roads'):
        if ls.length < 1:
            continue
        roads.append({'n': fix(a.get('name')), 'c': rw.get(a.get('type'), 3), 'p': flat(ls, 15)})
    print('roads', len(roads))

    # ---- settlements & sites (points)
    sites = []

    def pts(layer, kind, name_key='name', type_key=None):
        for a, g in read_layer(GPKG, layer):
            if g is None:
                continue
            x, y = g.x - X0, YT - g.y
            t = a.get(type_key) if type_key else None
            sites.append({'k': kind if not t else t.lower(), 'n': fix(a.get(name_key) or a.get('NAME')),
                          'x': int(round(x)), 'y': int(round(y)), 'o': a.get('origin') or a.get('ORIGIN')})

    pts('Cities', 'city', 'name', 'type')
    pts('Towns', 'town', 'name', 'type')
    pts('Citadels', 'citadel', 'name')
    pts('Towers_and_Keeps', 'tower', 'NAME')
    pts('Hamlets', 'hamlet', 'name')
    pts('Beacons', 'beacon', 'name')
    print('sites', len(sites))

    # ---- natural-feature labels (rivers, seas, mountains, forests, regions...)
    labels = []
    for a, g in read_layer(GPKG, 'Combined_Placenames'):
        if g is None or not a.get('NAME'):
            continue
        labels.append({'l': a['LAYER'].replace('Names', ''), 'n': fix(a['NAME']),
                       'x': int(round(g.x - X0)), 'y': int(round(YT - g.y)),
                       'a': a.get('FONT_ANGLE') or 0, 'h': a.get('FONT_HT_M') or 0})
    for layer in ('Mountains', 'Regions'):
        for a, ls in lines(layer):
            c = ls.interpolate(0.5, normalized=True)
            p0, p1 = ls.coords[0], ls.coords[-1]
            ang = float(np.degrees(np.arctan2(p1[1] - p0[1], p1[0] - p0[0])))
            if ang > 90: ang -= 180
            if ang < -90: ang += 180
            labels.append({'l': 'Range' if layer == 'Mountains' else 'Region', 'n': fix(a['name']),
                           'x': int(c.x), 'y': int(c.y), 'a': round(ang, 1), 'h': a.get('fontsizeKm') or 0,
                           'p': flat(ls, 500)})
    print('labels', len(labels))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    data = {'world': WORLD, 'rivers': rivers, 'roads': roads, 'sites': sites, 'labels': labels}
    with open(OUT, 'w') as f:
        f.write('// Generated by tools/build_vectors.py from ME-GIS - do not edit by hand.\n')
        f.write('window.ME_VECTORS = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')


if __name__ == '__main__':
    main()
