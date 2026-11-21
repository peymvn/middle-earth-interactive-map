// Walk the main flows on an emulated phone and screenshot each step -> /tmp/me/m_<step>.png
const { chromium, devices } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--allow-file-access-from-files'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  const shot = async (n, w = 1200) => { await page.waitForTimeout(w); await page.screenshot({ path: `/tmp/me/m_${n}.png` }); };
  const base = 'file://' + require('path').resolve(__dirname, '../../web/index.html');
  await page.goto(base + '#4/950/1150/satellite'); await page.waitForTimeout(3000);
  await shot('01_start');
  await page.tap('[data-chip=journeys]'); await shot('02_journeys_panel');
  await page.tap('label.jsel:nth-of-type(2)'); await shot('03_journey_checked', 2500);
  await page.tap('[data-act=done]'); await shot('04_journey_done', 3500);
  await page.tap('[data-chip=events]'); await page.tap('[data-b=H]'); await shot('05_events_hobbit');
  await page.tap('.pn-close'); await shot('06_events_closed', 2500);
  await page.tap('#search'); await page.fill('#search', 'minas tirith'); await page.waitForTimeout(400); await page.keyboard.press('Enter'); await shot('07_card_half', 4000);
  await page.evaluate(() => { const c = document.getElementById('card'); c.dataset.snap = 'peek'; c.style.height = Math.round(innerHeight * 0.3) + 'px'; }); await shot('08_card_peek', 800);
  await page.tap('#clear-btn'); await page.waitForTimeout(500);
  await page.tap('#layer-opts'); await shot('09_layer_opts', 800);
  await page.tap('#menu-btn'); await shot('10_menu');
  console.log(errs.join('\n') || 'ok');
  await browser.close();
})();
