// Modelling kit for the 3D landmarks: procedural textures, materials and reusable parts (houses
// with real roofs, towers, walls, arch bridges, trees, rocks, water, fire, smoke). Units are metres;
// x = east, y = up, z = south. Everything is generated in code: no external assets.
(function () {
  'use strict';
  const ME3D = window.ME3D = window.ME3D || {};
  const T = THREE;

  // ---------------------------------------------------------------- seeded random
  function rng(seed) {
    let a = seed >>> 0 || 1;
    const f = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    f.r = (a, b) => a + (b - a) * f();
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    return f;
  }
  ME3D.rng = rng;

  // ---------------------------------------------------------------- procedural textures
  const texCache = new Map();
  function canvasTex(key, w, h, draw, rep) {
    if (texCache.has(key)) return texCache.get(key);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    draw(g, w, h, rng(key.length * 7919 + w));
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    if (rep) t.repeat.set(rep[0], rep[1]);
    texCache.set(key, t);
    return t;
  }
  const hex = (c, k = 1) => { const n = new T.Color(c); return `rgb(${Math.min(255, n.r * 255 * k) | 0},${Math.min(255, n.g * 255 * k) | 0},${Math.min(255, n.b * 255 * k) | 0})`; };
  function speckle(g, w, h, R, n, cols, size) {
    for (let i = 0; i < n; i++) { g.fillStyle = R.pick(cols); g.globalAlpha = R.r(0.05, 0.25); const s = R.r(size * 0.3, size); g.fillRect(R() * w, R() * h, s, s); }
    g.globalAlpha = 1;
  }
  const TEX = {
    // dressed stone blocks (ashlar)
    ashlar: (col = '#d9d6cc', mortar = '#a9a59a', bw = 64, bh = 32) => canvasTex(`ashlar${col}${bw}`, 256, 256, (g, w, h, R) => {
      g.fillStyle = mortar; g.fillRect(0, 0, w, h);
      for (let y = 0, row = 0; y < h; y += bh, row++) for (let x = -(row % 2) * bw / 2; x < w; x += bw) {
        g.fillStyle = hex(col, R.r(0.88, 1.06)); g.fillRect(x + 2, y + 2, bw - 3, bh - 3);
      }
      speckle(g, w, h, R, 900, ['#000', '#fff', '#776'], 4);
    }),
    // rough stone
    rock: (col = '#77716a') => canvasTex(`rock${col}`, 256, 256, (g, w, h, R) => {
      g.fillStyle = col; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { g.fillStyle = hex(col, R.r(0.7, 1.25)); g.globalAlpha = 0.35; g.beginPath(); g.ellipse(R() * w, R() * h, R.r(4, 30), R.r(3, 14), R() * 3, 0, 7); g.fill(); }
      g.globalAlpha = 0.5; g.strokeStyle = hex(col, 0.55);
      for (let i = 0; i < 40; i++) { g.lineWidth = R.r(0.5, 2); g.beginPath(); let x = R() * w, y = R() * h; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += R.r(-20, 20); y += R.r(-6, 20); g.lineTo(x, y); } g.stroke(); }
      g.globalAlpha = 1; speckle(g, w, h, R, 1200, ['#000', '#fff'], 3);
    }),
    // clay roof tiles in rows
    tiles: (col = '#9a5a3c') => canvasTex(`tiles${col}`, 128, 128, (g, w, h, R) => {
      for (let y = 0; y < h; y += 8) for (let x = (y / 8 % 2) * 6; x < w; x += 12) {
        g.fillStyle = hex(col, R.r(0.8, 1.12)); g.fillRect(x, y, 11, 8);
        g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x, y + 6, 11, 2);
      }
    }),
    // slate
    slate: (col = '#59606b') => canvasTex(`slate${col}`, 128, 128, (g, w, h, R) => {
      for (let y = 0; y < h; y += 6) for (let x = (y / 6 % 2) * 5; x < w; x += 10) {
        g.fillStyle = hex(col, R.r(0.82, 1.15)); g.fillRect(x, y, 9.5, 6);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x, y + 5, 9.5, 1);
      }
    }),
    // thatch: thousands of straw strokes
    thatch: (col = '#b9944f') => canvasTex(`thatch${col}`, 256, 256, (g, w, h, R) => {
      g.fillStyle = hex(col, 0.7); g.fillRect(0, 0, w, h);
      for (let i = 0; i < 5000; i++) { g.strokeStyle = hex(col, R.r(0.6, 1.25)); g.lineWidth = R.r(0.6, 1.6); const x = R() * w, y = R() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + R.r(-2, 2), y + R.r(6, 16)); g.stroke(); }
      for (let y = 0; y < h; y += 32) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, y, w, 3); }
    }),
    planks: (col = '#7a5a3a') => canvasTex(`planks${col}`, 128, 128, (g, w, h, R) => {
      for (let x = 0; x < w; x += 16) { g.fillStyle = hex(col, R.r(0.8, 1.15)); g.fillRect(x, 0, 15, h); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 15, 0, 1, h); }
      for (let i = 0; i < 300; i++) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(R() * w, R() * h, 1, R.r(4, 20)); }
    }),
    // grass with flower specks
    grass: (col = '#5d7d3a', flowers) => canvasTex(`grass${col}${flowers}`, 256, 256, (g, w, h, R) => {
      g.fillStyle = col; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 6000; i++) { g.fillStyle = hex(col, R.r(0.7, 1.3)); g.fillRect(R() * w, R() * h, 1, R.r(2, 5)); }
      if (flowers) for (let i = 0; i < 400; i++) { g.fillStyle = R.pick(flowers); g.fillRect(R() * w, R() * h, 2, 2); }
    }),
    bark: (col = '#5a4632') => canvasTex(`bark${col}`, 64, 256, (g, w, h, R) => {
      g.fillStyle = col; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 120; i++) { g.strokeStyle = hex(col, R.r(0.5, 1.3)); g.lineWidth = R.r(1, 3); const x = R() * w; g.beginPath(); g.moveTo(x, 0); for (let y = 0; y < h; y += 16) g.lineTo(x + R.r(-3, 3), y); g.stroke(); }
    }),
    // Doors of Durin: ithildin lines on dark stone (emissive map)
    durin: () => canvasTex('durin', 512, 512, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#cfe8ff'; g.lineWidth = 5; g.shadowColor = '#9fd0ff'; g.shadowBlur = 18;
      const arch = () => { g.beginPath(); g.moveTo(80, 512); g.lineTo(80, 210); g.arc(256, 210, 176, Math.PI, 0); g.lineTo(432, 512); g.stroke(); };
      arch(); g.lineWidth = 3;
      g.beginPath(); g.moveTo(110, 512); g.lineTo(110, 220); g.arc(256, 220, 146, Math.PI, 0); g.lineTo(402, 512); g.stroke();
      // two trees (the Trees of the High Elves)
      for (const tx of [150, 362]) {
        g.beginPath(); g.moveTo(tx, 500); g.lineTo(tx, 250); g.stroke();
        for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(tx, 290 + k * 30); g.quadraticCurveTo(tx + (tx < 256 ? -26 : 26), 270 + k * 30, tx + (tx < 256 ? -34 : 34), 240 + k * 30); g.stroke(); g.beginPath(); g.moveTo(tx, 290 + k * 30); g.quadraticCurveTo(tx + (tx < 256 ? 22 : -22), 272 + k * 30, tx + (tx < 256 ? 30 : -30), 248 + k * 30); g.stroke(); }
      }
      // anvil & hammer, crown and seven stars, star of Fëanor
      g.strokeRect(226, 330, 60, 22); g.beginPath(); g.moveTo(240, 352); g.lineTo(236, 380); g.lineTo(276, 380); g.lineTo(272, 352); g.stroke();
      g.beginPath(); g.moveTo(232, 300); g.lineTo(240, 282); g.lineTo(248, 296); g.lineTo(256, 278); g.lineTo(264, 296); g.lineTo(272, 282); g.lineTo(280, 300); g.closePath(); g.stroke();
      for (let k = 0; k < 7; k++) { const a = Math.PI * (0.15 + 0.7 * k / 6); g.beginPath(); g.arc(256 - Math.cos(a) * 70, 250 - Math.sin(a) * 60, 4, 0, 7); g.stroke(); }
      g.save(); g.translate(256, 440);
      for (let k = 0; k < 8; k++) { g.rotate(Math.PI / 4); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 30); g.stroke(); }
      g.restore();
      g.font = 'italic 22px serif'; g.fillStyle = '#cfe8ff'; g.textAlign = 'center';
      g.fillText('Ennyn Durin Aran Moria: pedo mellon a minno', 256, 120);
    }),
  };
  ME3D.TEX = TEX;

  // ---------------------------------------------------------------- materials
  const matCache = new Map();
  const KITNAME = { whiteStone: 'whiteStone', greyStone: 'greyStone', darkStone: 'darkStone', obsidian: 'obsidian', rock: 'rock', tiles: 'tiles', slate: 'slate', thatch: 'thatch', planks: 'planks', plaster: 'plaster', bark: 'bark' };
  function mat(key, make) {
    if (!matCache.has(key)) {
      const base = Object.keys(KITNAME).find(k => key === k || key.startsWith(k + '#'));
      const km = base && ME3D.kitMats && ME3D.kitMats[KITNAME[base]];
      if (km) {
        // a tinted copy keeps the photographed texture but lets callers vary the colour a little
        const tint = key.slice(base.length);
        let m = km;
        if (tint && /^#/.test(tint) && base !== 'bark') {
          const c = new T.Color(tint), l = (c.r + c.g + c.b) / 3 || 1, k = 0.75 / Math.max(0.25, l);
          m = km.clone(); m.color.setRGB(Math.min(1.25, 0.5 + 0.5 * c.r * k), Math.min(1.25, 0.5 + 0.5 * c.g * k), Math.min(1.25, 0.5 + 0.5 * c.b * k));
        }
        matCache.set(key, m);
      } else matCache.set(key, make());
    }
    return matCache.get(key);
  }
  ME3D.resetMats = () => matCache.clear();
  const std = (o) => new T.MeshStandardMaterial(Object.assign({ roughness: 0.9, metalness: 0 }, o));
  const MAT = {
    whiteStone: () => mat('whiteStone', () => std({ map: TEX.ashlar('#e4e1d8', '#b8b3a6'), roughness: 0.85 })),
    greyStone: () => mat('greyStone', () => std({ map: TEX.ashlar('#a7a296', '#7b766b') })),
    darkStone: () => mat('darkStone', () => std({ map: TEX.ashlar('#5e5a56', '#3a3734', 48, 28), roughness: 0.75, metalness: 0.1 })),
    obsidian: () => mat('obsidian', () => std({ map: TEX.rock('#56565e'), color: '#c4c4cc', roughness: 0.38, metalness: 0.35, flatShading: true })),
    rock: (c = '#7a746c') => mat('rock' + c, () => std({ map: TEX.rock(c), flatShading: true })),
    tiles: (c) => mat('tiles' + c, () => std({ map: TEX.tiles(c), roughness: 0.8 })),
    slate: (c) => mat('slate' + c, () => std({ map: TEX.slate(c), roughness: 0.7 })),
    thatch: (c) => mat('thatch' + c, () => std({ map: TEX.thatch(c) })),
    planks: (c) => mat('planks' + c, () => std({ map: TEX.planks(c) })),
    plaster: (c = '#e8dcc2') => mat('plaster' + c, () => std({ color: c, roughness: 0.95 })),
    // grass: the photographed meadow (web/models/ground.js) tinted toward the caller's colour, else drawn
    grass: (c = '#5d7d3a', fl) => mat('grass' + c + fl, () => {
      const gt = ME3D.groundTex;
      if (!gt || !gt.meadow) return std({ map: TEX.grass(c, fl) });
      const col = new T.Color(c), l = (col.r + col.g + col.b) / 3 || 1, k = 0.9 / Math.max(0.2, l);
      const m = std({ map: gt.meadow, color: new T.Color(Math.min(1.3, 0.35 + 0.65 * col.r * k), Math.min(1.3, 0.35 + 0.65 * col.g * k), Math.min(1.3, 0.35 + 0.65 * col.b * k)), roughness: 0.95 });
      m.name = 'meadow'; return m;
    }),
    bark: (c) => mat('bark' + c, () => std({ map: TEX.bark(c) })),
    leaf: (c) => mat('leaf' + c, () => std({ color: c, flatShading: true, roughness: 0.8 })),
    gold: () => mat('gold', () => std({ color: '#d8a93a', metalness: 0.85, roughness: 0.3 })),
    brass: () => mat('brass', () => std({ color: '#c8a050', metalness: 0.9, roughness: 0.25 })),
    paint: (c) => mat('paint' + c, () => std({ color: c, roughness: 0.5 })),
    water: () => mat('water', () => waterMat()),
    glow: (c, i = 2) => mat('glow' + c + i, () => new T.MeshStandardMaterial({ color: '#000', emissive: c, emissiveIntensity: i })),
    lava: () => mat('lava', () => new T.MeshStandardMaterial({ color: '#200', emissive: '#ff5a10', emissiveIntensity: 2.2, roughness: 1 })),
  };
  ME3D.MAT = MAT;

  // ---------------------------------------------------------------- geometry helpers
  const mesh = (geo, m, cast = true, recv = true) => { const o = new T.Mesh(geo, m); o.castShadow = cast; o.receiveShadow = recv; return o; };
  ME3D.mesh = mesh;
  // a prism roof (gable) as an extruded triangle, with eaves overhang
  function gableRoof(w, d, h, m, over = 0.6) {
    const s = new T.Shape(); s.moveTo(-w / 2 - over, 0); s.lineTo(0, h); s.lineTo(w / 2 + over, 0); s.lineTo(-w / 2 - over, 0);
    const g = new T.ExtrudeGeometry(s, { depth: d + 2 * over, bevelEnabled: false });
    g.translate(0, 0, -(d + 2 * over) / 2);
    // UVs: scale so the texture tiles at ~1 m
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 3, uv.getY(i) / 3);
    return mesh(g, m);
  }
  // hip roof: 4-sided pyramid stretched over the footprint, with flared eaves
  function hipRoof(w, d, h, m, over = 0.5) {
    const g = new T.ConeGeometry(Math.SQRT1_2, 1, 4, 1, false, Math.PI / 4);
    g.scale(w + 2 * over, h, d + 2 * over); g.translate(0, h / 2, 0);
    g.computeVertexNormals();
    return mesh(g, m);
  }
  // a house: walls (plaster/stone/planks) + roof (gable or hip), optional chimney
  function house(o) {
    const g = new T.Group();
    const { w = 8, d = 10, h = 5, roof = 'gable', roofH = w * 0.55, wallMat = MAT.plaster(), roofMat = MAT.tiles('#9a5a3c'), chimney = false } = o;
    const body = mesh(new T.BoxGeometry(w, h, d), wallMat); body.position.y = h / 2; g.add(body);
    const r = roof === 'hip' ? hipRoof(w, d, roofH, roofMat) : roof === 'flat' ? mesh(new T.BoxGeometry(w + 0.4, 0.6, d + 0.4), roofMat) : gableRoof(w, d, roofH, roofMat);
    r.position.y = h + (roof === 'flat' ? 0.3 : 0); g.add(r);
    if (chimney) { const c = mesh(new T.BoxGeometry(0.9, roofH + 1.5, 0.9), MAT.greyStone()); c.position.set(w * 0.25, h + roofH / 2 + 0.6, d * 0.25); g.add(c); }
    // door & windows hint on the long side (south)
    const door = mesh(new T.BoxGeometry(1.1, 2, 0.15), MAT.planks('#5a3b22'), false); door.position.set(0, 1, d / 2 + 0.05); g.add(door);
    for (const sx of [-w * 0.3, w * 0.3]) { const win = mesh(new T.BoxGeometry(0.9, 0.9, 0.12), MAT.paint('#2a2f38'), false); win.position.set(sx, h * 0.62, d / 2 + 0.05); g.add(win); }
    return g;
  }
  function tower(o) {
    const { r = 6, h = 30, m = MAT.greyStone(), roof = 'cone', roofMat = MAT.slate('#4d545e'), crenel = true, sides = 16 } = o;
    const g = new T.Group();
    const body = mesh(new T.CylinderGeometry(r * 0.92, r, h, sides), m); body.position.y = h / 2; g.add(body);
    if (roof === 'cone') { const c = mesh(new T.ConeGeometry(r * 1.15, r * 2.2, sides), roofMat); c.position.y = h + r * 1.1; g.add(c); }
    if (crenel) for (let k = 0; k < sides; k += 2) { const a = k / sides * Math.PI * 2; const b = mesh(new T.BoxGeometry(r * 0.3, r * 0.35, r * 0.3), m); b.position.set(Math.cos(a) * r * 0.9, h + r * 0.17, Math.sin(a) * r * 0.9); g.add(b); }
    return g;
  }
  // crenellated wall along a polyline [[x,z],...] following the ground
  function wall(pts, o, ground) {
    const { h = 10, t = 3, m = MAT.greyStone(), merlons = true, closed = false } = o;
    const g = new T.Group();
    const P = closed ? pts.concat([pts[0]]) : pts;
    for (let i = 1; i < P.length; i++) {
      const [x0, z0] = P[i - 1], [x1, z1] = P[i];
      const L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.1) continue;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, y = ground(mx, mz);
      const seg = mesh(new T.BoxGeometry(L + t * 0.5, h, t), m);
      seg.position.set(mx, y + h / 2 - 1, mz); seg.rotation.y = -Math.atan2(z1 - z0, x1 - x0); g.add(seg);
      if (merlons) for (let s = 0.5; s < L; s += 2.4) {
        const f = s / L, mm = mesh(new T.BoxGeometry(1.2, 1.4, t * 0.4), m, true, false);
        mm.position.set(x0 + (x1 - x0) * f, y + h - 1 + 0.7, z0 + (z1 - z0) * f); mm.rotation.y = seg.rotation.y;
        mm.translateZ(t * 0.3); g.add(mm);
      }
    }
    return g;
  }
  // stone arch bridge spanning `span` metres (along x) with n arches
  function archBridge(o) {
    const { span = 60, width = 6, n = 3, rise = 8, m = MAT.greyStone(), deck = 1.4 } = o;
    const s = new T.Shape();
    const h = rise + deck;
    s.moveTo(-span / 2 - 4, 0); s.lineTo(-span / 2 - 4, h); s.lineTo(span / 2 + 4, h); s.lineTo(span / 2 + 4, 0);
    const pier = span / n * 0.18, aw = span / n - pier;
    for (let k = n - 1; k >= 0; k--) {
      const cx = -span / 2 + (k + 0.5) * span / n;
      s.lineTo(cx + aw / 2, 0); s.absellipse(cx, 0, aw / 2, Math.min(rise, aw / 2), 0, Math.PI, false); s.lineTo(cx - aw / 2, 0); // segmental arch
      // segmental: flatten via scaling later
    }
    s.lineTo(-span / 2 - 4, 0);
    const g = new T.ExtrudeGeometry(s, { depth: width, bevelEnabled: false });
    g.translate(0, 0, -width / 2);
    g.scale(1, rise / (aw / 2) < 1 ? 1 : 1, 1);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4);
    const b = mesh(g, m);
    const grp = new T.Group(); grp.add(b);
    for (const side of [-1, 1]) { const par = mesh(new T.BoxGeometry(span + 8, 1, 0.6), m); par.position.set(0, h + 0.5, side * (width / 2 - 0.3)); grp.add(par); }
    return grp;
  }
  // stylised trees: deciduous (clustered blobs), conifer (stacked cones), mallorn (tall, silver & gold)
  const blobGeo = new T.IcosahedronGeometry(1, 1);
  function tree(o, R) {
    const { kind = 'oak', h = 14, leaf = '#3f6b2f', trunk = '#5a4632' } = o;
    const g = new T.Group();
    if (kind === 'conifer') {
      const t = mesh(new T.CylinderGeometry(h * 0.025, h * 0.04, h * 0.3, 6), MAT.bark(trunk)); t.position.y = h * 0.15; g.add(t);
      for (let k = 0; k < 4; k++) { const c = mesh(new T.ConeGeometry(h * (0.28 - k * 0.05), h * 0.38, 7), MAT.leaf(leaf)); c.position.y = h * (0.35 + k * 0.17); c.rotation.y = R() * 3; g.add(c); }
      return g;
    }
    const tr = kind === 'mallorn' ? 0.035 : 0.05;
    const t = mesh(new T.CylinderGeometry(h * tr * 0.6, h * tr, h * 0.62, 7), MAT.bark(kind === 'mallorn' ? '#b8b5ac' : trunk)); t.position.y = h * 0.31; g.add(t);
    const n = kind === 'mallorn' ? 9 : 6;
    for (let k = 0; k < n; k++) {
      const s = h * R.r(0.16, 0.26) * (kind === 'mallorn' ? 0.8 : 1);
      const b = mesh(blobGeo, MAT.leaf(R() < 0.5 ? leaf : new T.Color(leaf).offsetHSL(R.r(-0.02, 0.02), 0, R.r(-0.06, 0.06)).getStyle()));
      b.scale.set(s * R.r(0.9, 1.3), s * R.r(0.7, 1), s * R.r(0.9, 1.3));
      const a = R() * 6.28, rr = h * R.r(0.05, 0.22);
      b.position.set(Math.cos(a) * rr, h * R.r(0.62, kind === 'mallorn' ? 1.0 : 0.88), Math.sin(a) * rr);
      g.add(b);
    }
    return g;
  }
  // a mountain-ish rock lump (noisy icosahedron)
  // smooth 3D value noise for displacing rock surfaces (same position -> same offset: no cracks)
  function n3(x, y, z, seed) {
    const h = (a, b, c) => { let t = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 2147483647) ^ Math.imul(seed, 1274126177); t = Math.imul(t ^ (t >>> 13), 1274126177); return ((t ^ (t >>> 16)) >>> 0) / 4294967296; };
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
    const s3 = (t) => t * t * (3 - 2 * t), u = s3(xf), v = s3(yf), w = s3(zf);
    const l = (a, b, t) => a + (b - a) * t;
    return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
      l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w) * 2 - 1;
  }
  ME3D.n3 = n3;
  function rockLump(r, R, c = '#7a746c', squash = 0.7) {
    // with the kit loaded: a scanned cliff or rock face (Poly Haven), scaled to the lump's size
    const scan = ME3D.kitNodes && ME3D.part('boulder2');
    if (scan) {
      // the scan's own colours are warm; take them toward the caller's grey so cliffs match the terrain
      const tc = new T.Color(c); tc.lerp(new T.Color('#ffffff'), 0.35);
      scan.traverse(o => { if (o.isMesh) { const key = 'lump' + c; ME3D._lumpMats = ME3D._lumpMats || {}; o.material = ME3D._lumpMats[key + o.material.name] || (ME3D._lumpMats[key + o.material.name] = Object.assign(o.material.clone(), {})); o.material.color.copy(tc); } });
      const box = new T.Box3().setFromObject(scan), sz = box.getSize(new T.Vector3());
      const k = (2 * r) / Math.max(sz.x, sz.z);
      scan.scale.set(k, k * Math.max(0.6, squash) * Math.max(1, Math.max(sz.x, sz.z) / Math.max(sz.y, 0.01)) * 0.55, k);
      scan.position.y = -box.min.y * scan.scale.y - r * 0.15;
      scan.rotation.y = R() * Math.PI * 2;
      const g = new T.Group(); g.add(scan); return g;
    }
    const g = new T.IcosahedronGeometry(r, 4);
    const p = g.attributes.position, seed = Math.floor(R() * 1e6);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + 0.28 * n3(x / r * 1.3, y / r * 1.3, z / r * 1.3, seed) + 0.12 * n3(x / r * 3.5, y / r * 3.5, z / r * 3.5, seed + 1) + 0.05 * n3(x / r * 9, y / r * 9, z / r * 9, seed + 2);
      p.setXYZ(i, x * k, Math.max(y * k * squash, -r * 0.2), z * k);
    }
    g.computeVertexNormals();
    return mesh(g, MAT.rock(c));
  }
  // a tube whose radius tapers from r0 to r1 along a curve (horns, tentacles, roots)
  function taperTube(points, r0, r1, m, radial = 8, segs = 40) {
    const curve = new T.CatmullRomCurve3(points);
    const g = new T.TubeGeometry(curve, segs, 1, radial, false);
    const p = g.attributes.position;
    const frames = curve.computeFrenetFrames(segs, false);
    for (let i = 0; i <= segs; i++) {
      const c = curve.getPointAt(i / segs), rr = r0 + (r1 - r0) * Math.pow(i / segs, 0.9);
      for (let j = 0; j <= radial; j++) {
        const k = i * (radial + 1) + j;
        p.setXYZ(k, c.x + (p.getX(k) - c.x) * rr, c.y + (p.getY(k) - c.y) * rr, c.z + (p.getZ(k) - c.z) * rr);
      }
    }
    g.computeVertexNormals();
    return mesh(g, m);
  }
  // a flat sheet of water following a centre line at a fixed level
  // water: a dark, glossy surface whose ripple normal map (tileable sums of sines, drawn once) reflects the
  // sky through the scene's environment map; UVs are world metres / 24, so ripples keep their size
  let rippleTex = null;
  function ripples() {
    if (rippleTex) return rippleTex;
    const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), img = g.createImageData(N, N), H = new Float32Array(N * N), R = rng(77);
    const waves = []; for (let k = 0; k < 14; k++) waves.push([Math.round(R.r(-6, 6)) || 1, Math.round(R.r(-6, 6)), R() * 6.28, 1 / (1 + k * 0.35)]);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let h = 0; for (const [a, b, ph, amp] of waves) h += amp * Math.sin((a * x + b * y) / N * 6.2832 + ph); H[y * N + x] = h; }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = H[y * N + (x + 1) % N] - H[y * N + (x + N - 1) % N], dy = H[((y + 1) % N) * N + x] - H[((y + N - 1) % N) * N + x];
      const nx = -dx * 2.2, ny = -dy * 2.2, l = Math.hypot(nx, ny, 1), i = (y * N + x) * 4;
      img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    rippleTex = new T.CanvasTexture(c); rippleTex.wrapS = rippleTex.wrapT = T.RepeatWrapping; rippleTex.colorSpace = T.NoColorSpace;
    return rippleTex;
  }
  function waterMat(color = '#1d4352') {
    const nm = ripples().clone(); nm.needsUpdate = true;
    const m = new T.MeshStandardMaterial({ color, roughness: 0.04, metalness: 0.15, normalMap: nm, normalScale: new T.Vector2(0.45, 0.45), envMapIntensity: 1.4, transparent: true, opacity: 0.9 });
    m.userData.flow = (t, sp) => { nm.offset.set(t * sp * 0.3, -t * sp); };
    return m;
  }
  ME3D.waterMat = waterMat;

  function flatWater(pts, width, level, m) {
    const pos = [], uv = [], idx = [];
    let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i]; const [xa, za] = pts[Math.max(0, i - 1)], [xb, zb] = pts[Math.min(pts.length - 1, i + 1)];
      const dx = xb - xa, dz = zb - za, L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
      if (i) acc += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
      for (const s2 of [-1, 1]) { const px = x + nx * width / 2 * s2, pz = z + nz * width / 2 * s2; pos.push(px, level, pz); uv.push(px / 24, pz / 24); }
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const wm = m || waterMat();
    const o = mesh(g, wm, false, true);
    o.userData.animate = (t) => { if (wm.userData.flow) wm.userData.flow(t, 0.02); };
    return o;
  }

  // Merge every static mesh under `root` into one mesh per material (huge draw-call savings: walls,
  // merlons, houses, trees). Meshes with their own animation (or inside an animated group) are kept.
  // box-project UVs in world space so textures tile at their real size whatever the primitive
  function boxUV(g, tile) {
    const p = g.attributes.position.array, uv = g.attributes.uv.array;
    for (let t = 0; t < p.length / 9; t++) {
      const i = t * 9;
      const ax = p[i + 3] - p[i], ay = p[i + 4] - p[i + 1], az = p[i + 5] - p[i + 2], bx = p[i + 6] - p[i], by = p[i + 7] - p[i + 1], bz = p[i + 8] - p[i + 2];
      const nx = Math.abs(ay * bz - az * by), ny = Math.abs(az * bx - ax * bz), nz = Math.abs(ax * by - ay * bx);
      for (let k = 0; k < 3; k++) {
        const x = p[i + k * 3], y = p[i + k * 3 + 1], z = p[i + k * 3 + 2], j = (t * 3 + k) * 2;
        if (ny >= nx && ny >= nz) { uv[j] = x / tile; uv[j + 1] = z / tile; }
        else if (nx >= nz) { uv[j] = z / tile; uv[j + 1] = y / tile; }
        else { uv[j] = x / tile; uv[j + 1] = y / tile; }
      }
    }
  }
  function mergeStatic(root) {
    root.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(root.matrixWorld).invert();
    const buckets = new Map(), victims = [];
    const animated = new Set();
    root.traverse(o => { if (o.userData && typeof o.userData.animate === 'function') o.traverse(c => animated.add(c)); });
    root.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || animated.has(o) || Array.isArray(o.material) || o.material.transparent) return;
      let b = buckets.get(o.material); if (!b) buckets.set(o.material, b = { cast: false, geos: [] });
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      g.applyMatrix4(new T.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      const tile = !o.userData.glb && ME3D.TILES && ME3D.TILES[o.material.name];
      if (tile) boxUV(g, tile);
      b.geos.push(g); b.cast = b.cast || o.castShadow; victims.push(o);
    });
    for (const o of victims) o.parent.remove(o);
    for (const [m, b] of buckets) {
      let n = 0; for (const g of b.geos) n += g.attributes.position.count;
      if (!n) continue;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
      let o = 0;
      for (const g of b.geos) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; g.dispose(); }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.BufferAttribute(nor, 3)); geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
      const mm = new T.Mesh(geo, m); mm.castShadow = b.cast; mm.receiveShadow = true; root.add(mm);
    }
    return root;
  }
  // animated fire / glow sprite and a rising-smoke particle system
  function glowSprite(color, size) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, color); gr.addColorStop(0.4, color.replace(/[\d.]+\)$/, '0.35)')); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const s = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), blending: T.AdditiveBlending, depthWrite: false, transparent: true }));
    s.scale.set(size, size, 1);
    return s;
  }
  function smoke(n, R, color = 'rgba(200,200,200,0.5)', rise = 30, spread = 4, size = 6) {
    const g = new T.Group();
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const tex = new T.CanvasTexture(c);
    const parts = [];
    for (let i = 0; i < n; i++) {
      const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.6 }));
      s.userData.phase = R(); s.userData.dx = R.r(-1, 1); g.add(s); parts.push(s);
    }
    g.userData.animate = (t) => {
      for (const s of parts) {
        const f = (t * 0.08 + s.userData.phase) % 1;
        s.position.set(s.userData.dx * spread * f + f * f * spread, f * rise, s.userData.dx * 0.5 * spread * f);
        const k = size * (0.4 + 1.6 * f); s.scale.set(k, k, 1); s.material.opacity = 0.55 * (1 - f);
      }
    };
    return g;
  }
  // flowing water (river ribbon / waterfall) with scrolling texture
  function waterRibbon(pts, width, ground, lift = 0.3) {
    const shape = [];
    const pos = [], uv = [], idx = [];
    let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i]; const [xa, za] = pts[Math.max(0, i - 1)], [xb, zb] = pts[Math.min(pts.length - 1, i + 1)];
      const dx = xb - xa, dz = zb - za, L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
      if (i) acc += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
      for (const s of [-1, 1]) { const px = x + nx * width / 2 * s, pz = z + nz * width / 2 * s; pos.push(px, ground(px, pz) + lift, pz); uv.push(px / 24, pz / 24); }
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = waterMat('#24505e');
    const o = mesh(g, m, false, true);
    o.userData.animate = (t) => { if (o.material.userData.flow) o.material.userData.flow(t, 0.05); };
    return o;
  }
  function waterfall(w, h, x, y, z, rotY = 0) {
    const tex = canvasTex('fall', 64, 256, (c, ww, hh, R) => { c.fillStyle = 'rgba(210,235,250,0.55)'; c.fillRect(0, 0, ww, hh); for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(255,255,255,${R.r(0.2, 0.8)})`; c.fillRect(R() * ww, R() * hh, R.r(1, 2.5), R.r(10, 40)); } }).clone();
    tex.needsUpdate = true; tex.repeat.set(1, 2);
    const m = new T.MeshStandardMaterial({ map: tex, transparent: true, opacity: 0.85, emissive: '#9ab', emissiveIntensity: 0.25, side: T.DoubleSide, depthWrite: false });
    const o = mesh(new T.PlaneGeometry(w, h), m, false, false);
    o.position.set(x, y + h / 2, z); o.rotation.y = rotY;
    o.userData.animate = (t) => { tex.offset.y = t * 1.2; };
    const mist = glowSprite('rgba(230,240,255,0.5)', w * 2.2); mist.position.set(x, y + 2, z);
    const grp = new T.Group(); grp.add(o, mist); grp.userData.animate = o.userData.animate;
    return grp;
  }

  // a cascade draped over the real slope from (x, z0) down to (x, z1): a ribbon a little above the ground,
  // white where it is steep, with flowing foam, a plunge pool glow and mist at the foot
  function cascade(ground, x, z0, z1, w) {
    const tex = canvasTex('cascade', 128, 256, (c, ww, hh, R) => { c.fillStyle = 'rgba(190,220,240,0.6)'; c.fillRect(0, 0, ww, hh); for (let i = 0; i < 700; i++) { c.fillStyle = `rgba(255,255,255,${R.r(0.25, 0.9)})`; const x0 = R() * ww; c.fillRect(x0, R() * hh, R.r(1, 3.5), R.r(8, 34)); } }).clone();
    tex.needsUpdate = true; tex.wrapS = tex.wrapT = T.RepeatWrapping;
    const n = 48, pos = [], uv = [], idx = [];
    let len = 0, prev = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n, z = z0 + (z1 - z0) * t, xx = x + Math.sin(t * 7.3) * w * 0.25, y = ground(xx, z) + 1.2 + ((i % 6) < 3 ? 0.9 : 0);
      if (prev) len += Math.hypot(z - prev[0], y - prev[1]);
      prev = [z, y];
      const ww = w * (0.45 + 0.4 * t) * (0.8 + 0.4 * Math.abs(Math.sin(i * 1.7)));
      pos.push(xx - ww / 2, y, z, xx + ww / 2, y, z); uv.push(0, len / 14, 1, len / 14);
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new T.MeshStandardMaterial({ map: tex, color: '#cfe0ea', transparent: true, opacity: 0.8, emissive: '#8ea4b4', emissiveIntensity: 0.15, roughness: 0.2, side: T.DoubleSide, depthWrite: false });
    const o = mesh(geo, m, false, false);
    const grp = new T.Group(); grp.add(o);
    const fy = ground(x, z1);
    for (let k = 0; k < 2; k++) { const mist = glowSprite('rgba(225,235,245,0.16)', w * (1.4 + k * 0.8)); mist.position.set(x + (k - 0.5) * w * 0.4, fy + 1.5 + k * 1.5, z1); grp.add(mist); }
    // wet rocks along the banks
    const RR = rng(Math.floor(x * 13 + z0));
    for (let k = 0; k < 7; k++) { const t = 0.1 + k * 0.12, z = z0 + (z1 - z0) * t, side = k % 2 ? 1 : -1, bx = x + side * w * (0.55 + RR() * 0.4); const l = rockLump(w * RR.r(0.25, 0.5), RR, '#6f6b66', 0.8); l.position.set(bx, ground(bx, z) - 1, z); grp.add(l); }
    grp.userData.animate = (t) => { tex.offset.y = -t * 0.9; };
    return grp;
  }

  Object.assign(ME3D, { taperTube, flatWater, mergeStatic, house, gableRoof, hipRoof, tower, wall, archBridge, tree, rockLump, glowSprite, smoke, waterRibbon, waterfall, cascade, canvasTex });
})();
