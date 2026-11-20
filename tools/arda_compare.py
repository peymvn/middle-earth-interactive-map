"""Compare our places with the regional maps of the Encyclopedia of Arda (encyclopedia-of-arda.com).

Arda's maps are HTML image maps: every label on a map is a clickable <AREA> with pixel coordinates
and a link to the entry it names. For each map we
  1. match its labels to places we already have (same name, accents and case ignored),
  2. fit a north-up similarity transform (scale + offset) from map pixels to our map units with
     RANSAC, so a few mismatched or moved labels don't spoil the fit,
  3. estimate every other label's position in our coordinates. The fit is corrected locally by
     inverse-distance weighting of the anchors' residuals, so estimates agree with nearby places
     we already trust (and therefore with our terrain).
Per place, the estimate from the most detailed map (fewest map units per pixel) wins.

Outputs (sources/arda-ref/, gitignored: Arda's maps are copyrighted, we only use them as a reference):
  compare.json  : per place: ours, Arda estimate, distance, map used
  report.md     : human-readable list of disagreements and places we are missing
The curated fixes that came out of this live in web/data/places.js (see README, "Checking against
the Encyclopedia of Arda").

Run: python3 tools/arda_compare.py   (stdlib + node; needs the crawl in sources/arda-ref/pages)
"""
import glob
import html
import json
import math
import os
import random
import re
import subprocess
import unicodedata

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
REF = os.path.join(ROOT, 'sources', 'arda-ref')


def norm(s):
    s = unicodedata.normalize('NFD', html.unescape(s or ''))
    s = ''.join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r'^(the|r\.|river|mount|mt\.?) ', '', s)
    return re.sub(r'[^a-z0-9]+', '', s)


def entry_names():
    """slug ('m/minastirith.html') -> display name, from the maps index page."""
    s = open(os.path.join(REF, 'maps_index.html'), encoding='latin-1').read()
    out = {}
    for href, name in re.findall(r'<a href="(?:\.\./)?([a-z]/[^"#]+\.html)"[^>]*>([^<]+)</a>', s):
        out.setdefault(href, html.unescape(name).strip())
    return out


def parse_pages():
    """-> maps: {map_name: {'img': url, 'areas': {slug: (u, v, shape)}}}, page_maps: {slug: [map names]}"""
    maps, page_maps = {}, {}
    for f in sorted(glob.glob(os.path.join(REF, 'pages', '*.html'))):
        slug = os.path.basename(f).replace('_', '/', 1)
        s = open(f, encoding='latin-1').read()
        if '429 Too Many' in s:
            continue
        imgs, widths = {}, {}
        for tag in re.findall(r'<img[^>]+>', s, re.I):
            src = re.search(r'src="(?:\.\./)?(maps/[^"]+)"', tag, re.I)
            um = re.search(r'usemap="#([^"]+)"', tag, re.I)
            if src and um:
                imgs[um.group(1)] = src.group(1)
                w = re.search(r'width="?(\d+)', tag, re.I)
                if w:
                    widths[um.group(1)] = int(w.group(1))   # image-map coords are in displayed pixels
        for m in re.finditer(r'<MAP NAME="([^"]+)">(.*?)</MAP>', s, re.S | re.I):
            name, body = m.group(1), m.group(2)
            mp = maps.setdefault(name, {'img': imgs.get(name), 'w': widths.get(name), 'areas': {}})
            if not mp['img'] and imgs.get(name):
                mp['img'] = imgs[name]
            page_maps.setdefault(slug, []).append(name)
            for a in re.finditer(r'<AREA([^>]+)>', body, re.I):
                attrs = a.group(1)
                shape = (re.search(r'SHAPE=\"?(\w+)', attrs, re.I) or [None, 'rect'])[1].lower()
                coords = re.search(r'COORDS="([^"]+)"', attrs, re.I)
                href = re.search(r'HREF="?(?:\.\./)?([a-z]/[^"\s>#]+\.html)', attrs, re.I)
                if not coords or not href:
                    continue
                c = [float(x) for x in re.findall(r'-?\d+(?:\.\d+)?', coords.group(1))]
                if shape.startswith('rect') and len(c) >= 4:
                    u, v = (c[0] + c[2]) / 2, (c[1] + c[3]) / 2
                elif shape.startswith('circ') and len(c) >= 3:
                    u, v = c[0], c[1]
                elif len(c) >= 4:
                    u, v = sum(c[0::2]) / len(c[0::2]), sum(c[1::2]) / len(c[1::2])
                else:
                    continue
                mp['areas'].setdefault(href.group(1), (u, v, 'poly' if shape.startswith('poly') else shape))
    return maps, page_maps


def our_places():
    """norm(name) -> {name, x, y, kind, src} from places.js + ME-GIS vectors (via node)."""
    js = r"""
      global.window = {};
      require('%s/web/data/vectors.js'); require('%s/web/data/places.js');
      console.log(JSON.stringify({V: window.ME_VECTORS, P: window.ME_PLACES}));
    """ % (ROOT, ROOT)
    d = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
    V, P = d['V'], d['P']
    sites = {s['n']: s for s in V['sites'] if s.get('n')}
    labels = {l['n']: l for l in V['labels']}
    out = {}

    def put(name, x, y, kind, src, point):
        k = norm(name)
        if k and k not in out:
            out[k] = {'name': name, 'x': x, 'y': y, 'kind': kind, 'src': src, 'point': point}

    pointy = {'city', 'town', 'village', 'haven', 'fortress', 'citadel', 'tower', 'ruin', 'peak', 'mountain', 'landmark',
              'bridge', 'ford', 'inn', 'cave', 'beacon', 'island'}
    for p in P:
        if p.get('km'):
            x, y, src = p['km'][0] * 1000, p['km'][1] * 1000, 'curated-km'
        elif p.get('site') in sites:
            x, y, src = sites[p['site']]['x'], sites[p['site']]['y'], 'gis-site'
        elif p.get('label') in labels:
            x, y, src = labels[p['label']]['x'], labels[p['label']]['y'], 'gis-label'
        else:
            continue
        for n in [p['name']] + [a.strip() for a in (p.get('aka') or '').split('·') if a.strip()]:
            put(n, x, y, p['type'], src, p['type'] in pointy)
    for s in V['sites']:
        if s.get('n') and s.get('o') != 'MERP':
            put(s['n'], s['x'], s['y'], s['k'], 'gis-site', True)
    for l in V['labels']:
        put(re.sub(r'^R\. ', '', l['n']), l['x'], l['y'], l['l'], 'gis-label', l['l'] in ('City', 'Town', 'Village', 'Citadel', 'TowersandKeeps', 'Beacon', 'Ruin', 'Island'))
    return out


def fit(pairs):
    """pairs: [(u, v, x, y)] -> (a, tx, ty, inliers). x = a*u + tx, y = a*v + ty. RANSAC."""
    rnd = random.Random(1)
    best = None
    n = len(pairs)
    for _ in range(400 if n > 3 else 60):
        i, j = rnd.sample(range(n), 2)
        (u1, v1, x1, y1), (u2, v2, x2, y2) = pairs[i], pairs[j]
        du = math.hypot(u2 - u1, v2 - v1)
        if du < 25:
            continue
        a = math.hypot(x2 - x1, y2 - y1) / du
        if a <= 0:
            continue
        # north-up check: direction must agree
        if (x2 - x1) * (u2 - u1) + (y2 - y1) * (v2 - v1) <= 0:
            continue
        tx, ty = x1 - a * u1, y1 - a * v1
        tol = a * 22 + 3000
        inl = [k for k, (u, v, x, y) in enumerate(pairs) if math.hypot(a * u + tx - x, a * v + ty - y) < tol]
        if not best or len(inl) > len(best[3]):
            best = (a, tx, ty, inl)
    if not best or len(best[3]) < 3:
        return None
    # least squares on inliers
    P = [pairs[k] for k in best[3]]
    mu = sum(p[0] for p in P) / len(P); mv = sum(p[1] for p in P) / len(P)
    mx = sum(p[2] for p in P) / len(P); my = sum(p[3] for p in P) / len(P)
    num = sum((p[0] - mu) * (p[2] - mx) + (p[1] - mv) * (p[3] - my) for p in P)
    den = sum((p[0] - mu) ** 2 + (p[1] - mv) ** 2 for p in P)
    a = num / den
    return a, mx - a * mu, my - a * mv, best[3]


def main():
    names = entry_names()
    maps, page_maps = parse_pages()
    ours = our_places()
    print(len(maps), 'maps,', sum(len(m['areas']) for m in maps.values()), 'labels,', len(ours), 'of our names')
    est = {}       # slug -> best estimate
    fits = {}
    for mname, mp in maps.items():
        pairs, keys = [], []
        for slug, (u, v, shape) in mp['areas'].items():
            o = ours.get(norm(names.get(slug, '')))
            if o and o['point'] and shape != 'poly':
                pairs.append((u, v, o['x'], o['y'])); keys.append(slug)
        if len(pairs) < 3:
            continue
        f = fit(pairs)
        if not f:
            continue
        a, tx, ty, inl = f
        res = [(pairs[k][0], pairs[k][1], pairs[k][2] - (a * pairs[k][0] + tx), pairs[k][3] - (a * pairs[k][1] + ty)) for k in inl]
        rms = math.sqrt(sum(r[2] ** 2 + r[3] ** 2 for r in res) / len(res))
        fits[mname] = {'a': a, 'tx': tx, 'ty': ty, 'anchors': len(inl), 'rms_km': rms / 1000, 'img': mp['img'], 'w': mp.get('w')}
        if rms > a * 30 + 15000:   # fit too loose to trust
            continue
        us = [r[0] for r in res]; vs = [r[1] for r in res]
        mu_, mv_ = (max(us) - min(us)) * 0.25 + 30, (max(vs) - min(vs)) * 0.25 + 30
        box = (min(us) - mu_, min(vs) - mv_, max(us) + mu_, max(vs) + mv_)
        for slug, (u, v, shape) in mp['areas'].items():
            # labels far outside the anchored part of a map are often edge pointers ("to Bree ->")
            inside = box[0] <= u <= box[2] and box[1] <= v <= box[3]
            x, y = a * u + tx, a * v + ty
            # local correction from anchor residuals (inverse distance weighted, in map pixels)
            wsum = rx = ry = 0
            for (au, av, dx, dy) in res:
                d2 = (au - u) ** 2 + (av - v) ** 2 + 400
                w = 1 / d2
                wsum += w; rx += w * dx; ry += w * dy
            x += rx / wsum; y += ry / wsum
            est.setdefault(slug, []).append({'x': x, 'y': y, 'map': mname, 'a': a, 'shape': shape, 'anchors': len(inl), 'rms_km': rms / 1000, 'inside': inside})
    rows = []
    for slug, cands in est.items():
        # pick the estimate most other maps agree with (then the most detailed); a detailed local map
        # can still be wrong when the label is an edge pointer ("to Brandywine Bridge ->")
        def agree(c):
            return sum(1 for o in cands if o is not c and math.hypot(o['x'] - c['x'], o['y'] - c['y']) < max(5000, o['a'] * 25, c['a'] * 25))
        for c in cands:
            c['agree'] = agree(c)
        cands.sort(key=lambda c: (not c['inside'], -c['agree'], c['a']))
        e = cands[0]
        support = e['agree']
        name = names.get(slug, slug)
        o = ours.get(norm(name))
        rows.append({'slug': slug, 'name': name, 'arda_km': [round(e['x'] / 1000, 1), round(e['y'] / 1000, 1)],
                     'map': e['map'], 'map_mi_per_px': round(e['a'] / 1000, 3), 'shape': e['shape'],
                     'maps': len(cands), 'support': support,
                     'coarsest_mi_per_px': round(max(c['a'] for c in cands if c['inside'] or len(cands) == 1) / 1000 if any(c['inside'] for c in cands) else e['a'] / 1000, 3), 'fit_rms_km': round(e['rms_km'], 1), 'anchors': e['anchors'],
                     'ours_km': [round(o['x'] / 1000, 1), round(o['y'] / 1000, 1)] if o else None,
                     'ours_src': o['src'] if o else None, 'ours_kind': o['kind'] if o else None,
                     'dist_km': round(math.hypot(o['x'] - e['x'], o['y'] - e['y']) / 1000, 1) if o else None})
    json.dump({'fits': fits, 'places': rows}, open(os.path.join(REF, 'compare.json'), 'w'), indent=1, ensure_ascii=False)
    with open(os.path.join(REF, 'report.md'), 'w') as f:
        f.write(f'# Ours vs Encyclopedia of Arda\n\n{len(fits)} maps fitted.\n\n## Disagreements (> 8 miles)\n\n')
        for r in sorted([r for r in rows if r['dist_km'] and r['dist_km'] > 8], key=lambda r: -r['dist_km']):
            f.write(f"- {r['name']}: ours {r['ours_km']} ({r['ours_src']}), Arda {r['arda_km']} via {r['map']} -> {r['dist_km']} mi\n")
        f.write('\n## Missing from ours\n\n')
        for r in sorted([r for r in rows if not r['ours_km']], key=lambda r: r['name']):
            f.write(f"- {r['name']} {r['arda_km']} ({r['shape']}, {r['map']}, {r['map_mi_per_px']} mi/px)\n")
    print('fitted', len(fits), 'maps;', len(rows), 'labels placed;',
          sum(1 for r in rows if r['dist_km'] and r['dist_km'] > 8), 'disagreements;', sum(1 for r in rows if not r['ours_km']), 'missing')


if __name__ == '__main__':
    main()
