"""Download the CC0 Poly Haven textures and scanned models used by the 3D landmarks into
sources/polyhaven/ (tex/ and mod/), then make the 512 px web versions (tex512/) and the leaf cards.
Run from the repository root: python3 tools/blender/fetch_polyhaven.py"""
import json, os, sys, urllib.request
os.makedirs(os.path.join(os.path.dirname(__file__), '..', '..', 'sources', 'polyhaven'), exist_ok=True)
os.chdir(os.path.join(os.path.dirname(__file__), '..', '..', 'sources', 'polyhaven'))
opener = urllib.request.build_opener(); opener.addheaders = [("User-Agent", "middle-earth-interactive-map/1.0 (github.com/peymvn)")]; urllib.request.install_opener(opener)
TEX = ['castle_brick_02_white', 'castle_wall_slates', 'dark_rock', 'medieval_blocks_02', 'white_stucco', 'plastered_wall',
       'clay_roof_tiles_02', 'roof_slates_02', 'thatch_roof_angled', 'brown_planks_05', 'medieval_wood', 'bark_brown_02',
       'mossy_stone_wall', 'rock_06', 'marble_01', 'grey_roof_tiles_02', 'japanese_cedar_bark', 'cobblestone_floor_01',
       'leafy_grass', 'grass_ground', 'sparse_grass', 'rocky_terrain_02', 'aerial_rocks_02', 'dirt_floor', 'brown_mud_leaves_01', 'coast_sand_01', 'forest_leaves_02',
       'gray_rocks', 'rock_face_03', 'rock_wall_02', 'rock_boulder_dry']
MOD = ['boulder_01', 'tree_small_02', 'shrub_02', 'dead_tree_trunk', 'fern_02']
def get(url, dst):
    if os.path.exists(dst): return
    os.makedirs(os.path.dirname(dst) or '.', exist_ok=True)
    urllib.request.urlretrieve(url, dst)
def files(a): return json.load(urllib.request.urlopen(f'https://api.polyhaven.com/files/{a}'))
for a in TEX:
    try:
        f = files(a)
        for k, dst in [('Diffuse', 'diff'), ('nor_gl', 'nor'), ('arm', 'arm')]:
            if k in f: get(f[k]['1k']['jpg']['url'], f'tex/{a}/{dst}.jpg')
        print('tex', a)
    except Exception as e: print('tex FAIL', a, e)
for a in MOD:
    try:
        g = files(a)['gltf']['1k']['gltf']
        get(g['url'], f'mod/{a}/{a}.gltf')
        for rel, inc in g.get('include', {}).items(): get(inc['url'], f'mod/{a}/{rel}')
        print('mod', a, sum(os.path.getsize(os.path.join(r, x)) for r, _, fs in os.walk(f'mod/{a}') for x in fs) // 1024, 'KB')
    except Exception as e: print('mod FAIL', a, e)

# --- web-sized textures and leaf cards (needs numpy + pillow, e.g. the .venv)
try:
    import numpy as np
    from PIL import Image, ImageFilter
except ImportError:
    sys.exit('now run this again with a Python that has numpy and pillow (e.g. .venv/bin/python) to make tex512/')
for d in sorted(os.listdir('tex')):
    os.makedirs(f'tex512/{d}', exist_ok=True)
    for f in os.listdir(f'tex/{d}'):
        im = Image.open(f'tex/{d}/{f}').convert('RGB'); n = 256 if f == 'arm.jpg' else 512
        im.resize((n, n), Image.LANCZOS).save(f'tex512/{d}/{f}', quality=84 if f == 'diff.jpg' else 90)
im = np.asarray(Image.open('mod/tree_small_02/textures/tree_small_02_leaves_diff_1k.jpg').convert('RGB')).astype(np.float32)
alpha = np.clip((im.mean(axis=2) - 18) * 12, 0, 255)
os.makedirs('tex512/leaves', exist_ok=True)
for name, (x0, x1) in {'sprig_a': (0, 430), 'sprig_b': (430, 880)}.items():
    a = Image.fromarray(alpha[:, x0:x1].astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    Image.fromarray(np.dstack([im[:, x0:x1].astype(np.uint8), np.asarray(a)]), 'RGBA').resize((256, 512), Image.LANCZOS).save(f'tex512/leaves/{name}.png')
o = Image.open('tex512/leaves/sprig_a.png'); r, g, b, a = o.split()
L = Image.merge('RGB', (r, g, b)).convert('L').point(lambda v: min(255, int(v * 1.6)))
Image.merge('RGBA', (L, L, L, a)).save('tex512/leaves/sprig_grey.png')
# derived textures: silver bark for the mallorns, white ashlar for Gondor, dark slate roofs
def derive(src, dst, mean, tint, sat):
    os.makedirs(f'tex512/{dst}', exist_ok=True)
    for f in ('diff.jpg', 'nor.jpg', 'arm.jpg'):
        im = Image.open(f'tex512/{src}/{f}')
        if f == 'diff.jpg':
            a = np.asarray(im.convert('RGB')).astype(np.float32)
            g = a.mean(axis=2, keepdims=True)
            a = g + (a - g) * sat                       # partial desaturation
            a = (a - a.mean()) * 1.05 + mean            # move the mean, keep the contrast
            im = Image.fromarray(np.clip(a * np.array(tint), 0, 255).astype(np.uint8))
        im.save(f'tex512/{dst}/{f}', quality=88)
derive('japanese_cedar_bark', 'silver_bark', 150, (0.97, 0.98, 0.95), 0.0)
derive('castle_brick_02_white', 'white_ashlar', 200, (1.0, 0.99, 0.96), 0.35)
derive('roof_slates_02', 'dark_slate', 78, (0.92, 0.97, 1.08), 0.2)
print('tex512 ready (ithildin.png and veins.png are drawn by tools/blender/make_textures.py)')
