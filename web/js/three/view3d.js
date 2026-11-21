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
    derndingle: 'Derndingle: the Entmoot', minasTirith: 'Minas Tirith', argonath: 'The Argonath', carasGaladhon: 'Caras Galadhon', edoras: 'Edoras and Meduseld',
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
    day: { top: '#4f86c6', bottom: '#dfe9f0', fog: '#cfdce6', hemi: ['#d8e8ff', '#7a6a4a', 1.1], fill: 0.35, cloud: 0.75, sunCol: '#fff6e0' },
    dusk: { top: '#3d4f80', bottom: '#f4b878', fog: '#e0b88e', hemi: ['#ffd8b0', '#5a4a36', 1.0], fill: 0.45, cloud: 0.7, sunCol: '#ffb070' },
    mordor: { top: '#170605', bottom: '#8a2e10', fog: '#3e1a10', hemi: ['#ff9a60', '#2a0e06', 0.9], fill: 0.6, cloud: 0.95, sunCol: '#ff5a20' },
    night: { top: '#040814', bottom: '#1e2e4c', fog: '#16223a', hemi: ['#6a84c0', '#141414', 0.7], fill: 0.35, cloud: 0.35, sunCol: '#9fb4ff' },
    cave: { top: '#000000', bottom: '#160604', fog: '#0a0302', hemi: ['#6a3a2a', '#100604', 0.7], fill: 0.5 },
  };
  // sky: the palette's gradient, a glow around the sun and drifting fBm clouds lit from the sun's side
  function skyDome(s, sunDir) {
    const g = new T.SphereGeometry(40000, 48, 24);
    const m = new T.ShaderMaterial({ side: T.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new T.Color(s.top) }, bottom: { value: new T.Color(s.bottom) }, sunCol: { value: new T.Color(s.sunCol || '#ffffff') },
        sunDir: { value: (sunDir || new T.Vector3(-0.55, 0.63, -0.55)).clone().normalize() }, cloud: { value: s.cloud || 0 }, time: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'uniform vec3 top; uniform vec3 bottom; uniform vec3 sunCol; uniform vec3 sunDir; uniform float cloud; uniform float time; varying vec3 vP;',
        'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
        'float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
        '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }',
        'float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }',
        'void main(){',
        '  vec3 d = normalize(vP);',
        '  float h = clamp(d.y * 1.6 + 0.15, 0.0, 1.0);',
        '  vec3 c = mix(bottom, top, pow(h, 0.8));',
        '  float sd = max(dot(d, sunDir), 0.0);',
        '  c += sunCol * (pow(sd, 6.0) * 0.18 + pow(sd, 60.0) * 0.35 + pow(sd, 900.0) * 2.0);',
        '  if (d.y > 0.0 && cloud > 0.0) {',
        '    vec2 uv = d.xz / (d.y + 0.08) * 0.9 + vec2(time * 0.004, 0.0);',
        '    float n = fbm(uv), n2 = fbm(uv * 2.3 + 4.0);',
        '    float cov = smoothstep(0.52 - cloud * 0.12, 0.85, n * 0.75 + n2 * 0.35) * smoothstep(0.0, 0.18, d.y);',
        '    float lit = clamp(0.55 + (n - fbm(uv + sunDir.xz * 0.06)) * 6.0, 0.0, 1.2);',
        '    vec3 cc = mix(mix(bottom, top, 0.35) * 0.75, mix(vec3(1.0), sunCol, 0.45), lit * 0.85) + sunCol * pow(sd, 4.0) * 0.35;',
        '    c = mix(c, cc, cov * 0.9);',
        '  }',
        '  gl_FragColor = vec4(c, 1.0);',
        '}'].join('\n') });
    const o = new T.Mesh(g, m); o.userData.animate = (t) => { m.uniforms.time.value = t; };
    return o;
  }

  // ---------------------------------------------------------------- terrain for the 3D view
  async function terrain(lm, sizeM, shape, bare) {
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
    // Ground detail. The satellite image gives the colour; tiled CC0 photo textures (grass, rock, bare
    // earth) give the detail close up, chosen by slope and by how green the satellite colour is. They
    // are used as ratios to their own mean colour, so the 3D ground keeps the hue of the map.
    const mat = new T.MeshStandardMaterial({ map: tex, roughness: 1 });
    const gt = await ME3D.loadGround();
    const nrm = geo.attributes.normal, slope = new Float32Array(nrm.count);
    const bareA = new Float32Array(nrm.count);
    for (let i = 0; i < nrm.count; i++) { slope[i] = 1 - nrm.getY(i); if (bare) bareA[i] = bare(p.getX(i), p.getZ(i)); }
    geo.setAttribute('slope', new T.BufferAttribute(slope, 1));
    geo.setAttribute('bare', new T.BufferAttribute(bareA, 1));
    const detail = ME3D.canvasTex('detail', 256, 256, (g, w, h, R) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { const v = R.r(70, 190) | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.globalAlpha = 0.35; g.fillRect(R() * w, R() * h, R.r(1, 3), R.r(1, 4)); } });
    const S2 = sizeM.toFixed(1);
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.detailMap = { value: detail };
      sh.vertexShader = 'attribute float slope;\nattribute float bare;\nvarying float vSlope;\nvarying float vBare;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vSlope = slope; vBare = bare;');
      let frag = 'uniform sampler2D detailMap;\nvarying float vSlope;\nvarying float vBare;\n';
      let body = ' vec2 wp = vMapUv * ' + S2 + ';\n diffuseColor.rgb *= 0.85 + 0.3 * texture2D(detailMap, vMapUv * ' + (sizeM / 60).toFixed(1) + ').g;\n';
      if (gt && gt.grass && gt.meadow && gt.rock && gt.dirt) {
        for (const k of ['grass', 'meadow', 'rock', 'dirt']) { sh.uniforms['g_' + k] = { value: gt[k] }; frag += 'uniform sampler2D g_' + k + ';\n'; }
        frag += 'vec3 gdet(sampler2D t, vec2 p) { vec3 m = textureLod(t, vec2(0.5), 12.0).rgb + 0.004; return clamp(texture2D(t, p).rgb / m, 0.25, 2.2); }\n';
        body += [
          // builder-declared bare ground (Isengard's scorched plain): grey-brown earth instead of the satellite green
          ' diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.5, 0.2))) * vec3(0.95, 0.85, 0.72) * 0.75, vBare);',
          ' vec3 sat = diffuseColor.rgb;',
          ' float green = (sat.g - max(sat.r, sat.b) * 0.92) / (sat.g + 0.02);',
          // two scales of grass so the tiling does not show, then bare earth, then rock on steep slopes
          ' vec3 dg = gdet(g_grass, wp / 23.0) * 0.55 + gdet(g_meadow, wp / 3.1) * 0.45;',
          ' vec3 dd = gdet(g_dirt, wp / 7.0) * 0.6 + gdet(g_dirt, wp / 31.0) * 0.4;',
          ' vec3 dr = gdet(g_rock, wp / 17.0) * 0.7 + gdet(g_rock, wp / 61.0) * 0.3;',
          ' vec3 d = mix(dd, dg, smoothstep(0.02, 0.16, green));',
          ' d = mix(d, dr, smoothstep(0.22, 0.42, vSlope));',
          // fade the photo detail out with distance, where it would only add shimmer
          ' float fd = 1.0 - smoothstep(600.0, 2600.0, length(vViewPosition));',
          ' diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(dot(d, vec3(0.333))), d, 0.6), 0.9 * fd + 0.1);',
        ].join('\n') + '\n';
      } else {
        body += ' diffuseColor.rgb *= 0.55 + 0.9 * texture2D(detailMap, vMapUv * ' + (sizeM / 6).toFixed(1) + ').r;\n';
      }
      sh.fragmentShader = frag + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' + body);
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
  function environment(r, s, sunDir) {
    const pm = new T.PMREMGenerator(r);
    const sc = new T.Scene(); sc.add(skyDome(s, sunDir));
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
    if (!interior) { try { const t = await terrain(lm, Math.max(radius * 3.4, 1800), def.shape, def.bare); ground = t.ground; tmesh = t.mesh; rivers = t.rivers; } catch (e) { console.warn(e); } }
    const models = await loadModels(def);
    if (st.cancelled) return;
    const built = def.build({ ground, rivers, R: ME3D.rng(7), models });
    ME3D.mergeStatic(built.group);
    const s = SKY[built.sky] || SKY.day;
    const sun = sunFor(built.sky, radius);
    { const az = built.cam.azim + 0.9; sun.position.set(Math.sin(az) * 0.6, built.sky === 'mordor' ? 0.35 : 0.62, Math.cos(az) * 0.6).multiplyScalar(radius * 3); }
    const sky = skyDome(s, sun.position); sky.userData.animate = null;
    scene.add(sky);
    scene.environment = environment(r, s, sun.position);
    scene.fog = new T.Fog(s.fog, radius * (interior ? 0.6 : 2.2), radius * (interior ? 2.2 : 9));
    scene.add(new T.HemisphereLight(s.hemi[0], s.hemi[1], s.hemi[2]));
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
      sky.material.uniforms.time.value = t;
      if (ost.auto) { ost.azim += 0.0012; upd(); }
      r.render(scene, cam);
      st.raf = requestAnimationFrame(loop);
    };
    loop();
    Object.assign(current, { onResize, built, tmesh });
    ME3D.ready = true;
  };
  async function loadModels(def) {
    await Promise.all([ME3D.loadKit(), ME3D.loadGround()]); ME3D.resetMats();
    const models = {};
    for (const n of def.info.models || []) { try { models[n] = await ME3D.loadModel(n); } catch (e) { console.warn(e); } }
    return models;
  }
  function disposeTree(o) { o.traverse(n => { if (n.geometry) n.geometry.dispose(); }); }
  ME3D.close = function () {
    if (!current) return;
    current.st.cancelled = true; cancelAnimationFrame(current.st.raf);
    window.removeEventListener('resize', current.onResize || (() => {}));
    current.scene.traverse(n => { if (n.geometry) n.geometry.dispose(); });
    current.box.remove(); current = null; ME3D.ready = false;
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ME3D.close(); });

  // ---------------------------------------------------------------- studio preview (for model work)
  // ME3D.preview(name or kit part, [[azim, elev], ...], {w, h, fit}) -> data URLs of the model on a plain
  // ground under daylight. Used by tools/test/model_preview.js.
  ME3D.preview = async function (name, views, o = {}) {
    await ME3D.loadKit(); ME3D.resetMats();
    let obj = ME3D.part(name);
    if (!obj && name.includes('/')) { const [g, n] = name.split('/'); obj = (await ME3D.loadModel(g)).getObjectByName(n).clone(true); obj.position.set(0, 0, 0); }
    if (!obj) obj = (await ME3D.loadModel(name)).clone(true);
    const box = new T.Box3().setFromObject(obj), size = box.getSize(new T.Vector3()), ctr = box.getCenter(new T.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.6;
    const scene = new T.Scene(), s = SKY.day;
    scene.add(skyDome(s)); scene.environment = environment(getRenderer(), s);
    scene.add(new T.HemisphereLight(s.hemi[0], s.hemi[1], s.hemi[2]));
    const sun = sunFor('day', radius); sun.position.set(-0.5, 0.7, 0.45).multiplyScalar(radius * 3); scene.add(sun, sun.target);
    const gnd = new T.Mesh(new T.CircleGeometry(radius * 6, 48), new T.MeshStandardMaterial({ color: '#7d8a62', roughness: 1 }));
    gnd.rotation.x = -Math.PI / 2; gnd.position.y = box.min.y < -1 ? 0 : box.min.y; gnd.receiveShadow = true; scene.add(gnd);
    scene.add(obj);
    const w = o.w || 600, h = o.h || 450, r = getRenderer();
    r.setPixelRatio(1); r.setSize(w, h); r.setClearColor(0x000000, 1);
    const cam = new T.PerspectiveCamera(40, w / h, 0.1, 50000);
    const out = [];
    for (const [az, el, k] of views) {
      const d = radius / Math.tan(T.MathUtils.degToRad(20)) * (k || 1.05);
      const look = ctr.clone();
      cam.position.set(look.x + Math.sin(az) * Math.cos(el) * d, look.y + Math.sin(el) * d, look.z + Math.cos(az) * Math.cos(el) * d);
      cam.lookAt(look); r.render(scene, cam); out.push(r.domElement.toDataURL('image/jpeg', 0.9));
    }
    return out;
  };

  // ---------------------------------------------------------------- top-down renders for the map
  const topCache = new Map();
  ME3D.topDown = async function (id) {
    if (topCache.has(id)) return topCache.get(id);
    const def = ME3D.builders[id];
    if (def.info.interior) return null;
    const models = await loadModels(def);
    if (topCache.has(id)) return topCache.get(id);
    const built = def.build({ ground: () => 0, rivers: [], R: ME3D.rng(7), models });
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
    onRemove(map) { map.off('moveend zoomend', this.update, this); for (const o of this.overlays.values()) if (o !== 'pending') map.removeLayer(o); this.overlays.clear(); },
    update() {
      const map = this._map; if (!map) return;
      const z = map.getZoom(), b = map.getBounds();
      for (const lm of landmarks()) {
        const built = ME3D.builders[lm.id]; if (!built) continue;
        const key = lm.id;
        const show = z >= 12;
        let ov = this.overlays.get(key);
        if (!show) { if (ov && ov !== 'pending') map.removeLayer(ov); this.overlays.delete(key); continue; }
        if (ov) continue;
        const rMu = 1100 / M * 1.2;
        if (!b.intersects(L.latLngBounds([lm.y - rMu, lm.x - rMu], [lm.y + rMu, lm.x + rMu]))) continue;
        this.overlays.set(key, 'pending');
        ME3D.topDown(lm.id).then(td => { if (!td || this.overlays.get(key) !== 'pending' || !this._map) return;
        const r = td.radius / M;
        const o2 = L.imageOverlay(td.url, [[lm.y - r, lm.x - r], [lm.y + r, lm.x + r]], { pane: 'overlayPane', interactive: false, className: 'model-overlay' });
        o2.addTo(map); this.overlays.set(key, o2);
        });
      }
    },
  });
})();
