"""Small modelling library for building the 3D landmarks in headless Blender.

Conventions: Blender units are metres, +X east, +Y north, +Z up (the glTF exporter turns that into
three.js' +X east, -Z north, +Y up, which is what web/js/three expects). Ground level is z = 0;
buildings get foundations that reach below 0 so they sit on slopes.

A `Mesh` collects geometry in one bmesh with per-face materials; `finish()` makes world-scale box UVs
(so textures tile at their real size, see TILE) and turns it into a Blender object.
"""
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TEX = os.path.join(ROOT, 'sources', 'polyhaven', 'tex512')
MOD = os.path.join(ROOT, 'sources', 'polyhaven', 'mod')


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


# ------------------------------------------------------------------ materials
_mats = {}


def _img(path, colorspace='sRGB'):
    im = bpy.data.images.load(path, check_existing=True)
    im.colorspace_settings.name = colorspace
    return im


def material(name, tex=None, color=(1, 1, 1), rough=0.85, metal=0.0, tile=2.0, emission=None, emit_tex=None,
             emit_strength=1.0, alpha_tex=None, normal=True, double=False, use_arm=True):
    """PBR material. tex = Poly Haven set name in tex512/ (diff/nor/arm). tile = metres per texture repeat."""
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m['tile'] = tile
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if tex:
        d = os.path.join(TEX, tex)
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = _img(os.path.join(d, 'diff.jpg'))
        if color != (1, 1, 1):
            mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1.0
            nt.links.new(t.outputs['Color'], mix.inputs[6]); mix.inputs[7].default_value = (*color, 1)
            nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
        else:
            nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
        if normal and os.path.exists(os.path.join(d, 'nor.jpg')):
            n = nt.nodes.new('ShaderNodeTexImage'); n.image = _img(os.path.join(d, 'nor.jpg'), 'Non-Color')
            nm = nt.nodes.new('ShaderNodeNormalMap')
            nt.links.new(n.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
        if use_arm and os.path.exists(os.path.join(d, 'arm.jpg')):
            a = nt.nodes.new('ShaderNodeTexImage'); a.image = _img(os.path.join(d, 'arm.jpg'), 'Non-Color')
            sep = nt.nodes.new('ShaderNodeSeparateColor')
            nt.links.new(a.outputs['Color'], sep.inputs['Color'])
            nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
            # (the packed metallic channel is not used: stone, wood and plaster are dielectric)
    if alpha_tex:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = _img(alpha_tex)
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
        nt.links.new(t.outputs['Color'], mix.inputs[6]); mix.inputs[7].default_value = (*color, 1)
        nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
        nt.links.new(t.outputs['Alpha'], bsdf.inputs['Alpha'])
        m.blend_method = 'CLIP'; m.alpha_threshold = 0.45
        double = True
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1)
        bsdf.inputs['Emission Strength'].default_value = emit_strength
    if emit_tex:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = _img(emit_tex)
        nt.links.new(t.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = emit_strength
    m.use_backface_culling = not double
    _mats[name] = m
    return m


# ------------------------------------------------------------------ mesh builder
class Mesh:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.mats = []

    def mi(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def _add(self, geom_verts, mat, matrix):
        bmesh.ops.transform(self.bm, matrix=matrix, verts=geom_verts)
        idx = self.mi(mat)
        faces = {f for v in geom_verts for f in v.link_faces}
        for f in faces:
            f.material_index = idx
        return faces

    # primitives (centred at origin, then transformed) -----------------------------------------
    def box(self, mat, size, loc=(0, 0, 0), rot=0.0, bevel=0.0, tilt=(0, 0)):
        r = bmesh.ops.create_cube(self.bm, size=1.0)
        vs = r['verts']
        bmesh.ops.scale(self.bm, vec=Vector(size), verts=vs)
        if bevel > 0:
            edges = list({e for v in vs for e in v.link_edges})
            bmesh.ops.bevel(self.bm, geom=edges, offset=bevel, segments=1, affect='EDGES', profile=0.5)
        M = Matrix.Translation(loc) @ Matrix.Rotation(rot, 4, 'Z') @ Matrix.Rotation(tilt[0], 4, 'X') @ Matrix.Rotation(tilt[1], 4, 'Y')
        return self._add(r['verts'], mat, M)

    def _fresh(self):
        # vertices created since the last call (bmesh keeps insertion order)
        n0 = getattr(self, '_n', 0)
        self.bm.verts.ensure_lookup_table()
        vs = [v for v in self.bm.verts[n0:]]
        self._n = len(self.bm.verts)
        return vs

    def cyl(self, mat, r1, r2, h, loc=(0, 0, 0), seg=16, rot=0.0, caps=True, axis=None):
        vs = bmesh.ops.create_cone(self.bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=h)['verts']
        M = Matrix.Translation(loc) @ Matrix.Rotation(rot, 4, 'Z')
        if axis is not None:
            M = M @ axis
        M = M @ Matrix.Translation((0, 0, h / 2))
        return self._add(vs, mat, M)

    def sphere(self, mat, r, loc=(0, 0, 0), scale=(1, 1, 1), seg=16, rings=10):
        vs = bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=rings, radius=r)['verts']
        M = Matrix.Translation(loc) @ Matrix.Diagonal((*scale, 1))
        return self._add(vs, mat, M)

    def prism(self, mat, pts, z0, z1, loc=(0, 0, 0), rot=0.0):
        """Extrude a 2D polygon [(x, y)...] from z0 to z1."""
        vs0 = [self.bm.verts.new((x, y, z0)) for x, y in pts]
        vs1 = [self.bm.verts.new((x, y, z1)) for x, y in pts]
        n = len(pts)
        self.bm.faces.new(list(reversed(vs0)))
        self.bm.faces.new(vs1)
        for i in range(n):
            j = (i + 1) % n
            self.bm.faces.new((vs0[i], vs0[j], vs1[j], vs1[i]))
        M = Matrix.Translation(loc) @ Matrix.Rotation(rot, 4, 'Z')
        return self._add(vs0 + vs1, mat, M)

    def loft(self, mat, rings, caps=True, loc=(0, 0, 0), rot=0.0):
        """Skin between rings: each ring is a list of (x, y, z) with the same vertex count."""
        R = [[self.bm.verts.new(p) for p in ring] for ring in rings]
        n = len(rings[0])
        for a, b in zip(R, R[1:]):
            for i in range(n):
                j = (i + 1) % n
                self.bm.faces.new((a[i], a[j], b[j], b[i]))
        if caps:
            self.bm.faces.new(list(reversed(R[0])))
            if len(set(tuple(round(c, 4) for c in v.co) for v in R[-1])) > 2:
                self.bm.faces.new(R[-1])
        M = Matrix.Translation(loc) @ Matrix.Rotation(rot, 4, 'Z')
        return self._add([v for r_ in R for v in r_], mat, M)

    def gable(self, mat, w, d, h, loc=(0, 0, 0), rot=0.0, over=0.5, thick=0.25):
        """Pitched roof over a w (x) by d (y) footprint, ridge along y, with eaves and thickness."""
        W, D = w / 2 + over, d / 2 + over
        allv = []
        # two sloped slabs
        for s in (-1, 1):
            p = [(0, -D, h), (s * W, -D, 0), (s * W, D, 0), (0, D, h)]
            q = [(x, y, z + thick) for x, y, z in p]
            ring = [Vector(v) for v in p]
            vs = [self.bm.verts.new(v) for v in p] + [self.bm.verts.new(v) for v in q]
            allv += vs
            fs = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
            for f in fs:
                try:
                    self.bm.faces.new([vs[i] for i in (f if s > 0 else f[::-1])])
                except ValueError:
                    pass
        M = Matrix.Translation(loc) @ Matrix.Rotation(rot, 4, 'Z')
        return self._add(allv, mat, M)

    def gable_walls(self, mat, w, d, h_wall, h_roof, loc=(0, 0, 0), rot=0.0, base=-1.0):
        """House body with triangular gable ends (walls up to the roof)."""
        W, D = w / 2, d / 2
        pts = [(-W, base), (W, base), (W, h_wall), (0, h_wall + h_roof), (-W, h_wall)]
        vs0 = [self.bm.verts.new((x, -D, z)) for x, z in pts]
        vs1 = [self.bm.verts.new((x, D, z)) for x, z in pts]
        self.bm.faces.new(vs0)
        self.bm.faces.new(list(reversed(vs1)))
        n = len(pts)
        for i in range(n):
            j = (i + 1) % n
            self.bm.faces.new((vs0[j], vs0[i], vs1[i], vs1[j]))
        M = Matrix.Translation(loc) @ Matrix.Rotation(rot, 4, 'Z')
        return self._add(vs0 + vs1, mat, M)

    def merge_object(self, obj, mat=None, matrix=None):
        """Append another object's evaluated mesh (modifiers applied)."""
        dg = bpy.context.evaluated_depsgraph_get()
        ev = obj.evaluated_get(dg)
        me = ev.to_mesh()
        n0 = len(self.bm.verts)
        tmp = bmesh.new(); tmp.from_mesh(me)
        M = (matrix or Matrix()) @ obj.matrix_world
        bmesh.ops.transform(tmp, matrix=M, verts=tmp.verts)
        midx = {i: self.mi(mat or (obj.material_slots[i].material if i < len(obj.material_slots) else None)) for i in range(max(1, len(obj.material_slots)))}
        for f in tmp.faces:
            f.material_index = midx.get(f.material_index, 0)
        me2 = bpy.data.meshes.new('tmp'); tmp.to_mesh(me2); tmp.free()
        self.bm.from_mesh(me2)
        ev.to_mesh_clear()
        bpy.data.meshes.remove(me2)
        self._n = len(self.bm.verts)

    def finish(self, smooth_angle=None):
        bm = self.bm
        bm.normal_update()
        uv = bm.loops.layers.uv.verify()
        card = bm.faces.layers.int.get('card')
        for f in bm.faces:
            if card is not None and f[card]:
                continue
            mat = self.mats[f.material_index] if f.material_index < len(self.mats) else None
            t = float(mat['tile']) if mat is not None and 'tile' in mat else 2.0
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            for l in f.loops:
                c = l.vert.co
                if ax == 2: u, v = c.x, c.y
                elif ax == 0: u, v = c.y * (1 if n.x > 0 else -1), c.z
                else: u, v = c.x * (-1 if n.y > 0 else 1), c.z
                l[uv].uv = (u / t, v / t)
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me); bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        if smooth_angle is not None:
            for p in me.polygons:
                p.use_smooth = True
            with bpy.context.temp_override(object=ob, selected_editable_objects=[ob], active_object=ob):
                try:
                    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(smooth_angle))
                except Exception:
                    me.set_sharp_from_angle(angle=math.radians(smooth_angle))
        return ob


# ------------------------------------------------------------------ organic shapes
def skin_figure(name, nodes, edges, radii, subdiv=2, mat=None):
    """A figure from a skeleton: nodes [(x,y,z)], edges [(i,j)], radii [(rx, ry)] per node -> skin + subsurf."""
    me = bpy.data.meshes.new(name)
    me.from_pydata(nodes, edges, [])
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    sk = ob.modifiers.new('skin', 'SKIN')
    sk.use_smooth_shade = True
    for i, r in enumerate(radii):
        me.skin_vertices[0].data[i].radius = r
    me.skin_vertices[0].data[0].use_root = True
    ss = ob.modifiers.new('sub', 'SUBSURF'); ss.levels = subdiv; ss.render_levels = subdiv
    if mat:
        me.materials.append(mat)
    return ob


def displace(ob, strength=0.3, size=1.0, kind='CLOUDS', mid=0.5):
    tex = bpy.data.textures.new(ob.name + '_d', kind)
    if hasattr(tex, 'noise_scale'):
        tex.noise_scale = size
    d = ob.modifiers.new('disp', 'DISPLACE'); d.texture = tex; d.strength = strength; d.mid_level = mid
    return d


def apply_all(ob):
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        for m in list(ob.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)


# ------------------------------------------------------------------ trees (low-poly, leaf cards)
def tree(name, R, h=12.0, kind='oak', bark=None, leaf=None, crown=0.45, leaves=140):
    """Branching trunk of tapered cylinders plus crossed leaf cards at the branch tips."""
    m = Mesh(name)
    bark = bark or material('bark', 'bark_brown_02', tile=1.5)
    leaf = leaf or material('leaves', alpha_tex=os.path.join(TEX, 'leaves', 'sprig_a.png'), color=(0.95, 1, 0.9), rough=0.7)
    tips = []

    def branch(p, d, length, r, depth):
        q = p + d * length
        # tapered segment along d
        axis = d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        vs = bmesh.ops.create_cone(m.bm, cap_ends=False, segments=6 if depth < 2 else 4, radius1=r, radius2=r * 0.68, depth=length)['verts']
        m._add(vs, bark, Matrix.Translation(p) @ axis @ Matrix.Translation((0, 0, length / 2)))
        if depth >= (2 if kind != 'conifer' else 1) or length < h * 0.08:
            tips.append((q, d)); return
        n = 3 if depth == 0 else 2 + int(R() < 0.5)
        for k in range(n):
            a = R() * math.tau
            spread = (0.55 if kind == 'oak' else 0.35) + R() * 0.35
            nd = (d + Vector((math.cos(a) * spread, math.sin(a) * spread, 0.25 if kind != 'mallorn' else 0.6))).normalized()
            start = p + d * length * (0.55 + 0.45 * R())
            branch(start, nd, length * (0.62 + 0.15 * R()), r * 0.62, depth + 1)

    if kind == 'conifer':
        # straight trunk, whorls of drooping leaf-card tiers
        m.cyl(bark, h * 0.022, h * 0.006, h, seg=6)
        for k in range(9):
            z = h * (0.22 + 0.78 * k / 9); rad = h * 0.26 * (1 - k / 9) + 0.4
            for j in range(6):
                a = j / 6 * math.tau + k
                c = Vector((math.cos(a) * rad * 0.55, math.sin(a) * rad * 0.55, z - rad * 0.15))
                _card(m, leaf, c, rad * 0.9, a, droop=0.5)
        return m.finish(smooth_angle=60)
    if kind == 'mallorn':
        # one huge straight silver trunk, smooth and unforked to over half its height, then a high crown of
        # up-swept limbs; many small golden sprigs out at the limb tips
        r0 = h * 0.03
        m.cyl(bark, r0 * 1.7, r0, h * 0.08, loc=(0, 0, -0.5), seg=10)              # flared foot
        m.cyl(bark, r0, r0 * 0.55, h * 0.78, loc=(0, 0, h * 0.08 - 0.5), seg=10)
        for k in range(9):
            z = h * (0.5 + 0.3 * k / 8)
            a = k * 2.4 + R() * 0.5
            d = Vector((math.cos(a) * 0.75, math.sin(a) * 0.75, 0.9 + R() * 0.5)).normalized()
            branch(Vector((0, 0, z)), d, h * (0.33 - 0.12 * k / 8) * (0.85 + 0.3 * R()), r0 * (0.5 - 0.2 * k / 8), 1)
        tips.append((Vector((0, 0, h * 0.86)), Vector((0, 0, 1))))
        per = max(3, leaves // max(1, len(tips)))
        for q, d in tips:
            for k in range(per):
                off = Vector((R() - 0.5, R() - 0.5, (R() - 0.35) * 0.6)) * h * crown * 0.42
                _card(m, leaf, q + off, h * (0.06 + 0.035 * R()), R() * math.tau, droop=0.2 + R() * 0.6)
        return m.finish(smooth_angle=60)
    trunk_h = h * 0.38
    branch(Vector((0, 0, -0.5)), Vector((R() * 0.08, R() * 0.08, 1)).normalized(), trunk_h, h * 0.035, 0)
    # leaf clouds around the tips
    per = max(2, leaves // max(1, len(tips)))
    for q, d in tips:
        for k in range(per):
            off = Vector((R() - 0.5, R() - 0.5, (R() - 0.3) * 0.8)) * h * crown * 0.45
            _card(m, leaf, q + off, h * (0.12 + 0.06 * R()), R() * math.tau, droop=R() * 0.6)
    return m.finish(smooth_angle=60)


def _card(m, mat, c, size, yaw, droop=0.3):
    """Two crossed quads (a leaf sprig) centred at c."""
    card = m.bm.faces.layers.int.get('card') or m.bm.faces.layers.int.new('card')
    uv = m.bm.loops.layers.uv.verify()
    for k in (0, 1):
        a = yaw + k * math.pi / 2
        ca, sa = math.cos(a), math.sin(a)
        w, hh = size * 0.5, size
        pts = [(-w, 0, -hh * 0.5), (w, 0, -hh * 0.5), (w, 0, hh * 0.5), (-w, 0, hh * 0.5)]
        vs = []
        for x, y, z in pts:
            # tilt the card (droop) around its horizontal axis
            y2, z2 = y * math.cos(droop) - z * math.sin(droop), y * math.sin(droop) + z * math.cos(droop)
            vs.append(m.bm.verts.new((c.x + x * ca - y2 * sa, c.y + x * sa + y2 * ca, c.z + z2)))
        f = m.bm.faces.new(vs)
        f.material_index = m.mi(mat)
        f[card] = 1  # keeps its 0..1 UVs in finish()
        for l, t in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            l[uv].uv = t
    m._n = len(m.bm.verts)


# ------------------------------------------------------------------ scanned rocks
def scan(name, asset, target_tris=4000, scale=1.0):
    """Import a Poly Haven glTF, decimate it, return the object (its own textures are kept)."""
    path = os.path.join(MOD, asset, asset + '.gltf')
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    for o in new:
        tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
        if tris > target_tris:
            d = o.modifiers.new('dec', 'DECIMATE'); d.ratio = target_tris / tris
            apply_all(o)
        o.scale = (o.scale[0] * scale, o.scale[1] * scale, o.scale[2] * scale)
    for o in [o for o in bpy.data.objects if o not in before and o.type != 'MESH']:
        bpy.data.objects.remove(o)
    ob = new[0]
    if len(new) > 1:
        with bpy.context.temp_override(active_object=ob, selected_editable_objects=new, selected_objects=new):
            bpy.ops.object.join()
    ob.name = name
    # downsize its textures to 512
    for slot in ob.material_slots:
        if slot.material and slot.material.use_nodes:
            for n in slot.material.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image and n.image.size[0] > 512:
                    n.image.scale(512, 512)
    return ob


# ------------------------------------------------------------------ export
def export(path, objects=None):
    objs = objects or [o for o in bpy.context.scene.objects]
    for o in bpy.context.scene.objects:
        o.select_set(o in objs)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_image_format='AUTO', export_jpeg_quality=84, export_yup=True,
                              export_texcoords=True, export_normals=True, export_materials='EXPORT',
                              export_cameras=False, export_lights=False)
    return os.path.getsize(path)
