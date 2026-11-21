"""More landmark models: hobbit-holes, elven halls, Gondorian and Rohirric buildings, the Erebor gate, the
Doors of Durin, the Bridge of Khazad-dûm, and figures (Balrog, Gandalf, Ent, Argonath king, dwarf guardian).
Frame: +X east, +Y north, +Z up, metres. Buildings face south (-Y) unless noted, which the JS rotates."""
import math, os, random
from mathutils import Vector, Matrix
import melib as L
from assets_kit import mats

TAU = math.tau


def ring(cx, cy, z, r, n, rot=0.0, sx=1.0, sy=1.0):
    return [(cx + math.cos(rot + i / n * TAU) * r * sx, cy + math.sin(rot + i / n * TAU) * r * sy, z) for i in range(n)]


def disc_y(m, mat, r, y, z, depth=0.2, seg=32):
    """A round disc facing -Y (south), centred (0, y, z)."""
    return m.cyl(mat, r, r, depth, loc=(0, y - depth / 2, z), seg=seg, axis=Matrix.Rotation(-math.pi / 2, 4, 'X'))


def torus_y(m, mat, R, r, y, z, seg=32, sides=8, x=0.0):
    import bmesh
    rings_ = []
    for i in range(seg):
        a = i / seg * TAU
        cx, cz = math.cos(a) * R, math.sin(a) * R
        rings_.append([(x + cx + math.cos(a) * math.cos(b) * r, y + math.sin(b) * r, z + cz + math.sin(a) * math.cos(b) * r) for b in [j / sides * TAU for j in range(sides)]])
    rings_.append(rings_[0])
    m.loft(mat, rings_, caps=False)


# ================================================================ hobbit-holes
def _smial(name, hero=False):
    ms = mats()
    m = L.Mesh(name)
    random.seed(11 if hero else 5); R = random.random
    turf = L.material('turf', color=(0.27, 0.42, 0.14), rough=0.95)
    door = L.material('door', 'brown_planks_05', color=(0.25, 0.55, 0.3), tile=1.2, rough=0.55)
    frame = L.material('frame', 'medieval_wood', color=(0.75, 0.62, 0.48), tile=1.0)
    brass = L.material('brass', color=(0.85, 0.65, 0.3), rough=0.25, metal=1.0)
    glass = L.material('windowWarm', color=(0.25, 0.2, 0.12), emission=(1.0, 0.75, 0.4), emit_strength=0.8)
    stone = ms['greyStone']
    S = 1.0 if hero else 0.8
    # the hill: a squashed, noisy dome rising behind the facade
    hill_r = (14 if hero else 9) * S
    rings_ = []
    for k in range(13):
        t = k / 12; z = hill_r * 0.55 * math.sin(t * math.pi / 2)
        rr = hill_r * math.cos(t * math.pi / 2) + 0.01
        rings_.append([(x + (R() - 0.5) * 0.8, y + hill_r * 0.85 + 0.6 + (R() - 0.5) * 0.8, zz - 0.5 + (R() - 0.5) * 0.4) for x, y, zz in ring(0, 0, z, rr, 28, sy=0.85)])
    m.loft(turf, rings_)
    # facade: a curved retaining wall of stone with turf on top, the round door in the middle
    fw = 9.0 * S
    for i in range(18):
        a0 = math.pi * (0.15 + 0.7 * i / 18); a1 = math.pi * (0.15 + 0.7 * (i + 1) / 18)
        p0 = (math.cos(a0) * fw, -math.sin(a0) * fw * 0.35 + 1.0); p1 = (math.cos(a1) * fw, -math.sin(a1) * fw * 0.35 + 1.0)
        m.prism(stone, [(p0[0], p0[1]), (p1[0], p1[1]), (p1[0], p1[1] + 1.2), (p0[0], p0[1] + 1.2)], -1.0, 3.4 * S)
    # the door: round, painted, planked, with a frame ring and a brass knob in the very middle
    dr = 1.25 * S
    dy = -fw * 0.35 + 0.8
    disc_y(m, door, dr, dy, dr + 0.15, depth=0.25)
    torus_y(m, frame, dr + 0.12, 0.14, dy - 0.15, dr + 0.15, seg=36, sides=6)
    m.sphere(brass, 0.12, loc=(0, dy - 0.35, dr + 0.15), seg=12, rings=8)
    for j in range(5):  # iron hinge straps
        pass
    m.box(L.material('hinge', color=(0.08, 0.08, 0.08), rough=0.5, metal=0.6), (dr * 1.4, 0.05, 0.08), loc=(-dr * 0.25, dy - 0.27, dr + 0.15 + 0.6 * S))
    m.box(L.material('hinge', color=(0.08, 0.08, 0.08), rough=0.5, metal=0.6), (dr * 1.4, 0.05, 0.08), loc=(-dr * 0.25, dy - 0.27, dr + 0.15 - 0.6 * S))
    # round windows with cross mullions either side
    for sx in (-1, 1):
        wx = sx * 3.6 * S
        wy = -math.sin(math.acos(max(-1, min(1, wx / fw)))) * fw * 0.35 + 0.9
        for part in [(glass, 0.62 * S, 0.1)]:
            m.cyl(part[0], part[1], part[1], part[2], loc=(wx, wy - part[2] / 2, 1.9 * S), seg=24, axis=Matrix.Rotation(-math.pi / 2, 4, 'X'))
        torus_y(m, frame, 0.66 * S, 0.08, wy - 0.12, 1.9 * S, seg=24, sides=6, x=wx)
        m.box(frame, (1.25 * S, 0.06, 0.07), loc=(wx, wy - 0.15, 1.9 * S)); m.box(frame, (0.07, 0.06, 1.25 * S), loc=(wx, wy - 0.15, 1.9 * S))
        m.box(frame, (1.4 * S, 0.35, 0.1), loc=(wx, wy - 0.2, 1.9 * S - 0.7 * S))  # sill
    # stone step and a flagged path down to a little gate in a picket fence
    m.cyl(stone, 1.5 * S, 1.6 * S, 0.3, loc=(0, dy - 0.8, -0.05), seg=20)
    for k in range(7):
        m.box(stone, (0.9 + R() * 0.3, 0.7, 0.12), loc=((R() - 0.5) * 0.3, dy - 1.8 - k * 0.95, 0.0), rot=R() * 0.3)
    fy = dy - 8.0 * S
    picket = L.material('picket', color=(0.85, 0.83, 0.76), rough=0.7)
    for side in (-1, 1):
        for k in range(10):
            x = side * (1.0 + k * 0.55)
            m.box(picket, (0.09, 0.05, 1.0), loc=(x, fy, 0.45))
        m.box(picket, (5.6, 0.05, 0.08), loc=(side * 3.5, fy, 0.75)); m.box(picket, (5.6, 0.05, 0.08), loc=(side * 3.5, fy, 0.3))
    if hero:
        # the bench, the lantern post, the chimney pot up on the hill, flower beds
        m.box(ms['oldWood'], (2.0, 0.5, 0.08), loc=(3.2, dy - 1.4, 0.5)); m.box(ms['oldWood'], (2.0, 0.08, 0.5), loc=(3.2, dy - 1.15, 0.8))
        for x in (2.4, 4.0):
            m.box(ms['oldWood'], (0.08, 0.45, 0.5), loc=(x, dy - 1.4, 0.25))
        m.cyl(L.material('iron', color=(0.08, 0.08, 0.08), metal=0.7, rough=0.4), 0.05, 0.05, 2.2, loc=(-2.2, dy - 2.0, 0))
        m.box(L.material('lantern', color=(0.3, 0.2, 0.1), emission=(1, 0.7, 0.35), emit_strength=2.0), (0.25, 0.25, 0.35), loc=(-2.2, dy - 2.0, 2.3))
        m.cyl(stone, 0.45, 0.55, 2.4, loc=(3.5, 5.5, hill_r * 0.42), seg=10)
        m.cyl(L.material('pot', color=(0.55, 0.3, 0.2), rough=0.8), 0.25, 0.2, 0.5, loc=(3.5, 5.5, hill_r * 0.42 + 2.4), seg=10)
        # a sign on the gate: no admittance except on party business (just a board)
        m.box(ms['planks'], (0.8, 0.04, 0.35), loc=(0.6, fy - 0.05, 1.1))
    flower = [L.material('flowerY', color=(0.95, 0.78, 0.15), rough=0.6), L.material('flowerR', color=(0.85, 0.25, 0.25), rough=0.6),
              L.material('flowerW', color=(0.95, 0.93, 0.88), rough=0.6), L.material('flowerP', color=(0.6, 0.4, 0.8), rough=0.6)]
    for k in range(70 if hero else 25):
        x = (R() - 0.5) * 2 * (fw * 0.9); y = dy - 1.0 - R() * (6.5 * S)
        if abs(x) < 1.0: continue
        m.sphere(flower[k % 4], 0.12 + R() * 0.12, loc=(x, y, 0.25 + R() * 0.3), seg=6, rings=4)
    for k in range(10 if hero else 4):  # little hedges/bushes either side of the door
        x = (R() < 0.5 and -1 or 1) * (fw * (0.5 + R() * 0.45)); y = dy - R() * 2.5
        m.sphere(L.material('bush', color=(0.18, 0.34, 0.12), rough=0.9), 0.6 + R() * 0.5, loc=(x, y, 0.4), scale=(1.2, 1.0, 0.8), seg=10, rings=6)
    return [m.finish(smooth_angle=50)]


def smial_bagend():
    return _smial('smial_bagend', hero=True)


def smial():
    return _smial('smial', hero=False)


def cottage():
    """A Shire cottage: stone walls, thatched roof with a ridge, chimney, round door and round windows."""
    ms = mats()
    m = L.Mesh('cottage')
    w, d, h = 6.0, 9.0, 2.8
    m.gable_walls(L.material('warmPlaster', 'plastered_wall', color=(1.0, 0.93, 0.8), tile=3.0), w, d, h, 3.2, base=-1.0)
    m.box(ms['greyStone'], (w + 0.3, d + 0.3, 1.6), loc=(0, 0, -0.2))
    m.gable(ms['thatch'], w, d, 3.4, loc=(0, 0, h - 0.2), over=0.7, thick=0.45)
    m.box(ms['thatch'], (0.6, d + 1.4, 0.5), loc=(0, 0, h + 3.35))
    for y in (-d / 2 - 0.02, d / 2 + 0.02):  # timber frame on the gable ends
        m.box(ms['oldWood'], (w + 0.1, 0.12, 0.2), loc=(0, y, h))
    m.box(ms['greyStone'], (1.0, 1.0, 5.5), loc=(w / 2 - 0.9, d / 2 - 1.4, 3.2))
    m.cyl(L.material('door', 'brown_planks_05', color=(0.25, 0.55, 0.3), tile=1.2, rough=0.55), 0.85, 0.85, 0.15, loc=(0, -d / 2 - 0.05, 1.0), seg=24, axis=Matrix.Rotation(-math.pi / 2, 4, 'X'))
    glass = L.material('windowWarm', color=(0.25, 0.2, 0.12), emission=(1.0, 0.75, 0.4), emit_strength=0.8)
    for x in (-1.7, 1.7):
        m.cyl(glass, 0.45, 0.45, 0.1, loc=(x, -d / 2 - 0.03, 1.6), seg=18, axis=Matrix.Rotation(-math.pi / 2, 4, 'X'))
    return [m.finish(smooth_angle=40)]


def mill():
    ms = mats()
    m = L.Mesh('mill')
    w, d, h = 8.0, 14.0, 7.0
    m.box(ms['greyStone'], (w, d, h + 1), loc=(0, 0, (h - 1) / 2))
    m.gable(ms['thatch'], w, d, 4.8, loc=(0, 0, h - 0.2), over=0.8, thick=0.5)
    for side in (-1, 1):
        m.prism(ms['planks'], [(-w / 2, 0), (w / 2, 0), (0, 4.8)], 0, 0.15, loc=(0, side * d / 2 - (0.15 if side > 0 else 0), h - 0.2))
    m.box(ms['greyStone'], (1.2, 1.2, 4), loc=(-2, -4, h + 3.5))
    return [m.finish(smooth_angle=40)]


def mill_wheel():
    ms = mats()
    m = L.Mesh('mill_wheel')
    torus_y(m, ms['oldWood'], 3.8, 0.22, 0.6, 0, seg=32, sides=6); torus_y(m, ms['oldWood'], 3.8, 0.22, -0.6, 0, seg=32, sides=6)
    for k in range(16):
        a = k / 16 * TAU
        m.box(ms['oldWood'], (0.25, 1.4, 1.1), loc=(math.cos(a) * 3.9, 0, math.sin(a) * 3.9), tilt=(0, -a))
        if k % 2 == 0:
            m.box(ms['oldWood'], (0.15, 0.15, 7.6), loc=(0, 0.6, 0), tilt=(0, a)); m.box(ms['oldWood'], (0.15, 0.15, 7.6), loc=(0, -0.6, 0), tilt=(0, a))
    m.cyl(ms['oldWood'], 0.35, 0.35, 2.0, loc=(0, -1.0, 0), seg=10, axis=Matrix.Rotation(-math.pi / 2, 4, 'X'))
    return [m.finish(smooth_angle=30)]


# ================================================================ elven architecture (Rivendell)
def _elf_arch(m, mat, x0, x1, y, z0, h, w=0.35, d=0.4):
    """A pointed elvish arch between columns at x0 and x1 (in the XZ plane at y)."""
    n = 10; span = x1 - x0; cx = (x0 + x1) / 2
    pts = []
    for s in (-1, 1):
        for k in range(n + 1):
            t = k / n
            ang = t * math.pi / 2
            x = cx + s * (span / 2) * math.cos(ang) * (1 - 0.15 * t)
            z = z0 + h * math.sin(ang) ** 0.8
            pts.append((x, z)) if s < 0 else pts.insert(n + 1, (x, z))
    path = pts[:n + 1] + list(reversed(pts[n + 1:]))
    for (xa, za), (xb, zb) in zip(path, path[1:]):
        L_ = math.hypot(xb - xa, zb - za)
        m.box(mat, (L_ + 0.05, d, w), loc=((xa + xb) / 2, y, (za + zb) / 2), tilt=(0, -math.atan2(zb - za, xb - xa)))


def elf_hall():
    ms = mats()
    stone, roof = ms['stucco'], L.material('elfRoof', 'roof_slates_02', color=(0.55, 0.78, 0.68), tile=2.0, rough=0.5, double=True)
    gold = L.material('gold', color=(0.95, 0.75, 0.35), rough=0.3, metal=1.0)
    glass = L.material('windowWarm', color=(0.25, 0.2, 0.12), emission=(1.0, 0.78, 0.45), emit_strength=1.0)
    m = L.Mesh('elf_hall')
    w, d, h = 22.0, 12.0, 8.0
    m.box(ms['marble'], (w + 6, d + 8, 1.2), loc=(0, -2, -0.4))           # terrace
    m.box(stone, (w, d, h), loc=(0, 0, h / 2))
    # tall pointed windows along the front, set in shallow recesses
    for k in range(7):
        x = -w / 2 + 2 + k * (w - 4) / 6
        m.box(glass, (1.0, 0.1, 4.2), loc=(x, -d / 2 - 0.02, 4.0))
        _elf_arch(m, stone, x - 0.7, x + 0.7, -d / 2 - 0.08, 6.0, 1.2, w=0.18, d=0.16)
    # an open loggia of slender columns and pointed arches in front of the hall
    ncol = 8; ly = -d / 2 - 3.2
    for k in range(ncol + 1):
        x = -w / 2 + k * w / ncol
        m.cyl(stone, 0.22, 0.26, h - 1.4, loc=(x, ly, 0), seg=10)
        m.cyl(stone, 0.4, 0.25, 0.5, loc=(x, ly, h - 1.9), seg=10)
        if k < ncol:
            _elf_arch(m, stone, x, x + w / ncol, ly, h - 1.4, 1.1)
    m.box(stone, (w + 0.6, 3.6, 0.35), loc=(0, ly + 1.4, h))               # loggia roof / balcony floor
    for k in range(40):                                                      # balustrade
        m.cyl(stone, 0.06, 0.06, 0.8, loc=(-w / 2 + k * w / 39, ly - 0.25, h + 0.17), seg=6)
    m.box(stone, (w + 0.6, 0.15, 0.1), loc=(0, ly - 0.25, h + 1.0))
    # the roof: gently swept (concave) with upturned eaves and a gilded ridge finial at each end
    nseg = 10
    for s in (-1, 1):
        rings_ = []
        for k in range(nseg + 1):
            t = k / nseg
            yy = s * (d / 2 + 1.6) * (1 - t)
            zz = h + 5.2 * (t ** 1.6) + 0.5 * (1 - t) ** 6 * 1.6
            rings_.append([(-w / 2 - 1.4 * (1 - t * 0.3), yy, zz), (w / 2 + 1.4 * (1 - t * 0.3), yy, zz), (w / 2 + 1.4 * (1 - t * 0.3), yy, zz + 0.25), (-w / 2 - 1.4 * (1 - t * 0.3), yy, zz + 0.25)])
        m.loft(roof, rings_, caps=False)
    for x in (-w / 2 - 0.9, w / 2 + 0.9):
        m.cyl(gold, 0.12, 0.02, 2.2, loc=(x, 0, h + 5.4), seg=8)
    m.box(gold, (w + 2.4, 0.2, 0.2), loc=(0, 0, h + 5.45))
    for s in (-1, 1):  # gable ends
        m.prism(stone, [(-w / 2, 0), (w / 2, 0), (0, 5.2)], 0, 0.2, loc=(0, 0, h), rot=0) if False else None
    m.prism(stone, [(-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)], h, h + 0.4)
    for k in range(7):  # back windows
        x = -w / 2 + 2 + k * (w - 4) / 6
        m.box(glass, (1.0, 0.1, 4.2), loc=(x, d / 2 + 0.02, 4.0))
    for y in (-2.5, 2.5):  # side windows
        for s in (-1, 1):
            m.box(glass, (0.1, 1.0, 4.2), loc=(s * (w / 2 + 0.02), y, 4.0))
    for x in (-w / 2, w / 2):  # corner pilasters and a string course
        for y in (-d / 2, d / 2):
            m.box(stone, (0.9, 0.9, h + 0.6), loc=(x, y, h / 2))
    m.box(stone, (w + 0.4, d + 0.4, 0.3), loc=(0, 0, 2.0))
    return [m.finish(smooth_angle=40)]


def elf_tower():
    ms = mats()
    stone = ms['stucco']; roof = L.material('elfRoof', 'roof_slates_02', color=(0.55, 0.78, 0.68), tile=2.0, rough=0.5)
    gold = L.material('gold', color=(0.95, 0.75, 0.35), rough=0.3, metal=1.0)
    glass = L.material('windowWarm', color=(0.25, 0.2, 0.12), emission=(1.0, 0.78, 0.45), emit_strength=1.0)
    m = L.Mesh('elf_tower')
    H = 30.0
    m.loft(stone, [ring(0, 0, -1, 4.2, 12), ring(0, 0, 2, 3.6, 12), ring(0, 0, H, 3.0, 12)])
    for z in (8, 15, 22):
        m.loft(stone, [ring(0, 0, z, 3.6, 12), ring(0, 0, z + 0.4, 3.6, 12)])
        for k in range(4):
            a = k / 4 * TAU + 0.4
            m.box(glass, (0.1, 0.7, 2.2), loc=(math.cos(a) * 3.3, math.sin(a) * 3.3, z + 2.5), rot=a)
    # a balcony ring and the swept spire cap
    m.loft(stone, [ring(0, 0, H, 4.4, 16), ring(0, 0, H + 0.4, 4.4, 16)])
    rings_ = [ring(0, 0, H + 0.4 + 9 * t, 4.6 * (1 - t) ** 1.5 + 0.05, 12) for t in [k / 10 for k in range(11)]]
    m.loft(roof, rings_)
    m.cyl(gold, 0.15, 0.02, 3, loc=(0, 0, H + 9.4), seg=8)
    return [m.finish(smooth_angle=40)]


# ================================================================ Gondor and Rohan
def _gondor(name, w, d, floors, roof='hip'):
    ms = mats()
    st, sl = ms['whiteStone'], ms['slate']
    dark = L.material('windowDark', color=(0.1, 0.1, 0.12), rough=0.25, double=True)
    m = L.Mesh(name)
    fh = 3.4; h = floors * fh + 0.6
    m.box(st, (w, d, h + 2.0), loc=(0, 0, (h - 2.0) / 2))                       # walls, sunk into the slope
    m.box(st, (w + 0.4, d + 0.4, 0.8), loc=(0, 0, -0.6))                         # plinth
    m.box(st, (w + 0.5, d + 0.5, 0.35), loc=(0, 0, h))                           # cornice
    for f in range(1, floors):
        m.box(st, (w + 0.16, d + 0.16, 0.18), loc=(0, 0, f * fh + 0.2))          # string courses
    # tall windows with arched heads (a dark recess, a sill and a keystone) on every side
    def windows(length, axis, sgn):
        n = max(1, int((length - 1.5) // 2.4))
        for f in range(floors):
            z = f * fh + 1.9
            for k in range(n):
                t = (k - (n - 1) / 2) * 2.4
                if f == 0 and k == n // 2 and axis == 'y' and sgn < 0:
                    continue                                                     # the door goes here
                # one flat arched polygon per window (a few triangles: the city has thousands of houses)
                arch = [(-0.42, -0.8), (0.42, -0.8), (0.42, 0.55)] + [(math.cos(q) * 0.42, 0.55 + math.sin(q) * 0.42) for q in (0.6, 1.2, 1.94, 2.54)] + [(-0.42, 0.55)]
                if axis == 'y':
                    pts = [(t + u * -sgn, sgn * (d / 2 + 0.02), z + v) for u, v in arch]
                else:
                    pts = [(sgn * (w / 2 + 0.02), t + u * sgn, z + v) for u, v in arch]
                face = m.bm.faces.new([m.bm.verts.new(p) for p in pts]); face.material_index = m.mi(dark)
    windows(w, 'y', -1); windows(w, 'y', 1); windows(d, 'x', -1); windows(d, 'x', 1)
    door = L.material('doorWood', 'brown_planks_05', color=(0.45, 0.32, 0.22), tile=1.2)
    m.box(door, (1.4, 0.08, 2.5), loc=(0, -d / 2 - 0.03, 1.25))
    m.box(st, (2.0, 0.3, 0.35), loc=(0, -d / 2 - 0.1, 2.7))
    if roof == 'hip':
        r = min(w, d) / 2
        m.loft(sl, [[(-w / 2 - 0.5, -d / 2 - 0.5, h + 0.15), (w / 2 + 0.5, -d / 2 - 0.5, h + 0.15), (w / 2 + 0.5, d / 2 + 0.5, h + 0.15), (-w / 2 - 0.5, d / 2 + 0.5, h + 0.15)],
                    [(0, -d / 2 + r, h + r * 0.75), (0, -d / 2 + r, h + r * 0.75), (0, d / 2 - r, h + r * 0.75), (0, d / 2 - r, h + r * 0.75)]], caps=False)
        m.box(st, (0.8, 0.8, 2.2), loc=(w * 0.25, d * 0.2, h + r * 0.6))          # chimney
    else:
        # flat roof terrace with a parapet, as on the steep upper circles
        m.box(st, (w, d, 0.3), loc=(0, 0, h + 0.15))
        for sx, sy, ln, ax in ((0, -1, w, 'y'), (0, 1, w, 'y'), (-1, 0, d, 'x'), (1, 0, d, 'x')):
            m.box(st, (ln if ax == 'y' else 0.3, ln if ax == 'x' else 0.3, 0.9), loc=(sx * w / 2, sy * d / 2, h + 0.75))
    return [m.finish(smooth_angle=30)]


def gondor_house():
    return _gondor('gondor_house', 8.0, 11.0, 2)


def gondor_house2():
    return _gondor('gondor_house2', 7.0, 9.0, 3, roof='flat')


def white_tower():
    """The Tower of Ecthelion: slender, ribbed, white, with a corbelled gallery, a crown of pinnacles and a
    bright spire 'like a spike of pearl and silver'. Stands at the top of the city."""
    ms = mats()
    st = ms['whiteStone']
    pin = L.material('pinnacle', color=(0.97, 0.97, 0.96), rough=0.2, metal=0.0)
    dark = L.material('windowDark', color=(0.1, 0.1, 0.12), rough=0.25, double=True)
    m = L.Mesh('white_tower')
    H = 92.0
    m.loft(st, [ring(0, 0, -2, 11, 16, rot=TAU / 32), ring(0, 0, 4, 10, 16, rot=TAU / 32), ring(0, 0, 8, 8.6, 16, rot=TAU / 32), ring(0, 0, H, 7.2, 16, rot=TAU / 32)])
    for k in range(8):                                                     # buttress ribs running up the shaft
        a = k / 8 * TAU
        r0, r1 = 8.9, 7.4
        m.loft(st, [[(math.cos(a) * r + math.cos(a + math.pi / 2) * s * 0.55, math.sin(a) * r + math.sin(a + math.pi / 2) * s * 0.55, z)
                     for s, r in ((-1, rr - 0.3), (1, rr - 0.3), (1, rr + 0.7), (-1, rr + 0.7))] for z, rr in ((4, r0 + 0.6), (H - 4, r1))])
    for z in range(14, int(H) - 6, 13):                                    # string courses and tall lancet windows
        rr = 8.6 - (z - 8) * (1.4 / (H - 8))
        m.loft(st, [ring(0, 0, z, rr + 0.25, 16, rot=TAU / 32), ring(0, 0, z + 0.45, rr + 0.25, 16, rot=TAU / 32)])
        for k in range(8):
            a = k / 8 * TAU + TAU / 16
            m.box(dark, (0.3, 1.1, 4.0), loc=(math.cos(a) * (rr + 0.02), math.sin(a) * (rr + 0.02), z + 5.0), rot=a)
    # corbelled gallery near the top, with a parapet of merlons
    m.loft(st, [ring(0, 0, H - 2, 7.4, 16, rot=TAU / 32), ring(0, 0, H, 9.4, 16, rot=TAU / 32), ring(0, 0, H + 0.6, 9.4, 16, rot=TAU / 32), ring(0, 0, H + 0.6, 7.0, 16, rot=TAU / 32)])
    for k in range(24):
        a = k / 24 * TAU
        m.box(st, (0.7, 1.4, 1.5), loc=(math.cos(a) * 9.0, math.sin(a) * 9.0, H + 1.35), rot=a)
    # the upper stage, its crown of eight pinnacles, and the spire
    m.loft(st, [ring(0, 0, H + 0.6, 5.6, 16), ring(0, 0, H + 11, 5.2, 16)])
    for k in range(8):
        a = k / 8 * TAU + TAU / 16
        m.loft(pin, [ring(math.cos(a) * 5.0, math.sin(a) * 5.0, H + 11, 0.7, 6), ring(math.cos(a) * 5.0, math.sin(a) * 5.0, H + 17, 0.05, 6)])
    m.loft(pin, [ring(0, 0, H + 11, 4.6, 16), ring(0, 0, H + 16, 3.2, 16), ring(0, 0, H + 40, 0.15, 16)])
    return [m.finish(smooth_angle=30)]


def citadel_hall():
    """The King's House beside the White Tower: a long hall of white stone, steep slate roof, a portico of
    columns at its east end. Faces -Y (its long axis along Y)."""
    ms = mats()
    st, sl = ms['whiteStone'], ms['slate']
    dark = L.material('windowDark', color=(0.1, 0.1, 0.12), rough=0.25, double=True)
    m = L.Mesh('citadel_hall')
    w, d, h = 22.0, 56.0, 17.0
    m.box(st, (w + 3, d + 3, 1.6), loc=(0, 0, -0.4))
    m.gable_walls(st, w, d, h, 8.0, base=-1.0)
    m.gable(sl, w, d, 8.0, loc=(0, 0, h - 0.1), over=0.8, thick=0.5)
    for k in range(9):                                                      # tall windows along both sides
        y = -d / 2 + 6 + k * (d - 12) / 8
        for sx in (-1, 1):
            m.box(dark, (0.08, 1.6, 7.0), loc=(sx * (w / 2 + 0.01), y, 7.5))
            m.box(st, (0.9, 1.2, h + 1), loc=(sx * (w / 2 + 0.3), y + (d - 12) / 16, h / 2 - 0.5))   # pilasters
    for k in range(6):                                                      # portico
        x = -w / 2 + 2 + k * (w - 4) / 5
        m.cyl(st, 0.9, 0.8, h - 2, loc=(x, -d / 2 - 5, -0.2), seg=12)
    m.box(st, (w + 1, 7, 1.6), loc=(0, -d / 2 - 3.5, h - 1.6))
    m.loft(st, [[(-w / 2 - 0.5, y, h), (w / 2 + 0.5, y, h), (0, y, h + 7.5)] for y in (-d / 2 - 7, -d / 2)])   # pediment
    m.box(L.material('doorDark', color=(0.04, 0.04, 0.05), rough=0.4), (5, 0.2, 9), loc=(0, -d / 2 - 0.1, 4.5))
    return [m.finish(smooth_angle=30)]


def rohan_house():
    ms = mats()
    m = L.Mesh('rohan_house')
    w, d, h = 7.0, 14.0, 3.2
    m.box(ms['oldWood'], (w, d, h + 1), loc=(0, 0, (h - 1) / 2))
    m.gable(ms['thatch'], w, d, 4.5, loc=(0, 0, h - 0.2), over=0.8, thick=0.55)
    for side in (-1, 1):
        m.prism(ms['planks'], [(-w / 2, 0), (w / 2, 0), (0, 4.5)], 0, 0.15, loc=(0, side * d / 2 - (0.15 if side > 0 else 0), h - 0.2))
        # crossed horse-head gable boards
        for s in (-1, 1):
            m.box(ms['oldWood'], (0.25, 0.25, 3.0), loc=(s * 0.55, side * (d / 2 + 0.6), h + 4.6), tilt=(0, s * 0.45))
    m.box(L.material('doorWood', 'brown_planks_05', color=(0.5, 0.35, 0.25), tile=1.2), (1.4, 0.1, 2.2), loc=(0, -d / 2 - 0.05, 1.1), rot=0)
    return [m.finish(smooth_angle=30)]


def meduseld():
    """The Golden Hall: long timber hall on a stone platform, golden thatch, carved gable posts."""
    ms = mats()
    gold_thatch = L.material('goldThatch', 'thatch_roof_angled', color=(1.0, 0.86, 0.5), tile=2.5, emission=(0.35, 0.25, 0.08), emit_strength=0.35)
    gold = L.material('gold', color=(0.95, 0.75, 0.35), rough=0.3, metal=1.0)
    m = L.Mesh('meduseld')
    w, d, h = 16.0, 46.0, 6.5
    m.box(ms['greyStone'], (w + 10, d + 14, 3), loc=(0, -3, -1.5))
    for k in range(14):  # the great stair up to the porch
        m.box(ms['greyStone'], (12, 1.2, 0.35), loc=(0, -d / 2 - 7 - k * 1.2 + 0.6, -0.2 - k * 0.35))
    m.box(ms['oldWood'], (w, d, h + 1), loc=(0, 0, (h - 1) / 2))
    m.gable(gold_thatch, w, d, 9.0, loc=(0, 0, h - 0.2), over=1.4, thick=0.8)
    m.box(gold, (0.5, d + 3, 0.5), loc=(0, 0, h + 9.0))
    # the porch: carved pillars and a gable over the doors
    for x in (-5.5, -2, 2, 5.5):
        m.cyl(ms['oldWood'], 0.45, 0.5, h + 1, loc=(x, -d / 2 - 3, 0), seg=10)
        m.cyl(gold, 0.55, 0.55, 0.3, loc=(x, -d / 2 - 3, h + 0.6), seg=10)
    m.gable(gold_thatch, 14, 6, 4.5, loc=(0, -d / 2 - 2.5, h + 0.6), over=0.5, thick=0.5)
    for s in (-1, 1):  # crossed gable-boards ending in carved horse heads, gilded
        m.box(gold, (0.35, 0.35, 5.0), loc=(s * 0.9, -d / 2 - 5.8, h + 5.6), tilt=(0, s * 0.5))
        m.box(gold, (0.35, 0.35, 6.0), loc=(s * 1.1, d / 2 + 1.0, h + 10.2), tilt=(0, s * 0.5))
    m.box(L.material('doorWood', 'brown_planks_05', color=(0.55, 0.38, 0.25), tile=1.2), (3.2, 0.2, 4.2), loc=(0, -d / 2 - 0.1, 2.1))
    return [m.finish(smooth_angle=30)]


# ================================================================ dwarves: Erebor's gate, Moria's doors, the bridge
def dwarf_statue():
    """Carved dwarf king guarding the gate: angular, faceted stone in the dwarvish manner, both hands on a
    great axe standing before him. About 1/14 of its size here (scaled in JS); faces -Y."""
    ms = mats()
    st = L.material('dwarfStone', 'rock_boulder_dry', color=(0.74, 0.72, 0.69), tile=2.0)
    m = L.Mesh('dwarf_statue')
    oct_ = lambda z, rx, ry, cy=0.0, n=8: ring(0, cy, z, 1.0, n, rot=TAU / 16, sx=rx, sy=ry)
    # stepped plinth
    m.box(st, (3.8, 3.2, 0.5), loc=(0, 0.1, -0.25)); m.box(st, (3.4, 2.8, 0.4), loc=(0, 0.1, 0.2))
    # boots below a long mail coat that flares at the hem
    for sx in (-1, 1):
        m.box(st, (0.62, 1.0, 0.45), loc=(sx * 0.45, -0.35, 0.62))
    m.loft(st, [oct_(0.55, 1.35, 1.0), oct_(0.9, 1.28, 0.95), oct_(1.8, 1.08, 0.82), oct_(2.6, 1.12, 0.85), oct_(3.3, 1.3, 0.9), oct_(3.75, 1.42, 0.85), oct_(3.95, 0.7, 0.55)])
    for z in (0.62, 0.78):  # carved bands on the hem
        m.loft(st, [oct_(z, 1.37, 1.02), oct_(z + 0.08, 1.37, 1.02)])
    m.box(st, (2.3, 1.75, 0.22), loc=(0, 0, 2.2)); m.box(st, (0.5, 0.12, 0.42), loc=(0, -0.92, 2.2))   # belt and buckle
    # pauldrons
    for sx in (-1, 1):
        m.loft(st, [ring(sx * 1.15, 0, 3.35, 0.62, 8, sx=1.0, sy=0.8), ring(sx * 1.2, 0, 3.75, 0.55, 8, sy=0.75), ring(sx * 1.05, 0, 4.0, 0.2, 8)])
    # arms: upper arm down, forearm forward and in, fists on the haft one above the other
    for sx, zf in ((-1, 2.55), (1, 2.05)):
        m.loft(st, [ring(sx * 1.25, 0, 3.4, 0.36, 8), ring(sx * 1.28, -0.1, 2.75, 0.33, 8), ring(sx * 0.9, -0.6, zf + 0.05, 0.27, 8), ring(sx * 0.32, -1.0, zf, 0.24, 8)])
        m.box(st, (0.5, 0.42, 0.42), loc=(sx * 0.15, -1.05, zf))
    # the great axe: haft from the plinth up past the head, a broad double blade
    m.cyl(st, 0.09, 0.09, 4.6, loc=(0, -1.12, 0.4), seg=8)
    for sx in (-1, 1):  # double blade, upright, in the plane of the haft (a thin carved plate)
        blade = [(sx * 0.1, -0.22), (sx * 0.55, -0.42), (sx * 1.0, -0.72), (sx * 1.12, 0.0), (sx * 1.0, 0.72), (sx * 0.55, 0.42), (sx * 0.1, 0.22)]
        if sx < 0: blade = blade[::-1]
        m.loft(st, [[(x, -1.12 + t, 4.2 + z) for x, z in blade] for t in (-0.07, 0.07)])
    m.cyl(st, 0.16, 0.05, 0.4, loc=(0, -1.12, 5.0), seg=8)   # spike on top
    # head and helm
    m.loft(st, [oct_(3.95, 0.4, 0.42), oct_(4.2, 0.48, 0.5), oct_(4.65, 0.5, 0.52), oct_(4.85, 0.46, 0.48)])
    m.box(st, (0.95, 0.3, 0.16), loc=(0, -0.42, 4.55))                                 # heavy brow
    m.box(st, (0.16, 0.25, 0.4), loc=(0, -0.52, 4.35))                                 # nose
    m.loft(st, [oct_(4.55, 0.62, 0.64), oct_(4.7, 0.6, 0.62), oct_(5.0, 0.52, 0.54), oct_(5.25, 0.32, 0.34), oct_(5.4, 0.05, 0.05)])   # helm
    m.loft(st, [oct_(4.52, 0.7, 0.72), oct_(4.62, 0.7, 0.72)])                         # helm rim
    m.box(st, (0.12, 0.2, 0.42), loc=(0, -0.66, 4.45))                                 # nasal guard
    for sx in (-1, 1):
        m.box(st, (0.14, 0.5, 0.5), loc=(sx * 0.55, -0.12, 4.3))                       # cheek guards
    # the great beard: a broad carved fall from the chin to the belt, split into braids at the end
    m.loft(st, [ring(0, -0.42, 4.25, 1.0, 8, rot=TAU / 16, sx=0.5, sy=0.22), ring(0, -0.62, 3.6, 1.0, 8, rot=TAU / 16, sx=0.66, sy=0.3),
                ring(0, -0.86, 2.8, 1.0, 8, rot=TAU / 16, sx=0.56, sy=0.24), ring(0, -0.98, 2.35, 1.0, 8, rot=TAU / 16, sx=0.42, sy=0.18)])
    for k, x in enumerate((-0.3, -0.1, 0.1, 0.3)):
        m.loft(st, [ring(x, -0.98, 2.42, 0.1, 6), ring(x * 1.1, -1.02, 1.75 - (k % 2) * 0.2, 0.06, 6)])
        m.cyl(st, 0.1, 0.1, 0.14, loc=(x * 1.1, -1.02, 1.65 - (k % 2) * 0.2), seg=8)  # braid beads
    for k in range(5):  # carved strands down the beard
        x = -0.36 + k * 0.18
        m.box(st, (0.05, 0.06, 1.5), loc=(x, -0.84 - abs(x) * -0.1, 3.3), tilt=(0.17, 0))
    return [m.finish(smooth_angle=22)]


def bpy_remove(ob):
    import bpy
    bpy.data.objects.remove(ob, do_unlink=True)


def erebor_gate():
    """The Front Gate: a tall carved facade of stepped pillars, the gateway, and a stone bridge.
    Faces south (-Y). The colossal guardians are added by JS from 'dwarf_statue'."""
    ms = mats()
    st = L.material('carved', 'rock_boulder_dry', color=(0.74, 0.72, 0.69), tile=5.0)
    m = L.Mesh('erebor_gate')
    for k in range(-14, 15):
        w = 5.0; hh = 120 - abs(k) * 2.8
        y = 6 + (abs(k) % 3) * 1.5
        m.box(st, (w * 0.9, 20, hh), loc=(k * w, y + 10, hh / 2 - 4))
        if abs(k) > 4:
            m.loft(st, [[(k * w - 2.2, y, hh - 4), (k * w + 2.2, y, hh - 4), (k * w + 2.2, y + 20, hh - 4), (k * w - 2.2, y + 20, hh - 4)],
                        [(k * w, y + 10, hh + 10)] * 4], caps=False)
    # the gateway: a deep square-headed opening in a stepped frame, with a lintel of runes
    for i, (ow, oh) in enumerate([(24, 34), (20, 30), (16, 26)]):
        for s in (-1, 1):
            m.box(st, (2.0, 4, oh), loc=(s * (ow / 2 + 1), 3 + i * 1.5, oh / 2 - 2))
        m.box(st, (ow + 4, 4, 2.2), loc=(0, 3 + i * 1.5, oh - 1))
    m.box(L.material('voidDark', color=(0.01, 0.01, 0.01), rough=1.0), (16, 1, 26), loc=(0, 8.5, 11))
    gold = L.material('gold', color=(0.95, 0.75, 0.35), rough=0.3, metal=1.0)
    m.box(gold, (30, 0.4, 1.4), loc=(0, 0.6, 36))
    # a stone bridge over the Running River in front of the gate and steps down to it
    for k in range(10):
        m.box(ms['greyStone'], (22 - k * 0.4, 2.0, 0.6), loc=(0, -2 - k * 2, -0.3 - k * 0.45))
    return [m.finish(smooth_angle=30)]


def moria_gate():
    """The West-gate: a smooth face of grey stone with two holly-tree pillars, the doors drawn in
    ithildin (emissive), and the stair. Faces west (-X)."""
    m = L.Mesh('moria_gate')
    st = L.material('carved', 'rock_boulder_dry', color=(0.56, 0.56, 0.57), tile=5.0)
    doors = L.material('ithildin', color=(0.18, 0.18, 0.2), rough=0.5, emit_tex=os.path.join(L.TEX, 'ithildin.png'), emit_strength=2.5)
    # the dressed cliff face
    m.box(st, (6, 60, 50), loc=(3, 0, 23))
    # the doors: the ithildin design on a card just in front of the stone (shown additively in JS, so only
    # the glowing lines appear on the rock); marked as a card so finish() keeps its 0..1 UVs
    vs = [m.bm.verts.new(p) for p in [(-0.05, 9, -0.2), (-0.05, -9, -0.2), (-0.05, -9, 17.8), (-0.05, 9, 17.8)]]
    card = m.bm.faces.layers.int.get('card') or m.bm.faces.layers.int.new('card')
    uv = m.bm.loops.layers.uv.verify()
    m.bm.faces.ensure_lookup_table()
    f = m.bm.faces.new(vs); f.material_index = m.mi(doors); f[card] = 1
    for l, t in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        l[uv].uv = t
    # stone steps up to the threshold
    for k in range(6):
        m.box(st, (3.0, 20, 0.6), loc=(-1.5 - k * 3, 0, -0.3 - k * 0.6))
    return [m.finish(smooth_angle=30)]


def dwarf_pillar():
    """A pillar of the Dwarrowdelf: square, chamfered, carved with bands, with a spreading capital."""
    m = L.Mesh('dwarf_pillar')
    st = L.material('hallStone', 'castle_wall_slates', color=(0.55, 0.5, 0.48), tile=3.0)
    H = 60.0
    m.prism(st, [(math.cos(a) * 4.2, math.sin(a) * 4.2) for a in [k / 8 * TAU + TAU / 16 for k in range(8)]], -1, 3)
    m.prism(st, [(math.cos(a) * 3.0, math.sin(a) * 3.0) for a in [k / 8 * TAU + TAU / 16 for k in range(8)]], 3, H - 6)
    for z in range(8, int(H - 8), 9):
        m.prism(st, [(math.cos(a) * 3.3, math.sin(a) * 3.3) for a in [k / 8 * TAU + TAU / 16 for k in range(8)]], z, z + 0.7)
    rings_ = [ring(0, 0, H - 6 + 6 * t, 3.0 + 7 * t ** 2, 8, rot=TAU / 16) for t in [k / 6 for k in range(7)]]
    m.loft(st, rings_)
    return [m.finish(smooth_angle=30)]


def khazad_bridge():
    """The Bridge of Khazad-dûm: a slender arch of stone without kerb or rail, about fifty feet (15 m)
    long, along the X axis, spanning a chasm. Deck at z = 0."""
    m = L.Mesh('khazad_bridge')
    st = L.material('hallStone', 'castle_wall_slates', color=(0.55, 0.5, 0.48), tile=3.0)
    span, wdt = 26.0, 1.3
    n = 24
    rings_ = []
    for k in range(n + 1):
        t = k / n; x = -span / 2 + span * t
        under = -0.6 - 3.5 * (1 - (2 * t - 1) ** 2) ** 0.5 * 0 - 0.6 - 2.8 * (4 * t * (1 - t)) ** 0.3 * 0
        thick = 0.7 + 3.2 * (2 * t - 1) ** 4
        rings_.append([(x, -wdt / 2, 0), (x, wdt / 2, 0), (x, wdt / 2, -thick), (x, -wdt / 2, -thick)])
    m.loft(st, rings_)
    # the abutments: rough rock masses either side
    for s in (-1, 1):
        m.box(st, (12, 30, 40), loc=(s * (span / 2 + 6), 0, -20))
    return [m.finish(smooth_angle=30)]


# ================================================================ figures
def _figure(name, N, E, Rr, mat, disp=0.0, dsize=0.5, subdiv=2):
    ob = L.skin_figure(name + '_s', N, E, Rr, subdiv=subdiv, mat=mat)
    if disp:
        L.displace(ob, disp, dsize)
    m = L.Mesh(name)
    m.merge_object(ob, mat)
    bpy_remove(ob)
    return m


def balrog():
    """Durin's Bane: a huge man-shape of shadow with a mane of fire, horns and vast dark wings.
    About 14 m tall here; faces -Y."""
    body = L.material('balrogSkin', 'dark_rock', color=(0.22, 0.2, 0.19), rough=0.55, emit_tex=os.path.join(L.TEX, 'veins.png'), emit_strength=0.8, tile=4.5)
    horn = L.material('horn', color=(0.04, 0.035, 0.03), rough=0.35)
    wingm = L.material('wing', color=(0.03, 0.025, 0.02), rough=0.8, double=True)
    N = [(0, 0, 0), (0, 0, 6.5), (0, 0.3, 9.5), (0, 0.2, 11.5), (0, -0.4, 13.0),            # 0-4 pelvis..head
         (-1.2, 0, 6.0), (-1.5, 0.3, 3.0), (-1.6, -0.5, 0.0),                             # 5-7 left leg
         (1.2, 0, 6.0), (1.5, 0.3, 3.0), (1.6, -0.5, 0.0),                                # 8-10 right leg
         (-2.4, 0.2, 11.0), (-4.2, -1.2, 9.0), (-5.5, -3.0, 8.0),                         # 11-13 left arm (whip)
         (2.4, 0.2, 11.0), (4.0, -1.8, 12.5), (4.8, -3.0, 14.5)]                         # 14-16 right arm raised (sword)
    E = [(0, 1), (1, 2), (2, 3), (3, 4), (0, 5), (5, 6), (6, 7), (0, 8), (8, 9), (9, 10), (3, 11), (11, 12), (12, 13), (3, 14), (14, 15), (15, 16)]
    Rr = [(1.6, 1.2), (1.5, 1.2), (2.0, 1.4), (1.9, 1.3), (0.9, 0.95), (0.9, 0.9), (0.7, 0.7), (0.6, 0.8), (0.9, 0.9), (0.7, 0.7), (0.6, 0.8),
          (0.7, 0.7), (0.55, 0.55), (0.45, 0.45), (0.7, 0.7), (0.55, 0.55), (0.45, 0.45)]
    m = _figure('balrog', N, E, Rr, body, disp=0.25, dsize=0.6)
    # horns, sweeping back
    for s in (-1, 1):
        rings_ = []
        for k in range(9):
            t = k / 8
            rings_.append(ring(s * (0.6 + 1.8 * t), 0.4 + 1.2 * t ** 2, 13.6 + 1.6 * math.sin(t * 2.2), 0.42 * (1 - t) + 0.03, 6))
        m.loft(horn, rings_)
    # wings: ribbed, membranous, raised and spread
    for s in (-1, 1):
        root = Vector((s * 1.4, 1.0, 11.0))
        tips = [Vector((s * 6, 3, 19)), Vector((s * 16, 6, 22)), Vector((s * 20, 7, 15)), Vector((s * 18, 6, 8)), Vector((s * 12, 4, 3))]
        import bmesh
        # membrane between consecutive bones, scalloped (pulled in towards the root between tips)
        for a, b in zip(tips, tips[1:]):
            mid = (a + b) / 2; scal = mid + (root - mid) * 0.32
            for tri in ((root, a, scal), (root, scal, b)):
                vs = [m.bm.verts.new(p) for p in tri]
                f = m.bm.faces.new(vs); f.material_index = m.mi(wingm)
        for t in tips:  # the bones of the wing
            m.cyl(horn, 0.25, 0.05, (t - root).length, loc=tuple(root), seg=5, axis=(t - root).normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4())
    # the fiery sword in the raised right hand
    m.box(L.material('flameBlade', color=(0.3, 0.05, 0.0), emission=(1.0, 0.45, 0.08), emit_strength=8.0), (0.25, 0.6, 7.0), loc=(5.2, -3.3, 18.0), tilt=(0.25, 0.15))
    return [m.finish(smooth_angle=60)]


def gandalf():
    """Gandalf the Grey, about 1.8 m: robe, hat, beard, staff. Faces +X (towards the Balrog)."""
    robe = L.material('robeGrey', color=(0.55, 0.56, 0.6), rough=0.9)
    beard = L.material('beardWhite', color=(0.88, 0.88, 0.86), rough=0.9)
    skin = L.material('skin', color=(0.8, 0.62, 0.5), rough=0.7)
    wood = mats()['oldWood']
    m = L.Mesh('gandalf')
    rings_ = [ring(0, 0, z, r, 16) for z, r in [(0, 0.48), (0.4, 0.4), (1.0, 0.3), (1.35, 0.24), (1.45, 0.14)]]
    m.loft(robe, rings_)
    m.sphere(skin, 0.13, loc=(0.03, 0, 1.58), seg=12, rings=8)
    m.cyl(robe, 0.42, 0.42, 0.03, loc=(0, 0, 1.66), seg=20)                  # brim
    m.loft(robe, [ring(0, 0, 1.68, 0.17, 12), ring(-0.08, 0, 2.15, 0.02, 12)])  # pointed hat, bent back
    m.loft(beard, [ring(0.12, 0, 1.55, 0.1, 8, sx=0.6), ring(0.15, 0, 1.15, 0.02, 8, sx=0.6)])
    m.cyl(wood, 0.025, 0.02, 2.0, loc=(0.3, -0.25, 0.1), seg=6)
    m.sphere(L.material('staffLight', color=(1, 1, 1), emission=(0.9, 0.95, 1.0), emit_strength=12.0), 0.07, loc=(0.3, -0.25, 2.12), seg=8, rings=6)
    m.cyl(L.material('glamdring', color=(0.85, 0.88, 0.95), rough=0.15, metal=1.0), 0.02, 0.01, 0.9, loc=(0.3, 0.25, 0.9), seg=4, axis=Matrix.Rotation(-0.6, 4, 'Y'))
    return [m.finish(smooth_angle=60)]


def ent():
    """An Ent: tree-like giant, bark skin, mossy beard, leafy crown. ~14 m. Faces -Y."""
    ms = mats()
    bark = L.material('entBark', 'bark_brown_02', color=(0.9, 0.82, 0.7), tile=1.2)
    moss = L.material('moss', color=(0.32, 0.38, 0.18), rough=0.95)
    eye = L.material('entEye', color=(0.2, 0.3, 0.1), emission=(0.75, 1.0, 0.5), emit_strength=3.0)
    # tall and lean like Treebeard: long legs rooted in splayed toes, a narrow trunk-body, long arms
    N = [(0, 0, 6.6), (0, 0.15, 9.0), (0, 0.1, 11.3), (0, -0.1, 12.3), (0, -0.25, 13.7),            # 0-4 hips..head
         (-0.75, 0, 6.3), (-0.95, -0.35, 3.4), (-1.05, 0.1, 0.1),                                 # 5-7 left leg
         (0.75, 0, 6.3), (0.95, 0.3, 3.4), (1.1, -0.2, 0.1),                                      # 8-10 right leg
         (-1.15, 0, 11.4), (-2.0, -0.5, 8.9), (-2.4, -1.1, 6.6),                                  # 11-13 arms
         (1.15, 0, 11.4), (2.1, -0.7, 9.1), (2.6, -1.5, 7.2)]
    E = [(0, 1), (1, 2), (2, 3), (3, 4), (0, 5), (5, 6), (6, 7), (0, 8), (8, 9), (9, 10), (2, 11), (11, 12), (12, 13), (2, 14), (14, 15), (15, 16)]
    Rr = [(0.85, 0.75), (0.8, 0.72), (0.88, 0.78), (0.5, 0.5), (0.52, 0.6), (0.5, 0.5), (0.36, 0.36), (0.34, 0.42), (0.5, 0.5), (0.36, 0.36), (0.34, 0.42),
          (0.3, 0.3), (0.24, 0.24), (0.18, 0.18), (0.3, 0.3), (0.24, 0.24), (0.18, 0.18)]
    m = _figure('ent', N, E, Rr, bark, disp=0.18, dsize=0.35)
    random.seed(3); R = random.random
    # twig fingers and toes, a crown of branches, a mossy beard, glowing eyes
    for hand in (Vector((-2.4, -1.1, 6.6)), Vector((2.6, -1.5, 7.2))):              # long twig fingers
        for k in range(6):
            d = Vector((R() - 0.5, R() - 0.5, -1.0)).normalized()
            m.cyl(bark, 0.08, 0.01, 1.6 + R() * 0.6, loc=tuple(hand), seg=4, axis=d.to_track_quat('Z', 'Y').to_matrix().to_4x4())
    for foot in (Vector((-1.05, 0.1, 0.1)), Vector((1.1, -0.2, 0.1))):                # root toes
        for k in range(5):
            a = R() * TAU
            d = Vector((math.cos(a), math.sin(a), -0.25)).normalized()
            m.cyl(bark, 0.14, 0.02, 1.4 + R() * 0.8, loc=tuple(foot), seg=4, axis=d.to_track_quat('Z', 'Y').to_matrix().to_4x4())
    m.loft(bark, [ring(0, -0.6, 13.6, 0.16, 6), ring(0, -1.05, 13.25, 0.05, 6)])    # long nose
    m.box(bark, (0.9, 0.25, 0.14), loc=(0, -0.58, 13.85), tilt=(0.3, 0))              # heavy brow
    for k in range(14):                                                               # branches of the crown
        d = Vector((R() - 0.5, R() - 0.5, 0.9)).normalized()
        m.cyl(bark, 0.15, 0.02, 1.8 + R() * 2.0, loc=(0, -0.1, 14.0), seg=4, axis=d.to_track_quat('Z', 'Y').to_matrix().to_4x4())
    leaf = L.material('leafGreen', alpha_tex=os.path.join(L.TEX, 'leaves', 'sprig_a.png'), color=(0.85, 0.95, 0.75), rough=0.75)
    for k in range(44):
        c = Vector(((R() - 0.5) * 3.4, (R() - 0.5) * 2.6, 14.6 + R() * 2.4))
        L._card(m, leaf, c, 0.8 + R() * 0.6, R() * TAU, droop=R() * 0.6)
    for k in range(7):                                                                # a beard of moss and twigs
        x = (k - 3) * 0.12
        m.loft(moss, [ring(x, -0.62, 13.15, 0.16, 6, sy=0.6), ring(x * 1.3, -0.72, 11.4 - abs(k - 3) * 0.3, 0.08, 6), ring(x * 1.4, -0.7, 10.0 - abs(k - 3) * 0.4, 0.02, 6)])
    for s in (-1, 1):
        m.sphere(eye, 0.1, loc=(s * 0.22, -0.62, 13.62), seg=8, rings=6)
    return [m.finish(smooth_angle=60)]


def king_statue():
    """A king of the Argonath: helmed and crowned, in a long pleated robe and cloak, an axe in the right hand,
    the left hand raised palm outward in warning. Carved, faceted stone. 10 m tall here (scaled in JS). Faces -Y."""
    st = L.material('kingStone', 'rock_boulder_dry', color=(0.7, 0.69, 0.66), tile=2.5)
    m = L.Mesh('king_statue')
    el = lambda z, rx, ry, cy=0.0, n=12: ring(0, cy, z, 1.0, n, rot=TAU / 24, sx=rx, sy=ry)
    m.box(st, (4.6, 4.0, 1.0), loc=(0, 0.1, -0.5)); m.box(st, (4.2, 3.6, 0.35), loc=(0, 0.1, 0.17))
    # robe from hem to shoulders, and the neck
    m.loft(st, [el(0.3, 1.62, 1.25), el(1.2, 1.5, 1.15), el(3.0, 1.34, 1.02), el(5.0, 1.2, 0.88), el(6.2, 1.28, 0.86),
                el(7.0, 1.42, 0.82), el(7.45, 1.38, 0.72), el(7.7, 0.55, 0.48)])
    # carved pleats: triangular ridges running down the front and sides of the robe
    for k in range(-4, 5):
        a = -math.pi / 2 + k * 0.22
        for z0, z1, rx, ry in ((0.35, 4.9, 1.45, 1.1),):
            px, py = math.cos(a) * rx, math.sin(a) * ry
            ca, sa = math.cos(a - math.pi / 2), math.sin(a - math.pi / 2)
            tri = [(-0.12, 0), (0.12, 0), (0, 0.16)]
            m.prism(st, [(px + x * ca - y * sa, py + x * sa + y * ca) for x, y in tri], z0, z1 - abs(k) * 0.2)
    m.loft(st, [el(4.95, 1.24, 0.92), el(5.25, 1.24, 0.92)])                            # girdle
    m.box(st, (0.32, 0.12, 1.4), loc=(0, -0.95, 4.3))                                   # hanging end of the girdle
    # cloak falling behind from the shoulders to the plinth
    m.loft(st, [[(x * 1.45, 0.62 + 0.25 * abs(x) ** 2, 7.3) for x in (-1, -0.5, 0, 0.5, 1)] + [(x * 1.45, 0.82 + 0.25 * abs(x) ** 2, 7.3) for x in (1, 0.5, 0, -0.5, -1)],
                [(x * 1.75, 1.15 + 0.3 * abs(x) ** 2, 0.4) for x in (-1, -0.5, 0, 0.5, 1)] + [(x * 1.75, 1.35 + 0.3 * abs(x) ** 2, 0.4) for x in (1, 0.5, 0, -0.5, -1)]])
    # right arm down, the fist on the axe; the axe stands at his side, its blade forward
    m.loft(st, [ring(1.38, 0, 7.25, 0.42, 8), ring(1.58, -0.05, 6.2, 0.36, 8), ring(1.6, -0.25, 5.4, 0.32, 8), ring(1.5, -0.62, 4.75, 0.3, 8)])
    m.box(st, (0.5, 0.5, 0.55), loc=(1.48, -0.78, 4.6))
    m.cyl(st, 0.1, 0.1, 7.4, loc=(1.48, -0.8, 0.35), seg=8)
    blade = [(0.15, -0.5), (-0.4, -0.75), (-1.15, -1.05), (-1.3, 0.0), (-1.15, 1.05), (-0.4, 0.75), (0.15, 0.5)]
    m.loft(st, [[(1.48 + t, -0.8 + y, 7.0 + z) for y, z in blade] for t in (-0.08, 0.08)])
    m.cyl(st, 0.14, 0.03, 0.5, loc=(1.48, -0.8, 7.75), seg=8)
    # left arm raised, palm outward (toward the north, -Y)
    m.loft(st, [ring(-1.38, 0, 7.25, 0.42, 8), ring(-1.62, -0.1, 7.9, 0.36, 8), ring(-1.72, -0.38, 8.8, 0.32, 8), ring(-1.76, -0.62, 9.9, 0.27, 8)])
    m.box(st, (0.62, 0.2, 0.72), loc=(-1.76, -0.7, 10.35))                              # palm
    for k in range(4):
        m.box(st, (0.13, 0.17, 0.5), loc=(-1.98 + k * 0.15, -0.7, 10.95 - abs(k - 1.5) * 0.06))   # fingers
    m.box(st, (0.14, 0.17, 0.36), loc=(-1.42, -0.7, 10.3), rot=0.0, tilt=(0, -0.6))  # thumb
    # head: faceted, with brow, nose and a short square beard
    m.loft(st, [el(7.7, 0.44, 0.46, n=8), el(8.0, 0.5, 0.52, n=8), el(8.75, 0.52, 0.55, n=8), el(9.05, 0.48, 0.5, n=8)])
    m.box(st, (0.9, 0.22, 0.14), loc=(0, -0.5, 8.62)); m.box(st, (0.16, 0.22, 0.38), loc=(0, -0.58, 8.4))
    m.loft(st, [ring(0, -0.38, 8.2, 1.0, 8, sx=0.42, sy=0.2), ring(0, -0.52, 7.65, 1.0, 8, sx=0.36, sy=0.18), ring(0, -0.55, 7.25, 1.0, 8, sx=0.22, sy=0.12)])
    # helm with cheek guards, a crown about it and a tall crest
    m.loft(st, [el(8.65, 0.6, 0.62, n=12), el(9.0, 0.6, 0.62, n=12), el(9.45, 0.5, 0.52, n=12), el(9.75, 0.28, 0.3, n=12), el(9.9, 0.05, 0.05, n=12)])
    for sx in (-1, 1):
        m.box(st, (0.14, 0.55, 0.62), loc=(sx * 0.55, -0.12, 8.35))
    m.loft(st, [el(9.0, 0.66, 0.68, n=16), el(9.32, 0.68, 0.7, n=16)])
    for k in range(9):
        a = -math.pi / 2 + (k - 4) * 0.36
        m.loft(st, [ring(math.cos(a) * 0.67, math.sin(a) * 0.69, 9.3, 0.1, 4), ring(math.cos(a) * 0.72, math.sin(a) * 0.74, 9.75 - abs(k - 4) * 0.05, 0.01, 4)])
    m.loft(st, [ring(0, 0.1, 9.8, 0.08, 6), ring(0, 0.25, 10.4, 0.05, 6)])   # crest spike
    return [m.finish(smooth_angle=22)]


ASSETS = {'smial_bagend': smial_bagend, 'smial': smial, 'cottage': cottage, 'mill': mill, 'mill_wheel': mill_wheel,
          'elf_hall': elf_hall, 'elf_tower': elf_tower, 'gondor_house': gondor_house, 'gondor_house2': gondor_house2, 'white_tower': white_tower, 'citadel_hall': citadel_hall,
          'rohan_house': rohan_house, 'meduseld': meduseld, 'dwarf_statue': dwarf_statue, 'erebor_gate': erebor_gate,
          'moria_gate': moria_gate, 'dwarf_pillar': dwarf_pillar, 'khazad_bridge': khazad_bridge, 'balrog': balrog,
          'gandalf': gandalf, 'ent': ent, 'king_statue': king_statue}
