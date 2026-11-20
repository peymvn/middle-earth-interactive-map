// DOM label layer with Google-style collision handling: on every zoom/move the visible
// candidates are sorted by rank and placed greedily, skipping any that overlap a placed label.
(function () {
  'use strict';
  const ME = window.ME = window.ME || {};
  const measure = document.createElement('canvas').getContext('2d');
  const widthCache = new Map();
  function textWidth(text, font) {
    const k = font + '|' + text;
    let w = widthCache.get(k);
    if (w === undefined) { measure.font = font; w = measure.measureText(text).width; widthCache.set(k, w); }
    return w;
  }
  const FONTS = {
    city: '500 14px Roboto, Arial', region: '500 15px Roboto, Arial', area: '12px Roboto, Arial', water: 'italic 12px Roboto, Arial',
    river: 'italic 11px Roboto, Arial', mount: 'italic 12px Roboto, Arial', range: 'italic 13px Roboto, Arial', forest: 'italic 12px Roboto, Arial', '': '12px Roboto, Arial',
  };
  const SPACING = { region: 0.32, area: 0.18, range: 0.25 };

  ME.LabelLayer = L.Layer.extend({
    initialize(items, onClick) { this.items = items; this.onClick = onClick; this.els = new Map(); },
    onAdd(map) {
      this._map = map;
      this.pane = map.getPane('labels') || map.createPane('labels');
      this.pane.style.zIndex = 450;
      this.pane.style.pointerEvents = 'none';
      this.root = L.DomUtil.create('div', 'me-labels', this.pane);
      map.on('zoomend moveend resize', this.layout, this);
      map.on('zoomstart', this._hide, this);
      this.layout();
    },
    onRemove(map) {
      map.off('zoomend moveend resize', this.layout, this);
      map.off('zoomstart', this._hide, this);
      this.root.remove(); this.els.clear();
    },
    _hide() { this.root.style.display = 'none'; },
    setItems(items) { this.items = items; this.layout(); },
    layout() {
      const map = this._map; if (!map) return;
      this.root.style.display = '';
      const z = map.getZoom();
      const size = map.getSize();
      const pad = 80;
      const placed = [];
      const used = new Set();
      const cands = [];
      for (const it of this.items) {
        if (z < it.minZ || z > (it.maxZ === undefined ? 99 : it.maxZ)) continue;
        const p = map.latLngToContainerPoint([it.y, it.x]);
        if (p.x < -pad || p.y < -pad || p.x > size.x + pad || p.y > size.y + pad) continue;
        cands.push([it, p]);
      }
      cands.sort((a, b) => b[0].rank - a[0].rank || a[0].minZ - b[0].minZ);
      for (const [it, p] of cands) {
        const font = FONTS[it.cls] || FONTS[''];
        const sp = SPACING[it.cls] || 0;
        const tw = textWidth(it.cls === 'region' || it.cls === 'area' ? it.name.toUpperCase() : it.name, font) * (1 + sp * 0.6) + (it.icon ? 24 : it.dot ? 14 : 0);
        const th = 16;
        let box;
        if (it.icon || it.dot) box = [p.x - (it.icon ? 10 : 6), p.y - th / 2, p.x - (it.icon ? 10 : 6) + tw, p.y + th / 2];
        else {
          const a = (it.angle || 0) * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
          const hw = (tw * c + th * s) / 2, hh = (tw * s + th * c) / 2;
          box = [p.x - hw, p.y - hh, p.x + hw, p.y + hh];
        }
        const m = 3;
        let hit = false;
        for (const b of placed) if (box[0] - m < b[2] && box[2] + m > b[0] && box[1] - m < b[3] && box[3] + m > b[1]) { hit = true; break; }
        if (hit) continue;
        placed.push(box);
        used.add(it.id);
        let el = this.els.get(it.id);
        if (!el) { el = this._make(it); this.els.set(it.id, el); this.root.appendChild(el); }
        const lp = map.containerPointToLayerPoint(p);
        el.style.left = lp.x + 'px'; el.style.top = lp.y + 'px';
      }
      for (const [id, el] of this.els) if (!used.has(id)) { el.remove(); this.els.delete(id); }
    },
    _make(it) {
      const el = document.createElement('div');
      el.className = 'lbl ' + (it.cls || '') + (it.icon ? ' has-ico' : '') + (it.dot ? ' has-dot' : '');
      if (it.icon) {
        const ic = document.createElement('span'); ic.className = 'ic'; ic.style.background = it.iconBg || '#5f6368'; ic.textContent = it.icon; el.appendChild(ic);
      } else if (it.dot) {
        const d = document.createElement('span'); d.className = 'dot'; el.appendChild(d);
      }
      const t = document.createElement('span'); t.className = 't'; t.textContent = it.name; el.appendChild(t);
      if (it.angle && !it.icon && !it.dot) el.style.transform = `translate(-50%,-50%) rotate(${it.angle}deg)`;
      el.addEventListener('click', (e) => { L.DomEvent.stop(e); this.onClick && this.onClick(it); });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      return el;
    },
  });
})();
