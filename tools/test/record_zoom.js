// Smooth zoom for the demo video. Instead of stepping Leaflet through fractional zooms (whole-pixel
// rounding makes text shake), take one sharp screenshot per integer zoom level, large enough to cover
// every frame that uses it, and let compose_zoom.py build each frame by exact sub-pixel scaling and a
// crossfade between neighbouring levels. The UI is captured once, separately, and laid on top.
//   node tools/test/record_zoom.js [outDir=/tmp/me/zoom] [all|labels]
// Labels and pins are left out of the keyframes and drawn per frame on their own layer (constant size,
// exact sub-pixel positions, fading in and out), so text glides like on Google Maps.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const out = process.argv[2] || '/tmp/me/zoom', only = process.argv[3] || 'all';
  fs.mkdirSync(out, { recursive: true });
  const W = 1280, H = 720, FPS = 24, DSF = 2;
  // the label pass runs without GPU emulation: its compositor mangles semi-transparent text halos in
  // transparent screenshots (white halos came out black)
  const gl = only === 'labels' ? [] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--allow-file-access-from-files', ...gl] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DSF });
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto('file://' + path.resolve(__dirname, '../../web/index.html') + '#3/1000/1100/map');
  await page.waitForTimeout(4000);
  const idle = () => page.waitForFunction(() => document.querySelectorAll('.leaflet-tile').length > 0 && document.querySelectorAll('.leaflet-tile:not(.leaflet-tile-loaded)').length === 0, null, { timeout: 600000 }).catch(() => console.log('tile timeout'));

  // ---- the camera path (latlng = [south, east] map units), one entry per output frame
  const MT = [1380600, 1115500], start = [1100000, 1000000], z0 = 3.0915, z1 = 13.1;
  const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const frames = [];
  const nMap = Math.round(FPS * 1.6), nSat = FPS, nZoom = Math.round(FPS * 9), nHold = Math.round(FPS * 1.2);
  for (let i = 0; i < nMap + nSat; i++) frames.push({ c: start, z: z0, sat: i < nMap - 6 ? 0 : Math.min(1, (i - (nMap - 6)) / 12) });
  const za = frames[frames.length - 1].z;
  for (let i = 1; i <= nZoom; i++) {
    const t = ease(i / nZoom), z = za + (z1 - za) * t;
    const f = Math.pow(2, za - z) * (1 - ease(Math.min(1, (i / nZoom) / 0.7)));
    frames.push({ c: [MT[0] - (MT[0] - start[0]) * f, MT[1] - (MT[1] - start[1]) * f], z, sat: 1 });
  }
  for (let i = 0; i < nHold; i++) frames.push({ c: MT, z: z1 + i * 0.0012, sat: 1 });
  // levels used by each frame: round(z) and its neighbour inside a crossfade window around x.5
  const levelsOf = (z) => { const L = Math.floor(z); const f = z - L; if (f < 0.5) return [L]; return [L, L + 1]; };
  const minL = 3, maxL = Math.max(...frames.flatMap(f => levelsOf(f.z)));

  // ---- hide everything except the map for the keyframes
  const hideUI = (on) => page.evaluate((on) => {
    let st = document.getElementById('__rec'); if (!st) { st = document.createElement('style'); st.id = '__rec'; document.head.appendChild(st); }
    st.textContent = on ? 'body > *:not(#map){visibility:hidden !important} .leaflet-control-container, .leaflet-labels-pane, .leaflet-marker-pane, .leaflet-shadow-pane, .leaflet-tooltip-pane{visibility:hidden !important}' : '';
  }, on);
  await page.evaluate(() => {
    ME.map._fadeAnimated = false; ME.map.options.zoomSnap = 0;
    window.__cp = (ll) => ME.map.project(ll, ME.map.getZoom()).subtract(ME.map.getPixelOrigin()).add(ME.map._getMapPanePos());
  });

  const meta = { W, H, DSF, frames, levels: {} };
  const capture = async (L, mode, name) => {
    // bounding box (level-L pixels) of all frames that use this level
    const used = frames.map((f, i) => [f, i]).filter(([f]) => levelsOf(f.z).includes(L) && (mode === 'map' ? f.sat < 1 : f.sat > 0));
    if (!used.length) return;
    const pts = await page.evaluate(([cs, L]) => cs.map(c => { const p = ME.map.project(c, L); return [p.x, p.y]; }), [used.map(([f]) => f.c), L]);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    used.forEach(([f], k) => { const s = Math.pow(2, f.z - L), hw = W / 2 / s, hh = H / 2 / s; x0 = Math.min(x0, pts[k][0] - hw); x1 = Math.max(x1, pts[k][0] + hw); y0 = Math.min(y0, pts[k][1] - hh); y1 = Math.max(y1, pts[k][1] + hh); });
    const vw = Math.ceil(x1 - x0 + 64), vh = Math.ceil(y1 - y0 + 64);
    await page.setViewportSize({ width: vw, height: vh });
    await page.evaluate(([cx, cy, L, mode]) => { ME.setMode(mode); ME.map.invalidateSize({ animate: false }); ME.map.setView(ME.map.unproject([cx, cy], L), L, { animate: false }); }, [(x0 + x1) / 2, (y0 + y1) / 2, L, mode]);
    await page.waitForTimeout(500); await idle();
    if (L >= 12 && mode === 'satellite') await page.waitForFunction(() => { const im = document.querySelector('img.model-overlay'); return im && im.complete; }, null, { timeout: 1800000 }).catch(() => console.log('no overlay'));
    await page.waitForTimeout(1500); await idle();
    const cps = await page.evaluate((cs) => cs.map(c => { const p = __cp(c); return [p.x, p.y]; }), used.map(([f]) => f.c));
    await page.screenshot({ path: path.join(out, name + '.png'), timeout: 1800000 });
    meta.levels[name] = { L, mode, vw, vh, frames: Object.fromEntries(used.map(([, i], k) => [i, cps[k]])) };
    console.log('keyframe', name, vw + 'x' + vh, used.length, 'frames');
  };
  if (only === 'all') {
  await hideUI(true);
  await capture(3, 'map', 'map_3');
  for (let L = minL; L <= maxL; L++) await capture(L, 'satellite', 'sat_' + L);
  // ---- the UI on its own (transparent), once per mode, at the output size
  await hideUI(false);
  await page.setViewportSize({ width: W, height: H });
  for (const mode of ['map', 'satellite']) {
    await page.evaluate((mode) => { ME.setMode(mode); ME.map.invalidateSize({ animate: false }); ME.map.setView([1100000, 1000000], 3, { animate: false }); }, mode);
    await idle(); await page.waitForTimeout(2500);
    await page.evaluate(() => {
      let st = document.getElementById('__ui'); if (!st) { st = document.createElement('style'); st.id = '__ui'; document.head.appendChild(st); }
      st.textContent = 'html,body{background:transparent !important} #map .leaflet-pane{visibility:hidden !important} #map{background:transparent !important} .me-scale{visibility:hidden !important}';
    });
    await page.screenshot({ path: path.join(out, 'ui_' + mode + '.png'), omitBackground: true });
    await page.evaluate(() => { document.getElementById('__ui').textContent = ''; });
  }
  fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify(meta));
  }

  // ---- labels: positions and fade per frame (exact, from the projection), and one sprite per label.
  // compose_zoom.py places the sprites at sub-pixel positions: the browser snaps text to its pixel grid,
  // which made labels jitter even when positioned with fractional transforms.
  fs.mkdirSync(path.join(out, 'sprites'), { recursive: true });
  await page.setViewportSize({ width: W, height: H });
  await page.evaluate(() => {
    const map = ME.map;
    map.eachLayer(l => { if (l instanceof L.GridLayer || l instanceof L.ImageOverlay) map.removeLayer(l); });   // no tiles: fast
    if (ME3D && ME3D.OverlayLayer) map.eachLayer(l => { if (l instanceof ME3D.OverlayLayer) map.removeLayer(l); });
    window.__lab = new Map(); window.__html = new Map();
    window.__labels = (c, z) => {
      map.setView(c, z, { animate: false });
      const layer = Object.values(map._layers).find(l => l.els && l.items), seen = new Set();
      const byId = new Map(layer.items.map(it => [it.id, it]));
      for (const [id, el] of layer.els) {
        const it = byId.get(id); if (!it || !el.isConnected) continue;
        let e = __lab.get(id); if (!e) { e = { a: 0 }; __lab.set(id, e); }
        e.ll = [it.y, it.x]; seen.add(id);
        if (!__html.has(id)) __html.set(id, el.outerHTML);
      }
      const out = [];
      for (const [id, e] of __lab) {
        e.a = Math.max(0, Math.min(1, e.a + (seen.has(id) ? 1 : -1) / 8));
        if (e.a <= 0) { __lab.delete(id); continue; }
        // relative to the ideal view centre: Leaflet rounds its pixel origin, so map state snaps to whole pixels
        const p = map.project(e.ll, z).subtract(map.project(c, z)).add([map.getSize().x / 2, map.getSize().y / 2]);
        out.push([id, p.x, p.y, e.a]);
      }
      return out;
    };
  });
  const labelFrames = [];
  for (let i = 0; i < frames.length; i++) {
    labelFrames.push(await page.evaluate(([c, z]) => window.__labels(c, z), [frames[i].c, frames[i].z]));
    if (i % 48 === 0) console.log('labels', i, '/', frames.length);
  }
  // sprites: each label alone, anchored at (SX, SY) of a transparent page, once per map style it is shown in
  const SW = 1400, SH = 500, SX = 700, SY = 250;
  await page.setViewportSize({ width: SW, height: SH });
  await page.evaluate(([SX, SY]) => {
    const st = document.createElement('style'); st.id = '__lbl';
    st.textContent = 'html,body,#map{background:transparent !important} body > *:not(#map){visibility:hidden !important} #map .leaflet-pane, .leaflet-control-container{visibility:hidden !important} #__ov{position:absolute;inset:0;z-index:2000;pointer-events:none}';
    document.head.appendChild(st);
    const ov = document.createElement('div'); ov.id = '__ov'; document.getElementById('map').appendChild(ov);
    window.__sprite = (id, mode) => {
      const m = document.getElementById('map'); m.classList.toggle('mode-map', mode === 'map'); m.classList.toggle('mode-sat', mode !== 'map');
      ov.innerHTML = __html.get(id); const el = ov.firstChild; el.style.left = SX + 'px'; el.style.top = SY + 'px';
    };
  }, [SX, SY]);
  const need = { map: new Set(), satellite: new Set() };
  labelFrames.forEach((lf, i) => { const f = frames[i]; for (const [id] of lf) { if (f.sat < 1) need.map.add(id); if (f.sat > 0) need.satellite.add(id); } });
  const ids = {}; let n = 0;
  for (const mode of ['map', 'satellite']) for (const id of need[mode]) {
    const k = 's' + (n++); ids[mode + '|' + id] = k;
    await page.evaluate(([id, mode]) => window.__sprite(id, mode), [id, mode]);
    await page.screenshot({ path: path.join(out, 'sprites', k + '.png'), omitBackground: true });
  }
  fs.writeFileSync(path.join(out, 'labels.json'), JSON.stringify({ anchor: [SX, SY], dsf: DSF, sprites: ids, frames: labelFrames }));
  console.log('sprites', n);
  console.log('done', frames.length, 'frames');
  await browser.close();
})();
