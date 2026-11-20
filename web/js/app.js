// Map UI: CRS, layers, labels, places, search, place cards, events, journeys, measuring.
(function () {
  'use strict';
  const ME = window.ME;
  const V = window.ME_VECTORS;
  const W = V.world;
  const MU_TO_M = 1.609344;      // map units per real metre (see README "Scale")
  const HOBBITON = [519241, 955990];

  // ------------------------------------------------------------------ coordinates
  // Leaflet "latlng" here is [my, mx] in map units (y grows south).
  const CRS = L.extend({}, L.CRS.Simple, { transformation: new L.Transformation(256 / W, 0, 256 / W, 0), infinite: true });
  const ll = (x, y) => L.latLng(y, x);
  // Fictional latitude/longitude: Tolkien placed Hobbiton at about the latitude of Oxford.
  function geo(x, y) {
    const lat = 51.75 - (y - HOBBITON[1]) / 69000;
    const lon = -1.26 + (x - HOBBITON[0]) / (69000 * Math.cos(lat * Math.PI / 180));
    return `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`;
  }
  const km = (v) => (v / 1000).toFixed(1);
  const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  // ------------------------------------------------------------------ places
  const TYPE = {
    city: { cls: 'city', dot: true, minZ: 4, glyph: '●', bg: '#5f6368', label: 'City' },
    town: { cls: '', dot: true, minZ: 6, glyph: '●', bg: '#5f6368', label: 'Town' },
    village: { cls: '', dot: true, minZ: 7, glyph: '●', bg: '#5f6368', label: 'Village' },
    hamlet: { cls: '', dot: true, minZ: 9, glyph: '●', bg: '#5f6368', label: 'Hamlet' },
    haven: { cls: 'city', icon: '⚓', bg: '#1a73e8', minZ: 5, label: 'Haven' },
    fortress: { cls: '', icon: '♜', bg: '#5f6368', minZ: 6, label: 'Fortress' },
    citadel: { cls: '', icon: '♜', bg: '#757575', minZ: 7, label: 'Citadel' },
    tower: { cls: '', icon: '♜', bg: '#8d8d8d', minZ: 8, label: 'Tower' },
    ruin: { cls: '', icon: '⌂', bg: '#9e8e7e', minZ: 7, label: 'Ruins' },
    peak: { cls: 'mount', icon: '▲', bg: '#795548', minZ: 6, label: 'Mountain' },
    mountain: { cls: 'mount', icon: '▲', bg: '#795548', minZ: 6, label: 'Hill' },
    range: { cls: 'range', minZ: 5, maxZ: 8, label: 'Mountain range' },
    hills: { cls: 'mount', minZ: 6, label: 'Hills' },
    forest: { cls: 'forest', minZ: 5, label: 'Forest' },
    river: { cls: 'river', minZ: 6, label: 'River' },
    lake: { cls: 'water', minZ: 6, label: 'Lake' },
    sea: { cls: 'water', minZ: 4, label: 'Sea' },
    island: { cls: '', minZ: 5, label: 'Island' },
    marsh: { cls: 'forest', minZ: 6, label: 'Marshes' },
    region: { cls: 'region', minZ: 3, maxZ: 6, label: 'Region' },
    area: { cls: 'area', minZ: 5, maxZ: 10, label: 'Area' },
    landmark: { cls: '', icon: '★', bg: '#e8710a', minZ: 7, label: 'Landmark' },
    bridge: { cls: '', icon: '⌒', bg: '#80868b', minZ: 8, label: 'Bridge' },
    ford: { cls: '', icon: '≈', bg: '#4285f4', minZ: 7, label: 'Ford' },
    inn: { cls: '', icon: '🍺', bg: '#e37400', minZ: 10, label: 'Inn' },
    cave: { cls: '', icon: '◖', bg: '#5f6368', minZ: 7, label: 'Hidden refuge' },
    beacon: { cls: '', icon: '♨', bg: '#d93025', minZ: 7, label: 'Beacon hill' },
    pass: { cls: 'mount', minZ: 7, label: 'Pass' },
  };
  const siteByName = new Map(); V.sites.forEach(s => { if (s.n && !siteByName.has(s.n)) siteByName.set(s.n, s); });
  const labelByName = new Map(); V.labels.forEach(l => { if (!labelByName.has(l.n)) labelByName.set(l.n, l); });
  const PLACES = [];
  const placeByName = new Map();
  const usedSites = new Set(), usedLabels = new Set();
  function addPlace(p) {
    PLACES.push(p);
    for (const n of [p.name, ...(p.aka ? p.aka.split('·').map(s => s.trim()) : [])]) if (!placeByName.has(norm(n))) placeByName.set(norm(n), p);
  }
  // Encyclopedia of Arda cross-check (data/arda.js, tools/arda_compare.py): extra places, corrected
  // positions for hand-placed ones, and links to each place's Arda entry.
  const ARDA = window.ME_ARDA || { places: [], moves: [], links: {} };
  const ardaMove = new Map(ARDA.moves.map(m => [m.name, m.km]));
  for (const c of window.ME_PLACES) {
    let x, y;
    if (c.km && ardaMove.has(c.name) && !c.keep) { const k = ardaMove.get(c.name); x = k[0] * 1000; y = k[1] * 1000; }
    else if (c.km) { x = c.km[0] * 1000; y = c.km[1] * 1000; }
    else if (c.site && siteByName.has(c.site)) { const s = siteByName.get(c.site); x = s.x; y = s.y; usedSites.add(s); }
    else if (c.label && labelByName.has(c.label)) { const l = labelByName.get(c.label); x = l.x; y = l.y; usedLabels.add(l); }
    else { console.warn('place not found', c.name); continue; }
    if (c.label && labelByName.has(c.label)) usedLabels.add(labelByName.get(c.label));
    if (c.site && siteByName.has(c.site)) usedSites.add(siteByName.get(c.site));
    const t = TYPE[c.type] || TYPE.landmark;
    const az = (ARDA.links[c.name] || {}).z;
    if (az !== undefined && c.z !== undefined) c.z = Math.min(c.z, az);
    addPlace({ id: 'p:' + c.name, name: c.name, x, y, type: c.type, desc: c.desc, aka: c.aka, region: c.region, curated: true,
      minZ: c.z !== undefined ? Math.min(c.z, (c.rank || 5) >= 8 ? 4 : 99) : t.minZ, maxZ: c.maxz !== undefined ? c.maxz : t.maxZ, rank: 5 + (c.rank || 5) });
  }
  // ME-GIS settlements not covered above
  const siteType = { city: 'city', haven: 'haven', fortress: 'fortress', town: 'town', village: 'village', fort: 'fortress', citadel: 'citadel', tower: 'tower', ruin: 'ruin' };
  V.sites.forEach((s, i) => {
    if (!s.n || usedSites.has(s) || !siteType[s.k]) return;
    if (placeByName.has(norm(s.n))) return;
    const type = siteType[s.k];
    const merp = s.o === 'MERP';
    const sz = (ARDA.links[s.n] || {}).z;
    addPlace({ id: 's:' + i, name: s.n, x: s.x, y: s.y, type, minZ: Math.min(TYPE[type].minZ + (merp ? 1 : 0), sz === undefined ? 99 : sz), rank: merp ? 1 : 3, merp });
  });
  for (const a of ARDA.places) {
    if (placeByName.has(norm(a.name))) continue;
    const t = TYPE[a.type] || TYPE.landmark;
    addPlace({ id: 'a:' + a.name, name: a.name, x: a.km[0] * 1000, y: a.km[1] * 1000, type: a.type, arda: a.arda,
      minZ: a.z, maxZ: t.maxZ, rank: 2 });
  }
  const riverNames = new Set(V.rivers.filter(r => r.n).map(r => norm(r.n)));
  // ME-GIS natural-feature labels
  const layerType = { Sea: 'sea', Island: 'island', River: 'river', Wetland: 'marsh', Forest: 'forest', GeographicArea: 'area', Mountain: 'peak',
    Range: 'range', Region: 'region', Hills: 'hills', Lake: 'lake', Pass: 'pass', Fords: 'ford', FordsandCrossings: 'ford', Beacon: 'beacon',
    Plains: 'area', Moors: 'area', Vulcanism: 'peak', BurialSite: 'landmark', ManorHouse: 'landmark', Ruin: 'ruin' };
  V.labels.forEach((l, i) => {
    const type = layerType[l.l];
    if (!type || usedLabels.has(l)) return;
    let name = l.n.replace(/^R\. /, '');
    if (type === 'river') name = name.replace(/^River /, '');
    if (type === 'river' && riverNames.has(norm(name))) return; // labelled along the river instead
    if (placeByName.has(norm(name)) || placeByName.has(norm(l.n))) return;
    const t = TYPE[type];
    let angle = 0;
    if (type === 'river') angle = -(l.a || 0);
    if (type === 'range' || type === 'region') angle = l.a || 0;
    if (Math.abs(angle) > 70) angle = 0;
    const big = (l.h || 0) > 40;
    const lz = (ARDA.links[name] || ARDA.links[l.n] || {}).z;
    addPlace({ id: 'l:' + i, name: type === 'river' ? name : (type === 'region' ? name.charAt(0) + name.slice(1).toLowerCase() : name), x: l.x, y: l.y, type, angle,
      minZ: Math.min(t.minZ - (big ? 1 : 0), lz === undefined ? 99 : lz), maxZ: t.maxZ, rank: type === 'region' ? 6 : type === 'sea' ? 6 : type === 'range' ? 5 : 2 });
  });

  // River names placed along the rivers themselves, like an atlas: one label per ~150 km of each
  // named river, on its longest stretches, rotated to follow the water. Bigger rivers appear earlier.
  (function riverLabels() {
    const byName = new Map();
    for (const r of V.rivers) {
      if (!r.n || (placeByName.get(norm(r.n)) || {}).curated) continue;
      const p = r.p; let L = 0;
      for (let i = 2; i < p.length; i += 2) L += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
      if (L < 8000) continue;
      let a = byName.get(r.n); if (!a) byName.set(r.n, a = []);
      a.push({ r, L });
    }
    let n = 0;
    for (const [name, segs] of byName) {
      segs.sort((a, b) => b.L - a.L);
      const placed = [];
      for (const { r, L } of segs) {
        // point and direction at the middle of the segment
        const p = r.p; let acc = 0, half = L / 2, x = p[0], y = p[1], ang = 0;
        for (let i = 2; i < p.length; i += 2) {
          const d = Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
          if (acc + d >= half) { const t = (half - acc) / d; x = p[i - 2] + (p[i] - p[i - 2]) * t; y = p[i - 1] + (p[i + 1] - p[i - 1]) * t; ang = Math.atan2(p[i + 1] - p[i - 1], p[i] - p[i - 2]) * 180 / Math.PI; break; }
          acc += d;
        }
        if (placed.some(q => Math.hypot(q[0] - x, q[1] - y) < 150000)) continue;
        placed.push([x, y]);
        if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
        const w = r.w[1];
        const minZ = w > 300 ? 3 : w > 150 ? 4 : w > 60 ? 5 : w > 15 ? 6 : 7;
        addPlace({ id: 'r:' + (n++), name, x, y, type: 'river', angle: Math.round(ang), minZ, rank: w > 150 ? 5 : 2 });
      }
    }
  })();

  function labelItem(p) {
    const t = TYPE[p.type] || TYPE.landmark;
    return { id: p.id, name: p.name, x: p.x, y: p.y, cls: t.cls, dot: t.dot, icon: t.icon, iconBg: t.bg, minZ: p.minZ, maxZ: p.maxZ, rank: p.rank, angle: p.angle, ref: p };
  }

  // ------------------------------------------------------------------ events
  const BOOK = { H: ['The Hobbit', '#188038'], FR: ['The Fellowship of the Ring', '#1a73e8'], 'FR/TT': ['The Fellowship of the Ring', '#1a73e8'], TT: ['The Two Towers', '#e37400'],
    RK: ['The Return of the King', '#d93025'], App: ['Appendices', '#7b5ea7'], Sil: ['The Silmarillion', '#5e35b1'] };
  const KIND = { battle: '⚔️', ring: '💍', death: '🕯️', meeting: '🤝', journey: '🧭', wonder: '✨', fall: '🔥' };
  const MAJOR = new Set(['one-ring', 'isildur-ring', 'five-armies', 'long-expected', 'weathertop', 'council', 'bridge', 'breaking', 'helms-deep', 'isengard-falls', 'pelennor', 'ring-destroyed', 'black-gate-battle', 'grey-havens', 'smaug-death', 'dagorlad', 'coronation', 'shelob', 'riddles', 'lorien']);
  function resolve(at, kmv) {
    if (kmv) return [kmv[0] * 1000, kmv[1] * 1000];
    const p = placeByName.get(norm(at));
    if (p) return [p.x, p.y];
    const s = siteByName.get(at); if (s) return [s.x, s.y];
    const l = labelByName.get(at); if (l) return [l.x, l.y];
    return null;
  }
  const EVENTS = [];
  for (const e of window.ME_EVENTS) {
    const pos = resolve(e.at, e.km);
    if (!pos) { console.warn('event place not found', e.id, e.at); continue; }
    const sortKey = (e.era === 'FA' ? -20000 : e.era === 'SA' ? -10000 : e.era === 'FoA' ? 10000 : 0) + e.year + ((e.m || 0) * 31 + (e.d || 0)) / 400;
    EVENTS.push(Object.assign({}, e, { x: pos[0], y: pos[1], sortKey, place: placeByName.get(norm(e.at)) }));
  }
  EVENTS.sort((a, b) => a.sortKey - b.sortKey);

  // ------------------------------------------------------------------ map
  const map = L.map('map', {
    crs: CRS, zoomControl: false, attributionControl: true, minZoom: 2, maxZoom: 17, zoomSnap: 1,
    maxBounds: L.latLngBounds(ll(-W * 0.65, -W * 0.15), ll(W * 1.15, W * 1.15)), maxBoundsViscosity: 0.8, worldCopyJump: false,
    zoomAnimationThreshold: 6, wheelPxPerZoomLevel: 90,
  });
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution('Terrain: Arda/ME-DEM (CC BY 4.0) · Vectors: ME-GIS · Rendered procedurally · <a href="README.md" target="_blank">About</a>');
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  const bounds = L.latLngBounds(ll(-W * 0.6, 0), ll(W, W)); // includes the islands west of the DEM (data/islands.js)
  const state = { mode: 'satellite', terrain: true, labels: true, events: true, journeys: false };
  const layers = {
    satellite: new ME.TerrainLayer({ mode: 'satellite', opts: { models: !!window.ME3D }, bounds, maxNativeZoom: 17 }),
    map: new ME.TerrainLayer({ mode: 'map', opts: { terrain: true }, bounds, maxNativeZoom: 17 }),
  };

  // scale bar in Tolkien miles + real kilometres
  const Scale = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd() { this.el = L.DomUtil.create('div', 'me-scale'); map.on('zoomend moveend', this.update, this); this.update(); return this.el; },
    update() {
      const mu = 100 * W / (256 * Math.pow(2, map.getZoom()));
      const miles = mu / 1000, nice = (v) => { const p = Math.pow(10, Math.floor(Math.log10(v))); const f = v / p; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p; };
      let label, frac;
      if (miles >= 0.5) { const n = nice(miles); label = `${n} mi`; frac = n / miles; }
      else { const m = mu * MU_TO_M, n = nice(m); label = n >= 1000 ? `${n / 1000} km` : `${n} m`; frac = n / m; }
      this.el.innerHTML = `<span>${label}</span><span class="bar" style="width:${Math.round(100 * frac)}px"></span>`;
    },
  });
  new Scale().addTo(map);
  const Coords = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd() { this.el = L.DomUtil.create('div', 'me-coords'); map.on('mousemove', e => { this.el.textContent = geo(e.latlng.lng, e.latlng.lat); }); return this.el; },
  });
  new Coords().addTo(map);

  // ------------------------------------------------------------------ labels & events layers
  const labelLayer = new ME.LabelLayer(PLACES.map(labelItem), (it) => openPlace(it.ref));
  const eventLayer = L.layerGroup();
  const evGroups = new Map();
  for (const e of EVENTS) {
    const k = Math.round(e.x / 1500) + ':' + Math.round(e.y / 1500);
    let g = evGroups.get(k); if (!g) evGroups.set(k, g = { x: e.x, y: e.y, events: [] });
    g.events.push(e);
  }
  function pinIcon(g) {
    const last = g.events[g.events.length - 1];
    const col = BOOK[last.book] ? BOOK[last.book][1] : '#d93025';
    const glyph = KIND[last.kind] || '📍';
    const count = g.events.length > 1 ? `<span style="position:absolute;right:-4px;top:-4px;background:#fff;color:#202124;border-radius:8px;font:600 10px Roboto,Arial;padding:0 4px;box-shadow:0 0 2px rgba(0,0,0,.4)">${g.events.length}</span>` : '';
    return L.divIcon({ className: '', iconSize: [30, 38], iconAnchor: [15, 37],
      html: `<div class="evpin"><svg viewBox="0 0 30 38"><path d="M15 37c-1-4-3-8-7-12A12 12 0 1 1 22 25c-4 4-6 8-7 12z" fill="${col}" stroke="rgba(0,0,0,.25)"/><circle cx="15" cy="13" r="8.5" fill="#fff"/></svg><span class="g">${glyph}</span>${count}</div>` });
  }
  for (const g of evGroups.values()) {
    g.major = g.events.some(e => MAJOR.has(e.id));
    g.marker = L.marker(ll(g.x, g.y), { icon: pinIcon(g), riseOnHover: true, keyboard: false, title: g.events.map(e => e.title).join(' · ') });
    g.marker.on('click', () => openEvents(g));
  }
  function updateEventPins() {
    const z = map.getZoom();
    for (const g of evGroups.values()) {
      const show = state.events && (g.major ? z >= 5 : z >= 7);
      if (show && !eventLayer.hasLayer(g.marker)) eventLayer.addLayer(g.marker);
      if (!show && eventLayer.hasLayer(g.marker)) eventLayer.removeLayer(g.marker);
    }
  }
  map.on('zoomend', updateEventPins);

  // ------------------------------------------------------------------ 3D landmark badges
  const badgeLayer = L.layerGroup();
  if (window.ME3D) for (const lm of ME3D.landmarks()) {
    const m = L.marker(ll(lm.x, lm.y), { icon: L.divIcon({ className: '', iconSize: [40, 20], iconAnchor: [-6, 30], html: '<div class="pin3d" title="Open in 3D">🧊 3D</div>' }), keyboard: false, zIndexOffset: -100 });
    m.on('click', () => ME3D.open(lm.id, lm));
    badgeLayer.addLayer(m);
  }
  const updateBadges = () => { if (map.getZoom() >= 8) badgeLayer.addTo(map); else map.removeLayer(badgeLayer); };
  map.on('zoomend', updateBadges);

  // ------------------------------------------------------------------ journeys
  const journeyLayer = L.layerGroup();
  const journeyLines = [];
  // Routes follow roads and rivers where they can (js/routes.js); computed lazily on first show.
  function buildJourneys() {
    if (journeyLines.length) return;
    const toStops = (list, j) => {
      const stops = [];
      for (const w of list) {
        const o = (w && !Array.isArray(w) && typeof w === 'object') ? w : { at: w };
        const p = Array.isArray(o.at) ? [o.at[0] * 1000, o.at[1] * 1000] : o.km ? [o.km[0] * 1000, o.km[1] * 1000] : resolve(o.at);
        if (p) stops.push({ x: p[0], y: p[1], by: o.by }); else console.warn('journey waypoint not found', j.id, o.at);
      }
      return stops;
    };
    const lengthOf = (path) => { let m = 0; for (let i = 1; i < path.length; i++) m += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]) / 1000; return m; };
    window.ME_JOURNEYS.forEach((j, ji) => {
      const stops = toStops(j.pts, j);
      const r = ME.routeJourney(stops, ji * 7.3 + 1);
      const parts = [], ends = [];
      // outward route: solid line
      let miles = lengthOf(r.path);
      const pts = r.path.map(q => ll(q[0], q[1]));
      parts.push(L.polyline(pts, { color: '#ffffff', weight: 7, opacity: 0.9, lineJoin: 'round', lineCap: 'round', interactive: false, smoothFactor: 0.6 }));
      const line = L.polyline(pts, { color: j.color, weight: 4.5, opacity: 0.95, lineJoin: 'round', lineCap: 'round', smoothFactor: 0.6 });
      parts.push(line);
      // the way back, where it differs from the way out: dashed
      let backMiles = 0;
      if (j.back) {
        const br = ME.routeJourney(toStops(j.back, j), ji * 7.3 + 5);
        backMiles = lengthOf(br.path);
        const bpts = br.path.map(q => ll(q[0], q[1]));
        parts.push(L.polyline(bpts, { color: '#ffffff', weight: 6, opacity: 0.75, lineJoin: 'round', lineCap: 'round', interactive: false, smoothFactor: 0.6 }));
        const bl = L.polyline(bpts, { color: j.color, weight: 3.5, opacity: 0.9, dashArray: '2 9', lineCap: 'round', smoothFactor: 0.6 });
        bl.bindTooltip(`<b>${j.name}</b>: the way back<br>${j.backNote || ''}`, { sticky: true, className: 'jt' });
        parts.push(bl);
      }
      line.bindTooltip(`<b>${j.name}</b>${j.back ? ': the way out' : ''}<br>${j.book}<br>about ${Math.round(miles / 10) * 10} miles`, { sticky: true, className: 'jt' });
      for (const [s, k] of [[stops[0], 0], [stops[stops.length - 1], 1]]) parts.push(L.circleMarker(ll(s.x, s.y), { radius: k ? 6 : 5, color: '#fff', weight: 2, fillColor: j.color, fillOpacity: 1, interactive: false }));
      const grp = L.layerGroup(parts);
      // a round trip counts the outward road twice except where the way back differs
      journeyLines.push({ j, grp, on: true, miles: j.back ? miles + backMiles + (miles - lengthOf(r.path.slice(0, nearestIndex(r.path, toStops(j.back, j).slice(-1)[0])))) : miles });
      journeyLayer.addLayer(grp);
    });
  }
  function nearestIndex(path, s) { let bi = 0, bd = Infinity; path.forEach((q, i) => { const d = Math.hypot(q[0] - s.x, q[1] - s.y); if (d < bd) { bd = d; bi = i; } }); return bi + 1; }


  // ------------------------------------------------------------------ mode switching
  const mapEl = document.getElementById('map');
  const modelLayer = window.ME3D ? new ME3D.OverlayLayer() : null;
  function setMode(mode) {
    state.mode = mode;
    if (modelLayer) { if (mode === 'satellite') modelLayer.addTo(map); else map.removeLayer(modelLayer); }
    for (const [k, l] of Object.entries(layers)) { if (k === mode) { if (!map.hasLayer(l)) l.addTo(map); } else if (map.hasLayer(l)) map.removeLayer(l); }
    mapEl.classList.toggle('mode-map', mode === 'map');
    mapEl.classList.toggle('mode-sat', mode !== 'map');
    document.body.classList.toggle('mode-sat', mode !== 'map');
    document.getElementById('thumb-label').textContent = mode === 'map' ? 'Satellite' : 'Map';
    document.getElementById('opt-terrain').parentElement.style.display = mode === 'map' ? '' : 'none';
    updateThumb(); saveHash();
  }
  document.getElementById('layer-thumb').onclick = () => setMode(state.mode === 'map' ? 'satellite' : 'map');
  document.getElementById('opt-terrain').onchange = (e) => { layers.map.options.opts = { terrain: e.target.checked }; layers.map.redraw(); };
  document.getElementById('opt-labels').onchange = (e) => { state.labels = e.target.checked; if (state.labels) labelLayer.addTo(map); else map.removeLayer(labelLayer); };
  document.getElementById('opt-events').onchange = (e) => { state.events = e.target.checked; updateEventPins(); };
  document.getElementById('opt-journeys').onchange = (e) => setJourneys(e.target.checked);
  function setJourneys(on) {
    state.journeys = on;
    document.getElementById('opt-journeys').checked = on;
    if (on) { buildJourneys(); journeyLayer.addTo(map); showLegend('journeys'); } else { map.removeLayer(journeyLayer); if (legendMode === 'journeys') hideLegend(); }
    chip('journeys', on);
  }
  let thumbTimer;
  function updateThumb() {
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(async () => {
      const c = map.getCenter();
      const other = state.mode === 'map' ? 'satellite' : 'map';
      const snap = await ME.snapshot(c.lng, c.lat, Math.max(2, map.getZoom() - 1), 80, 80, other, { terrain: true });
      const t = document.getElementById('thumb-canvas'); t.getContext('2d').drawImage(snap, 0, 0);
    }, 400);
  }
  map.on('moveend', updateThumb);

  // ------------------------------------------------------------------ card
  const card = document.getElementById('card');
  const searchEl = document.getElementById('search');
  const clearBtn = document.getElementById('clear-btn');
  const searchBtn = document.getElementById('search-btn');
  let selMarker = null;
  function selectPin(x, y) {
    if (selMarker) map.removeLayer(selMarker);
    selMarker = L.marker(ll(x, y), { zIndexOffset: 1000, interactive: false, icon: L.divIcon({ className: '', iconSize: [27, 43], iconAnchor: [13.5, 43],
      html: '<svg width="27" height="43" viewBox="0 0 27 43"><path d="M13.5 42c-1-5-4-10-8-15A13 13 0 1 1 21.5 27c-4 5-7 10-8 15z" fill="#ea4335" stroke="#a50e0e"/><circle cx="13.5" cy="13.5" r="4.5" fill="#a50e0e"/></svg>' }) }).addTo(map);
  }
  function closeCard() { card.hidden = true; card.innerHTML = ''; clearBtn.hidden = true; searchBtn.hidden = false; if (selMarker) { map.removeLayer(selMarker); selMarker = null; } }
  clearBtn.onclick = () => { searchEl.value = ''; closeCard(); };
  const esc = (s) => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function photoZoom(p) {
    return { region: 6, range: 7, sea: 6, area: 9, forest: 9, city: 14, haven: 14, town: 14, village: 15, fortress: 14, citadel: 14, tower: 16, ruin: 15, peak: 11, mountain: 13, landmark: 14, hills: 11, marsh: 11, lake: 11, island: 9 }[p.type] || 13;
  }
  // Card header: a film still (hotlinked from the LOTR Fandom wiki, see data/photos.js) when we have
  // one, with a toggle to the procedurally rendered aerial view of the spot.
  const PHOTOS = window.ME_PHOTOS || {};
  const PHOTO_HTML = '<div class="photo-wrap"><img class="photo" alt="" referrerpolicy="no-referrer"><div class="ph-tabs" hidden><button data-ph="film" class="on">🎬 Film</button><button data-ph="aerial">🛰️ Aerial</button></div><a class="ph-credit" target="_blank" rel="noopener" hidden></a></div>';
  async function setPhoto(img, x, y, z, still) {
    const wrap = img.parentElement, tabs = wrap.querySelector('.ph-tabs'), credit = wrap.querySelector('.ph-credit');
    let aerial = null;
    const showAerial = async () => {
      credit.hidden = true;
      if (!aerial) aerial = (await ME.snapshot(x, y, z, 784, 400, 'satellite')).toDataURL('image/jpeg', 0.85);
      if (img.isConnected) img.src = aerial;
    };
    const showFilm = () => {
      img.src = still.src;
      credit.hidden = false;
      credit.href = still.page;
      credit.textContent = `${still.film} · via LOTR Fandom wiki`;
    };
    if (!still) { tabs.hidden = true; return showAerial(); }
    tabs.hidden = false;
    tabs.querySelectorAll('button').forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      tabs.querySelectorAll('button').forEach(o => o.classList.toggle('on', o === b));
      if (b.dataset.ph === 'film') showFilm(); else showAerial();
    });
    img.onerror = () => { if (img.src === still.src) { tabs.hidden = true; showAerial(); } }; // offline or link gone
    showFilm();
  }

  function nearby(x, y, n, exclude) {
    return PLACES.filter(p => p !== exclude && p.curated).map(p => [p, Math.hypot(p.x - x, p.y - y)]).sort((a, b) => a[1] - b[1]).slice(0, n);
  }
  function eventsNear(x, y, r) { return EVENTS.filter(e => Math.hypot(e.x - x, e.y - y) < r); }
  function eventRow(e) {
    const b = BOOK[e.book] || ['', '#666'];
    return `<div class="ev" data-ev="${e.id}"><span class="badge">${KIND[e.kind] || '📍'}</span><div><div>${esc(e.title)}</div><div class="date">${esc(e.date)} · <span style="color:${b[1]}">${esc(b[0])}</span></div></div></div>`;
  }
  function wireCard() {
    card.querySelectorAll('[data-ev]').forEach(el => el.onclick = () => { const e = EVENTS.find(v => v.id === el.dataset.ev); if (e) openEvent(e); });
    card.querySelectorAll('[data-place]').forEach(el => el.onclick = () => { const p = PLACES.find(v => v.id === el.dataset.place); if (p) openPlace(p); });
  }
  function showCard(html) { card.innerHTML = html; card.hidden = false; card.scrollTop = 0; clearBtn.hidden = false; searchBtn.hidden = true; wireCard(); }
  function openPlace(p, fly = true) {
    const t = TYPE[p.type] || TYPE.landmark;
    searchEl.value = p.name;
    hideSuggest();
    const evs = eventsNear(p.x, p.y, p.type === 'region' ? 0 : p.type === 'area' || p.type === 'forest' ? 40000 : 3000);
    const near = nearby(p.x, p.y, 5, p).filter(([, d]) => d < 120000);
    showCard(`
      ${PHOTO_HTML}
      <div class="body"><h1>${esc(p.name)}</h1>${p.aka ? `<div class="aka">${esc(p.aka)}</div>` : ''}
        <div class="cat">${esc(t.label)}${p.region ? ' · ' + esc(p.region) : ''}${p.merp ? ' · from Middle-earth Role Playing (non-canonical)' : ''}</div></div>
      <div class="actions">
        <button class="act" data-a="zoom"><span class="ring">⌖</span>Zoom</button>
        <button class="act" data-a="measure"><span class="ring">📏</span>Measure</button>
        <button class="act" data-a="share"><span class="ring">🔗</span>Share</button>
        <button class="act" data-a="view"><span class="ring">${state.mode === 'map' ? '🛰️' : '🗺️'}</span>${state.mode === 'map' ? 'Satellite' : 'Map'}</button>
        ${lm3d(p) ? '<button class="act" data-a="3d"><span class="ring">🧊</span>3D</button>' : ''}
      </div>
      ${p.desc ? `<div class="desc">${esc(p.desc)}</div>` : ''}
      ${(p.arda || (ARDA.links[p.name] || {}).url) ? `<div class="row"><span class="ri">📖</span><a href="${p.arda || (ARDA.links[p.name] || {}).url}" target="_blank" rel="noopener">Read about ${esc(p.name)} in the Encyclopedia of Arda</a></div>` : ''}
      <div class="row"><span class="ri">📍</span><span>${geo(p.x, p.y)}<br><span style="color:#70757a;font-size:12px">${km(p.x)} km E, ${km(p.y)} km S of the map's north-west corner</span></span></div>
      ${evs.length ? `<h2>What happened here</h2>${evs.map(eventRow).join('')}` : ''}
      ${near.length ? `<h2>Nearby</h2>${near.map(([q, d]) => `<div class="ev" data-place="${q.id}"><span class="badge">${(TYPE[q.type] || {}).icon || '•'}</span><div><div>${esc(q.name)}</div><div class="date">${Math.round(d / 1000)} miles ${dir(p, q)}</div></div></div>`).join('')}` : ''}
      <div class="src">Imagery is procedurally rendered from the ME-DEM elevation model — an artist's reconstruction, not a canonical depiction.</div>`);
    card.querySelector('[data-a=zoom]').onclick = () => map.flyTo(ll(p.x, p.y), Math.max(photoZoom(p), map.getZoom()));
    card.querySelector('[data-a=measure]').onclick = () => startMeasure(ll(p.x, p.y));
    card.querySelector('[data-a=share]').onclick = () => { const u = location.href.split('#')[0] + `#${photoZoom(p)}/${km(p.x)}/${km(p.y)}/${state.mode}`; navigator.clipboard && navigator.clipboard.writeText(u); toast('Link copied'); };
    card.querySelector('[data-a=view]').onclick = () => { setMode(state.mode === 'map' ? 'satellite' : 'map'); openPlace(p, false); };
    const b3 = card.querySelector('[data-a="3d"]'); if (b3) b3.onclick = () => { const l = lm3d(p); ME3D.open(l.id, l); };
    setPhoto(card.querySelector('.photo'), p.x, p.y, photoZoom(p), PHOTOS['p:' + p.name]);
    selectPin(p.x, p.y);
    if (fly) {
      const z = p.type === 'region' ? 5 : p.type === 'range' || p.type === 'sea' ? 6 : p.type === 'area' || p.type === 'forest' ? 8 : Math.max(Math.min(photoZoom(p) - 2, 12), 9);
      map.flyTo(ll(p.x - 0.0 * W, p.y), z, { duration: 1.2 });
    }
  }
  function lm3d(p) { return window.ME3D ? ME3D.forPlace(p.name, p.x, p.y) : null; }
  const EVENT_3D = { bridge: 'bridgeKhazadDum', 'durins-bane': 'bridgeKhazadDum', entmoot: 'derndingle' };
  function dir(a, b) {
    const ang = Math.atan2(-(b.y - a.y), b.x - a.x) * 180 / Math.PI;
    return ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'][((Math.round(ang / 45) % 8) + 8) % 8];
  }
  function openEvent(e) {
    const b = BOOK[e.book] || ['', '#666'];
    searchEl.value = e.title; hideSuggest();
    const same = EVENTS.filter(v => v !== e && Math.hypot(v.x - e.x, v.y - e.y) < 3000);
    const idx = EVENTS.indexOf(e), prev = EVENTS[idx - 1], next = EVENTS[idx + 1];
    showCard(`
      ${PHOTO_HTML}
      <div class="body"><h1>${KIND[e.kind] || ''} ${esc(e.title)}</h1><div class="cat">${esc(e.date)}</div>
      <div class="cat" style="color:${b[1]}">${esc(b[0])}</div></div>
      <div class="desc">${esc(e.desc)}</div>
      ${(EVENT_3D[e.id] || (e.place && lm3d(e.place))) ? '<div class="ev" data-a="ev3d"><span class="badge">🧊</span><div><div>See it in 3D</div><div class="date">Explore the scene</div></div></div>' : ''}
      ${e.place ? `<div class="ev" data-place="${e.place.id}"><span class="badge">📍</span><div><div>${esc(e.place.name)}</div><div class="date">${esc((TYPE[e.place.type] || {}).label || '')}</div></div></div>` : ''}
      ${same.length ? `<h2>Also here</h2>${same.map(eventRow).join('')}` : ''}
      <h2>Timeline</h2>${prev ? eventRow(prev) : ''}${next ? eventRow(next) : ''}`);
    setPhoto(card.querySelector('.photo'), e.x, e.y, e.place ? photoZoom(e.place) : 13, PHOTOS['e:' + e.id] || (e.place && PHOTOS['p:' + e.place.name]));
    const e3 = card.querySelector('[data-a="ev3d"]');
    if (e3) e3.onclick = () => { const l = (e.place && lm3d(e.place)) || ME3D.landmarks().find(x => x.id === EVENT_3D[e.id] || (x.extra || []).includes(EVENT_3D[e.id])); ME3D.open(EVENT_3D[e.id] || l.id, l); };
    selectPin(e.x, e.y);
    map.flyTo(ll(e.x, e.y), Math.max(map.getZoom(), 9), { duration: 1.2 });
  }
  function openEvents(g) { if (g.events.length === 1) return openEvent(g.events[0]); openEvent(g.events[g.events.length - 1]); }

  // ------------------------------------------------------------------ search
  const sugg = document.getElementById('suggestions');
  let suggItems = [], suggActive = -1;
  function hideSuggest() { sugg.hidden = true; suggActive = -1; }
  function search(q) {
    const n = norm(q); if (!n) return [];
    const out = [];
    for (const p of PLACES) {
      const names = [p.name, ...(p.aka ? p.aka.split('·') : [])].map(norm);
      let s = 0;
      for (const nm of names) { if (nm === n) s = Math.max(s, 100); else if (nm.startsWith(n)) s = Math.max(s, 60); else if (nm.includes(' ' + n)) s = Math.max(s, 40); else if (nm.includes(n)) s = Math.max(s, 25); }
      if (s) out.push({ kind: 'place', p, s: s + (p.curated ? 15 : 0) + p.rank });
    }
    for (const e of EVENTS) { const t = norm(e.title); if (t.includes(n)) out.push({ kind: 'event', e, s: (t.startsWith(n) ? 50 : 30) + 10 }); }
    return out.sort((a, b) => b.s - a.s).slice(0, 8);
  }
  function renderSuggest() {
    if (!suggItems.length) { hideSuggest(); return; }
    sugg.innerHTML = suggItems.map((r, i) => r.kind === 'place'
      ? `<div class="sugg${i === suggActive ? ' active' : ''}" data-i="${i}"><span class="ico">${(TYPE[r.p.type] || {}).icon || '📍'}</span><div><b>${esc(r.p.name)}</b><div class="sub">${esc((TYPE[r.p.type] || {}).label || '')}${r.p.region ? ' · ' + esc(r.p.region) : ''}</div></div></div>`
      : `<div class="sugg${i === suggActive ? ' active' : ''}" data-i="${i}"><span class="ico">${KIND[r.e.kind] || '📅'}</span><div><b>${esc(r.e.title)}</b><div class="sub">${esc(r.e.date)}</div></div></div>`).join('');
    sugg.hidden = false;
    sugg.querySelectorAll('.sugg').forEach(el => el.onclick = () => pick(+el.dataset.i));
  }
  function pick(i) { const r = suggItems[i]; if (!r) return; if (r.kind === 'place') openPlace(r.p); else openEvent(r.e); }
  searchEl.addEventListener('input', () => { suggItems = search(searchEl.value); suggActive = -1; renderSuggest(); });
  searchEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { suggActive = Math.min(suggItems.length - 1, suggActive + 1); renderSuggest(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { suggActive = Math.max(0, suggActive - 1); renderSuggest(); e.preventDefault(); }
    else if (e.key === 'Enter') { pick(suggActive >= 0 ? suggActive : 0); }
    else if (e.key === 'Escape') hideSuggest();
  });
  searchEl.addEventListener('focus', () => { if (searchEl.value) { suggItems = search(searchEl.value); renderSuggest(); } });
  searchBtn.onclick = () => pick(0);
  map.on('click', () => hideSuggest());

  // ------------------------------------------------------------------ legend / timeline / chips
  const legend = document.getElementById('legend');
  let legendMode = null;
  function hideLegend() { legend.hidden = true; legendMode = null; chip('events', false); chip('cities', false); chip('landmarks', false); }
  function chip(name, on) { const c = document.querySelector(`[data-chip=${name}]`); if (c) c.classList.toggle('on', on); }
  function showLegend(mode) {
    legendMode = mode;
    legend.hidden = false;
    if (mode === 'journeys') {
      legend.innerHTML = `<h3>Journeys</h3>${journeyLines.map((r, i) => `<div class="jr${r.on ? '' : ' off'}" data-j="${i}"><span class="sw" style="background:${r.j.color}"></span><div><div>${esc(r.j.name)}</div><div style="color:#70757a;font-size:11px">${esc(r.j.book)} · ~${Math.round(r.miles / 10) * 10} mi</div></div></div>`).join('')}<div class="note">Solid: the way there. Dashed: a different way back (Bilbo). Routes follow roads and rivers where the story does; overland stretches are approximate. Click to show or hide.</div>`;
      legend.querySelectorAll('.jr').forEach(el => el.onclick = () => {
        const r = journeyLines[+el.dataset.j]; r.on = !r.on;
        if (r.on) journeyLayer.addLayer(r.grp); else journeyLayer.removeLayer(r.grp);
        el.classList.toggle('off', !r.on);
      });
    } else if (mode === 'events') {
      const books = ['all', 'Sil', 'App', 'H', 'FR', 'TT', 'RK'];
      const names = { all: 'All', Sil: 'Elder days', App: 'Appendices', H: 'Hobbit', FR: 'Fellowship', TT: 'Two Towers', RK: 'Return' };
      let filter = 'all';
      const draw = () => {
        const list = EVENTS.filter(e => filter === 'all' || e.book === filter || (filter === 'FR' && e.book === 'FR/TT'));
        legend.innerHTML = `<h3>Timeline of events</h3><div class="tl-filter">${books.map(b => `<button data-b="${b}" class="${b === filter ? 'on' : ''}">${names[b]}</button>`).join('')}</div>
          <div class="timeline">${list.map(e => `<div class="tl-item" data-ev="${e.id}"><span>${KIND[e.kind] || '📍'}</span><div><div>${esc(e.title)}</div><div class="date">${esc(e.date)}</div></div></div>`).join('')}</div>`;
        legend.querySelectorAll('[data-b]').forEach(el => el.onclick = () => { filter = el.dataset.b; draw(); });
        legend.querySelectorAll('[data-ev]').forEach(el => el.onclick = () => openEvent(EVENTS.find(v => v.id === el.dataset.ev)));
      };
      draw();
    } else {
      const list = mode === 'cities' ? PLACES.filter(p => p.curated && ['city', 'haven', 'town', 'village'].includes(p.type)) : PLACES.filter(p => p.curated && ['fortress', 'peak', 'landmark', 'ruin', 'mountain', 'cave', 'bridge', 'ford'].includes(p.type));
      legend.innerHTML = `<h3>${mode === 'cities' ? 'Cities & towns' : 'Landmarks'}</h3><div class="timeline">${list.sort((a, b) => b.rank - a.rank).map(p => `<div class="tl-item" data-place="${p.id}"><span>${(TYPE[p.type] || {}).icon || '●'}</span><div><div>${esc(p.name)}</div><div class="date">${esc(p.region || (TYPE[p.type] || {}).label)}</div></div></div>`).join('')}</div>`;
      legend.querySelectorAll('[data-place]').forEach(el => el.onclick = () => openPlace(PLACES.find(v => v.id === el.dataset.place)));
    }
  }
  document.querySelectorAll('.chip').forEach(c => c.onclick = () => {
    const name = c.dataset.chip;
    if (name === 'journeys') { setJourneys(!state.journeys); return; }
    if (legendMode === name) { hideLegend(); return; }
    hideLegend(); showLegend(name); chip(name, true);
  });

  // ------------------------------------------------------------------ context menu, measure, toast
  const ctx = document.getElementById('ctxmenu');
  map.on('contextmenu', (e) => {
    const p = e.containerPoint, x = e.latlng.lng, y = e.latlng.lat;
    ctx.innerHTML = `<div class="coords">${geo(x, y)}<br>${km(x)} km E, ${km(y)} km S</div><div data-c="what">What's here?</div><div data-c="measure">Measure distance</div><div data-c="copy">Copy map coordinates</div><div data-c="center">Centre map here</div>`;
    ctx.style.left = p.x + 'px'; ctx.style.top = p.y + 'px'; ctx.hidden = false;
    ctx.querySelector('[data-c=what]').onclick = () => { ctx.hidden = true; whatsHere(x, y); };
    ctx.querySelector('[data-c=measure]').onclick = () => { ctx.hidden = true; startMeasure(e.latlng); };
    ctx.querySelector('[data-c=copy]').onclick = () => { ctx.hidden = true; navigator.clipboard && navigator.clipboard.writeText(`[${km(x)}, ${km(y)}]`); toast(`Copied [${km(x)}, ${km(y)}] (map km)`); };
    ctx.querySelector('[data-c=center]').onclick = () => { ctx.hidden = true; map.panTo(e.latlng); };
  });
  map.on('click movestart', () => { ctx.hidden = true; });
  function whatsHere(x, y) {
    const near = nearby(x, y, 6, null);
    const evs = eventsNear(x, y, 6000);
    showCard(`${PHOTO_HTML}<div class="body"><h1>${geo(x, y)}</h1><div class="cat">${km(x)} km E, ${km(y)} km S · map coordinates [${km(x)}, ${km(y)}]</div></div>
      ${evs.length ? `<h2>What happened here</h2>${evs.map(eventRow).join('')}` : ''}
      <h2>Nearest places</h2>${near.map(([q, d]) => `<div class="ev" data-place="${q.id}"><span class="badge">${(TYPE[q.type] || {}).icon || '•'}</span><div><div>${esc(q.name)}</div><div class="date">${Math.round(d / 1000)} miles ${dir({ x, y }, q)}</div></div></div>`).join('')}`);
    setPhoto(card.querySelector('.photo'), x, y, Math.max(map.getZoom(), 10));
    selectPin(x, y);
  }
  const mbox = document.getElementById('measure-box');
  let measure = null;
  function startMeasure(start) {
    if (measure) measure.layer.remove();
    measure = { pts: [start], layer: L.layerGroup().addTo(map) };
    map.getContainer().style.cursor = 'crosshair';
    drawMeasure();
  }
  function drawMeasure() {
    const m = measure; m.layer.clearLayers();
    L.polyline(m.pts, { color: '#000', weight: 4, opacity: 0.5 }).addTo(m.layer);
    L.polyline(m.pts, { color: '#fff', weight: 2, dashArray: '6 6' }).addTo(m.layer);
    m.pts.forEach(p => L.circleMarker(p, { radius: 5, color: '#000', weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(m.layer));
    let d = 0; for (let i = 1; i < m.pts.length; i++) d += Math.hypot(m.pts[i].lng - m.pts[i - 1].lng, m.pts[i].lat - m.pts[i - 1].lat);
    const miles = d / 1000;
    mbox.innerHTML = `<span><b>${miles < 10 ? miles.toFixed(2) : Math.round(miles).toLocaleString()} miles</b> · ${(miles / 3).toFixed(1)} leagues · ${(d * MU_TO_M / 1000).toFixed(1)} km · ~${Math.max(1, Math.round(miles / 20))} days on foot</span><button id="m-clear">Clear</button>`;
    mbox.hidden = false;
    mbox.querySelector('#m-clear').onclick = () => { measure.layer.remove(); measure = null; mbox.hidden = true; map.getContainer().style.cursor = ''; };
  }
  map.on('click', (e) => { if (measure) { measure.pts.push(e.latlng); drawMeasure(); } });
  let toastT;
  function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2500); }

  // ------------------------------------------------------------------ URL state
  function saveHash() {
    const c = map.getCenter();
    history.replaceState(null, '', `#${map.getZoom()}/${km(c.lng)}/${km(c.lat)}/${state.mode}`);
  }
  map.on('moveend', saveHash);
  const h = location.hash.slice(1).split('/');
  let start = { z: 3, x: 1000000, y: 1080000, mode: 'satellite' };
  if (h.length >= 3 && !isNaN(+h[0])) start = { z: +h[0], x: +h[1] * 1000, y: +h[2] * 1000, mode: h[3] === 'map' ? 'map' : 'satellite' };
  map.setView(ll(start.x, start.y), start.z, { animate: false });
  setMode(start.mode);
  labelLayer.addTo(map);
  eventLayer.addTo(map);
  updateEventPins();
  updateBadges();
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { hideSuggest(); if (measure) mbox.querySelector('#m-clear').click(); } });
  // menu -> about card
  document.getElementById('menu-btn').onclick = () => {
    showCard(`<div class="body"><h1>Middle-earth Maps</h1><div class="cat">A Google-Maps-style atlas of Arda's Third Age</div></div>
      <div class="desc">Satellite imagery is rendered live in your browser from the ME-DEM elevation model and ME-GIS layers, so you can zoom from the whole continent down to single roofs in Minas Tirith or hobbit-holes in Hobbiton.<br><br>
      <b>Tips</b><br>• Search places and events in the box above.<br>• Right-click the map: coordinates, <i>What's here?</i>, measure distance.<br>• Bottom-left square: switch Map / Satellite; hover it for Terrain, Labels, Events and Journeys.<br>• Chips at the top: event timeline, journeys, cities, landmarks.<br>• The URL always holds the current view, so you can share it.</div>
      <div class="desc" style="font-size:12px;color:#70757a">${PLACES.filter(p => p.curated).length} described places · ${EVENTS.length} events · ${window.ME_JOURNEYS.length} journeys.<br>
      Terrain: Arda 32k DEM (CC BY 4.0) · Vectors: ME-GIS · Map library: Leaflet. Middle-earth is the creation of J.R.R. Tolkien; this is a non-commercial fan project. See README.md to contribute.</div>`);
  };
  ME.map = map; ME.places = PLACES; ME.events = EVENTS; ME.openPlace = openPlace; ME.setMode = setMode;
})();
