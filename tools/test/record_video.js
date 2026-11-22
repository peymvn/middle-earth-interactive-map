// Demo video, 3D part: the Minas Tirith 3D view orbited by mouse drags, one frame at a time (software
// WebGL is far too slow to record in real time, so the viewer's render loop is stepped by hand).
//   node tools/test/record_video.js 3d <outDir> [fps=24]      -> <outDir>/3d/*.png
// The map part comes from record_zoom.js + compose_zoom.py; make_video.sh stitches everything.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const [phase = 'map', out = '/tmp/me/video', fpsArg = '24'] = process.argv.slice(2);
  const fps = +fpsArg, W = 1280, H = 720;
  fs.mkdirSync(path.join(out, phase), { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--allow-file-access-from-files', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.log('pageerror', e.message));
  const MT = [1380600, 1115500];                      // Minas Tirith [south, east] in map units
  const z0 = 3.0, z1 = 13.1, start = [1100000, 1000000];
  await page.goto('file://' + path.resolve(__dirname, '../../web/index.html') + `#3/${start[1] / 1000}/${start[0] / 1000}/map`);
  await page.waitForTimeout(3000);
  const idle = () => page.waitForFunction(() => document.querySelectorAll('.leaflet-tile').length > 0 && document.querySelectorAll('.leaflet-tile:not(.leaflet-tile-loaded)').length === 0, null, { timeout: 120000 }).catch(() => console.log('tile timeout'));
  const settle = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  let n = 0;
  const shot = async () => { await page.screenshot({ path: path.join(out, phase, String(n++).padStart(5, '0') + '.png'), timeout: 600000 }); };
  // no tile fade-in (a frame would catch tiles half-transparent), fractional zoom allowed
  const view = (c, z) => page.evaluate(([c, z]) => { ME.map._fadeAnimated = false; ME.map.options.zoomSnap = 0; ME.map.setView(c, z, { animate: false }); }, [c, z]);
  const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  {
    await page.evaluate(() => { const l = ME3D.landmarks().find(x => x.id === 'minasTirith'); ME3D.open('minasTirith', l); });
    await page.waitForFunction(() => window.ME3D && ME3D.ready, null, { timeout: 300000 });
    await page.waitForTimeout(4000);
    // one render per captured frame: take over requestAnimationFrame and step the viewer's loop by hand,
    // and freeze the shadow map (the sun does not move, so the shadows do not change)
    await page.evaluate(() => {
      const orig = THREE.WebGLRenderer.prototype.render;
      THREE.WebGLRenderer.prototype.render = function (s, c) { if (window.__freeze) this.shadowMap.autoUpdate = false; return orig.call(this, s, c); };
      window.__queue = []; window.requestAnimationFrame = (cb) => { window.__queue.push(cb); return 1; };
      window.__step = () => { const q = window.__queue; window.__queue = []; q.forEach(f => f(performance.now())); };
      window.__freeze = true;
    });
    const step = () => page.evaluate(() => window.__step());
    const cx = W / 2, cy = H / 2, N = Math.round(fps * 11), DX = 340, ZOOM = 540;
    await page.mouse.move(cx, cy); await page.mouse.down();
    let t0 = Date.now(), zoomed = 0;
    for (let i = 0; i < N; i++) {
      // eased orbit (no jolt at start or end), drifting a little lower; the zoom-in is spread over every
      // frame as tiny wheel steps (the viewer multiplies the distance by exp(deltaY * 0.0012))
      const t = ease(i / (N - 1));
      await page.mouse.move(cx - DX * t, cy + 25 * t);
      const want = ZOOM * ease(Math.min(1, Math.max(0, (i / (N - 1) - 0.2) / 0.7)));
      if (want - zoomed > 0.01) { await page.mouse.wheel(0, -(want - zoomed)); zoomed = want; }
      await step(); await shot();
      if (i === 1) console.log('3d frame time ~', ((Date.now() - t0) / 2 / 1000).toFixed(1), 's');
      if (i % 24 === 0) console.log('3d frame', i, '/', N);
    }
    await page.mouse.up();
  }
  console.log(phase, 'frames', n);
  await browser.close();
})();
