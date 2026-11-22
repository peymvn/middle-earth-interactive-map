"""Build the demo's zoom frames from the keyframes of record_zoom.js: each frame is the level-L keyframe
scaled by 2^(z-L) around the frame's exact centre (bicubic, sub-pixel), crossfaded with level L+1 over
the second half of each level; map->satellite is a crossfade too. The UI overlay goes on top.
  python3 tools/test/compose_zoom.py [inDir=/tmp/me/zoom] [outDir=/tmp/me/video/map]"""
import json, math, os, sys
from PIL import Image
IN = sys.argv[1] if len(sys.argv) > 1 else '/tmp/me/zoom'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/me/video/map'
os.makedirs(OUT, exist_ok=True)
meta = json.load(open(os.path.join(IN, 'meta.json')))
W, H, D = meta['W'], meta['H'], meta['DSF']
ui = {m: Image.open(os.path.join(IN, f'ui_{m}.png')).convert('RGBA').resize((W, H), Image.LANCZOS) for m in ('map', 'satellite')}
# label sprites (record_zoom.js): cropped to their pixels, downscaled once to output size, premultiplied
LJ = json.load(open(os.path.join(IN, 'labels.json')))
AX, AY = LJ['anchor'][0] * D, LJ['anchor'][1] * D
sprites = {}
def sprite(key):
    if key not in sprites:
        im = Image.open(os.path.join(IN, 'sprites', LJ['sprites'][key] + '.png')).convert('RGBA')
        bb = im.getbbox() or (0, 0, 1, 1); im = im.crop(bb)
        w, h = max(1, round(im.width / D)), max(1, round(im.height / D))
        sprites[key] = (im.convert('RGBa').resize((w, h), Image.LANCZOS), (bb[0] - AX) / D, (bb[1] - AY) / D)
    return sprites[key]
def labels_layer(i, mode):
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for lid, x, y, a in LJ['frames'][i]:
        if i < 8: a = 1                    # labels are already on screen when the video starts
        key = mode + '|' + lid
        if key not in LJ['sprites']: continue
        sp, ox, oy = sprite(key)
        fx, fy = x + ox, y + oy; ix, iy = math.floor(fx), math.floor(fy)
        # shift by the fractional part (bicubic), so every label moves in exact sub-pixel steps
        sh = sp.transform((sp.width + 2, sp.height + 2), Image.AFFINE, (1, 0, -(fx - ix), 0, 1, -(fy - iy)), resample=Image.BICUBIC).convert('RGBA')
        if a < 1: sh.putalpha(sh.getchannel('A').point(lambda v: round(v * a)))
        sx, sy = max(0, -ix), max(0, -iy)
        if ix >= W or iy >= H or sx >= sh.width or sy >= sh.height: continue
        layer.alpha_composite(sh, dest=(max(0, ix), max(0, iy)), source=(sx, sy))
    return layer
cache = {}
def key(name):
    if name not in cache:
        if len(cache) >= 3: cache.pop(next(iter(cache)))
        cache[name] = Image.open(os.path.join(IN, name + '.png')).convert('RGB')
    return cache[name]
def view(name, i, z):
    lv = meta['levels'][name]; cx, cy = lv['frames'][str(i)]
    s = 2 ** (z - lv['L']) / D            # output px per keyframe px
    a = 1 / s
    return key(name).transform((W, H), Image.AFFINE, (a, 0, cx * D - W / 2 * a, 0, a, cy * D - H / 2 * a), resample=Image.BICUBIC)
smooth = lambda t: t * t * (3 - 2 * t)
for i, f in enumerate(meta['frames']):
    z = f['z']; L = math.floor(z); t = z - L
    def level_img(mode):
        nm = lambda l: ('map_' if mode == 'map' else 'sat_') + str(l)
        img = view(nm(L), i, z)
        if t > 0.5 and nm(L + 1) in meta['levels']:
            img = Image.blend(img, view(nm(L + 1), i, z), smooth((t - 0.5) / 0.5))
        return img
    sat = f['sat']
    if sat <= 0: img = level_img('map')
    elif sat >= 1: img = level_img('satellite')
    else: img = Image.blend(level_img('map'), level_img('satellite'), smooth(sat))
    img = img.convert('RGBA')
    # labels (own layer, drawn per frame at exact positions), then the UI
    lm, ls = (labels_layer(i, 'map') if sat < 1 else None), (labels_layer(i, 'satellite') if sat > 0 else None)
    labels = Image.blend(lm, ls, smooth(sat)) if lm and ls else (lm or ls)
    if labels: img.alpha_composite(labels)
    over = Image.blend(ui['map'], ui['satellite'], smooth(sat)) if 0 < sat < 1 else ui['satellite' if sat >= 1 else 'map']
    img.alpha_composite(over)
    img.convert('RGB').save(os.path.join(OUT, f'{i:05d}.png'), compress_level=1)
    if i % 48 == 0: print('frame', i, 'z', round(z, 2), flush=True)
print('frames', len(meta['frames']))
