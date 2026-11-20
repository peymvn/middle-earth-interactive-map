"""Side-by-side: an Encyclopedia of Arda map next to our map at the same frame (from the fit in
sources/arda-ref/compare.json). For visual review only; images stay in /tmp/me/arda/.

usage: .venv/bin/python tools/test/arda_side.py mapname [mapname ...] [--mode map|satellite]
"""
import json
import math
import os
import subprocess
import sys
import time

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REF = os.path.join(ROOT, 'sources', 'arda-ref')
OUT = '/tmp/me/arda'
os.makedirs(OUT, exist_ok=True)
os.makedirs(os.path.join(REF, 'maps'), exist_ok=True)
args = [a for a in sys.argv[1:] if not a.startswith('--')]
mode = 'satellite' if '--satellite' in sys.argv else 'map'
fits = json.load(open(os.path.join(REF, 'compare.json')))['fits']
chrome = subprocess.run('ls ~/.cache/ms-playwright/chromium_headless_shell-1248/*/chrome-headless-shell', shell=True, capture_output=True, text=True).stdout.strip()
for name in args:
    f = fits[name]
    local = os.path.join(REF, 'maps', os.path.basename(f['img']))
    if not os.path.exists(local):
        subprocess.run(['curl', '-sL', '-A', 'Mozilla/5.0', '-o', local, 'https://www.encyclopedia-of-arda.com/' + f['img']])
        time.sleep(1.5)
    im = Image.open(local).convert('RGB')
    if f.get('w') and f['w'] != im.width:   # image maps use displayed size; PNGs are often 2x
        im = im.resize((f['w'], round(im.height * f['w'] / im.width)))
    W, H = im.size
    a = f['a']
    cx, cy = a * W / 2 + f['tx'], a * H / 2 + f['ty']
    z = max(2, min(15, math.floor(math.log2(7816 / a))))
    k = a / (7816 / 2 ** z)
    vw, vh = max(300, round(W * k)), max(300, round(H * k))
    shot = os.path.join(OUT, f'{name}_ours.png')
    env = dict(os.environ, CHROME=chrome)
    subprocess.run(['systemd-run', '--user', '--scope', '-q', '-p', 'MemoryMax=2500M', 'env', f'CHROME={chrome}', 'CLEAN=1', 'node',
                    os.path.join(ROOT, 'tools', 'test', 'shot.js'), shot, f'#{z}/{cx / 1000:.2f}/{cy / 1000:.2f}/{mode}', str(vw), str(vh)], env=env)
    ours = Image.open(shot).convert('RGB')
    # crop the viewport to the frame size (viewport may have been enlarged to the 300px minimum)
    fw, fh = round(W * k), round(H * k)
    ox, oy = (ours.width - fw) // 2, (ours.height - fh) // 2
    ours = ours.crop((ox, oy, ox + fw, oy + fh)).resize((W, H))
    side = Image.new('RGB', (W * 2 + 10, H), 'white')
    side.paste(im, (0, 0)); side.paste(ours, (W + 10, 0))
    side.save(os.path.join(OUT, f'{name}.jpg'), quality=85)
    print(name, f'z{z} scale {a / 1000:.3f} mi/px ->', os.path.join(OUT, f'{name}.jpg'))
