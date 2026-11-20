// Procedural settlements and hand-built landmarks. Runs inside the tile worker (see worker.js):
// the main thread concatenates this function's source in front of MEWorker's.
//
// A settlement is generated once (deterministically from its name) into a list of primitives in
// map units: ground patches, streets, walls, buildings, trees, glows. The renderer then draws
// those primitives into any tile that overlaps the settlement, so buildings line up across tiles.
function MESettlements(H) {
  'use strict';
  const { hash2, rnd, gnoise, clamp, smooth, mix, refine, styleAt, sampleTerrain } = H;

  // ---------------------------------------------------------------- seeded RNG
  function rng(seed) {
    let a = seed >>> 0;
    const f = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = (a, b) => a + (b - a) * f();
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    return f;
  }
  function strSeed(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

  // ---------------------------------------------------------------- styles
  const STY = {
    hobbit: { bw: [5, 8], bl: [6, 10], roofs: [[168, 140, 84], [150, 122, 76], [124, 112, 96]], roof: 'gable', walls: [[214, 200, 170]], street: [150, 128, 96], sw: 3, ground: [118, 112, 74], garden: 0.8, trees: 0.5, smial: 0.55, hedge: true },
    bree: { bw: [6, 9], bl: [8, 14], roofs: [[160, 132, 82], [112, 108, 104], [128, 98, 74]], roof: 'gable', walls: [[200, 188, 164]], street: [140, 122, 96], sw: 4, ground: [120, 110, 84], garden: 0.55, trees: 0.35 },
    rohan: { bw: [6, 9], bl: [12, 22], roofs: [[178, 146, 84], [160, 128, 72], [140, 110, 66]], roof: 'gable', walls: [[150, 120, 88]], street: [150, 132, 100], sw: 4, ground: [132, 124, 88], garden: 0.3, trees: 0.15, palisade: [112, 88, 60] },
    gondor: { bw: [7, 11], bl: [9, 15], roofs: [[118, 122, 130], [202, 198, 188], [96, 102, 112], [182, 172, 160]], roof: 'hip', walls: [[222, 218, 208]], street: [184, 178, 166], sw: 5, ground: [176, 168, 150], garden: 0.25, trees: 0.25, wall: [226, 222, 212] },
    elven: { bw: [8, 12], bl: [10, 18], roofs: [[104, 140, 126], [196, 200, 188], [140, 150, 120]], roof: 'hip', walls: [[230, 228, 218]], street: [196, 190, 170], sw: 4, ground: [110, 126, 84], garden: 0.6, trees: 0.8, curvy: true },
    dale: { bw: [6, 9], bl: [8, 13], roofs: [[122, 90, 66], [140, 100, 70], [100, 84, 70]], roof: 'gable', walls: [[168, 150, 128]], street: [150, 134, 110], sw: 4, ground: [128, 116, 92], garden: 0.35, trees: 0.2, wall: [150, 144, 134] },
    harad: { bw: [7, 12], bl: [7, 14], roofs: [[214, 198, 164], [228, 222, 210], [198, 172, 136], [186, 120, 90]], roof: 'flat', walls: [[200, 176, 140]], street: [196, 176, 140], sw: 4, ground: [190, 166, 128], garden: 0.15, trees: 0.25, palms: true, wall: [196, 168, 128] },
    easterling: { bw: [6, 9], bl: [9, 16], roofs: [[150, 96, 70], [120, 84, 64], [160, 128, 90]], roof: 'gable', walls: [[150, 126, 100]], street: [156, 136, 106], sw: 4, ground: [150, 134, 100], garden: 0.2, trees: 0.1, palisade: [96, 74, 54] },
    mordor: { bw: [6, 10], bl: [14, 30], roofs: [[66, 60, 56], [80, 72, 64], [56, 52, 52]], roof: 'flat', walls: [[60, 56, 54]], street: [84, 76, 68], sw: 4, ground: [74, 66, 60], garden: 0, trees: 0, wall: [52, 50, 50], grid: true },
    mannish: { bw: [6, 9], bl: [8, 14], roofs: [[150, 124, 80], [120, 100, 80], [110, 108, 106]], roof: 'gable', walls: [[180, 166, 140]], street: [146, 128, 100], sw: 4, ground: [126, 116, 88], garden: 0.4, trees: 0.3 },
  };

  // ---------------------------------------------------------------- builder
  class B {
    constructor(x, y, rot) { this.x = x; this.y = y; this.c = Math.cos(rot || 0); this.s = Math.sin(rot || 0); this.rot = rot || 0;
      this.ground = []; this.streets = []; this.water = []; this.walls = []; this.bldgs = []; this.trees = []; this.glows = []; this.lines = []; this.ships = []; this.mounds = []; this.stamps = []; this.occ = new Map(); }
    // local (u east, v south, in mu) -> world
    w(u, v) { return [this.x + u * this.c - v * this.s, this.y + u * this.s + v * this.c]; }
    wp(pts) { const o = []; for (let i = 0; i < pts.length; i += 2) { const p = this.w(pts[i], pts[i + 1]); o.push(p[0], p[1]); } return o; }
    disk(u, v, r, col, a = 1) { const [x, y] = this.w(u, v); this.ground.push({ t: 'c', x, y, r, col, a }); }
    poly(pts, col, a = 1) { this.ground.push({ t: 'p', p: this.wp(pts), col, a }); }
    street(pts, w, col, a = 1) { this.streets.push({ p: this.wp(pts), w, col, a }); }
    wall(pts, w, h, col, closed) { this.walls.push({ p: this.wp(pts), w, h, col, closed }); }
    bldg(u, v, w, l, ang, h, roof, rc, wc) {
      const [x, y] = this.w(u, v);
      if (!this.free(x, y, Math.min(w, l) * 0.5)) return false;
      this.mark(x, y, Math.max(w, l) * 0.45);
      this.bldgs.push({ x, y, w, l, a: ang + this.rot, h, roof, rc, wc });
      return true;
    }
    tree(u, v, r, col, h) { const [x, y] = this.w(u, v); this.trees.push({ x, y, r, col, h: h || r * 2.2 }); }
    glow(u, v, r, col) { const [x, y] = this.w(u, v); this.glows.push({ x, y, r, col }); }
    mound(u, v, r, col, door = true) { const [x, y] = this.w(u, v); if (!this.free(x, y, r)) return false; this.mark(x, y, r); this.mounds.push({ x, y, r, col, door }); return true; }
    ship(u, v, l, ang, col, sail) { const [x, y] = this.w(u, v); this.ships.push({ x, y, l, a: ang + this.rot, col, sail }); }
    // occupancy hash so buildings don't overlap
    free(x, y, r) {
      const g = 2, x0 = Math.floor((x - r) / g), x1 = Math.floor((x + r) / g), y0 = Math.floor((y - r) / g), y1 = Math.floor((y + r) / g);
      for (let a = x0; a <= x1; a++) for (let b = y0; b <= y1; b++) if (this.occ.has(a * 73856093 ^ b * 19349663)) return false;
      return true;
    }
    mark(x, y, r) {
      const g = 2, x0 = Math.floor((x - r) / g), x1 = Math.floor((x + r) / g), y0 = Math.floor((y - r) / g), y1 = Math.floor((y + r) / g);
      for (let a = x0; a <= x1; a++) for (let b = y0; b <= y1; b++) this.occ.set(a * 73856093 ^ b * 19349663, 1);
    }
    markLine(p, w) { for (let i = 2; i < p.length; i += 2) { const L = Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]); const n = Math.ceil(L / 3); for (let k = 0; k <= n; k++) this.mark(mix(p[i - 2], p[i], k / n), mix(p[i - 1], p[i + 1], k / n), w / 2); } }
  }

  const terrainAt = (x, y) => sampleTerrain(x, y); // {h, water} or null if unknown

  // ---------------------------------------------------------------- generic settlement
  function circlePts(r, n, jitter, R, cx = 0, cy = 0, a0 = 0, a1 = Math.PI * 2) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n;
      const rr = r * (1 + (jitter ? (R() - 0.5) * jitter : 0));
      pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    return pts;
  }
  function polyline(b, pts, fn, step) {
    // walk along local polyline pts calling fn(u, v, tx, ty) every `step` mu
    for (let i = 2; i < pts.length; i += 2) {
      const x0 = pts[i - 2], y0 = pts[i - 1], x1 = pts[i], y1 = pts[i + 1];
      const L = Math.hypot(x1 - x0, y1 - y0); if (L < 1) continue;
      const tx = (x1 - x0) / L, ty = (y1 - y0) / L;
      for (let d = step * 0.5; d < L; d += step) fn(x0 + tx * d, y0 + ty * d, tx, ty);
    }
  }
  function okGround(b, u, v, maxSlope) {
    const [x, y] = b.w(u, v);
    const t = terrainAt(x, y);
    if (!t) return true;
    if (t.water) return false;
    return t.slope === undefined || t.slope < (maxSlope || 0.35);
  }
  function house(b, st, R, u, v, ang, scale = 1) {
    if (!okGround(b, u, v)) return false;
    const w = R.range(st.bw[0], st.bw[1]) * scale, l = R.range(st.bl[0], st.bl[1]) * scale;
    const rc = R.pick(st.roofs);
    const roof = st.roof === 'gable' && R() < 0.2 ? 'hip' : st.roof;
    return b.bldg(u, v, w, l, ang, R.range(4, 7) * scale, roof, rc, st.walls[0]);
  }
  function lineStreetHouses(b, st, R, pts, dens, scale, maxR) {
    polyline(b, pts, (u, v, tx, ty) => {
      for (const side of [-1, 1]) {
        const r = Math.hypot(u, v);
        if (R() > dens * (1 - Math.pow(r / maxR, 2))) continue;
        const off = st.sw / 2 + st.bw[1] * scale * 0.5 + R.range(1, 4);
        const hu = u - ty * off * side, hv = v + tx * off * side;
        const ang = Math.atan2(ty, tx) + (R() < 0.3 ? Math.PI / 2 : 0);
        if (st.smial && R() < st.smial) {
          if (okGround(b, hu, hv, 0.5)) { const [x, y] = b.w(hu, hv); b.mound(hu, hv, R.range(4, 7), [92, 124, 58]); if (R() < 0.6) b.tree(hu + R.range(-6, 6), hv + R.range(-6, 6), R.range(2.5, 4), [60, 92, 40]); }
          continue;
        }
        if (house(b, st, R, hu, hv, ang, scale)) {
          // gardens behind the house
          if (R() < st.garden) {
            const go = off + st.bw[1] * scale + R.range(4, 9);
            const gu = u - ty * go * side, gv = v + tx * go * side;
            const gw = R.range(6, 12), gl = R.range(8, 16);
            const a = Math.atan2(ty, tx), ca = Math.cos(a), sa = Math.sin(a);
            const pts2 = [];
            for (const [p, q] of [[-gl / 2, -gw / 2], [gl / 2, -gw / 2], [gl / 2, gw / 2], [-gl / 2, gw / 2]]) pts2.push(gu + p * ca - q * sa, gv + p * sa + q * ca);
            b.poly(pts2, R() < 0.5 ? [96, 116, 58] : [120, 110, 72], 0.85);
            if (st.hedge) b.streets.push({ p: b.wp(pts2.concat(pts2.slice(0, 2))), w: 1.4, col: [52, 76, 38], a: 0.9 });
          }
          if (R() < st.trees) b.tree(hu + R.range(-10, 10), hv + R.range(-10, 10), R.range(2.5, 5), st.palms ? [70, 100, 50] : [56, 86, 40]);
        }
      }
    }, (st.bl[1] * scale) * 0.9);
  }

  function genGeneric(s) {
    const R = rng(s.seed);
    const st = STY[s.style] || STY.mannish;
    const b = new B(s.x, s.y, 0);
    const size = s.R;
    // main axis: follow the nearest mapped road, if any
    let ang = s.axis !== undefined ? s.axis : R() * Math.PI;
    const kind = s.kind;
    if (kind === 'beacon') {
      b.disk(0, 0, 6, [150, 144, 132]);
      b.bldg(0, 0, 5, 5, ang, 3, 'pyre', [110, 84, 56], [120, 110, 100]);
      return b;
    }
    if (kind === 'tower') {
      const tc = st.wall || [150, 146, 138];
      b.disk(0, 0, 22, st.ground, 0.6);
      b.wall(circlePts(18, 24, 0, R), 2.5, 6, tc, true);
      b.bldg(0, 0, 13, 13, 0, R.range(30, 60), 'cone', s.style === 'mordor' ? [50, 48, 48] : [120, 118, 116], tc);
      return b;
    }
    if (kind === 'ruin') {
      const n = Math.round(size / 12);
      b.disk(0, 0, size * 0.8, [128, 124, 100], 0.35);
      for (let i = 0; i < n; i++) {
        const r = size * Math.sqrt(R()) * 0.85, a = R() * Math.PI * 2;
        const u = Math.cos(a) * r, v = Math.sin(a) * r;
        if (!okGround(b, u, v)) continue;
        const w = R.range(6, 14), l = R.range(8, 20);
        b.bldg(u, v, w, l, ang + (R() < 0.5 ? 0 : Math.PI / 2), R.range(1, 3), 'ruin', [150, 146, 136], [150, 146, 136]);
      }
      if (size > 200) b.wall(circlePts(size * 0.9, 40, 0.08, R), 4, 3, [150, 146, 138], false);
      return b;
    }
    const isCity = kind === 'city' || kind === 'haven' || kind === 'fortress';
    const isTown = kind === 'town' || kind === 'fort' || kind === 'citadel';
    // ground tint
    b.disk(0, 0, size * 0.9, st.ground, isCity ? 0.55 : 0.35);
    // streets
    const streets = [];
    const L = size * 1.15;
    const main = refineLocal([-L * Math.cos(ang), -L * Math.sin(ang), 0, 0, L * Math.cos(ang), L * Math.sin(ang)], R, size * 0.06);
    streets.push(main);
    const nSide = isCity ? 10 : isTown ? 6 : kind === 'village' ? 3 : 1;
    for (let i = 0; i < nSide; i++) {
      const t = R.range(-0.7, 0.7);
      const bx = t * L * Math.cos(ang), by = t * L * Math.sin(ang);
      const a2 = ang + Math.PI / 2 + R.range(-0.4, 0.4) + (R() < 0.5 ? Math.PI : 0);
      const len = size * R.range(0.35, 0.85);
      streets.push(refineLocal([bx, by, bx + Math.cos(a2) * len * 0.5, by + Math.sin(a2) * len * 0.5, bx + Math.cos(a2) * len, by + Math.sin(a2) * len], R, len * 0.08));
    }
    if (isCity) {
      streets.push(circlePts(size * 0.45, 28, 0.1, R));
      if (size > 300) streets.push(circlePts(size * 0.75, 40, 0.08, R));
    }
    if (st.grid) { // Mordor camps: barracks in rows
      for (let gx = -3; gx <= 3; gx++) streets.push([gx * size / 4, -size * 0.8, gx * size / 4, size * 0.8]);
    }
    for (const p of streets) { b.street(p, st.sw, st.street); b.markLine(b.wp(p), st.sw); }
    // central hall / keep / square
    if (isCity || isTown) {
      b.disk(0, 0, size * 0.08 + 6, st.street, 0.9);
      const keep = isCity ? 1.8 : 1.3;
      b.bldg(size * 0.12, -size * 0.1, st.bw[1] * keep * 1.3, st.bl[1] * keep * 1.4, ang, 12, st.roof === 'flat' ? 'flat' : 'hip', R.pick(st.roofs), st.walls[0]);
    }
    const dens = isCity ? 0.95 : isTown ? 0.8 : 0.6;
    for (const p of streets) lineStreetHouses(b, st, R, p, dens, isCity ? 1.1 : 1, size);
    // walls
    const walled = s.walls !== undefined ? s.walls : (isCity && (st.wall || st.palisade)) || (kind === 'fort' || kind === 'citadel');
    if (walled) {
      const wc = st.palisade && !st.wall ? st.palisade : (st.wall || [150, 146, 138]);
      const ring = circlePts(size * 0.95, 48, 0.05, R);
      b.wall(ring, st.palisade && !st.wall ? 2 : 5, st.palisade && !st.wall ? 5 : 10, wc, true);
      if (!(st.palisade && !st.wall)) for (let i = 0; i < 48; i += 6) b.bldg(ring[2 * i], ring[2 * i + 1], 9, 9, 0, 14, 'flat', wc, wc);
    }
    // scattered farmsteads around villages and towns
    const nFarm = isCity ? 8 : isTown ? 6 : 3;
    for (let i = 0; i < nFarm; i++) {
      const a = R() * Math.PI * 2, r = size * R.range(1.1, 2.2);
      house(b, st, R, Math.cos(a) * r, Math.sin(a) * r, R() * Math.PI);
    }
    return b;
  }
  function refineLocal(pts, R, amp) {
    const out = [pts[0], pts[1]];
    for (let i = 2; i < pts.length; i += 2) {
      const x0 = pts[i - 2], y0 = pts[i - 1], x1 = pts[i], y1 = pts[i + 1];
      const n = 4;
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        const j = k < n ? (R() - 0.5) * amp : 0;
        const L = Math.hypot(x1 - x0, y1 - y0) || 1;
        out.push(mix(x0, x1, t) - (y1 - y0) / L * j, mix(y0, y1, t) + (x1 - x0) / L * j);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- specials
  const WHITE = [232, 230, 222], STONE = [206, 202, 192], SLATE = [112, 118, 128], BLACK = [40, 38, 40], DARK = [58, 54, 54];
  const SPECIALS = {
    // The seven-walled city on the eastern spur of Mindolluin. Gate faces east (+u).
    minasTirith(s, b, R) {
      const r0 = 430; // first wall radius (mu); ~700 m
      const cx = -200; // circles are centred west of the site, inside the mountain's shoulder
      // Mount Mindolluin rises behind the city (the ME-DEM has only foothills here); the city's
      // hill is a spur running east from it
      const peak = b.w(-4200, 600), spur = b.w(cx - r0 * 0.6, 0);
      if (s.massif) b.stamps.push({ type: 'massif', x: peak[0], y: peak[1], r: 5200, height: 1550, sx: spur[0], sy: spur[1], spurH: 260, spurW: 900, R: 6500 });
      b.stamps.push({ type: 'terraces', x: b.w(cx, 0)[0], y: b.w(cx, 0)[1], r0, n: 7, step: 0.122, rise: 32, R: r0 + 40, rot: b.rot });
      for (let k = 0; k < 7; k++) {
        const r = r0 * (1 - k * 0.122);
        const a0 = -Math.PI * 0.64, a1 = Math.PI * 0.64;
        b.ground.push({ t: 'ring', x: b.w(cx, 0)[0], y: b.w(cx, 0)[1], r, a0: a0 + b.rot, a1: a1 + b.rot, col: [176, 170, 158], a: 1.4 });
        const ring = circlePts(r, 64, 0, R, cx, 0, a0, a1);
        b.wall(ring, k === 0 ? 8 : 5, k === 0 ? 30 : 16, k === 0 ? [206, 202, 192] : [222, 220, 212], false);
        // ring street and houses on each level
        if (k < 6) {
          const rs = r - r0 * 0.061;
          const street = circlePts(rs, 72, 0, R, cx, 0, a0 + 0.05, a1 - 0.05);
          b.street(street, 4, [190, 186, 176]);
          b.markLine(b.wp(street), 4);
          polyline(b, street, (u, v, tx, ty) => {
            for (const side of [-1, 1]) {
              if (R() < 0.05) continue;
              const off = 5.5 + R.range(0, 3);
              const hu = u - ty * off * side, hv = v + tx * off * side;
              b.bldg(hu, hv, R.range(6, 9), R.range(8, 13), Math.atan2(ty, tx), R.range(6, 10), R() < 0.6 ? 'hip' : 'flat', R.pick([SLATE, [198, 194, 184], [150, 152, 158], [214, 210, 200]]), WHITE);
              const hu2 = u - ty * (off + 11) * side, hv2 = v + tx * (off + 11) * side;
              if (R() < 0.7) b.bldg(hu2, hv2, R.range(6, 9), R.range(7, 12), Math.atan2(ty, tx), R.range(5, 9), R() < 0.6 ? 'hip' : 'flat', R.pick([SLATE, [198, 194, 184], [150, 152, 158], [214, 210, 200]]), WHITE);
            }
          }, 7.5);
        }
      }
      // the great prow of rock splitting the city from the second level up
      b.poly([cx + r0 * 0.88, -12, cx + r0 * 0.14, -40, cx + r0 * 0.14, 40, cx + r0 * 0.88, 12], [178, 172, 160], 1);
      // citadel: Court of the Fountain, White Tower, the White Tree
      const ci = cx + r0 * 0.1;
      b.disk(ci, 0, 52, [222, 220, 212]);
      b.bldg(ci - 18, 0, 16, 16, 0, 90, 'cone', [236, 236, 232], WHITE);   // Tower of Ecthelion
      b.bldg(ci - 34, 0, 26, 40, 0, 18, 'hip', [200, 198, 192], WHITE);    // the King's House
      b.disk(ci + 18, 0, 14, [126, 160, 120]);                              // the court lawn
      b.tree(ci + 18, 0, 6, [218, 222, 214], 12);                           // the White Tree
      // great gate & the road down to the Pelennor
      b.street([cx + r0 + 10, 0, cx + r0 + 900, 60, cx + r0 + 3500, 600], 8, [196, 186, 166]);
      // Rammas Echor: the outer wall around the Pelennor fields
      const rr = 5400;
      b.wall(circlePts(rr, 140, 0.015, R, 2600, 600, -Math.PI * 0.62, Math.PI * 0.75), 6, 10, [176, 170, 160], false);
      // Pelennor farmsteads
      for (let i = 0; i < 70; i++) {
        const a = R.range(-1.6, 1.6), r = R.range(900, 4800);
        const u = 2600 + Math.cos(a) * r - 2000, v = 600 + Math.sin(a) * r;
        if (Math.hypot(u - cx, v) < r0 + 80) continue;
        if (!okGround(b, u, v, 0.2)) continue;
        house(b, STY.gondor, R, u, v, R() * Math.PI);
        house(b, STY.gondor, R, u + R.range(-20, 20), v + R.range(-20, 20), R() * Math.PI);
      }
    },
    osgiliath(s, b, R) {
      // ruined city astride the Anduin, broken bridge
      b.disk(0, 0, 900, [150, 146, 130], 0.3);
      for (let i = 0; i < 260; i++) {
        const u = R.range(-900, 900), v = R.range(-700, 700);
        if (!okGround(b, u, v)) continue;
        b.bldg(u, v, R.range(8, 18), R.range(10, 26), R.range(-0.1, 0.1), R.range(2, 6), 'ruin', [176, 172, 162], STONE);
      }
      b.bldg(-60, 0, 70, 70, 0, 6, 'ruinDome', [170, 166, 156], STONE); // Dome of Stars
      b.street([-900, 0, -120, 0], 7, [170, 164, 150]);
      b.street([120, 0, 900, 0], 7, [170, 164, 150]);
      b.walls.push({ p: b.wp([-300, 0, -40, 0]), w: 14, h: 8, col: [184, 180, 170] });
      b.walls.push({ p: b.wp([40, 0, 300, 0]), w: 14, h: 8, col: [184, 180, 170] });
    },
    minasMorgul(s, b, R) {
      const pale = [176, 190, 172];
      b.disk(0, 0, 150, [120, 130, 118], 0.8);
      b.wall(circlePts(140, 40, 0.03, R), 7, 24, pale, true);
      for (let i = 0; i < 70; i++) { const a = R() * Math.PI * 2, r = R.range(30, 125); b.bldg(Math.cos(a) * r, Math.sin(a) * r, R.range(7, 10), R.range(9, 14), a, R.range(8, 14), 'flat', [150, 164, 146], pale); }
      b.bldg(0, 0, 22, 22, Math.PI / 4, 110, 'cone', [168, 196, 168], pale);
      b.glow(0, 0, 40, 'rgba(150,255,170,0.35)');
      b.street([140, 0, 520, 30], 6, [130, 140, 126]);
    },
    isengard(s, b, R) {
      const rr = 520;
      b.stamps.push({ type: 'flatten', x: s.x, y: s.y, r: rr - 10, R: rr + 60 });
      b.disk(0, 0, rr, [92, 88, 80], 1);
      // pits and forges
      for (let i = 0; i < 90; i++) {
        const a = R() * Math.PI * 2, r = R.range(80, rr - 50);
        const u = Math.cos(a) * r, v = Math.sin(a) * r;
        if (R() < 0.45) { b.disk(u, v, R.range(6, 16), [40, 36, 34], 1); if (R() < 0.4) b.glow(u, v, 10, 'rgba(255,140,40,0.35)'); }
        else b.bldg(u, v, R.range(8, 14), R.range(10, 22), a, R.range(3, 7), 'flat', [70, 66, 62], DARK);
      }
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + Math.PI / 8; b.street([Math.cos(a) * 40, Math.sin(a) * 40, Math.cos(a) * (rr - 20), Math.sin(a) * (rr - 20)], 5, [120, 118, 110]); }
      b.street([0, 40, 0, rr + 600], 7, [130, 126, 116]); // road south to the gate
      b.wall(circlePts(rr, 96, 0, R), 16, 34, [44, 42, 42], true);
      // dwellings cut into the ring
      for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2; b.bldg(Math.cos(a) * (rr - 22), Math.sin(a) * (rr - 22), 8, 14, a + Math.PI / 2, 10, 'flat', [62, 58, 56], DARK); }
      // Orthanc
      b.disk(0, 0, 44, [56, 52, 52], 1);
      b.bldg(0, 0, 30, 30, Math.PI / 4, 95, 'orthanc', [30, 30, 34], BLACK);
    },
    baradDur(s, b, R) {
      b.disk(0, 0, 900, [46, 42, 40], 0.85);
      for (let k = 0; k < 3; k++) {
        const r = 820 - k * 230;
        const pts = [];
        const n = 14 + k * 2;
        for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; const rr = r * (i % 2 ? 0.9 : 1); pts.push(Math.cos(a) * rr, Math.sin(a) * rr); }
        b.wall(pts, 22 - k * 3, 60 + k * 30, [36, 34, 34], true);
        for (let i = 0; i < n; i += 2) b.bldg(pts[2 * i], pts[2 * i + 1], 34, 34, 0, 90 + k * 30, 'flat', [44, 40, 40], BLACK);
      }
      for (let i = 0; i < 140; i++) { const a = R() * Math.PI * 2, r = R.range(160, 780); b.bldg(Math.cos(a) * r, Math.sin(a) * r, R.range(14, 30), R.range(20, 50), a, R.range(14, 40), 'flat', [52, 48, 46], BLACK); }
      b.bldg(0, 0, 130, 130, 0.3, 700, 'baradDur', [28, 26, 28], BLACK);
      b.glow(0, 0, 60, 'rgba(255,90,20,0.55)'); // the Eye
      for (let i = 0; i < 25; i++) { const a = R() * Math.PI * 2, r = R.range(200, 800); b.glow(Math.cos(a) * r, Math.sin(a) * r, R.range(8, 18), 'rgba(255,120,40,0.4)'); }
    },
    mountDoom(s, b, R) {
      // Orodruin's cone is already in the DEM; add the crater, the Sammath Naur road and lava
      b.stamps.push({ type: 'crater', x: s.x, y: s.y, r: 170, depth: 80 });
      b.glow(0, 0, 200, 'rgba(255,90,20,0.55)');
      b.glow(0, 0, 90, 'rgba(255,190,80,0.75)');
      for (let f = 0; f < 6; f++) {
        let a = R() * Math.PI * 2, r = 220;
        const pts = [Math.cos(a) * r, Math.sin(a) * r];
        const len = R.range(900, 2600);
        let da = 0;
        while (r < len) { da = da * 0.8 + R.range(-0.03, 0.03); a += da; r += 40; pts.push(Math.cos(a) * r, Math.sin(a) * r); }
        b.lines.push({ p: b.wp(pts), w: R.range(6, 12), col: 'rgba(190,60,20,0.5)', glow: true });
      }
      const road = [];
      for (let t = 0; t <= 1; t += 0.01) { const a = -0.3 + t * 4.6, r = 3600 - t * 3300; road.push(Math.cos(a) * r, Math.sin(a) * r); }
      b.street(road, 5, [92, 84, 78], 0.8);
    },
    blackGate(s, b, R) {
      // wall across the Cirith Gorgor (runs west-east), gate in the middle, Towers of the Teeth either side
      b.disk(0, 0, 500, [56, 52, 50], 0.8);
      b.wall([-560, 30, -200, 0, 200, 0, 560, 30], 26, 60, [34, 32, 32], false);
      b.bldg(0, 0, 70, 40, 0, 80, 'flat', [28, 26, 26], BLACK);
      b.bldg(-660, 60, 50, 50, 0, 140, 'cone', [40, 38, 40], BLACK);
      b.bldg(660, 60, 50, 50, 0, 140, 'cone', [40, 38, 40], BLACK);
      for (let i = 0; i < 40; i++) b.bldg(R.range(-400, 400), R.range(-400, -80), R.range(10, 18), R.range(20, 40), R.range(-0.2, 0.2), 8, 'flat', [60, 56, 54], DARK);
      b.street([0, 0, 0, 1800], 10, [88, 80, 72]); b.street([0, 0, 0, -1500], 10, [88, 80, 72]);
    },
    argonath(s, b, R) {
      // the Pillars of the Kings, one on each bank (river runs roughly north-south here)
      for (const side of [-1, 1]) {
        const u = side * 95;
        b.disk(u, 0, 30, [150, 146, 138], 1);
        b.bldg(u, 0, 24, 14, 0, 140, 'statue', [170, 166, 158], [170, 166, 158]);
      }
    },
    edoras(s, b, R) {
      b.stamps.push({ type: 'hill', x: s.x, y: s.y, r: 260, height: 45 });
      const st = STY.rohan;
      b.disk(0, 0, 250, [120, 130, 76], 0.5);
      const ring = circlePts(240, 48, 0.04, R);
      b.wall(ring, 3, 6, st.palisade, true);
      // the stone-paved way climbs from the gate in a zigzag to Meduseld
      const way = [-260, 30, -170, 40, -120, -10, -60, 20, -10, -5, 20, -20];
      b.street(way, 4, [170, 160, 140]); b.markLine(b.wp(way), 4);
      const lanes = [way];
      for (let i = 0; i < 9; i++) {
        const a = R() * Math.PI * 2, r0 = R.range(40, 80), r1 = R.range(170, 230);
        const lane = refineLocal([Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a + 0.3) * r1, Math.sin(a + 0.3) * r1], R, 30);
        b.street(lane, 3, st.street); b.markLine(b.wp(lane), 3); lanes.push(lane);
      }
      const ringLane = circlePts(150, 40, 0.06, R); b.street(ringLane, 3, st.street); b.markLine(b.wp(ringLane), 3); lanes.push(ringLane);
      for (const l of lanes) lineStreetHouses(b, st, R, l, 0.85, 1, 260);
      b.disk(30, -20, 40, [150, 144, 120], 0.8);
      b.bldg(30, -20, 16, 44, 0.2, 18, 'gable', [206, 172, 72], [150, 120, 80]); // Meduseld, the golden hall
      // barrows of the kings with simbelmynë along the road west
      for (let i = 0; i < 16; i++) { const side = i % 2 ? 1 : -1; b.mound(-330 - Math.floor(i / 2) * 38, side * 32, 12, [150, 168, 120], false); }
    },
    helmsDeep(s, b, R) {
      b.disk(0, 0, 160, [126, 122, 110], 0.8);
      b.wall([-20, -150, -40, -40, -30, 60, -20, 150], 12, 20, [168, 162, 150], false); // the Deeping Wall
      b.wall(circlePts(60, 24, 0, R, 40, -110), 8, 26, [176, 170, 160], true);         // the Hornburg
      b.bldg(40, -110, 30, 30, 0, 40, 'flat', [150, 146, 140], [176, 170, 160]);
      b.bldg(70, -120, 14, 14, 0, 60, 'cone', [140, 136, 130], [176, 170, 160]);
      b.wall(circlePts(1600, 40, 0.02, R, 900, 0, Math.PI * 0.65, Math.PI * 1.35), 8, 6, [110, 120, 80], false); // Helm's Dike
    },
    carasGaladhon(s, b, R) {
      b.stamps.push({ type: 'hill', x: s.x, y: s.y, r: 420, height: 25 });
      b.wall(circlePts(430, 60, 0.02, R), 10, 8, [86, 120, 70], true); // green wall and fosse
      for (let i = 0; i < 120; i++) {
        const a = R() * Math.PI * 2, r = 400 * Math.sqrt(R());
        b.tree(Math.cos(a) * r, Math.sin(a) * r, R.range(14, 24), [196, 182, 92], R.range(60, 90));
      }
      b.tree(0, 0, 32, [214, 200, 110], 110);
      b.street([0, 430, 0, 900], 3, [170, 160, 120]);
    },
    laketown(s, b, R) {
      // town on piles in the Long Lake, joined to the western shore by a bridge
      const st = STY.dale;
      b.poly([-140, -110, 140, -110, 150, 110, -130, 120], [104, 84, 64], 1);
      for (let i = 0; i < 160; i++) house(b, st, R, R.range(-125, 135), R.range(-100, 110), R() < 0.5 ? 0 : Math.PI / 2, 0.9);
      b.walls.push({ p: b.wp([-140, 0, -600, 0]), w: 8, h: 3, col: [110, 90, 70] });
      b.bldg(0, 0, 30, 40, 0, 14, 'hip', [130, 100, 72], [150, 130, 100]); // the Master's house
    },
    weathertop(s, b, R) {
      b.disk(0, 0, 45, [140, 136, 120], 0.8);
      b.wall(circlePts(38, 36, 0.12, R), 5, 3, [160, 156, 146], true);
      for (let i = 0; i < 12; i++) { const a = R() * Math.PI * 2, r = R.range(5, 30); b.bldg(Math.cos(a) * r, Math.sin(a) * r, 4, 6, a, 1.5, 'ruin', [160, 156, 146], STONE); }
    },
    hobbiton(s, b, R) {
      const st = STY.hobbit;
      // The Hill with Bag End at the top of Bagshot Row, the Party Field, the Water and the Mill
      b.stamps.push({ type: 'hill', x: b.w(0, -180)[0], y: b.w(0, -180)[1], r: 220, height: 30 });
      b.mound(0, -230, 10, [90, 126, 56]);                                    // Bag End
      b.poly([-14, -238, 14, -238, 16, -210, -16, -210], [104, 132, 62], 1);  // its garden
      for (let i = 0; i < 10; i++) b.mound(-90 + i * 18, -150 + Math.sin(i) * 6, 6, [92, 124, 58]); // Bagshot Row
      b.street([-260, -60, -120, -120, 0, -200], 3, st.street);
      b.disk(140, -60, 70, [104, 134, 62], 1);                                // Party Field
      b.tree(140, -60, 16, [70, 104, 46], 30);                                // Party Tree
      b.poly([180, 90, 300, 80, 320, 150, 210, 170], [42, 74, 82], 1);        // Bywater pool (part)
      b.bldg(40, 40, 12, 18, 0.1, 9, 'gable', [140, 120, 90], [180, 166, 140]); // the Mill
      const roads = [[-700, 40, -300, 30, 0, 40, 400, 60, 800, 80], [0, 40, 20, -100], [-400, 30, -380, 300]];
      for (const p of roads) { b.street(p, 3.5, st.street); b.markLine(b.wp(p), 3.5); }
      for (const p of roads) lineStreetHouses(b, st, R, p, 0.55, 1, 900);
      for (let i = 0; i < 40; i++) { const a = R() * Math.PI * 2, r = R.range(60, 600); if (R() < 0.5) b.mound(Math.cos(a) * r, Math.sin(a) * r, R.range(4, 7), [92, 124, 58]); }
    },
    bree(s, b, R) {
      const gen = genGeneric(Object.assign({}, s, { kind: 'town', style: 'bree', R: 260, walls: false }));
      const hedge = circlePts(330, 60, 0.04, R, 0, 0, -Math.PI * 0.9, Math.PI * 0.9);
      gen.wall(hedge, 5, 3, [58, 82, 42], false);
      gen.bldg(20, 10, 18, 30, 0.2, 10, 'gable', [118, 108, 104], [200, 186, 160]); // the Prancing Pony
      return gen;
    },
    rivendell(s, b, R) {
      const st = STY.elven;
      for (let i = 0; i < 40; i++) { const a = R.range(-0.6, 3.6), r = R.range(30, 200); house(b, st, R, Math.cos(a) * r, Math.sin(a) * r * 0.6, a + Math.PI / 2, 1.2); }
      for (let i = 0; i < 160; i++) { const a = R() * Math.PI * 2, r = R.range(40, 420); b.tree(Math.cos(a) * r, Math.sin(a) * r, R.range(4, 8), [60, 96, 52]); }
      b.bldg(0, 0, 26, 40, 0.4, 16, 'hip', [104, 140, 126], WHITE); // the Last Homely House
    },
    cirithUngol(s, b, R) {
      b.bldg(0, 0, 40, 26, 0.6, 30, 'flat', [44, 42, 42], DARK);
      b.bldg(-14, -6, 22, 18, 0.6, 60, 'flat', [40, 38, 38], DARK);
      b.bldg(-24, -12, 12, 12, 0.6, 90, 'cone', [36, 34, 34], DARK);
      b.wall(circlePts(46, 24, 0.1, R), 4, 10, [48, 46, 46], true);
    },
    harbour(s, b, R) {
      const gen = genGeneric(Object.assign({}, s, { special: null, kind: 'city' }));
      // quays and ships on the nearest water
      let best = null;
      for (let k = 0; k < 24; k++) {
        const a = k / 24 * Math.PI * 2;
        for (let r = s.R * 0.5; r < s.R * 2.5; r += s.R * 0.15) {
          const [x, y] = gen.w(Math.cos(a) * r, Math.sin(a) * r);
          const t = terrainAt(x, y);
          if (t && t.water) { if (!best || r < best.r) best = { a, r }; break; }
        }
      }
      if (best) {
        const ca = Math.cos(best.a), sa = Math.sin(best.a);
        const qx = ca * best.r, qy = sa * best.r;
        gen.street([qx - sa * 200, qy + ca * 200, qx + sa * 200, qy - ca * 200], 10, [168, 160, 146]);
        for (let i = 0; i < 14; i++) {
          const t = R.range(-180, 180), d = R.range(40, 160);
          const sx = qx + ca * d - sa * t, sy = qy + sa * d + ca * t;
          const [wx, wy] = gen.w(sx, sy); const tt = terrainAt(wx, wy);
          if (tt && !tt.water) continue;
          gen.ship(sx, sy, R.range(18, 34), best.a + Math.PI / 2 + R.range(-0.3, 0.3), s.style === 'elven' ? [226, 228, 226] : s.style === 'harad' ? [90, 50, 40] : [120, 96, 70], s.style === 'elven' ? [244, 244, 240] : [220, 214, 200]);
        }
      }
      return gen;
    },
  };

  // ---------------------------------------------------------------- registry
  let LIST = [];
  const IDX = new Map(); const G = 8000;
  const cache = new Map();
  function init(defs, sites) {
    LIST = [];
    const used = new Set();
    const byName = new Map(); sites.forEach((s, i) => { if (s.n && !byName.has(s.n)) byName.set(s.n, i); });
    const radius = { city: 420, haven: 420, fortress: 360, town: 200, village: 110, fort: 140, citadel: 140, tower: 25, ruin: 140, hamlet: 55, beacon: 10 };
    for (const d of defs) {
      let x = d.x, y = d.y, base = null;
      if (d.site) { const i = byName.get(d.site); if (i === undefined) continue; base = sites[i]; used.add(i); x = base.x; y = base.y; }
      if (d.hide) continue;
      x += d.dx || 0; y += d.dy || 0;
      const kind = d.kind || (base && base.k) || 'town';
      LIST.push({ name: d.name || d.site, x, y, kind, special: d.special, walls: d.walls, rot: (d.rot || 0) * Math.PI / 180,
        style: d.style || styleAt(x, y), R: d.size || radius[kind] || 150, seed: strSeed(d.name || d.site) });
    }
    sites.forEach((s, i) => {
      if (used.has(i)) return;
      const kind = s.k === 'town' && s.o === 'MERP' ? 'town' : s.k;
      LIST.push({ name: s.n || `${s.k}-${i}`, x: s.x, y: s.y, kind, style: styleAt(s.x, s.y), R: radius[kind] || 120, seed: strSeed((s.n || '') + i) });
    });
    LIST.forEach((s, i) => {
      const ext = s.special === 'minasTirith' ? 8000 : s.special === 'mountDoom' ? 4500 : s.R * 2.5 + 200;
      s.ext = ext;
      for (let gy = Math.floor((s.y - ext) / G); gy <= Math.floor((s.y + ext) / G); gy++)
        for (let gx = Math.floor((s.x - ext) / G); gx <= Math.floor((s.x + ext) / G); gx++) {
          const k = gy * 100000 + gx; let a = IDX.get(k); if (!a) IDX.set(k, a = []); a.push(i);
        }
    });
  }
  function near(x0, y0, x1, y1) {
    const out = new Set();
    for (let gy = Math.floor(y0 / G); gy <= Math.floor(y1 / G); gy++)
      for (let gx = Math.floor(x0 / G); gx <= Math.floor(x1 / G); gx++) { const a = IDX.get(gy * 100000 + gx); if (a) a.forEach(i => out.add(i)); }
    return [...out].map(i => LIST[i]).filter(s => s.x + s.ext > x0 && s.x - s.ext < x1 && s.y + s.ext > y0 && s.y - s.ext < y1);
  }
  function gen(s) {
    let g = cache.get(s);
    if (g) return g;
    const R = rng(s.seed);
    if (s.special && SPECIALS[s.special]) {
      const b = new B(s.x, s.y, s.rot);
      g = SPECIALS[s.special](s, b, R) || b;
    } else g = genGeneric(s);
    g.occ = null;
    cache.set(s, g);
    if (cache.size > 160) cache.delete(cache.keys().next().value);
    return g;
  }
  // analytic terrain stamps don't need generation, so they also work at low zoom
  function stampsFor(s) {
    if (s._stamps) return s._stamps;
    const b = new B(s.x, s.y, s.rot);
    const R = rng(s.seed);
    if (s.special && SPECIALS[s.special] && ['minasTirith', 'helmsDeep', 'isengard', 'mountDoom', 'edoras', 'carasGaladhon', 'hobbiton'].includes(s.special)) {
      // run the special into a throwaway builder just to collect its stamps
      SPECIALS[s.special](s, b, R);
    }
    s._stamps = b.stamps;
    return s._stamps;
  }

  function refH(st, key, x, y) {
    if (st[key] === undefined) { const t = terrainAt(x, y); if (t) st[key] = t.h; }
    return st[key];
  }
  function applyStamps(Hh, W2, x0, y0, px) {
    const x1 = x0 + W2 * px, y1 = y0 + W2 * px;
    for (const s of near(x0, y0, x1, y1)) {
      if (!s.special) continue;
      for (const st of stampsFor(s)) {
        const reach = st.R || st.r;
        const i0 = clamp(Math.floor((st.x - reach - x0) / px), 0, W2), i1 = clamp(Math.ceil((st.x + reach - x0) / px), 0, W2);
        const j0 = clamp(Math.floor((st.y - reach - y0) / px), 0, W2), j1 = clamp(Math.ceil((st.y + reach - y0) / px), 0, W2);
        if (i0 >= i1 || j0 >= j1) continue;
        let base;
        if (st.type === 'volcano') base = refH(st, 'h0', st.x + st.r, st.y);
        else if (st.type === 'flatten') base = refH(st, 'h0', st.x, st.y);
        else if (st.type === 'terraces') base = refH(st, 'h0', st.x + st.r0 + 60, st.y);
        for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
          const k = j * W2 + i;
          const dx = x0 + (i + 0.5) * px - st.x, dy = y0 + (j + 0.5) * px - st.y, r = Math.hypot(dx, dy);
          if (r > reach) continue;
          const h = Hh[k];
          if (st.type === 'volcano') {
            const b0 = base === undefined ? 420 : base;
            const t = r / st.r;
            let cone = st.height * Math.pow(1 - t, 1.6);
            if (r < st.crater) cone = st.height * Math.pow(1 - st.crater / st.r, 1.6) - 90 * (1 - (r / st.crater) ** 2);
            Hh[k] = Math.max(h, b0 + cone + (h - b0) * 0.3 * (1 - t));
          } else if (st.type === 'massif') {
            // a rugged mountain (soft-ridged fBm), plus a spur ridge running to (sx, sy)
            let add = 0;
            if (r < st.r) {
              const t = 1 - r / st.r;
              let n = 0, amp = 1, lam = 2600;
              for (let o = 0; o < 5; o++) { const g = gnoise(dx / lam, dy / lam, 501 + o); n += amp * (0.6 - Math.sqrt(g * g + 0.02)); amp *= 0.5; lam *= 0.47; }
              add = st.height * Math.pow(t, 1.3) * clamp(0.75 + 0.55 * n, 0.2, 1.4);
            }
            const ex = st.sx - st.x, ey = st.sy - st.y, el = ex * ex + ey * ey;
            const tt = clamp((dx * ex + dy * ey) / el, 0, 1);
            const dd = Math.hypot(dx - ex * tt, dy - ey * tt);
            if (dd < st.spurW) add = Math.max(add, mix(st.height * 0.55, st.spurH, tt) * Math.pow(1 - dd / st.spurW, 1.5) * (0.92 + 0.08 * gnoise(dx / 300, dy / 300, 503)));
            Hh[k] = h + add;
          } else if (st.type === 'crater') {
            if (r < st.r * 1.4) Hh[k] = h + st.depth * 0.25 * smooth(st.r * 1.4, st.r, r) - st.depth * (r < st.r ? 1 - (r / st.r) ** 2 : 0);
          } else if (st.type === 'hill') {
            Hh[k] = h + st.height * 0.5 * (1 + Math.cos(Math.PI * r / st.r));
          } else if (st.type === 'flatten') {
            if (base === undefined) continue;
            Hh[k] = mix(h, base + (h - base) * 0.08, smooth(st.R, st.r, r));
          } else if (st.type === 'terraces') {
            if (base === undefined || r > st.r0 + 40) continue;
            const level = clamp(Math.floor((1 - r / st.r0) / st.step) + 1, 1, st.n);
            let ang = Math.atan2(dy, dx) - (st.rot || 0);
            ang = Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang)));
            const wA = level >= st.n ? 1 : smooth(Math.PI * 0.72, Math.PI * 0.62, ang); // only the east-facing tiers are built up
            Hh[k] = Math.max(h, mix(h, base + level * st.rise, smooth(st.r0 + 40, st.r0 - 5, r) * wA));
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- drawing
  const SUN = [-0.7071, -0.7071]; // towards the sun (north-west), screen coords
  function rgb(c, f = 1, a = 1) { return `rgba(${clamp(c[0] * f, 0, 255) | 0},${clamp(c[1] * f, 0, 255) | 0},${clamp(c[2] * f, 0, 255) | 0},${a})`; }
  function hull(pts) {
    const p = []; for (let i = 0; i < pts.length; i += 2) p.push([pts[i], pts[i + 1]]);
    p.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function rectPts(b) {
    const c = Math.cos(b.a), s = Math.sin(b.a), hl = b.l / 2, hw = b.w / 2;
    return [b.x - c * hl + s * hw, b.y - s * hl - c * hw, b.x + c * hl + s * hw, b.y + s * hl - c * hw,
      b.x + c * hl - s * hw, b.y + s * hl + c * hw, b.x - c * hl - s * hw, b.y - s * hl + c * hw];
  }

  function draw(view) {
    const { ctx, ox, oy, px, R, z, mode } = view;
    const x1 = ox + R * px, y1 = oy + R * px;
    const list = near(ox, oy, x1, y1);
    if (!list.length) return;
    const T = (x, y) => [(x - ox) / px, (y - oy) / px];
    const sat = mode !== 'map';
    for (const s of list) {
      // glows & lava are visible from far away (Mount Doom, the Eye)
      if (z < 9) {
        if (s.special === 'mountDoom' || s.special === 'baradDur') {
          const [x, y] = T(s.x, s.y);
          if (sat) { const r = Math.max(2, (s.special === 'mountDoom' ? 250 : 60) / px); const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2); g.addColorStop(0, 'rgba(255,170,60,0.9)'); g.addColorStop(1, 'rgba(255,60,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2, 0, 7); ctx.fill(); }
        }
        if (z >= 7 && sat) {
          // a faint built-up smudge for towns and cities
          const [x, y] = T(s.x, s.y); const r = s.R / px;
          if (r > 0.6 && s.kind !== 'tower' && s.kind !== 'beacon') { ctx.fillStyle = rgb((STY[s.style] || STY.mannish).ground, 1, 0.45); ctx.beginPath(); ctx.arc(x, y, Math.max(r, 0.8), 0, 7); ctx.fill(); }
        }
        if (mode === 'map' && z >= 6 && s.R > 150 && s.kind !== 'ruin') {
          const [x, y] = T(s.x, s.y); const r = Math.max(1.5, s.R / px);
          ctx.fillStyle = 'rgba(232,226,216,0.9)'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
        }
        continue;
      }
      const g = gen(s);
      const detail = px < 6; // individual buildings
      // ground
      for (const p of g.ground) {
        ctx.fillStyle = sat ? rgb(p.col, 1, p.a * (detail ? 0.6 : 0.45)) : `rgba(236,231,223,${Math.min(1, p.a + 0.3)})`;
        ctx.beginPath();
        if (p.t === 'c') { const [x, y] = T(p.x, p.y); ctx.arc(x, y, p.r / px, 0, 7); }
        else if (p.t === 'ring') { const [x, y] = T(p.x, p.y); ctx.arc(x, y, p.r / px, p.a0, p.a1); ctx.arc(x, y, p.r * 0.878 / px, p.a1, p.a0, true); ctx.closePath(); }
        else { for (let i = 0; i < p.p.length; i += 2) { const [x, y] = T(p.p[i], p.p[i + 1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); }
        ctx.fill();
      }
      // glowing lines (lava)
      for (const l of g.lines) {
        ctx.beginPath(); for (let i = 0; i < l.p.length; i += 2) { const [x, y] = T(l.p[i], l.p[i + 1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = sat ? l.col : 'rgba(240,150,110,0.7)'; ctx.lineWidth = Math.max(1, l.w / px); ctx.stroke();
        if (sat) { ctx.strokeStyle = 'rgba(255,170,70,0.45)'; ctx.lineWidth = Math.max(0.4, l.w / px * 0.25); ctx.stroke(); }
      }
      // streets
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const st of g.streets) {
        const w = st.w / px; if (w < 0.25) continue;
        ctx.beginPath(); for (let i = 0; i < st.p.length; i += 2) { const [x, y] = T(st.p[i], st.p[i + 1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.strokeStyle = sat ? rgb(st.col, 1, Math.min(1, st.a * w * 1.5)) : (st.col[1] > st.col[0] ? 'rgba(200,225,190,0.9)' : '#ffffff');
        ctx.lineWidth = Math.max(w, sat ? 0.5 : 1); ctx.stroke();
      }
      if (!detail && sat) {
        // roofs as a speckle texture at mid zoom
        for (const bd of g.bldgs) { const [x, y] = T(bd.x, bd.y); ctx.fillStyle = rgb(bd.rc, 0.95); const r = Math.max(0.5, Math.max(bd.w, bd.l) / px * 0.55); ctx.fillRect(x - r, y - r, 2 * r, 2 * r); }
        for (const m of g.mounds) { const [x, y] = T(m.x, m.y); ctx.fillStyle = rgb(m.col, 1.05); ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2); }
        for (const w of g.walls) { strokeWall(ctx, T, w, px, sat, true); }
        drawGlows(ctx, T, g.glows, px, sat);
        continue;
      }
      // shadows (one union path so overlaps don't double-darken)
      if (sat) {
        ctx.beginPath();
        const k = 0.6;
        for (const bd of g.bldgs) {
          const h = bd.roof === 'ruin' ? bd.h : bd.h;
          let pts = bd.roof === 'cone' || bd.roof === 'orthanc' || bd.roof === 'baradDur' ? circ(bd.x, bd.y, bd.w / 2, 10) : rectPts(bd);
          const sh = pts.slice(); for (let i = 0; i < pts.length; i += 2) sh.push(pts[i] + h * k, pts[i + 1] + h * k);
          const hp = hull(sh);
          hp.forEach((p, i) => { const [x, y] = T(p[0], p[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
          ctx.closePath();
        }
        for (const t of g.trees) { const [x, y] = T(t.x + t.h * 0.35, t.y + t.h * 0.35); ctx.moveTo(x + t.r / px, y); ctx.arc(x, y, t.r / px, 0, 7); }
        for (const w of g.walls) {
          for (let i = 2; i < w.p.length; i += 2) {
            const a = [w.p[i - 2], w.p[i - 1]], c = [w.p[i], w.p[i + 1]];
            const quad = [a[0], a[1], c[0], c[1], c[0] + w.h * k, c[1] + w.h * k, a[0] + w.h * k, a[1] + w.h * k];
            for (let q = 0; q < 8; q += 2) { const [x, y] = T(quad[q], quad[q + 1]); q ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
            ctx.closePath();
          }
        }
        ctx.fillStyle = 'rgba(10,12,20,0.38)';
        ctx.fill('nonzero');
      }
      for (const m of g.mounds) drawMound(ctx, T, m, px, sat);
      for (const w of g.walls) strokeWall(ctx, T, w, px, sat, false);
      for (const bd of g.bldgs) drawBldg(ctx, T, bd, px, sat);
      for (const sh of g.ships) drawShip(ctx, T, sh, px, sat);
      for (const t of g.trees) drawTree(ctx, T, t, px, sat);
      drawGlows(ctx, T, g.glows, px, sat);
    }
  }
  function circ(x, y, r, n) { const o = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; o.push(x + Math.cos(a) * r, y + Math.sin(a) * r); } return o; }
  function drawGlows(ctx, T, glows, px, sat) {
    if (!sat) return;
    for (const gl of glows) {
      const [x, y] = T(gl.x, gl.y); const r = Math.max(1.5, gl.r / px);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, gl.col); g.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
  }
  function strokeWall(ctx, T, w, px, sat, thin) {
    ctx.beginPath(); for (let i = 0; i < w.p.length; i += 2) { const [x, y] = T(w.p[i], w.p[i + 1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    if (w.closed) ctx.closePath();
    const lw = Math.max(thin ? 0.7 : 1, w.w / px);
    if (!sat) { ctx.strokeStyle = '#c9c3ba'; ctx.lineWidth = Math.max(1, lw); ctx.stroke(); return; }
    ctx.strokeStyle = rgb(w.col, 0.7); ctx.lineWidth = lw + (lw > 3 ? 1.5 : 0.5); ctx.stroke();
    ctx.strokeStyle = rgb(w.col, 1.05); ctx.lineWidth = lw * 0.7; ctx.stroke();
  }
  function poly(ctx, T, pts) { ctx.beginPath(); for (let i = 0; i < pts.length; i += 2) { const [x, y] = T(pts[i], pts[i + 1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); }
  function faceShade(nx, ny) { return 0.86 + 0.28 * (nx * SUN[0] + ny * SUN[1]); }
  function drawBldg(ctx, T, b, px, sat) {
    const c = Math.cos(b.a), s = Math.sin(b.a), hl = b.l / 2, hw = b.w / 2;
    const P = (u, v) => [b.x + c * u - s * v, b.y + s * u + c * v];
    if (!sat) {
      if (b.roof === 'pyre') return;
      const pts = b.roof === 'cone' || b.roof === 'orthanc' || b.roof === 'baradDur' ? circ(b.x, b.y, b.w / 2, 16) : rectPts(b);
      poly(ctx, T, pts);
      ctx.fillStyle = b.roof === 'ruin' ? 'rgba(220,214,206,0.8)' : '#e2ded8'; ctx.fill();
      ctx.strokeStyle = '#d1ccc4'; ctx.lineWidth = 1; ctx.stroke();
      return;
    }
    if (b.roof === 'gable' || b.roof === 'pyre') {
      const half1 = [...P(-hl, -hw), ...P(hl, -hw), ...P(hl, 0), ...P(-hl, 0)];
      const half2 = [...P(-hl, 0), ...P(hl, 0), ...P(hl, hw), ...P(-hl, hw)];
      poly(ctx, T, half1); ctx.fillStyle = rgb(b.rc, faceShade(s, -c)); ctx.fill();
      poly(ctx, T, half2); ctx.fillStyle = rgb(b.rc, faceShade(-s, c)); ctx.fill();
      if (px < 1.2) { poly(ctx, T, rectPts(b)); ctx.strokeStyle = rgb(b.rc, 0.6, 0.7); ctx.lineWidth = 0.7; ctx.stroke(); }
      return;
    }
    if (b.roof === 'hip') {
      const r = Math.min(hw, hl * 0.9);
      const faces = [
        [[...P(-hl, -hw), ...P(hl, -hw), ...P(hl - r, 0), ...P(-hl + r, 0)], s, -c],
        [[...P(-hl, hw), ...P(hl, hw), ...P(hl - r, 0), ...P(-hl + r, 0)], -s, c],
        [[...P(hl, -hw), ...P(hl, hw), ...P(hl - r, 0)], c, s],
        [[...P(-hl, -hw), ...P(-hl, hw), ...P(-hl + r, 0)], -c, -s],
      ];
      for (const [pts, nx, ny] of faces) { poly(ctx, T, pts); ctx.fillStyle = rgb(b.rc, faceShade(nx, ny)); ctx.fill(); }
      if (px < 1.2) { poly(ctx, T, rectPts(b)); ctx.strokeStyle = rgb(b.rc, 0.6, 0.6); ctx.lineWidth = 0.7; ctx.stroke(); }
      return;
    }
    if (b.roof === 'flat' || b.roof === 'ruin' || b.roof === 'statue') {
      if (b.roof === 'statue') {
        // a crowned standing figure seen from above: head, shoulders, raised arm
        const [x, y] = T(b.x, b.y), r = b.w / 2 / px;
        ctx.fillStyle = rgb(b.rc, 0.95); ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.55, b.a, 0, 7); ctx.fill();
        ctx.fillStyle = rgb(b.rc, 1.15); ctx.beginPath(); ctx.arc(x - r * 0.2, y - r * 0.2, r * 0.35, 0, 7); ctx.fill();
        const [ax, ay] = T(b.x - Math.cos(b.a) * b.w * 0.9, b.y - Math.sin(b.a) * b.w * 0.9);
        ctx.strokeStyle = rgb(b.rc, 1.05); ctx.lineWidth = r * 0.3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ax, ay); ctx.stroke();
        return;
      }
      const pts = rectPts(b);
      if (b.roof === 'ruin') {
        poly(ctx, T, pts); ctx.strokeStyle = rgb(b.rc, 1, 0.95); ctx.lineWidth = Math.max(0.6, 1.4 / px); ctx.stroke();
        ctx.fillStyle = rgb([120, 120, 96], 1, 0.35); ctx.fill();
        return;
      }
      poly(ctx, T, pts); ctx.fillStyle = rgb(b.rc, 1); ctx.fill();
      if (px < 2) { ctx.strokeStyle = rgb(b.rc, 0.75); ctx.lineWidth = Math.max(0.6, 1 / px); ctx.stroke(); }
      return;
    }
    if (b.roof === 'ruinDome') {
      const [x, y] = T(b.x, b.y); ctx.strokeStyle = rgb(b.rc, 1); ctx.lineWidth = Math.max(1, 4 / px);
      ctx.beginPath(); ctx.arc(x, y, b.w / 2 / px, 0.3, 5.2); ctx.stroke(); return;
    }
    // round towers: cone roofs shaded by sector; Orthanc's four horns; Barad-dûr's crown of spikes
    const [x, y] = T(b.x, b.y), r = b.w / 2 / px;
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, am = (a0 + a1) / 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, a0, a1 + 0.02); ctx.closePath();
      ctx.fillStyle = rgb(b.rc, faceShade(Math.cos(am), Math.sin(am)) * (b.roof === 'cone' ? 1 : 0.9)); ctx.fill();
    }
    if (b.roof === 'orthanc' || b.roof === 'baradDur') {
      const k = b.roof === 'orthanc' ? 4 : 9;
      for (let i = 0; i < k; i++) {
        const a = b.a + i / k * Math.PI * 2;
        ctx.fillStyle = rgb(b.rc, 1.5); ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, Math.max(0.6, r * 0.16), 0, 7); ctx.fill();
      }
    }
  }
  function drawMound(ctx, T, m, px, sat) {
    const [x, y] = T(m.x, m.y), r = Math.max(0.6, m.r / px);
    if (!sat) { ctx.fillStyle = '#dfe9d6'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); return; }
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, rgb(m.col, 1.25)); g.addColorStop(0.7, rgb(m.col, 1)); g.addColorStop(1, rgb(m.col, 0.7));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    if (r > 4 && m.door) { ctx.fillStyle = 'rgba(70,50,30,0.8)'; ctx.beginPath(); ctx.arc(x + r * 0.55, y + r * 0.55, r * 0.12, 0, 7); ctx.fill(); } // round door
  }
  function drawTree(ctx, T, t, px, sat) {
    const [x, y] = T(t.x, t.y), r = Math.max(0.6, t.r / px);
    if (!sat) { ctx.fillStyle = 'rgba(190,222,180,0.9)'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); return; }
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, rgb(t.col, 1.35)); g.addColorStop(0.75, rgb(t.col, 0.95)); g.addColorStop(1, rgb(t.col, 0.6));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  function drawShip(ctx, T, sh, px, sat) {
    const c = Math.cos(sh.a), s = Math.sin(sh.a), l = sh.l / 2, w = sh.l * 0.14;
    const P = (u, v) => T(sh.x + c * u - s * v, sh.y + s * u + c * v);
    ctx.beginPath();
    const pts = [P(-l, 0), P(-l * 0.7, -w), P(l * 0.6, -w), P(l, 0), P(l * 0.6, w), P(-l * 0.7, w)];
    pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
    ctx.fillStyle = sat ? rgb(sh.col) : '#d6d2cc'; ctx.fill();
    if (sat && sh.l / px > 6) { const [a, b] = P(0, 0); ctx.fillStyle = rgb(sh.sail, 1, 0.95); ctx.fillRect(a - w / px, b - w * 1.8 / px, 2 * w / px, 3.6 * w / px); }
    if (sat) { const [a, b] = P(-l * 1.6, 0); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = Math.max(0.5, w / px); ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(a, b); ctx.stroke(); }
  }

  return { init, applyStamps, draw, list: () => LIST };
}
