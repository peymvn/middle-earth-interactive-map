// Put ports and river towns where the water actually is.
// Settlement points come from ME-GIS (traced from Tolkien's general map) but coastlines and rivers come
// from the Arda DEM, and the two disagree by a few km in places: Pelargir and Umbar stood in the sea,
// Osgiliath three miles from the Anduin, the Fords of Isen miles from the Isen. This moves the affected
// points in web/data/vectors.js using the map's own water mask (ME.terrainPatch) and river/road lines:
//   center   onto the river's centre line (towns astride a river, river islands)
//   crossing where a road crosses the river (fords and bridge towns), else the centre line
//   shore    onto the mainland shore, a quarter-mile inland (the drawn coast wanders a little with zoom),
//            if in the water, at the waterline or far from it; sea ports use the sea, Annúminas its lake
//   mouth    onto the shore at the river's mouth (Lond Daer)
// Idempotent; run after tools/build_vectors.py (rebuild_all.sh does).   node tools/fix_waterside.js
const path = require('path'), fs = require('fs');
const { chromium } = require(path.join(__dirname, 'test', 'node_modules', 'playwright'));
const RULES = [
  { kind: 'sites', n: 'Osgiliath', rule: 'center', river: ['Anduin'] },
  { kind: 'labels', n: 'Cair Andros', rule: 'center', river: ['Anduin'] },
  { kind: 'sites', n: 'Tharbad', rule: 'crossing', river: ['Gwathló', 'Mitheithel', 'Glanduin'] },
  { kind: 'labels', n: 'Fords of Isen', rule: 'crossing', river: ['Isen'] },
  { kind: 'labels', n: 'Sarn Ford', rule: 'crossing', river: ['Baranduin'] },
  { kind: 'sites', n: 'Lond Daer', rule: 'mouth', river: ['Gwathló'] },
  { kind: 'sites', n: 'Dol Amroth', rule: 'shore' },
  { kind: 'labels', n: 'Annúminas', rule: 'shore', water: 2 },
  { kind: 'sites', n: 'Umbar', rule: 'shore', inland: [12, 16] },   // narrow bay, its drawn coast wanders more
  // every other haven except the river quays of Minas Tirith (Harlond near the Anduin, handled in places.js)
  { kind: 'sites', haven: true, rule: 'shore' },
];
(async () => {
  const file = path.join(__dirname, '..', 'web', 'data', 'vectors.js');
  const src = fs.readFileSync(file, 'utf8');
  const head = src.slice(0, src.indexOf('{')), tail = src.slice(src.lastIndexOf('}') + 1);
  const V = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  await page.goto('file://' + path.resolve(__dirname, '../web/index.html') + '#3/1000/1100/map');
  await page.waitForFunction(() => window.ME && ME.terrainPatch && window.ME_VECTORS, null, { timeout: 60000 });
  await page.waitForTimeout(2000);
  const targets = [];
  for (const r of RULES) {
    const list = r.haven ? V.sites.filter(s => s.k === 'haven' && !(s.n === 'Harlond' && s.x > 1e6) && !RULES.some(q => q.n === s.n)) : V[r.kind].filter(s => s.n === r.n);
    for (const s of list) targets.push({ kind: r.kind, n: s.n, x: s.x, y: s.y, rule: r.rule, river: r.river || null, water: r.water || 1, inland: r.inland || [6, 10] });
  }
  const moves = await page.evaluate(async (targets) => {
    const V = window.ME_VECTORS;
    const segs = (lines) => { const out = []; for (const l of lines) for (let k = 2; k < l.p.length; k += 2) out.push([l.p[k - 2], l.p[k - 1], l.p[k], l.p[k + 1], l]); return out; };
    const near = (x, y, s) => { const [ax, ay, bx, by] = s, vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L2)); return [ax + t * vx, ay + t * vy, Math.hypot(x - ax - t * vx, y - ay - t * vy), t]; };
    const onRiver = (x, y, names) => { let best = null; for (const s of segs(V.rivers.filter(r => names.includes(r.n)))) { const p = near(x, y, s); if (!best || p[2] < best[2]) best = [...p, s]; } return best; };
    // Water grid (0 land, 1 sea, 2 lake) for an R x R area at full data resolution. A single terrain patch
    // that crosses a data-tile boundary falls back to much coarser data (coasts then wander by miles), so
    // the area is assembled from square patches that each stay inside one z6 tile; the thin seams between
    // tiles are filled from their neighbours.
    async function waterGrid(ox, oy, R, px) {
      const t6 = V.world / 64, m = 4 * px, g = new Uint8Array(R * R).fill(255);
      for (let ty = Math.floor(oy / t6); ty <= Math.floor((oy + R * px) / t6); ty++)
        for (let tx = Math.floor(ox / t6); tx <= Math.floor((ox + R * px) / t6); tx++) {
          const i0 = Math.max(0, Math.ceil((tx * t6 + m - ox) / px)), i1 = Math.min(R, Math.floor(((tx + 1) * t6 - m - ox) / px));
          const j0 = Math.max(0, Math.ceil((ty * t6 + m - oy) / px)), j1 = Math.min(R, Math.floor(((ty + 1) * t6 - m - oy) / px));
          if (i1 - i0 < 4 || j1 - j0 < 4) continue;
          const q = Math.min(i1 - i0, j1 - j0, 300);
          for (let j = j0; j < j1; j += q) for (let i = i0; i < i1; i += q) {
            const a = Math.min(i, i1 - q), b = Math.min(j, j1 - q);
            const r = await ME.terrainPatch(ox + a * px, oy + b * px, px, q); r.bmp.close();
            for (let y = 0; y < q; y++) for (let x = 0; x < q; x++) g[(b + y) * R + a + x] = r.water[y * q + x];
          }
        }
      // grow the real data into the seams one pixel per pass (reading the previous pass only, so values
      // cannot run along a seam), up/down first then left/right
      for (let pass = 0, left = 1; left && pass < 40; pass++) {
        left = 0; const o = g.slice();
        for (let k = 0; k < R * R; k++) if (o[k] === 255) {
          const i = k % R, j = (k / R) | 0;
          const nb = [j > 0 ? o[k - R] : 255, j < R - 1 ? o[k + R] : 255, i > 0 ? o[k - 1] : 255, i < R - 1 ? o[k + 1] : 255].find(v => v !== 255);
          if (nb !== undefined) g[k] = nb; else left++;
        }
      }
      return g;
    }
    // land pixels of the mainland (land touching the patch edge), 2..4 px from water, nearest to (x, y)
    async function shoreNear(x, y, ax, ay, kind, inland = [6, 10]) {
      const S = 24000, R = 600, px = S / R, ox = ax - S / 2, oy = ay - S / 2;
      const W = (await waterGrid(ox, oy, R, px)).map(v => v === kind ? 1 : 0), n = R * R, main = new Uint8Array(n), q = [];
      for (let i = 0; i < R; i++) for (const k of [i, (R - 1) * R + i, i * R, i * R + R - 1]) if (!W[k] && !main[k]) { main[k] = 1; q.push(k); }
      while (q.length) { const k = q.pop(), i = k % R, j = (k / R) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= R || b >= R) continue; const kk = b * R + a; if (!W[kk] && !main[kk]) { main[kk] = 1; q.push(kk); } } }
      const dist = new Int32Array(n).fill(1e9), bq = [];
      for (let k = 0; k < n; k++) if (W[k]) { dist[k] = 0; bq.push(k); }
      for (let h = 0; h < bq.length; h++) { const k = bq[h], i = k % R, j = (k / R) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= R || b >= R) continue; const kk = b * R + a; if (dist[kk] > dist[k] + 1) { dist[kk] = dist[k] + 1; bq.push(kk); } } }
      const ci = Math.round((x - ox) / px), cj = Math.round((y - oy) / px), here = ci >= 0 && cj >= 0 && ci < R && cj < R ? cj * R + ci : -1;
      let best = null, bd = 1e18;
      for (let k = 0; k < n; k++) if (main[k] && dist[k] >= inland[0] && dist[k] <= inland[1]) { const i = k % R, j = (k / R) | 0, d = (i - ci) ** 2 + (j - cj) ** 2; if (d < bd) { bd = d; best = [ox + (i + 0.5) * px, oy + (j + 0.5) * px]; } }
      return { best, inWater: here >= 0 && W[here] === 1, toWater: here >= 0 ? dist[here] * px : 1e9 };
    }
    const out = [];
    for (const t of targets) {
      let to = null, note = '';
      if (t.rule === 'center') { const p = onRiver(t.x, t.y, t.river); if (p && p[2] > 60) { to = [p[0], p[1]]; note = 'river centre'; } }
      else if (t.rule === 'crossing') {
        const rs = segs(V.rivers.filter(r => t.river.includes(r.n))), ds = segs(V.roads);
        let best = null;
        for (const a of rs) {
          if (near(t.x, t.y, a)[2] > 40000) continue;
          for (const b of ds) {
            const [x1, y1, x2, y2] = a, [x3, y3, x4, y4] = b, den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4); if (!den) continue;
            const u = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den, v = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
            if (u < 0 || u > 1 || v < 0 || v > 1) continue;
            const px = x1 + u * (x2 - x1), py = y1 + u * (y2 - y1), d = Math.hypot(px - t.x, py - t.y);
            if (!best || d < best[2]) best = [px, py, d];
          }
        }
        if (best && best[2] < 25000) { if (best[2] > 60) { to = [best[0], best[1]]; note = 'road crosses ' + t.river[0]; } }
        else { const p = onRiver(t.x, t.y, t.river); if (p && p[2] > 60) { to = [p[0], p[1]]; note = 'no road crossing nearby: river centre'; } }
      } else if (t.rule === 'shore') {
        const s = await shoreNear(t.x, t.y, t.x, t.y, t.water, t.inland);
        if (s.best && (s.inWater || s.toWater < t.inland[0] * 40 - 40 || s.toWater > 600)) { to = s.best; note = s.inWater ? 'was in the water' : `was ${Math.round(s.toWater)} mu from the water`; }
      } else if (t.rule === 'mouth') {
        // walk the river downstream from the town to the first point in the water: that is the mouth
        const p = onRiver(t.x, t.y, t.river); const line = p[4][4], pts = line.p;
        const S = 24000, R = 600, px = S / R, ox = t.x - S / 2, oy = t.y - S / 2;
        const wg = await waterGrid(ox, oy, R, px);
        const wet = (x, y) => { const i = Math.floor((x - ox) / px), j = Math.floor((y - oy) / px); return i >= 0 && j >= 0 && i < R && j < R && wg[j * R + i] === 1; };
        let mouth = null;
        for (let k = 2; k < pts.length; k += 2) if (!wet(pts[k - 2], pts[k - 1]) && wet(pts[k], pts[k + 1])) { const d = Math.hypot(pts[k] - t.x, pts[k + 1] - t.y); if (!mouth || d < mouth[2]) mouth = [pts[k - 2], pts[k - 1], d]; }
        if (mouth) { const s = await shoreNear(mouth[0], mouth[1], t.x, t.y, 1); if (s.best && Math.hypot(s.best[0] - t.x, s.best[1] - t.y) > 300) { to = s.best; note = 'mouth of the ' + t.river[0]; } }
      }
      if (to) out.push({ kind: t.kind, n: t.n, from: [t.x, t.y], to: [Math.round(to[0]), Math.round(to[1])], note });
    }
    return out;
  }, targets);
  for (const m of moves) {
    const s = V[m.kind].find(e => e.n === m.n && e.x === m.from[0] && e.y === m.from[1]);
    s.x = m.to[0]; s.y = m.to[1];
    console.log(`${m.n.padEnd(14)} ${m.note.padEnd(34)} moved ${(Math.hypot(m.to[0] - m.from[0], m.to[1] - m.from[1]) / 1000).toFixed(1)} mi -> km [${(m.to[0] / 1000).toFixed(1)}, ${(m.to[1] / 1000).toFixed(1)}]`);
  }
  fs.writeFileSync(file, head + JSON.stringify(V) + tail);
  console.log(moves.length, 'points moved');
  await browser.close();
})();
