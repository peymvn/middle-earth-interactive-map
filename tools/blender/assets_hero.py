"""Hero landmark models. Each function builds one GLB (returns its objects).
Frame: +X east, +Y north, +Z up, metres; the landmark's map point is the origin."""
import math, random
from mathutils import Vector, Matrix
import melib as L
from assets_kit import mats

TAU = math.tau


def ring(cx, cy, z, r, n, rot=0.0, sx=1.0, sy=1.0):
    return [(cx + math.cos(rot + i / n * TAU) * r * sx, cy + math.sin(rot + i / n * TAU) * r * sy, z) for i in range(n)]


# ================================================================ Orthanc
def orthanc():
    ms = mats()
    ob = ms['obsidian']
    dark = ms['darkStone']
    glow = L.material('windowGlow', color=(0.05, 0.03, 0.02), emission=(1.0, 0.55, 0.2), emit_strength=3.0)
    m = L.Mesh('orthanc')
    H = 118.0
    # octagonal plinth with three steps
    for k, (r, z0, z1) in enumerate([(38, -6, 1.2), (34, 1.2, 2.4), (31, 2.4, 3.6)]):
        m.prism(dark, [(math.cos(i / 8 * TAU + TAU / 16) * r, math.sin(i / 8 * TAU + TAU / 16) * r) for i in range(8)], z0, z1)
    # the core and four many-sided piers fused into it: deep grooves between the piers, a flared foot,
    # and knife-edged ridges running up each pier into its horn
    core = [ring(0, 0, z, 11.0 - z * 0.008, 16) for z in (3.6, H)]
    m.loft(ob, core)
    for k in range(4):
        a = TAU * k / 4 + TAU / 8
        cx, cy = math.cos(a) * 13.5, math.sin(a) * 13.5
        rings = []
        for z, f in ((3.6, 1.42), (8, 1.22), (16, 1.06), (40, 1.0), (80, 1.0), (H, 1.0)):
            r = (10.6 - z * 0.012) * f
            rings.append(ring(cx * (1 + (f - 1) * 0.6), cy * (1 + (f - 1) * 0.6), z, r, 7, rot=a))
        steps = 16
        for s_ in range(1, steps + 1):
            t = s_ / steps
            out = 13.5 + 15 * math.sin(t * math.pi * 0.55) - 4 * t ** 3
            z = H + 46 * t
            r = (9.2 * (1 - t) ** 1.35) + 0.12
            rings.append(ring(math.cos(a) * out, math.sin(a) * out, z, r, 7, rot=a + t * 0.4))
        m.loft(ob, rings)
        # knife-edged ridges (triangular in section) on the pier's three outer faces
        for j_ in (-1, 0, 1):
            ra = a + j_ * TAU / 7
            px, py = cx + math.cos(ra) * 10.2, cy + math.sin(ra) * 10.2
            tri = [(-0.9, 0), (0.9, 0), (0, 1.6)]
            ca, sa = math.cos(ra - math.pi / 2), math.sin(ra - math.pi / 2)
            m.prism(ob, [(px + x * ca - y * sa, py + x * sa + y * ca) for x, y in tri], 14, H - 4)
        # window slits at many heights, glowing faintly
        for z in (22, 37, 52, 67, 82, 97):
            wa = a + (0.3 if (z // 15) % 2 else -0.3)
            wx, wy = cx + math.cos(wa) * (10.6 - z * 0.012 + 0.05), cy + math.sin(wa) * (10.6 - z * 0.012 + 0.05)
            m.box(glow, (0.25, 1.0, 3.2), loc=(wx, wy, z), rot=wa)
    # the floor between the horns, written with strange signs
    m.prism(ms['marble'], [(math.cos(i / 16 * TAU) * 15.4, math.sin(i / 16 * TAU) * 15.4) for i in range(16)], H - 1, H)
    # the great stair: 27 steps climbing from the plain to the door on the east side
    for s in range(27):
        z0 = 3.6 + s * 0.55
        m.box(dark, (2.4, 14, 0.6), loc=(56 - s * 1.2, 0, z0 + 0.3))
        m.box(dark, (2.4, 14, z0 + 6), loc=(56 - s * 1.2, 0, (z0 - 6) / 2), bevel=0)
    for s in range(27):  # stepped balustrades on both sides of the stair
        z0 = 3.6 + s * 0.55
        for side in (-1, 1):
            m.box(dark, (1.2, 1.2, 1.6), loc=(56 - s * 1.2, side * 7.6, z0 + 1.4))
    # landing and the door: a tall pointed arch, deeply recessed
    m.box(dark, (8, 14, 2), loc=(23.5, 0, 3.6 + 27 * 0.55 - 1))
    zd = 3.6 + 27 * 0.55
    m.box(L.material('doorDark', color=(0.03, 0.03, 0.035), rough=0.4), (0.6, 5.0, 10.0), loc=(20.1, 0, zd + 5))
    for side in (-1, 1):
        m.box(ob, (2.0, 1.4, 12), loc=(20.6, side * 3.3, zd + 6))
    m.box(ob, (2.0, 8.0, 1.6), loc=(20.6, 0, zd + 12.4))
    # Saruman's balcony above the door
    m.box(dark, (5.5, 10, 0.8), loc=(21.5, 0, zd + 18))
    for i in range(9):
        m.cyl(dark, 0.18, 0.18, 1.2, loc=(24, -4 + i, zd + 18.4), seg=6)
    m.box(dark, (0.4, 10, 0.3), loc=(24, 0, zd + 19.7))
    return [m.finish(smooth_angle=35)]


# ================================================================ Barad-dûr
def barad_dur():
    ms = mats()
    ob, ds = ms['obsidian'], ms['darkStone']
    fire = L.material('forgeGlow', color=(0.1, 0.02, 0.0), emission=(1.0, 0.35, 0.05), emit_strength=6.0)
    m = L.Mesh('barad_dur')
    random.seed(9); R = random.random
    # stepped, buttressed foundations
    z = -10
    for r, h in [(170, 70), (138, 60), (110, 55)]:
        m.prism(ds, [(math.cos(i / 12 * TAU) * r, math.sin(i / 12 * TAU) * r) for i in range(12)], z, z + h)
        for i in range(12):
            a = i / 12 * TAU + TAU / 24
            m.box(ob, (r * 0.32, 12, h * 1.25), loc=(math.cos(a) * r * 0.96, math.sin(a) * r * 0.96, z + h * 0.45), rot=a, tilt=(0, 0.22))
        z += h
    # the shaft: tapering, fluted, with ledges and outward-raking spikes
    r = 88
    for k in range(10):
        h = 46; r2 = r * 0.91
        m.loft(ob, [ring(0, 0, z, r, 8, rot=TAU / 16), ring(0, 0, z + h, r2, 8, rot=TAU / 16)])
        for i in range(8):
            a = i / 8 * TAU
            m.box(ds, (6, r * 0.55, h * 1.02), loc=(math.cos(a) * r * 0.92, math.sin(a) * r * 0.92, z + h / 2), rot=a)
            if k % 2:
                aa = a + TAU / 16
                rings = [ring(math.cos(aa) * (r * 0.95 + 30 * t), math.sin(aa) * (r * 0.95 + 30 * t), z + h * 0.35 + 26 * t ** 1.4, 4.5 * (1 - t) + 0.15, 4, rot=aa) for t in [q / 5 for q in range(6)]]
                m.loft(ob, rings)
        m.prism(ds, [(math.cos(i / 8 * TAU + TAU / 16) * r2 * 1.1, math.sin(i / 8 * TAU + TAU / 16) * r2 * 1.1) for i in range(8)], z + h, z + h + 3)
        # glowing slit windows
        for i in range(8):
            a = i / 8 * TAU + TAU / 16 + 0.18
            m.box(fire, (0.6, 2.5, 7), loc=(math.cos(a) * r2 * 1.0, math.sin(a) * r2 * 1.0, z + h * 0.5), rot=a)
        z += h; r = r2
    top = z
    # the crown: two great prongs rising like a forked iron crown around the Eye, each with a row of
    # backward-raking barbs on its outer edge
    def prong_pt(s_, t):
        x = s_ * (28 + 58 * math.sin(t * math.pi * 0.75) - 34 * t ** 2.2)
        return x, top - 20 + 250 * t
    for s_ in (-1, 1):
        rings = []
        n = 26
        for i in range(n + 1):
            t = i / n
            x, zz = prong_pt(s_, t)
            rr = 20 * (1 - t) ** 1.1 + 0.6
            rings.append(ring(x, 0, zz, rr, 6, rot=TAU / 12, sy=0.7))
        m.loft(ob, rings)
        for i in range(3, n - 3, 2):
            t = i / n
            x, zz = prong_pt(s_, t)
            rr = 20 * (1 - t) ** 1.1
            # a flat blade-like barb: pointing outward and up
            base = Vector((x + s_ * rr * 0.8, 0, zz))
            tip = base + Vector((s_ * (18 + 14 * (1 - t)), 0, 22 + 10 * (1 - t)))
            w = 3.2 * (1 - t * 0.6)
            m.loft(ob, [[(base.x, -w, base.z - w), (base.x, w, base.z - w), (base.x, w, base.z + w), (base.x, -w, base.z + w)],
                        [(tip.x, -0.2, tip.z - 0.2), (tip.x, 0.2, tip.z - 0.2), (tip.x, 0.2, tip.z + 0.2), (tip.x, -0.2, tip.z + 0.2)]])
    # a ring of lesser spires around the crown's base, all raking outward the same way
    for i in range(8):
        a = i / 8 * TAU + TAU / 16
        bx, by = math.cos(a) * r * 0.9, math.sin(a) * r * 0.9
        rings = [ring(bx + math.cos(a) * 14 * t ** 1.5, by + math.sin(a) * 14 * t ** 1.5, top + 80 * t, 7 * (1 - t) + 0.2, 4, rot=a) for t in [k / 6 for k in range(7)]]
        m.loft(ob, rings)
    return [m.finish(smooth_angle=30)]


ASSETS = {'orthanc': orthanc, 'barad_dur': barad_dur}
