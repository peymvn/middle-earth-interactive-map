// Journey routing: turns the waypoint lists in data/journeys.js into realistic, smooth paths.
//
// Each leg between two waypoints is routed, in order of preference:
//   1. along the road network (ME-GIS roads, Dijkstra) if a road route exists that isn't a big detour;
//   2. along a river, for legs marked as boat journeys ({ by: 'river' } in journeys.js);
//   3. cross-country: a centripetal Catmull-Rom curve through the waypoints with a gentle,
//      deterministic wander, so overland stretches don't look ruler-straight.
// The whole route is then smoothed (Chaikin corner cutting) so corners become curves.
(function () {
  'use strict';
  const ME = window.ME = window.ME || {};
  const V = window.ME_VECTORS;
  const SNAP = 450;      // mu: endpoints this close are treated as joined
  const CELL = 2000;

  function buildGraph(lines) {
    const pts = [];        // [x, y]
    const adj = [];        // [[j, w], ...]
    const grid = new Map();
    const key = (x, y) => Math.floor(x / CELL) + ':' + Math.floor(y / CELL);
    function near(x, y, r) {
      let best = -1, bd = r;
      const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL), k = Math.ceil(r / CELL);
      for (let a = -k; a <= k; a++) for (let b = -k; b <= k; b++) {
        const c = grid.get((gx + a) + ':' + (gy + b)); if (!c) continue;
        for (const i of c) { const d = Math.hypot(pts[i][0] - x, pts[i][1] - y); if (d < bd) { bd = d; best = i; } }
      }
      return best;
    }
    function add(x, y, snap) {
      if (snap) { const i = near(x, y, SNAP); if (i >= 0) return i; }
      const i = pts.length; pts.push([x, y]); adj.push([]);
      const k = key(x, y); let c = grid.get(k); if (!c) grid.set(k, c = []); c.push(i);
      return i;
    }
    function link(a, b) { if (a === b) return; const w = Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]); adj[a].push([b, w]); adj[b].push([a, w]); }
    for (const f of lines) {
      const p = f.p; let prev = -1;
      for (let i = 0; i < p.length; i += 2) {
        const end = i === 0 || i === p.length - 2;
        const id = add(p[i], p[i + 1], end);
        if (prev >= 0) link(prev, id);
        prev = id;
      }
    }
    // Dangling ends that stop at (or just short of) the middle of another line - T-junctions, which
    // the GIS data has everywhere - are joined by splitting that line's segment at the closest point.
    const segs = [];
    for (let i = 0; i < pts.length; i++) for (const [j] of adj[i]) if (j > i) segs.push([i, j]);
    const sgrid = new Map();
    segs.forEach((sg, n) => {
      const [a, b] = sg, x0 = Math.min(pts[a][0], pts[b][0]), x1 = Math.max(pts[a][0], pts[b][0]), y0 = Math.min(pts[a][1], pts[b][1]), y1 = Math.max(pts[a][1], pts[b][1]);
      for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) for (let gy = Math.floor(y0 / CELL); gy <= Math.floor(y1 / CELL); gy++) { const kk = gx + ':' + gy; let c = sgrid.get(kk); if (!c) sgrid.set(kk, c = []); c.push(n); }
    });
    // Lines that cross without a shared vertex (also common in the GIS data): add a node at every
    // crossing and chain each crossed segment through it.
    const splits = new Map();
    const seen = new Set();
    for (const cell of sgrid.values()) for (let u = 0; u < cell.length; u++) for (let v = u + 1; v < cell.length; v++) {
      const n1 = cell[u], n2 = cell[v], key = n1 < n2 ? n1 * 1e6 + n2 : n2 * 1e6 + n1;
      if (seen.has(key)) continue; seen.add(key);
      const [a1, b1] = segs[n1], [a2, b2] = segs[n2];
      if (a1 === a2 || a1 === b2 || b1 === a2 || b1 === b2) continue;
      const p1 = pts[a1], q1 = pts[b1], p2 = pts[a2], q2 = pts[b2];
      const d1x = q1[0] - p1[0], d1y = q1[1] - p1[1], d2x = q2[0] - p2[0], d2y = q2[1] - p2[1];
      const den = d1x * d2y - d1y * d2x; if (Math.abs(den) < 1e-9) continue;
      const t = ((p2[0] - p1[0]) * d2y - (p2[1] - p1[1]) * d2x) / den, w = ((p2[0] - p1[0]) * d1y - (p2[1] - p1[1]) * d1x) / den;
      if (t <= 0 || t >= 1 || w <= 0 || w >= 1) continue;
      const m = add(p1[0] + d1x * t, p1[1] + d1y * t, false);
      for (const [n, tt] of [[n1, t], [n2, w]]) { let l = splits.get(n); if (!l) splits.set(n, l = []); l.push([tt, m]); }
    }
    for (const [n, l] of splits) { l.sort((x, y) => x[0] - y[0]); let prev = segs[n][0]; for (const [, m] of l) { link(prev, m); prev = m; } link(prev, segs[n][1]); }
    const JOIN = 1500;
    const dangling = []; for (let i = 0; i < pts.length; i++) if (adj[i].length === 1) dangling.push(i);
    for (const i of dangling) {
      const [x, y] = pts[i], gx = Math.floor(x / CELL), gy = Math.floor(y / CELL);
      let best = null, bd = JOIN;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const n of sgrid.get((gx + a) + ':' + (gy + b)) || []) {
        const [p, q] = segs[n]; if (p === i || q === i || p === adj[i][0][0] || q === adj[i][0][0]) continue;
        const ax = pts[p][0], ay = pts[p][1], dx = pts[q][0] - ax, dy = pts[q][1] - ay, L2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)), px = ax + dx * t, py = ay + dy * t, d = Math.hypot(px - x, py - y);
        if (d < bd) { bd = d; best = { n, t, px, py }; }
      }
      if (!best) continue;
      const [p, q] = segs[best.n];
      let m;
      if (best.t < 0.02) m = p; else if (best.t > 0.98) m = q;
      else { m = add(best.px, best.py, false); link(p, m); link(m, q); }  // the old p-q edge stays: harmless
      link(i, m);
    }
    return { pts, adj, near };
  }

  function dijkstra(g, s, t, limit) {
    const dist = new Float64Array(g.pts.length).fill(Infinity), prev = new Int32Array(g.pts.length).fill(-1);
    const heap = [[0, s]]; dist[s] = 0;
    const tx = g.pts[t][0], ty = g.pts[t][1];
    while (heap.length) {
      // binary heap pop
      const top = heap[0], last = heap.pop();
      if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } }
      const [f, u] = top;
      if (u === t) break;
      const du = dist[u];
      if (f - Math.hypot(g.pts[u][0] - tx, g.pts[u][1] - ty) > du + 1) continue; // stale (A*)
      if (du > limit) return null;
      for (const [v, w] of g.adj[u]) {
        const nd = du + w;
        if (nd < dist[v]) {
          dist[v] = nd; prev[v] = u;
          heap.push([nd + Math.hypot(g.pts[v][0] - tx, g.pts[v][1] - ty), v]);
          let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
        }
      }
    }
    if (!isFinite(dist[t])) return null;
    const path = []; for (let u = t; u >= 0; u = prev[u]) path.push(g.pts[u]);
    return { path: path.reverse(), len: dist[t] };
  }

  let roads = null, rivers = null;
  const graph = (kind) => kind === 'river'
    ? (rivers = rivers || buildGraph(V.rivers.filter(r => r.w[1] > 60)))
    : (roads = roads || buildGraph(V.roads));

  function routeOn(kind, a, b) {
    const g = graph(kind);
    const reach = kind === 'river' ? 8000 : 9000;
    const s = g.near(a[0], a[1], reach), t = g.near(b[0], b[1], reach);
    if (s < 0 || t < 0 || s === t) return null;
    const direct = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const r = dijkstra(g, s, t, direct * 2.2 + 30000);
    if (!r) return null;
    const detour = kind === 'river' ? 2.2 : 1.45;
    if (r.len > direct * detour + 15000) return null;
    return [a, ...r.path, b];
  }

  // deterministic gentle wander for cross-country legs
  function wander(a, b, seed) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(2, Math.ceil(L / 6000));
    const nx = -(b[1] - a[1]) / (L || 1), ny = (b[0] - a[0]) / (L || 1);
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const env = Math.sin(Math.PI * t);
      const off = env * L * 0.035 * (Math.sin(t * 5.1 + seed) * 0.7 + Math.sin(t * 11.3 + seed * 1.7) * 0.3);
      out.push([a[0] + (b[0] - a[0]) * t + nx * off, a[1] + (b[1] - a[1]) * t + ny * off]);
    }
    return out;
  }

  // centripetal Catmull-Rom through points (keeps curves tight, no overshoot loops)
  function catmull(P, step) {
    if (P.length < 3) return P;
    const out = [P[0]];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      const d = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const n = Math.max(1, Math.ceil(d / step));
      const t01 = Math.pow(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1, 0.5), t12 = Math.pow(d || 1, 0.5), t23 = Math.pow(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]) || 1, 0.5);
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        const m1 = [0, 1].map(c => (p2[c] - p1[c]) + t12 * ((p1[c] - p0[c]) / t01 - (p2[c] - p0[c]) / (t01 + t12)));
        const m2 = [0, 1].map(c => (p2[c] - p1[c]) + t12 * ((p3[c] - p2[c]) / t23 - (p3[c] - p1[c]) / (t12 + t23)));
        const t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map(c => (2 * t3 - 3 * t2 + 1) * p1[c] + (t3 - 2 * t2 + t) * m1[c] + (-2 * t3 + 3 * t2) * p2[c] + (t3 - t2) * m2[c]));
      }
    }
    return out;
  }

  function chaikin(P, iters) {
    for (let it = 0; it < iters; it++) {
      if (P.length < 3) return P;
      const out = [P[0]];
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], b = P[i + 1];
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      out.push(P[P.length - 1]);
      P = out;
    }
    return P;
  }

  function dedupe(P, minD) {
    const out = [P[0]];
    for (const p of P) { const q = out[out.length - 1]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= minD) out.push(p); }
    if (out[out.length - 1] !== P[P.length - 1]) out.push(P[P.length - 1]);
    return out;
  }

  // stops: [{x, y, by}] where `by` (on the destination stop) is 'road' (default: road if possible),
  // 'river', or 'foot' (never use roads). Returns {path: [[x,y]...], legs: [{by, from, to}]}.
  ME._routes = { graph, routeOn, dijkstra };
  ME.routeJourney = function (stops, seed) {
    let path = [], legs = [], pending = [];  // pending: consecutive cross-country points
    const flush = () => {
      if (pending.length > 1) {
        let P = [];
        for (let i = 0; i < pending.length - 1; i++) { const w = wander(pending[i], pending[i + 1], seed + i * 3.1); P.push(...(i ? w.slice(1) : w)); }
        P = catmull(dedupe(P, 1500), 1200);
        path.push(...(path.length ? P.slice(1) : P));
      }
      pending = [];
    };
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i], p = [s.x, s.y];
      if (i === 0) { pending.push(p); continue; }
      const a = [stops[i - 1].x, stops[i - 1].y];
      const by = s.by || 'auto';
      const seg = by === 'foot' ? null : by === 'river' ? routeOn('river', a, p) : routeOn('road', a, p);
      if (seg) {
        if (!pending.length) pending.push(a);
        flush();
        const S = chaikin(dedupe(seg, 300), 3);
        path.push(...(path.length ? S.slice(1) : S));
        legs.push({ by: by === 'river' ? 'river' : 'road', from: i - 1, to: i });
        pending = [p];
      } else {
        if (!pending.length) pending.push(a);
        pending.push(p);
        legs.push({ by: 'foot', from: i - 1, to: i });
      }
    }
    flush();
    return { path: chaikin(dedupe(path, 200), 1), legs };
  };
})();
