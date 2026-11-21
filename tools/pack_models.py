"""Wrap build_tmp/models/*.glb into web/models/<name>.js (base64 in a script call), so the 3D viewer can
load them with a <script> tag, which also works from file://. Run after tools/blender/build_models.py."""
import base64, glob, os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
os.makedirs(os.path.join(ROOT, 'web', 'models'), exist_ok=True)
for p in sorted(glob.glob(os.path.join(ROOT, 'build_tmp', 'models', '*.glb'))):
    n = os.path.basename(p)[:-4]
    b = base64.b64encode(open(p, 'rb').read()).decode()
    out = os.path.join(ROOT, 'web', 'models', n + '.js')
    open(out, 'w').write(f'ME3D_MODEL("{n}","{b}");\n')
    print(n, os.path.getsize(out) // 1024, 'KB')

# ground textures for the 3D terrain (splatted by slope and satellite colour in view3d.js), as data URLs
GROUND = {'grass': 'rocky_terrain_02', 'meadow': 'leafy_grass', 'rock': 'aerial_rocks_02', 'dirt': 'coast_sand_01'}
src = os.path.join(ROOT, 'sources', 'polyhaven', 'tex512')
if all(os.path.exists(os.path.join(src, a, 'diff.jpg')) for a in GROUND.values()):
    parts = ','.join(f'{k}:"data:image/jpeg;base64,' + base64.b64encode(open(os.path.join(src, a, 'diff.jpg'), 'rb').read()).decode() + '"'
                     for k, a in GROUND.items())
    out = os.path.join(ROOT, 'web', 'models', 'ground.js')
    open(out, 'w').write('ME3D_GROUND({' + parts + '});\n')
    print('ground', os.path.getsize(out) // 1024, 'KB')
