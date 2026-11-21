"""Draw the two custom textures used by the models: the ithildin design of the Doors of Durin and the fire
veins of the Balrog. Output: sources/polyhaven/tex512/{ithildin,veins}.png"""
import math, os, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'sources', 'polyhaven', 'tex512')
os.makedirs(OUT, exist_ok=True)
W = 1024; im = Image.new('RGB', (W, W), 'black'); d = ImageDraw.Draw(im); c = (230, 242, 255); lw = 7
def arc(cx, cy, r, a0, a1, w=lw): d.arc([cx - r, cy - r, cx + r, cy + r], a0, a1, fill=c, width=w)
for r, w in ((360, lw), (310, 5)):
    d.line([(512 - r, 1024), (512 - r, 420)], fill=c, width=w); d.line([(512 + r, 1024), (512 + r, 420)], fill=c, width=w); arc(512, 420, r, 180, 360, w)
for tx in (250, 774):
    d.line([(tx, 1000), (tx, 470)], fill=c, width=6)
    for k in range(9):
        y = 520 + k * 50; L = 60 - k * 2
        d.line([(tx, y + 20), (tx - L, y - 25)], fill=c, width=4); d.line([(tx, y + 20), (tx + L, y - 25)], fill=c, width=4)
    arc(tx, 440, 40, 200, 340, 5)
d.rectangle([462, 640, 562, 672], outline=c, width=5); d.polygon([(482, 672), (472, 720), (552, 720), (542, 672)], outline=c)
d.line([(470, 600), (550, 560)], fill=c, width=6); d.rectangle([540, 548, 566, 574], outline=c, width=4)
d.line([(452, 520), (472, 480), (492, 510), (512, 470), (532, 510), (552, 480), (572, 520), (452, 520)], fill=c, width=5)
for k in range(7):
    a = math.pi * (0.15 + 0.7 * k / 6); x = 512 - math.cos(a) * 170; y = 440 - math.sin(a) * 120
    for t in range(4):
        d.line([(x, y), (x + 14 * math.cos(t * math.pi / 4), y + 14 * math.sin(t * math.pi / 4))], fill=c, width=3)
        d.line([(x, y), (x - 14 * math.cos(t * math.pi / 4), y - 14 * math.sin(t * math.pi / 4))], fill=c, width=3)
for k in range(16):
    a = k * math.pi / 8; L = 70 if k % 2 == 0 else 40
    d.line([(512, 840), (512 + L * math.cos(a), 840 + L * math.sin(a))], fill=c, width=4)
try: f = ImageFont.truetype('DejaVuSerif-Italic.ttf', 30)
except Exception: f = None
d.text((512, 250), 'Ennyn Durin Aran Moria · pedo mellon a minno', fill=c, font=f, anchor='mm')
out = Image.blend(im.filter(ImageFilter.GaussianBlur(6)), im, 0.6).point(lambda v: min(255, int(v * 1.4)))
out.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'ithildin.png'))
random.seed(5); im = Image.new('RGB', (512, 512), 'black'); d = ImageDraw.Draw(im)
for i in range(70):
    x, y = random.random() * 512, random.random() * 512
    for k in range(8):
        a = random.random() * math.tau; L = random.uniform(10, 40); x2, y2 = x + math.cos(a) * L, y + math.sin(a) * L
        d.line([(x, y), (x2, y2)], fill=(255, int(random.uniform(90, 170)), 20), width=random.choice([2, 3, 4])); x, y = x2, y2
Image.blend(im.filter(ImageFilter.GaussianBlur(4)), im, 0.55).point(lambda v: min(255, int(v * 1.5))).save(os.path.join(OUT, 'veins.png'))
print('textures drawn')
