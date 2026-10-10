// ============================================================================
// Mission view: craft nodes (models, plumes, chutes, plasma), trajectory
// lines in selectable frames, labels, vectors, osculating orbit, surface caps.
// ============================================================================
const MV = { md: null, crafts: [], trails: [], caps: [], capInfo: [], frame: 'earth', frameSel: 'auto', layers: {}, labels: [], vecs: [], smoke: null, tNow: 0 };
const PROP_LOOK = { // plume look per propellant: [intensity, diamonds, core]
  kerolox: [1.25, 0.25, '#fff2c8'], solid: [1.5, 0.15, '#fffbe8'], hydrolox: [0.55, 0.9, '#e8f2ff'], methalox: [0.8, 0.6, '#eef0ff'],
  hypergolic: [0.5, 0.0, '#fff0dc'], udmh: [0.6, 0.1, '#fff0dc'], mmh: [0.45, 0.0, '#fff2e6'], hydrazine: [0.3, 0.0, '#f4f8ff'], xenon: [0.4, 0, '#e0e8ff'],
};
function disposeTree(o) { o.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material && !Object.values(MATS).includes(n.material) && !Object.values(TEX).includes(n.material)) { if (Array.isArray(n.material)) n.material.forEach(m => m.dispose()); else n.material.dispose(); } }); }
function clearMissionView() {
  for (const c of MV.crafts) { R.scene.remove(c.node); disposeTree(c.node); c.label && c.label.remove(); if (c.shadow) { R.scene.remove(c.shadow); c.shadow.geometry.dispose(); c.shadow.material.dispose(); } }
  if (MV.tracks) { MV.tracks.parent && MV.tracks.parent.remove(MV.tracks); MV.tracks.geometry.dispose(); MV.tracks.material.dispose(); MV.tracks = null; }
  for (const tr of MV.trails) tr.dispose();
  for (const cp of MV.caps) { cp.parent && cp.parent.remove(cp); cp.geometry.dispose(); }
  if (MV.pad) { R.scene.remove(MV.pad); disposeTree(MV.pad); MV.pad = null; }
  MV.crafts = []; MV.trails = []; MV.caps = []; MV.capInfo = [];
}
function setupMissionView(md) {
  clearMissionView();
  MV.md = md;
  const M = md.M;
  for (const o of M.objects) {
    const node = new THREE.Group(); node.visible = false; R.scene.add(node);
    const c = { o, node, models: new Map(), cur: null, curKey: null, q: new THREE.Quaternion(), qInit: false, plumes: [], chute: null, chuteKey: null, plasma: null, P: null, s: null };
    for (let i = 0; i < 6; i++) { const p = makePlume(); p.visible = false; node.add(p); c.plumes.push(p); }
    c.plasma = makePlasma(); c.plasma.visible = false; node.add(c.plasma);
    const isPrim = o.id === 'ship';
    c.label = h('div', { class: 'lbl craft' + (isPrim ? ' primary' : ''), style: `color:${isPrim ? 'var(--amber)' : (o.kind === 'craft' ? '#7fd1ff' : '#9aa3ad')}` }, h('span', { class: 'dot' }), h('span', { class: 'nm' }, o.name), h('span', { class: 'eng' }, 'ENGINE ON'), h('span', { class: 'sub' }));
    c.label.addEventListener('dblclick', e => { e.stopPropagation(); setTarget('obj:' + o.id); });
    c.label.addEventListener('click', e => { e.stopPropagation(); if (e.detail === 1) setTarget('obj:' + o.id); });
    $('#labels').append(c.label);
    MV.crafts.push(c);
    if (o.trail !== false && o.segs.length && o.kind !== 'debris') MV.trails.push(new Trail(o, md, isPrim));
  }
  buildSurfaceCaps(md);
  buildTracks(md);
  buildPad(md);
  MV.frameBuilt = null;
}
function craftById(id) { return MV.crafts.find(c => c.o.id === id); }

// ---------------- state helpers ----------------
function padState(md, t) { // the vehicle standing on the pad before liftoff
  const S = LAUNCH_SITES[md.cfg.site]; const r = sitePosEcl('earth', S.lat, S.lon, 0, t);
  return { ref: 'earth', r, v: vcross(bodyOmegaEcl('earth', t), r), m: 0, T: 0, dir: vunit(r), D: [0, 0, 0], extra: { phase: 'on the pad', alt: 0 }, pad: true, surface: true };
}
function craftState(c, t) {
  let s = c.o.stateAt(t);
  if (!s && c.o.id === 'ship' && t < c.o.t0 && t > c.o.t0 - 4 * 3600) {
    s = padState(MV.md, t);
    const s0 = c.o.segs[0] && c.o.segs[0].stateAt(c.o.t0); if (s0 && s0.m) s.m = s0.m;
    const ig = padIgnition(MV.md, t); // engines lit, clamps still holding
    if (ig && ig.f > 0) { s.T = ig.thrust; s.ign = ig; s.extra.phase = 'ignition'; s.extra.stage = ig.core; s.extra.throttle = ig.f; }
  }
  return s;
}
function cfgAt(c, t) { const x = c.o.configAt(t); if (x) return x.label; return c.o.configs.length ? c.o.configs[0].label : null; }

// ---------------- crafts ----------------
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
function basisQuat(nose, upRef, q) {
  const Y = new THREE.Vector3(nose[0], nose[1], nose[2]).normalize();
  let U = new THREE.Vector3(upRef[0], upRef[1], upRef[2]);
  if (Math.abs(U.clone().normalize().dot(Y)) > 0.98) U = Math.abs(Y.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const X = new THREE.Vector3().crossVectors(Y, U).normalize(); const Z = new THREE.Vector3().crossVectors(X, Y);
  _m4.makeBasis(X, Y, Z); return q.setFromRotationMatrix(_m4);
}
function activeMounts(c, s, t, cfgL, model) {
  const out = []; if (!(s.T > 0)) return out;
  const mounts = model.userData.mounts || [];
  if (cfgL && cfgL.key === 'launch') {
    const st = s.extra && s.extra.stage; const L = LAUNCHERS[cfgL.launcher];
    const bst = L.stages[0].parallel ? L.stages[0] : null;
    for (const m of mounts) {
      if (!m.tag.startsWith('stage:')) continue; const id = m.tag.slice(6);
      if (id === st) out.push(m);
      else if (bst && id === bst.id && cfgL.boosters) { const tb = t - MV.md.M.t0; if (tb < 0 && bst.prop === 'solid') continue; const burnT = bst.propMass / (bst.thrustSL / (bst.ispSL * G0)); if (tb < burnT * 1.15) out.push(m); }
    }
    return out;
  }
  const b = MV.md.burnAt(t, c.o.id);
  let tag = null;
  if (b) { const tk = MV.md.tanks.find(k => k.engine === b.engine); tag = tk ? tk.id : null; }
  if (cfgL && cfgL.key === 'stack') tag = 'upper';
  let m = tag && mounts.find(mm => mm.tag === tag);
  if (!m) m = mounts.find(mm => mm.tag === 'upper') || mounts[0];
  if (m) out.push(m);
  return out;
}
function noseDirection(c, s, t, cfgL, act) {
  const rD = c.rD || s.r, vD = c.vD || s.v, body = c.dom || s.ref;
  const up = vunit(rD), ex = s.extra || {};
  const rot = body === 'earth' || body === 'mars';
  const vAir = rot ? vsub(vD, vcross(bodyOmegaEcl(body, t), rD)) : vD;
  const alt = body === 'sun' ? 1e9 : vnorm(rD) - surfaceRadius(body);
  if (s.surface || s.pad || (cfgL && cfgL.landed) || ex.phase === 'landed' || ex.phase === 'touchdown' || ex.phase === 'recovery') return { nose: up, roll: s.hdg || vperp(up) };
  if (s.T > 0 && s.dir && vnorm(s.dir) > 0.5) { const flip = act[0] && act[0].flip; return { nose: flip ? vscale(s.dir, -1) : s.dir, roll: up }; }
  if (cfgL && (cfgL.key === 'capsule' || (cfgL.parts && cfgL.parts.includes('aeroshell')))) {
    if (cfgL.chutes || cfgL.chute || ex.chute) return { nose: up, roll: vperp(up) };
    const vv = alt < 200 ? vAir : vD; return { nose: vscale(vunit(vv), -1), roll: up };
  }
  if (c.o.model === 'starshipPayload' && alt < 160 && (body === 'earth' || body === 'mars') && cfgL && cfgL.key !== 'launch') {
    const hz = vsub(vAir, vscale(up, vdot(vAir, up))); return { nose: vnorm(hz) > 1e-6 ? vunit(hz) : vperp(up), roll: vscale(vunit(vAir), -1) };
  }
  if (cfgL && cfgL.key === 'launch' && t < MV.md.M.t0 + 1) return { nose: up, roll: vperp(up) };
  const v = vnorm(vD) > 1e-6 ? vD : up; return { nose: vunit(v), roll: up };
}
function computeCraft(c, t) {
  const s = craftState(c, t); c.s = s; if (!s) { c.P = null; return; }
  if (s.surface && !s.pad && MV.md) groundCraft(c, s, t);
  if (!(s.T > 0) && !s.surface && MV.md) { // a burn the plan applies as an instant Δv: show it firing for its real duration
    const x = MV.md.impAt(t, c.o.id);
    if (x) { const b = x.burn, dur = Math.max(x.t1 - x.t0, 1), m = s.m > 0 ? s.m : (b.m0 || 1000); s.T = m * (b.dv || 0) / dur; s.dir = x.dir || (/insertion|capture|braking|descent|deorbit|retro/i.test(x.name) ? vscale(vunit(s.v), -1) : vunit(s.v)); s.imp = true; }
  }
  const Hs = helio(s.ref, t); c.P = vadd(Hs.r, s.r); c.Vh = vadd(Hs.v, s.v);
  const b = s.surface || s.pad ? s.ref : dominantBody(c.P, t); c.dom = b;
  if (b === s.ref) { c.rD = s.r; c.vD = s.v; } else { const B = helio(b, t); c.rD = vsub(c.P, B.r); c.vD = vsub(c.Vh, B.v); }
}
function updateCraft(c, t, camPos) {
  const s = c.s;
  if (!s) { c.node.visible = false; return; }
  const P = c.P;
  const O = R.O; c.node.position.set(P[0] - O[0], P[1] - O[1], P[2] - O[2]); c.node.visible = true;
  const cfgL = cfgAt(c, t);
  const key = JSON.stringify(cfgL || {}) + '|' + c.o.model;
  if (key !== c.curKey) {
    let m = c.models.get(key);
    if (!m) { m = modelForConfig(cfgL || { key: 'sc', sc: c.o.model, parts: ['orbiter'] }, c.o.model); c.models.set(key, m); }
    if (c.cur) c.node.remove(c.cur);
    c.node.add(m); c.cur = m; c.curKey = key;
  }
  const model = c.cur;
  const act = activeMounts(c, s, t, cfgL, model);
  const nd = noseDirection(c, s, t, cfgL, act);
  basisQuat(nd.nose, nd.roll, _q1);
  if (!s.surface && !s.pad && (c.o.kind === 'debris' || (c.o.kind === 'stage' && !(s.T > 0)))) { // slow tumble after separation (not once it rests on a surface, e.g. the LM descent stage left on the Moon)
    const age = t - c.o.t0; const ax = new THREE.Vector3(0.3, 0.2, 1).normalize(); _q2.setFromAxisAngle(ax, age * 0.035); _q1.multiply(_q2);
  }
  const realDt = MV.realDt || 0.016; const jump = Math.abs(t - (c.lastT ?? t)) > Math.max(30, (MV.rate || 1) * 0.5) || !c.qInit;
  if (jump) c.q.copy(_q1); else c.q.slerp(_q1, 1 - Math.exp(-realDt * 5));
  c.qInit = true; c.lastT = t;
  c.node.quaternion.copy(c.q);
  // scale: metres → km; optionally enlarge distant craft
  const dist = Math.max(1e-9, camPos.distanceTo(c.node.position));
  let sc = 0.001;
  if (MV.layers.bigcraft) { const pxPerKm = R.pxPerRad / dist; const lenKm = (model.userData.len || 10) * 0.001; const px = lenKm * pxPerKm; if (px < 26) sc *= 26 / Math.max(px, 1e-6); }
  c.node.scale.setScalar(sc);
  // feet on the ground when standing on a surface (and for the whole launch stack, whose state is its base)
  const ud = model.userData; const altK = vnorm(s.r) - surfaceRadius(s.ref);
  const surf = s.surface || s.pad || (cfgL && cfgL.landed) || (cfgL && cfgL.key === 'launch') || (ud.footY != null && altK < 3);
  if (surf) { let fy = ud.footY; if (fy == null) { const ms = (ud.mounts || []).map(m => m.y); fy = ms.length ? Math.min(...ms) : 0; } model.position.y = ud.yc - (fy + 0) + (cfgL && cfgL.key === 'launch' && s.ref === 'earth' ? PAD_TOP + MOUNT_H : 0); } else model.position.y = 0;
  c.yOff = model.position.y;
  if (ud.wheels && ud.wheels.length) { const wo = s.rover ? s.rover.wodo : 0; for (const w of ud.wheels) w.rotation.x = -wo / w.userData.wheel; }
  // plumes
  updatePlumes(c, s, t, act, model);
  // parachutes
  const ch = cfgL && (cfgL.chutes || cfgL.chute) ? (cfgL.chutes || cfgL.chute) : 0;
  const chKey = ch ? (cfgL.key + ch + (model.userData.dgb ? 'd' : '')) : null;
  if (chKey !== c.chuteKey) {
    if (c.chute) { c.node.remove(c.chute); disposeTree(c.chute); c.chute = null; }
    if (chKey) {
      const capR = model.userData.capsuleR || 2; const dgb = model.userData.dgb;
      const n = dgb ? 1 : (ch >= 2 ? (capR > 1.5 ? 3 : 1) : 2);
      const diam = dgb ? (c.o.model === 'msl' ? 21.5 : 16) : ch >= 2 ? (capR > 2.2 ? 35 : capR > 1.5 ? 25.4 : 9) : (capR > 1.5 ? 5 : 2);
      c.chute = makeChutes(dgb ? 'dgb' : 'ring', n, diam, capR); c.chute.position.y = (model.userData.chuteY || 3) - model.userData.yc + (c.yOff || 0); c.node.add(c.chute);
    }
    c.chuteKey = chKey;
  }
  // plasma sheath during entry
  const heat = s.extra && s.extra.heat || 0;
  if (heat > 3 && !(ch)) {
    const r = (model.userData.capsuleR || (model.userData.len || 8) * 0.25);
    const k = clamp(Math.log10(heat) / 2.3, 0.15, 1.15);
    c.plasma.visible = true;
    const vAirDir = vunit(s.v); // wake trails behind along −v (world), convert to model frame
    const inv = c.q.clone().invert(); const vd = new THREE.Vector3(vAirDir[0], vAirDir[1], vAirDir[2]).applyQuaternion(inv);
    const front = vd.clone().multiplyScalar(r * 0.9);
    c.plasma.userData.sprite.position.copy(front); c.plasma.userData.sprite.scale.setScalar(r * 5 * k);
    c.plasma.userData.sprite.material.opacity = 0.9 * k;
    const wake = c.plasma.userData.wake; wake.position.copy(front);
    wake.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vd.clone().normalize());
    shapePlume(wake, r * 1.1, r * 2.2, r * 14 * k); wake.material.uniforms.uI.value = 0.9 * k; wake.material.uniforms.uTime.value = performance.now() / 1000;
  } else c.plasma.visible = false;
}
function updatePlumes(c, s, t, act, model) {
  let i = 0;
  if (act.length && s.T > 0) {
    const alt = vnorm(s.r) - surfaceRadius(s.ref);
    const pr = s.ref === 'earth' ? Math.exp(-Math.max(alt, 0) / 7.2) : s.ref === 'mars' ? 0.006 * Math.exp(-Math.max(alt, 0) / 11) : 0;
    const vac = 1 - Math.min(1, pr * 1.2);
    const thr = clamp(s.extra && s.extra.throttle != null ? s.extra.throttle : 1, s.pad ? 0.04 : 0.2, 1);
    const cfgL = cfgAt(c, t);
    for (const m of act) {
      if (i >= c.plumes.length) break;
      let prop = m.prop;
      if (!prop) { const b = MV.md.burnAt(t, c.o.id); prop = b && b.propType ? b.propType : (cfgL && cfgL.key === 'stack' ? LAUNCHERS[cfgL.launcher].stages[cfgL.stage].prop : 'mmh'); if (!b && s.extra && /powered|descent|landing/.test(s.extra.phase || '')) prop = (MV.md.SC.modules.DS || MV.md.SC.modules.LDR)?.engine?.prop || prop; }
      if (c.o.model === 'starshipPayload' || (cfgL && cfgL.launcher === 'starship' && cfgL.key !== 'launch')) prop = 'methalox';
      const look = PROP_LOOK[prop] || PROP_LOOK.mmh; const colr = (PROP[prop] || PROP.mmh).plume;
      const p = c.plumes[i++]; p.visible = true;
      const r0 = m.r * 0.85; const len = m.r * (5 + 16 * vac) * Math.sqrt(thr) * (prop === 'solid' ? 1.4 : 1);
      shapePlume(p, r0, r0 * (1.3 + 5.5 * vac), len);
      const yc = model.userData.yc || 0;
      p.position.set(m.x || 0, m.y - yc + (c.yOff || 0), m.z || 0);
      p.rotation.set(m.flip ? Math.PI : 0, 0, 0);
      const u = p.material.uniforms; u.uColor.value.set(colr); u.uCore.value.set(look[2]);
      u.uI.value = look[0] * (0.35 + 0.65 * (1 - vac * 0.6)) * thr; u.uDiam.value = look[1] * (1 - vac); u.uTime.value = performance.now() / 1000;
    }
  }
  for (; i < c.plumes.length; i++) c.plumes[i].visible = false;
}

// ---------------- launch pad & surface caps ----------------
const PAD_TOP = 0.8; // m: the deck top stands this far above the ground (never coplanar with it, so the two cannot z-fight)
const MOUNT_H = 6;   // m: the vehicle stands on hold-down posts this high above the deck; the exhaust goes down through an opening
// liquid engines lighting on the pad before liftoff: share of liftoff thrust built up so far (null outside the hold-down period)
function padIgnition(md, t) {
  const L = md.L, IG = L.ign; if (!IG || !(IG.t > 0) || t >= md.M.t0) return null;
  const dt = t - (md.M.t0 - IG.t); if (dt < 0) return null;
  const nG = IG.stagger ? 3 : 1; let f = 0;
  for (let k = 0; k < nG; k++) f += smoothstep(clamp((dt - k * (IG.stagger || 0)) / Math.max(IG.ramp, 0.1), 0, 1)) / nG;
  const liq = liftoffStages(L).filter(s => s.prop !== 'solid');
  return { f, full: f > 0.985, thrust: liq.reduce((a, s) => a + s.thrustSL, 0) * f, core: (liq.find(s => !s.parallel) || liq[0] || {}).id, liq, dt };
}
const GLSL_CLOUD_V = `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aSize; attribute float aA; attribute float aG; varying float vA; varying float vG; uniform float uPx;
void main(){ vA = aA; vG = aG; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aSize * uPx / max(-mv.z, 1e-9), 1.0, 1000.0);
#include <logdepthbuf_vertex>
}`;
const GLSL_CLOUD_F = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uCol; uniform vec3 uGlow; varying float vA; varying float vG;
void main(){
  #include <logdepthbuf_fragment>
  vec2 q = gl_PointCoord - 0.5; float d = length(q) * 2.0; float a = (1.0 - smoothstep(0.2, 1.0, d)) * vA; if (a < 0.01) discard;
  vec3 c = mix(uCol * (0.8 + 0.25 * (0.5 - q.y)), uGlow, vG);
  gl_FragColor = vec4(c, a);
}`;
const CLOUD_N = 420;
const hash01 = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function buildPad(md) {
  const L = md.L; const g = new THREE.Group();
  const bst = L.stages[0].parallel ? L.stages[0] : null;
  const foot = Math.max(L.diameter / 2, bst && bst.booster ? bst.booster.offset + bst.geom[0][1] : 0); // footprint radius, m
  const hTower = Math.max(60, L.height * 0.95 + MOUNT_H);
  const tower = box(10, hTower, 10, mat('#8a2f22', 'metal')); tower.position.set(foot + 15, 0, 0); g.add(tower);
  const deck = cyl(90, 90, 6 + PAD_TOP, mat('#a7a39a', 'dark'), 8); deck.position.y = -6; g.add(deck);
  // flame trench across the deck, the exhaust opening under the engines (it glows while they fire) and the hold-down posts
  const trench = box(16, 0.15, 180, mat('#34312c', 'dark')); trench.position.set(0, PAD_TOP, 0); g.add(trench);
  const holeMat = new THREE.MeshBasicMaterial({ color: '#141210' });
  const hole = box(foot * 2 + 4, 0.2, foot * 2 + 4, holeMat); hole.position.y = PAD_TOP + 0.05; g.add(hole);
  const postMat = mat('#6d6a64', 'metal'), rP = foot + 1.8;
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; const p = box(2.4, MOUNT_H, 2.4, postMat); p.position.set(Math.cos(a) * rP, PAD_TOP, Math.sin(a) * rP); g.add(p); }
  // exhaust and steam billowing out of the flame trench (fixed to the pad, so it stays put as Earth turns)
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * CLOUD_N), 3)); cg.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(CLOUD_N), 1));
  cg.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(CLOUD_N), 1)); cg.setAttribute('aG', new THREE.BufferAttribute(new Float32Array(CLOUD_N), 1));
  const cm = new THREE.ShaderMaterial({ vertexShader: GLSL_CLOUD_V, fragmentShader: GLSL_CLOUD_F, uniforms: { uPx: { value: 800 }, uCol: { value: new THREE.Color('#e8e4dc') }, uGlow: { value: new THREE.Color('#ffb15c') } }, transparent: true, depthWrite: false });
  const cloud = new THREE.Points(cg, cm); cloud.frustumCulled = false; cloud.renderOrder = 4; g.add(cloud);
  g.scale.setScalar(0.001); g.userData = { site: LAUNCH_SITES[md.cfg.site], hole: holeMat, cloud, foot };
  R.scene.add(g); MV.pad = g;
}
function updatePad(t) {
  const g = MV.pad; if (!g) return; const S = g.userData.site; const O = R.O; const md = MV.md;
  const r = sitePosEcl('earth', S.lat, S.lon, 0, t); const E = helio('earth', t).r;
  g.position.set(E[0] + r[0] - O[0], E[1] + r[1] - O[1], E[2] + r[2] - O[2]);
  basisQuat(vunit(r), localFrame('earth', r, t).north, g.quaternion);
  g.visible = t < md.M.t0 + 3600 && camDistTo(g.position) < 400;
  if (!g.visible) return;
  const t0 = md.M.t0, IG = md.L.ign || { t: 0 }, tIgn = t0 - (IG.t || 0);
  const ship = craftById('ship');
  const altM = te => { if (te < t0) return 0; const s = ship && ship.o.stateAt(te); return s ? (vnorm(s.r) - BODIES.earth.R) * 1000 : 1e9; };
  // how hard the exhaust hits the pad at time te: engine build-up before liftoff, fading as the vehicle climbs away
  const blast = te => { if (te < tIgn) return 0; if (te < t0) { const ig = padIgnition(md, te); return ig ? ig.f : 0; } return clamp(1 - altM(te) / 300, 0, 1); };
  const bNow = blast(t);
  g.userData.hole.color.setRGB(0.08 + 0.92 * bNow, 0.07 + 0.55 * bNow, 0.06 + 0.2 * bNow);
  // sunlight on the cloud (night launches get a dim cloud lit orange by the flames)
  const sunUp = vdot(vunit(vscale(E, -1)), vunit(r)); const day = clamp(0.2 + sunUp * 3, 0.12, 1);
  const cl = g.userData.cloud, A = cl.geometry.attributes, pos = A.position.array, size = A.aSize.array, al = A.aA.array, gl = A.aG.array;
  cl.material.uniforms.uCol.value.setRGB(0.91 * day, 0.89 * day, 0.86 * day);
  cl.material.uniforms.uPx.value = R.height / (2 * Math.tan(R.camera.fov * DEG / 2));
  const span = (IG.t || 0) + 24, foot = g.userData.foot; let live = 0;
  for (let i = 0; i < CLOUD_N; i++) {
    const r1 = hash01(3 * i + 1), r2 = hash01(3 * i + 2), r3 = hash01(3 * i + 3);
    const te = tIgn + (i / CLOUD_N) * span + r1 * 0.15, a = t - te; const k = a >= 0 ? blast(te) : 0;
    if (k < 0.03 || a > 200) { al[i] = 0; continue; }
    let x, y, z, sz; const kind = i % 5;
    if (kind < 4) { // fire, then smoke and steam, blasting out of both ends of the flame trench
      const side = kind % 2 ? 1 : -1, v0 = (45 + 40 * r2) * (0.35 + 0.65 * k), tau = 3.0;
      const d = 70 + v0 * tau * (1 - Math.exp(-a / tau)) + 1.5 * a;
      x = (r3 - 0.5) * (12 + 10 * a); z = side * d; y = 7 + (1.8 + 3 * r1) * a + 0.1 * a * a; sz = 20 + 9 * a + 14 * r2;
      gl[i] = clamp(k * (1 - a / 1.8), 0, 1) * 0.9;
    } else { // steam from the water deluge, boiling up around the launch mount
      const ang = r2 * TAU, rr = foot + 6 + 8 * r3 + 3 * a; x = Math.cos(ang) * rr; z = Math.sin(ang) * rr; y = MOUNT_H + 2 + (4 + 4 * r1) * a; sz = 10 + 6 * a;
      gl[i] = clamp(k * (1 - a / 1.2), 0, 1) * 0.5;
    }
    pos[3 * i] = x; pos[3 * i + 1] = y; pos[3 * i + 2] = z; size[i] = sz * 0.001;
    al[i] = k * 0.8 * clamp(a / 0.4, 0, 1) * Math.exp(-a / 60); live++;
  }
  A.position.needsUpdate = true; A.aSize.needsUpdate = true; A.aA.needsUpdate = true; A.aG.needsUpdate = true;
  cl.visible = live > 0;
}
function camDistTo(v) { return R.camera.position.distanceTo(v); }
// local high-resolution patch of a planet's surface around a site; an elevation offset (e.g. a crater floor
// below the Martian datum) blends smoothly back to the mean radius at the patch edge
const capW = f => 1 - smoothstep((f - 0.5) / 0.42);
function capGeometry(lat, lon, ang, seg, Rb, elev = 0) {
  const dl = ang / Math.max(Math.cos(lat * DEG), 0.2);
  const g = new THREE.SphereGeometry(1, seg, seg, (lon - dl + 180) * DEG, 2 * dl * DEG, (90 - lat - ang) * DEG, 2 * ang * DEG);
  const pos = g.attributes.position, uv = g.attributes.uv; const loc = new Float32Array(pos.count * 2), capA = new Float32Array(pos.count).fill(1);
  const cl = Math.cos(lat * DEG), sl = Math.sin(lat * DEG), co = Math.cos(lon * DEG), so = Math.sin(lon * DEG);
  const C = [cl * co, sl, -cl * so], E = [-so, 0, -co], N = [-sl * co, cl, sl * so];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); let phi = Math.atan2(z, -x); if (phi < 0) phi += TAU;
    uv.setXY(i, phi / TAU, 1 - Math.acos(clamp(y, -1, 1)) / Math.PI);
    loc[2 * i] = Rb * (x * E[0] + y * E[1] + z * E[2]); loc[2 * i + 1] = Rb * (x * N[0] + y * N[1] + z * N[2]);
    const th = Math.acos(clamp(x * C[0] + y * C[1] + z * C[2], -1, 1)) * RAD; const k = 1 + elev / Rb * capW(th / ang);
    // vertices are stored relative to the site, and the mesh sits at the site: the large planet-radius offsets then
    // cancel on the CPU in double precision, so the ground near the pad does not jitter (and flicker) in 32-bit floats
    pos.setXYZ(i, x * k - C[0], y * k - C[1], z * k - C[2]);
  }
  g.setAttribute('aLocal', new THREE.BufferAttribute(loc, 2)); g.setAttribute('aCap', new THREE.BufferAttribute(capA, 1));
  if (elev) g.computeVertexNormals();
  g.userData.center = C; g.userData.grid = { phiStart: (lon - dl + 180) * DEG, phiLength: 2 * dl * DEG, thetaStart: (90 - lat - ang) * DEG, thetaLength: 2 * ang * DEG, seg };
  return g;
}
function addCap(body, lat, lon, ang, elev = 0) {
  const b = R.bodies[body]; if (!b) return;
  if (MV.capInfo.some(c => c.body === body && Math.abs(c.lat - lat) < 0.5 && Math.abs(c.lon - lon) < 0.5)) return;
  const g = capGeometry(lat, lon, ang, 128, b.R, elev); const mesh = new THREE.Mesh(g, b.mat); mesh.renderOrder = 1;
  const C = g.userData.center; mesh.position.set(C[0], C[1], C[2]);
  b.mesh.add(mesh); MV.caps.push(mesh);
  const n = MV.capInfo.filter(c => c.body === body).length;
  if (n < 4) { const cl = Math.cos(lat * DEG); b.mat.uniforms.uCapDir.value[n].set(cl * Math.cos(lon * DEG), Math.sin(lat * DEG), -cl * Math.sin(lon * DEG)); b.mat.uniforms.uCapCos.value[n] = Math.cos(ang * 0.985 * DEG); }
  MV.capInfo.push({ body, lat, lon, ang, elev, mesh });
}
// ground radius under a direction (km), honouring cap elevations
function groundRadius(body, dirEcl, t) {
  let r = surfaceRadius(body);
  for (const c of MV.capInfo || []) { if (c.body !== body || !c.elev) continue; const sd = vunit(sitePosEcl(body, c.lat, c.lon, 0, t)); const th = Math.acos(clamp(vdot(sd, dirEcl), -1, 1)) * RAD; if (th < c.ang) r += c.elev * capW(th / c.ang); }
  return r;
}
function buildSurfaceCaps(md) {
  const cfg = md.cfg; const S = LAUNCH_SITES[cfg.site];
  for (const b of ['earth', 'moon', 'mars']) { const U = R.bodies[b].mat.uniforms; if (U.uCapCos) U.uCapCos.value = [2, 2, 2, 2]; }
  addCap('earth', S.lat, S.lon, 2.5);
  if (cfg.landing) addCap('moon', cfg.landing.lat, cfg.landing.lon, 5);
  for (const l of cfg.legs || []) { if (l.site && l.body === 'mars') addCap('mars', l.site.lat, l.site.lon, 4, l.site.elev || 0); }
  for (const o of md.M.objects) for (const sg of o.segs) if (sg.type === 'surface' && (sg.ref === 'moon' || sg.ref === 'mars' || sg.t0 > md.M.t0 + 3600)) addCap(sg.ref, sg.lat, sg.lon, sg.ref === 'earth' ? 2.5 : sg.ref === 'moon' ? 5 : 4, sg.ref === 'mars' ? (sg.elev || 0) : 0);
}

// ---------------- trajectory lines ----------------
const GLSL_TRAIL_V = `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aT; attribute vec3 aC; varying float vT; varying vec3 vC;
void main(){ vT = aT; vC = aC; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
#include <logdepthbuf_vertex>
}`;
const GLSL_TRAIL_F = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uNow; uniform float uFuture; uniform float uAlpha; varying float vT; varying vec3 vC;
void main(){
  #include <logdepthbuf_fragment>
  float past = step(vT, uNow);
  float a = past > 0.5 ? uAlpha : uFuture * uAlpha;
  if (a < 0.01) discard;
  vec3 c = past > 0.5 ? vC : mix(vC, vec3(0.55, 0.62, 0.72), 0.55);
  gl_FragColor = vec4(c, a);
}`;
// Engine-on arcs are drawn as a ribbon of constant on-screen width (WebGL lines are always 1 px):
// every segment is a quad whose corners are pushed sideways in screen space.
const GLSL_FAT_V = `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aOther; attribute float aSide; attribute float aEdge; attribute float aT;
uniform vec2 uRes; uniform float uWidth;
varying float vT; varying float vSide;
void main(){
  vT = aT; vSide = aEdge;
  vec4 a = modelViewMatrix * vec4(position, 1.0);
  vec4 b = modelViewMatrix * vec4(aOther, 1.0);
  float zn = -2e-6;
  if (a.z > zn && b.z > zn) { gl_Position = vec4(4.0, 4.0, 4.0, 1.0); }
  else {
    if (a.z > zn) a = mix(a, b, (zn - a.z) / (b.z - a.z));
    else if (b.z > zn) b = mix(b, a, (zn - b.z) / (a.z - b.z));
    vec4 ca = projectionMatrix * a; vec4 cb = projectionMatrix * b;
    vec2 d = (cb.xy / cb.w - ca.xy / ca.w) * uRes; float L = length(d);
    vec2 dir = L > 1e-4 ? d / L : vec2(1.0, 0.0);
    ca.xy += vec2(-dir.y, dir.x) * aSide * uWidth / uRes * ca.w;
    gl_Position = ca;
  }
#include <logdepthbuf_vertex>
}`;
const GLSL_FAT_F = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uNow; uniform float uFuture; uniform float uAlpha; uniform vec3 uCol; uniform vec3 uCore;
varying float vT; varying float vSide;
void main(){
  #include <logdepthbuf_fragment>
  float past = step(vT, uNow); float s = abs(vSide);
  float a = (past > 0.5 ? uAlpha : min(1.0, uFuture * 1.6) * uAlpha) * (1.0 - smoothstep(0.62, 1.0, s));
  if (a < 0.01) discard;
  vec3 c = mix(uCol, uCore, (1.0 - smoothstep(0.0, 0.6, s)) * (past > 0.5 ? 0.85 : 0.3));
  if (past < 0.5) c = mix(c, vec3(0.62, 0.56, 0.5), 0.15);
  gl_FragColor = vec4(c, a);
}`;
// one dot per burn, so even a few-second correction burn is visible at any zoom: filled once fired, a ring while still ahead
const GLSL_MK_V = `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aT; uniform float uSize; varying float vT;
void main(){ vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = uSize;
#include <logdepthbuf_vertex>
}`;
const GLSL_MK_F = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uNow; uniform float uFuture; uniform vec3 uCol; varying float vT;
void main(){
  #include <logdepthbuf_fragment>
  float r = length(gl_PointCoord - 0.5) * 2.0; if (r > 1.0) discard;
  float past = step(vT, uNow);
  float disk = 1.0 - smoothstep(0.72, 1.0, r);
  float ring = smoothstep(0.48, 0.62, r) * (1.0 - smoothstep(0.84, 1.0, r));
  float a = past > 0.5 ? disk : ring * min(1.0, uFuture * 2.2);
  if (a < 0.02) discard;
  vec3 c = past > 0.5 ? mix(uCol, vec3(1.0, 0.93, 0.82), 1.0 - smoothstep(0.0, 0.42, r)) : uCol;
  gl_FragColor = vec4(c, a);
}`;
const TRAIL_U = { uRes: { value: new THREE.Vector2(1, 1) }, uWidth: { value: 4 }, uMk: { value: 9 } };
const _v2 = new THREE.Vector2();
// heliocentric points → coordinates in a display frame (planet-centred, Sun-centred or Earth–Moon rotating)
function toFrameArr(frame, ts, P) {
  const n = ts.length, F = new Float64Array(3 * n);
  for (let i = 0; i < n; i++) {
    const t = ts[i]; let x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
    if (frame === 'sun') { F[3 * i] = x; F[3 * i + 1] = y; F[3 * i + 2] = z; continue; }
    const ob = frame === 'emrot' ? 'earth' : frame; const B = planetHelio(ob, t).r; x -= B[0]; y -= B[1]; z -= B[2];
    if (frame === 'emrot') { const Rm = emRot(t); F[3 * i] = Rm[0] * x + Rm[3] * y + Rm[6] * z; F[3 * i + 1] = Rm[1] * x + Rm[4] * y + Rm[7] * z; F[3 * i + 2] = Rm[2] * x + Rm[5] * y + Rm[8] * z; }
    else { F[3 * i] = x; F[3 * i + 1] = y; F[3 * i + 2] = z; }
  }
  return F;
}
class Trail {
  constructor(o, md, primary) {
    this.o = o; this.md = md; this.primary = primary; this.cache = {};
    this.mat = new THREE.ShaderMaterial({ vertexShader: GLSL_TRAIL_V, fragmentShader: GLSL_TRAIL_F, uniforms: { uNow: { value: 0 }, uFuture: { value: 0.45 }, uAlpha: { value: primary ? 0.95 : 0.7 } }, transparent: true, depthWrite: false });
    this.line = new THREE.LineSegments(new THREE.BufferGeometry(), this.mat); this.line.frustumCulled = false; this.line.renderOrder = 3;
    const U = this.mat.uniforms;
    this.fatMat = new THREE.ShaderMaterial({ vertexShader: GLSL_FAT_V, fragmentShader: GLSL_FAT_F, uniforms: { uNow: U.uNow, uFuture: U.uFuture, uAlpha: { value: primary ? 0.97 : 0.85 }, uRes: TRAIL_U.uRes, uWidth: TRAIL_U.uWidth, uCol: { value: new THREE.Color(PCOL.burn) }, uCore: { value: new THREE.Color(PCOL.burnCore) } }, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.fat = new THREE.Mesh(new THREE.BufferGeometry(), this.fatMat); this.fat.frustumCulled = false; this.fat.renderOrder = 4; this.fat.visible = false; this.line.add(this.fat);
    this.mkMat = new THREE.ShaderMaterial({ vertexShader: GLSL_MK_V, fragmentShader: GLSL_MK_F, uniforms: { uNow: U.uNow, uFuture: U.uFuture, uSize: TRAIL_U.uMk, uCol: { value: new THREE.Color(PCOL.burn) } }, transparent: true, depthWrite: false });
    this.mk = new THREE.Points(new THREE.BufferGeometry(), this.mkMat); this.mk.frustumCulled = false; this.mk.renderOrder = 5; this.mk.visible = false; this.line.add(this.mk);
    R.scene.add(this.line);
    this.sample();
  }
  sample() {
    const o = this.o, ts = [], P = [], brk = [], pw = [];
    const imp = this.md.impList.filter(x => x.obj === o.id); // burns applied as an instant Δv: sample their real duration too
    const inImp = t => { for (const x of imp) if (t >= x.t0 && t < x.t1) return true; return false; };
    let lastEnd = null;
    for (const sg of o.segs) {
      if (sg.type === 'surface') { lastEnd = null; continue; }
      const push = (t, s, b) => { const H = helio(s.ref, t).r; ts.push(t); P.push(H[0] + s.r[0], H[1] + s.r[1], H[2] + s.r[2]); brk.push(b ? 1 : 0); pw.push(s.T > 0 || (imp.length && inImp(t)) ? 1 : 0); };
      let first = lastEnd == null || sg.t0 - lastEnd > 2;
      {
        let t = sg.t0; const span = sg.t1 - sg.t0;
        const s0 = sg.stateAt(t); const el = rv2coe(s0.r, s0.v, BODIES[s0.ref].mu);
        let k = 0.016; if (el.e < 1 && el.period && span / el.period > 25) k = 0.016 * Math.min(4, span / el.period / 25);
        let n = 0;
        while (t < sg.t1 && n < 200000) {
          const s = sg.stateAt(t); push(t, s, first); first = false; n++;
          const rr = vnorm(s.r), vv = Math.max(vnorm(s.v), 1e-4);
          let dt = k * rr / vv; dt = clamp(dt, s.ref === 'sun' ? 1800 : 0.5, s.ref === 'sun' ? 2 * DAY : 0.5 * DAY);
          if (sg.type === 'burn') dt = Math.min(dt, Math.max((sg.t1 - sg.t0) / 20, 0.5));
          if (sg.type === 'samples') dt = Math.min(dt, Math.max(4 * (sg.t1 - sg.t0) / Math.max(sg.n - 1, 1), 0.5));
          for (const x of imp) { if (x.t0 > t && x.t0 < t + dt) dt = x.t0 - t; else if (t >= x.t0 && t < x.t1) dt = Math.min(dt, Math.max((x.t1 - x.t0) / 12, 0.5), x.t1 - t); }
          t += dt;
        }
        const s = sg.stateAt(sg.t1); push(sg.t1, s, false);
      }
      lastEnd = sg.t1;
    }
    this.ts = Float64Array.from(ts); this.P = Float64Array.from(P); this.brk = Uint8Array.from(brk); this.pw = Uint8Array.from(pw);
    const n = this.ts.length, tt = new Float32Array(n);
    for (let i = 0; i < n; i++) tt[i] = this.ts[i] - this.md.M.t0;
    this.tt = tt;
    this.colorize();
    const idx = []; for (let i = 0; i + 1 < n; i++) if (!this.brk[i + 1]) idx.push(i, i + 1);
    this.idx = idx.length > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
    const ps = []; for (let i = 0; i + 1 < n; i++) if (this.pw[i] && !this.brk[i + 1]) ps.push(i);
    this.pwSegs = ps;
    // burn markers at the middle of each engine-on interval of this craft
    const mt = [], mP = [];
    for (const x of this.md.powered) { if (x.obj !== o.id) continue; const tm = (x.t0 + x.t1) / 2; const s = o.stateAt(tm); if (!s || s.surface) continue; const H = helio(s.ref, tm).r; mt.push(tm); mP.push(H[0] + s.r[0], H[1] + s.r[1], H[2] + s.r[2]); }
    this.mts = Float64Array.from(mt); this.mP = Float64Array.from(mP);
  }
  colorize() { // coasting arcs: cool blue (or the mission-phase colour); engine-on arcs: hot orange
    const n = this.ts.length, col = new Float32Array(3 * n);
    const byPhase = !!MV.layers.phasecol;
    const coast = hexToRgb(this.primary ? PCOL.coast : (this.o.color || '#7fd1ff')), burn = hexToRgb(PCOL.burn);
    for (let i = 0; i < n; i++) {
      let c = coast;
      if (this.pw[i]) c = burn;
      else if (this.primary && byPhase) { const ph = this.md.phaseAt(this.ts[i]); if (ph && ph.color) c = hexToRgb(ph.color); }
      col[3 * i] = c[0]; col[3 * i + 1] = c[1]; col[3 * i + 2] = c[2];
    }
    this.col = col; this.byPhase = byPhase;
  }
  frameCoords(frame) { if (!this.cache[frame]) this.cache[frame] = toFrameArr(frame, this.ts, this.P); return this.cache[frame]; }
  markerCoords(frame) { const k = 'mk:' + frame; if (!this.cache[k]) this.cache[k] = toFrameArr(frame, this.mts, this.mP); return this.cache[k]; }
  build(frame, anchor) {
    const F = this.frameCoords(frame), n = this.ts.length, pos = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) { pos[3 * i] = F[3 * i] - anchor[0]; pos[3 * i + 1] = F[3 * i + 1] - anchor[1]; pos[3 * i + 2] = F[3 * i + 2] - anchor[2]; }
    const g = this.line.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aC', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aT', new THREE.BufferAttribute(this.tt, 1));
    g.setIndex(new THREE.BufferAttribute(this.idx, 1));
    // engine-on ribbon: 4 corners per segment; the far-end corners carry the opposite side sign because their "other" point is behind them
    const segs = this.pwSegs, m = segs.length;
    if (m) {
      const P4 = new Float32Array(12 * m), O4 = new Float32Array(12 * m), S4 = new Float32Array(4 * m), E4 = new Float32Array(4 * m), T4 = new Float32Array(4 * m), I6 = 4 * m > 65535 ? new Uint32Array(6 * m) : new Uint16Array(6 * m);
      for (let k = 0; k < m; k++) {
        const i = segs[k], j = i + 1, v = 4 * k, o12 = 12 * k;
        for (let q = 0; q < 3; q++) { const A = pos[3 * i + q], B = pos[3 * j + q]; P4[o12 + q] = A; P4[o12 + 3 + q] = A; P4[o12 + 6 + q] = B; P4[o12 + 9 + q] = B; O4[o12 + q] = B; O4[o12 + 3 + q] = B; O4[o12 + 6 + q] = A; O4[o12 + 9 + q] = A; }
        S4[v] = 1; S4[v + 1] = -1; S4[v + 2] = -1; S4[v + 3] = 1; // offset sign (relative to each corner's own direction)
        E4[v] = 1; E4[v + 1] = -1; E4[v + 2] = 1; E4[v + 3] = -1;  // which edge of the ribbon the corner is on (for the soft edge)
        T4[v] = T4[v + 1] = this.tt[i]; T4[v + 2] = T4[v + 3] = this.tt[j];
        I6[6 * k] = v; I6[6 * k + 1] = v + 1; I6[6 * k + 2] = v + 2; I6[6 * k + 3] = v + 1; I6[6 * k + 4] = v + 3; I6[6 * k + 5] = v + 2;
      }
      const fg = this.fat.geometry;
      fg.setAttribute('position', new THREE.BufferAttribute(P4, 3)); fg.setAttribute('aOther', new THREE.BufferAttribute(O4, 3));
      fg.setAttribute('aSide', new THREE.BufferAttribute(S4, 1)); fg.setAttribute('aEdge', new THREE.BufferAttribute(E4, 1)); fg.setAttribute('aT', new THREE.BufferAttribute(T4, 1)); fg.setIndex(new THREE.BufferAttribute(I6, 1));
    }
    this.fat.visible = m > 0;
    const nm = this.mts.length;
    if (nm) {
      const MF = this.markerCoords(frame), mp = new Float32Array(3 * nm), mt = new Float32Array(nm);
      for (let i = 0; i < nm; i++) { mp[3 * i] = MF[3 * i] - anchor[0]; mp[3 * i + 1] = MF[3 * i + 1] - anchor[1]; mp[3 * i + 2] = MF[3 * i + 2] - anchor[2]; mt[i] = this.mts[i] - this.md.M.t0; }
      const mg = this.mk.geometry; mg.setAttribute('position', new THREE.BufferAttribute(mp, 3)); mg.setAttribute('aT', new THREE.BufferAttribute(mt, 1));
    }
    this.mk.visible = nm > 0;
    this.anchor = anchor.slice(); this.frame = frame;
  }
  dispose() { R.scene.remove(this.line); this.line.geometry.dispose(); this.fat.geometry.dispose(); this.mk.geometry.dispose(); this.mat.dispose(); this.fatMat.dispose(); this.mkMat.dispose(); }
}
// Earth–Moon rotating frame: columns x̂ (to Moon), ŷ, ẑ (orbit normal); returns row-major matrix with those columns
function emRot(t) {
  const m = moonGeo(t); const x = vunit(m.r), z = vunit(vcross(m.r, m.v)), y = vcross(z, x);
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
}
function frameOrigin(frame, t) { return frame === 'sun' ? [0, 0, 0] : helio(frame === 'emrot' ? 'earth' : frame, t).r; }
function toFrame(frame, t, P) { const B = frameOrigin(frame, t); const d = vsub(P, B); if (frame !== 'emrot') return d; const Rm = emRot(t); return [Rm[0] * d[0] + Rm[3] * d[1] + Rm[6] * d[2], Rm[1] * d[0] + Rm[4] * d[1] + Rm[7] * d[2], Rm[2] * d[0] + Rm[5] * d[1] + Rm[8] * d[2]]; }
function chooseAutoFrame(t, P) {
  const md = MV.md; if (!md) return 'earth';
  const dM = vnorm(vsub(P, helio('moon', t).r)), dE = vnorm(vsub(P, helio('earth', t).r)), dMa = vnorm(vsub(P, helio('mars', t).r));
  if (dM < BODIES.moon.soi * 1.2 && md.cfg.dest !== 'mars') return 'moon';
  if (dMa < BODIES.mars.soi * 1.5) return 'mars';
  if (dE < BODIES.earth.soi * 1.3) return 'earth';
  return 'sun';
}
function updateTrails(t, focusP, camDist) {
  const frame = MV.frameSel === 'auto' ? chooseAutoFrame(t, focusP) : MV.frameSel;
  const show = MV.layers.paths;
  const f = toFrame(frame, t, focusP);
  const pr = R.renderer.getPixelRatio(); R.renderer.getDrawingBufferSize(_v2);
  TRAIL_U.uRes.value.copy(_v2); TRAIL_U.uWidth.value = 4.2 * pr; TRAIL_U.uMk.value = 10 * pr;
  for (const tr of MV.trails) {
    tr.line.visible = show && (MV.layers.future || t >= tr.o.t0);
    if (!tr.line.visible) continue;
    if (tr.byPhase !== !!MV.layers.phasecol) { tr.colorize(); if (tr.anchor) tr.line.geometry.setAttribute('aC', new THREE.BufferAttribute(tr.col, 3)); }
    const need = tr.frame !== frame || !tr.anchor || vnorm(vsub(f, tr.anchor)) > Math.max(2000, camDist * 2e3);
    if (need) tr.build(frame, f);
    const B = frameOrigin(frame, t); const O = R.O;
    if (frame === 'emrot') { const Rm = emRot(t); const A = tr.anchor; const wa = [Rm[0] * A[0] + Rm[1] * A[1] + Rm[2] * A[2], Rm[3] * A[0] + Rm[4] * A[1] + Rm[5] * A[2], Rm[6] * A[0] + Rm[7] * A[1] + Rm[8] * A[2]];
      tr.line.position.set(B[0] + wa[0] - O[0], B[1] + wa[1] - O[1], B[2] + wa[2] - O[2]);
      _m4.set(Rm[0], Rm[1], Rm[2], 0, Rm[3], Rm[4], Rm[5], 0, Rm[6], Rm[7], Rm[8], 0, 0, 0, 0, 1); tr.line.quaternion.setFromRotationMatrix(_m4); }
    else { tr.line.position.set(B[0] + tr.anchor[0] - O[0], B[1] + tr.anchor[1] - O[1], B[2] + tr.anchor[2] - O[2]); tr.line.quaternion.identity(); }
    tr.mat.uniforms.uNow.value = t - MV.md.M.t0;
    tr.mat.uniforms.uFuture.value = MV.layers.future ? 0.42 : 0;
  }
  MV.frame = frame;
}

// ---------------- osculating orbit ----------------
function dominantBody(P, t) {
  const dM = vnorm(vsub(P, helio('moon', t).r)); if (dM < BODIES.moon.soi) return 'moon';
  const dE = vnorm(vsub(P, helio('earth', t).r)); if (dE < BODIES.earth.soi) return 'earth';
  const dMa = vnorm(vsub(P, helio('mars', t).r)); if (dMa < BODIES.mars.soi) return 'mars';
  return 'sun';
}
function updateOsc(c, t) {
  if (!MV.osc) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 721), 3)); MV.osc = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false })); MV.osc.frustumCulled = false; R.scene.add(MV.osc); }
  const L = MV.osc;
  if (!MV.layers.osc || !c || !c.s || !c.P || c.s.surface) { L.visible = false; return; }
  const b = dominantBody(c.P, t); const B = helio(b, t);
  const r = vsub(c.P, B.r), v = vsub(vadd(helio(c.s.ref, t).v, c.s.v), B.v); const mu = BODIES[b].mu;
  const el = rv2coe(r, v, mu); const arr = L.geometry.attributes.position.array;
  // anchor at the craft to keep precision near it
  let nmax;
  if (el.e < 0.999) { for (let i = 0; i <= 720; i++) { const p = coe2rv(el.p, el.e, el.i, el.Om, el.w, i / 720 * TAU, mu).r; arr[3 * i] = p[0] - r[0]; arr[3 * i + 1] = p[1] - r[1]; arr[3 * i + 2] = p[2] - r[2]; } nmax = 721; }
  else { const nuMax = Math.acos(-1 / el.e) - 0.02; for (let i = 0; i <= 720; i++) { const nu = -nuMax + 2 * nuMax * i / 720; const p = coe2rv(el.p, el.e, el.i, el.Om, el.w, nu, mu).r; const k = vnorm(p) > 5 * (BODIES[b].soi || 1e9) ? 0 : 1; arr[3 * i] = (p[0] - r[0]) * k; arr[3 * i + 1] = (p[1] - r[1]) * k; arr[3 * i + 2] = (p[2] - r[2]) * k; } nmax = 721; }
  L.geometry.attributes.position.needsUpdate = true; L.geometry.setDrawRange(0, nmax);
  const O = R.O; L.position.set(c.P[0] - O[0], c.P[1] - O[1], c.P[2] - O[2]); L.visible = true;
  MV.oscEl = { body: b, el };
}

// ---------------- vectors (velocity, gravity, thrust, drag) ----------------
const VEC_DEF = [
  { id: 'vel', name: 'velocity', color: '#5fe3a1' },
  { id: 'g:earth', name: 'g Earth', color: '#5cc8ff' }, { id: 'g:moon', name: 'g Moon', color: '#d6d6d6' }, { id: 'g:sun', name: 'g Sun', color: '#ffd27a' }, { id: 'g:mars', name: 'g Mars', color: '#ff8a5c' },
  { id: 'thrust', name: 'thrust', color: '#ff9f43' }, { id: 'drag', name: 'drag', color: '#ff6767' },
];
function initVectors() {
  MV.vecs = VEC_DEF.map(d => { const a = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, new THREE.Color(d.color), 0.18, 0.08); a.visible = false; a.line.material.depthTest = false; a.cone.material.depthTest = false; a.renderOrder = 20; a.line.renderOrder = 20; a.cone.renderOrder = 20; R.scene.add(a); const lab = h('div', { class: 'vlbl', style: `color:${d.color}` }); $('#vecLabels').append(lab); return { ...d, arrow: a, lab }; });
}
function updateVectors(c, t, tele) {
  const show = MV.layers.vectors && c && c.P && tele;
  for (const v of MV.vecs) { v.arrow.visible = false; v.lab.style.transform = 'translate(-9999px,0)'; }
  if (!show) return;
  const camD = R.camera.position.distanceTo(c.node.position);
  const base = camD * 0.16;
  const pos = c.node.position;
  const items = [];
  items.push({ id: 'vel', dir: tele.vRel, mag: vnorm(tele.vRel), txt: fSpeed(vnorm(tele.vRel)), scale: 1 });
  const gmax = Math.max(...tele.grav.map(g => g.a));
  for (const g of tele.grav) { if (!['earth', 'moon', 'sun', 'mars'].includes(g.body)) continue; if (g.a < gmax * 1e-3) continue; items.push({ id: 'g:' + g.body, dir: g.dir, mag: g.a, txt: fAcc(g.a), scale: clamp(0.45 + 0.18 * Math.log10(g.a / gmax * 1000 + 1e-9), 0.2, 1) }); }
  if (tele.thrustAcc > 0) items.push({ id: 'thrust', dir: tele.thrustDir, mag: tele.thrustAcc, txt: fAcc(tele.thrustAcc), scale: clamp(0.5 + 0.2 * Math.log10(tele.thrustAcc / 9.81 + 1e-6), 0.3, 1.1) });
  if (tele.dragAcc > 1e-4) items.push({ id: 'drag', dir: tele.dragDir, mag: tele.dragAcc, txt: fAcc(tele.dragAcc), scale: clamp(0.5 + 0.2 * Math.log10(tele.dragAcc / 9.81 + 1e-6), 0.2, 1.0) });
  const W = R.width, Hh = R.height;
  for (const it of items) {
    const v = MV.vecs.find(x => x.id === it.id); if (!v || !it.dir || vnorm(it.dir) < 1e-12) continue;
    const d = vunit(it.dir); const len = base * it.scale;
    v.arrow.position.copy(pos); v.arrow.setDirection(new THREE.Vector3(d[0], d[1], d[2])); v.arrow.setLength(len, len * 0.16, len * 0.07); v.arrow.visible = true;
    const tip = pos.clone().add(new THREE.Vector3(d[0], d[1], d[2]).multiplyScalar(len * 1.04)).project(R.camera);
    if (tip.z < 1 && tip.z > -1) { const x = (tip.x + 1) / 2 * W, y = (1 - tip.y) / 2 * Hh; v.lab.textContent = `${v.name} ${it.txt}`; v.lab.style.transform = `translate(${x + 4}px, ${y - 8}px)`; }
  }
}

// ---------------- labels ----------------
function initBodyLabels() {
  MV.bodyLabels = BODY_LIST.map(name => { const el = h('div', { class: 'lbl body', style: `color:${BODY_COLORS[name]}` }, h('span', { class: 'dot' }), h('span', null, BODIES[name].name)); el.addEventListener('click', e => { e.stopPropagation(); setTarget('body:' + name); }); $('#labels').append(el); return { name, el }; });
}
const _pv = new THREE.Vector3();
function occluded(scenePos) { // is the point hidden behind a planet?
  const cam = R.camera.position; const d = _pv.copy(scenePos).sub(cam); const L = d.length(); d.divideScalar(L);
  for (const name of ['earth', 'moon', 'mars', 'venus', 'jupiter', 'sun']) {
    const b = R.bodies[name]; const C = b.group.position; const oc = C.clone().sub(cam); const tca = oc.dot(d);
    if (tca < 0 || tca > L) continue; const d2 = oc.lengthSq() - tca * tca; if (d2 < b.R * b.R * 0.995) { if (C.distanceTo(scenePos) < b.R * 1.001) continue; return true; }
  }
  return false;
}
function placeLabel(el, scenePos, rects, priority) {
  const p = _pv.copy(scenePos).project(R.camera);
  if (p.z > 1 || p.z < -1 || Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05) { el.style.transform = 'translate(-9999px,0)'; return false; }
  const x = (p.x + 1) / 2 * R.width, y = (1 - p.y) / 2 * R.height;
  if (priority < 3) for (const r of rects) if (Math.abs(r[0] - x) < 70 && Math.abs(r[1] - y) < 14) { el.style.transform = 'translate(-9999px,0)'; return false; }
  rects.push([x, y]); el.style.transform = `translate(${Math.round(x - 4)}px, ${Math.round(y - 7)}px)`; return true;
}
function updateLabels(t, focus) {
  const rects = [];
  const show = MV.layers.labels;
  const crafts = MV.crafts.slice().sort((a, b) => (b.o.id === 'ship') - (a.o.id === 'ship'));
  for (const c of crafts) {
    if (!show || !c.node.visible || (c.o.kind === 'debris' && t - c.o.t0 > 600)) { c.label.style.transform = 'translate(-9999px,0)'; continue; }
    const pos = c.node.position; const d = R.camera.position.distanceTo(pos);
    if (focus === c && d < 0.15) { c.label.style.transform = 'translate(-9999px,0)'; continue; }
    if (occluded(pos)) { c.label.style.transform = 'translate(-9999px,0)'; continue; }
    const sub = c.label.querySelector('.sub'); const ph = c.s && c.s.extra && c.s.extra.phase; if (sub) sub.textContent = c.o.id === 'ship' && ph ? ph : '';
    const burning = !!(c.s && c.s.T > 0 && (!c.s.surface || c.s.pad)); if (c.label.classList.contains('burning') !== burning) c.label.classList.toggle('burning', burning);
    placeLabel(c.label, pos, rects, c.o.id === 'ship' ? 3 : 2);
  }
  for (const bl of MV.bodyLabels) {
    const b = R.bodies[bl.name]; const pos = b.group.position; const d = R.camera.position.distanceTo(pos);
    const angR = b.R / Math.max(d, 1);
    if (!show || angR > 0.25 || (bl.name !== 'sun' && occluded(pos))) { bl.el.style.transform = 'translate(-9999px,0)'; continue; }
    placeLabel(bl.el, pos, rects, 1);
  }
}

// ---------------- exhaust smoke (low-altitude ascent) ----------------
const GLSL_SMOKE_V = `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aSize; attribute float aA; varying float vA; uniform float uPx;
void main(){ vA = aA; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aSize * uPx / max(-mv.z, 1e-9), 1.0, 900.0);
#include <logdepthbuf_vertex>
}`;
const GLSL_SMOKE_F = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uCol; varying float vA;
void main(){
  #include <logdepthbuf_fragment>
  float d = length(gl_PointCoord - 0.5) * 2.0; float a = (1.0 - smoothstep(0.3, 1.0, d)) * vA; if (a < 0.01) discard;
  gl_FragColor = vec4(uCol, a);
}`;
function initSmoke() {
  const N = 90; const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * N), 3)); g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(N), 1)); g.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(N), 1));
  const m = new THREE.ShaderMaterial({ vertexShader: GLSL_SMOKE_V, fragmentShader: GLSL_SMOKE_F, uniforms: { uPx: { value: 800 }, uCol: { value: new THREE.Color('#d9d4cc') } }, transparent: true, depthWrite: false });
  MV.smoke = new THREE.Points(g, m); MV.smoke.frustumCulled = false; MV.smoke.renderOrder = 4; R.scene.add(MV.smoke);
}
function updateSmoke(t) {
  const c = craftById('ship'); const sm = MV.smoke; if (!sm) return;
  const md = MV.md; if (!c || !md || t < md.M.t0 || t > md.M.t0 + 260) { sm.visible = false; return; }
  const L = md.L; const smoky = L.stages.some(s => (s.prop === 'kerolox' || s.prop === 'solid') && (s.parallel || L.stages.indexOf(s) === 0));
  if (!smoky) { sm.visible = false; return; }
  const pos = sm.geometry.attributes.position.array, size = sm.geometry.attributes.aSize.array, al = sm.geometry.attributes.aA.array; const O = R.O; const N = size.length;
  let k = 0;
  for (let i = 0; i < N; i++) {
    const age = i * 2.0 + 0.5; const te = t - age; if (te < md.M.t0) { al[i] = 0; continue; }
    const s = c.o.stateAt(te); if (!s) { al[i] = 0; continue; }
    const alt = vnorm(s.r) - BODIES.earth.R; if (alt > 45) { al[i] = 0; continue; }
    const E = helio('earth', t).r;
    // smoke stays fixed to the rotating Earth: rotate the emission point forward by Earth rotation over its age
    const w = bodyOmegaEcl('earth', t); const pRot = vrot(s.r, vunit(w), vnorm(w) * age);
    pos[3 * i] = E[0] + pRot[0] - O[0]; pos[3 * i + 1] = E[1] + pRot[1] - O[1]; pos[3 * i + 2] = E[2] + pRot[2] - O[2];
    size[i] = (0.04 + 0.012 * age) * (1 + alt / 12); al[i] = clamp(0.55 * (1 - alt / 45) * Math.exp(-age / 160), 0, 0.6); k++;
  }
  sm.geometry.attributes.position.needsUpdate = true; sm.geometry.attributes.aSize.needsUpdate = true; sm.geometry.attributes.aA.needsUpdate = true;
  sm.material.uniforms.uPx.value = R.height / (2 * Math.tan(R.camera.fov * DEG / 2));
  sm.visible = k > 0;
}
