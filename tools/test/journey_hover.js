// Hover a point of a journey, screenshot the pill; click it, screenshot the stage card.
// usage: node tools/test/journey_hover.js <journeyId> <fraction 0..1> <zoom> [back]
const { chromium } = require('playwright');
(async () => {
  const [id = 'frodo', frac = '0.3', zoom = '7', back] = process.argv.slice(2);
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('file://' + require('path').resolve(__dirname, '../../web/index.html') + '#5/900/1100/map');
  await page.waitForTimeout(2000);
  await page.click('[data-chip=journeys]');
  const pt = await page.evaluate(([id, frac, zoom, back]) => {
    const rec = ME.journeyLines.find(r => r.j.id === id); const path = back ? rec.backPath : rec.path;
    const q = path[Math.floor(path.length * frac)];
    ME.map.setView([q[1], q[0]], +zoom, { animate: false });
    return q;
  }, [id, +frac, zoom, back]);
  await page.waitForTimeout(3500);
  const xy = await page.evaluate((q) => { const p = ME.map.latLngToContainerPoint([q[1], q[0]]); const r = ME.map.getContainer().getBoundingClientRect(); return [p.x + r.left, p.y + r.top]; }, pt);
  await page.mouse.move(xy[0] - 30, xy[1] - 30); await page.mouse.move(xy[0], xy[1], { steps: 5 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `/tmp/me/hover_${id}.png` });
  await page.mouse.click(xy[0], xy[1]);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `/tmp/me/stage_${id}.png` });
  console.log(errs.join('\n') || 'ok');
  await browser.close();
})();
