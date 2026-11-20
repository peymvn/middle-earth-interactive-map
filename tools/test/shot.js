// Usage: node tools/test/shot.js out.png "#z/xkm/ykm/mode" [width height] [dpr]
const { chromium } = require('playwright');
(async () => {
  const [out, hash, w = 1280, h = 800, dpr = 1] = process.argv.slice(2);
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  const t0 = Date.now();
  await page.goto('file://' + require('path').resolve(__dirname, '../../web/index.html') + hash);
  await page.waitForFunction(() => {
    const t = document.querySelectorAll('.leaflet-tile');
    return t.length > 0 && document.querySelectorAll('.leaflet-tile:not(.leaflet-tile-loaded)').length === 0;
  }, null, { timeout: 120000 }).catch(e => errs.push('timeout waiting tiles'));
  if (process.env.CLEAN) await page.addStyleTag({ content: '#sidebar,#chips,#layerswitch,.leaflet-control-container,.leaflet-marker-pane{display:none!important}' });
  await page.waitForTimeout(600);
  const ms = Date.now() - t0;
  await page.screenshot({ path: out });
  console.log(`${out} in ${ms}ms, tiles=${await page.evaluate(() => document.querySelectorAll('.leaflet-tile').length)}`);
  if (errs.length) console.log(errs.slice(0, 15).join('\n'));
  await browser.close();
})();
