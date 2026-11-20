// 3D landmark viewer (Google-Earth-style) and the top-down "satellite" renders of the same models.
//
//  ME3D.LANDMARKS        : which model sits where (from data/settlements.js entries with `model`)
//  ME3D.open(id)         : opens the 3D view: terrain patch (heights + our satellite imagery) + model
//  ME3D.topDown(id)      : renders the model straight down, sunlit from the north-west like the map
//                          tiles, with transparent background and soft shadows -> image overlay
(function () {
  'use strict';
  const ME3D = window.ME3D;
  const ME = window.ME;
  const T = THREE;
  const M = 1.609344; // metres per map unit

  // ---------------------------------------------------------------- registry
  const SCENES = {
    bagEnd: 'Bag End & Hobbiton', baradDur: 'Barad-dûr', isengard: 'Orthanc & Isengard', rivendell: 'Rivendell',
    erebor: 'The Front Gate of Erebor', moriaGate: 'The West-gate of Moria', bridgeKhazadDum: 'The Bridge of Khazad-dûm',
    derndingle: 'Derndingle: the Entmoot', minasTirith: 'Minas Tirith', argonath: 'The Argonath', carasGaladhon: 'Caras Galadhon',
  };
  ME3D.SCENES = SCENES;
  function landmarks() {
    if (ME3D._lm) return ME3D._lm;
    const sites = new Map(window.ME_VECTORS.sites.filter(s => s.n).map(s => [s.n, s]));
    const out = [];
    for (const d of window.ME_SETTLEMENTS) {
      if (!d.model) continue;
      let x = d.x, y = d.y;
      if (d.site) { const s = sites.get(d.site); if (!s) continue; x = s.x; y = s.y; }
      x += d.dx || 0; y += d.dy || 0;
      out.push({ id: d.model, name: d.name || d.site, x, y, extra: d.extraModels || [], places: d.places || [d.name || d.site] });
    }
    return (ME3D._lm = out);
  }
  ME3D.landmarks = landmarks;
  ME3D.forPlace = (name, x, y) => landmarks().find(l => l.places.includes(name) || Math.hypot(l.x - x, l.y - y) < 1500);

  // ---------------------------------------------------------------- shared renderer
  let renderer = null;
  function getRenderer() {
    if (renderer) return renderer;
    renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    return renderer;
  }
  function collectAnims(root) { const a = []; root.traverse(o => { if (o.userData && typeof o.userData.animate === 'function') a.push(o.userData.animate); }); return a; }
  function sunFor(sky, radius) {
    const sun = new T.DirectionalLight(sky === 'mordor' ? '#ffb48a' : sky === 'dusk' ? '#ffd6a0' : sky === 'night' ? '#9fb4ff' : '#fff4e2', sky === 'night' ? 0.8 : sky === 'mordor' ? 1.4 : 2.6);
    sun.position.set(-0.55, 0.63, -0.55).multiplyScalar(radius * 3);
    sun.castShadow = true;
    const sc = sun.shadow.camera; sc.left = sc.bottom = -radius * 1.1; sc.right = sc.top = radius * 1.1; sc.near = 1; sc.far = radius * 8;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
    return sun;
  }
  const SKY = {
    day: { top: '#4f86c6', bottom: '#dfe9f0', fog: '#cfdce6', hemi: ['#d8e8ff', '#7a6a4a', 1.1], fill: 0.35 },
    dusk: { top: '#3d4f80', bottom: '#f4b878', fog: '#e0b88e', hemi: ['#ffd8b0', '#5a4a36', 1.0], fill: 0.45 },
    mordor: { top: '#170605', bottom: '#8a2e10', fog: '#3e1a10', hemi: ['#ff9a60', '#2a0e06', 0.9], fill: 0.6 },
    night: { top: '#040814', bottom: '#1e2e4c', fog: '#16223a', hemi: ['#6a84c0', '#141414', 0.7], fill: 0.35 },
    cave: { top: '#000000', bottom: '#160604', fog: '#0a0302', hemi: ['#6a3a2a', '#100604', 0.7], fill: 0.5 },
  };
  function skyDome(s) {
    const g = new T.SphereGeometry(40000, 32, 16);
    const m = new T.ShaderMaterial({ side: T.BackSide, depthWrite: false, uniforms: { top: { value: new T.Color(s.top) }, bottom: { value: new T.Color(s.bottom) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.15,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, h),1.0); }' });
    return new T.Mesh(g, m);
  }

  // ---------------------------------------------------------------- terrain for the 3D view
  async function terrain(lm, sizeM, shape) {
    const S = sizeM / M, N = 224, TEXN = 1024;
    const ox = lm.x - S / 2, oy = lm.y - S / 2;
    const [hp, tp] = await Promise.all([ME.terrainPatch(ox, oy, S / N, N), ME.terrainPatch(ox, oy, S / TEXN, TEXN, { noRivers: true })]);
    hp.bmp.close();
    const H = hp.heights;
    const h0 = H[(N >> 1) * N + (N >> 1)];
    const geo = new T.PlaneGeometry(sizeM, sizeM, N - 1, N - 1); geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let h = Math.max(H[i], -3) - h0;
      if (shape) h += shape(p.getX(i), p.getZ(i));
      H[i] = h; p.setY(i, h);
    }
    // sink the outer rim so the terrain reads as a tile of a larger world, not a floating card
    geo.computeVertexNormals();
    const c = document.createElement('canvas'); c.width = c.height = TEXN; c.getContext('2d').drawImage(tp.bmp, 0, 0); tp.bmp.close();
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 8;
    // a detail texture breaks up the soft satellite colours close to the camera
    const mat = new T.MeshStandardMaterial({ map: tex, roughness: 1 });
    const detail = ME3D.canvasTex('detail', 256, 256, (g, w, h, R) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { const v = R.r(70, 190) | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.globalAlpha = 0.35; g.fillRect(R() * w, R() * h, R.r(1, 3), R.r(1, 4)); } });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.detailMap = { value: detail };
      sh.fragmentShader = 'uniform sampler2D detailMap;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= 0.55 + 0.9 * texture2D(detailMap, vMapUv * ' + (sizeM / 6).toFixed(1) + ').r;\n diffuseColor.rgb *= 0.8 + 0.4 * texture2D(detailMap, vMapUv * ' + (sizeM / 60).toFixed(1) + ').g;');
    };
    const m = new T.Mesh(geo, mat); m.receiveShadow = true;
    const ground = (x, z) => {
      const u = (x / sizeM + 0.5) * (N - 1), v = (z / sizeM + 0.5) * (N - 1);
      const i = Math.max(0, Math.min(N - 2, Math.floor(u))), j = Math.max(0, Math.min(N - 2, Math.floor(v))), fu = Math.min(1, Math.max(0, u - i)), fv = Math.min(1, Math.max(0, v - j));
      return (H[j * N + i] * (1 - fu) + H[j * N + i + 1] * fu) * (1 - fv) + (H[(j + 1) * N + i] * (1 - fu) + H[(j + 1) * N + i + 1] * fu) * fv;
    };
    // real rivers crossing the patch, densified into local metre coordinates
    const rivers = [];
    for (const r of window.ME_VECTORS.rivers) {
      const q = r.p, pts = [];
      for (let k = 2; k < q.length; k += 2) {
        const x0 = (q[k - 2] - lm.x) * M, z0 = (q[k - 1] - lm.y) * M, x1 = (q[k] - lm.x) * M, z1 = (q[k + 1] - lm.y) * M;
        const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / 25));
        for (let t = 0; t <= n; t++) { const x = x0 + (x1 - x0) * t / n, z = z0 + (z1 - z0) * t / n; if (Math.abs(x) < sizeM / 2 && Math.abs(z) < sizeM / 2) pts.push([x, z]); }
      }
      if (pts.length > 3) rivers.push({ pts, width: Math.min(r.w[1] * M, 300), name: r.n });
    }
    return { mesh: m, ground, rivers };
  }
  function environment(r, s) {
    const pm = new T.PMREMGenerator(r);
    const sc = new T.Scene(); sc.add(skyDome(s));
    const tex = pm.fromScene(sc, 0.02).texture; pm.dispose();
    return tex;
  }

  // ---------------------------------------------------------------- orbit camera (mouse, wheel, touch)
  function orbit(cam, dom, st) {
    const upd = () => {
      const { dist, elev, azim, tx, ty, tz } = st;
      cam.position.set(tx + Math.sin(azim) * Math.cos(elev) * dist, ty + Math.sin(elev) * dist, tz + Math.cos(azim) * Math.cos(elev) * dist);
      cam.lookAt(tx, ty, tz);
    };
    let drag = null;
    dom.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey }; dom.setPointerCapture(e.pointerId); st.auto = false; });
    dom.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      if (drag.pan) { const k = st.dist / 600; st.tx -= (Math.cos(st.azim) * dx) * k; st.tz -= (-Math.sin(st.azim) * dx) * k; st.ty += dy * k; }
      else { st.azim -= dx * 0.006; st.elev = Math.max(0.02, Math.min(1.45, st.elev + dy * 0.005)); }
      upd();
    });
    dom.addEventListener('pointerup', () => { drag = null; });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('wheel', (e) => { e.preventDefault(); st.dist = Math.max(st.min, Math.min(st.max, st.dist * Math.exp(e.deltaY * 0.0012))); upd(); }, { passive: false });
    let pinch = 0;
    dom.addEventListener('touchmove', (e) => { if (e.touches.length === 2) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); if (pinch) { st.dist = Math.max(st.min, Math.min(st.max, st.dist * pinch / d)); upd(); } pinch = d; } }, { passive: true });
    dom.addEventListener('touchend', () => { pinch = 0; });
    upd();
    return upd;
  }

  // ---------------------------------------------------------------- the modal viewer
  let current = null;
  ME3D.open = async function (id, lmIn) {
    ME3D.close();
    const lm = lmIn || landmarks().find(l => l.id === id) || { id, x: 0, y: 0 };
    const box = document.createElement('div'); box.id = 'v3d';
    box.innerHTML = `<div class="v3d-top"><div><div class="v3d-title">${SCENES[id] || id}</div><div class="v3d-sub">3D · drag to orbit · right-drag to pan · scroll to zoom</div></div><div class="v3d-tabs"></div><button class="v3d-close" title="Close">✕</button></div><div class="v3d-loading">Raising the land…</div>`;
    document.body.appendChild(box);
    const tabs = box.querySelector('.v3d-tabs');
    const ids = [lm.id, ...(lm.extra || [])];
    if (ids.length > 1) tabs.innerHTML = ids.map(i => `<button data-id="${i}" class="${i === id ? 'on' : ''}">${SCENES[i]}</button>`).join('');
    tabs.querySelectorAll('button').forEach(b => b.onclick = () => ME3D.open(b.dataset.id, lm));
    box.querySelector('.v3d-close').onclick = () => ME3D.close();
    const r = getRenderer();
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.setSize(window.innerWidth, window.innerHeight);
    r.domElement.className = 'v3d-canvas';
    box.prepend(r.domElement);
    const scene = new T.Scene();
    const st = { cancelled: false };
    current = { box, scene, st };
    const def = ME3D.builders[id];
    const radius = def.info.radius, interior = def.info.interior;
    let ground = () => 0, tmesh = null, rivers = [];
    if (!interior) { try { const t = await terrain(lm, Math.max(radius * 3.4, 1800), def.shape); ground = t.ground; tmesh = t.mesh; rivers = t.rivers; } catch (e) { console.warn(e); } }
    if (st.cancelled) return;
    const built = def.build({ ground, rivers, R: ME3D.rng(7) });
    ME3D.mergeStatic(built.group);
    const s = SKY[built.sky] || SKY.day;
    scene.add(skyDome(s));
    scene.environment = environment(r, s);
    scene.fog = new T.Fog(s.fog, radius * (interior ? 0.6 : 2.2), radius * (interior ? 2.2 : 9));
    scene.add(new T.HemisphereLight(s.hemi[0], s.hemi[1], s.hemi[2]));
    const sun = sunFor(built.sky, radius);
    { const az = built.cam.azim + 0.9; sun.position.set(Math.sin(az) * 0.6, built.sky === 'mordor' ? 0.35 : 0.62, Math.cos(az) * 0.6).multiplyScalar(radius * 3); }
    scene.add(sun, sun.target);
    if (tmesh) scene.add(tmesh);
    scene.add(built.group);
    const cam = new T.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 60000);
    const fill = new T.DirectionalLight('#ffffff', s.fill || 0.3); fill.position.set(0, 0.3, 1); cam.add(fill); scene.add(cam); // soft camera fill
    const c = built.cam, tgt = c.target || [0, 0];
    const ost = { dist: c.dist, elev: c.elev, azim: c.azim, tx: tgt[0], ty: ground(tgt[0], tgt[1]) + (c.lookY || 0), tz: tgt[1], min: 4, max: radius * 6, auto: true };
    const upd = orbit(cam, r.domElement, ost);
    box.querySelector('.v3d-loading').remove();
    const anims = collectAnims(built.group);
    const t0 = performance.now();
    const onResize = () => { r.setSize(window.innerWidth, window.innerHeight); cam.aspect = window.innerWidth / window.innerHeight; cam.updateProjectionMatrix(); };
    window.addEventListener('resize', onResize);
    const loop = () => {
      if (st.cancelled) return;
      const t = (performance.now() - t0) / 1000;
      for (const a of anims) a(t);
      if (ost.auto) { ost.azim += 0.0012; upd(); }
      r.render(scene, cam);
      st.raf = requestAnimationFrame(loop);
    };
    loop();
    Object.assign(current, { onResize, built, tmesh });
    ME3D.ready = true;
  };
  function disposeTree(o) { o.traverse(n => { if (n.geometry) n.geometry.dispose(); }); }
  ME3D.close = function () {
    if (!current) return;
    current.st.cancelled = true; cancelAnimationFrame(current.st.raf);
    window.removeEventListener('resize', current.onResize || (() => {}));
    current.scene.traverse(n => { if (n.geometry) n.geometry.dispose(); });
    current.box.remove(); current = null; ME3D.ready = false;
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ME3D.close(); });

  // ---------------------------------------------------------------- top-down renders for the map
  const topCache = new Map();
  ME3D.topDown = function (id) {
    if (topCache.has(id)) return topCache.get(id);
    const def = ME3D.builders[id];
    if (def.info.interior) return null;
    const built = def.build({ ground: () => 0, rivers: [], R: ME3D.rng(7) });
    const radius = def.info.radius;
    const px = Math.min(2048, Math.ceil(radius * 2 / 0.45));
    const scene = new T.Scene();
    scene.add(new T.HemisphereLight('#dfe8f0', '#5a5040', 1.0));
    const sun = sunFor('day', radius); sun.intensity = 2.4; scene.add(sun, sun.target);
    const shadowCatcher = new T.Mesh(new T.PlaneGeometry(radius * 2.2, radius * 2.2), new T.ShadowMaterial({ opacity: 0.42 }));
    shadowCatcher.rotation.x = -Math.PI / 2; shadowCatcher.receiveShadow = true; scene.add(shadowCatcher);
    // the models' own rivers and glows are already on the map tiles: hide water ribbons and sprites
    const hide = []; built.group.traverse(o => { if (o.isSprite || o.isPoints || o.isLight || (o.userData && o.userData.noTop)) hide.push(o); });
    for (const o of hide) if (o.parent) o.parent.remove(o);
    ME3D.mergeStatic(built.group);
    scene.add(built.group);
    for (const a of collectAnims(built.group)) a(2);
    const cam = new T.OrthographicCamera(-radius, radius, radius, -radius, 1, 20000);
    cam.position.set(0, 8000, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0);
    const r = getRenderer();
    r.setPixelRatio(1); r.setSize(px, px); r.setClearColor(0x000000, 0);
    r.render(scene, cam);
    const url = r.domElement.toDataURL('image/png');
    disposeTree(scene);
    const out = { url, radius };
    topCache.set(id, out);
    return out;
  };

  // Leaflet layer: model renders laid over the satellite tiles from zoom 12, rendered lazily
  ME3D.OverlayLayer = L.Layer.extend({
    onAdd(map) {
      this._map = map; this.overlays = new Map();
      map.on('moveend zoomend', this.update, this); this.update();
    },
    onRemove(map) { map.off('moveend zoomend', this.update, this); for (const o of this.overlays.values()) map.removeLayer(o); this.overlays.clear(); },
    update() {
      const map = this._map; if (!map) return;
      const z = map.getZoom(), b = map.getBounds();
      for (const lm of landmarks()) {
        const built = ME3D.builders[lm.id]; if (!built) continue;
        const key = lm.id;
        const show = z >= 12;
        let ov = this.overlays.get(key);
        if (!show) { if (ov) { map.removeLayer(ov); this.overlays.delete(key); } continue; }
        if (ov) continue;
        const rMu = 1100 / M * 1.2;
        if (!b.intersects(L.latLngBounds([lm.y - rMu, lm.x - rMu], [lm.y + rMu, lm.x + rMu]))) continue;
        const td = ME3D.topDown(lm.id); if (!td) continue;
        const r = td.radius / M;
        ov = L.imageOverlay(td.url, [[lm.y - r, lm.x - r], [lm.y + r, lm.x + r]], { pane: 'overlayPane', interactive: false, className: 'model-overlay' });
        ov.addTo(map); this.overlays.set(key, ov);
      }
    },
  });
})();
