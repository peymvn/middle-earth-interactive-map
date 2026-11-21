"""Shared kit: the PBR material library (carried on tiny meshes so three.js can pick materials up by
name), trees, shrubs and decimated scanned rocks. Exported as one GLB: build_tmp/models/kit.glb."""
import math, os, random
from mathutils import Vector
import melib as L

LEAF = os.path.join(L.TEX, 'leaves')


def mats():
    """Every material the JS side may ask for (ME3D.MAT.<name>)."""
    return {
        'whiteStone': L.material('whiteStone', 'white_ashlar', tile=3.0, rough=0.8),
        'greyStone': L.material('greyStone', 'castle_wall_slates', tile=3.0),
        'darkStone': L.material('darkStone', 'castle_wall_slates', color=(0.45, 0.45, 0.47), tile=3.0),
        'obsidian': L.material('obsidian', 'castle_wall_slates', color=(0.2, 0.2, 0.22), rough=0.22, metal=0.0, tile=6.0, use_arm=False),
        'rock': L.material('rock', 'rock_boulder_dry', color=(0.78, 0.76, 0.72), tile=8.0),
        'sandstone': L.material('sandstone', 'rock_06', tile=6.0),
        'mossStone': L.material('mossStone', 'mossy_stone_wall', tile=3.0),
        'plaster': L.material('plaster', 'plastered_wall', tile=3.0),
        'stucco': L.material('stucco', 'white_stucco', tile=3.0, rough=0.7),
        'thatch': L.material('thatch', 'thatch_roof_angled', tile=2.5),
        'tiles': L.material('tiles', 'clay_roof_tiles_02', tile=2.5),
        'slate': L.material('slate', 'dark_slate', tile=2.5, rough=0.6),
        'greyTiles': L.material('greyTiles', 'grey_roof_tiles_02', tile=2.5),
        'planks': L.material('planks', 'brown_planks_05', tile=2.0),
        'oldWood': L.material('oldWood', 'medieval_wood', tile=2.0),
        'marble': L.material('marble', 'marble_01', tile=3.0, rough=0.35),
        'cobbles': L.material('cobbles', 'cobblestone_floor_01', tile=2.5),
        'bark': L.material('bark', 'bark_brown_02', tile=1.5),
        'silverBark': L.material('silverBark', 'silver_bark', tile=2.0),
    }


def carriers(ms):
    """One tiny triangle per material so the GLB carries the whole library."""
    out = []
    for i, (name, mat) in enumerate(ms.items()):
        m = L.Mesh('mat_' + name)
        m.box(mat, (0.01, 0.01, 0.01), loc=(i * 0.1, 0, -100))
        out.append(m.finish())
    return out


def kit():
    random.seed(4)
    R = random.random
    ms = mats()
    objs = carriers(ms)
    leaf_green = L.material('leafGreen', alpha_tex=os.path.join(LEAF, 'sprig_a.png'), color=(0.9, 1.0, 0.85), rough=0.75)
    leaf_dark = L.material('leafDark', alpha_tex=os.path.join(LEAF, 'sprig_b.png'), color=(0.62, 0.72, 0.6), rough=0.75)
    leaf_gold = L.material('leafGold', alpha_tex=os.path.join(LEAF, 'sprig_grey.png'), color=(0.95, 0.78, 0.32), rough=0.6)
    leaf_autumn = L.material('leafAutumn', alpha_tex=os.path.join(LEAF, 'sprig_grey.png'), color=(0.85, 0.45, 0.18), rough=0.7)
    leaf_white = L.material('leafWhite', alpha_tex=os.path.join(LEAF, 'sprig_grey.png'), color=(0.95, 0.96, 0.93), rough=0.6)
    for name, kind, h, leaf, bark, n in [
            ('tree_oak', 'oak', 14, leaf_green, ms['bark'], 170), ('tree_oak2', 'oak', 11, leaf_dark, ms['bark'], 140),
            ('tree_conifer', 'conifer', 18, leaf_dark, ms['bark'], 0), ('tree_autumn', 'oak', 13, leaf_autumn, ms['bark'], 150),
            ('tree_mallorn', 'mallorn', 60, leaf_gold, ms['silverBark'], 900), ('tree_white', 'oak', 10, leaf_white, ms['silverBark'], 140)]:
        objs.append(L.tree(name, R, h=h, kind=kind, bark=bark, leaf=leaf, leaves=n))
    # scanned rocks and cliffs, decimated
    # (only parts the scenes use: crags for rockLump, undergrowth, Isengard's felled trees)
    for name, asset, tris in [('boulder2', 'boulder_01', 1500), ('shrub', 'shrub_02', 1500), ('fern', 'fern_02', 800), ('dead_tree', 'dead_tree_trunk', 1500)]:
        objs.append(L.scan(name, asset, tris))
    # lay them out apart (positions are irrelevant to the JS side, which uses them by name)
    for i, o in enumerate(objs[len(ms):]):
        o.location = (i * 80, 0, 0)
    return objs


ASSETS = {'kit': kit}
