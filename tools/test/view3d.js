// node tools/test/view3d.js <modelId> [out.png] [wait ms]  -> screenshot of the 3D viewer
const { chromium } = require('playwright');
(async () => {
  const [id, out = `/tmp/me/3d_${process.argv[2]}.png`, wait = 9000] = process.argv.slice(2);
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--allow-file-access-from-files', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 750 } });
  const errs = []; page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); }); page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + require('path').resolve(__dirname, '../../web/index.html') + '#5/900/1100/satellite');
  await page.waitForTimeout(2500);
  const t0 = Date.now();
  await page.evaluate((id) => { const l = ME3D.landmarks().find(x => x.id === id || (x.extra || []).includes(id)); ME3D.open(id, l); }, id);
  await page.waitForFunction(() => window.ME3D && ME3D.ready, null, { timeout: 120000 }).catch(() => errs.push('timeout'));
  console.log(id, 'ready in', Date.now() - t0, 'ms');
  await page.waitForTimeout(+wait);
  await page.screenshot({ path: out, timeout: 120000 });
  console.log(errs.join('\n'));
  await browser.close();
})();
