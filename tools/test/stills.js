const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  page.on('requestfailed', r => errs.push('failed ' + r.url().slice(0, 100)));
  await page.goto('file://' + require('path').resolve(__dirname, '../../web/index.html') + '#5/1000/1200/satellite');
  await page.waitForTimeout(3000);
  for (const [q, out] of [['minas tirith', 'st_mt'], ['helm', 'st_helm'], ['tharbad', 'st_tharbad']]) {
    await page.fill('#search', q); await page.waitForTimeout(300); await page.keyboard.press('Enter');
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `/tmp/me/${out}.png` });
  }
  await page.click('[data-ph=aerial]').catch(() => {}); await page.waitForTimeout(4000);
  await page.screenshot({ path: '/tmp/me/st_aerial.png' });
  console.log(errs.join('\n') || 'no errors');
  await browser.close();
})();
