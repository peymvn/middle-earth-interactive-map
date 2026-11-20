"""Find a film still (Peter Jackson's trilogies) for each place and event, via the LOTR Fandom wiki API.

Writes web/data/photos.js: a map from place name / event id to an image URL on the wiki's CDN plus
credit info. Nothing is downloaded or stored here: the browser loads the images straight from the
wiki (which hosts them under fair use), so they need an internet connection.

Run: python3 tools/build_photos.py      (pure stdlib; ~1 minute, a few dozen API calls)
Override a choice with the `still` field in places.js / events.js ("File:Name.jpg" or "none").
"""
import json
import os
import re
import subprocess
import time
import urllib.parse
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
API = 'https://lotr.fandom.com/api.php'
OUT = os.path.join(ROOT, 'web', 'data', 'photos.js')

FILMS = [  # category -> (score, display title)
    ('Images from The Fellowship of the Ring (film)', 3, 'The Fellowship of the Ring (2001)'),
    ('Images from The Two Towers (film)', 3, 'The Two Towers (2002)'),
    ('Images from The Return of the King (film)', 3, 'The Return of the King (2003)'),
    ('Images from The Hobbit: An Unexpected Journey', 2, 'The Hobbit: An Unexpected Journey (2012)'),
    ('Images from The Hobbit: The Desolation of Smaug', 2, 'The Hobbit: The Desolation of Smaug (2013)'),
    ('Images from The Hobbit: The Battle of the Five Armies', 2, 'The Hobbit: The Battle of the Five Armies (2014)'),
    ('Images from An Unexpected Journey', 2, 'The Hobbit: An Unexpected Journey (2012)'),
    ('Images from The Desolation of Smaug', 2, 'The Hobbit: The Desolation of Smaug (2013)'),
    ('Images from The Hobbit (film)', 2, 'The Hobbit film trilogy (2012–2014)'),
]
# wiki page names where they differ from our place names
WIKI = {
    'Hobbiton': 'Hobbiton', 'Moria': 'Khazad-dûm', 'Lothlórien': 'Lothlórien', 'The Black Gate': 'Black Gate',
    'Weathertop': 'Weathertop', 'Grey Havens': 'Grey Havens', 'Lake-town': 'Lake-town', 'Mount Doom': 'Mount Doom',
    "Thranduil's Halls": "Elvenking's Halls", 'Goblin-town': 'Goblin-town', 'Fangorn Forest': 'Fangorn Forest',
    'Ford of Bruinen': 'Ford of Bruinen', 'Barrow-downs': 'Barrow-downs', 'The Prancing Pony': 'The Prancing Pony',
    'Amon Hen': 'Amon Hen', 'Pelennor Fields': 'Pelennor Fields', 'Henneth Annûn': 'Henneth Annûn',
    'Brandywine Bridge': 'Brandywine Bridge', 'The Old Forest': 'Old Forest', 'Dead Marshes': 'Dead Marshes',
    'Trollshaws': 'Trollshaws', 'Midgewater Marshes': 'Midgewater Marshes', 'Caradhras': 'Caradhras',
    'Erebor': 'Erebor', 'Mirkwood': 'Mirkwood', 'Rauros': 'Rauros', 'Argonath': 'Argonath',
}
EVENT_WIKI = {
    'unexpected-party': 'An Unexpected Party', 'trolls': 'Bert, Tom and William', 'riddles': 'Riddles in the Dark',
    'spiders': 'Spiders of Mirkwood', 'barrels': 'Barrel-rider', 'smaug-death': 'Smaug', 'five-armies': 'Battle of the Five Armies',
    'long-expected': "Bilbo's Farewell Party", 'weathertop': 'Weathertop', 'bruinen': 'Ford of Bruinen',
    'council': 'Council of Elrond', 'caradhras': 'Caradhras', 'bridge': 'Bridge of Khazad-dûm', 'lorien': 'Mirror of Galadriel',
    'argonath-ev': 'Argonath', 'breaking': 'Breaking of the Fellowship', 'boromir-funeral': 'Boromir', 'treebeard': 'Treebeard',
    'white-rider': 'Gandalf', 'entmoot': 'Entmoot', 'edoras-theoden': 'Meduseld', 'isengard-falls': 'Last March of the Ents',
    'helms-deep': 'Battle of the Hornburg', 'palantir': 'Palantír of Orthanc', 'smeagol-tamed': 'Sméagol',
    'dead-marshes': 'Dead Marshes', 'henneth': 'Henneth Annûn', 'shelob': 'Shelob', 'beacons': 'Beacons of Gondor',
    'paths-dead': 'Paths of the Dead', 'pelargir-ev': 'Battle of Pelargir', 'osgiliath-falls': 'Osgiliath',
    'pelennor': 'Battle of the Pelennor Fields', 'cirith-tower': 'Tower of Cirith Ungol', 'black-gate-battle': 'Battle of the Morannon',
    'ring-destroyed': 'Cracks of Doom', 'barad-dur-falls': 'Barad-dûr', 'cormallen-ev': 'Field of Cormallen',
    'coronation': 'Coronation of Aragorn', 'grey-havens': 'Grey Havens', 'scouring': 'Scouring of the Shire',
    'dagorlad': 'Battle of Dagorlad', 'isildur-ring': 'War of the Last Alliance', 'gladden': 'Disaster of the Gladden Fields',
    'one-ring': 'One Ring', 'deagol': 'Déagol', 'durins-bane': "Durin's Bane", 'orthanc-gandalf': 'Orthanc',
    'frodo-leaves': 'Bag End', 'old-forest': 'Old Man Willow', 'barrow-wight': 'Barrow-wights', 'prancing-pony': 'The Prancing Pony',
    'crickhollow': 'Crickhollow', 'smaug': 'Smaug', 'carrock': 'Carrock', 'dol-guldur-2941': 'Dol Guldur',
}


# hand-picked stills where the automatic choice is missing or weak (key -> wiki file name)
OVERRIDES = {
    'p:Moria': 'Doors of Durin.jpeg',
    'p:Pelennor Fields': 'Oliphaunts attacking.jpg',
    'p:Amon Hen': 'Amon Hen from Nen Hithoel - FotR.jpg',
    'p:Dagorlad': 'FotR - Elves & Orcs collide.png',
    'e:dagorlad': 'FotR - Elves & Orcs collide.png',
    'p:Misty Mountains': 'Caradhras.png',
    "p:Tom Bombadil's House": None,  # not in the films; the automatic match was wrong
}


def api(**params):
    params.setdefault('format', 'json')
    url = API + '?' + urllib.parse.urlencode(params)
    # curl, because this box's Python lacks some CA certificates
    out = subprocess.run(['curl', '-s', '--max-time', '30', url], capture_output=True, text=True).stdout
    time.sleep(0.2)
    return json.loads(out)


def chunks(xs, n=50):
    for i in range(0, len(xs), n):
        yield xs[i:i + n]


def js_list(path, var):
    """Pull names / ids out of our data files without a JS parser."""
    s = open(path, encoding='utf-8').read()
    if var == 'places':
        return [a or b for a, b in re.findall(r"""\{ name: (?:'((?:[^'\\]|\\.)*)'|"([^"]*)")""", s)]
    return re.findall(r"\{ id: '([^']+)'", s)


def resolve_pages(titles):
    """title -> canonical existing page title (following redirects), or None."""
    res = {}
    for ch in chunks(sorted(set(titles))):
        d = api(action='query', titles='|'.join(ch), redirects=1)
        q = d['query']
        norm = {n['from']: n['to'] for n in q.get('normalized', [])}
        redir = {r['from']: r['to'] for r in q.get('redirects', [])}
        exists = {p['title'] for p in q['pages'].values() if 'missing' not in p}
        for t in ch:
            t2 = norm.get(t, t)
            t3 = redir.get(t2, t2)
            res[t] = t3 if t3 in exists else None
    return res


def page_images(pages):
    out = {}
    for ch in chunks(sorted(set(pages))):
        cont = {}
        while True:
            d = api(action='query', titles='|'.join(ch), prop='images|pageimages', imlimit='max', piprop='name', **cont)
            for p in d['query']['pages'].values():
                e = out.setdefault(p['title'], {'images': [], 'main': None})
                e['images'] += [i['title'] for i in p.get('images', [])]
                if p.get('pageimage'):
                    e['main'] = 'File:' + p['pageimage'].replace('_', ' ')
            if 'continue' not in d:
                break
            cont = d['continue']
    # galleries usually live in "Category:Images of <page>", not on the page itself
    for page in pages:
        cont = {}
        while True:
            d = api(action='query', list='categorymembers', cmtitle='Category:Images of ' + page, cmtype='file', cmlimit='max', **cont)
            out.setdefault(page, {'images': [], 'main': None})['images'] += [m['title'] for m in d.get('query', {}).get('categorymembers', [])]
            if 'continue' not in d:
                break
            cont = d['continue']
        e = out[page]
        if e['main'] and e['main'] not in e['images']:
            e['images'].append(e['main'])
        e['images'] = list(dict.fromkeys(e['images']))
    return out


def file_info(files):
    info = {}
    for ch in chunks(sorted(set(files))):
        d = api(action='query', titles='|'.join(ch), prop='categories|imageinfo', cllimit='max', iiprop='size|url')
        for p in d['query']['pages'].values():
            ii = (p.get('imageinfo') or [{}])[0]
            info[p['title']] = {'cats': [c['title'][9:] for c in p.get('categories', [])],
                                'w': ii.get('width', 0), 'h': ii.get('height', 0), 'url': ii.get('url'),
                                'page': ii.get('descriptionurl')}
    return info


def score(f, inf, main, page, is_place, uses):
    best = None
    for cat, sc, title in FILMS:
        if cat in inf['cats']:
            best = (sc, title)
            break
    if not best or not inf['url'] or inf['w'] < 500:
        return None
    s = best[0] * 10
    ar = inf['w'] / max(1, inf['h'])
    s += 4 if 1.3 <= ar <= 2.6 else (1 if ar >= 1.0 else -6)
    s += min(3, inf['w'] / 700)
    of = [c for c in inf['cats'] if c.startswith('Images of ') and c not in ('Images of locations', f'Images of {page}')]
    if is_place:
        # places want scenery: reward location categories, punish shots tagged with people
        if 'Images of locations' in inf['cats']:
            s += 8
        if f'Images of {page}' in inf['cats']:
            s += 6
        s -= 4 * len(of)
        if not ('Images of locations' in inf['cats'] or f'Images of {page}' in inf['cats']) and page.split()[0].lower() not in f.lower():
            s -= 12
    else:
        s -= 1 * len(of)
    if f == main:
        s += 3
    if uses.get(f, 0) > 3:  # template/quote images that sit on many pages
        s -= 40
    if re.search(r'concept|map|poster|lego|game|card|figure|toy|logo|cover', f, re.I):
        s -= 20
    return s, best[1]


def thumb(url, width=800):
    # https://static.wikia.nocookie.net/lotr/images/a/ab/X.jpg/revision/latest?cb=... -> scaled rendition
    m = re.match(r'(.*?/revision/latest)(\?.*)?$', url)
    return f'{m.group(1)}/scale-to-width-down/{width}{m.group(2) or ""}' if m else url


def main():
    places = js_list(os.path.join(ROOT, 'web', 'data', 'places.js'), 'places')
    events = js_list(os.path.join(ROOT, 'web', 'data', 'events.js'), 'events')
    wanted = {}  # key -> candidate wiki titles in order
    for n in places:
        n = n.replace("\\'", "'")
        wanted['p:' + n] = [WIKI.get(n, n)] + ([n] if WIKI.get(n) else [])
    for e in events:
        if e in EVENT_WIKI:
            wanted['e:' + e] = [EVENT_WIKI[e]]
    resolved = resolve_pages([t for ts in wanted.values() for t in ts])
    pages = {k: next((resolved[t] for t in ts if resolved.get(t)), None) for k, ts in wanted.items()}
    # places with no page (or no film stills on it): search file names instead
    search_keys = {}
    for key, ts in wanted.items():
        q = ts[0]
        d = api(action='query', list='search', srsearch=q, srnamespace=6, srlimit=40)
        search_keys[key] = [r['title'] for r in d.get('query', {}).get('search', [])]
    imgs = page_images([p for p in pages.values() if p])
    for key, files in search_keys.items():
        pk = 'search:' + key
        imgs[pk] = {'images': files, 'main': None}
        if not pages.get(key):
            pages[key] = pk
    allfiles = sorted({f for e in imgs.values() for f in e['images']})
    info = file_info(allfiles)
    from collections import Counter
    uses = Counter(f for k, e in imgs.items() if not k.startswith('search:') for f in set(e['images']))
    out = {}
    for key, page in pages.items():
        if not page or page not in imgs:
            continue
        cands = []
        pool = imgs[page]['images'] + [('S', f) for f in imgs.get('search:' + key, {}).get('images', [])]
        for f in pool:
            penalty = 0
            if isinstance(f, tuple):  # from a file-name search: only if the page itself had nothing better
                f, penalty = f[1], 6
            if f not in info:
                continue
            sc = score(f, info[f], imgs[page]['main'], wanted[key][0], key.startswith('p:'), uses)
            if sc:
                cands.append((sc[0] - penalty, f, sc[1]))
        if not cands:
            continue
        cands.sort(reverse=True)
        if cands[0][0] < 25:   # nothing convincing: better no still than a wrong one
            continue
        _, f, film = cands[0]
        inf = info[f]
        wiki = page if not page.startswith('search:') else wanted[key][0]
        out[key] = {'src': thumb(inf['url']), 'film': film, 'file': f[5:], 'page': inf['page'],
                    'wiki': f'https://lotr.fandom.com/wiki/{urllib.parse.quote(wiki.replace(" ", "_"))}'}
    oinfo = file_info(['File:' + f for f in OVERRIDES.values() if f])
    for key, f in OVERRIDES.items():
        if f is None:
            out.pop(key, None)
            continue
        inf = oinfo.get('File:' + f)
        if not inf or not inf['url']:
            print('override not found:', f)
            continue
        film = next((t for c, _, t in FILMS if c in inf['cats']), 'The Lord of the Rings films')
        name = key[2:]
        out[key] = {'src': thumb(inf['url']), 'film': film, 'file': f, 'page': inf['page'],
                    'wiki': f'https://lotr.fandom.com/wiki/{urllib.parse.quote(WIKI.get(name, EVENT_WIKI.get(name, name)).replace(" ", "_"))}'}
    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write('// Generated by tools/build_photos.py. Film stills hotlinked from the LOTR Fandom wiki\n'
                 '// (hosted there under fair use; not stored in this repo). Keys: "p:<place name>", "e:<event id>".\n')
        fh.write('window.ME_PHOTOS = ' + json.dumps(out, ensure_ascii=False, indent=1) + ';\n')
    np_ = sum(k.startswith('p:') for k in out)
    ne = sum(k.startswith('e:') for k in out)
    print(f'places with stills: {np_}/{len(places)}, events: {ne}/{len(events)}')
    print('missing places:', [k[2:] for k in wanted if k.startswith('p:') and k not in out])


if __name__ == '__main__':
    main()
