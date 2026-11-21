const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 820 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await page.goto('file://' + require('path').resolve(__dirname, '../../web/index.html') + '#4/950/1150/satellite');
  await page.waitForTimeout(2500);
  await page.click('[data-chip=journeys]'); await page.waitForTimeout(600);
  await page.click('label.jsel:nth-of-type(1)'); await page.click('label.jsel:nth-of-type(3)'); await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/me/d_panel.png' });
  await page.click('[data-act=done]'); await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/me/d_done.png' });
  console.log('hash', await page.evaluate(() => location.hash));
  await page.click('.chip.active .chip-x'); await page.waitForTimeout(800);
  console.log('after clear', await page.evaluate(() => ME.journeyLines.filter(r => r.on).length));
  console.log(errs.join('\n') || 'ok');
  await browser.close();
})();
