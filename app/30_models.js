// ============================================================================
// Procedural vehicle models (metres, +Y = nose). Built from the engine's real
// launcher geometry (stage lengths/radii/engine layouts) and spacecraft specs.
// ============================================================================
const MATS = {};
function mat(color, kind = 'paint', extra = {}) {
  const key = color + kind + JSON.stringify(extra);
  if (MATS[key]) return MATS[key];
  // [roughness, metalness]. Metals reflect the surround (image-based lighting, 20_scene.js) but keep some diffuse colour:
  // in deep space the surround is nearly black, and fully metallic surfaces would turn black away from the Sun.
  const p = { paint: [0.55, 0.05], metal: [0.35, 0.6], dark: [0.75, 0.2], gold: [0.3, 0.7], foil: [0.26, 0.7], solar: [0.4, 0.3], fabric: [0.9, 0.0], tile: [0.85, 0.05], glass: [0.08, 0.45] }[kind] || [0.6, 0.1];
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: p[0], metalness: p[1], ...extra });
  MATS[key] = m; return m;
}
const M_DARKMETAL = () => mat('#3a3d42', 'metal', { side: THREE.DoubleSide });
function cyl(rb, rt, len, material, seg = 40, open = false) { const g = new THREE.CylinderGeometry(rt, rb, len, seg, 1, open); g.translate(0, len / 2, 0); return new THREE.Mesh(g, material); }
function box(w, hgt, d, material) { const g = new THREE.BoxGeometry(w, hgt, d); g.translate(0, hgt / 2, 0); return new THREE.Mesh(g, material); }
function bell(len, rExit, material) {
  const pts = [[rExit * 0.34, len], [rExit * 0.30, len * 0.9], [rExit * 0.48, len * 0.65], [rExit * 0.72, len * 0.35], [rExit, 0]].map(p => new THREE.Vector2(p[0], p[1]));
  const g = new THREE.LatheGeometry(pts, 28); return new THREE.Mesh(g, material || M_DARKMETAL());
}
function ogive(r, len, material, cylFrac = 0.45) {
  const pts = []; const nC = 2, nO = 16; const lc = len * cylFrac, lo = len - lc;
  pts.push(new THREE.Vector2(r, 0)); pts.push(new THREE.Vector2(r, lc));
  for (let i = 1; i <= nO; i++) { const f = i / nO; pts.push(new THREE.Vector2(Math.max(r * Math.sqrt(1 - f * f) * (1 - 0.15 * f), 0.001), lc + lo * f)); }
  return new THREE.Mesh(new THREE.LatheGeometry(pts, 40), material);
}
function stripeTex(fn, w = 256, hh = 512) {
  const c = document.createElement('canvas'); c.width = w; c.height = hh; const g = c.getContext('2d'); fn(g, w, hh);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const TEX = {};
function patternMat(kind, base) {
  const key = kind + '|' + base; if (TEX[key]) return TEX[key];
  let tex;
  if (kind === 'sic') tex = stripeTex((g, w, hh) => { g.fillStyle = base; g.fillRect(0, 0, w, hh); g.fillStyle = '#151515'; for (let q = 0; q < 4; q += 2) g.fillRect(q * w / 4, hh * 0.78, w / 4, hh * 0.22); g.fillRect(0, hh * 0.40, w, hh * 0.035); g.fillRect(0, hh * 0.04, w, hh * 0.02); g.fillRect(w / 8, hh * 0.08, w / 8, hh * 0.25); g.fillRect(5 * w / 8, hh * 0.08, w / 8, hh * 0.25); g.fillStyle = '#b22'; g.font = 'bold 34px sans-serif'; g.save(); g.translate(w * 0.62, hh * 0.45); g.rotate(Math.PI / 2); g.fillText('USA', 0, 0); g.restore(); });
  else if (kind === 'sivb') tex = stripeTex((g, w, hh) => { g.fillStyle = base; g.fillRect(0, 0, w, hh); g.fillStyle = '#151515'; g.fillRect(0, hh * 0.7, w / 4, hh * 0.3); g.fillRect(w / 2, hh * 0.7, w / 4, hh * 0.3); g.fillRect(0, hh * 0.0, w, hh * 0.05); });
  else if (kind === 'band') tex = stripeTex((g, w, hh) => { g.fillStyle = base; g.fillRect(0, 0, w, hh); g.fillStyle = '#151515'; g.fillRect(0, 0, w, hh * 0.08); });
  else if (kind === 'bands') tex = stripeTex((g, w, hh) => { g.fillStyle = base; g.fillRect(0, 0, w, hh); g.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 1; i < 5; i++) g.fillRect(0, hh * i / 5, w, 3); });
  else if (kind === 'tiles') tex = stripeTex((g, w, hh) => { g.fillStyle = '#c4c9cf'; g.fillRect(0, 0, w, hh); g.fillStyle = '#16181b'; g.fillRect(w * 0.5, 0, w * 0.5, hh); g.strokeStyle = 'rgba(255,255,255,.05)'; for (let y = 0; y < hh; y += 6) { g.beginPath(); g.moveTo(w * 0.5, y); g.lineTo(w, y); g.stroke(); } });
  else if (kind === 'flagcn') tex = stripeTex((g, w, hh) => { g.fillStyle = base; g.fillRect(0, 0, w, hh); g.fillStyle = '#d62a1e'; g.fillRect(w * 0.42, hh * 0.62, w * 0.14, hh * 0.08); g.fillStyle = '#f5d000'; g.fillRect(w * 0.43, hh * 0.68, w * 0.02, hh * 0.012); });
  else if (kind === 'chute') tex = stripeTex((g, w, hh) => { for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#f2efe8' : base; g.fillRect(i * w / 16, 0, w / 16 + 1, hh); } g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 0, w, hh * 0.06); }, 256, 64);
  const kindM = kind === 'tiles' ? 'metal' : 'paint';
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: kind === 'tiles' ? 0.45 : 0.55, metalness: kind === 'tiles' ? 0.4 : 0.05, side: kind === 'chute' ? THREE.DoubleSide : THREE.FrontSide });
  TEX[key] = m; return m;
}
function engineLayout(eng) {
  const s = eng.spread || 0, out = [];
  switch (eng.layout) {
    case 'pair': out.push([s / 2 + eng.r * 0.2, 0], [-(s / 2 + eng.r * 0.2), 0]); break;
    case 'cross': out.push([0, 0]); for (let k = 0; k < 4; k++) out.push([s * Math.cos(k * Math.PI / 2 + Math.PI / 4), s * Math.sin(k * Math.PI / 2 + Math.PI / 4)]); break;
    case 'square': for (let k = 0; k < 4; k++) out.push([s * Math.cos(k * Math.PI / 2 + Math.PI / 4), s * Math.sin(k * Math.PI / 2 + Math.PI / 4)]); break;
    case 'octaweb': out.push([0, 0]); for (let k = 0; k < 8; k++) out.push([s * Math.cos(k * Math.PI / 4), s * Math.sin(k * Math.PI / 4)]); break;
    case 'raptor33': for (let k = 0; k < 3; k++) out.push([s * 0.22 * Math.cos(k * TAU / 3), s * 0.22 * Math.sin(k * TAU / 3)]); for (let k = 0; k < 10; k++) out.push([s * 0.58 * Math.cos(k * TAU / 10), s * 0.58 * Math.sin(k * TAU / 10)]); for (let k = 0; k < 20; k++) out.push([s * 0.95 * Math.cos(k * TAU / 20 + 0.1), s * 0.95 * Math.sin(k * TAU / 20 + 0.1)]); break;
    case 'ship6': for (let k = 0; k < 3; k++) out.push([s * 0.32 * Math.cos(k * TAU / 3), s * 0.32 * Math.sin(k * TAU / 3)]); for (let k = 0; k < 3; k++) out.push([s * 0.9 * Math.cos(k * TAU / 3 + Math.PI / 3), s * 0.9 * Math.sin(k * TAU / 3 + Math.PI / 3), 1]); break;
    default: out.push([0, 0]);
  }
  return out;
}
// one launcher stage: bottom at y = 0, engine bells hanging below (or, eng.y0, inside the interstage below the stage's own
// structure), returns {group, len, rTop, rBottom, engLen}. opts.ist === false: the aft interstage (geom piece ist) is gone.
function buildStage(st, opts = {}) {
  const g = new THREE.Group(); let y = 0, rTop = 0, rBottom = st.geom[0][1];
  for (const [len, rb, rt, color, o = {}] of st.geom) {
    if (o.ist && opts.ist === false) { y += len; rTop = rt; continue; }
    let m;
    if (o.roll === 'sic') m = patternMat('sic', color); else if (o.roll === 'sivb') m = patternMat('sivb', color);
    else if (o.band) m = patternMat('band', color); else if (o.bands) m = patternMat('bands', color); else if (o.tiles) m = patternMat('tiles', color);
    else if (o.flag === 'cn') m = patternMat('flagcn', color);
    else m = mat(color, /#b9bec5|#d6d9de|steel/.test(color) ? 'metal' : 'paint');
    const c = cyl(rb, rt, len, m, 48); c.position.y = y; g.add(c);
    y += len; rTop = rt;
  }
  const eng = st.eng;
  if (eng) for (const p of engineLayout(eng)) {
    const big = p[2] ? 1.7 : 1; const b = bell(eng.len * big, eng.r * big); b.position.set(p[0], eng.y0 ?? -eng.len * big, p[1]); g.add(b);
  }
  if (st.fins) for (let k = 0; k < st.fins.n; k++) {
    const f = box(0.35, st.fins.len, st.fins.span, mat(st.fins.color)); const a = k * Math.PI / 2 + Math.PI / 4;
    f.position.set(Math.cos(a) * (rBottom + st.fins.span / 2 - 0.3), -1.2, Math.sin(a) * (rBottom + st.fins.span / 2 - 0.3)); f.rotation.y = -a; g.add(f);
    const fa = cyl(1.1, 0.6, 4.5, mat(st.fins.color)); fa.position.set(Math.cos(a) * rBottom * 0.92, -1.2, Math.sin(a) * rBottom * 0.92); g.add(fa);
  }
  if (st.gridfins) for (let k = 0; k < 4; k++) { const f = box(3.0, 2.2, 0.3, mat('#2b2d30', 'metal')); const a = k * Math.PI / 2; f.position.set(Math.cos(a) * (rTop + 1.2), y - 4, Math.sin(a) * (rTop + 1.2)); f.rotation.y = -a + Math.PI / 2; g.add(f); }
  if (st.flaps) { for (const [yy, sz] of [[y - 9, 6.5], [6, 9]]) for (const a of [Math.PI / 2, -Math.PI / 2]) { const f = box(0.25, sz, 3.6, mat('#1d1f22', 'tile')); f.position.set(Math.cos(a) * (rTop + 1.0), yy, Math.sin(a) * (rTop + 1.0)); g.add(f); } }
  return { group: st.detail ? stageD(st, g, opts) : g, len: y, rTop, rBottom, engLen: eng ? -(eng.y0 ?? -eng.len) : 0 };
}

// ---------------- spacecraft parts ----------------
function lmDescent(landed) {
  const g = new THREE.Group();
  const body = cyl(2.1, 2.1, 1.65, mat('#c9a043', 'gold'), 8); body.position.y = 0.0; g.add(body);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    const pad = cyl(0.47, 0.47, 0.08, mat('#c9a043', 'gold')); pad.position.set(Math.cos(a) * 4.2, -1.75, Math.sin(a) * 4.2); g.add(pad);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 6), mat('#c9a043', 'gold'));
    const p0 = new THREE.Vector3(Math.cos(a) * 1.9, 1.2, Math.sin(a) * 1.9), p1 = new THREE.Vector3(Math.cos(a) * 4.2, -1.7, Math.sin(a) * 4.2);
    strut.scale.y = p0.distanceTo(p1); strut.position.copy(p0).add(p1).multiplyScalar(0.5); strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize()); g.add(strut);
  }
  const b = bell(1.5, 0.75); b.position.y = -1.4; g.add(b);
  g.userData.len = 1.65; g.userData.engineY = -1.4; g.userData.engineR = 0.75; g.userData.footY = -1.8; return g;
}
function lmAscent() {
  const g = new THREE.Group();
  const cab = box(3.2, 2.4, 2.9, mat('#a7abb1', 'metal')); g.add(cab);
  const front = box(2.4, 1.6, 0.5, mat('#4b4f55', 'dark')); front.position.set(0, 0.5, 1.6); g.add(front);
  const tun = cyl(0.5, 0.5, 0.7, mat('#c4c8cd', 'metal')); tun.position.y = 2.4; g.add(tun);
  const tank = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), mat('#b9bdc2', 'metal')); tank.position.set(-1.8, 1.0, -0.2); g.add(tank);
  const tank2 = tank.clone(); tank2.position.x = 1.8; g.add(tank2);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 8, 0, TAU, 0, Math.PI / 2.4), mat('#eeeeee', 'paint', { side: THREE.DoubleSide })); dish.position.set(-1.2, 2.9, -1.0); g.add(dish);
  const b = bell(0.9, 0.45); b.position.y = -0.85; g.add(b);
  g.userData.len = 3.1; g.userData.engineY = -0.85; g.userData.engineR = 0.45; return g;
}
// ---------------- detailed models ----------------
// Vehicles with a 3D model that may be used freely — NASA 3D Resources (free and without copyright), the Smithsonian's
// scans (CC0), models under CC BY (credited in the README and the app) — are drawn with them: assets/<name>.glb, built from
// the originals by tools/models, one node per part the app moves on its own. A file loads the first time a mission needs
// it (preloadDetailedModels at the start of a mission); until it arrives, or if it cannot be loaded, the craft shows its
// built-in model.
const DETAIL = { lib: null, files: {}, ready: {} };
function detailFile(name) {
  if (!DETAIL.files[name]) {
    DETAIL.lib = DETAIL.lib || Promise.all([import('./' + ASSET('GLTFLoader.js')), import('./' + ASSET('meshopt_decoder.module.js'))])
      .then(([{ GLTFLoader }, { MeshoptDecoder }]) => { const ld = new GLTFLoader(); ld.setMeshoptDecoder(MeshoptDecoder); return ld; });
    DETAIL.files[name] = DETAIL.lib.then(ld => ld.loadAsync(ASSET(name + '.glb'))).then(gl => {
      const parts = {}; for (const n of gl.scene.children) parts[n.name] = n;
      gl.scene.traverse(o => { if (o.isMesh) o.userData.keep = true; }); // geometry and materials shared by every copy: never disposed with a craft
      return (DETAIL.ready[name] = parts);
    }).catch(e => { console.warn(`Detailed model ${name} could not be loaded; using the built-in one.`, e); return (DETAIL.ready[name] = null); });
  }
  return DETAIL.files[name];
}
// A part of a detailed model in place of a built-in one (the fallback, shown until the file arrives). y: where the part's
// origin sits in the fallback's frame; extra(group): pieces the source model leaves out, added beside the part.
function detailPart(name, part, fallback, opt = {}) {
  const g = new THREE.Group(); g.userData = { ...fallback.userData }; g.add(fallback);
  const put = parts => {
    const src = parts && parts[part]; if (!src) return;
    const m = new THREE.Group(); m.add(src.clone()); m.position.y = opt.y || 0; // (the part's own transform carries the dequantisation of its vertices)
    g.remove(fallback); g.add(m); if (opt.extra) opt.extra(g);
    refreshBounds(g);
  };
  if (DETAIL.ready[name] !== undefined) put(DETAIL.ready[name]); else detailFile(name).then(put);
  return g;
}
// the detailed models a mission will show, loaded while the countdown runs
function preloadDetailedModels(md) {
  const want = new Set();
  for (const o of md.M.objects) for (const cf of o.configs) {
    const L = cf.label || {}, sc = L.sc || o.model, parts = L.parts || [];
    if ((sc === 'apollo' || sc === 'apolloCSM') && parts.some(p => p === 'lander' || p === 'descent' || p === 'ascent')) want.add('apollo_lm');
    if (sc === 'msl' && parts.includes('lander')) want.add('perseverance');
    if (o.model === 'shuttle') want.add('orbiter');
    if (o.model === 'iss') want.add('iss');
    if (L.launcher && LAUNCHERS[L.launcher]) for (const st of LAUNCHERS[L.launcher].stages) if (st.detail) want.add(st.detail); // launch stacks and spent stages
  }
  for (const n of want) detailFile(n);
}
// a model's bounds after a detailed part replaced its built-in one (the camera frames a standing vehicle with them)
function refreshBounds(o) {
  let w = o; while (w && !(w.userData && w.userData.wrapped)) w = w.parent; if (!w) return;
  w.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(w.matrixWorld).invert(), bb = new THREE.Box3();
  w.traverse(n => { if (n.isMesh && n.visible && n.geometry) { n.geometry.computeBoundingBox && !n.geometry.boundingBox && n.geometry.computeBoundingBox(); const b = n.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, n.matrixWorld)); bb.union(b); } });
  if (bb.isEmpty()) return; const sz = new THREE.Vector3(); bb.getSize(sz);
  w.userData.sizeM = Math.max(sz.x, sz.y, sz.z, 1); w.userData.bbox = { w: sz.x, h: sz.y, d: sz.z }; w.userData.bbY = [bb.min.y, bb.max.y];
  const wheels = []; w.traverse(n => { if (n.userData && n.userData.wheel) wheels.push(n); }); w.userData.wheels = wheels;
}
// Apollo lunar module: NASA's model, ascent and descent stages apart. Its descent stage keeps the built-in one's frame (feet
// at −1.8 m); its ascent stage's origin is the top of the descent stage, 1.455 m up, where the built-in ascent stage sits
// 1.65 m up. The ascent engine's bell, hidden inside the descent stage in NASA's model, is added for liftoff.
// Mars 2020 Perseverance: NASA's model, its six wheels apart so they turn (each wheel's node carries its radius) and its
// mast apart, folded on the deck for the landing and raised on the surface (the node carries the axis and angle)
function roverD(landed) {
  return detailPart('perseverance', 'body', rover(1), { extra: g => {
    const P = DETAIL.ready.perseverance; for (let i = 0; i < 6; i++) if (P['wheel' + i]) g.add(P['wheel' + i].clone());
    if (P.mast) { const m = P.mast.clone(), d = m.userData.deploy; if (landed && d) m.quaternion.setFromAxisAngle(new THREE.Vector3(d[0], d[1], d[2]), d[3]); g.add(m); }
  } });
}
function lmDescentD(landed) { return detailPart('apollo_lm', 'descent', lmDescent(landed)); }
// Saturn V: a textured model (CC BY: BoldlyBuilding, credited in the README and the app), cut into its stages and stretched
// to their published lengths by tools/models; a stage of a launcher with detail: <file> is its part of that file, named
// after the stage, in the stage's own frame. The S-II's aft interstage is a part of its own, there until it is dropped.
// The model is a shell: where it is cut the stages are open, and the J-2s inside the interstages are not in it. These are
// added: a bulkhead or heat shield across each open end ([y, r, kind]) and the bells.
const STAGE_D = {
  'saturnv:S-IC': { caps: [[38.6, 5.0, 'metal']] }, // the forward bulkhead, under the top of the forward skirt
  'saturnv:S-II': { caps: [[5.52, 5.0, 'dark'], [24.87, 5.0, 'metal']], bells: true }, // the heat shield at the base of the aft skirt; the forward bulkhead inside the cone
  'saturnv:S-IVB': { caps: [[0.3, 3.25, 'dark'], [14.47, 3.25, 'metal']], bells: true }, // the thrust structure above the cone; the top of the instrument unit
};
// Space Shuttle: the external tank and the boosters of a CC BY model of the stack (paburoviii, credited in the README and the
// app), scaled to their published sizes by tools/models; the orbiter is the Smithsonian's scan. STS-1 and STS-2 flew tanks
// painted white (opts.white): the foam's colour map gives way to white paint.
const ET_WHITE = () => MATS.etWhite || (MATS.etWhite = new THREE.MeshStandardMaterial({ color: '#e6e4dc', roughness: 0.6, metalness: 0, side: THREE.DoubleSide }));
function stageD(st, fallback, opts) {
  const D = STAGE_D[st.detail + ':' + st.id] || {};
  return detailPart(st.detail, st.id, fallback, { extra: g => {
    const P = DETAIL.ready[st.detail];
    if (opts.white) g.traverse(o => { if (o.isMesh && o.material && o.material.map && /Orange/.test(o.material.name)) o.material = ET_WHITE(); });
    if (P.IST && st.geom[0][4] && st.geom[0][4].ist && opts.ist !== false) g.add(P.IST.clone());
    for (const [y, r, kind] of D.caps || []) { const c = cyl(r, r, 0.06, kind === 'dark' ? mat('#2e3135', 'dark') : mat('#9a9fa5', 'metal'), 32); c.position.y = y - 0.03; g.add(c); }
    if (D.bells) for (const p of engineLayout(st.eng)) { const b = bell(st.eng.len, st.eng.r); b.position.set(p[0], st.eng.y0, p[1]); g.add(b); }
  } });
}
function lmAscentD() { return detailPart('apollo_lm', 'ascent', lmAscent(), { y: -0.195, extra: g => { const b = bell(0.75, 0.39); b.position.y = -0.85; g.add(b); } }); }
function solarWing(len, width, panels, color = '#1b2a4a') {
  const g = new THREE.Group(); const pw = len / panels;
  for (let i = 0; i < panels; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(pw * 0.96, 0.05, width), mat(color, 'solar')); p.position.x = pw * (i + 0.5); g.add(p); }
  const boom = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), mat('#9aa0a6', 'metal')); boom.position.x = len / 2; g.add(boom);
  return g;
}
function orionCM(withLAS) {
  const g = new THREE.Group();
  const cm = cyl(2.51, 0.75, 3.3, mat('#b7bcc2', 'metal')); g.add(cm);
  const hs = cyl(2.52, 2.51, 0.2, mat('#5a3b22', 'dark')); hs.position.y = -0.2; g.add(hs);
  const win = box(0.35, 0.3, 0.05, mat('#0a0c10', 'glass')); win.position.set(0, 1.6, 1.62); g.add(win);
  if (withLAS) {
    const fair = cyl(2.6, 0.7, 3.9, mat('#ecebe6')); fair.position.y = -0.1; g.add(fair);
    const tower = cyl(0.45, 0.45, 9.0, mat('#ecebe6')); tower.position.y = 3.8; g.add(tower);
    const nose = cyl(0.45, 0.05, 1.6, mat('#ecebe6')); nose.position.y = 12.8; g.add(nose);
    for (let k = 0; k < 4; k++) { const nz = cyl(0.25, 0.4, 0.6, mat('#2b2b2b', 'dark')); const a = k * Math.PI / 2; nz.position.set(Math.cos(a) * 0.5, 4.3, Math.sin(a) * 0.5); g.add(nz); }
  }
  g.userData.len = withLAS ? 14.4 : 3.5; g.userData.r = 2.51; return g;
}
function orionESM(folded) {
  const g = new THREE.Group();
  const body = cyl(2.05, 2.05, 4.0, mat('#e9e7e2', 'paint')); g.add(body);
  const top = cyl(2.05, 2.5, 0.6, mat('#d6d6d0', 'paint')); top.position.y = 4.0; g.add(top);
  if (!folded) for (let k = 0; k < 4; k++) { const w = solarWing(7.0, 2.0, 3); const a = k * Math.PI / 2 + Math.PI / 4; w.position.set(Math.cos(a) * 2.05, 1.2, Math.sin(a) * 2.05); w.rotation.y = -a; w.rotation.z = -0.35; g.add(w); }
  const b = bell(1.9, 0.6); b.position.y = -1.9; g.add(b);
  g.userData.len = 4.6; g.userData.engineY = -1.9; g.userData.engineR = 0.6; return g;
}
function probeBus(w, hgt, d, color = '#c9a043', kind = 'gold') { return box(w, hgt, d, mat(color, kind)); }
function dish(r, color = '#ececec') { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 10, 0, TAU, 0, Math.PI / 3.2), mat(color, 'paint', { side: THREE.DoubleSide })); return m; }
function legsQuad(r, h2, color = '#c9a043') {
  const g = new THREE.Group();
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; const p0 = new THREE.Vector3(Math.cos(a) * r * 0.7, 0.3, Math.sin(a) * r * 0.7), p1 = new THREE.Vector3(Math.cos(a) * r * 1.5, -h2, Math.sin(a) * r * 1.5);
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), mat(color, 'gold')); s.scale.y = p0.distanceTo(p1); s.position.copy(p0).add(p1).multiplyScalar(0.5); s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize()); g.add(s);
    const pad = cyl(0.22, 0.22, 0.05, mat(color, 'gold')); pad.position.copy(p1); g.add(pad); }
  return g;
}
function aeroshell(r, backH, color = '#e9e6df') {
  const g = new THREE.Group();
  const hs = cyl(r, r * 0.25, r * 0.36, mat('#6b4a2c', 'dark')); hs.rotation.x = Math.PI; hs.position.y = r * 0.36; g.add(hs); // 70° sphere-cone, nose down
  const bs = cyl(r, r * 0.42, backH, mat(color, 'paint')); bs.position.y = r * 0.36; g.add(bs);
  const cap = cyl(r * 0.42, r * 0.3, backH * 0.2, mat(color, 'paint')); cap.position.y = r * 0.36 + backH; g.add(cap);
  g.userData.len = r * 0.36 + backH * 1.2; return g;
}
function rover(scale = 1, color = '#e9e6df') {
  const g = new THREE.Group();
  const body = box(2.2 * scale, 0.7 * scale, 2.9 * scale, mat(color, 'paint')); body.position.y = 0.55 * scale; g.add(body);
  for (const sx of [-1, 1]) for (const sz of [-1, 0, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.26 * scale, 0.26 * scale, 0.4 * scale, 16), mat('#6a6d72', 'metal')); w.rotation.z = Math.PI / 2; w.position.set(sx * 1.25 * scale, 0.26 * scale, sz * 1.1 * scale); w.userData.wheel = 0.26 * scale; g.add(w);
    // tread cleats so the wheels visibly turn
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; const cl = new THREE.Mesh(new THREE.BoxGeometry(0.05 * scale, 0.42 * scale, 0.06 * scale), mat('#3e4044', 'dark')); cl.position.set(Math.cos(a) * 0.255 * scale, 0, Math.sin(a) * 0.255 * scale); cl.rotation.y = -a; w.add(cl); } }
  const mast = cyl(0.08 * scale, 0.08 * scale, 1.4 * scale, mat('#cfcfcf', 'metal')); mast.position.set(0.6 * scale, 1.2 * scale, 1.0 * scale); g.add(mast);
  const head = box(0.6 * scale, 0.3 * scale, 0.3 * scale, mat('#e5e5e5')); head.position.set(0.6 * scale, 2.6 * scale, 1.0 * scale); g.add(head);
  const rtg = cyl(0.3 * scale, 0.3 * scale, 0.9 * scale, mat('#3a3a3a', 'dark')); rtg.rotation.x = 1.0; rtg.position.set(0, 0.9 * scale, -1.6 * scale); g.add(rtg);
  return g;
}
function sampleLander(withRover, color = '#c9a043') {
  const g = new THREE.Group();
  const deck = cyl(1.6, 1.6, 0.9, mat(color, 'gold'), 8); g.add(deck);
  g.add(legsQuad(1.6, 1.2, color));
  const b = bell(0.7, 0.35); b.position.y = -0.7; g.add(b);
  if (withRover) { const rv = rover(0.55, '#d8d3c4'); rv.position.y = 0.9; g.add(rv); for (const s of [-1, 1]) { const w = solarWing(1.4, 0.8, 2, '#283a63'); w.position.set(s * 0.5, 1.5, 0); if (s < 0) w.rotation.y = Math.PI; g.add(w); } }
  g.userData.len = 0.9; g.userData.engineY = -0.7; g.userData.engineR = 0.35; g.userData.footY = -1.2; return g;
}
function starshipShip(landed, withLegs) {
  const st = LAUNCHERS.starship.stages[1];
  const s = buildStage(st); const g = s.group;
  if (withLegs || landed) for (let k = 0; k < 6; k++) { const a = k * TAU / 6; const leg = box(0.6, 3.2, 0.6, mat('#9aa0a6', 'metal')); leg.position.set(Math.cos(a) * 4.0, -3.0, Math.sin(a) * 4.0); g.add(leg); }
  g.userData.len = s.len; g.userData.engineY = -st.eng.len; g.userData.engineR = 4.0; g.userData.footY = withLegs || landed ? -3.0 : -st.eng.len; return g;
}

// ---------------- part assemblies by spacecraft model ----------------
// returns Group with userData {mounts:[{y, r, tag}], len, footY}
function stackParts(list) { // stack groups vertically (each part built from y=0 upward); returns group
  const g = new THREE.Group(); let y = 0; const mounts = [];
  for (const it of list) { const p = it.g; p.position.y = y + (it.dy || 0); g.add(p); if (it.mount) mounts.push({ y: y + (p.userData.engineY ?? 0), r: p.userData.engineR || it.r || 1, tag: it.mount }); y += (it.len ?? p.userData.len ?? 1) + (it.gap || 0); }
  g.userData.len = y; g.userData.mounts = mounts; return g;
}
function buildSC(model, parts, flags = {}) {
  if (model === 'shuttle') return buildOrbiter(flags);
  if (model === 'iss') return issModel(flags);
  if (model === 'hubble') return hubbleModel({ arrays: true, door: !!flags.door, doorT: flags.doorT });
  const P = new Set(parts || []);
  const g = new THREE.Group(); let inner; const mounts = [];
  const has = k => P.has(k);
  switch (model) {
    case 'apollo': case 'apolloCSM': {
      const LM = () => { const lm = new THREE.Group(); const ds = lmDescentD(); const as = lmAscentD(); as.position.y = 1.65; lm.add(ds); lm.add(as); return lm; };
      // the docking ring on top of the ascent stage, above the ascent stage's origin (NASA's model, or the built-in one)
      const ringA = DETAIL.ready.apollo_lm ? 2.924 : 3.1, ringLM = 1.65 + ringA;
      if (has('orbiter') && has('lander')) { // CSM docked nose-to-nose with the LM (LM inverted above the CM)
        inner = stackParts([{ g: apolloSM(flags.damaged), len: SM_LEN, mount: 'SM' }, { g: apolloCM(false), len: CM_TOP }]);
        const lm = LM(); lm.rotation.x = Math.PI; lm.position.y = SM_LEN + CM_TOP + ringLM; inner.add(lm);
        mounts.push(...inner.userData.mounts, { y: SM_LEN + CM_TOP + ringLM + 1.4, r: 0.75, tag: 'LMDS', flip: true });
        inner.userData.len = SM_LEN + CM_TOP + ringLM + 1.8;
      } else if (has('capsule') && has('lander')) {
        inner = new THREE.Group(); inner.add(apolloCM(false));
        const lm = LM(); lm.rotation.x = Math.PI; lm.position.y = CM_TOP + ringLM; inner.add(lm);
        mounts.push({ y: CM_TOP + ringLM + 1.4, r: 0.75, tag: 'LMDS', flip: true });
        inner.userData.len = CM_TOP + ringLM + 1.8;
      } else if (has('orbiter') && has('ascent')) { // the ascent stage back from the surface, docked to the CM's nose until it is jettisoned
        inner = stackParts([{ g: apolloSM(flags.damaged), len: SM_LEN, mount: 'SM' }, { g: apolloCM(false), len: CM_TOP }]);
        const a = lmAscentD(); a.rotation.x = Math.PI; a.position.y = SM_LEN + CM_TOP + ringA; inner.add(a);
        mounts.push(...inner.userData.mounts); inner.userData.len = SM_LEN + CM_TOP + ringA + 0.9;
      } else if (has('orbiter')) { inner = stackParts([{ g: apolloSM(flags.damaged), len: SM_LEN, mount: 'SM' }, { g: apolloCM(false), len: CM_TOP + 0.25 }]); mounts.push(...inner.userData.mounts); }
      else if (has('lander')) { const ds = lmDescentD(flags.landed); const as = lmAscentD(); as.position.y = 1.65; inner = new THREE.Group(); inner.add(ds); inner.add(as); inner.userData.footY = -1.8; mounts.push({ y: -1.4, r: 0.75, tag: 'LMDS' }); }
      else if (has('descent')) { inner = lmDescentD(true); inner.userData.footY = -1.8; }
      else if (has('ascent')) { inner = lmAscentD(); mounts.push({ y: -0.85, r: 0.45, tag: 'LMAS' }); }
      else if (has('capsule')) { inner = apolloCM(false, false); inner.userData.chuteY = CM_TOP - 0.3; inner.userData.capsuleR = 1.96; } // the probe stayed in the LM
      else if (has('service')) { inner = apolloSM(flags.damaged); }
      break;
    }
    case 'orion': {
      if (has('orbiter')) { inner = stackParts([{ g: orionESM(false), len: 4.6, mount: 'ESM' }, { g: orionCM(false), len: 3.5 }]); mounts.push(...inner.userData.mounts); }
      else if (has('capsule')) { inner = orionCM(false); inner.userData.chuteY = 3.4; inner.userData.capsuleR = 2.5; }
      else if (has('service')) inner = orionESM(false);
      break;
    }
    case 'change5': {
      const ORB = () => { const o = new THREE.Group(); const b = probeBus(2.6, 1.6, 2.6); o.add(b); for (const s of [-1, 1]) { const w = solarWing(4.5, 1.6, 3); w.position.set(s * 1.3, 0.8, 0); if (s < 0) w.rotation.y = Math.PI; o.add(w); } const bl = bell(0.7, 0.35); bl.position.y = -0.7; o.add(bl); o.userData.len = 1.6; o.userData.engineY = -0.7; o.userData.engineR = 0.35; return o; };
      const RET = () => { const r = cyl(0.63, 0.22, 1.0, mat('#cfd2d6', 'metal')); r.userData.len = 1.0; return r; };
      const LDR = () => sampleLander(false);
      const ASC = () => { const a = new THREE.Group(); a.add(probeBus(1.2, 0.9, 1.2, '#d8d8d8', 'foil')); const bl = bell(0.4, 0.2); bl.position.y = -0.4; a.add(bl); a.userData.len = 0.9; a.userData.engineY = -0.4; a.userData.engineR = 0.2; return a; };
      if (has('orbiter') && has('lander')) { inner = stackParts([{ g: ORB(), len: 1.6, mount: 'ORB' }, { g: RET(), len: 1.0, gap: 1.3 }, { g: LDR(), len: 0.9 }, { g: ASC(), len: 0.9 }]); mounts.push(...inner.userData.mounts); }
      else if (has('orbiter') && has('ascent')) { inner = stackParts([{ g: ORB(), len: 1.6, mount: 'ORB' }, { g: RET(), len: 1.0 }]); const a = ASC(); a.rotation.x = Math.PI; a.position.y = 2.6 + 0.9; inner.add(a); mounts.push(...inner.userData.mounts); }
      else if (has('orbiter')) { inner = stackParts([{ g: ORB(), len: 1.6, mount: 'ORB' }, { g: RET(), len: 1.0 }]); mounts.push(...inner.userData.mounts); }
      else if (has('lander')) { inner = stackParts([{ g: LDR(), len: 0.9, mount: 'LDR' }, { g: ASC(), len: 0.9 }]); inner.userData.footY = -1.2; mounts.push(...inner.userData.mounts); }
      else if (has('descent')) { inner = LDR(); inner.userData.footY = -1.2; }
      else if (has('ascent')) { inner = ASC(); mounts.push({ y: -0.4, r: 0.2, tag: 'ASC' }); }
      else if (has('capsule')) { inner = RET(); inner.userData.chuteY = 1.0; inner.userData.capsuleR = 0.63; }
      else if (has('service')) inner = ORB();
      break;
    }
    case 'mariner': {
      inner = new THREE.Group(); const bus = cyl(0.69, 0.69, 0.46, mat('#9a7b3e', 'gold'), 8); inner.add(bus);
      for (let k = 0; k < 4; k++) { const w = solarWing(1.8, 0.9, 1); const a = k * Math.PI / 2; w.position.set(Math.cos(a) * 0.69, 0.4, Math.sin(a) * 0.69); w.rotation.y = -a; inner.add(w); }
      const d = dish(0.6); d.position.y = 0.9; inner.add(d);
      const boom = cyl(0.02, 0.02, 2.2, mat('#aaa', 'metal')); boom.position.y = 0.46; inner.add(boom);
      inner.userData.len = 0.46; mounts.push({ y: -0.1, r: 0.1, tag: 'BUS' }); break;
    }
    case 'msl': {
      const AS = () => aeroshell(2.25, 1.6);
      const CS = () => { const c = new THREE.Group(); const disk = cyl(2.0, 2.0, 0.35, mat('#1d2b4a', 'solar'), 32); c.add(disk); const hub = cyl(0.9, 0.9, 0.5, mat('#c9c9c9', 'metal')); hub.position.y = 0.35; c.add(hub); c.userData.len = 0.85; return c; };
      const DS = () => { const d = new THREE.Group(); const fr = box(2.6, 0.8, 2.6, mat('#bfc3c8', 'metal')); d.add(fr); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + Math.PI / 8; const b = bell(0.35, 0.18); b.position.set(Math.cos(a) * 1.5, -0.2, Math.sin(a) * 1.5); b.rotation.z = Math.cos(a) * 0.35; b.rotation.x = -Math.sin(a) * 0.35; d.add(b); } d.userData.len = 0.8; return d; };
      if (has('cruise')) { inner = stackParts([{ g: AS(), len: 2.6 }, { g: CS(), len: 0.85 }]); mounts.push({ y: 3.0, r: 0.2, tag: 'CRUISE' }); }
      else if (has('aeroshell')) { inner = AS(); inner.userData.chuteY = 2.9; inner.userData.capsuleR = 2.25; inner.userData.dgb = true; }
      else if (has('cruisestage')) inner = CS();
      else if (has('lander')) {
        inner = new THREE.Group(); const ds = DS(); ds.position.y = 0; inner.add(ds);
        const rv = roverD(flags.landed); rv.position.y = flags.landed ? -7.6 : (flags.powered ? -7.6 : -1.3); if (flags.landed) rv.position.y = 0; inner.add(rv);
        if (flags.powered && !flags.landed) { const lines = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.8, 0, 0.8), new THREE.Vector3(-0.6, -6.5, 0.6), new THREE.Vector3(0.8, 0, -0.8), new THREE.Vector3(0.6, -6.5, -0.6), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -6.5, 0)]); inner.add(new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: 0x999999 }))); }
        if (flags.landed) { inner.remove(ds); inner.userData.footY = 0; } else { inner.userData.footY = -7.6; mounts.push({ y: -0.2, r: 1.5, tag: 'DS' }); }
      }
      break;
    }
    case 'tianwen': {
      const ORB = () => { const o = new THREE.Group(); o.add(probeBus(2.4, 1.8, 2.4, '#c9a043')); for (const s of [-1, 1]) { const w = solarWing(5.0, 1.8, 3); w.position.set(s * 1.2, 0.9, 0); if (s < 0) w.rotation.y = Math.PI; o.add(w); } const dd = dish(1.0); dd.position.set(0, 1.9, -0.8); o.add(dd); const bl = bell(0.7, 0.35); bl.position.y = -0.7; o.add(bl); o.userData.len = 1.8; o.userData.engineY = -0.7; o.userData.engineR = 0.35; return o; };
      const CAP = () => { const c = aeroshell(1.7, 1.4, '#e8e4dc'); return c; };
      if (has('cruise')) { const o = ORB(); const c = CAP(); c.rotation.x = Math.PI; c.position.y = 1.8 + 2.4; inner = new THREE.Group(); inner.add(o); inner.add(c); inner.userData.len = 4.2; mounts.push({ y: -0.7, r: 0.35, tag: 'ORB' }); }
      else if (has('orbiter')) { inner = ORB(); mounts.push({ y: -0.7, r: 0.35, tag: 'ORB' }); }
      else if (has('aeroshell')) { inner = CAP(); inner.userData.chuteY = 2.2; inner.userData.capsuleR = 1.7; inner.userData.dgb = true; }
      else if (has('lander')) { inner = sampleLander(model === 'tianwen' && !P.has('mav'), '#d4d6da'); inner.userData.footY = -1.2; if (!flags.landed) mounts.push({ y: -0.7, r: 0.35, tag: 'LDR' }); }
      else if (has('mav')) { inner = new THREE.Group(); const r1 = cyl(0.28, 0.28, 2.8, mat('#ecebe6')); inner.add(r1); const nc = cyl(0.28, 0.02, 0.6, mat('#ecebe6')); nc.position.y = 2.8; inner.add(nc); const b = bell(0.35, 0.22); b.position.y = -0.35; inner.add(b); inner.userData.len = 3.4; mounts.push({ y: -0.35, r: 0.22, tag: 'MAV' }); }
      else if (has('os')) { inner = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), mat('#e0e0e0', 'metal')); inner.userData.len = 0.3; }
      break;
    }
    case 'clipper': {
      inner = new THREE.Group(); const body = cyl(0.8, 0.8, 3.0, mat('#e6e3dc', 'paint')); inner.add(body);
      const hga = dish(1.5, '#f2f2ee'); hga.position.y = 3.6; inner.add(hga);
      for (const s of [-1, 1]) { const w = solarWing(13.5, 4.1, 5, '#16223e'); w.position.set(s * 0.8, 1.3, 0); if (s < 0) w.rotation.y = Math.PI; inner.add(w); }
      const mag = cyl(0.03, 0.03, 8.5, mat('#9aa0a6', 'metal')); mag.rotation.x = Math.PI / 2; mag.position.set(0, 0.6, 4.2); inner.add(mag);
      inner.userData.len = 3.0; mounts.push({ y: -0.1, r: 0.3, tag: 'SC' }); break;
    }
    case 'starshipPayload': {
      inner = starshipShip(flags.landed, flags.landed || flags.powered); mounts.push({ y: inner.userData.engineY, r: 3.6, tag: 'upper' }); break;
    }
    case 'capsuleHab': {
      const cap = () => { const c = new THREE.Group(); c.add(cyl(1.85, 0.75, 2.6, mat('#ecebe6'))); const hs = cyl(1.86, 1.85, 0.2, mat('#3b2a1a', 'dark')); hs.position.y = -0.2; c.add(hs); c.userData.len = 2.6; return c; };
      if (has('orbiter')) { const sm = new THREE.Group(); sm.add(cyl(1.8, 1.8, 2.2, mat('#dcdcdc', 'metal'))); for (const s of [-1, 1]) { const w = solarWing(5.0, 1.8, 3); w.position.set(s * 1.8, 1.0, 0); if (s < 0) w.rotation.y = Math.PI; sm.add(w); } const bl = bell(1.0, 0.45); bl.position.y = -1.0; sm.add(bl); sm.userData.len = 2.2; sm.userData.engineY = -1.0; sm.userData.engineR = 0.45;
        const hab = cyl(2.1, 2.1, 4.2, mat('#f1efe8', 'fabric'), 32); hab.userData.len = 4.2;
        inner = stackParts([{ g: sm, len: 2.2, mount: 'PROP' }, { g: hab, len: 4.2 }, { g: cap(), len: 2.6 }]); mounts.push(...inner.userData.mounts); }
      else if (has('capsule')) { inner = cap(); inner.userData.chuteY = 2.6; inner.userData.capsuleR = 1.85; }
      else if (has('service')) { inner = cyl(2.1, 2.1, 4.2, mat('#f1efe8', 'fabric'), 32); }
      break;
    }
    case 'chandrayaan': {
      if (has('orbiter')) { inner = new THREE.Group(); inner.add(probeBus(2.0, 1.6, 2.0)); const w = solarWing(4.0, 1.4, 2); w.position.set(1.0, 0.8, 0); inner.add(w); const l = sampleLander(true); l.position.y = 1.6 + 1.2; inner.add(l); mounts.push({ y: -0.2, r: 0.3, tag: 'PM' }); }
      else { inner = sampleLander(true); inner.userData.footY = -1.2; if (!flags.landed) mounts.push({ y: -0.7, r: 0.35, tag: 'LDR' }); }
      break;
    }
  }
  if (!inner) { inner = probeBus(1.5, 1.5, 1.5, '#c9a043'); inner.userData.len = 1.5; mounts.push({ y: 0, r: 0.3, tag: 'any' }); }
  g.add(inner);
  g.userData = { len: inner.userData.len || 2, mounts, footY: inner.userData.footY, chuteY: inner.userData.chuteY, capsuleR: inner.userData.capsuleR, dgb: inner.userData.dgb };
  return g;
}
// stowed spacecraft on top of an upper stage (inside adapters / fairings)
function buildStowed(model, rBelow, fl = {}) {
  const les = !!fl.les, saj = !!fl.saj;
  const g = new THREE.Group(); let y = 0;
  if (model === 'apollo' || model === 'apolloCSM') {
    const sla = cyl(3.3, 1.96, 8.5, mat('#e7e5df')); g.add(sla); y = 8.5;
    const sm = apolloSM(false, true); sm.position.y = y; g.add(sm); y += SM_LEN;
    const cm = apolloCM(les); cm.position.y = y; g.add(cm); y += cm.userData.len;
    g.userData = { len: y, mounts: [{ y: 8.5 + sm.userData.engineY, r: sm.userData.engineR, tag: 'SM' }] }; return g;
  }
  if (model === 'orion') {
    const ad = cyl(2.55, 2.05, 1.6, mat('#d9d6cf')); g.add(ad); y = 1.6;
    const esm = orionESM(true); esm.position.y = y + 1.9; g.add(esm); const fair = cyl(2.6, 2.6, 5.9, mat('#efeee9')); fair.position.y = y; if (saj) g.add(fair); y += 1.9 + 4.6;
    const cm = orionCM(les); cm.position.y = y; g.add(cm); y += cm.userData.len;
    g.userData = { len: y, mounts: [{ y: 1.6, r: 0.6, tag: 'ESM' }] }; return g;
  }
  if (model === 'starshipPayload') { g.userData = { len: 0, mounts: [] }; return g; }
  const ad = cyl(Math.min(rBelow, 1.6), 0.8, 1.0, mat('#bdbdbd', 'metal')); g.add(ad);
  const sc = buildSC(model, model === 'msl' ? ['cruise'] : model === 'tianwen' ? ['cruise'] : model === 'change5' ? ['orbiter', 'lander'] : ['orbiter']);
  sc.position.y = 1.0 + 0.8; g.add(sc);
  g.userData = { len: 1.8 + (sc.userData.len || 2), mounts: (sc.userData.mounts || []).map(m => ({ ...m, y: m.y + 1.8 })) }; return g;
}
// full launch stack from launcher config
function buildLaunchStack(lkey, scModel, c) {
  const L = LAUNCHERS[lkey]; if (L.sideMount) return buildShuttleStack(L, c);
  const g = new THREE.Group(); const mounts = [];
  const core = L.stages.map((s, i) => ({ s, i })).filter(o => !o.s.parallel && o.i >= (c.stFrom || 0));
  let y = 0, firstCoreY = null, rCore = 1;
  for (const { s, i } of core) {
    const st = buildStage(s, { ist: c.ist }); st.group.position.y = y; g.add(st.group);
    mounts.push({ y: y - st.engLen, r: Math.max(s.geom[0][1] * 0.75, s.eng ? s.eng.r * 1.2 : 1), tag: 'stage:' + s.id, prop: s.prop, idx: i });
    if (firstCoreY == null) { firstCoreY = y; rCore = s.geom[0][1]; }
    y += st.len;
  }
  const bst = L.stages[0].parallel ? L.stages[0] : null;
  if (bst && c.boosters) {
    const n = bst.booster.count, off = bst.booster.offset;
    for (let k = 0; k < n; k++) { const a = n === 2 ? k * Math.PI : k * Math.PI / 2 + Math.PI / 4; const b = buildStage(bst); b.group.position.set(Math.cos(a) * off, (firstCoreY || 0) + 0.5, Math.sin(a) * off); g.add(b.group); mounts.push({ y: (firstCoreY || 0) + 0.5 - b.engLen, r: Math.max(bst.geom[0][1] * 0.8, 0.6), x: Math.cos(a) * off, z: Math.sin(a) * off, tag: 'stage:' + bst.id, prop: bst.prop, idx: 0 }); }
  }
  const topR = core.length ? core[core.length - 1].s.geom[core[core.length - 1].s.geom.length - 1][2] : 2;
  const PF = L.payloadFairing;
  if (PF && c.fairing) {
    const yF = PF.encloseUpper && core.length >= 2 ? y - core[core.length - 1].s.geom.reduce((a, gg) => a + gg[0], 0) - 0.5 : y;
    const f = ogive(PF.r, PF.len, mat(PF.color)); f.position.y = yF; g.add(f); y = yF + PF.len;
  } else if (lkey !== 'starship') {
    const st = buildStowed(scModel, topR, { les: c.les, saj: c.saj }); st.position.y = y; g.add(st); y += st.userData.len;
  }
  g.userData = { len: y, mounts };
  return g;
}
function buildStageOnly(lkey, idx, withAdapter, variant) {
  const L = LAUNCHERS[lkey]; let s = L.stages[idx];
  if (variant === 'sts1' && lkey === 'shuttle' && idx === 1) s = { ...s, geom: s.geom.map(p => [p[0], p[1], p[2], p[3] === '#4a4a4a' ? p[3] : '#e9e7e0', p[4]]) }; // STS-1's painted (white) tank
  const st = buildStage(s, { ist: false, white: variant === 'sts1' && lkey === 'shuttle' && idx === 1 }); // (a spent stage's aft interstage went long before)
  if (s.parallel && s.booster) { // drop all boosters together
    const g = new THREE.Group(); const n = s.booster.count, off = s.booster.offset;
    for (let k = 0; k < n; k++) { const a = n === 2 ? k * Math.PI : k * Math.PI / 2 + Math.PI / 4; const b = k === 0 ? st : buildStage(s); b.group.position.set(Math.cos(a) * off, 0, Math.sin(a) * off); if (n === 2 && k === 1) b.group.scale.x = -1; g.add(b.group); } // a pair: mirror images
    g.userData = { len: st.len, mounts: [] }; return g;
  }
  if (withAdapter) { const sla = cyl(3.3, 3.3, 1.0, mat('#e7e5df')); sla.position.y = st.len; st.group.add(sla); for (let k = 0; k < 4; k++) { const p = box(2.6, 7.0, 0.1, mat('#e7e5df')); const a = k * Math.PI / 2; p.position.set(Math.cos(a) * 4.5, st.len - 1, Math.sin(a) * 4.5); p.rotation.y = -a + Math.PI / 2; p.rotation.x = 0.7; st.group.add(p); } }
  st.group.userData = { len: st.len, mounts: [{ y: -st.engLen, r: s.geom[0][1] * 0.6, tag: 'upper', prop: s.prop }] };
  return st.group;
}
// a launcher's aft interstage after it has been dropped (the S-II's): the first piece of its stage's geometry, an open ring
function buildInterstage(lkey) {
  const st = LAUNCHERS[lkey].stages.find(s => s.geom[0][4] && s.geom[0][4].ist), [len, rb, rt, color] = st.geom[0];
  const ring = cyl(rb, rt, len, patternMat('band', color), 48, true); ring.material = ring.material.clone(); ring.material.side = THREE.DoubleSide;
  const g = st.detail ? detailPart(st.detail, 'IST', ring) : ring;
  g.userData = { len, mounts: [] }; return g;
}
// center a model on its bounding-box centre along Y and record offsets
function finishModel(g) {
  const len = g.userData.len || 1; const yc = g.userData.yc0 ?? len * 0.45; // yc0: models whose origin is their reference point (the orbiter's, the ISS's)
  const wrap = new THREE.Group(); g.position.y = -yc; wrap.add(g);
  wrap.userData = { ...g.userData, yc, wrapped: true };
  wrap.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(wrap); const sz = new THREE.Vector3(); bb.getSize(sz);
  wrap.userData.sizeM = Math.max(sz.x, sz.y, sz.z, 1); // largest dimension in metres (solar arrays included)
  wrap.userData.bbox = { w: sz.x, h: sz.y, d: sz.z };
  wrap.userData.bbY = [bb.min.y, bb.max.y]; // lowest and highest point along the axis, metres (the camera frames a standing vehicle with it)
  const wheels = []; wrap.traverse(n => { if (n.userData && n.userData.wheel) wheels.push(n); }); wrap.userData.wheels = wheels;
  return wrap;
}
function modelForConfig(cfgL, objModel) {
  const c = cfgL || { key: 'sc', sc: objModel, parts: ['orbiter'] };
  let g;
  if (c.key === 'launch') g = buildLaunchStack(c.launcher, objModel, c);
  else if (c.key === 'stack') { const L = LAUNCHERS[c.launcher]; const up = buildStageOnly(c.launcher, c.stage, false); const gg = new THREE.Group(); gg.add(up); let y = up.userData.len; const mounts = [{ y: up.userData.mounts[0].y, r: up.userData.mounts[0].r, tag: 'upper', prop: L.stages[c.stage].prop }];
    if (c.launcher !== 'starship') { const st = buildStowed(c.sc, L.stages[c.stage].geom.slice(-1)[0][2], {}); st.position.y = y; gg.add(st); for (const m of st.userData.mounts) mounts.push({ ...m, y: m.y + y }); y += st.userData.len; }
    gg.userData = { len: y, mounts }; g = gg; }
  else if (c.key === 'stage') g = buildStageOnly(c.launcher, c.stage, c.withAdapter, c.variant);
  else if (c.key === 'ist') g = buildInterstage(c.launcher);
  else if (c.key === 'capsule') g = buildSC(c.sc, ['capsule'], {});
  else g = buildSC(c.sc || objModel, c.parts, c);
  return finishModel(g);
}

// ---------------- plumes, chutes, plasma ----------------
const GLSL_PLUME_V = `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp;
#include <logdepthbuf_vertex>
}`;
const GLSL_PLUME_F = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor; uniform vec3 uCore; uniform float uI; uniform float uTime; uniform float uDiam; uniform float uDF; uniform float uDL; uniform float uCF;
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
void main(){
  #include <logdepthbuf_fragment>
  float along = 1.0 - vUv.y;
  vec3 V = normalize(cameraPosition - vP);
  float edge = abs(dot(normalize(vN), V));
  float body = pow(edge, 1.3) * pow(1.0 - along, 1.6);
  float flick = 0.85 + 0.15 * sin(uTime * 37.0 + along * 23.0) * sin(uTime * 11.0);
  // shock diamonds: spaced by the nozzle size and confined to the stretch just behind it, however long the flame
  float diam = uDiam * smoothstep(0.55, 1.0, sin(along * uDF - uTime * 3.0)) * (1.0 - smoothstep(uDL * 0.55, uDL, along)) * (1.0 - along) * edge;
  vec3 col = mix(uCore, uColor, smoothstep(0.0, uCF, along));
  gl_FragColor = vec4(col * (body * flick + diam * 0.8) * uI, 1.0);
}`;
function makePlume() {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true); geo.translate(0, -0.5, 0); // top (v=1) at y=0, extends to y=-1
  const m = new THREE.ShaderMaterial({ vertexShader: GLSL_PLUME_V, fragmentShader: GLSL_PLUME_F, uniforms: { uColor: { value: new THREE.Color() }, uCore: { value: new THREE.Color() }, uI: { value: 1 }, uTime: { value: 0 }, uDiam: { value: 0 }, uDF: { value: 46 }, uDL: { value: 1 }, uCF: { value: 0.45 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; mesh.renderOrder = 6; return mesh;
}
// shapes the open cone: radius at the nozzle r0, at the tail r1, length len
function shapePlume(p, r0, r1, len) {
  const pos = p.geometry.attributes.position; if (!p.userData.base) p.userData.base = Float32Array.from(pos.array);
  const b = p.userData.base;
  for (let i = 0; i < pos.count; i++) { const x = b[3 * i], y = b[3 * i + 1], z = b[3 * i + 2]; const f = -y; const r = r0 + (r1 - r0) * Math.pow(f, 0.7); pos.array[3 * i] = x * r; pos.array[3 * i + 1] = y * len; pos.array[3 * i + 2] = z * r; }
  pos.needsUpdate = true;
}
function makeChutes(kind, n, diam, capR) {
  const g = new THREE.Group(); const colr = kind === 'dgb' ? '#d9662b' : '#e05a25';
  const canopy = new THREE.SphereGeometry(diam / 2, 32, 10, 0, TAU, 0, Math.PI / 2.4);
  const matC = patternMat('chute', colr);
  const offs = n === 3 ? [[-0.55, 0], [0.55, 0], [0, 0.6]] : n === 2 ? [[-0.5, 0], [0.5, 0]] : [[0, 0]];
  const riser = diam * 1.25;
  for (const [ox, oz] of offs) {
    const c = new THREE.Mesh(canopy, matC); const cx = ox * diam * 0.85, cz = oz * diam * 0.85; c.position.set(cx, riser, cz); g.add(c);
    const pts = []; for (let k = 0; k < 12; k++) { const a = k * TAU / 12; const rr = diam / 2 * Math.sin(Math.PI / 2.4); pts.push(new THREE.Vector3(cx + Math.cos(a) * rr, riser + diam / 2 * Math.cos(Math.PI / 2.4), cz + Math.sin(a) * rr), new THREE.Vector3(0, 0, 0)); }
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xbbbbbb, transparent: true, opacity: 0.7 })));
  }
  return g;
}
function makePlasma() {
  const g = new THREE.Group();
  const s = makeGlowSprite('#ff9a5c', 1.0); s.material.depthTest = true; g.add(s); g.userData.sprite = s;
  const wake = makePlume(); wake.material.uniforms.uColor.value.set('#ff5f3a'); wake.material.uniforms.uCore.value.set('#ffe0b0'); g.add(wake); g.userData.wake = wake;
  return g;
}
