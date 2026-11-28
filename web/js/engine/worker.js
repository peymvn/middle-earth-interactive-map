// Tile renderer. Everything inside MEWorker() runs in a Web Worker: the main thread turns the
// function source into a Blob URL (so the map works from file:// too). Do not reference globals
// from outside this function.
//
// Pipeline per 256px tile (see README, "Rendering"):
//   1. elevation: bicubic sample of the terrain data tile + band-limited procedural detail
//   2. per-pixel colour: climate -> ground colour, landcover, rock/snow, forests with tree crowns,
//      farmland parcels, water depth colours, hill shading
//   3. vector overlay on a 2D canvas: rivers, roads, settlements (streets, walls, buildings + shadows)
function MEWorker() {
  'use strict';
  const TILE = 256, PAD = 2, S = TILE + 2 * PAD, MAXZ = 6;
  let WORLD = 2001000;
  const C_OPEN = 0, C_FOREST = 1, C_FOREST_DARK = 2, C_FOREST_GOLD = 3, C_WETLAND = 4, C_LAKE = 5, C_SEA = 6, C_VOLCANIC = 7, C_STONE = 8;

  // ------------------------------------------------------------------ hashing & noise
  function hash2(x, y, s) {
    let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
  }
  const rnd = (x, y, s) => hash2(x, y, s) / 4294967296;
  const GX = new Float32Array(16), GY = new Float32Array(16);
  for (let i = 0; i < 16; i++) { GX[i] = Math.cos(i * Math.PI / 8); GY[i] = Math.sin(i * Math.PI / 8); }
  // gradient noise, roughly [-1, 1]
  function gnoise(x, y, s) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    let h = hash2(ix, iy, s) & 15; const a = GX[h] * fx + GY[h] * fy;
    h = hash2(ix + 1, iy, s) & 15; const b = GX[h] * (fx - 1) + GY[h] * fy;
    h = hash2(ix, iy + 1, s) & 15; const c = GX[h] * fx + GY[h] * (fy - 1);
    h = hash2(ix + 1, iy + 1, s) & 15; const d = GX[h] * (fx - 1) + GY[h] * (fy - 1);
    return 1.42 * (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v);
  }
  // value noise in [-1, 1] (cheaper; used for colour mottling)
  function vnoise(x, y, s) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = rnd(ix, iy, s), b = rnd(ix + 1, iy, s), c = rnd(ix, iy + 1, s), d = rnd(ix + 1, iy + 1, s);
    return 2 * (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) - 1;
  }
  // band-limited fBm: octaves whose wavelength is under ~2 px fade out, so every zoom level is a
  // consistent, alias-free view of the same infinite-detail world.
  function fbm(x, y, lam, oct, gain, px, seed) {
    let sum = 0, amp = 1, norm = 0;
    for (let k = 0; k < oct; k++) {
      const w = Math.min(1, Math.max(0, lam / px - 3) * 0.34);
      if (w <= 0) break;
      sum += amp * w * gnoise(x / lam, y / lam, seed + k * 31);
      norm += amp;
      amp *= gain; lam *= 0.5;
    }
    return norm ? sum / norm : 0;
  }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;

  // ------------------------------------------------------------------ terrain data tiles
  const dataCache = new Map(); // key -> {E: Int16Array, C: Uint8Array, D: Uint8Array}
  async function decodeTile(b64) {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const ds = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate'));
    const raw = new Uint8Array(await new Response(ds).arrayBuffer());
    const n = S * S, E = new Int16Array(n);
    for (let r = 0, i = 0; r < S; r++) {
      for (let c = 0; c < S; c++, i++) {
        const a = c > 0 ? E[i - 1] : 0, b = r > 0 ? E[i - S] : 0, cc = r > 0 && c > 0 ? E[i - S - 1] : 0;
        const mx = a > b ? a : b, mn = a > b ? b : a;
        const p = cc >= mx ? mn : cc <= mn ? mx : a + b - cc;
        const res = (raw[i] | (raw[n + i] << 8)) << 16 >> 16;
        E[i] = res + p;
      }
    }
    return { E, C: raw.subarray(2 * n, 3 * n), D: raw.subarray(3 * n, 4 * n) };
  }
  async function getData(key, b64) {
    let d = dataCache.get(key);
    if (d) { dataCache.delete(key); dataCache.set(key, d); return d; }
    d = await decodeTile(b64);
    dataCache.set(key, d);
    if (dataCache.size > 48) dataCache.delete(dataCache.keys().next().value);
    return d;
  }

  // Catmull-Rom bicubic of E (half metres) at fractional data-pixel coords
  function cubicE(E, u, v) {
    const iu = Math.floor(u), iv = Math.floor(v), fu = u - iu, fv = v - iv;
    const wu0 = ((-0.5 * fu + 1) * fu - 0.5) * fu, wu1 = (1.5 * fu - 2.5) * fu * fu + 1,
      wu2 = ((-1.5 * fu + 2) * fu + 0.5) * fu, wu3 = (0.5 * fu - 0.5) * fu * fu;
    let sum = 0;
    for (let k = -1; k <= 2; k++) {
      const row = clamp(iv + k, 0, S - 1) * S;
      const c0 = clamp(iu - 1, 0, S - 1), c1 = clamp(iu, 0, S - 1), c2 = clamp(iu + 1, 0, S - 1), c3 = clamp(iu + 2, 0, S - 1);
      const r = wu0 * E[row + c0] + wu1 * E[row + c1] + wu2 * E[row + c2] + wu3 * E[row + c3];
      const wv = k === -1 ? ((-0.5 * fv + 1) * fv - 0.5) * fv : k === 0 ? (1.5 * fv - 2.5) * fv * fv + 1 : k === 1 ? ((-1.5 * fv + 2) * fv + 0.5) * fv : (0.5 * fv - 0.5) * fv * fv;
      sum += wv * r;
    }
    return sum * 0.5;
  }
  function bilinear8(A, u, v) {
    const iu = clamp(Math.floor(u), 0, S - 2), iv = clamp(Math.floor(v), 0, S - 2), fu = clamp(u - iu, 0, 1), fv = clamp(v - iv, 0, 1);
    const i = iv * S + iu;
    return (A[i] * (1 - fu) + A[i + 1] * fu) * (1 - fv) + (A[i + S] * (1 - fu) + A[i + S + 1] * fu) * fv;
  }

  // ------------------------------------------------------------------ climate grid
  const CN = 512;
  let CLIM = null; // {moist, heat, blight, cult, grass: Float32Array(CN*CN), culture: Uint8Array, styles: []}
  function rasterPoly(grid, poly, value, mode) {
    // poly in km; grid cell = WORLD/CN mu
    const k = 1000 * CN / WORLD;
    const pts = poly.map(p => [p[0] * k, p[1] * k]);
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(CN - 1, Math.ceil(y1)); y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > yc) !== (yj > yc)) xs.push(xi + (yc - yi) / (yj - yi) * (xj - xi));
      }
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) {
        for (let x = Math.max(0, Math.ceil(xs[q] - 0.5)); x <= Math.min(CN - 1, Math.floor(xs[q + 1] - 0.5)); x++) {
          const i = y * CN + x;
          if (mode === 'set') grid[i] = value; else grid[i] += value;
        }
      }
    }
  }
  function blur(grid, r) {
    if (r < 1) return grid;
    const tmp = new Float32Array(grid.length);
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < CN; y++) { // horizontal
        let acc = 0; const row = y * CN;
        for (let x = -r; x <= r; x++) acc += grid[row + clamp(x, 0, CN - 1)];
        for (let x = 0; x < CN; x++) {
          tmp[row + x] = acc / (2 * r + 1);
          acc += grid[row + clamp(x + r + 1, 0, CN - 1)] - grid[row + clamp(x - r, 0, CN - 1)];
        }
      }
      for (let x = 0; x < CN; x++) { // vertical
        let acc = 0;
        for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, CN - 1) * CN + x];
        for (let y = 0; y < CN; y++) {
          grid[y * CN + x] = acc / (2 * r + 1);
          acc += tmp[clamp(y + r + 1, 0, CN - 1) * CN + x] - tmp[clamp(y - r, 0, CN - 1) * CN + x];
        }
      }
    }
    return grid;
  }
  function buildClimate(def) {
    const F = ['moist', 'heat', 'blight', 'cult', 'grass'];
    const out = {};
    for (const f of F) out[f] = new Float32Array(CN * CN);
    const cellKm = WORLD / CN / 1000;
    for (const f of F) {
      for (const r of def.regions) {
        if (!r[f]) continue;
        const g = new Float32Array(CN * CN);
        rasterPoly(g, r.poly, r[f], 'set');
        blur(g, Math.max(1, Math.round((r.feather || 30) / cellKm / 2)));
        const o = out[f];
        for (let i = 0; i < g.length; i++) o[i] += g[i];
      }
    }
    out.culture = new Uint8Array(CN * CN);
    out.styles = ['mannish'];
    def.cultures.forEach((c, i) => {
      out.styles.push(c.style);
      const g = new Float32Array(CN * CN);
      rasterPoly(g, c.poly, 1, 'set');
      for (let j = 0; j < g.length; j++) if (g[j] > 0 && !out.culture[j]) out.culture[j] = i + 1;
    });
    return out;
  }
  function climAt(field, mx, my) {
    const u = clamp(mx / WORLD * CN - 0.5, 0, CN - 1.001), v = clamp(my / WORLD * CN - 0.5, 0, CN - 1.001);
    const iu = Math.floor(u), iv = Math.floor(v), i = iv * CN + iu;
    let fu = u - iu, fv = v - iv;
    fu = fu * fu * (3 - 2 * fu); fv = fv * fv * (3 - 2 * fv); // C1 across cells: no grid-aligned isolines
    return (field[i] * (1 - fu) + field[i + 1] * fu) * (1 - fv) + (field[i + CN] * (1 - fu) + field[i + CN + 1] * fu) * fv;
  }
  function styleAt(mx, my) {
    const u = clamp(Math.floor(mx / WORLD * CN), 0, CN - 1), v = clamp(Math.floor(my / WORLD * CN), 0, CN - 1);
    return CLIM.styles[CLIM.culture[v * CN + u]];
  }

  // ------------------------------------------------------------------ vector index
  let V = null; // {rivers, roads, sites}
  const GRID = 20000; // mu per index cell
  const GN = Math.ceil(2001000 / GRID) + 1;
  function buildIndex(list, getBox) {
    const idx = new Map();
    list.forEach((f, i) => {
      const [x0, y0, x1, y1] = getBox(f);
      for (let gy = Math.max(0, Math.floor(y0 / GRID)); gy <= Math.min(GN - 1, Math.floor(y1 / GRID)); gy++)
        for (let gx = Math.max(0, Math.floor(x0 / GRID)); gx <= Math.min(GN - 1, Math.floor(x1 / GRID)); gx++) {
          const k = gy * GN + gx;
          let a = idx.get(k); if (!a) idx.set(k, a = []);
          a.push(i);
        }
    });
    return idx;
  }
  function query(idx, x0, y0, x1, y1) {
    const out = new Set();
    for (let gy = Math.max(0, Math.floor(y0 / GRID)); gy <= Math.min(GN - 1, Math.floor(y1 / GRID)); gy++)
      for (let gx = Math.max(0, Math.floor(x0 / GRID)); gx <= Math.min(GN - 1, Math.floor(x1 / GRID)); gx++) {
        const a = idx.get(gy * GN + gx);
        if (a) for (const i of a) out.add(i);
      }
    return out;
  }
  function lineBox(f, pad) {
    const p = f.p; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
    return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
  }

  // Deterministic meander refinement: midpoint displacement keyed on segment endpoints, so every
  // tile (and every zoom) sees the same curve; deeper zooms only add finer wiggles.
  function refine(p, minLen, amp, seed) {
    const out = [p[0], p[1]];
    function rec(x0, y0, x1, y1, depth) {
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
      if (L <= minLen || depth > 14) { out.push(x1, y1); return; }
      const h = rnd(Math.round(x0 * 7 + x1 * 3), Math.round(y0 * 7 + y1 * 3), seed) - 0.5;
      const off = h * amp * L;
      const mx = (x0 + x1) / 2 - dy / L * off, my = (y0 + y1) / 2 + dx / L * off;
      rec(x0, y0, mx, my, depth + 1);
      rec(mx, my, x1, y1, depth + 1);
    }
    for (let i = 2; i < p.length; i += 2) rec(p[i - 2], p[i - 1], p[i], p[i + 1], 0);
    return out;
  }

  // ------------------------------------------------------------------ settlements (settlements.js)
  // terrain lookup from cached max-level data tiles, used to keep buildings out of water
  function sampleTerrain(x, y) {
    const tmu = WORLD / (1 << MAXZ);
    const tx = Math.floor(x / tmu), ty = Math.floor(y / tmu);
    if (x < 0 || y < 0 || x >= WORLD || y >= WORLD) { const isl = islandAt(x, y, 50); return isl ? { h: isl[0], slope: 0, water: isl[0] <= 0 } : { h: -3000, slope: 0, water: true }; }
    const d = dataCache.get(`${MAXZ}/${tx}/${ty}`);
    if (!d) return null;
    const dmu = tmu / TILE;
    const u = (x - tx * tmu) / dmu + PAD - 0.5, v = (y - ty * tmu) / dmu + PAD - 0.5;
    const iu = clamp(Math.round(u), 1, S - 2), iv = clamp(Math.round(v), 1, S - 2), i = iv * S + iu;
    const h = d.E[i] / 2;
    const slope = Math.hypot(d.E[i + 1] - d.E[i - 1], d.E[i + S] - d.E[i - S]) / 4 / (dmu * 2 * 1.609);
    return { h, slope, water: h <= 0 || d.C[i] === C_LAKE || d.C[i] === C_SEA };
  }
  const SET = MESettlements({ hash2, rnd, gnoise, clamp, smooth, mix, refine, styleAt: (x, y) => styleAt(x, y), sampleTerrain });
  function applyStamps(Hh, W2, x0, y0, px) { SET.applyStamps(Hh, W2, x0, y0, px); }
  function drawSettlements(view) { SET.draw(view); }
  function initSettlements(defs, sites) { SET.init(defs, sites); }

  // ------------------------------------------------------------------ satellite palette
  const PAL = {
    lush: [84, 106, 54], meadow: [108, 122, 66], dry: [146, 136, 92], steppe: [164, 148, 108], sand: [208, 184, 140],
    redsand: [192, 148, 104], tundra: [124, 120, 100], rock: [124, 116, 106], rockPale: [164, 158, 146], withered: [138, 118, 88], mtnGrey: [112, 108, 102],
    rockDark: [72, 66, 62], ash: [96, 88, 80], ashDark: [60, 56, 54], ashRed: [98, 76, 62], snow: [236, 240, 246],
    marsh: [76, 90, 58], soil: [128, 102, 74], beach: [196, 184, 150], valley: [62, 92, 44], ridge: [150, 140, 104],
    forest: [50, 76, 40], conifer: [38, 58, 40], darkForest: [36, 52, 34], gold: [128, 126, 60],
    deep: [12, 34, 64], mid: [20, 62, 98], shallow: [48, 116, 128], shoal: [120, 156, 136], lakeDeep: [24, 50, 60],
  };
  // farm parcels: pasture is most common, then young crops, ripe grain, ploughed and fallow ground
  const CROPS = [[94, 114, 60], [104, 122, 64], [88, 106, 56], [98, 120, 62], [116, 134, 70], [164, 150, 96], [176, 166, 118], [122, 102, 78], [138, 130, 94], [110, 118, 66]];

  // ------------------------------------------------------------------ islands beyond the DEM (data/islands.js)
  let ISL = [];
  function initIslands(list) {
    ISL = (list || []).map(i => ({
      i, cx: i.center[0] * 1000, cy: i.center[1] * 1000, base: i.base * 1000,
      R: (i.base + Math.max(...i.prongs.map(p => p.len))) * 1000 * 1.25 + 80000,
      prongs: i.prongs.map(p => ({ a: p.angle * Math.PI / 180, len: p.len * 1000, w: p.w })),
    }));
  }
  // returns [height m, class] for a point outside the DEM, or null
  function islandAt(mx, my, px) {
    for (const I of ISL) {
      const dx = mx - I.cx, dy = my - I.cy, r = Math.hypot(dx, dy);
      if (r > I.R) continue;
      const th = Math.atan2(dy, dx);
      let Rt = I.base;
      for (const p of I.prongs) { let d = th - p.a; d = Math.atan2(Math.sin(d), Math.cos(d)); Rt += p.len * Math.exp(-(d / p.w) * (d / p.w)); }
      // fractal coastline: warp the outline radius at several scales (band-limited)
      Rt *= 1 + 0.07 * gnoise(dx / 45000, dy / 45000, 701) + 0.035 * gnoise(dx / 14000, dy / 14000, 702) + 0.6 * fbm(mx, my, 5000, 5, 0.55, px, 703) * 0.025;
      const d = (Rt - r) / 1000; // km inside the coast (negative = at sea)
      if (d < 0) { const dd = -d; return [-Math.min(3000, 2 + 10 * dd + 0.8 * dd * dd), C_SEA]; }
      const up = fbm(mx, my, 30000, 6, 0.55, px, 705);
      let h = 2 + I.i.hills * smooth(0, 40, d) * (0.55 + 0.6 * up) + 40 * d / (d + 10);
      const pk = I.i.peak; const pr = Math.hypot(dx - pk.at[0] * 1000, dy - pk.at[1] * 1000) / 1000;
      h += pk.height * Math.exp(-(pr / pk.radius) * (pr / pk.radius)) * (1 + 0.08 * gnoise(dx / 2500, dy / 2500, 706));
      let c = C_OPEN;
      const f = I.i.forest;
      if (f) { const fr = Math.hypot(dx - f.at[0] * 1000, dy - f.at[1] * 1000) / 1000; if (fr < f.radius && fbm(mx, my, 12000, 5, 0.55, px, 707) > -0.1 + 0.5 * fr / f.radius) c = C_FOREST; }
      return [h, c];
    }
    return null;
  }

  // ------------------------------------------------------------------ main render
  async function render(job) {
    const { dpr, mode } = job;
    const opts = job.opts || {};
    let z, R, px, ox, oy, L, dox, doy, dataMu;
    if (job.patch) {
      // arbitrary square patch (used by the 3D viewer): R px of px mu each from (ox, oy); the pool picked
      // a data tile (level L, tile dtx/dty) that contains it
      ({ ox, oy, px, R } = job.patch);
      z = Math.log2(WORLD / (TILE * px));
      L = job.L; dataMu = WORLD / (TILE << L);
      dox = job.dtx * TILE * dataMu; doy = job.dty * TILE * dataMu;
    } else {
      z = job.z;
      R = Math.round(TILE * dpr);
      const tileMu = WORLD / (1 << z);
      px = tileMu / R; // map units per output pixel
      ox = job.x * tileMu; oy = job.y * tileMu;
      L = Math.min(z, MAXZ);
      dataMu = WORLD / (TILE << L); // mu per data px
      dox = (job.x >> (z - L)) * TILE * dataMu; doy = (job.y >> (z - L)) * TILE * dataMu;
    }
    if (job.extra) for (const e of job.extra) await getData(e.key, e.b64);
    const data = job.dataKey ? await getData(job.dataKey, job.b64) : null;

    // --- 1. elevation (+1px border for normals), class, lake depth
    const W2 = R + 2, n2 = W2 * W2;
    const H = new Float32Array(n2);
    const rough = new Float32Array(n2);
    const lakeD = new Float32Array(n2);
    const cls = new Uint8Array(n2);
    const detailFrom = 2 * WORLD / (TILE << MAXZ); // wavelengths below this are procedural
    for (let j = 0; j < W2; j++) {
      const my = oy + (j - 0.5) * px;
      for (let i = 0; i < W2; i++) {
        const mx = ox + (i - 0.5) * px, k = j * W2 + i;
        let h = -3000, c = C_SEA, ld = 0;
        const inWorld = mx >= 0 && my >= 0 && mx < WORLD && my < WORLD;
        if (!inWorld && ISL.length) { const isl = islandAt(mx, my, px); if (isl) { h = isl[0]; c = isl[1]; } }
        if (data && inWorld) {
          const u = (mx - dox) / dataMu + PAD - 0.5, v = (my - doy) / dataMu + PAD - 0.5;
          h = cubicE(data.E, u, v);
          // domain-warped nearest-neighbour class lookup -> organic, fractal boundaries at every zoom
          let du = u, dv = v, wl = 3.2, wa = 1.3;
          for (let o = 0; o < 7; o++) {
            const lam = wl * dataMu;
            if (lam < 2.5 * px) break;
            du += wa * gnoise(mx / lam, my / lam, 11 + o);
            dv += wa * gnoise(mx / lam, my / lam, 41 + o);
            wl *= 0.45; wa *= 0.42;
          }
          c = data.C[clamp(Math.round(dv), 0, S - 1) * S + clamp(Math.round(du), 0, S - 1)];
          ld = bilinear8(data.D, u, v);
        }
        // procedural relief below the data resolution
        let r = 0;
        if (px < detailFrom) {
          const mount = smooth(150, 1400, h);
          r = 0.005 + 0.04 * mount;
          let lam = detailFrom, add = 0;
          for (let o = 0; o < 10 && lam > 2 * px; o++) {
            const w = Math.min(1, (lam / px - 2) * 0.5);
            add += w * gnoise(mx / lam, my / lam, 100 + o) * lam * r;
            lam *= 0.5;
          }
          if (h < 0) add *= 0.25;
          h += add;
        }
        if (h > 0 && c === C_SEA) c = C_OPEN; // coastline moved by detail noise
        H[k] = h; rough[k] = r; cls[k] = c; lakeD[k] = ld;
      }
    }
    applyStamps(H, W2, ox - px, oy - px, px);

    const canvas = new OffscreenCanvas(R, R);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(R, R);
    const out = img.data;
    const ve = mode === 'map' ? clamp(3.2 - 0.25 * z, 1.2, 3) : clamp(3.4 - 0.25 * z, 1.4, 3);
    const lx = -0.55, ly = -0.55, lz = 0.63; // sun from the north-west

    for (let j = 0; j < R; j++) {
      const my = oy + (j + 0.5) * px;
      for (let i = 0; i < R; i++) {
        const mx = ox + (i + 0.5) * px;
        const k = (j + 1) * W2 + (i + 1);
        const h = H[k];
        const dzdx = (H[k + 1] - H[k - 1]) / (2 * px * 1.609), dzdy = (H[k + W2] - H[k - W2]) / (2 * px * 1.609);
        const slope = Math.hypot(dzdx, dzdy);
        let nx = -dzdx * ve, ny = -dzdy * ve, nz = 1;
        const nl = 1 / Math.hypot(nx, ny, nz); nx *= nl; ny *= nl; nz *= nl;
        const diff = Math.max(0, nx * lx + ny * ly + nz * lz);
        const curv = clamp((H[k - 1] + H[k + 1] + H[k - W2] + H[k + W2] - 4 * h) / (px * 1.609) * 3, -1, 1);
        let cr, cg, cb;
        const c = cls[k];
        const o = (j * R + i) * 4;
        if (mode === 'map') {
          [cr, cg, cb] = mapPixel(h, c, lakeD[k], diff, slope, mx, my, px, opts, H, k, W2);
        } else {
          [cr, cg, cb] = satPixel(h, c, lakeD[k], diff, slope, curv, mx, my, px);
        }
        out[o] = cr; out[o + 1] = cg; out[o + 2] = cb; out[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // --- 3. vectors
    const view = { ox, oy, px, z, R, mode, dpr, opts, ctx, H, W2 };
    if (!opts.noRivers) drawRivers(view);
    if (mode === 'map' || z >= 9) drawRoads(view);
    drawSettlements(view);
    if (mode === 'map') drawRoads(view, true);
    const bmp = canvas.transferToImageBitmap();
    if (job.patch) {
      const heights = new Float32Array(R * R), water = new Uint8Array(R * R);
      for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
        const k = (j + 1) * W2 + (i + 1);
        heights[j * R + i] = H[k];
        water[j * R + i] = H[k] <= 0 ? 1 : cls[k] === C_LAKE ? 2 : 0;   // 1 sea, 2 lake
      }
      return { bmp, heights, water };
    }
    return bmp;
  }

  // ------------------------------------------------------------------ satellite pixel
  let colR = 0, colG = 0, colB = 0;
  function setc(a) { colR = a[0]; colG = a[1]; colB = a[2]; }
  function lerpc(a, t) { colR += (a[0] - colR) * t; colG += (a[1] - colG) * t; colB += (a[2] - colB) * t; }
  function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  // permanent snow: peaks only. Misty Mountains summits (2.8–3.5 km) are white, the Grey Mountains
  // (~2 km, far north) get patches, the White Mountains only their highest tops.
  function snowlineAt(lat) { return 2650 - 550 * smooth(0.5, 0.2, lat) + 300 * smooth(0.75, 0.95, lat); }
  // local base elevation (data/relief.js): relief = h - base separates mountains from plateaus
  let RELIEF = null, RN = 0;
  async function initRelief(r) {
    if (!r) return;
    const bin = atob(r.b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const raw = await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
    RELIEF = new Int16Array(raw); RN = r.n;
  }
  function baseAt(mx, my) {
    if (!RELIEF || mx < 0 || my < 0 || mx >= WORLD || my >= WORLD) return 0;
    const u = clamp(mx / WORLD * RN - 0.5, 0, RN - 1.001), v = clamp(my / WORLD * RN - 0.5, 0, RN - 1.001);
    const iu = Math.floor(u), iv = Math.floor(v), i = iv * RN + iu;
    let fu = u - iu, fv = v - iv; fu = fu * fu * (3 - 2 * fu); fv = fv * fv * (3 - 2 * fv);
    return (RELIEF[i] * (1 - fu) + RELIEF[i + 1] * fu) * (1 - fv) + (RELIEF[i + RN] * (1 - fu) + RELIEF[i + RN + 1] * fu) * fv;
  }
  function treelineAt(lat) { return 1300 + 900 * clamp((lat - 0.25) * 1.8, 0, 1); }

  function satPixel(h, c, ld, diff, slope, curv, mx, my, px) {
    const n1 = fbm(mx, my, 30000, 4, 0.55, px, 1);       // regional variation
    const n2 = fbm(mx, my, 2600, 4, 0.6, px, 2);         // patches
    const n3 = fbm(mx, my, 140, 5, 0.6, px, 3);          // fine grain
    const lat = my / WORLD;
    // climate zones are hand-drawn polygons: warp the lookup so their edges wander naturally
    const cx = mx + 6000 * gnoise(mx / 26000, my / 26000, 61) + 2000 * gnoise(mx / 7000, my / 7000, 62);
    const cy = my + 6000 * gnoise(mx / 26000, my / 26000, 63) + 2000 * gnoise(mx / 7000, my / 7000, 64);
    const T = 0.08 + 0.95 * lat + climAt(CLIM.heat, cx, cy) - Math.max(0, h) / 4200 + 0.04 * n1;
    const M = 0.62 - 0.33 * (mx / WORLD) - 0.2 * smooth(0.75, 1, lat) + climAt(CLIM.moist, cx, cy) + 0.12 * n1 + 0.06 * n2 + 0.18 * curv;
    const bf = climAt(CLIM.blight, cx, cy);
    const blight = clamp(smooth(0.05, 0.8, bf * (1 + 0.22 * n2) + 0.15 * n1 - 0.2 * Math.max(0, curv)) * Math.min(1, bf * 2.5) + 0.06 * n3 * bf, 0, 1);
    const cult = clamp(climAt(CLIM.cult, cx, cy), 0, 1);
    const grass = clamp(climAt(CLIM.grass, cx, cy), 0, 1);

    // --- water
    const isLake = c === C_LAKE || ld > 0.6 + 0.4 * n3;
    if (h <= 0 || isLake) {
      const depth = isLake && h > 0 ? Math.max(0.3, ld) : -h;
      const t = 1 - Math.exp(-depth / 8);
      const t2 = 1 - Math.exp(-depth / 120);
      if (isLake && h > 0) { setc(PAL.shoal); lerpc(PAL.shallow, t * 0.7); lerpc(PAL.lakeDeep, t2 * 0.9 + 0.35 * t); if (blight > 0.4) lerpc([60, 62, 56], 0.5 * blight); }
      else { setc(PAL.shoal); lerpc(PAL.shallow, t); lerpc(PAL.mid, smooth(0.0, 0.5, t2)); lerpc(PAL.deep, smooth(0.35, 1, t2)); }
      if (T < 0.24) { // pack ice in the far north: sharp-edged floes, denser further north
        const floe = fbm(mx, my, 9000, 6, 0.62, px, 31) + 1.6 * smooth(0.24, 0.04, T) - 0.85;
        const ice = smooth(-0.03, 0.03, floe);
        if (ice > 0) { const k = 0.94 + 0.06 * n3; lerpc([226 * k, 234 * k, 240 * k], ice * 0.95); }
      }
      const w = 1 + 0.05 * n2 + 0.03 * n3 * (depth < 4 ? 2 : 1);
      if (depth < 0.6 && !isLake) lerpc([200, 206, 196], 0.45 * (1 - depth / 0.6)); // surf line
      return [colR * w, colG * w, colB * w];
    }

    // --- ground colour from climate (a tiny Whittaker diagram)
    const dry = clamp(1 - M, 0, 1);
    setc(PAL.lush);
    lerpc(PAL.meadow, smooth(0.25, 0.5, dry) * 0.8 + 0.2 * Math.max(0, n2));
    lerpc(PAL.dry, smooth(0.45, 0.72, dry));
    lerpc(PAL.steppe, smooth(0.62, 0.82, dry));
    lerpc(PAL.sand, smooth(0.78, 0.98, dry) * smooth(0.6, 0.85, T));
    lerpc(mixc(PAL.sand, PAL.redsand, smooth(0.0, 0.4, n1)), smooth(0.85, 1.05, dry) * smooth(0.75, 0.95, T) * 0.5);
    lerpc(PAL.tundra, smooth(0.42, 0.22, T));
    lerpc(PAL.dry, 0.22 * Math.max(0, n2) * (1 - grass));
    if (grass > 0) lerpc([124, 130, 72], grass * (0.3 + 0.15 * n2)); // Rohan's rolling grass
    // drainage: green moist valleys, pale dry ridges
    if (curv > 0) lerpc(dry > 0.75 ? PAL.dry : PAL.valley, Math.min(0.55, curv * 0.7) * (1 - 0.6 * blight));
    else lerpc(PAL.ridge, Math.min(0.35, -curv * 0.5));
    // marsh
    if (c === C_WETLAND) {
      lerpc(PAL.marsh, 0.8);
      if (px < 80) { const pools = fbm(mx, my, 160, 4, 0.6, px, 23); if (pools > 0.18) lerpc(blight > 0.2 ? [44, 50, 46] : [40, 58, 56], smooth(0.18, 0.35, pools) * 0.9); }
    }
    // blight: Mordor, the Desolation, the Brown Lands
    const rel = h - baseAt(mx, my);
    const mtn = smooth(280, 800, rel + 120 * n2);   // 0 lowland .. 1 mountain
    if (blight > 0) {
      // withered land first goes dry brown; only the worst (Gorgoroth) turns to grey-black ash
      lerpc(PAL.withered, smooth(0.1, 0.55, blight) * 0.75);
      if (blight > 0.55) lerpc(mixc(PAL.ash, PAL.ashRed, smooth(-0.15, 0.35, n1)), smooth(0.55, 0.85, blight) * 0.8);
      if (blight > 0.8) lerpc(PAL.ashDark, smooth(0.8, 1, blight) * (0.4 + 0.4 * n2));
    }
    // beaches
    if (h < 3.5 && slope < 0.05) lerpc(PAL.beach, smooth(3.5, 0.6, h) * 0.65 * (1 - blight));
    // farmland patchwork
    if (cult > 0.04 && blight < 0.6 && c !== C_WETLAND && h < 900 && slope < 0.2) fields(mx, my, px, cult * smooth(0.2, 0.08, slope), dry, cult > 0.78);
    // rock and scree on steep or high ground
    const treeline = treelineAt(lat);
    // mountains read as bare grey rock (like every reference map); ridges more than gullies
    let rock = smooth(0.28, 0.7, slope + 0.08 * n3) + mtn * (0.62 + 0.25 * smooth(0, 0.4, slope)) + smooth(treeline + 50, treeline + 700, h + 150 * n2) * 0.5 - Math.max(0, curv) * 0.35;
    if (c === C_STONE) rock = Math.max(rock, 0.8);
    rock = clamp(rock, 0, 1);
    if (rock > 0) {
      const rc = blight > 0.35 || c === C_VOLCANIC ? mixc(PAL.rockDark, [52, 48, 48], smooth(0.5, 1, blight)) : mixc(PAL.mtnGrey, mixc(PAL.rock, PAL.rockPale, smooth(0.05, 0.45, n1)), 1 - 0.5 * mtn);
      lerpc(rc, rock * (0.85 + 0.15 * n3));
    }
    if (c === C_VOLCANIC) { lerpc(PAL.rockDark, 0.75); lerpc([42, 36, 34], smooth(0.1, 0.6, n2) * 0.7); }
    // snow: lower in the north, gone from steep faces, deeper in hollows
    const snowline = snowlineAt(lat);
    let snow = smooth(snowline - 250, snowline + 350, h + 280 * n2 + 120 * n3 - 500 * Math.max(0, slope - 0.45) + 250 * curv) * smooth(350, 750, rel);
    // polar snowfields: driven by latitude climate only (mountain height is handled by the snowline above)
    const T0 = T + Math.max(0, h) / 4200;
    if (T0 < 0.2) snow = Math.max(snow, smooth(-0.04, 0.04, fbm(mx, my, 7000, 6, 0.6, px, 33) + 1.5 * smooth(0.2, 0.02, T0) - 0.75 + 0.3 * curv));
    if (snow > 0) lerpc(PAL.snow, snow * (blight > 0.5 ? 0.25 : 1));

    // --- forests and trees
    const forestCls = c === C_FOREST || c === C_FOREST_DARK || c === C_FOREST_GOLD;
    let treeDens = 0;
    if (forestCls) treeDens = 0.86 + 0.2 * n3 + 0.12 * n2;
    else if (blight < 0.3 && h > 0 && h < treeline && grass < 0.6) {
      // copses, riverside woods and scattered trees outside the mapped forests
      treeDens = smooth(0.45, 0.8, n2 * 0.65 + n1 * 0.4 + 0.4 * curv + 0.34 - dry * 0.55 - cult * 0.12) * 0.85;
    }
    if (h > treeline - 200) treeDens *= smooth(treeline + 150, treeline - 200, h + 100 * n3);
    treeDens *= (1 - snow) * (1 - 0.6 * smooth(0.5, 0.9, slope)) * (1 - 0.85 * (forestCls ? 0.3 : 1) * mtn);
    if (treeDens > 0.02) {
      const conifer = smooth(0.5, 0.35, T) + smooth(treeline - 700, treeline - 200, h);
      let fc = c === C_FOREST_DARK ? PAL.darkForest : c === C_FOREST_GOLD ? PAL.gold : PAL.forest;
      if (c !== C_FOREST_GOLD) fc = mixc(fc, PAL.conifer, clamp(conifer, 0, 1));
      if (dry > 0.6 && c !== C_FOREST_GOLD) fc = mixc(fc, [86, 90, 54], smooth(0.6, 0.9, dry));
      if (c === C_FOREST_GOLD) fc = mixc(fc, [86, 104, 50], 0.35 + 0.35 * n2);
      trees(mx, my, px, clamp(treeDens, 0, 1), fc, c === C_FOREST_GOLD ? 16 : c === C_FOREST_DARK ? 10 : 7.5);
    }

    // --- light and a gentle "camera" grade (slightly desaturated, like real imagery)
    const shade = (0.36 + 0.92 * diff) / (0.36 + 0.92 * 0.63);
    const g = (0.93 + 0.07 * n3) * shade;
    let r = colR * g, gg = colG * g, b = colB * g;
    const lum = 0.3 * r + 0.59 * gg + 0.11 * b;
    return [mix(lum, r, 0.9), mix(lum, gg, 0.9), mix(lum, b, 0.9)];
  }

  // Farmland: Voronoi "farms" with their own field orientation and size, split into parcels with
  // a crop colour, in-field texture, plough stripes and (in hedge country) hedgerows.
  function fields(mx, my, px, amount, dry, hedges) {
    const D = 2200; // farm district size (mu)
    const fade = smooth(90, 28, px); // invisible patchwork at low zoom just tints the ground
    if (fade <= 0) { // too far out to resolve farms: use the expected average, never per-farm coin flips (aliasing)
      lerpc(mixc(CROPS[0], CROPS[5], 0.35), 0.55 * smooth(0.0, 0.3, amount) * 0.35 * Math.min(1, amount * 0.95));
      return;
    }
    const gx = Math.floor(mx / D), gy = Math.floor(my / D);
    let best = 1e18, bx = 0, by = 0, bi = 0, bj = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const cx = (gx + a + 0.15 + 0.7 * rnd(gx + a, gy + b, 71)) * D, cy = (gy + b + 0.15 + 0.7 * rnd(gx + a, gy + b, 72)) * D;
      const d = (mx - cx) * (mx - cx) + (my - cy) * (my - cy);
      if (d < best) { best = d; bx = cx; by = cy; bi = gx + a; bj = gy + b; }
    }
    if (rnd(bi, bj, 73) > amount * 0.95) return;
    // orientation follows a smooth regional trend so neighbouring farms line up
    const ang = 1.8 * vnoise(bx / 45000, by / 45000, 79) + (rnd(bi, bj, 74) - 0.5) * 0.6, ca = Math.cos(ang), sa = Math.sin(ang);
    const fw = 110 + 190 * rnd(bi, bj, 75), fh = fw * (0.35 + 0.5 * rnd(bi, bj, 76)), jit = 0.18 + 0.25 * rnd(bi, bj, 80);
    const lx = (mx - bx) * ca + (my - by) * sa, ly = -(mx - bx) * sa + (my - by) * ca;
    // parcels are Voronoi cells of a jittered, stretched grid: irregular like real field systems
    const u = lx / fw, v = ly / fh, iu = Math.floor(u), iv = Math.floor(v);
    let f1 = 1e9, f2 = 1e9, ci = 0, cj = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const h = hash2(iu + a + bi * 977, iv + b + bj * 613, 77);
      const px2 = iu + a + 0.5 + jit * ((h & 1023) / 1023 - 0.5), py2 = iv + b + 0.5 + jit * (((h >>> 10) & 1023) / 1023 - 0.5);
      const dx = (u - px2) * fw, dy = (v - py2) * fh, d = dx * dx + dy * dy;
      if (d < f1) { f2 = f1; f1 = d; ci = iu + a; cj = iv + b; } else if (d < f2) f2 = d;
    }
    const r = hash2(ci + bi * 977, cj + bj * 613, 78);
    if ((r & 7) === 0) return; // some parcels stay rough grazing
    let crop = CROPS[[0, 0, 1, 1, 2, 3, 3, 4, 9, 9, 5, 5, 6, 7, 8, 1][(r >>> 3) & 15]];
    if (dry > 0.5) crop = mixc(crop, [172, 154, 110], 0.45);
    const t = 0.55 * smooth(0.0, 0.3, amount) * (0.35 + 0.65 * fade);
    lerpc(crop, t);
    // texture inside each parcel: damp patches, wheel ruts, plough lines
    if (px < 12) {
      const tex = vnoise(lx / 22 + ci * 17.3, ly / 22 + cj * 9.1, 91) * smooth(12, 4, px);
      const k = 1 + 0.07 * tex;
      colR *= k; colG *= k; colB *= k;
    }
    if (px < 3 && (r & 48) !== 0) {
      const pa = ((r >>> 12) & 7) * 0.4;
      const stripe = Math.sin((lx * Math.cos(pa) + ly * Math.sin(pa)) * 2.4);
      const k = 1 + 0.05 * smooth(3, 1, px) * stripe;
      colR *= k; colG *= k; colB *= k;
    }
    // field margins and hedgerows: distance to the Voronoi edge ~ (f2 - f1) / (2 * spacing)
    const edge = (Math.sqrt(f2) - Math.sqrt(f1)) * 0.5;
    const hw = hedges ? Math.max(2.4, 0.7 * px) : Math.max(1.2, 0.5 * px);
    if (edge < hw) {
      const hedge = hedges && (r & 0x300) !== 0;
      const bump = hedge && px < 2 ? 0.75 + 0.5 * vnoise(mx / 3, my / 3, 93) : 1;
      const vis = smooth(14, 3, px);
      lerpc(hedge ? [46 * bump, 66 * bump, 36 * bump] : [146, 138, 102], (1 - edge / hw) * fade * vis * (hedge ? 0.85 : 0.3));
    }
  }

  // Tree crowns from a jittered grid; below ~3 px per tree it blends to a textured canopy tone.
  function trees(mx, my, px, dens, fc, cell) {
    const detail = smooth(cell * 0.55, cell * 0.2, px);
    const avgCover = clamp(dens * 1.1, 0, 1);
    const n = fbm(mx, my, cell * 24, 6, 0.62, px, 9), nb = fbm(mx, my, cell * 160, 3, 0.6, px, 19);
    const nc = fbm(mx, my, 9000, 4, 0.6, px, 29);
    const canopy = mixc([fc[0] * 0.74, fc[1] * 0.76, fc[2] * 0.76], [fc[0] * 1.22, fc[1] * 1.2, fc[2] * 1.14], clamp(0.5 + 0.5 * n + 0.3 * nb + 0.35 * nc, 0, 1));
    if (detail <= 0) { lerpc(canopy, avgCover); return; }
    // explicit crowns: find the highest crown covering this pixel, and whether we're in a crown's shadow
    const gx = Math.floor(mx / cell), gy = Math.floor(my / cell);
    let lit = -1, shadow = 0;
    const sdx = cell * 0.45, sdy = cell * 0.45; // shadow offset towards the south-east
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const cx = gx + a, cy = gy + b;
      const hsh = hash2(cx, cy, 81);
      if ((hsh & 1023) / 1024 > dens) continue;
      const tx = (cx + 0.2 + 0.6 * ((hsh >>> 10) & 255) / 255) * cell, ty = (cy + 0.2 + 0.6 * ((hsh >>> 18) & 255) / 255) * cell;
      const rr = cell * (0.42 + 0.3 * ((hsh >>> 26) & 63) / 63);
      const ddx = mx - tx, ddy = my - ty, d2 = ddx * ddx + ddy * ddy;
      if (d2 < rr * rr) {
        const zt = Math.sqrt(1 - d2 / (rr * rr));
        const l = clamp((-ddx / rr * 0.55 - ddy / rr * 0.55 + zt * 0.63) * 1.2, 0.2, 1.25);
        const v = l * (0.85 + 0.3 * ((hsh >>> 4) & 15) / 15);
        if (v > lit) lit = v;
      } else {
        const sx = mx - sdx - tx, sy = my - sdy - ty;
        if (sx * sx + sy * sy < rr * rr) shadow = 1;
      }
    }
    let r, g, b;
    if (lit >= 0) { r = canopy[0] * lit; g = canopy[1] * lit; b = canopy[2] * lit; }
    else if (shadow) { r = colR * 0.5; g = colG * 0.52; b = colB * 0.56; }
    else { r = colR; g = colG; b = colB; }
    const ar = mix(colR, canopy[0], avgCover), ag = mix(colG, canopy[1], avgCover), ab = mix(colB, canopy[2], avgCover);
    colR = mix(ar, r, detail); colG = mix(ag, g, detail); colB = mix(ab, b, detail);
  }

  // ------------------------------------------------------------------ map (Google-style) pixel
  const MAPC = {
    water: [170, 218, 255], land: [242, 239, 233], forest: [200, 229, 192], darkForest: [186, 220, 178],
    gold: [222, 232, 186], sand: [246, 234, 204], snow: [255, 255, 255], wet: [205, 228, 216], ash: [222, 216, 210],
    rock: [232, 228, 222], farm: [236, 236, 222], grass: [222, 238, 210], mtn: [204, 196, 184],
  };
  function mapPixel(h, c, ld, diff, slope, mx, my, px, opts, H, k, W2) {
    if (h <= 0 || c === C_LAKE || ld > 0.75) return MAPC.water;
    const lat = my / WORLD;
    const M = 0.62 - 0.33 * (mx / WORLD) - 0.2 * smooth(0.75, 1, lat) + climAt(CLIM.moist, mx, my);
    const blight = climAt(CLIM.blight, mx, my);
    let base = MAPC.land;
    if (M < 0.15) base = mixc(MAPC.land, MAPC.sand, smooth(0.15, -0.1, M));
    if (blight > 0.4) base = mixc(base, MAPC.ash, smooth(0.4, 0.9, blight));
    if (c === C_FOREST) base = MAPC.forest;
    else if (c === C_FOREST_DARK) base = MAPC.darkForest;
    else if (c === C_FOREST_GOLD) base = MAPC.gold;
    else if (c === C_WETLAND) base = MAPC.wet;
    else if (c === C_VOLCANIC || c === C_STONE) base = MAPC.rock;
    let [r, g, b] = base;
    if (opts.terrain) {
      // relief tint: mountains go warm grey, peaks white (Google "Terrain" + classic atlas style)
      const rel = h - baseAt(mx, my);
      const mt = smooth(220, 800, rel);
      if (c !== C_FOREST && c !== C_FOREST_DARK && c !== C_FOREST_GOLD) [r, g, b] = mixc([r, g, b], MAPC.mtn, mt * 0.85);
      if (h > snowlineAt(lat) + 150 && rel > 500) [r, g, b] = MAPC.snow;
      const s = clamp((diff - 0.63) * 1.6, -0.5, 0.45);
      const f = s < 0 ? 1 + s * 0.65 : 1 + s * 0.14;
      r *= f; g *= f; b *= f * (s < 0 ? 1.02 : 1);
      // contour lines at high zoom
      if (px < 40) {
        const step = px < 6 ? 20 : px < 15 ? 50 : 100;
        const a = Math.floor(h / step), a1 = Math.floor(H[k + 1] / step), a2 = Math.floor(H[k + W2] / step);
        if (a !== a1 || a !== a2) { const major = a % 5 === 0; const f2 = major ? 0.86 : 0.93; r *= f2; g *= f2; b *= f2; }
      }
    }
    return [r, g, b];
  }

  // ------------------------------------------------------------------ rivers & roads
  function riverWidthPx(w, view) { return w / view.px; }
  function drawRivers(view) {
    const { ctx, ox, oy, px, R, mode, z } = view;
    const span = R * px, pad = 2000;
    const ids = query(V.riverIdx, ox - pad, oy - pad, ox + span + pad, oy + span + pad);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const passes = mode === 'map' ? ['water'] : ['riparian', 'bank', 'water'];
    const dprK = view.dpr || 1;
    const list = [...ids].map(i => V.rivers[i]);
    for (const pass of passes) {
      for (const f of list) {
        const wmax = f.w[1];
        const wpx = wmax / px;
        // visibility: thin streams vanish at low zoom (like Google), big rivers stay as 1px lines
        let alpha = 1, thin = false;
        if (mode === 'map') {
          if (wpx < 1) {
            // like an atlas: great rivers from z2, rivers from z4, large streams from z6, brooks from z8
            let zmin = wmax >= 200 ? 2 : wmax >= 60 ? 4 : wmax >= 25 ? 6 : 8;
            if (f.n && f.n.length > 2) zmin = Math.min(zmin, wmax >= 15 ? 4 : 5); // named rivers are drawn early, like on atlas maps
            alpha = smooth(zmin - 0.5, zmin + 0.5, z) * (wmax >= 25 ? 1 : 0.8); thin = true;
          }
        } else if (wpx < 1) { alpha = clamp(wpx * 1.5 + (wmax > 150 ? 0.6 : wmax > 60 ? 0.25 : 0), 0, 1) * 0.9; thin = true; }
        if (alpha < 0.05) continue;
        if (pass === 'riparian' && (wmax * 3 + 40) / px < 1.5) continue;
        if (pass === 'bank' && wpx < 2) continue;
        const pts = f._pts && f._ptsPx === Math.round(Math.log2(px)) ? f._pts : (f._pts = refine(f.p, Math.max(5 * px, 12), 0.3, 5), f._ptsPx = Math.round(Math.log2(px)), f._pts);
        const w0 = f.w[0] / px, w1 = f.w[1] / px;
        const nseg = pts.length / 2 - 1, chunks = Math.max(1, Math.min(8, Math.floor(nseg / 4)));
        for (let ch = 0; ch < chunks; ch++) {
          const a = Math.floor(ch * nseg / chunks), b = Math.floor((ch + 1) * nseg / chunks);
          const t = (ch + 0.5) / chunks;
          const w = thin ? (mode === 'map' ? 1 + (wmax > 150 ? 0.8 : wmax > 60 ? 0.3 : 0) : (wmax > 150 ? 1.6 : 1)) * dprK : Math.max(mix(w0, w1, t), 0.6);
          ctx.beginPath();
          ctx.moveTo((pts[2 * a] - ox) / px, (pts[2 * a + 1] - oy) / px);
          for (let s = a + 1; s <= b; s++) ctx.lineTo((pts[2 * s] - ox) / px, (pts[2 * s + 1] - oy) / px);
          if (mode === 'map') { ctx.strokeStyle = `rgba(150,204,250,${alpha})`; ctx.lineWidth = w; }
          else if (pass === 'riparian') { ctx.strokeStyle = 'rgba(46,70,36,0.22)'; ctx.lineWidth = w * 3 + 40 / px; }
          else if (pass === 'bank') { ctx.strokeStyle = 'rgba(132,122,92,0.7)'; ctx.lineWidth = w + Math.max(1.5, 4 / px); }
          else {
            const deep = smooth(10, 300, wmax);
            ctx.strokeStyle = `rgba(${Math.round(mix(48, 30, deep))},${Math.round(mix(74, 66, deep))},${Math.round(mix(76, 92, deep))},${alpha})`;
            ctx.lineWidth = w;
          }
          ctx.stroke();
        }
      }
    }
  }
  // Roads: the GIS polylines are coarse zig-zags. Cut their corners into smooth curves (Chaikin),
  // then add only a faint wobble, so roads look surveyed rather than scribbled.
  function chaikinFlat(p, iters) {
    for (let it = 0; it < iters; it++) {
      if (p.length < 6) return p;
      const o = [p[0], p[1]];
      for (let i = 0; i + 3 < p.length; i += 2) {
        o.push(0.75 * p[i] + 0.25 * p[i + 2], 0.75 * p[i + 1] + 0.25 * p[i + 3], 0.25 * p[i] + 0.75 * p[i + 2], 0.25 * p[i + 1] + 0.75 * p[i + 3]);
      }
      o.push(p[p.length - 2], p[p.length - 1]);
      p = o;
    }
    return p;
  }
  function roadPts(f, px) {
    if (!f._smooth) f._smooth = chaikinFlat(f.p, 3);
    const k = Math.round(Math.log2(px));
    if (f._rk !== k) { f._rk = k; f._rp = refine(f._smooth, Math.max(8 * px, 60), 0.035, 6); }
    return f._rp;
  }
  function drawRoads(view, labelsPass) {
    if (labelsPass) return;
    const { ctx, ox, oy, px, R, mode, z } = view;
    const span = R * px, pad = 500;
    const ids = query(V.roadIdx, ox - pad, oy - pad, ox + span + pad, oy + span + pad);
    const list = [...ids].map(i => V.roads[i]).sort((a, b) => b.c - a.c);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const widthMu = [0, 9, 6, 4];
    if (mode === 'map') {
      const minZ = [0, 5, 7, 9];
      for (const pass of [0, 1]) {
        for (const f of list) {
          if (z < (f.n ? Math.min(minZ[f.c], 5) : minZ[f.c])) continue; // named highways (Old Forest Road, Harad Road…) show early
          const pts = roadPts(f, px);
          const base = f.c === 1 ? [1.6, 2.2, 3, 4.5, 6, 8, 10, 12, 14, 16] : f.c === 2 ? [1, 1.4, 2, 3, 4.5, 6, 8, 10, 12, 14] : [0.8, 1, 1.4, 2, 3, 4.5, 6, 8, 10, 12];
          let w = Math.max(base[clamp(z - 5, 0, 9)], widthMu[f.c] / px) * view.dpr;
          ctx.beginPath();
          ctx.moveTo((pts[0] - ox) / px, (pts[1] - oy) / px);
          for (let s = 2; s < pts.length; s += 2) ctx.lineTo((pts[s] - ox) / px, (pts[s + 1] - oy) / px);
          if (pass === 0) { ctx.strokeStyle = f.c === 1 ? '#e9bc62' : '#d6d2cb'; ctx.lineWidth = w + 1.6 * view.dpr; }
          else { ctx.strokeStyle = f.c === 1 ? '#fde293' : '#ffffff'; ctx.lineWidth = w; }
          ctx.stroke();
        }
      }
      return;
    }
    // satellite: dirt and stone tracks
    for (const f of list) {
      const wpx = widthMu[f.c] / px;
      const alpha = clamp(wpx * 1.4, 0, 0.9);
      if (alpha < 0.08) continue;
      const pts = roadPts(f, px);
      ctx.beginPath();
      ctx.moveTo((pts[0] - ox) / px, (pts[1] - oy) / px);
      for (let s = 2; s < pts.length; s += 2) ctx.lineTo((pts[s] - ox) / px, (pts[s + 1] - oy) / px);
      const st = styleAt(pts[0], pts[1]);
      const col = st === 'gondor' || f.c === 1 ? '178,168,148' : '150,128,98';
      if (wpx > 2.5) { ctx.strokeStyle = `rgba(80,70,50,${alpha * 0.25})`; ctx.lineWidth = wpx + 2; ctx.stroke(); }
      ctx.strokeStyle = `rgba(${col},${alpha})`; ctx.lineWidth = Math.max(1, wpx); ctx.stroke();
    }
  }

  // ------------------------------------------------------------------ messaging
  self.onmessage = async (e) => {
    const m = e.data;
    if (m.type === 'init') {
      WORLD = m.world;
      CLIM = buildClimate(m.climate);
      V = m.vectors;
      V.riverIdx = buildIndex(V.rivers, f => lineBox(f, f.w[1] + 50));
      V.roadIdx = buildIndex(V.roads, f => lineBox(f, 50));
      initIslands(m.islands);
      await initRelief(m.relief);
      initSettlements(m.settlements, V.sites);
      self.postMessage({ type: 'ready' });
      return;
    }
    if (m.type === 'render') {
      try {
        const out = await render(m.job);
        if (out.heights) self.postMessage({ type: 'tile', id: m.id, bmp: out.bmp, heights: out.heights, water: out.water }, [out.bmp, out.heights.buffer, out.water.buffer]);
        else self.postMessage({ type: 'tile', id: m.id, bmp: out }, [out]);
      } catch (err) {
        self.postMessage({ type: 'tile', id: m.id, error: String(err && err.stack || err) });
      }
    }
  };
}
