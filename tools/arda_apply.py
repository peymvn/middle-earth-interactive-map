"""Turn the Encyclopedia of Arda comparison (tools/arda_compare.py) into map data: web/data/arda.js.

  * places named on Arda's maps that we don't have yet are added at their estimated position, with a
    type from Arda's place categories and a link to the Arda entry (no text is copied from Arda);
  * places we positioned by hand ("curated-km") that Arda puts elsewhere are listed as `moves`,
    applied by app.js. Places that come from ME-GIS stay put (they agree with our terrain), but the
    disagreement is recorded in sources/arda-ref/report.md.

Run: python3 tools/arda_compare.py && .venv/bin/python tools/arda_apply.py
"""
import glob
import json
import os
import re
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from common import MAXZ, WORLD  # noqa

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
REF = os.path.join(ROOT, 'sources', 'arda-ref')
CATS = ['placciti', 'placfiel', 'placfore', 'plachill', 'placisla', 'placland', 'placrive', 'placseas', 'placothe']
MOVE_KM = 6          # hand-placed places further than this from Arda's estimate get moved
SKIP_NAME = re.compile(r'\b(road|way|path|stair|wall|dike|great river)\b', re.I)


def category(slug):
    f = os.path.join(REF, 'pages', slug.replace('/', '_', 1))
    if not os.path.exists(f):
        return None
    s = open(f, encoding='latin-1').read()
    counts = {c: len(re.findall(c + r'\.html', s)) for c in CATS}
    base = min(counts.values())           # the navigation links every category the same number of times
    c, n = max(counts.items(), key=lambda kv: kv[1])
    return c if n > base else None


def kind(cat, name, shape):
    n = name.lower()
    if cat == 'placciti':
        if re.search(r'gate|door', n): return 'landmark'
        if re.search(r'bridge', n): return 'bridge'
        if re.search(r'tower|hold|fort|burg|keep|citadel', n): return 'fortress'
        if re.search(r'inn|house|hall|hill$|smial|hole|end$', n): return 'landmark'
        return 'village'
    if cat == 'plachill':
        return 'peak' if re.match(r'(amon|mount|mt|dol|tol|ras|caradhras|celebdil|fanuidhol)\b', n) or ' ' not in n else 'hills'
    if cat == 'placrive':
        if re.search(r'ford|undeep|crossing|ferry|wade', n): return 'ford'
        if re.search(r'wang|fleet|swamp|bog', n): return 'marsh'
        if re.search(r'weir|reach|pool|mere', n): return 'landmark' if 'pool' not in n and 'mere' not in n else 'lake'
        if re.search(r'falls|mouths|marsh|fen', n): return 'marsh' if 'marsh' in n or 'fen' in n else 'landmark'
    return {'placfiel': 'area', 'placfore': 'forest', 'placisla': 'island', 'placland': 'area',
            'placrive': 'lake' if re.search(r'lake|mere|pool|nen |sea|water$', n) else 'river',
            'placseas': 'sea', 'placothe': 'landmark'}.get(cat)


def zoom_for(mi_per_px, t=None):
    """Our zoom level whose scale matches an Arda map of this scale (z0 = 7.816 mi/px)."""
    import math
    return int(max(3, min(12, math.floor(math.log2(7.816 / max(mi_per_px, 0.005))))))


POINT = {'village', 'town', 'city', 'haven', 'landmark', 'bridge', 'ford', 'fortress', 'inn', 'cave', 'peak', 'mountain', 'ruin', 'island', 'beacon'}


def trusted(r):
    # confirmed by a second map, or from a tight fit with several anchors
    return r['support'] >= 1 or (r['fit_rms_km'] < 4 and r['anchors'] >= 4)


def lev(a, b):
    if abs(len(a) - len(b)) > 2:
        return 9
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def duplicate(name, x, y, ours):
    """Same place under a variant spelling ('Bindbole'/'Bindbale', 'Falls of Rauros'/'Rauros')."""
    from arda_compare import norm
    n = norm(name)
    for k, o in ours.items():
        if len(k) >= 5 and (k in n or n in k):
            return True
        if len(n) >= 6 and lev(n, k) <= 2 and abs(o['x'] - x) < 40000 and abs(o['y'] - y) < 40000:
            return True
    return False


def main():
    d = json.load(open(os.path.join(REF, 'compare.json')))
    E = np.load(os.path.join(ROOT, 'build_tmp', f'E{MAXZ}.npy'), mmap_mode='r')
    N = E.shape[0]

    def height(x, y):
        if not (0 <= x < WORLD and 0 <= y < WORLD):
            return None
        return float(E[int(y / WORLD * N), int(x / WORLD * N)]) / 2

    from arda_compare import our_places
    ours = our_places()
    add, moves, skipped = [], [], {}
    for r in d['places']:
        x, y = r['arda_km'][0] * 1000, r['arda_km'][1] * 1000
        if r['ours_km'] is None:
            cat = category(r['slug'])
            t = kind(cat, r['name'], r['shape']) if cat else None
            why = None
            if not t: why = 'not a place'
            elif SKIP_NAME.search(r['name']): why = 'linear feature'
            elif t == 'river' and r['shape'] != 'poly': why = 'river label'
            elif t == 'river': why = 'river (labelled along our rivers)'
            elif not trusted(r) or (r['fit_rms_km'] > 8 and t not in ('area', 'sea', 'forest')): why = 'weak fit'
            elif duplicate(r['name'], x, y, ours): why = 'variant of a name we have'
            else:
                h = height(x, y)
                if h is None and t not in ('sea', 'island'): why = 'outside map'
                elif h is not None and h <= 0 and t not in ('sea', 'island', 'lake'): why = 'in the sea (drowned / First Age)'
            if why:
                skipped.setdefault(why, []).append(r['name'])
                continue
            add.append({'name': r['name'], 'km': r['arda_km'], 'type': t, 'z': zoom_for(r['coarsest_mi_per_px']),
                        'arda': 'https://www.encyclopedia-of-arda.com/' + r['slug']})
        elif (r['ours_src'] == 'curated-km' and MOVE_KM < r['dist_km'] < 40 and r['ours_kind'] in POINT
              and r['shape'] != 'poly' and trusted(r) and (height(x, y) or 0) > 0):
            moves.append({'name': r['name'], 'from': r['ours_km'], 'km': r['arda_km'], 'dist': r['dist_km']})
    links = {r['name']: {'url': 'https://www.encyclopedia-of-arda.com/' + r['slug'], 'z': zoom_for(r['coarsest_mi_per_px'])}
             for r in d['places'] if r['ours_km']}
    out = os.path.join(ROOT, 'web', 'data', 'arda.js')
    with open(out, 'w', encoding='utf-8') as f:
        f.write('// Generated by tools/arda_apply.py from the Encyclopedia of Arda map comparison (positions only;\n'
                '// no text or images copied). places: extra labels; moves: corrected hand-placed positions;\n'
                '// links: our place name -> Arda entry.\n')
        f.write('window.ME_ARDA = ' + json.dumps({'places': add, 'moves': moves, 'links': links}, ensure_ascii=False, indent=0) + ';\n')
    print(f'added {len(add)}, moves {len(moves)}, links {len(links)}')
    for k, v in skipped.items():
        print(f'  skipped {len(v)} ({k}): {", ".join(v[:12])}{"…" if len(v) > 12 else ""}')
    for m in moves:
        print('  move', m)


if __name__ == '__main__':
    main()
