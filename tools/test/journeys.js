const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1300, height: 950 } });
  const errs = []; page.on('console', m => { if (m.type() !== 'log') errs.push(m.type() + ' ' + m.text().slice(0, 200)); }); page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + require('path').resolve(__dirname, '../../web/index.html') + (process.argv[2] || '#4/950/1100/map'));
  await page.waitForTimeout(2500);
  const t0 = Date.now(); await page.click('[data-chip=journeys]'); console.log('routing ms', Date.now() - t0);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: process.argv[3] || '/tmp/me/jr.png' });
  console.log(errs.join('\n'));
  await browser.close();
})();
