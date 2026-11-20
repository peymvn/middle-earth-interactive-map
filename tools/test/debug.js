const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on('console', m => console.log('console.' + m.type(), m.text().slice(0, 300)));
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto('file://' + require('path').resolve(__dirname, '../../web/index.html') + (process.argv[2] || '#3/1000/1080/satellite'));
  await page.waitForTimeout(+(process.argv[3] || 8000));
  console.log(await page.evaluate(() => {
    const m = ME.map; const out = { zoom: m.getZoom(), center: m.getCenter() };
    m.eachLayer(l => { if (l._tiles) out.tiles = Object.keys(l._tiles).length; });
    out.tileEls = document.querySelectorAll('.leaflet-tile').length;
    out.loaded = document.querySelectorAll('.leaflet-tile-loaded').length;
    return JSON.stringify(out);
  }));
  await browser.close();
})();
