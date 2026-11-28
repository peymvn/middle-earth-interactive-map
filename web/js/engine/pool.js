// Main-thread side of the renderer: loads terrain data tiles (JSONP-style <script> tags, so it
// works from file://), runs a pool of tile workers, and exposes a Leaflet GridLayer.
(function () {
  'use strict';
  const ME = window.ME = window.ME || {};
  const MAXZ = 6, TILE = 256;

  // ------------------------------------------------------------ terrain data tiles
  const tileCache = new Map();   // key -> b64 string
  const tileWait = new Map();    // key -> [resolve]
  window.MEterrain = function (key, b64) {
    tileCache.set(key, b64);
    if (tileCache.size > 500) tileCache.delete(tileCache.keys().next().value);
    const w = tileWait.get(key);
    if (w) { tileWait.delete(key); w.forEach(r => r(b64)); }
  };
  function loadTerrain(key) {
    if (tileCache.has(key)) return Promise.resolve(tileCache.get(key));
    return new Promise(resolve => {
      if (tileWait.has(key)) { tileWait.get(key).push(resolve); return; }
      tileWait.set(key, [resolve]);
      const s = document.createElement('script');
      s.src = `tiles/terrain/${key}.js`;
      s.async = true;
      s.onload = () => s.remove();
      s.onerror = () => { s.remove(); const w = tileWait.get(key); tileWait.delete(key); if (w) w.forEach(r => r(null)); };
      document.head.appendChild(s);
    });
  }
  ME.loadTerrain = loadTerrain;

  // ------------------------------------------------------------ workers
  const workers = [];
  const queue = [];
  let nextId = 1;
  const jobs = new Map();
  let readyResolve;
  ME.ready = new Promise(r => readyResolve = r);

  function start() {
    const src = `${MESettlements.toString()}\n(${MEWorker.toString()})();`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const n = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
    let ready = 0;
    const V = window.ME_VECTORS;
    const vectors = { rivers: V.rivers, roads: V.roads, sites: V.sites };
    for (let i = 0; i < n; i++) {
      const w = new Worker(url);
      w.busy = false;
      w.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'ready') { if (++ready === n) readyResolve(); return; }
        if (m.type === 'tile') {
          const job = jobs.get(m.id);
          jobs.delete(m.id);
          w.busy = false;
          if (job) { if (m.error) job.reject(new Error(m.error)); else job.resolve(m.heights ? { bmp: m.bmp, heights: m.heights, water: m.water } : m.bmp); }
          else if (m.bmp) m.bmp.close();
          pump();
        }
      };
      w.onerror = (e) => console.error('worker error', e.message);
      w.postMessage({ type: 'init', world: V.world, climate: window.ME_CLIMATE, vectors, settlements: window.ME_SETTLEMENTS, islands: window.ME_ISLANDS || [], relief: window.ME_RELIEF });
      workers.push(w);
    }
  }

  async function prepare(job) {
    if (job.patch) {
      // smallest-scale data tile (deepest level) that contains the whole patch plus padding
      const W = window.ME_VECTORS.world, { ox, oy, px, R } = job.patch, pad = 2 * px;
      for (let L = MAXZ; L >= 0; L--) {
        const t = W / (1 << L), dtx = Math.floor(ox / t), dty = Math.floor(oy / t);
        const dmu = t / TILE;
        if (ox - pad >= dtx * t - dmu && ox + R * px + pad <= (dtx + 1) * t + dmu && oy - pad >= dty * t - dmu && oy + R * px + pad <= (dty + 1) * t + dmu) {
          Object.assign(job, { L, dtx, dty, dataKey: `${L}/${dtx}/${dty}` });
          break;
        }
      }
      job.b64 = job.dataKey ? await loadTerrain(job.dataKey) : null;
      if (!job.b64) job.dataKey = null;
      return job;
    }
    const { z, x, y } = job;
    const n = 1 << z;
    if (x < 0 || y < 0 || x >= n || y >= n) return job;
    const L = Math.min(z, MAXZ);
    job.dataKey = `${L}/${x >> (z - L)}/${y >> (z - L)}`;
    const loads = [loadTerrain(job.dataKey)];
    // neighbouring max-level tiles let the settlement generator check for water near buildings
    const extra = [];
    if (z >= 9) {
      const W = window.ME_VECTORS.world, tmu = W / n, t6 = W / (1 << MAXZ), m = 6000;
      for (let ty = Math.floor((y * tmu - m) / t6); ty <= Math.floor(((y + 1) * tmu + m) / t6); ty++)
        for (let tx = Math.floor((x * tmu - m) / t6); tx <= Math.floor(((x + 1) * tmu + m) / t6); tx++) {
          if (tx < 0 || ty < 0 || tx >= 64 || ty >= 64) continue;
          const k = `${MAXZ}/${tx}/${ty}`;
          if (k !== job.dataKey) { extra.push(k); loads.push(loadTerrain(k)); }
        }
    }
    const res = await Promise.all(loads);
    job.b64 = res[0];
    if (!job.b64) job.dataKey = null;
    job.extra = extra.map((k, i) => ({ key: k, b64: res[i + 1] })).filter(e => e.b64);
    return job;
  }

  function pump() {
    for (const w of workers) {
      if (w.busy) continue;
      let job;
      while ((job = queue.shift()) && job.cancelled) job.reject(new Error('cancelled'));
      if (!job) return;
      w.busy = true;
      jobs.set(job.id, job);
      w.postMessage({ type: 'render', id: job.id, job: job.job });
    }
  }

  // render(spec) -> {promise, cancel}
  ME.render = function (spec) {
    const entry = { id: nextId++, cancelled: false };
    entry.promise = new Promise((resolve, reject) => { entry.resolve = resolve; entry.reject = reject; });
    ME.ready.then(() => prepare(Object.assign({}, spec))).then(job => {
      if (entry.cancelled) { entry.reject(new Error('cancelled')); return; }
      entry.job = job;
      queue.push(entry);
      pump();
    });
    entry.cancel = () => { entry.cancelled = true; };
    return entry;
  };

  // ------------------------------------------------------------ Leaflet layer
  ME.TerrainLayer = L.GridLayer.extend({
    options: { mode: 'satellite', opts: {}, keepBuffer: 3, updateWhenZooming: false },
    initialize(options) {
      L.GridLayer.prototype.initialize.call(this, options);
      this.on('tileunload', (e) => { if (e.tile._job) e.tile._job.cancel(); });
    },
    createTile(coords, done) {
      const tile = document.createElement('canvas');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      tile.width = tile.height = Math.round(TILE * dpr);
      const job = ME.render({ z: coords.z, x: coords.x, y: coords.y, dpr, mode: this.options.mode, opts: this.options.opts });
      tile._job = job;
      job.promise.then(bmp => {
        tile.getContext('2d').drawImage(bmp, 0, 0);
        bmp.close();
        done(null, tile);
      }).catch(err => { if (err.message !== 'cancelled') console.warn(err); done(null, tile); });
      return tile;
    },
  });

  // Terrain patch for the 3D viewer: satellite colours + heights (m) for R x R samples starting at
  // (ox, oy) map units, px map units apart. opts.models hides 2D drawings of modelled landmarks.
  ME.terrainPatch = function (ox, oy, px, R, opts) { // opts: { noRivers }
    return ME.render({ patch: { ox, oy, px, R }, dpr: 1, mode: 'satellite', opts: Object.assign({ models: true, patch: true }, opts) }).promise;
  };

  // Render an arbitrary view (for place-card photos and the layer-switch thumbnail)
  ME.snapshot = async function (mx, my, z, w, h, mode, opts) {
    const W = window.ME_VECTORS.world, n = 1 << z, scale = n * TILE / W;
    const cx = mx * scale, cy = my * scale;
    const x0 = cx - w / 2, y0 = cy - h / 2;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const tasks = [];
    for (let ty = Math.floor(y0 / TILE); ty <= Math.floor((y0 + h) / TILE); ty++)
      for (let tx = Math.floor(x0 / TILE); tx <= Math.floor((x0 + w) / TILE); tx++)
        tasks.push(ME.render({ z, x: tx, y: ty, dpr: 1, mode, opts: opts || {} }).promise.then(bmp => { ctx.drawImage(bmp, tx * TILE - x0, ty * TILE - y0); bmp.close(); }).catch(() => {}));
    await Promise.all(tasks);
    return c;
  };

  start();
})();
