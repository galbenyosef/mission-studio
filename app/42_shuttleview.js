// ============================================================================
// The Space Shuttle in the mission view: attitudes (the roll program and the roll to heads-up during ascent,
// proximity operations around the ISS, the robot-arm deploy, the deorbit burn, entry at high angle of attack
// with banked turns, the approach, flare and rollout), the orbiter rolling on its landing gear, and the runway
// with its lights.
// ============================================================================
const SHV = { runway: null, lights: null, rwy: null };
const _qS = new THREE.Quaternion(), _axY = new THREE.Vector3(0, 1, 0), _axX = new THREE.Vector3(1, 0, 0);
const SH_MAIN_GEAR = [-7.7, -SH_GEAR_H]; // main wheel contact relative to the orbiter's reference point: [along, down] (m)
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
  if (s.surface) return { nose: P.rwy ? runwayDir(P.rwy, rD, t) : vperp(up), roll: up };
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
// with the gear down near the runway, keep the main wheels on the ground as the nose rises (the flight path is planned for
// the reference point at gear height, wings level and nose down)
function shuttleGround(c, s, t) {
  const P = shuttlePrep(MV.md); if (!P || !P.rwy || s.surface) return;
  const cf = c.o.configAt(t), lab = cf && cf.label; if (!lab || !lab.gear) return;
  const Rr = R_E + P.rwy.elev, h = vnorm(s.r) - Rr; if (h > 0.015) return;
  const al = ((s.extra && s.extra.alpha) || 0) * DEG, hMin = (-SH_MAIN_GEAR[0] * Math.sin(al) - SH_MAIN_GEAR[1] * Math.cos(al)) / 1000;
  if (h < hMin) s.r = vscale(s.r, (Rr + hMin) / vnorm(s.r));
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
  const b = R.bodies.earth, Rm = (b.R + rw.elev) * 1000 + 0.03; // m, a few centimetres above the drawn ground
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
