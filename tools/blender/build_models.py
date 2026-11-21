"""Build the 3D landmark models with headless Blender.

  sources/blender/blender-4.1.1-linux-x64/blender -b --factory-startup -P tools/blender/build_models.py -- [group ...]

Each group becomes one GLB (build_tmp/models/<group>.glb) whose top-level nodes are the named assets,
so assets in a group share their textures. tools/pack_models.py then wraps them into web/models/*.js.
Needs sources/polyhaven (tools/download_models.sh) and runs in under a minute.
"""
import sys, os, importlib
sys.path.insert(0, os.path.dirname(__file__))
import melib; importlib.reload(melib)
import assets_hero, assets_hero2, assets_kit

ALL = {**assets_hero.ASSETS, **assets_hero2.ASSETS, **assets_kit.ASSETS}
GROUPS = {
    'kit': ['kit'],
    'orthanc': ['orthanc'],
    'barad_dur': ['barad_dur'],
    'hobbiton': ['smial_bagend', 'smial', 'cottage', 'mill', 'mill_wheel'],
    'rivendell': ['elf_hall', 'elf_tower'],
    'gondor': ['gondor_house', 'gondor_house2', 'white_tower', 'citadel_hall'],
    'rohan': ['rohan_house', 'meduseld'],
    'dwarves': ['dwarf_statue', 'erebor_gate', 'moria_gate', 'dwarf_pillar', 'khazad_bridge'],
    'figures': ['balrog', 'gandalf', 'ent', 'king_statue'],
}
names = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv and sys.argv[-1] != '--' else list(GROUPS)
out = os.path.join(melib.ROOT, 'build_tmp', 'models')
for g in names:
    melib.reset(); melib._mats.clear()
    objs = []
    for i, a in enumerate(GROUPS[g]):
        new = ALL[a]()
        if len(GROUPS[g]) > 1:
            for o in new:
                o.name = a
                o.location.x += i * 200  # spread out; the JS side re-positions by name
        objs += new
    size = melib.export(os.path.join(out, g + '.glb'), objs)
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs if o.type == 'MESH')
    print(f'BUILT {g}: {size // 1024} KB, {tris} tris, {len(objs)} objects')
