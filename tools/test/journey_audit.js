// Audit every journey leg: how it was routed, its length vs straight line, and the named places it
// passes close to (to catch detours like "via Rushey"). Usage: node tools/test/journey_audit.js
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage();
  await page.goto('file://' + require('path').resolve(__dirname, '../../web/index.html') + '#4/950/1100/map');
  await page.waitForTimeout(2500);
  const out = await page.evaluate(() => {
    const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const byName = new Map(ME.places.map(p => [norm(p.name), p]));
    const sites = new Map(ME_VECTORS.sites.filter(s => s.n).map(s => [s.n, s]));
    const res = (o) => Array.isArray(o) ? [o[0] * 1000, o[1] * 1000] : (byName.get(norm(o)) ? [byName.get(norm(o)).x, byName.get(norm(o)).y] : sites.get(o) ? [sites.get(o).x, sites.get(o).y] : null);
    const named = ME.places.filter(p => ['city', 'town', 'village', 'fortress', 'citadel', 'ruin', 'haven', 'landmark', 'bridge', 'ford', 'peak', 'cave', 'inn', 'beacon'].includes(p.type));
    const lines = [];
    for (const j of ME_JOURNEYS) {
      for (const [label, list] of [['out', j.pts], ['back', j.back]]) {
        if (!list) continue;
        lines.push(`\n## ${j.name} (${label})`);
        const stops = list.map(w => { const o = (w && !Array.isArray(w) && typeof w === 'object') ? w : { at: w }; const p = res(o.at); return { name: Array.isArray(o.at) ? `[${o.at}]` : o.at, by: o.by, x: p && p[0], y: p && p[1], missing: !p }; });
        for (const s of stops) if (s.missing) lines.push(`  !! waypoint not found: ${s.name}`);
        const ok = stops.filter(s => !s.missing);
        let total = 0;
        for (let i = 1; i < ok.length; i++) {
          const r = ME.routeJourney([ok[i - 1], ok[i]], i);
          let L = 0; for (let k = 1; k < r.path.length; k++) L += Math.hypot(r.path[k][0] - r.path[k - 1][0], r.path[k][1] - r.path[k - 1][1]);
          const D = Math.hypot(ok[i].x - ok[i - 1].x, ok[i].y - ok[i - 1].y);
          total += L;
          const near = new Set();
          for (const q of r.path) for (const p of named) if (Math.hypot(p.x - q[0], p.y - q[1]) < 2500 && p.name !== ok[i - 1].name && p.name !== ok[i].name) near.add(p.name);
          const mode = r.legs[0] ? r.legs[0].by : '?';
          const flag = L > D * 1.6 + 5000 ? '  <-- DETOUR' : '';
          lines.push(`  ${ok[i - 1].name} -> ${ok[i].name}  [${ok[i].by || 'auto'}→${mode}] ${(L / 1000).toFixed(0)} mi (straight ${(D / 1000).toFixed(0)})${flag}${near.size ? '  via: ' + [...near].slice(0, 6).join(', ') : ''}`);
        }
        lines.push(`  total ≈ ${(total / 1000).toFixed(0)} mi`);
      }
    }
    return lines.join('\n');
  });
  console.log(out);
  await browser.close();
})();
