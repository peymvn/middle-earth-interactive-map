// search a place, press its 3D button, screenshot
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--allow-file-access-from-files', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 750 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await page.goto('file://' + require('path').resolve(__dirname, '../../web/index.html') + '#5/900/1100/satellite');
  await page.waitForTimeout(2500);
  await page.fill('#search', process.argv[2] || 'orthanc'); await page.waitForTimeout(300); await page.keyboard.press('Enter');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: '/tmp/me/card3d_a.png', timeout: 120000 });
  await page.click('[data-a="3d"]');
  await page.waitForFunction(() => ME3D.ready, null, { timeout: 120000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/me/card3d_b.png', timeout: 120000 });
  console.log(errs.join('\n') || 'ok');
  await browser.close();
})();
