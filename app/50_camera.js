// ============================================================================
// Camera: orbit / chase / look-at / ground observer / top-down, with film
// lenses (35 mm full-frame equivalent) and letterbox framing.
// ============================================================================
const CAM = { mode: 'auto', target: 'obj:ship', look: 'body:moon', az: 200 * DEG, el: 10 * DEG, dist: 0.3, roll: 0, lens: 35, aspect: 0,
  ground: { yaw: 0, pitch: 10 * DEG, track: true }, trans: null, lastTargetP: null };
function targetPos(id, t) {
  if (!id) return null;
  if (id.startsWith('body:')) return helio(id.slice(5), t).r;
  const c = craftById(id.slice(4)); if (c && c.P) return c.P;
  if (c) { const s = craftState(c, t); if (s) return vadd(helio(s.ref, t).r, s.r); }
  return null;
}
function targetRadius(id) { if (id && id.startsWith('body:')) { const b = R.bodies[id.slice(5)]; return b ? b.R : 1; } return 0; }
function targetCraft() { return CAM.target.startsWith('obj:') ? craftById(CAM.target.slice(4)) : null; }
function setTarget(id, opts = {}) {
  if (id === CAM.target && !opts.force) return;
  const t = MV.tNow; const from = targetPos(CAM.target, t);
  const prevId = CAM.target; CAM.target = id;
  const rT = targetRadius(id);
  const c = targetCraft();
  let dist = CAM.dist;
  if (rT > 0) dist = Math.max(dist, rT * 3.2); else if (c && c.cur) dist = Math.max(0.03, (c.cur.userData.len || 10) * 0.001 * 3.5);
  if (opts.dist) dist = opts.dist;
  if (from) CAM.trans = { fromId: prevId, fromP: from, t0: performance.now(), dur: 1100, distFrom: CAM.dist, distTo: dist };
  CAM.dist = dist;
  if (CAM.mode === 'ground' && id.startsWith('body:')) setMode('orbit');
  if (CAM.mode === 'auto' && !opts.keepMode) setMode(id.startsWith('body:') ? 'orbit' : 'chase');
  syncCamUI();
}
function setMode(m) {
  const wasAuto = CAM.mode === 'auto';
  CAM.mode = m; $('#lookWrap').hidden = m !== 'lookat';
  if (m === 'auto') { DIR.key = ''; DIR.lastT = null; DIR.blend = null; }
  if (wasAuto && m !== 'auto' && DIR.prm) { CAM.dist = DIR.prm.dist; CAM.az = DIR.prm.az; CAM.el = DIR.prm.el; }
  if (m === 'ground') { CAM.ground.track = true; if (CAM.lens < 85) CAM.lens = 200; }
  if (m === 'top') { CAM.el = 89 * DEG; }
  if (m === 'chase') { CAM.az = 200 * DEG; CAM.el = 12 * DEG; }
  if (m === 'lookat') { CAM.az = 12 * DEG; CAM.el = 6 * DEG; }
  applyLens(); syncCamUI();
}
function frameRect() {
  const W = R.width, Hh = R.height, A = CAM.aspect;
  if (!A) return { x: 0, y: 0, w: W, h: Hh };
  if (W / Hh > A) { const w = Hh * A; return { x: (W - w) / 2, y: 0, w, h: Hh }; }
  const hh = W / A; return { x: 0, y: (Hh - hh) / 2, w: W, h: hh };
}
function applyLens() {
  const fr = frameRect();
  const tanH = 18 / CAM.lens; // 36 mm wide full-frame sensor
  const tanV = tanH * R.height / fr.w;
  R.camera.fov = 2 * Math.atan(tanV) * RAD; R.camera.aspect = R.width / R.height; R.camera.updateProjectionMatrix();
  R.pxPerRad = R.height / (2 * tanV);
  const lb = (id, css) => { $(id).style.cssText = css; };
  lb('#lbT', `left:0;right:0;top:0;height:${fr.y}px`); lb('#lbB', `left:0;right:0;bottom:0;height:${R.height - fr.y - fr.h}px`);
  lb('#lbL', `top:0;bottom:0;left:0;width:${fr.x}px`); lb('#lbR', `top:0;bottom:0;right:0;width:${R.width - fr.x - fr.w}px`);
  const gd = $('#guides'); gd.style.cssText = `left:${fr.x}px;top:${fr.y}px;width:${fr.w}px;height:${fr.h}px`;
  const bi = $('#burnin'); bi.style.left = (fr.x + 14) + 'px'; bi.style.bottom = (R.height - fr.y - fr.h + 10) + 'px';
}
// where a craft actually stands on a body (its surface segment), preferring the camera target
function surfaceSpotOn(body, after = -Infinity) {
  const order = [targetCraft(), craftById('ship'), craftById('lander'), ...MV.crafts].filter(Boolean);
  for (const c of order) for (const sg of c.o.segs) if (sg.type === 'surface' && sg.ref === body && sg.t0 > after) return { lat: sg.lat, lon: sg.lon, elev: sg.elev || 0 };
  return null;
}
function groundSite(t) {
  const md = MV.md; const P = targetPos(CAM.target, t) || helio('earth', t).r;
  const near = (b, d) => vnorm(vsub(P, helio(b, t).r)) < d;
  const cfg = md.cfg;
  const off = (body, lat, lon, elev, dE, dN) => { const Rb = surfaceRadius(body); return { body, lat: lat + dN / Rb * RAD, lon: lon + dE / (Rb * Math.cos(lat * DEG)) * RAD, alt: (elev || 0) + 0.0018 }; };
  if (near('moon', 30000)) { const sp = surfaceSpotOn('moon') || cfg.landing; if (sp) return off('moon', sp.lat, sp.lon, sp.elev || 0, -0.35, -0.12); }
  if (near('mars', 50000)) { const l = (cfg.legs || []).find(x => x.body === 'mars' && x.site); const sp = surfaceSpotOn('mars') || (l && l.site); if (sp) return off('mars', sp.lat, sp.lon, sp.elev || 0, -0.6, -0.25); }
  if (near('earth', 60000)) {
    const S = LAUNCH_SITES[cfg.site];
    if (t > md.M.t0 + 3 * 3600) { const sp = surfaceSpotOn('earth', md.M.t0 + 3600); if (sp) { const pe = sitePosEcl('earth', sp.lat, sp.lon, 0, t); if (vnorm(vsub(vsub(P, helio('earth', t).r), pe)) < 1500) return off('earth', sp.lat, sp.lon, 0, -4, -3); } }
    return off('earth', S.lat, S.lon, 0, -2.2, -5.5);
  }
  return null;
}
const _up = new THREE.Vector3(), _look = new THREE.Vector3();
// never let the camera sink below the ground of a nearby body (offset is relative to the origin P)
function keepAboveGround(P, off, t) {
  const Pc = vadd(P, off);
  for (const b of ['earth', 'moon', 'mars']) {
    const B = helio(b, t).r; const d = vsub(Pc, B); const n = vnorm(d); if (n > surfaceRadius(b) + 15) continue; const Rb = groundRadius(b, vscale(d, 1 / Math.max(n, 1e-9)), t) + 0.0025;
    if (n < Rb) { const fixed = vadd(B, vscale(d, Rb / Math.max(n, 1e-9))); return vsub(fixed, P); }
  }
  return off;
}
// camera pose for a mode, relative to the floating origin P: {pos, up, look}
function poseFor(mode, prm, P, t) {
  const c = targetCraft(); const dist = prm.dist;
  if (mode === 'lookat') {
    const PL = targetPos(prm.look, t) || helio('moon', t).r; const Ld = vunit(vsub(PL, P));
    let up = [0, 0, 1]; if (c && c.s) up = vunit(c.rD || c.s.r);
    let u3 = vsub(up, vscale(Ld, vdot(up, Ld))); if (vnorm(u3) < 1e-6) u3 = vperp(Ld); u3 = vunit(u3); const u2 = vcross(u3, Ld);
    const D = vadd(vadd(vscale(Ld, Math.cos(prm.el) * Math.cos(prm.az)), vscale(u2, Math.cos(prm.el) * Math.sin(prm.az))), vscale(u3, Math.sin(prm.el)));
    return { pos: keepAboveGround(P, vscale(D, -dist), t), up: u3, look: vsub(PL, P), center: false };
  }
  let e1 = [1, 0, 0], e2 = [0, 1, 0], e3 = [0, 0, 1];
  if (mode === 'chase') {
    if (c && c.s) { const rr = c.rD || c.s.r, vv0 = c.vD || c.s.v; const up = vunit(rr); let vh = vsub(vv0, vscale(up, vdot(vv0, up))); if (vnorm(vh) < 1e-6) vh = vperp(up); e1 = vunit(vh); e3 = up; e2 = vcross(e3, e1); }
    else if (CAM.target.startsWith('body:')) { const name = CAM.target.slice(5); const pole = name === 'sun' ? [0, 0, 1] : bodyPoleEcl(name, t); e3 = pole; e1 = vperp(pole); e2 = vcross(e3, e1); }
  }
  const ce = Math.cos(prm.el), se = Math.sin(prm.el), ca = Math.cos(prm.az), sa = Math.sin(prm.az);
  const off = keepAboveGround(P, vadd(vadd(vscale(e1, dist * ce * ca), vscale(e2, dist * ce * sa)), vscale(e3, dist * se)), t);
  const up = mode === 'top' ? vadd(vscale(e1, -ca), vscale(e2, -sa)) : e3;
  return { pos: off, up, look: [0, 0, 0], center: true, basis: [e1, e2, e3] };
}
function setPose(pose) {
  const cam = R.camera; cam.position.set(pose.pos[0], pose.pos[1], pose.pos[2]); cam.up.set(pose.up[0], pose.up[1], pose.up[2]);
  _look.set(pose.look[0], pose.look[1], pose.look[2]); cam.lookAt(_look); if (CAM.roll) cam.rotateZ(CAM.roll);
}
// ---------------- auto-follow director ----------------
// Picks the craft where the action is and a framing for each situation (pad, ascent, burn, entry,
// parachutes, landing, surface, low orbit, coast toward the next destination) and blends between shots.
const DIR = { key: '', since: 0, blend: null, offAz: 0, offEl: 0, zoomK: 1, lensUser: null, lastT: null, dist: null, prm: null, shot: null };
function activeCraft(t) {
  const L = craftById('lander'); if (L && L.s && t >= L.o.t0 + 1 && t <= L.o.t1 - 1) return L;
  return craftById('ship');
}
function domRaw(P, t) {
  const d = b => vnorm(vsub(P, planetHelio(b, t).r));
  if (d('moon') < BODIES.moon.soi) return 'moon'; if (d('earth') < BODIES.earth.soi) return 'earth'; if (d('mars') < BODIES.mars.soi) return 'mars'; return 'sun';
}
function domTimeline(md) { // where the primary craft is, sampled over the mission: [{t, b}] at each change of dominant body
  if (md.domTL) return md.domTL;
  const out = []; let prev = null; const dt = Math.max(600, (md.tEnd - md.M.t0) / 4000);
  for (let t = md.M.t0; t <= md.tEnd; t += dt) { const s = md.ship.stateAt(t); if (!s) continue; const b = domRaw(vadd(planetHelio(s.ref, t).r, s.r), t); if (b !== prev) { out.push({ t, b }); prev = b; } }
  md.domTL = out; return out;
}
function nextDestination(md, t, cur) {
  for (const x of domTimeline(md)) if (x.t > t && x.b !== cur && x.b !== 'sun') return x.b;
  const leg = (md.cfg.legs || []).find(l => isoToT(l.t) > t && l.body !== cur && BODIES[l.body]); // e.g. Jupiter, the design point beyond the simulated flight
  return leg ? leg.body : null;
}
function directorShot(c, t) {
  const md = MV.md; const s = c.s; if (!s) return null;
  const ex = s.extra || {}; const cfgL = cfgAt(c, t);
  const L = Math.max((c.cur && (c.cur.userData.sizeM || c.cur.userData.len)) || (cfgL && cfgL.key === 'launch' ? md.L.height : 10), 2) * 0.001; // vehicle size, km
  const body = c.dom || s.ref; const R0 = body === 'sun' ? 0 : surfaceRadius(body);
  const alt = body === 'sun' ? Infinity : vnorm(c.rD || s.r) - R0;
  const tIns = md.ship && md.ship.segs.length ? md.ship.segs[0].t1 : md.M.t0 + 600;
  const sunAz = () => { const p = poseFor('chase', { az: 0, el: 0, dist: 1 }, c.P, t); const [e1, e2] = p.basis; const sd = vunit(vscale(c.P, -1)); return Math.atan2(vdot(sd, e2), vdot(sd, e1)); };
  if (c.o.id === 'ship' && (s.pad || t < md.M.t0 + 45)) return { key: 'pad', mode: 'chase', az: sunAz() + 38 * DEG, el: 4 * DEG, dist: L * 4.2, lens: 35, label: 'Launch' };
  if (c.o.id === 'ship' && t < tIns + 5) return { key: 'ascent', mode: 'chase', az: 200 * DEG, el: 9 * DEG, dist: L * (4.5 + 4 * Math.min(Math.max(alt, 0), 100) / 100), lens: 35, label: 'Ascent', blend: 4500 };
  if (ex.chute) return { key: 'chute', mode: 'chase', az: 120 * DEG, el: -8 * DEG, dist: Math.max(L * 25, 0.09), lens: 35, drift: 0.05, label: 'Parachutes' };
  if ((ex.heat > 2 || ex.q > 300) && alt < 140) return { key: 'entry', mode: 'chase', az: 65 * DEG, el: 8 * DEG, dist: L * 7, lens: 35, label: 'Entry' };
  if (s.surface || (cfgL && cfgL.landed)) return { key: 'surface', mode: 'chase', az: 150 * DEG, el: 10 * DEG, dist: Math.max(L * 6, 0.025), lens: 35, drift: 0.025, label: 'Surface' };
  if (s.T > 0) {
    if (alt < 30) return { key: 'landing', mode: 'chase', az: 140 * DEG, el: 6 * DEG, dist: Math.max(L * 5, 0.03), lens: 35, label: 'Powered flight near the ground' };
    return { key: 'burn', mode: 'chase', az: 160 * DEG, el: 18 * DEG, dist: L * 3.4, lens: 35, label: 'Engine burn' };
  }
  if (body !== 'sun' && alt < R0 * 0.6) return { key: 'orbit-' + body, mode: 'chase', az: 195 * DEG, el: 22 * DEG, dist: Math.max(L * 6, 0.03), lens: 35, label: 'Orbit' };
  // coasting: craft in the foreground, the body it is heading for (or orbiting) behind it
  let look = null;
  if (body !== 'sun') { const vr = vdot(vunit(c.rD), c.vD); if (vr < 0 || alt < 3 * R0) look = body; }
  if (!look) look = nextDestination(md, t, body) || (body !== 'sun' ? body : 'earth');
  return { key: 'coast-' + look, mode: 'lookat', look: 'body:' + look, az: 7 * DEG, el: 4 * DEG, dist: Math.max(L * 4, 0.025), lens: 50, drift: 0.006, label: 'Coasting toward ' + BODIES[look].name };
}
function directorUpdate(t, realDt) {
  const md = MV.md; const c = activeCraft(t); if (!c) return;
  const now = performance.now();
  const jump = DIR.lastT == null || Math.abs(t - DIR.lastT) > Math.max(120, (STATE.playing ? STATE.rate : 1) * 0.6);
  DIR.lastT = t;
  if (CAM.target !== 'obj:' + c.o.id) { if (jump) { CAM.target = 'obj:' + c.o.id; CAM.trans = null; syncCamUI(); } else setTarget('obj:' + c.o.id, { force: true, keepMode: true }); }
  const shot = directorShot(c, t); if (!shot) return;
  if (shot.key !== DIR.key) {
    if (!jump && DIR.key) DIR.blend = { pos: R.camera.position.clone(), quat: R.camera.quaternion.clone(), up: R.camera.up.clone(), center: DIR.prm ? DIR.prm.mode !== 'lookat' : true, t0: now, dur: shot.blend || 1800 };
    else DIR.blend = null;
    DIR.key = shot.key; DIR.since = now; DIR.offAz = 0; DIR.offEl = 0; DIR.zoomK = 1; DIR.lensUser = null; DIR.dist = null;
  }
  const drift = shot.drift ? (now - DIR.since) / 1000 * shot.drift : 0;
  const target = shot.dist * DIR.zoomK;
  DIR.dist = DIR.dist == null || jump ? target : Math.exp(Math.log(DIR.dist) + (Math.log(target) - Math.log(DIR.dist)) * Math.min(1, realDt * 1.5));
  let az, el;
  if (shot.mode === 'lookat') { // keep the craft inside the middle of the film frame, whatever the lens and screen shape
    const fr = frameRect(), tH = 18 / CAM.lens, tV = tH * fr.h / fr.w;
    const aL = Math.atan(0.42 * tH), eL = Math.atan(0.5 * tV);
    DIR.offAz = clamp(DIR.offAz, -aL - shot.az, aL - shot.az); DIR.offEl = clamp(DIR.offEl, -eL - shot.el, eL - shot.el);
    az = clamp(shot.az + DIR.offAz + Math.sin(drift) * Math.min(0.05, aL * 0.3), -aL, aL); el = clamp(shot.el + DIR.offEl, -eL, eL);
  } else { az = shot.az + DIR.offAz + drift; el = clamp(shot.el + DIR.offEl, -1.5, 1.5); }
  DIR.prm = { mode: shot.mode, look: shot.look, az, el, dist: DIR.dist };
  DIR.shot = shot;
  const lens = DIR.lensUser || shot.lens;
  if (Math.abs(CAM.lens - lens) > 0.5) { CAM.lens = jump ? lens : Math.exp(Math.log(CAM.lens) + (Math.log(lens) - Math.log(CAM.lens)) * Math.min(1, realDt * 2)); applyLens(); syncCamUI(); }
  if (CAM.look !== shot.look && shot.look) CAM.look = shot.look;
}
function updateCamera(t, realDt) {
  const cam = R.camera;
  if (CAM.mode === 'auto' && MV.md) directorUpdate(t, realDt);
  let P = targetPos(CAM.target, t);
  if (!P) P = targetPos('obj:ship', t) || helio('earth', t).r; // target not in flight yet (e.g. a lander still docked): follow the ship meanwhile
  // transition between targets
  let dist = CAM.dist;
  if (CAM.trans) {
    const f = clamp((performance.now() - CAM.trans.t0) / CAM.trans.dur, 0, 1); const e = f * f * (3 - 2 * f);
    const from = targetPos(CAM.trans.fromId, t) || CAM.trans.fromP;
    P = vlerp(from, P, e); dist = Math.exp(Math.log(CAM.trans.distFrom) + (Math.log(CAM.trans.distTo) - Math.log(CAM.trans.distFrom)) * e);
    if (f >= 1) CAM.trans = null;
  }
  const rT = targetRadius(CAM.target);
  if (CAM.mode === 'ground') {
    const g = groundSite(t);
    if (g) {
      const Bp = helio(g.body, t).r; const site = sitePosEcl(g.body, g.lat, g.lon, g.alt, t);
      const Pobs = vadd(Bp, site); R.O = Pobs;
      cam.position.set(0, 0, 0);
      const lf = localFrame(g.body, site, t); _up.set(lf.up[0], lf.up[1], lf.up[2]); cam.up.copy(_up);
      if (CAM.ground.track) { const d = vsub(P, Pobs); _look.set(d[0], d[1], d[2]); if (_look.length() < 1e-6) _look.copy(_up); cam.lookAt(_look); const dn = vunit(d); CAM.ground.pitch = Math.asin(clamp(vdot(dn, lf.up), -1, 1)); CAM.ground.yaw = Math.atan2(vdot(dn, lf.east), vdot(dn, lf.north)); }
      else { const cp = Math.cos(CAM.ground.pitch); const d = vadd(vadd(vscale(lf.north, cp * Math.cos(CAM.ground.yaw)), vscale(lf.east, cp * Math.sin(CAM.ground.yaw))), vscale(lf.up, Math.sin(CAM.ground.pitch))); _look.set(d[0], d[1], d[2]); cam.lookAt(_look); }
      if (CAM.roll) cam.rotateZ(CAM.roll);
      CAM.groundInfo = g; CAM.camDist = vnorm(vsub(P, Pobs));
      return;
    }
  }
  CAM.groundInfo = null;
  R.O = P;
  if (CAM.mode === 'auto' && MV.md && DIR.prm) {
    const pose = poseFor(DIR.prm.mode, DIR.prm, P, t); setPose(pose);
    if (DIR.blend) {
      const f = smoothstep((performance.now() - DIR.blend.t0) / DIR.blend.dur);
      if (f >= 1) DIR.blend = null;
      else {
        const pT = cam.position.clone(), qT = cam.quaternion.clone();
        const pos = vlerp([DIR.blend.pos.x, DIR.blend.pos.y, DIR.blend.pos.z], [pT.x, pT.y, pT.z], f); const safe = keepAboveGround(P, pos, t);
        cam.position.set(safe[0], safe[1], safe[2]);
        if (DIR.blend.center && pose.center) { cam.up.copy(DIR.blend.up).lerp(_up.set(pose.up[0], pose.up[1], pose.up[2]), f).normalize(); cam.lookAt(0, 0, 0); if (CAM.roll) cam.rotateZ(CAM.roll); }
        else cam.quaternion.slerpQuaternions(DIR.blend.quat, qT, f);
      }
    }
    CAM.camDist = DIR.prm.dist; return;
  }
  const minD = rT > 0 ? rT * 1.003 + 0.002 : 0.004; dist = Math.max(dist, minD); if (!CAM.trans) CAM.dist = Math.max(CAM.dist, minD);
  const mode = CAM.mode === 'auto' ? 'chase' : CAM.mode;
  setPose(poseFor(mode, { az: CAM.az, el: CAM.el, dist, look: CAM.look }, P, t));
  CAM.camDist = dist;
}
// ---------------- input ----------------
function initCameraInput() {
  const el = $('#gl'); const ptrs = new Map(); let pinch0 = null, lastTap = 0;
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey }); el.classList.add('dragging'); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: CAM.dist, lens: CAM.lens, zk: DIR.zoomK }; } });
  el.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2 && pinch0) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); const k = pinch0.d / Math.max(d, 1); if (CAM.mode === 'ground') CAM.lens = clamp(pinch0.lens / k, 8, 3200); else if (CAM.mode === 'auto') DIR.zoomK = clamp(pinch0.zk * k, 0.05, 2e4); else CAM.dist = clamp(pinch0.dist * k, 0.004, 5e10); CAM.trans = null; applyLens(); syncCamUI(); return; }
    const fovK = Math.min(1, CAM.lens > 0 ? 50 / CAM.lens : 1);
    if (p.b === 2 || p.shift) { CAM.roll += dx * 0.004; return; }
    if (CAM.mode === 'ground') { CAM.ground.track = false; CAM.ground.yaw -= dx * 0.0035 * fovK; CAM.ground.pitch = clamp(CAM.ground.pitch + dy * 0.0035 * fovK, -1.55, 1.55); return; }
    if (CAM.mode === 'auto') { DIR.offAz -= dx * 0.006; DIR.offEl = clamp(DIR.offEl + dy * 0.006, -1.5, 1.5); DIR.blend = null; return; }
    CAM.az -= dx * 0.006; CAM.el = clamp(CAM.el + dy * 0.006, -1.55, 1.55);
  });
  const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = null; if (!ptrs.size) el.classList.remove('dragging'); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', e => {
    e.preventDefault(); const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    if (CAM.mode === 'ground') { CAM.lens = clamp(CAM.lens * Math.exp(-dy * 0.0012), 8, 3200); applyLens(); syncCamUI(); return; }
    if (CAM.mode === 'auto') { DIR.zoomK = clamp(DIR.zoomK * Math.exp(dy * 0.0012), 0.05, 2e4); return; }
    CAM.trans = null; CAM.dist = clamp(CAM.dist * Math.exp(dy * 0.0012), 0.004, 5e10);
  }, { passive: false });
  el.addEventListener('dblclick', e => { // pick nearest label
    let best = null, bd = 40;
    for (const lbl of [...$$('#labels .lbl')]) { const r = lbl.getBoundingClientRect(); if (r.left < -1000) continue; const d = Math.hypot(r.left + 4 - e.clientX, r.top + 7 - e.clientY); if (d < bd) { bd = d; best = lbl; } }
    if (best) best.click();
  });
}
function syncCamUI() {
  const sm = $('#selMode'); if (sm.value !== CAM.mode) sm.value = CAM.mode;
  const st = $('#selTarget'); if (st.value !== CAM.target) st.value = CAM.target;
  const sl = $('#selLook'); if (sl.value !== CAM.look) sl.value = CAM.look;
  const ln = $('#selLens'); const lv = String(Math.round(CAM.lens));
  if (![...ln.options].some(o => o.value === lv)) { const o = ln.querySelector('option[data-custom]') || h('option', { 'data-custom': '1' }); o.value = lv; o.textContent = lv + ' mm'; if (!o.parentNode) ln.prepend(o); }
  ln.value = lv;
  $('#lookWrap').hidden = CAM.mode !== 'lookat';
}
