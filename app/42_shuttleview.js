// ============================================================================
// The Space Shuttle in the mission view: attitudes (the roll program and the roll to heads-up during ascent,
// proximity operations around the ISS, the robot-arm deploy, the deorbit burn, entry at high angle of attack
// with banked turns, the approach, flare and rollout), the orbiter rolling on its landing gear, and the runway
// with its lights.
// ============================================================================
const SHV = { runway: null, lights: null, rwy: null };
const _qS = new THREE.Quaternion(), _axY = new THREE.Vector3(0, 1, 0), _axX = new THREE.Vector3(1, 0, 0);
const SH_MAIN_GEAR = [SH_MAIN_CONTACT[0] - 14.7, SH_MAIN_CONTACT[1]]; // main wheel contact relative to the orbiter's reference point (Y 14.7): [along, down] (m)
// the reference point's height above the ground with every wheel down, at the 4.4° nose-down stance
const SH_STAND_H = -(SH_MAIN_GEAR[0] * Math.sin(SH_STANCE) + SH_MAIN_GEAR[1] * Math.cos(SH_STANCE));
function isShuttle(md) { return !!(md && md.L && md.L.sideMount); }
// per mission: launch plane, roll program, deorbit burn, runway
function shuttlePrep(md) {
  if (md.shPrep !== undefined) return md.shPrep;
  if (!isShuttle(md) || !md.ship || !md.ship.segs.length) { md.shPrep = null; return null; }
  const asc = md.ship.segs[0], sE = asc.stateAt(asc.t1), t0 = md.M.t0;
  const h = vunit(vcross(sE.r, sE.v)); // orbit normal: the launch plane
  // roll program: from the pad orientation (orbiter on the south side of the tank, tail facing south) to heads-down
  const S = LAUNCH_SITES[md.cfg.site], rP = sitePosEcl('earth', S.lat, S.lon, 0, t0), lf = localFrame('earth', rP, t0);
  const up = lf.up, A = vunit(vcross(h, up)), ref = vunit(vsub(up, A));
  basisQuat(up, ref, _qS); const Xw = new THREE.Vector3(1, 0, 0).applyQuaternion(_qS), Zw = new THREE.Vector3(0, 0, 1).applyQuaternion(_qS);
  const N = lf.north, phi0 = Math.atan2(N[0] * Xw.x + N[1] * Xw.y + N[2] * Xw.z, N[0] * Zw.x + N[1] * Zw.y + N[2] * Zw.z);
  const deorbit = md.burns.find(b => b.obj === 'ship' && /^Deorbit/.test(b.name)) || null;
  const et = md.M.obj('et'), tSep = et ? et.t0 : asc.t1 + 18;
  md.shPrep = { h, phi0, deorbit, rwy: RUNWAYS[md.cfg.runway] || null, tHU: md.cfg.headsUpMET ? t0 + md.cfg.headsUpMET : null, t0, tSep };
  return md.shPrep;
}
// At tank separation the vehicle stops being drawn as the stack, which stands ahead of its state (the state is its base),
// and the orbiter (centred on its state) and the tank are drawn on their own. Each starts where it was drawn in the stack
// and lets that offset go: the part they share over a few seconds, the rest (how far the tank's own state is from where
// it sat in the stack) over a minute or two, so neither jumps and they do not slide against each other.
// Returns the offset along the model's axes (model units), or null.
const SH_SEP_TAU = 12, SH_SEP_DRIFT = 60; // s
const _vSep = new THREE.Vector3(), _qSep = new THREE.Quaternion();
function shuttleSepShift(c, t, cfgL, model, s) {
  const md = MV.md; if (!md || !isShuttle(md) || s.surface || s.pad) return null;
  const orb = c.o.id === 'ship' && cfgL && cfgL.key === 'sc' && cfgL.sc === 'shuttle', tank = c.o.id === 'et';
  if (!orb && !tank) return null;
  const P = shuttlePrep(md); if (!P) return null;
  const dt = t - P.tSep; if (dt < 0 || dt > 8 * SH_SEP_DRIFT) return null;
  if (c.sepFor !== P) { c.sepFor = P; c.sepW = shuttleSepWorld(c, P, model); }
  const W = c.sepW; if (!W) return null;
  const fo = Math.exp(-dt / SH_SEP_TAU), fr = Math.exp(-dt / SH_SEP_DRIFT);
  _vSep.set(W[0] * fo + W[3] * fr, W[1] * fo + W[4] * fr, W[2] * fo + W[5] * fr).applyQuaternion(_qSep.copy(c.node.quaternion).invert());
  return [_vSep.x, _vSep.y, _vSep.z];
}
// the offsets at separation, in the scene's axes: [shared part, the tank's remainder]
function shuttleSepWorld(c, P, model) {
  const ship = craftById('ship'), tB = P.tSep - 0.05, cfgS = ship && cfgAt(ship, tB); if (!cfgS || cfgS.key !== 'launch') return null;
  const tmp = { ...ship }; computeCraft(tmp, tB); if (!tmp.s) return null;
  const sm = craftModel(ship, cfgS), A = anchorY(ship, cfgS, sm, tmp.s) + stagingShift(ship, tB, cfgS, sm, tmp.s) - sm.userData.yc; // the stack's own origin (the tank's) along its axis
  const qS = craftAttitude(tmp, tmp.s, tB, cfgS, activeMounts(tmp, tmp.s, tB, cfgS, sm), new THREE.Quaternion());
  const rot = v => new THREE.Vector3(v[0], v[1], v[2]).applyQuaternion(qS).toArray();
  // the orbiter: its reference point in the stack less where its own model puts it (the model is the stack's turned half
  // round about Y, which moves neither the origin nor the axis)
  const ycO = craftModel(ship, cfgAt(ship, P.tSep + 1)).userData.yc, So = rot([0, A + SH_STACK.orbY + ycO, SH_STACK.orbZ]);
  if (c.o.id === 'ship') return [...So, 0, 0, 0];
  // the tank: its origin in the stack less where its own state and model put it (it leaves with the stack's attitude)
  const tA = P.tSep + 0.001, a = { ...ship }, b = { ...c }; computeCraft(a, tA); computeCraft(b, tA); if (!a.P || !b.P) return null;
  const k = 1 / (c.node.scale.x || 0.001), d = vsub(a.P, b.P), r = rot([0, A - (model.position.y - model.userData.yc), 0]);
  const Se = [d[0] * k + r[0], d[1] * k + r[1], d[2] * k + r[2]];
  return [...So, Se[0] - So[0], Se[1] - So[1], Se[2] - So[2]];
}
// the orbiter sits in the stack model turned half round about its long axis (buildShuttleStack): going between the two
// models, its eased attitude takes the half turn too instead of rolling over on screen
function shuttleHalfTurn(c, a, b) {
  const st = x => x && x.key === 'launch', ob = x => x && x.key === 'sc' && x.sc === 'shuttle';
  return c.o.model === 'shuttle' && ((st(a) && ob(b)) || (ob(a) && st(b)));
}
function runwayDir(rwy, rD, t) { const lf = localFrame('earth', rD, t), a = rwy.hdg * DEG; return vunit(vadd(vscale(lf.north, Math.cos(a)), vscale(lf.east, Math.sin(a)))); }
// attitude {nose, roll, spin (about the nose), pitch (about the wings)} or null for the generic rules
function shuttleAttitude(c, s, t, cfgL) {
  const md = MV.md, P = shuttlePrep(md); if (!P || !cfgL) return null;
  const rD = c.rD || s.r, vD = c.vD || s.v, up = vunit(rD), ex = s.extra || {};
  if (cfgL.key === 'launch') { // the stack: heads-down after the roll program, heads-up later on some flights
    const A = vunit(vcross(P.h, up)), ref = vunit(vsub(up, A));
    const nose = s.pad || t < P.t0 ? up : (s.T > 0 && s.dir && vnorm(s.dir) > 0.5 ? s.dir : vunit(vD));
    let spin = P.phi0 * (1 - smoothstep((t - P.t0 - 7) / 13));
    if (P.tHU && t > P.tHU) spin += Math.PI * smoothstep((t - P.tHU) / 36);
    return { nose, roll: ref, spin };
  }
  if (c.o.model === 'hubble') return { nose: up, roll: vscale(vunit(vD), -1) }; // released upright, as the arm held it
  if (c.o.id === 'et') { const A = vunit(vcross(P.h, up)); return { nose: vunit(vD), roll: vunit(vsub(up, A)), spin: P.tHU ? Math.PI : 0 }; } // as it left the stack
  if (cfgL.sc !== 'shuttle') return null;
  const w = bodyOmegaEcl('earth', t), vAir = vsub(vD, vcross(w, rD));
  if (s.surface) return { nose: P.rwy ? runwayDir(P.rwy, rD, t) : vperp(up), roll: up, pitch: SH_STANCE }; // standing nose down on its gear
  const att = cfgL.att;
  if (att === 'entry') { // along the airflow, raised by the angle of attack, the lift vector banked about the flight path
    let f = vunit(vAir); if (vnorm(vAir) < 0.004 && P.rwy) f = runwayDir(P.rwy, rD, t);
    const u0 = vsub(up, vscale(f, vdot(up, f))), u = vnorm(u0) > 1e-9 ? vunit(u0) : vperp(f), right = vcross(f, u);
    const mu = (ex.bank ?? 0) * DEG, al = (ex.alpha ?? 40) * DEG;
    const lift = vadd(vscale(u, Math.cos(mu)), vscale(right, Math.sin(mu)));
    return { nose: vadd(vscale(f, Math.cos(al)), vscale(lift, Math.sin(al))), roll: lift };
  }
  const dB = P.deorbit; // deorbit: tail first and upside down, until the pitch-around to the entry attitude
  if (dB && t >= dB.t - 1200 && t <= dB.t + dB.dur + 600) return { nose: vscale(vunit(vD), -1), roll: vscale(up, -1) };
  // heads-down flights: the orbiter leaves the tank upside down and rolls over ten minutes later
  const spin = P.tHU ? 0 : Math.PI * (1 - smoothstep((t - P.tSep - 600) / 60));
  if (s.T > 0 && s.dir && vnorm(s.dir) > 0.5) return { nose: s.dir, roll: up, spin };
  if (att === 'rbar' || att === 'rpm' || att === 'vbar' || att === 'fly') {
    const iss = craftById('iss'); const F = iss && iss.s ? lvlh(iss.rD || iss.s.r, iss.vD || iss.s.v) : lvlh(rD, vD);
    if (att === 'rbar') return { nose: F.x, roll: F.z }; // payload bay up toward the station
    if (att === 'rpm') return { nose: F.x, roll: F.z, pitch: TAU * smoothstep((t - cfgL.rpm0) / (cfgL.rpm1 - cfgL.rpm0)) }; // the back-flip
    if (att === 'vbar') return { nose: F.x, roll: F.z, pitch: Math.PI / 2 * (cfgL.sw0 != null ? smoothstep((t - cfgL.sw0) / (cfgL.sw1 - cfgL.sw0)) : 1) }; // nose up, bay facing the station
    const rel = iss && iss.P ? toLvlh(F, vsub(c.P, iss.P)) : [1, 0, 0]; // flyaround: the bay keeps facing the station
    return { nose: F.x, roll: F.z, pitch: Math.PI / 2 + Math.atan2(rel[2], rel[0]) };
  }
  return { nose: vunit(vD), roll: up, spin }; // in orbit: nose forward, payload bay facing space
}
// rotate the attitude quaternion by the extra spin/pitch of a shuttle attitude
function applyShuttleSpin(nd, q) {
  if (nd.spin) { _qS.setFromAxisAngle(_axY, nd.spin); q.multiply(_qS); }
  if (nd.pitch) { _qS.setFromAxisAngle(_axX, nd.pitch); q.multiply(_qS); }
}
// With the gear down near the runway, the main wheels on the ground whatever the pitch: in the flare the reference point is
// raised where the planned path (for wings level and the reference plane at gear height) would sink them, and on the runway
// it rides at the height that keeps them on the paint as the nose comes down to the 4.4° stance.
function shuttleGround(c, s, t) {
  const P = shuttlePrep(MV.md); if (!P || !P.rwy || s.surface) return;
  const cf = c.o.configAt(t), lab = cf && cf.label; if (!lab || !lab.gear) return;
  const Rr = R_E + P.rwy.elev, h = vnorm(s.r) - Rr; if (h > 0.015) return;
  const al = ((s.extra && s.extra.alpha) || 0) * DEG, hMin = (-SH_MAIN_GEAR[0] * Math.sin(al) - SH_MAIN_GEAR[1] * Math.cos(al)) / 1000 + SH_RWY_TOP + 0.00002;
  const rolling = s.extra && /rollout|wheel stop/.test(s.extra.phase || '');
  if (h < hMin || rolling) s.r = vscale(s.r, (Rr + hMin) / vnorm(s.r)); // tyres 2 cm above the paint, as standing craft are
}
// The runway is drawn on the true sphere, SH_RWY_TOP above its elevation, while the surface patch under it is made of flat
// facets that sag up to ~0.7 m below the sphere between their corners. Radius (km) of the drawn runway under a direction
// in the planet's mesh frame, or null off the runway: what an orbiter standing on it rests on.
const SH_RWY_TOP = 0.00003;
function runwayRadius(body, dLoc) {
  const rw = SHV.rwy; if (!rw || body !== 'earth') return null;
  const b = R.bodies.earth, C = meshDir(rw.lat, rw.lon), { E, N } = meshEN(rw.lat, rw.lon), hd = rw.hdg * DEG;
  const f = vadd(vscale(E, Math.sin(hd)), vscale(N, Math.cos(hd))), l = vcross(C, f), d = vsub(dLoc, C);
  const x = vdot(d, f) * b.R, y = vdot(d, l) * b.R; // km along the runway from its threshold, and across
  if (x < -0.1 || x > rw.len + 0.1 || Math.abs(y) > rw.wid / 2 + 0.05) return null;
  return b.R + rw.elev + SH_RWY_TOP;
}
// ---------------- the runway ----------------
function runwayTexture(rw) {
  const lake = rw.surface === 'lakebed', W = 128, Hh = 4096, c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const g = c.getContext('2d'), mPerPx = rw.len * 1000 / Hh, px = m => m / mPerPx, wPx = m => m / (rw.wid * 1000) * W;
  g.fillStyle = lake ? '#d9cdb2' : '#6d6c69'; g.fillRect(0, 0, W, Hh);
  if (!lake) for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + Math.random() * 0.05})`; g.fillRect(Math.random() * W, Math.random() * Hh, 2 + Math.random() * 10, 2 + Math.random() * 30); }
  const paint = lake ? '#1d1c1a' : '#f2f1ec'; g.fillStyle = paint;
  // centreline dashes, edge stripes, threshold bars and touchdown-zone marks at both ends
  for (let y = px(120); y < Hh - px(120); y += px(60)) g.fillRect(W / 2 - wPx(0.45), y, wPx(0.9), px(36));
  g.fillRect(wPx(1.5), 0, wPx(lake ? 3 : 0.9), Hh); g.fillRect(W - wPx(1.5) - wPx(lake ? 3 : 0.9), 0, wPx(lake ? 3 : 0.9), Hh);
  for (const end of [0, 1]) {
    const y0 = end ? Hh - px(8) - px(45) : px(8);
    if (!lake) for (let k = 0; k < 16; k++) { const x = wPx(4) + k * (W - wPx(8)) / 16; g.fillRect(x, y0, wPx(1.8), px(45)); }
    else g.fillRect(wPx(2), y0 + px(20), W - wPx(4), px(6));
    for (const d of [150, 300, 450, 600]) { const y = end ? Hh - px(d) - px(22) : px(d); g.fillRect(W / 2 - wPx(14), y, wPx(3), px(22)); g.fillRect(W / 2 + wPx(11), y, wPx(3), px(22)); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(16, R.maxAniso || 1); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
function buildRunway(md) {
  disposeRunway();
  const rw = md.cfg.runway && RUNWAYS[md.cfg.runway]; if (!rw) return;
  const b = R.bodies.earth, Rm = (b.R + rw.elev + SH_RWY_TOP) * 1000; // m, a few centimetres above the sphere
  const C = meshDir(rw.lat, rw.lon), { E, N } = meshEN(rw.lat, rw.lon), hd = rw.hdg * DEG;
  const f = vadd(vscale(E, Math.sin(hd)), vscale(N, Math.cos(hd))), l = vcross(C, f);
  const L = rw.len * 1000, Wd = rw.wid * 1000, nL = 64;
  const at = (x, y) => vscale(vunit(vadd(vscale(C, b.R * 1000), vadd(vscale(f, x), vscale(l, y)))), Rm); // point on the sphere, m (mesh frame)
  const Pc = at(L / 2, 0), pos = [], uv = [], idx = [];
  for (let i = 0; i <= nL; i++) for (const j of [0, 1]) { const p = at(L * i / nL, (j - 0.5) * Wd); pos.push(p[0] - Pc[0], p[1] - Pc[1], p[2] - Pc[2]); uv.push(1 - j, i / nL); }
  for (let i = 0; i < nL; i++) { const a = 2 * i, bq = a + 1, cq = a + 2, d = a + 3; idx.push(a, cq, bq, bq, cq, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: runwayTexture(rw), roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const grp = new THREE.Group(); grp.add(m);
  // edge lights every 60 m, green threshold bars, red end bars
  const lp = [], lc = [], add = (x, y, col) => { const p = at(x, y); lp.push(p[0] - Pc[0], p[1] - Pc[1], p[2] - Pc[2] + 0); const cc = new THREE.Color(col); lc.push(cc.r, cc.g, cc.b); };
  for (let x = 0; x <= L + 1; x += 60) for (const s of [-1, 1]) add(x, s * (Wd / 2 + 1.5), '#fff1cf');
  for (let k = -12; k <= 12; k++) { add(-3, k * Wd / 24, '#7dff9a'); add(L + 3, k * Wd / 24, '#ff5a4a'); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
  const lights = new THREE.Points(lg, new THREE.PointsMaterial({ size: 3.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  lights.renderOrder = 6; grp.add(lights);
  // place the group at the runway centre in the planet's mesh frame (unit sphere scaled by R): metres → mesh units
  const k = 1 / (b.R * 1000); grp.position.set(Pc[0] * k, Pc[1] * k, Pc[2] * k); grp.scale.setScalar(k);
  b.mesh.add(grp); SHV.runway = grp; SHV.lights = lights; SHV.rwy = rw;
}
function disposeRunway() {
  if (!SHV.runway) return; const g = SHV.runway; g.parent && g.parent.remove(g);
  g.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material) { if (n.material.map) n.material.map.dispose(); n.material.dispose(); } });
  SHV.runway = null; SHV.lights = null; SHV.rwy = null;
}
function updateRunway(t) { // lights on between dusk and dawn
  if (!SHV.lights) return; const rw = SHV.rwy;
  const r = sitePosEcl('earth', rw.lat, rw.lon, 0, t), sun = vunit(vscale(helio('earth', t).r, -1));
  const el = vdot(vunit(r), sun); SHV.lights.material.opacity = clamp((0.05 - el) / 0.1, 0, 1);
}
