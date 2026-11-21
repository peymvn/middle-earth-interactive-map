// Loading of the Blender-built models (web/models/*.js, see tools/blender) and helpers to use them:
//   await ME3D.loadKit()     -> PBR material library + trees/rocks by name (ME3D.kitMats, ME3D.part)
//   await ME3D.loadModel(n)  -> a glTF scene
//   ME3D.part(name)          -> a clone of a named kit node (shares geometry and materials)
//   ME3D.scatter(name, list) -> one InstancedMesh per sub-mesh of a kit part, for forests and rock fields
// Models are wrapped as `ME3D_MODEL("name", "<base64 glb>")` scripts so they also load from file://.
(function () {
  'use strict';
  const ME3D = window.ME3D = window.ME3D || {};
  const T = THREE;
  const raw = new Map(), waiting = new Map(), parsed = new Map();
  window.ME3D_MODEL = function (name, b64) {
    raw.set(name, b64);
    const w = waiting.get(name); if (w) { waiting.delete(name); w.forEach(f => f()); }
  };
  function fetchScript(name) {
    if (raw.has(name)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      if (waiting.has(name)) { waiting.get(name).push(resolve); return; }
      waiting.set(name, [resolve]);
      const s = document.createElement('script');
      s.src = `models/${name}.js`; s.async = true;
      s.onload = () => s.remove();
      s.onerror = () => { s.remove(); waiting.delete(name); reject(new Error('model not found: ' + name)); };
      document.head.appendChild(s);
    });
  }
  ME3D.loadModel = function (name) {
    if (parsed.has(name)) return parsed.get(name);
    const p = fetchScript(name).then(() => new Promise((resolve, reject) => {
      const bin = atob(raw.get(name)), buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      raw.delete(name);
      new T.GLTFLoader().parse(buf.buffer, '', (g) => {
        g.scene.traverse(o => {
          if (o.isMesh) {
            o.userData.glb = true; o.castShadow = true; o.receiveShadow = true;
            const ms = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of ms) { if (m.map) m.map.anisotropy = 8; if (m.alphaTest > 0) { m.side = T.DoubleSide; m.shadowSide = T.DoubleSide; } }
          }
        });
        resolve(g.scene);
      }, reject);
    }));
    parsed.set(name, p);
    return p;
  };

  // ---------------------------------------------------------------- ground textures (web/models/ground.js)
  ME3D.loadGround = function () {
    if (ME3D._groundP) return ME3D._groundP;
    ME3D._groundP = new Promise((resolve) => {
      window.ME3D_GROUND = (urls) => {
        const out = {}, keys = Object.keys(urls); let left = keys.length;
        for (const k of keys) {
          new T.TextureLoader().load(urls[k], (t) => {
            t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8;
            out[k] = t; if (--left === 0) { ME3D.groundTex = out; resolve(out); }
          }, undefined, () => { if (--left === 0) resolve(out); });
        }
      };
      const s = document.createElement('script'); s.src = 'models/ground.js'; s.async = true;
      s.onload = () => s.remove(); s.onerror = () => { s.remove(); resolve(null); };
      document.head.appendChild(s);
    });
    return ME3D._groundP;
  };

  // ---------------------------------------------------------------- the kit
  ME3D.kitMats = null; ME3D.kitNodes = null;
  ME3D.loadKit = function () {
    if (ME3D._kitP) return ME3D._kitP;
    ME3D._kitP = ME3D.loadModel('kit').then(scene => {
      const mats = {}, nodes = {};
      scene.traverse(o => {
        if (o.isMesh) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) mats[m.name] = m;
      });
      for (const o of scene.children) nodes[o.name] = o;
      ME3D.kitMats = mats; ME3D.kitNodes = nodes;
      return scene;
    }).catch(e => { console.warn('kit unavailable, using drawn materials', e); });
    return ME3D._kitP;
  };
  ME3D.part = function (name) {
    const n = ME3D.kitNodes && ME3D.kitNodes[name];
    if (!n) return null;
    const c = n.clone(true); c.position.set(0, 0, 0);
    return c;
  };
  // world-scale texture tiling (metres per repeat) for geometry built in JS with kit materials
  ME3D.TILES = { whiteStone: 3, greyStone: 3, darkStone: 3, obsidian: 8, rock: 14, mossStone: 3, plaster: 3, stucco: 3, thatch: 2.5, tiles: 2.5, slate: 2.5, greyTiles: 2.5, planks: 2, oldWood: 2, marble: 3, cobbles: 2.5, meadow: 4, bark: 1.5, silverBark: 1.5 };

  // instanced copies of a kit part: list of [x, y, z, rotY, scale]
  ME3D.scatter = function (name, list) {
    const src = ME3D.kitNodes && ME3D.kitNodes[name];
    if (!src || !list.length) return null;
    const g = new T.Group();
    src.updateMatrixWorld(true);
    const base = new T.Matrix4().copy(src.matrixWorld).invert();
    const m4 = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0);
    src.traverse(o => {
      if (!o.isMesh) return;
      const local = new T.Matrix4().multiplyMatrices(base, o.matrixWorld);
      const im = new T.InstancedMesh(o.geometry, o.material, list.length);
      list.forEach(([x, y, z, r, s], i) => {
        q.setFromAxisAngle(up, r || 0);
        m4.compose(new T.Vector3(x, y, z), q, new T.Vector3(s || 1, s || 1, s || 1)).multiply(local);
        im.setMatrixAt(i, m4);
      });
      im.castShadow = true; im.receiveShadow = true; im.userData.glb = true;
      im.computeBoundingSphere();
      g.add(im);
    });
    return g;
  };
})();
