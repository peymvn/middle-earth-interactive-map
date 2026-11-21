// node tools/test/model_preview.js <name> [out.jpg] [lookY]  -> 2x2 sheet of the model from 4 angles
const { chromium } = require('playwright');
(async () => {
  const [name, out = `/tmp/me/pv_${process.argv[2]}.png`, lookY] = process.argv.slice(2);
  const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--allow-file-access-from-files', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await p.goto('file://' + require('path').resolve(__dirname, '../../web/index.html') + '#3/1000/1080/map');
  await p.waitForTimeout(1500);
  const urls = await p.evaluate(async ([n, ly]) => ME3D.preview(n, [[0.6, 0.18], [2.4, 0.25], [-1.6, 0.12], [0.9, 0.9, 1.9]], { lookY: ly == null ? 1 : +ly }), [name, lookY]);
  await p.setContent(`<body style="margin:0;background:#000;display:grid;grid-template-columns:600px 600px">${urls.map(u => `<img src="${u}">`).join('')}</body>`);
  await p.screenshot({ path: out, timeout: 120000 });
  console.log(errs.join('\n') || 'ok', out);
  await b.close();
})();
