// The landmark models. Each entry: B[id] = { info: { radius, interior?, terrain? }, shape?(x, z) -> dh,
// build(ctx) -> { group, cam, sky } }.
//   ctx.ground(x, z) -> ground height (m), after `shape` has been applied to the real terrain
//   ctx.R            -> seeded random
//   ctx.rivers       -> real rivers crossing the scene: [{ pts: [[x, z]...], width }]
// Local frame: origin at the landmark's map point, x east, z south, y up, metres
// (1 map unit ~ 1.609 m). Objects flagged userData.noTop are skipped in the top-down map overlay
// (terrain dressing such as cliffs and water that the map tiles already show).
(function () {
  'use strict';
  const ME3D = window.ME3D;
  const T = THREE;
  const { MAT, TEX, mesh, house, tower, wall, archBridge, tree, rockLump, glowSprite, smoke, waterfall, taperTube, flatWater, n3 } = ME3D;
  const B = {};
  const at = (o, x, y, z, ry = 0, s = 1) => { o.position.set(x, y, z); o.rotation.y = ry; if (s !== 1) o.scale.setScalar(s); return o; };
  const noTop = (o) => { o.userData.noTop = true; return o; };
  const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const V3 = (x, y, z) => new T.Vector3(x, y, z);

  // ================================================================ shared figures
  // a hobbit-hole: turf mound, round painted door with brass knob in a stone ring, round windows
  function smial(ctx, x, z, o = {}) {
    const { door = '#2e6b3a', r = 1.15, mound = 7, face = 0, chimney = false, garden = false, R } = o;
    const g = new T.Group();
    const m = mesh(new T.SphereGeometry(mound, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), MAT.grass('#5e8a3c', ['#e8d24a', '#d0503a', '#f4f0e8'])); m.scale.y = 0.5; g.add(m);
    const front = mound * 0.9;
    const wallFace = mesh(new T.CylinderGeometry(r * 2.6, r * 2.6, r * 2.6, 24, 1, false, -Math.PI / 2.6, Math.PI / 1.3), MAT.greyStone()); wallFace.scale.z = 0.25; wallFace.position.set(0, r * 1.1, front - 0.6); g.add(wallFace);
    const frame = mesh(new T.TorusGeometry(r * 1.12, 0.22, 8, 28), MAT.planks('#6b4c2e')); frame.position.set(0, r * 1.15, front); g.add(frame);
    const d = mesh(new T.CylinderGeometry(r, r, 0.25, 32), MAT.paint(door)); d.rotation.x = Math.PI / 2; d.position.set(0, r * 1.15, front); g.add(d);
    const knob = mesh(new T.SphereGeometry(0.14, 12, 8), MAT.brass()); knob.position.set(0, r * 1.15, front + 0.2); g.add(knob);
    for (const sx of [-1, 1]) {
      const w = mesh(new T.CylinderGeometry(0.55, 0.55, 0.2, 20), MAT.glow('#ffcf7a', 0.35)); w.rotation.x = Math.PI / 2; w.position.set(sx * r * 2.5, r * 1.3, front - 0.45); g.add(w);
      const wf = mesh(new T.TorusGeometry(0.6, 0.1, 6, 20), MAT.paint(door)); wf.position.copy(w.position); wf.position.z += 0.1; g.add(wf);
      const bar = mesh(new T.BoxGeometry(1.1, 0.07, 0.05), MAT.paint(door)); bar.position.copy(wf.position); g.add(bar);
    }
    const step = mesh(new T.CylinderGeometry(r * 1.25, r * 1.35, 0.3, 24, 1, false, 0, Math.PI), MAT.greyStone()); step.rotation.y = -Math.PI / 2; step.position.set(0, 0.15, front + 0.2); g.add(step);
    if (chimney) {
      const c = mesh(new T.CylinderGeometry(0.45, 0.55, 2.4, 10), MAT.greyStone()); c.position.set(mound * 0.3, mound * 0.5 + 0.4, -mound * 0.15); g.add(c);
      const s = smoke(16, R, 'rgba(230,230,230,0.55)', 30, 3, 5); s.position.set(mound * 0.3, mound * 0.5 + 1.7, -mound * 0.15); g.add(s);
    }
    if (garden) {
      const pts = []; for (let k = 0; k <= 22; k++) { const a = Math.PI * k / 22; pts.push([Math.cos(a) * mound * 1.3, front + Math.sin(a) * mound * 0.95]); }
      g.add(ME3D.wall(pts.filter((p, i) => i < 9 || i > 13), { h: 1.0, t: 0.5, merlons: false, m: MAT.greyStone() }, () => 0));
      const cols = ['#e8c13a', '#d84f62', '#f5f2ea', '#9b6bd1', '#ef8a3a', '#f08ab0'];
      for (let k = 0; k < 90; k++) {
        const a = R.r(0.15, 2.99), rr = R.r(mound * 0.55, mound * 1.2);
        if (Math.abs(Math.cos(a)) < 0.2) continue; // the path
        const f = mesh(new T.IcosahedronGeometry(R.r(0.22, 0.45), 0), MAT.leaf(R.pick(cols)), false, false); f.position.set(Math.cos(a) * rr, 0.3, front + Math.sin(a) * rr * 0.8); g.add(f);
      }
      for (let k = 0; k < 6; k++) { const b = mesh(new T.IcosahedronGeometry(R.r(0.7, 1.1), 1), MAT.leaf('#4d7a35')); b.position.set(R.pick([-1, 1]) * R.r(mound * 0.6, mound * 1.1), 0.6, front + R.r(1, mound * 0.7)); g.add(b); }
      const path = mesh(new T.BoxGeometry(1.4, 0.06, mound * 1.2), MAT.greyStone(), false); path.position.set(0, 0.04, front + mound * 0.6); g.add(path);
      const gate = mesh(new T.BoxGeometry(1.4, 0.9, 0.08), MAT.paint('#e9e4d4')); gate.position.set(0, 0.5, front + mound * 0.95); g.add(gate);
    }
    g.position.set(x, ctx.ground(x, z) - 0.2, z); g.rotation.y = face;
    return g;
  }
  // robed colossus (Argonath kings, Erebor guardians)
  function colossus(o) {
    const { h = 80, m = MAT.greyStone(), crown = true, raised = true, beard = false, axe = true, wide = 1 } = o;
    const g = new T.Group();
    const prof = [[0, 0], [0.21, 0], [0.2, 0.08], [0.17, 0.32], [0.14, 0.55], [0.16, 0.66], [0.15, 0.72], [0.06, 0.77], [0, 0.78]].map(([r, y]) => new T.Vector2(r * h * wide, y * h));
    const robe = new T.LatheGeometry(prof, 72);
    // deep vertical folds below the belt, fading out towards the chest
    const rp = robe.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i), a = Math.atan2(z, x);
      const k = 1 + 0.07 * Math.pow(Math.abs(Math.sin(a * 9)), 0.6) * (1 - Math.min(1, y / (h * 0.55)));
      rp.setXYZ(i, x * k, y, z * k);
    }
    robe.computeVertexNormals();
    g.add(mesh(robe, m));
    const belt = mesh(new T.TorusGeometry(h * 0.15 * wide, h * 0.012, 6, 24), m); belt.rotation.x = Math.PI / 2; belt.position.y = h * 0.5; g.add(belt);
    const shoulders = mesh(new T.CapsuleGeometry(h * 0.06, h * 0.26 * wide, 6, 12), m); shoulders.rotation.z = Math.PI / 2; shoulders.position.y = h * 0.7; g.add(shoulders);
    const head = mesh(new T.SphereGeometry(h * 0.065, 20, 14), m); head.scale.set(0.9, 1.1, 0.95); head.position.y = h * 0.82; g.add(head);
    const helm = mesh(new T.SphereGeometry(h * 0.072, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), m); helm.position.y = h * 0.84; g.add(helm);
    if (crown) {
      const band = mesh(new T.CylinderGeometry(h * 0.075, h * 0.075, h * 0.03, 20), m); band.position.y = h * 0.85; g.add(band);
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; const sp = mesh(new T.ConeGeometry(h * 0.012, h * 0.07, 4), m); sp.position.set(Math.cos(a) * h * 0.07, h * 0.9, Math.sin(a) * h * 0.07); g.add(sp); }
    } else { const crest = mesh(new T.ConeGeometry(h * 0.03, h * 0.08, 6), m); crest.position.y = h * 0.93; g.add(crest); }
    if (beard) { const b = mesh(new T.ConeGeometry(h * 0.07, h * 0.24, 12), m); b.rotation.x = Math.PI - 0.15; b.position.set(0, h * 0.68, h * 0.07); g.add(b); }
    // arms as tapered tubes: left raised palm-out, right holding an axe
    const sh = h * 0.7;
    if (raised) {
      g.add(taperTube([V3(-h * 0.17 * wide, sh, 0), V3(-h * 0.26 * wide, sh + h * 0.12, h * 0.1), V3(-h * 0.3 * wide, sh + h * 0.32, h * 0.16)], h * 0.045, h * 0.032, m, 8, 16));
      const palm = mesh(new T.BoxGeometry(h * 0.07, h * 0.11, h * 0.025), m); palm.position.set(-h * 0.31 * wide, sh + h * 0.38, h * 0.17); g.add(palm);
      for (let f = 0; f < 4; f++) { const fi = mesh(new T.CylinderGeometry(h * 0.007, h * 0.008, h * 0.05, 5), m); fi.position.set(-h * (0.335 - f * 0.017) * wide, sh + h * 0.45, h * 0.17); g.add(fi); }
    } else {
      g.add(taperTube([V3(-h * 0.17 * wide, sh, 0), V3(-h * 0.2 * wide, sh - h * 0.18, h * 0.06), V3(-h * 0.12 * wide, sh - h * 0.3, h * 0.14)], h * 0.045, h * 0.035, m, 8, 16));
    }
    g.add(taperTube([V3(h * 0.17 * wide, sh, 0), V3(h * 0.22 * wide, sh - h * 0.17, h * 0.05), V3(h * 0.2 * wide, sh - h * 0.3, h * 0.12)], h * 0.045, h * 0.035, m, 8, 16));
    if (axe) {
      const haft = mesh(new T.CylinderGeometry(h * 0.012, h * 0.012, h * 0.75, 8), m); haft.position.set(h * 0.2 * wide, h * 0.38, h * 0.13); g.add(haft);
      const blade = mesh(new T.CylinderGeometry(h * 0.1, h * 0.1, h * 0.018, 24, 1, false, 0, Math.PI), m); blade.rotation.set(Math.PI / 2, Math.PI / 2, 0); blade.position.set(h * 0.2 * wide, h * 0.68, h * 0.13); g.add(blade);
    }
    return g;
  }
  // an Ent: walking tree with bark skin, mossy beard, leafy crown and glowing green eyes
  function ent(R, h = 13, bark = '#7a6650', leaf = '#5a7a36') {
    const g = new T.Group();
    const bm = MAT.bark(bark), lm = MAT.leaf(leaf);
    for (const s of [-1, 1]) {
      g.add(taperTube([V3(s * h * 0.06, h * 0.45, 0), V3(s * h * 0.08, h * 0.22, h * 0.02), V3(s * h * 0.1, 0.2, h * 0.03)], h * 0.06, h * 0.045, bm, 7, 10));
      for (let k = 0; k < 4; k++) g.add(taperTube([V3(s * h * 0.1, 0.4, h * 0.03), V3(s * h * 0.1 + R.r(-1, 1) * h * 0.08, 0.15, h * 0.03 + R.r(0, 1) * h * 0.1), V3(s * h * 0.1 + R.r(-1, 1) * h * 0.14, 0, h * 0.03 + R.r(0.2, 1) * h * 0.16)], h * 0.018, h * 0.006, bm, 5, 8));
    }
    g.add(taperTube([V3(0, h * 0.42, 0), V3(0, h * 0.62, h * 0.02), V3(0, h * 0.86, 0)], h * 0.11, h * 0.07, bm, 9, 12));
    const head = mesh(new T.CylinderGeometry(h * 0.055, h * 0.075, h * 0.17, 9), bm); head.position.y = h * 0.92; g.add(head);
    const brow = mesh(new T.BoxGeometry(h * 0.12, h * 0.025, h * 0.04), bm); brow.position.set(0, h * 0.965, h * 0.06); g.add(brow);
    g.add(taperTube([V3(0, h * 0.92, h * 0.06), V3(0, h * 0.8, h * 0.09), V3(0, h * 0.68, h * 0.08)], h * 0.05, h * 0.012, MAT.leaf('#7f8f52'), 8, 10));
    for (const s of [-1, 1]) { const eye = mesh(new T.SphereGeometry(h * 0.012, 10, 8), MAT.glow('#d4ff9a', 2.4), false, false); eye.position.set(s * h * 0.028, h * 0.945, h * 0.07); g.add(eye); }
    for (let k = 0; k < 7; k++) { const b = mesh(new T.IcosahedronGeometry(h * R.r(0.05, 0.09), 1), lm); b.position.set(R.r(-1, 1) * h * 0.08, h * R.r(1.0, 1.12), R.r(-1, 1) * h * 0.06); g.add(b); }
    for (let k = 0; k < 4; k++) { const tw = taperTube([V3(0, h, 0), V3(R.r(-1, 1) * h * 0.08, h * 1.08, R.r(-1, 1) * h * 0.05), V3(R.r(-1, 1) * h * 0.15, h * 1.18, R.r(-1, 1) * h * 0.08)], h * 0.015, h * 0.004, bm, 5, 8); g.add(tw); }
    const arms = [];
    for (const s of [-1, 1]) {
      const arm = new T.Group(); arm.position.set(s * h * 0.11, h * 0.8, 0);
      arm.add(taperTube([V3(0, 0, 0), V3(s * h * 0.06, -h * 0.18, h * 0.02), V3(s * h * 0.07, -h * 0.36, h * 0.05)], h * 0.04, h * 0.022, bm, 7, 10));
      for (let k = 0; k < 4; k++) arm.add(taperTube([V3(s * h * 0.07, -h * 0.36, h * 0.05), V3(s * h * (0.07 + R.r(-0.04, 0.04)), -h * 0.43, h * (0.05 + R.r(-0.03, 0.05))), V3(s * h * (0.07 + R.r(-0.07, 0.07)), -h * 0.48, h * (0.05 + R.r(-0.05, 0.08)))], h * 0.01, h * 0.003, bm, 4, 6));
      g.add(arm); arms.push(arm);
    }
    const ph = R() * 6;
    g.userData.animate = (t) => { g.rotation.z = Math.sin(t * 0.5 + ph) * 0.025; arms.forEach((a, i) => { a.rotation.x = Math.sin(t * 0.7 + ph + i * 2) * 0.22; a.rotation.z = (i ? -1 : 1) * (0.15 + 0.1 * Math.sin(t * 0.4 + ph)); }); };
    return g;
  }
  function forest(g, ctx, R, n, area, opts) {
    const { cols = ['#3e6430', '#46702e', '#557d34'], conifer = 0.2, h = [8, 16], avoid = () => false, mallorn = false } = opts || {};
    for (let k = 0; k < n; k++) {
      const [x, z] = area(R); if (avoid(x, z)) continue;
      const t = tree({ kind: mallorn ? 'mallorn' : R() < conifer ? 'conifer' : 'oak', h: R.r(h[0], h[1]), leaf: R.pick(cols) }, R); at(t, x, ctx.ground(x, z) - 0.3, z, R() * 6); g.add(t);
    }
  }
  const ring = (r0, r1) => (R) => { const a = R() * Math.PI * 2, r = Math.sqrt(R.r(r0 * r0, r1 * r1)); return [Math.cos(a) * r, Math.sin(a) * r]; };
  const rect = (x0, x1, z0, z1) => (R) => [R.r(x0, x1), R.r(z0, z1)];

  // ================================================================ Bag End & Hobbiton
  B.bagEnd = {
    info: { radius: 520 },
    build(ctx) {
      const { R } = ctx, g = new T.Group();
      // the Water (real river line, which crosses the scene ~170 m north of the Hobbiton map point)
      const water = ctx.rivers.find(r => r.pts.some(([x, z]) => Math.abs(x) < 200)) || { pts: [[-600, -175], [600, -175]], width: 14 };
      const wz = (x) => { let best = water.pts[0]; for (const p of water.pts) if (Math.abs(p[0] - x) < Math.abs(best[0] - x)) best = p; return best[1]; };
      const level = Math.min(...water.pts.filter(([x]) => Math.abs(x) < 300).map(([x, z]) => ctx.ground(x, z))) + 0.4;
      const wpts = water.pts.map(([x, z]) => [x, z + Math.sin(x / 55) * 10]);
      g.add(noTop(ME3D.waterRibbon(wpts, Math.max(12, Math.min(water.width, 22)), ctx.ground, 0.6)));
      // The Hill rises north of the Water. Bag End sits near its top with its garden and the great tree above
      const bz = wz(0) - 120;
      g.add(smial(ctx, 0, bz, { door: '#2c6a38', r: 1.35, mound: 13, chimney: true, garden: true, R }));
      const big = tree({ kind: 'oak', h: 22, leaf: '#4b7a32' }, R); at(big, 4, ctx.ground(4, bz - 16), bz - 16); g.add(big);
      const sign = mesh(new T.BoxGeometry(1.6, 0.6, 0.06), MAT.planks('#a07850')); sign.position.set(2.2, ctx.ground(2.2, bz + 24) + 1.3, bz + 24); g.add(sign);
      const post = mesh(new T.CylinderGeometry(0.06, 0.06, 1.3, 6), MAT.planks('#6a4a2a')); post.position.set(2.2, ctx.ground(2.2, bz + 24) + 0.65, bz + 24); g.add(post);
      // Bagshot Row below Bag End
      const doors = ['#b23b2e', '#e3b23c', '#3b5fa0', '#6b4a8a', '#c26f2d', '#2f7f7a', '#7a2f3a', '#3e7d4a'];
      for (let k = 0; k < 6; k++) g.add(smial(ctx, -70 + k * 28, bz + 55 + Math.sin(k * 1.3) * 4, { door: doors[k], mound: 7.5, chimney: k % 2 === 0, garden: k % 3 === 1, R }));
      // more hobbit-holes over the Hill and the hills around
      for (let k = 0; k < 40; k++) {
        const x = R.r(-480, 480), z = R.r(bz - 260, wz(x) - 30);
        if (Math.hypot(x, z - bz) < 40 || (Math.abs(x) < 90 && Math.abs(z - bz - 55) < 20)) continue;
        g.add(smial(ctx, x, z, { door: R.pick(doors), mound: R.r(5.5, 8), face: R.r(-0.6, 0.6), chimney: R() < 0.4, garden: R() < 0.25, R }));
      }
      // the lane down the Hill, over the bridge by the Mill, to the road
      const lane = [[0, bz + 14], [6, bz + 40], [-4, bz + 75], [2, wz(2) - 15], [2, wz(2) + 15], [10, wz(10) + 60], [60, wz(60) + 110], [200, wz(200) + 140], [480, wz(480) + 160]];
      g.add(ME3D.waterRibbon(lane, 3.2, ctx.ground, 0.1)).children;
      g.children[g.children.length - 1].material = MAT.planks('#a38a62'); g.children[g.children.length - 1].userData.animate = null;
      const br = archBridge({ span: 18, width: 4, n: 2, rise: 2.6, m: MAT.greyStone() }); at(br, 2, level - 0.8, wz(2), Math.PI / 2); g.add(br);
      // the Mill with its water-wheel
      const mx = 34, mz = wz(34) - 14;
      const mill = house({ w: 9, d: 15, h: 7, roofH: 5, wallMat: MAT.planks('#8a6a46'), roofMat: MAT.thatch('#b9944f'), chimney: true }); at(mill, mx, ctx.ground(mx, mz), mz, 0.05); g.add(mill);
      const wheel = new T.Group();
      const rim = mesh(new T.TorusGeometry(3.8, 0.25, 6, 24), MAT.planks('#5a3b22')); wheel.add(rim);
      for (let k = 0; k < 12; k++) { const sp = mesh(new T.BoxGeometry(0.2, 7.4, 0.6), MAT.planks('#6a4a2a')); sp.rotation.z = k * Math.PI / 6; wheel.add(sp); }
      wheel.rotation.y = Math.PI / 2; wheel.position.set(mx + 5.6, level + 2.5, mz + 6);
      wheel.userData.animate = (t) => { wheel.rotation.x = t * 0.7; };
      g.add(wheel);
      // the Party Field and the Party Tree, with the pavilion
      const px = 170, pz = bz + 40;
      const pt = tree({ kind: 'oak', h: 30, leaf: '#4b7a32' }, R); at(pt, px, ctx.ground(px, pz), pz); g.add(pt);
      const pav = new T.Group();
      const canopy = mesh(new T.ConeGeometry(11, 5, 12), MAT.paint('#f3ecd8')); canopy.position.y = 7; pav.add(canopy);
      for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; const pole = mesh(new T.CylinderGeometry(0.12, 0.12, 4.6, 5), MAT.planks('#8a6a46')); pole.position.set(Math.cos(a) * 10, 2.3, Math.sin(a) * 10); pav.add(pole); }
      for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2; const l = glowSprite('rgba(255,210,120,0.9)', 1.2); l.position.set(Math.cos(a) * 10.5, 4.6, Math.sin(a) * 10.5); pav.add(l); }
      at(pav, px - 30, ctx.ground(px - 30, pz + 30), pz + 30); g.add(pav);
      // Bywater: thatched round cottages across the Water, with gardens and hedges
      for (let k = 0; k < 26; k++) {
        const x = R.r(-460, 460), z = wz(x) + R.r(45, 300);
        const c = new T.Group(), rr = R.r(3.5, 5);
        const walls = mesh(new T.CylinderGeometry(rr, rr, 3.2, 18), MAT.plaster(R.pick(['#efe3c6', '#e8dcc0', '#f3ead6']))); walls.position.y = 1.6; c.add(walls);
        const roof = mesh(new T.ConeGeometry(rr * 1.35, rr * 1.1, 18), MAT.thatch('#b9944f')); roof.position.y = 3.2 + rr * 0.55; c.add(roof);
        const d = mesh(new T.CylinderGeometry(0.75, 0.75, 0.2, 18), MAT.paint(R.pick(doors))); d.rotation.x = Math.PI / 2; d.position.set(0, 1, rr); c.add(d);
        at(c, x, ctx.ground(x, z) - 0.1, z, R.r(-0.5, 0.5)); g.add(c);
        for (let h2 = 0; h2 < 4; h2++) { const hb = mesh(new T.BoxGeometry(R.r(6, 14), 1.2, 1), MAT.leaf('#3f6a2c')); hb.position.set(x + R.r(-12, 12), ctx.ground(x, z) + 0.6, z + R.r(6, 14)); hb.rotation.y = R() * 3; g.add(hb); }
      }
      forest(g, ctx, R, 170, rect(-520, 520, -520, 480), { avoid: (x, z) => Math.abs(z - wz(x)) < 14 || Math.hypot(x, z - bz) < 30 || Math.hypot(x - px, z - pz) < 30 });
      return { group: g, cam: { dist: 190, elev: 0.2, azim: 0.35, lookY: 6, target: [10, bz + 40] }, sky: 'day' };
    },
  };

  // ================================================================ Barad-dûr and the Eye of Sauron
  function eyeSprite(size) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const x = c.getContext('2d');
    const tex = new T.CanvasTexture(c);
    const draw = (t) => {
      x.clearRect(0, 0, 256, 256);
      for (let i = 0; i < 60; i++) {
        const a = i / 60 * Math.PI * 2 + t * 0.25, l = 60 + 55 * (0.5 + 0.5 * Math.sin(t * 2.7 + i * 1.7)) * (0.6 + 0.4 * Math.abs(Math.cos(a)));
        const gr = x.createLinearGradient(128, 128, 128 + Math.cos(a) * l * 1.25, 128 + Math.sin(a) * l * 0.6);
        gr.addColorStop(0, 'rgba(255,190,70,0.95)'); gr.addColorStop(0.5, 'rgba(255,90,10,0.6)'); gr.addColorStop(1, 'rgba(255,40,0,0)');
        x.strokeStyle = gr; x.lineWidth = 7 + 5 * Math.sin(i + t); x.beginPath(); x.moveTo(128, 128); x.lineTo(128 + Math.cos(a) * l * 1.25, 128 + Math.sin(a) * l * 0.6); x.stroke();
      }
      const ir = x.createRadialGradient(128, 128, 3, 128, 128, 75);
      ir.addColorStop(0, '#fff8c0'); ir.addColorStop(0.3, '#ffc030'); ir.addColorStop(0.75, '#e04400'); ir.addColorStop(1, 'rgba(120,10,0,0)');
      x.fillStyle = ir; x.beginPath(); x.ellipse(128, 128, 96, 52, 0, 0, 7); x.fill();
      x.fillStyle = '#060000'; x.beginPath(); x.ellipse(128, 128, 6 + 3 * Math.sin(t * 1.1), 44, 0, 0, 7); x.fill();
      tex.needsUpdate = true;
    };
    draw(0);
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    s.scale.set(size, size, 1);
    let last = -1;
    s.userData.animate = (t) => { if (t - last > 0.05) { draw(t); last = t; } const k = size * (1 + 0.06 * Math.sin(t * 2.1)); s.scale.set(k, k, 1); };
    return s;
  }
  B.baradDur = {
    info: { radius: 700 },
    build(ctx) {
      const { R } = ctx, g = new T.Group(), y0 = ctx.ground(0, 0);
      const ob = MAT.obsidian(), ds = MAT.darkStone();
      // stepped, buttressed foundations
      let y = y0;
      for (const [r, h] of [[170, 60], [135, 55], [105, 50]]) {
        const c = mesh(new T.CylinderGeometry(r * 0.92, r, h, 8), ds); c.position.y = y + h / 2; g.add(c);
        for (let f = 0; f < 8; f++) { const a = f / 8 * Math.PI * 2; const b = mesh(new T.BoxGeometry(14, h * 1.4, r * 0.35), ob); b.position.set(Math.cos(a) * r * 0.98, y + h * 0.45, Math.sin(a) * r * 0.98); b.rotation.set(0, -a, 0); b.rotateZ(0.25); g.add(b); }
        y += h;
      }
      // the shaft: tapering, fluted, studded with outward-raking spikes
      let r = 80;
      for (let k = 0; k < 10; k++) {
        const h = 44, r2 = r * 0.91;
        const c = mesh(new T.CylinderGeometry(r2, r, h, 8), ob); c.position.y = y + h / 2; g.add(c);
        for (let f = 0; f < 8; f++) {
          const a = f / 8 * Math.PI * 2 + Math.PI / 8;
          const fin = mesh(new T.BoxGeometry(6, h * 1.02, r * 0.5), ds); fin.position.set(Math.cos(a) * r * 0.93, y + h / 2, Math.sin(a) * r * 0.93); fin.rotation.y = -a; g.add(fin);
          if (k % 2 === 1) g.add(taperTube([V3(Math.cos(a) * r * 1.1, y + h * 0.5, Math.sin(a) * r * 1.1), V3(Math.cos(a) * (r + 22), y + h * 0.75, Math.sin(a) * (r + 22)), V3(Math.cos(a) * (r + 40), y + h * 1.3, Math.sin(a) * (r + 40))], 3.5, 0.3, ob, 5, 8));
        }
        const ledge = mesh(new T.CylinderGeometry(r2 * 1.08, r2 * 1.08, 3, 8), ds); ledge.position.y = y + h; g.add(ledge);
        y += h; r = r2;
      }
      // the crown: two great curved horns rising around the Eye, with barbs
      const top = y;
      for (const s of [-1, 1]) {
        const pts = [V3(s * r * 0.7, top - 10, 0), V3(s * r * 0.95, top + 60, 0), V3(s * r * 0.85, top + 150, -6), V3(s * r * 0.45, top + 230, -4), V3(s * r * 0.15, top + 270, 4)];
        g.add(taperTube(pts, 24, 1.2, ob, 9, 40));
        for (let k = 1; k < 7; k++) {
          const p = new T.CatmullRomCurve3(pts).getPointAt(k / 7);
          g.add(taperTube([p, V3(p.x + s * 14, p.y + 8, p.z + R.r(-6, 6)), V3(p.x + s * 30, p.y + 26, p.z + R.r(-10, 10))], 4, 0.3, ob, 5, 8));
        }
      }
      const eye = eyeSprite(110); eye.position.set(0, top + 120, 0); g.add(eye);
      const halo = glowSprite('rgba(255,110,25,0.75)', 320); halo.position.copy(eye.position); g.add(halo);
      const beamLight = new T.SpotLight('#ff7a30', 60, 2500, 0.18, 0.6, 1.1); beamLight.position.copy(eye.position); g.add(beamLight, beamLight.target);
      beamLight.userData.animate = (t) => { const a = t * 0.18; beamLight.target.position.set(Math.cos(a) * 1200, y0, Math.sin(a) * 1200); beamLight.intensity = 55 + 10 * Math.sin(t * 5); };
      const light = new T.PointLight('#ff6a20', 12, 2200, 1.1); light.position.copy(eye.position); g.add(light);
      light.userData.animate = (t) => { light.intensity = 10 + 3 * Math.sin(t * 5.3) + 1.5 * Math.sin(t * 13.1); };
      // outer fortress rings with spiked towers, forges glowing between them
      for (const [rad, hgt, n] of [[340, 46, 18], [540, 34, 26]]) {
        const pts = []; for (let k = 0; k <= n; k++) { const a = k / n * Math.PI * 2, rr2 = rad * (k % 2 ? 0.93 : 1); pts.push([Math.cos(a) * rr2, Math.sin(a) * rr2]); }
        g.add(wall(pts, { h: hgt, t: 12, m: ds, merlons: false }, ctx.ground));
        for (let k = 0; k < n; k += 2) {
          const [tx, tz] = pts[k], gy = ctx.ground(tx, tz);
          const tw = mesh(new T.CylinderGeometry(9, 14, hgt + 30, 6), ob); tw.position.set(tx, gy + (hgt + 30) / 2, tz); g.add(tw);
          g.add(taperTube([V3(tx, gy + hgt + 28, tz), V3(tx * 1.01, gy + hgt + 50, tz * 1.01), V3(tx * 1.03, gy + hgt + 78, tz * 1.03)], 8, 0.5, ob, 6, 8));
        }
      }
      for (let k = 0; k < 30; k++) {
        const a = R() * Math.PI * 2, rr2 = R.r(190, 500), x = Math.cos(a) * rr2, z = Math.sin(a) * rr2, gy = ctx.ground(x, z);
        const pit = mesh(new T.CylinderGeometry(R.r(8, 18), R.r(8, 18), 1, 14), MAT.lava(), false, false); pit.position.set(x, gy + 0.6, z); g.add(pit);
        const gl = glowSprite('rgba(255,110,30,0.7)', 70); gl.position.set(x, gy + 8, z); g.add(gl);
        if (k % 3 === 0) { const s2 = smoke(12, R, 'rgba(36,30,28,0.75)', 220, 30, 50); s2.position.set(x, gy + 5, z); g.add(s2); }
        const bk = house({ w: R.r(14, 26), d: R.r(20, 40), h: R.r(10, 18), roof: 'flat', wallMat: ds, roofMat: ob }); at(bk, x + 30, ctx.ground(x + 30, z), z, a); g.add(bk);
      }
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; const ul = new T.PointLight('#ff4a10', 25, 500, 1.4); ul.position.set(Math.cos(a) * 230, y0 + 20, Math.sin(a) * 230); g.add(ul); }
      // lava channels across Gorgoroth
      for (let f = 0; f < 5; f++) {
        let a = R() * 6.28, rr2 = 600; const pts = [];
        for (let k = 0; k < 30; k++) { a += R.r(-0.06, 0.06); rr2 += 40; pts.push([Math.cos(a) * rr2, Math.sin(a) * rr2]); }
        const lv = flatWater(pts, R.r(6, 14), 0, MAT.lava()); lv.geometry.attributes.position.array.forEach((v, i, arr) => { if (i % 3 === 1) arr[i] = ctx.ground(arr[i - 1], arr[i + 1]) + 0.4; }); lv.geometry.attributes.position.needsUpdate = true; lv.userData.animate = null; g.add(noTop(lv));
      }
      return { group: g, cam: { dist: 1350, elev: 0.16, azim: -0.6, lookY: 380 }, sky: 'mordor' };
    },
  };

  // ================================================================ Orthanc & the Ring of Isengard
  B.isengard = {
    info: { radius: 900 },
    build(ctx) {
      const { R } = ctx, g = new T.Group(), y0 = ctx.ground(0, 0);
      const ob = MAT.obsidian();
      // Orthanc: four faceted piers fused into one many-sided tower, cleft at the top into four horns
      const H = 150;
      const core = mesh(new T.CylinderGeometry(17, 21, H, 12), ob); core.position.y = y0 + H / 2; g.add(core);
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + Math.PI / 4, cx = Math.cos(a) * 15, cz = Math.sin(a) * 15;
        const p = mesh(new T.CylinderGeometry(13, 17, H, 5), ob); p.position.set(cx, y0 + H / 2, cz); p.rotation.y = a; g.add(p);
        for (let f = 0; f < 3; f++) { const rib = mesh(new T.BoxGeometry(2.4, H, 2.4), ob); const fa = a + (f - 1) * 0.6; rib.position.set(cx + Math.cos(fa) * 15.5, y0 + H / 2, cz + Math.sin(fa) * 15.5); rib.rotation.y = -fa + Math.PI / 4; g.add(rib); }
        g.add(taperTube([V3(cx * 0.9, y0 + H - 8, cz * 0.9), V3(cx * 1.25, y0 + H + 14, cz * 1.25), V3(cx * 1.15, y0 + H + 34, cz * 1.15), V3(cx * 0.75, y0 + H + 52, cz * 0.75)], 11, 0.6, ob, 7, 20));
      }
      const plat = mesh(new T.CylinderGeometry(20, 20, 2, 16), MAT.darkStone()); plat.position.y = y0 + H; g.add(plat);
      // the great stair of 27 steps and the door, a balcony above it
      for (let k = 0; k < 27; k++) { const st = mesh(new T.BoxGeometry(18, 1, 2.2), MAT.darkStone()); st.position.set(0, y0 + 0.5 + k, 24 + 27 * 2.2 - k * 2.2); g.add(st); }
      const door = mesh(new T.BoxGeometry(6, 11, 1), MAT.glow('#3a1a08', 0.8)); door.position.set(0, y0 + 32.5, 21.5); g.add(door);
      const balc = mesh(new T.BoxGeometry(10, 1, 4), MAT.darkStone()); balc.position.set(0, y0 + 46, 22); g.add(balc);
      // the ring-wall, with dwellings cut into its inner face, and the southern arch-gate
      const RR = 836, pts = [];
      for (let k = 0; k <= 120; k++) { const a = Math.PI / 2 + 0.05 + k / 120 * (Math.PI * 2 - 0.1); pts.push([Math.cos(a) * RR, Math.sin(a) * RR]); }
      g.add(wall(pts, { h: 46, t: 34, m: MAT.darkStone(), merlons: false }, ctx.ground));
      for (let k = 0; k < 120; k += 2) { const [x, z] = pts[k]; const win = mesh(new T.BoxGeometry(3, 4, 1), MAT.glow('#ffae50', 0.6), false, false); const a = Math.atan2(z, x); win.position.set(x - Math.cos(a) * 17.5, ctx.ground(x, z) + 14 + (k % 4) * 6, z - Math.sin(a) * 17.5); win.rotation.y = -a + Math.PI / 2; g.add(win); }
      const gate = archBridge({ span: 26, width: 40, n: 1, rise: 16, m: MAT.darkStone() }); at(gate, 0, ctx.ground(0, RR) - 1, RR, 0); g.add(gate);
      // the plain: paved radial roads lined with stone pillars and chains, pits, forges, smoke
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4 + Math.PI / 8;
        const road = []; for (let r = 40; r < RR - 30; r += 60) road.push([Math.cos(a) * r, Math.sin(a) * r]);
        const rm = ME3D.waterRibbon(road, 9, ctx.ground, 0.1); rm.material = MAT.greyStone(); rm.userData.animate = null; g.add(rm);
        for (let r = 80; r < RR - 40; r += 36) for (const s of [-1, 1]) { const px = Math.cos(a) * r - Math.sin(a) * 7 * s, pz = Math.sin(a) * r + Math.cos(a) * 7 * s; const pl = mesh(new T.BoxGeometry(1.4, 5, 1.4), MAT.darkStone()); pl.position.set(px, ctx.ground(px, pz) + 2.5, pz); g.add(pl); }
      }
      for (let k = 0; k < 80; k++) {
        const a = R() * Math.PI * 2, r = R.r(110, RR - 80), x = Math.cos(a) * r, z = Math.sin(a) * r, gy = ctx.ground(x, z);
        if (R() < 0.5) {
          const pw = R.r(9, 18);
          const pit = mesh(new T.CylinderGeometry(pw, pw * 0.6, 8, 14, 1, true), MAT.rock('#4a4440'), false, true); pit.material.side = T.DoubleSide; pit.position.set(x, gy - 3, z); g.add(pit);
          const fire = mesh(new T.CircleGeometry(pw * 0.55, 14), MAT.lava(), false, false); fire.rotation.x = -Math.PI / 2; fire.position.set(x, gy - 6.5, z); g.add(fire);
          const gl = glowSprite('rgba(255,120,40,0.7)', pw * 4); gl.position.set(x, gy + 2, z); g.add(gl);
          if (k % 3 === 0) { const s2 = smoke(12, R, 'rgba(70,64,60,0.6)', 160, 16, 30); s2.position.set(x, gy, z); g.add(s2); }
        } else {
          const fx = house({ w: R.r(10, 18), d: R.r(16, 30), h: R.r(6, 12), roof: R() < 0.5 ? 'flat' : 'gable', wallMat: MAT.darkStone(), roofMat: MAT.slate('#3c3f44'), chimney: true }); at(fx, x, gy, z, a); g.add(fx);
        }
        if (R() < 0.5) { const stump = mesh(new T.CylinderGeometry(1.2, 1.6, 1.4, 8), MAT.bark('#4e3d2c')); stump.position.set(x + R.r(-30, 30), gy + 0.5, z + R.r(-30, 30)); g.add(stump); }
      }
      return { group: g, cam: { dist: 330, elev: 0.2, azim: 0.35, lookY: 95 }, sky: 'dusk' };
    },
  };

  // ================================================================ Rivendell
  function elvenHall(R, w, d, h, roofCol, stone = '#efe6d2') {
    const g = new T.Group();
    const wm = MAT.plaster(stone), rm = MAT.slate(roofCol);
    const body = mesh(new T.BoxGeometry(w, h, d), wm); body.position.y = h / 2; g.add(body);
    // arcade of slender columns with pointed arches, balcony and railing
    const n = Math.max(3, Math.round(w / 3));
    for (let k = 0; k <= n; k++) {
      const x = -w / 2 + k * w / n;
      const c = mesh(new T.CylinderGeometry(0.2, 0.24, h * 0.88, 10), wm); c.position.set(x, h * 0.44, d / 2 + 2.4); g.add(c);
      if (k < n) { const arc = mesh(new T.TorusGeometry(w / n / 2, 0.16, 6, 14, Math.PI), wm); arc.position.set(x + w / n / 2, h * 0.88, d / 2 + 2.4); arc.scale.y = 1.4; g.add(arc); }
    }
    const balcony = mesh(new T.BoxGeometry(w + 1, 0.35, 5), wm); balcony.position.set(0, h, d / 2 + 2); g.add(balcony);
    const rail = mesh(new T.BoxGeometry(w + 1, 0.8, 0.12), wm); rail.position.set(0, h + 0.55, d / 2 + 4.4); g.add(rail);
    for (let k = 0; k < Math.round(w / 2.2); k++) { const win = mesh(new T.BoxGeometry(0.9, h * 0.45, 0.1), MAT.glow('#ffd690', 0.45), false, false); win.position.set(-w / 2 + 1.2 + k * 2.2, h * 0.5, d / 2 + 0.06); g.add(win); }
    // swooping roof: concave profile with up-curled eaves
    const prof = []; for (let k = 0; k <= 12; k++) { const t = k / 12; prof.push(new T.Vector2(Math.max(0.001, (1 - t) * (1 - t * 0.45) + (t < 0.08 ? (0.08 - t) * 1.6 : 0)), t)); }
    const roof = mesh(new T.LatheGeometry(prof, 4, Math.PI / 4), rm);
    roof.scale.set((w + 5) * 0.72, h * 0.95, (d + 7) * 0.72); roof.position.y = h + 0.2; g.add(roof);
    const fin = mesh(new T.ConeGeometry(0.25, 4, 8), MAT.gold()); fin.position.y = h + h * 0.95 + 1.6; g.add(fin);
    return g;
  }
  B.rivendell = {
    info: { radius: 520 },
    // the hidden valley: a deep, steep-sided cleft running west-east with the Bruinen in its floor
    shape: (x, z) => { const zc = 30 * Math.sin(x / 160); const d = Math.abs(z - zc); return -150 * (1 - sm(70, 260, d + 18 * n3(x / 60, 0, z / 60, 3))); },
    build(ctx) {
      const { R } = ctx, g = new T.Group();
      const zc = (x) => 30 * Math.sin(x / 160);
      const floor = Math.min(...[-200, -100, 0, 100, 200].map(x => ctx.ground(x, zc(x))));
      const river = []; for (let x = -560; x <= 560; x += 20) river.push([x, zc(x) + 8 * Math.sin(x / 37)]);
      g.add(noTop(flatWater(river, 16, floor + 1.5)));
      // terraces on the north side of the valley: the Last Homely House and its halls
      const halls = [[0, -62, 28, 16, 12, 0], [40, -80, 18, 12, 10, 0.25], [-40, -74, 20, 12, 10, -0.2], [12, -110, 16, 10, 13, 0.1], [-26, -40, 12, 10, 8, -0.4], [70, -56, 14, 9, 8, 0.5], [-74, -100, 16, 10, 10, -0.15], [96, -100, 12, 9, 9, 0.4]];
      for (const [x, z, w, d, h, ry] of halls) {
        const gy = ctx.ground(x, z);
        const terrace = mesh(new T.BoxGeometry(w + 12, 30, d + 14), MAT.plaster('#e6dcc6')); terrace.position.set(x, gy - 14, z + 2); terrace.rotation.y = ry; g.add(terrace);
        const p = elvenHall(R, w, d, h, R.pick(['#4f7a6e', '#5d8a78', '#6e7a5a']), '#efe6d2'); at(p, x, gy + 1, z, ry); g.add(p);
      }
      // slender towers with curved caps
      for (const [x, z, h] of [[22, -96, 36], [-52, -88, 28], [84, -76, 24], [-8, -132, 30]]) {
        const gy = ctx.ground(x, z);
        const t = tower({ r: 3, h, m: MAT.plaster('#efe6d2'), roof: 'none', crenel: false, sides: 12 }); at(t, x, gy, z); g.add(t);
        const cap = mesh(new T.LatheGeometry([0, 0.25, 0.5, 0.75, 1].map((t2) => new T.Vector2(Math.max(0.01, 4.4 * (1 - t2) * (1 - t2 * 0.35)), t2 * 10)), 12), MAT.slate('#4f7a6e')); cap.position.set(x, gy + h, z); g.add(cap);
      }
      // graceful bridges over the river and stairs down to it
      for (const x of [-60, 30]) { const b = archBridge({ span: 30, width: 3, n: 1, rise: 9, m: MAT.plaster('#efe6d2') }); at(b, x, floor + 1.5, zc(x), Math.PI / 2); g.add(b); }
      // waterfalls tumbling over the valley walls on both sides
      for (const [x, s] of [[-180, -1], [-60, 1], [120, -1], [210, 1], [-260, 1]]) {
        const z = zc(x) + s * 150, top = ctx.ground(x, z), bot = ctx.ground(x, zc(x) + s * 60);
        g.add(noTop(waterfall(10, Math.max(20, top - bot), x, bot, zc(x) + s * 95, s > 0 ? Math.PI : 0)));
      }
      // autumn woods on the slopes and the heights
      const cols = ['#b8742c', '#c9a13a', '#8a5a2a', '#6d8a3a', '#a34a2a', '#d0b050', '#3d5e34', '#4a6a3a'];
      forest(g, ctx, R, 320, rect(-540, 540, -500, 500), { cols, conifer: 0.25, h: [10, 22], avoid: (x, z) => Math.abs(z - zc(x)) < 14 || (Math.abs(x) < 110 && z < -30 && z > -140) });
      return { group: g, cam: { dist: 230, elev: 0.22, azim: 0.75, lookY: 10, target: [10, -70] }, sky: 'dusk' };
    },
  };

  // ================================================================ Erebor: the Front Gate
  B.erebor = {
    info: { radius: 800 },
    // the Lonely Mountain's southern spur: the mountain rises steeply north of the gate
    shape: (x, z) => { const r = Math.hypot(x, z + 760); return 820 * Math.pow(Math.max(0, 1 - r / 760), 1.15) * (1 + 0.15 * n3(x / 120, 0, z / 120, 5)); },
    build(ctx) {
      const { R } = ctx, g = new T.Group();
      const gz = -8, y0 = ctx.ground(0, gz + 30);
      // a sheer cliff around the gate
      for (let k = 0; k < 20; k++) { const x = -270 + k * 28, z = -95 - Math.abs(x) * 0.2; if (Math.abs(x) < 95) continue; const l = rockLump(R.r(45, 65), R, '#8a8278', 2.2); l.position.set(x, ctx.ground(x, z) - 10, z); g.add(noTop(l)); }
      // the carved facade: a wall of colossal dwarf-cut pillars, tallest around the gate
      for (let k = -15; k <= 15; k++) {
        const w = 6.2, hh = 150 - Math.abs(k) * 2.2 + R.r(-6, 6), x = k * w;
        const col = mesh(new T.BoxGeometry(w * 0.86, hh, 60), MAT.rock(Math.abs(k) % 2 ? '#8f877d' : '#9a9286')); col.position.set(x, y0 + hh / 2 - 4, gz - 32 - (Math.abs(k) % 3) * 1.5); g.add(col);
        if (Math.abs(k) > 3) { const cap = mesh(new T.ConeGeometry(w * 0.55, 14, 4), MAT.rock('#8f877d')); cap.position.set(x, y0 + hh + 3, gz - 30); cap.rotation.y = Math.PI / 4; g.add(cap); }
      }
      // the gateway: deep dark arch, carved frame and gilded lintel with the runes
      const sh = new T.Shape(); sh.moveTo(-14, 0); sh.lineTo(-14, 30); sh.absarc(0, 30, 14, Math.PI, 0, true); sh.lineTo(14, 0);
      const hole = mesh(new T.ShapeGeometry(sh), MAT.paint('#050404'), false, false); hole.position.set(0, y0, gz + 0.3); g.add(hole);
      const frameS = new T.Shape(); frameS.moveTo(-22, 0); frameS.lineTo(-22, 32); frameS.absarc(0, 32, 22, Math.PI, 0, true); frameS.lineTo(22, 0); frameS.lineTo(14, 0); frameS.lineTo(14, 30); frameS.absarc(0, 30, 14, 0, Math.PI, false); frameS.lineTo(-14, 0);
      const frame = mesh(new T.ExtrudeGeometry(frameS, { depth: 4, bevelEnabled: true, bevelSize: 0.6, bevelThickness: 0.6 }), MAT.greyStone()); frame.position.set(0, y0, gz - 1); g.add(frame);
      for (let k = 0; k < 6; k++) { const step = mesh(new T.BoxGeometry(2.2, 54 - k * 2, 3), MAT.greyStone()); step.position.set((k % 2 ? 1 : -1) * (27 + Math.floor(k / 2) * 5), y0 + 27 - k, gz + 1); g.add(step); }
      const lintel = mesh(new T.BoxGeometry(62, 4, 4), MAT.gold()); lintel.position.set(0, y0 + 60, gz + 1); g.add(lintel);
      const lamp = new T.PointLight('#ffb060', 6, 120, 1.5); lamp.position.set(0, y0 + 20, gz + 12); g.add(lamp);
      const inner = glowSprite('rgba(255,170,80,0.55)', 30); inner.position.set(0, y0 + 14, gz + 1); g.add(inner);
      // the colossal dwarf guardians with axes, carved from the mountain
      for (const s of [-1, 1]) {
        const plinth = mesh(new T.BoxGeometry(26, 14, 26), MAT.greyStone()); plinth.position.set(s * 58, y0 + 7, gz + 8); g.add(plinth);
        const c = colossus({ h: 92, m: MAT.rock('#958d82'), crown: false, raised: false, beard: true, axe: true, wide: 1.4 }); at(c, s * 58, y0 + 14, gz + 8, 0); g.add(c);
      }
      // the great stair, the Running River issuing from the gate under a stone bridge, the road to Dale
      for (let k = 0; k < 16; k++) { const st = mesh(new T.BoxGeometry(66 - k * 1.5, 0.8, 3), MAT.greyStone()); st.position.set(0, y0 - 6 + k * 0.4, gz + 60 - k * 3); g.add(st); }
      const river = [[26, gz + 2]]; for (let z = gz + 30; z <= 800; z += 30) river.push([26 + Math.sin(z / 110) * 24 + (z - gz) * 0.05, z]);
      g.add(noTop(ME3D.waterRibbon(river, 9, ctx.ground, 0.6)));
      const br = archBridge({ span: 20, width: 7, n: 1, rise: 6, m: MAT.greyStone() }); at(br, 30, ctx.ground(30, 90) - 1, 90, Math.PI / 2); g.add(br);
      // Dale: walled town of tall gabled houses and towers in the valley below
      const dz = 560, dx = 40;
      const dwall = []; for (let k = 0; k <= 40; k++) { const a = k / 40 * Math.PI * 2; dwall.push([dx + Math.cos(a) * 150, dz + Math.sin(a) * 110]); }
      g.add(wall(dwall, { h: 9, t: 3, m: MAT.greyStone() }, ctx.ground));
      for (let k = 0; k < 70; k++) {
        const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 130, x = dx + Math.cos(a) * r, z = dz + Math.sin(a) * r * 0.72;
        const h = house({ w: R.r(6, 9), d: R.r(8, 13), h: R.r(6, 11), roofH: R.r(4, 7), wallMat: MAT.plaster(R.pick(['#d8cbb0', '#cfc0a0', '#e0d4bc'])), roofMat: MAT.tiles(R.pick(['#7a4a32', '#8a5a3a', '#6a5a4a'])), chimney: R() < 0.5 }); at(h, x, ctx.ground(x, z), z, R.r(-0.4, 0.4)); g.add(h);
      }
      for (const [x, z, h] of [[dx - 40, dz - 30, 34], [dx + 50, dz + 10, 28], [dx - 120, dz + 40, 24]]) { const t = tower({ r: 6, h, m: MAT.greyStone(), roofMat: MAT.tiles('#7a4a32') }); at(t, x, ctx.ground(x, z), z); g.add(t); }
      forest(g, ctx, R, 60, rect(-500, 500, 250, 780), { cols: ['#5a7a3a', '#6a8a42', '#7a7a3a'], conifer: 0.5, avoid: (x, z) => Math.hypot(x - dx, (z - dz) / 0.75) < 170 });
      return { group: g, cam: { dist: 380, elev: 0.16, azim: 0.25, lookY: 60, target: [0, gz + 40] }, sky: 'day' };
    },
  };

  // ================================================================ Moria: the West-gate and the Doors of Durin
  B.moriaGate = {
    info: { radius: 320 },
    shape: (x, z) => 60 * sm(40, 160, x),
    build(ctx) {
      const { R } = ctx, g = new T.Group(), y0 = ctx.ground(-8, 0);
      // the sheer cliff face
      for (let k = 0; k < 16; k++) { const z = -300 + k * 40; if (Math.abs(z) < 60) continue; const l = rockLump(R.r(40, 60), R, '#625e5c', 2.2); l.position.set(60 + R.r(0, 25), y0 + R.r(20, 60), z); g.add(noTop(l)); }
      // the cliff: a wall of tall rock slabs, smooth-faced around the doors where the Dwarves dressed it
      for (let k = -12; k <= 12; k++) {
        const z = k * 9, hh = 110 + 30 * Math.abs(n3(k * 0.4, 0, 0, 3)) + Math.abs(k) * 2, dx = Math.abs(k) < 3 ? 0 : R.r(0, 4);
        const slab = mesh(new T.BoxGeometry(30, hh, 9.4), MAT.rock(Math.abs(k) < 3 ? '#8a8682' : '#6e6a66')); slab.position.set(20.5 + dx, y0 + hh / 2 - 6, z); g.add(noTop(slab));
      }
      // the Doors: ithildin drawn on the stone, waking in starlight
      const doorTex = TEX.durin();
      const dm = new T.MeshStandardMaterial({ color: '#232326', emissive: '#cde8ff', emissiveMap: doorTex, emissiveIntensity: 1.8, roughness: 0.6 });
      const door = mesh(new T.PlaneGeometry(22, 22), dm, false, true); door.position.set(5.2, y0 + 11, 0); door.rotation.y = -Math.PI / 2; g.add(door);
      door.userData.animate = (t) => { dm.emissiveIntensity = 1.4 + 0.5 * Math.sin(t * 1.3); };
      const dl = new T.PointLight('#bfe3ff', 4, 80, 1.5); dl.position.set(-6, y0 + 9, 0); g.add(dl);
      // the stair, the two holly trees of Eregion
      for (let k = 0; k < 6; k++) { const st = mesh(new T.BoxGeometry(4, 0.6, 18), MAT.greyStone()); st.position.set(-2 - k * 3, y0 - k * 0.6, 0); g.add(st); }
      for (const s of [-1, 1]) { const h = tree({ kind: 'oak', h: 15, leaf: '#1f4426' }, R); at(h, -8, ctx.ground(-8, s * 14), s * 14); g.add(h); }
      // the dark pool and the Watcher's tentacles reaching from the water
      const pool = mesh(new T.CircleGeometry(110, 48), new T.MeshStandardMaterial({ color: '#07100f', roughness: 0.05, metalness: 0.5 }), false, true); pool.rotation.x = -Math.PI / 2; pool.position.set(-160, y0 - 3, 10); g.add(noTop(pool));
      const tm = new T.MeshStandardMaterial({ color: '#2e3a26', roughness: 0.4, metalness: 0.1 });
      for (let k = 0; k < 11; k++) {
        const bx = -150 + R.r(-45, 45), bz = R.r(-60, 80), len = R.r(18, 40), ph = R() * 6, tg = new T.Group();
        tg.add(taperTube([0, 1, 2, 3, 4, 5].map(i => V3(i * R.r(-1, 3), i * len / 5, Math.sin(i * 0.9 + ph) * 4)), 1.6, 0.15, tm, 8, 30));
        tg.position.set(bx, y0 - 3, bz); g.add(noTop(tg));
        tg.userData.animate = (t) => { tg.rotation.z = Math.sin(t * 0.8 + ph) * 0.18; tg.rotation.x = Math.cos(t * 0.6 + ph) * 0.14; };
      }
      // stars over the Misty Mountains
      const starGeo = new T.BufferGeometry(), sp = [];
      for (let k = 0; k < 1500; k++) { const a = R() * Math.PI * 2, e = Math.acos(R.r(0.15, 1)); sp.push(Math.cos(a) * Math.sin(e) * 9000, Math.cos(e) * 9000, Math.sin(a) * Math.sin(e) * 9000); }
      starGeo.setAttribute('position', new T.Float32BufferAttribute(sp, 3));
      g.add(noTop(new T.Points(starGeo, new T.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, fog: false }))));
      const moon = glowSprite('rgba(220,230,255,0.9)', 600); moon.position.set(-6000, 4000, -3000); g.add(noTop(moon));
      forest(g, ctx, R, 50, rect(-300, -30, -280, 280), { cols: ['#26402c', '#2e4a32', '#22382a'], conifer: 0.8, avoid: (x, z) => Math.hypot(x + 160, z - 10) < 118 || (x > -80 && Math.abs(z) < 60) });
      return { group: g, cam: { dist: 85, elev: 0.14, azim: -Math.PI / 2 + 0.45, lookY: 11, target: [-20, 0] }, sky: 'night' };
    },
  };

  // ================================================================ the Bridge of Khazad-dûm
  B.bridgeKhazadDum = {
    info: { radius: 160, interior: true },
    build(ctx) {
      const { R } = ctx, g = new T.Group();
      const stone = MAT.rock('#6a625a');
      // the hall's two floors either side of the chasm, rows of vast pillars
      for (const side of [-1, 1]) { const f = mesh(new T.BoxGeometry(200, 8, 320), stone); f.position.set(side * 113, -4, 0); g.add(f); }
      for (let i = -4; i <= 4; i++) for (const side of [-1, 1]) for (const row of [0, 1]) {
        const x = side * (40 + row * 36), z = i * 34;
        const p = mesh(new T.CylinderGeometry(4, 5, 110, 10), stone); p.position.set(x, 55, z); g.add(p);
        const cap = mesh(new T.CylinderGeometry(10, 4, 10, 10), stone); cap.position.set(x, 110, z); g.add(cap);
      }
      const ceiling = mesh(new T.BoxGeometry(300, 6, 340), stone); ceiling.position.y = 118; g.add(ceiling);
      // the chasm: fire far below, rising embers
      for (let k = 0; k < 18; k++) { const gl = glowSprite('rgba(255,90,20,0.55)', R.r(40, 90)); gl.position.set(R.r(-12, 12), R.r(-140, -50), R.r(-150, 150)); g.add(gl); }
      const fireLight = new T.PointLight('#ff5a10', 40, 600, 1.2); fireLight.position.set(0, -70, 0); g.add(fireLight);
      fireLight.userData.animate = (t) => { fireLight.intensity = 34 + 8 * Math.sin(t * 7) + 4 * Math.sin(t * 17); };
      const embers = new T.Group();
      for (let k = 0; k < 80; k++) { const e = glowSprite('rgba(255,170,60,0.9)', R.r(0.6, 1.6)); e.userData.ph = R(); e.userData.x = R.r(-12, 12); e.userData.z = R.r(-120, 120); embers.add(e); }
      embers.userData.animate = (t) => embers.children.forEach(e => { const f = (t * 0.1 + e.userData.ph) % 1; e.position.set(e.userData.x + Math.sin(t + e.userData.ph * 9) * 3, -90 + f * 150, e.userData.z); e.material.opacity = 1 - f; });
      g.add(embers);
      // the slender bridge: one arch, no kerb or rail, fifty feet long, across the chasm (east-west)
      const bridge = archBridge({ span: 26, width: 1.2, n: 1, rise: 2.5, m: stone, deck: 0.7 }); bridge.children.slice(1).forEach(c => c.visible = false); bridge.position.set(0, -3.2, 0); g.add(bridge);
      // Gandalf on the bridge, staff raised, light blazing
      const gand = new T.Group();
      const robe = mesh(new T.ConeGeometry(0.5, 1.6, 12), MAT.paint('#9a9ca2')); robe.position.y = 0.8; gand.add(robe);
      const head = mesh(new T.SphereGeometry(0.17, 10, 8), MAT.paint('#d8c8b0')); head.position.y = 1.72; gand.add(head);
      const hat = mesh(new T.ConeGeometry(0.4, 0.95, 12), MAT.paint('#7a7c82')); hat.position.y = 2.15; gand.add(hat);
      const brim = mesh(new T.CylinderGeometry(0.6, 0.6, 0.04, 16), MAT.paint('#7a7c82')); brim.position.y = 1.8; gand.add(brim);
      const beard = mesh(new T.ConeGeometry(0.16, 0.6, 8), MAT.paint('#e8e8e8')); beard.rotation.x = Math.PI; beard.position.set(0.12, 1.45, 0); gand.add(beard);
      const staff = mesh(new T.CylinderGeometry(0.035, 0.035, 2.3, 6), MAT.bark('#6a5030')); staff.position.set(0.45, 1.5, 0); staff.rotation.z = -0.15; gand.add(staff);
      const sword = mesh(new T.BoxGeometry(0.05, 1.1, 0.08), MAT.paint('#dfe6ee')); sword.position.set(0.1, 1.2, 0.35); sword.rotation.x = 0.4; gand.add(sword);
      const sl = glowSprite('rgba(240,248,255,1)', 4); sl.position.set(0.62, 2.7, 0); gand.add(sl);
      const wl = new T.PointLight('#e6f0ff', 10, 80, 1.4); wl.position.set(0.62, 2.8, 0); gand.add(wl);
      wl.userData.animate = (t) => { wl.intensity = 9 + 3 * Math.sin(t * 3.1); sl.scale.setScalar(4 + Math.sin(t * 3.1)); };
      gand.position.set(-3, -2.5 + 0.7 + 2.5, 0); gand.rotation.y = 0; g.add(gand);
      // Durin's Bane: a man-shape of shadow and flame, horned, wings like spreading shadow, a whip of fire
      const bal = new T.Group();
      // dark body with cracks of fire: an emissive map of glowing veins on black
      const veins = ME3D.canvasTex('veins', 128, 256, (c, w, h, R2) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.strokeStyle = '#ff7a20'; c.shadowColor = '#ff4000'; c.shadowBlur = 6; for (let i = 0; i < 40; i++) { c.lineWidth = R2.r(1, 3); c.beginPath(); let x = R2() * w, y = R2() * h; c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += R2.r(-14, 14); y += R2.r(-20, 20); c.lineTo(x, y); } c.stroke(); } });
      const fireMat = new T.MeshStandardMaterial({ color: '#0e0606', emissive: '#ffffff', emissiveMap: veins, emissiveIntensity: 1.6, roughness: 0.9, flatShading: true });
      bal.add(taperTube([V3(0, 0, 0), V3(0, 4, 0.5), V3(0, 8, 0)], 2.4, 1.6, fireMat, 9, 10));
      for (const s of [-1, 1]) {
        bal.add(taperTube([V3(s * 0.8, 0, 0), V3(s * 1.4, -3, 0.5), V3(s * 1.6, -6, 1)], 1, 0.6, fireMat, 7, 8));
        bal.add(taperTube([V3(s * 2, 7, 0), V3(s * 4, 5, 2), V3(s * 5, 2, 4)], 0.8, 0.5, fireMat, 7, 8));
        bal.add(taperTube([V3(s * 1, 10, 0), V3(s * 2.4, 11.5, -0.5), V3(s * 2.9, 13.8, -1.5)], 0.5, 0.05, MAT.obsidian(), 6, 10));
        const ws = new T.Shape(); ws.moveTo(0, 0); ws.quadraticCurveTo(8, 9, 20, 13); ws.lineTo(17, 6); ws.lineTo(19, 1); ws.lineTo(13, 2); ws.lineTo(13, -4); ws.lineTo(7, 0); ws.lineTo(4, -5); ws.lineTo(0, -2);
        const wing = mesh(new T.ShapeGeometry(ws, 8), new T.MeshStandardMaterial({ color: '#050303', transparent: true, opacity: 0.88, side: T.DoubleSide, roughness: 1 }));
        wing.position.set(s * 1.8, 7.5, -1.5); wing.scale.set(s, 1, 1); wing.rotation.y = s * 0.6; bal.add(wing);
        wing.userData.animate = (t) => { wing.rotation.y = s * (0.6 + 0.12 * Math.sin(t * 1.4)); };
      }
      const headB = mesh(new T.ConeGeometry(1.3, 2.8, 8), MAT.obsidian()); headB.position.y = 10.3; bal.add(headB);
      for (const s of [-1, 1]) { const eye = mesh(new T.SphereGeometry(0.22, 8, 6), MAT.glow('#ffd040', 4), false, false); eye.position.set(s * 0.45, 10.4, 1.05); bal.add(eye); }
      bal.add(taperTube([V3(-4.5, 2, 4), V3(-8, -2, 8), V3(-14, 1, 6), V3(-18, -3, 2)], 0.35, 0.08, MAT.lava(), 6, 30));
      const flames = new T.Group(); for (let k = 0; k < 40; k++) { const f = glowSprite('rgba(255,100,20,0.8)', R.r(3, 7)); f.userData.ph = R(); flames.add(f); }
      flames.userData.animate = (t) => flames.children.forEach((f, i) => { const a = i * 2.4 + t * 0.6; f.position.set(Math.cos(a) * 2.8, ((t * 0.5 + f.userData.ph) % 1) * 14 - 2, Math.sin(a) * 2); });
      bal.add(flames);
      const bl = new T.PointLight('#ff5010', 18, 120, 1.3); bl.position.set(0, 6, 3); bal.add(bl);
      bal.position.set(16, 4, 0); bal.rotation.y = -Math.PI / 2; g.add(bal);
      const rim = new T.DirectionalLight('#ffb070', 1.4); rim.position.set(30, -20, 10); g.add(rim);
      const cool = new T.PointLight('#9fc0ff', 6, 60, 1.2); cool.position.set(-12, 8, 8); g.add(cool);
      return { group: g, cam: { dist: 30, elev: 0.06, azim: -1.15, lookY: 3, target: [6, 0] }, sky: 'cave' };
    },
  };

  // ================================================================ Derndingle: the Entmoot
  B.derndingle = {
    info: { radius: 300 },
    shape: (x, z) => -32 * (1 - sm(40, 120, Math.hypot(x, z))),
    build(ctx) {
      const { R } = ctx, g = new T.Group();
      forest(g, ctx, R, 300, ring(95, 300), { cols: ['#2f4b2c', '#36552f', '#2b4430', '#41602f', '#4a6a34'], conifer: 0.55, h: [18, 34] });
      const lawn = mesh(new T.CircleGeometry(80, 48), MAT.grass('#5f8a3e', ['#f4f0e8', '#e8d24a']), false, true); lawn.rotation.x = -Math.PI / 2;
      { const uv = lawn.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 24, uv.getY(i) * 24); }
      const lp = lawn.geometry.attributes.position; for (let i = 0; i < lp.count; i++) lp.setZ(i, ctx.ground(lp.getX(i), -lp.getY(i)) + 0.25); lawn.geometry.computeVertexNormals(); g.add(lawn);
      const barks = ['#7a6650', '#8a7558', '#6e6250', '#94866c', '#7e6c54'], leaves = ['#5a7a36', '#6e8a3e', '#8a7a3a', '#4f6e34', '#9a6a32'];
      const n = 16;
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2, x = Math.cos(a) * 32, z = Math.sin(a) * 32;
        const e = ent(R, k === 0 ? 17 : R.r(11, 15), R.pick(barks), R.pick(leaves)); at(e, x, ctx.ground(x, z), z, -a - Math.PI / 2); g.add(e);
      }
      // the hobbits watching from the edge
      for (const [x, c] of [[0, '#3b5f9a'], [1.2, '#9a6a3b']]) { const hb = mesh(new T.CapsuleGeometry(0.25, 0.5, 4, 8), MAT.paint(c)); hb.position.set(48 + x, ctx.ground(48, 20) + 0.6, 20); g.add(hb); }
      return { group: g, cam: { dist: 70, elev: 0.26, azim: 0.55, lookY: 6 }, sky: 'day' };
    },
  };

  // ================================================================ Minas Tirith
  B.minasTirith = {
    info: { radius: 820 },
    build(ctx) {
      const { R } = ctx, g = new T.Group();
      const M = 1.609344, cx = -200 * M, r0 = 430 * M, step = 0.122;
      const a0 = -Math.PI * 0.64, a1 = Math.PI * 0.64;
      const arc = (r, n = 70, f0 = a0, f1 = a1) => { const p = []; for (let k = 0; k <= n; k++) { const a = f0 + (f1 - f0) * k / n; p.push([cx + Math.cos(a) * r, Math.sin(a) * r]); } return p; };
      for (let k = 0; k < 7; k++) {
        const r = r0 * (1 - k * step);
        g.add(wall(arc(r), { h: k === 0 ? 30 : 16, t: k === 0 ? 9 : 5, m: MAT.whiteStone(), merlons: true }, ctx.ground));
        for (let a = a0 + 0.15; a < a1 - 0.1; a += 0.32 - k * 0.02) { const x = cx + Math.cos(a) * r, z = Math.sin(a) * r; const t = tower({ r: k === 0 ? 7 : 4, h: k === 0 ? 38 : 22, m: MAT.whiteStone(), roofMat: MAT.slate('#59606b') }); at(t, x, ctx.ground(x, z), z); g.add(t); }
      }
      // thousands of houses on the tiers (instanced)
      const houses = [];
      for (let k = 0; k < 6; k++) {
        const rOut = r0 * (1 - k * step), rIn = r0 * (1 - (k + 1) * step);
        for (let r = rIn + 9; r < rOut - 8; r += 12) for (let a = a0 + 0.05; a < a1 - 0.05; a += 11 / r) {
          if (Math.abs(a) < 0.06 && k > 0) continue;
          if (R() < 0.1) continue;
          houses.push([cx + Math.cos(a) * r, Math.sin(a) * r, a, R.r(7, 10), R.r(8, 12), R.r(7, 14)]);
        }
      }
      const bodyGeo = new T.BoxGeometry(1, 1, 1); bodyGeo.translate(0, 0.5, 0);
      const roofGeo = new T.ConeGeometry(Math.SQRT1_2, 1, 4, 1, false, Math.PI / 4); roofGeo.translate(0, 0.5, 0);
      const bodies = new T.InstancedMesh(bodyGeo, MAT.whiteStone(), houses.length);
      const roofsA = new T.InstancedMesh(roofGeo, MAT.slate('#7a828e'), houses.length);
      const roofCols = ['#5a626e', '#6b7380', '#8a8f96', '#4c535d', '#c9c4b8', '#a0a6ae'].map(c => new T.Color(c));
      const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler();
      houses.forEach(([x, z, a, w, d, h], i) => {
        const y = ctx.ground(x, z);
        q.setFromEuler(e.set(0, -a, 0));
        m4.compose(V3(x, y, z), q, V3(d, h, w)); bodies.setMatrixAt(i, m4);
        m4.compose(V3(x, y + h, z), q, V3(d + 1, Math.min(w, d) * 0.55, w + 1)); roofsA.setMatrixAt(i, m4);
        roofsA.setColorAt(i, roofCols[i % roofCols.length]);
      });
      bodies.castShadow = roofsA.castShadow = bodies.receiveShadow = roofsA.receiveShadow = true;
      g.add(bodies, roofsA);
      // the prow of rock that cleaves the city
      const ps = new T.Shape(); ps.moveTo(cx + r0 * 0.12, -30); ps.lineTo(cx + r0 * 0.92, -4); ps.lineTo(cx + r0 * 0.92, 4); ps.lineTo(cx + r0 * 0.12, 30);
      const prowH = 7 * 32 + 20;
      const pg = new T.ExtrudeGeometry(ps, { depth: prowH, bevelEnabled: false }); pg.rotateX(-Math.PI / 2);
      const pp = pg.attributes.position; for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), y = pp.getY(i); if (y > 1) pp.setY(i, y * (1 - 0.75 * (x - cx - r0 * 0.12) / (r0 * 0.8))); }
      pg.computeVertexNormals();
      const prow = mesh(pg, MAT.rock('#d8d2c4')); prow.position.y = ctx.ground(cx + r0 * 0.9, 0) - 10; g.add(prow);
      // the citadel
      const ci = cx + r0 * 0.1, yc = ctx.ground(ci, 0);
      const wt = tower({ r: 8, h: 100, m: MAT.whiteStone(), roofMat: MAT.paint('#e8ecef'), crenel: true, sides: 16 }); at(wt, ci - 30, yc, 0); g.add(wt);
      const pin = mesh(new T.ConeGeometry(2.4, 26, 10), MAT.paint('#f5f7f8')); pin.position.set(ci - 30, yc + 128, 0); g.add(pin);
      const banner = mesh(new T.PlaneGeometry(6, 10), new T.MeshStandardMaterial({ color: '#111', side: T.DoubleSide })); banner.position.set(ci - 30 + 3.5, yc + 136, 0); g.add(banner);
      banner.userData.animate = (t) => { banner.rotation.y = Math.sin(t * 2) * 0.3; };
      const kh = house({ w: 24, d: 44, h: 18, roof: 'hip', roofH: 10, wallMat: MAT.whiteStone(), roofMat: MAT.slate('#59606b') }); at(kh, ci - 64, yc, 0, Math.PI / 2); g.add(kh);
      const court = mesh(new T.CylinderGeometry(26, 26, 0.6, 32), MAT.grass('#6e9a52')); court.position.set(ci + 20, yc + 0.3, 0); g.add(court);
      const wtree = tree({ kind: 'oak', h: 11, leaf: '#f4f6f2', trunk: '#d8d4c8' }, R); at(wtree, ci + 24, yc, 0); g.add(wtree);
      const gx = cx + r0 + 4;
      for (const s of [-1, 1]) { const t = tower({ r: 10, h: 44, m: MAT.whiteStone(), roofMat: MAT.slate('#59606b') }); at(t, gx, ctx.ground(gx, s * 16), s * 16); g.add(t); }
      const gate = mesh(new T.BoxGeometry(4, 22, 18), MAT.paint('#1f2226')); gate.position.set(gx + 3, ctx.ground(gx, 0) + 11, 0); g.add(gate);
      return { group: g, cam: { dist: 1000, elev: 0.2, azim: 1.0, lookY: 120, target: [cx + r0 * 0.4, 0] }, sky: 'day' };
    },
  };

  // ================================================================ the Argonath
  B.argonath = {
    info: { radius: 480 },
    // the gorge: the Anduin runs north-south between sheer cliffs
    shape: (x, z) => -45 * (1 - sm(60, 105, Math.abs(x))) + 120 * sm(130, 190, Math.abs(x) + 25 * n3(0, z / 80, x > 0 ? 1 : 2, 2)),
    build(ctx) {
      const { R } = ctx, g = new T.Group();
      const level = Math.min(...[-300, -100, 0, 100, 300].map(z => ctx.ground(0, z))) + 2;
      const river = []; for (let z = -620; z <= 620; z += 40) river.push([Math.sin(z / 200) * 6, z]);
      g.add(noTop(flatWater(river, 230, level)));
      // the Pillars of the Kings, each on a rock in the river at the gorge's edge, left hand raised
      for (const s of [-1, 1]) {
        const x = s * 72;
        const ped = mesh(new T.CylinderGeometry(26, 34, 40, 12), MAT.rock('#77726a')); ped.position.set(x, level + 8, 0); g.add(ped);
        const k = colossus({ h: 135, m: MAT.rock('#aba597'), crown: true, raised: true, axe: true, wide: 1 }); at(k, x, level + 28, 0, Math.PI); k.scale.x = s; g.add(k);
      }
      for (let k = 0; k < 22; k++) { const s = k % 2 ? 1 : -1, z = -560 + Math.floor(k / 2) * 105; const l = rockLump(R.r(40, 65), R, '#77726a', 2.0); l.position.set(s * R.r(165, 200), ctx.ground(s * 180, z) - 45, z); g.add(noTop(l)); }
      forest(g, ctx, R, 60, (R2) => [R2.pick([-1, 1]) * R2.r(220, 470), R2.r(-460, 460)], { cols: ['#3a5a34', '#2e4a2e'], conifer: 0.8, h: [10, 18] });
      return { group: g, cam: { dist: 330, elev: 0.07, azim: Math.PI + 0.1, lookY: 90, target: [0, 40] }, sky: 'day' };
    },
  };

  // ================================================================ Caras Galadhon
  B.carasGaladhon = {
    info: { radius: 500 },
    shape: (x, z) => 28 * (1 - sm(150, 420, Math.hypot(x, z))),
    build(ctx) {
      const { R } = ctx, g = new T.Group();
      const gold = ['#d8bf58', '#e0c868', '#c9ae48', '#e8d27a'];
      // the green wall and fosse around the city
      const pts = []; for (let k = 0; k <= 72; k++) { const a = k / 72 * Math.PI * 2; pts.push([Math.cos(a) * 430, Math.sin(a) * 430]); }
      g.add(wall(pts.slice(0, 66), { h: 9, t: 6, m: MAT.grass('#5a7a3a'), merlons: false }, ctx.ground));
      // the mallorns: huge silver-grey trunks, golden crowns, flets ringed with lamps, stairs winding up
      const lampMat = MAT.glow('#bfe0ff', 2.2);
      for (let k = 0; k < 90; k++) {
        const a = R() * Math.PI * 2, r = k === 0 ? 0 : Math.sqrt(R.r(0.02, 1)) * 400, x = Math.cos(a) * r, z = Math.sin(a) * r, gy = ctx.ground(x, z);
        const H = k === 0 ? 110 : R.r(55, 85), tr = H * 0.035;
        const t = new T.Group();
        t.add(taperTube([V3(0, -1, 0), V3(R.r(-1, 1), H * 0.5, R.r(-1, 1)), V3(0, H, 0)], tr * 1.4, tr * 0.4, MAT.bark('#c8c4b8'), 10, 12));
        for (let b = 0; b < 6; b++) { const ba = R() * 6.28, by = H * R.r(0.55, 0.85); t.add(taperTube([V3(0, by, 0), V3(Math.cos(ba) * H * 0.12, by + H * 0.08, Math.sin(ba) * H * 0.12), V3(Math.cos(ba) * H * 0.2, by + H * 0.18, Math.sin(ba) * H * 0.2)], tr * 0.4, tr * 0.1, MAT.bark('#c8c4b8'), 6, 8)); }
        for (let c = 0; c < 9; c++) { const s = H * R.r(0.1, 0.17); const bl = mesh(new T.IcosahedronGeometry(1, 1), MAT.leaf(R.pick(gold))); bl.scale.set(s * 1.3, s * 0.7, s * 1.3); const ca = R() * 6.28, cr = H * R.r(0, 0.17); bl.position.set(Math.cos(ca) * cr, H * R.r(0.72, 1.02), Math.sin(ca) * cr); t.add(bl); }
        const nf = k === 0 ? 4 : R() < 0.6 ? 2 : 1;
        for (let f = 0; f < nf; f++) {
          const fy = H * (0.3 + f * 0.15), fr = H * R.r(0.06, 0.09) * (k === 0 ? 1.6 : 1);
          const flet = mesh(new T.CylinderGeometry(fr, fr, 0.6, 20), MAT.planks('#d8d0b8')); flet.position.y = fy; t.add(flet);
          if (k === 0 || R() < 0.5) { const pav = mesh(new T.ConeGeometry(fr * 0.8, fr * 0.6, 16), MAT.paint('#eae6dc')); pav.position.y = fy + 2.6; t.add(pav); const wallc = mesh(new T.CylinderGeometry(fr * 0.6, fr * 0.6, 2.4, 16, 1, true), MAT.plaster('#f2efe6')); wallc.position.y = fy + 1.4; t.add(wallc); }
          for (let l = 0; l < 10; l++) { const la = l / 10 * Math.PI * 2; const lm = mesh(new T.SphereGeometry(0.25, 6, 4), lampMat, false, false); lm.position.set(Math.cos(la) * fr, fy + 0.6, Math.sin(la) * fr); t.add(lm); }
        }
        // stair winding up the trunk
        const st = []; for (let s = 0; s <= 30; s++) { const sa = s * 0.55; st.push(V3(Math.cos(sa) * tr * 1.5, s / 30 * H * 0.3, Math.sin(sa) * tr * 1.5)); }
        t.add(taperTube(st, 0.35, 0.35, MAT.planks('#d8d0b8'), 4, 60));
        at(t, x, gy, z); g.add(t);
      }
      // lamp glow drifting in the dusk
      for (let k = 0; k < 120; k++) { const s = glowSprite('rgba(170,210,255,0.7)', R.r(2, 4)); const a = R() * 6.28, r = R() * 400; s.position.set(Math.cos(a) * r, ctx.ground(Math.cos(a) * r, Math.sin(a) * r) + R.r(10, 60), Math.sin(a) * r); g.add(s); }
      // the fountain and Galadriel's Mirror below the hill
      const basin = mesh(new T.CylinderGeometry(1.6, 1.2, 1.2, 24), MAT.paint('#c0c4c8')); basin.position.set(60, ctx.ground(60, 80) + 0.9, 80); g.add(basin);
      const mirror = mesh(new T.CircleGeometry(1.4, 24), new T.MeshStandardMaterial({ color: '#cfe6ff', metalness: 1, roughness: 0.02, emissive: '#5a8acc', emissiveIntensity: 0.3 })); mirror.rotation.x = -Math.PI / 2; mirror.position.set(60, ctx.ground(60, 80) + 1.52, 80); g.add(mirror);
      return { group: g, cam: { dist: 300, elev: 0.18, azim: 0.6, lookY: 50 }, sky: 'dusk' };
    },
  };

  ME3D.builders = B;
})();
