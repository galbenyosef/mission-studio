// ============================================================================
// flight.js — atmospheric flight & powered phases (numerical, body-centred ECL)
//   * atmosphere models (US-1976 Earth, exponential Mars)
//   * guided ascent (gravity turn + closed-loop insertion guidance)
//   * powered descent & landing (ZEM/ZEV guidance + terminal descent)
//   * atmospheric entry (lifting capsule, Mars EDL with parachute & sky crane, propulsive landing)
// ============================================================================
const US76 = [[0, 288.15, -6.5, 101325], [11, 216.65, 0, 22632.06], [20, 216.65, 1.0, 5474.889], [32, 228.65, 2.8, 868.0187], [47, 270.65, 0, 110.9063], [51, 270.65, -2.8, 66.93887], [71, 214.65, -2.0, 3.956420], [84.852, 186.946, 0, 0.3734]];
const US76_HI = [[86, 6.958e-6], [100, 5.604e-7], [110, 9.708e-8], [120, 2.222e-8], [130, 8.152e-9], [150, 2.076e-9], [180, 5.194e-10], [200, 2.541e-10], [250, 6.073e-11], [300, 1.916e-11], [400, 2.803e-12], [500, 5.215e-13], [700, 3.07e-14], [1000, 3.56e-15]];
function earthAtmos(h) {
  if (h < 0) h = 0;
  if (h < 86) {
    const H = 6356.766 * h / (6356.766 + h);
    let L = US76[0];
    for (const l of US76) if (H >= l[0]) L = l;
    const [Hb, Tb, lr, Pb] = L;
    const T = Tb + lr * (H - Hb);
    const P = lr !== 0 ? Pb * Math.pow(Tb / T, 34.1632 / lr) : Pb * Math.exp(-34.1632 * (H - Hb) / Tb);
    return { rho: P / (287.053 * T), p: P, a: Math.sqrt(1.4 * 287.053 * T), T };
  }
  let i = 0; while (i < US76_HI.length - 2 && h > US76_HI[i + 1][0]) i++;
  const [h0, r0] = US76_HI[i], [h1, r1] = US76_HI[i + 1];
  const rho = Math.exp(Math.log(r0) + (Math.log(r1) - Math.log(r0)) * (Math.min(h, 1500) - h0) / (h1 - h0));
  return { rho, p: 0, a: 300, T: 900 };
}
function marsAtmos(h) {
  const hh = Math.max(h, -9);
  const T = hh < 7 ? 242.1 - 0.998 * hh : Math.max(150, 249.7 - 2.22 * hh * 0.5);
  const rho = 0.0200 * Math.exp(-hh / 11.1);
  return { rho, p: 636 * Math.exp(-hh / 11.1), a: Math.sqrt(1.29 * 191.8 * Math.min(T, 240)), T };
}
function atmosOf(body, h) {
  if (body === 'earth') return earthAtmos(h);
  if (body === 'mars') return h > 250 ? { rho: 0, p: 0, a: 230, T: 200 } : marsAtmos(h);
  return { rho: 0, p: 0, a: 1, T: 0 };
}
const P0_EARTH = 101325;
function rocketCd(M) {
  const tb = [[0, 0.25], [0.8, 0.3], [1.05, 0.55], [1.4, 0.5], [2.5, 0.36], [4, 0.28], [10, 0.25]];
  if (M >= 10) return 0.25;
  for (let i = 0; i < tb.length - 1; i++) if (M < tb[i + 1][0]) { const [m0, c0] = tb[i], [m1, c1] = tb[i + 1]; return c0 + (c1 - c0) * (M - m0) / (m1 - m0); }
  return 0.25;
}
function curveAt(curve, t) {
  if (!curve) return 1;
  if (t <= curve[0][0]) return curve[0][1];
  for (let i = 0; i < curve.length - 1; i++) if (t < curve[i + 1][0]) { const [a, x] = curve[i], [b, y] = curve[i + 1]; return x + (y - x) * (t - a) / (b - a); }
  return curve[curve.length - 1][1];
}
function localFrame(body, r, t) {
  const up = vunit(r), pole = bodyPoleEcl(body, t);
  let east = vcross(pole, up); if (vnorm(east) < 1e-9) east = vperp(up); east = vunit(east);
  const north = vcross(up, east);
  return { up, east, north };
}

// ---------------------------------------------------------------------------
// ASCENT.  stack: {stages:[...], jettison:[...], payload (kg)}  (stages copied, propMass mutable)
// target: {normal (ECL unit), hp, ha (km)}.  Returns samples + events + final state
// ---------------------------------------------------------------------------
function buildAscentStack(launcher, payloadMass, opts = {}) {
  const st = launcher.stages.map(s => ({ ...s, propLeft: s.propMass, attached: true, ignited: false }));
  return { name: launcher.name, stages: st, jettison: (launcher.jettison || []).map(j => ({ ...j, done: false })), payload: payloadMass, upperOnly: !!opts.upperOnly };
}
function stackMass(stack) {
  let m = stack.payload;
  for (const s of stack.stages) if (s.attached) m += s.dry + s.propLeft;
  for (const j of stack.jettison) if (!j.done) m += j.mass;
  return m;
}
function simulateAscent(opt) {
  const body = opt.body || 'earth', B = BODIES[body], mu = B.mu, Rb = surfaceRadius(body) + (opt.siteElev || 0);
  const stack = opt.stack, t0 = opt.t0, dt = opt.dt || 0.2, record = opt.record !== false;
  const omega = bodyOmegaEcl(body, t0);
  const site = vscale(vunit(sitePosEcl(body, opt.lat, opt.lon, 0, t0)), Rb);
  let r = vcopy(site), v = vcross(omega, r);
  const nT = vunit(opt.target.normal), hp = opt.target.hp, ha = opt.target.ha ?? hp;
  const rpT = surfaceRadius(body) + hp, raT = surfaceRadius(body) + ha, aT = (rpT + raT) / 2;
  const epsT = -mu / (2 * aT);
  // inertial launch azimuth from target plane, then rotating-frame correction
  const lf0 = localFrame(body, r, t0);
  let dIn = vcross(nT, lf0.up); dIn = vsub(dIn, vscale(lf0.up, vdot(dIn, lf0.up))); dIn = vunit(dIn);
  const azI = Math.atan2(vdot(dIn, lf0.east), vdot(dIn, lf0.north));
  const vOrb = Math.sqrt(mu / rpT), vEq = vdot(v, lf0.east);
  const azR = Math.atan2(vOrb * Math.sin(azI) - vEq, vOrb * Math.cos(azI));
  const kick = (opt.kick ?? 2) * DEG, vert = opt.vert ?? 10, kickDur = 8;
  const samples = record ? [] : null, events = [];
  const ev = (name, desc, extra) => events.push({ t: t, name, desc, ...(extra || {}) });
  let t = t0, phase = 'vertical', closedLoop = false, lastDir = vcopy(lf0.up), stageIdx = 0;
  let maxQ = 0, maxQt = t0, maxQlogged = false, maxG = 0, coastUntil = -Infinity, firstStaging = false;
  // ignite first stage(s)
  const st = stack.stages;
  st[0].ignited = true; st[0].tIgn = t0; if (st[0].parallel && st[1]) { st[1].ignited = true; st[1].tIgn = t0; }
  const activeStages = () => st.filter(s => s.attached && s.ignited && s.propLeft > 0 && !(s.ignition && t - t0 < s.ignition));
  const anyBoosters = () => st.some(s => s.attached && s.parallel);
  let mdotNow = 0, thrustNow = 0, dragNow = [0, 0, 0], qNow = 0, machNow = 0, thrDir = lf0.up;
  let result = { ok: false };
  const g0 = G0;
  function burnTimeFor(dvKms) {
    let dv = dvKms * 1000, m0 = stackMass(stack), tt = 0;
    for (const s of st) {
      if (!s.attached || s.parallel) continue;
      if (s.propLeft <= 0) continue;
      const ve = s.ispVac * g0, mdot = s.thrustVac / ve;
      const dvAv = ve * Math.log(m0 / (m0 - s.propLeft));
      if (dv <= dvAv) { tt += (m0 - m0 * Math.exp(-dv / ve)) / mdot; return tt; }
      tt += s.propLeft / mdot; dv -= dvAv; m0 -= s.propLeft + s.dry;
    }
    return tt + 1e4;
  }
  const maxT = opt.maxTime || 1500;
  while (t - t0 < maxT) {
    const rn = vnorm(r), alt = rn - surfaceRadius(body), altG = rn - Rb;
    if (altG < -0.05 && t - t0 > 5) { ev('Vehicle lost', 'Trajectory intersected the surface.'); result = { ok: false, reason: 'crash' }; break; }
    const atm = atmosOf(body, alt);
    const vrel = vsub(v, vcross(omega, r)), vreln = vnorm(vrel);
    const lf = localFrame(body, r, t);
    // --- jettisons
    for (const j of stack.jettison) {
      if (j.done) continue;
      let go = false;
      if (j.alt != null && alt >= j.alt) go = true;
      if (j.time != null && t - t0 >= j.time) go = true;
      if (j.afterStage != null && st[j.afterStage] && !st[j.afterStage].attached && st[j.afterStage].tSep != null && t - st[j.afterStage].tSep >= (j.delay || 0)) go = true;
      if (go) { j.done = true; ev(j.name + ' jettisoned', `Dropping ${Math.round(j.mass).toLocaleString()} kg of structure no longer needed.`, { kind: 'jettison', part: j.part }); }
    }
    // --- staging
    for (let i = 0; i < st.length; i++) {
      const s = st[i];
      if (s.attached && s.ignited && s.propLeft <= 0) {
        s.attached = false; s.tSep = t;
        const kind = s.parallel ? 'Booster separation' : (i === st.length - 1 ? 'Upper stage depletion' : `${s.id} cutoff & separation`);
        ev(kind, s.parallel ? `${s.name} burn out and separate. The core continues alone.` : `${s.name} exhausted its ${Math.round(s.propMass / 1000).toLocaleString()} t of propellant and separates.`, { kind: 'staging', stage: s.id });
        if (!firstStaging) { firstStaging = true; if (!opt.noClosedLoop) closedLoop = true; }
        if (!s.parallel) {
          const nx = st.slice(i + 1).find(x => x.attached);
          if (nx && !nx.ignited) { coastUntil = t + (opt.sepCoast ?? 2.0); nx.pendingIgnition = true; }
          else if (!nx) { result = { ok: false, reason: 'propellant' }; }
        }
      }
    }
    if (result.reason === 'propellant') { ev('Insufficient performance', 'All stages are exhausted before reaching orbit — the payload is too heavy for this vehicle.'); break; }
    for (const s of st) if (s.pendingIgnition && t >= coastUntil) { s.pendingIgnition = false; s.ignited = true; s.tIgn = t; ev(`${s.id} ignition`, `${s.engine} engine${s.n > 1 ? 's' : ''} ignite${s.n > 1 ? '' : 's'}: ${PROP[s.prop].label}.`, { kind: 'ignition', stage: s.id }); }
    // --- forces
    const act = coastUntil > t ? [] : activeStages();
    const m = stackMass(stack);
    let Ttot = 0, mdot = 0;
    const pr = atm.p / P0_EARTH;
    for (const s of act) {
      let thr = 1;
      if (s.thrWithBoosters && anyBoosters()) thr = s.thrWithBoosters;
      const cv = curveAt(s.curve, t - s.tIgn);
      const Tv = s.thrustVac * cv, Ts = s.thrustSL * cv;
      const T = Math.max(0, Tv - (Tv - Ts) * Math.min(pr, 1)) * thr;
      Ttot += T; s._T = T; s._mdot = Tv / (s.ispVac * g0) * thr; s._thr = thr; mdot += s._mdot;
    }
    // g-limit & max-Q throttling (applied to the non-parallel stage)
    const core = act.find(s => !s.parallel);
    const qNowPre = 0.5 * atm.rho * Math.pow(vreln * 1000, 2);
    if (core && core.minThr && opt.qMax && qNowPre > opt.qMax && core._T > 0 && body === 'earth') {
      const k = clamp(Math.pow(opt.qMax / qNowPre, 2), core.minThr, 1);
      Ttot = Ttot - core._T + core._T * k; mdot = mdot - core._mdot + core._mdot * k; core._mdot *= k; core._thr *= k; core._T *= k;
    }
    if (core && core.maxG) {
      const allowed = core.maxG * g0 * m;
      if (Ttot > allowed && core._T > 0) {
        const other = Ttot - core._T;
        const k = clamp((allowed - other) / core._T, core.minThr || 0.4, 1);
        Ttot = other + core._T * k; mdot = mdot - core._mdot + core._mdot * k; core._mdot *= k; core._thr *= k;
      }
    }
    // drag
    let Aref = 0;
    { let rmax = 0; for (const s of st) if (s.attached && !s.parallel) { rmax = Math.max(rmax, s.geom ? s.geom[0][1] : 2); break; }
      if (opt.fairingR && stack.jettison.some(j => j.part === 'fairing' && !j.done)) rmax = Math.max(rmax, opt.fairingR);
      Aref = Math.PI * rmax * rmax;
      for (const s of st) if (s.attached && s.parallel && s.booster) Aref += s.booster.count * Math.PI * Math.pow(s.geom[0][1], 2);
      if (Aref === 0) Aref = 10; }
    const M = vreln * 1000 / (atm.a || 300), q = 0.5 * atm.rho * Math.pow(vreln * 1000, 2);
    const Dmag = q * rocketCd(M) * Aref; // N
    const Dvec = vreln > 1e-6 ? vscale(vrel, -Dmag / vreln) : [0, 0, 0];
    // --- guidance
    let dir;
    const tf = t - t0;
    if (!closedLoop) {
      if (tf < vert) { dir = lf.up; phase = 'vertical'; }
      else if (tf < vert + kickDur || vreln < 0.05) {
        const k = kick * clamp((tf - vert) / kickDur, 0, 1);
        const az = vadd(vscale(lf.north, Math.cos(azR)), vscale(lf.east, Math.sin(azR)));
        dir = vunit(vadd(vscale(lf.up, Math.cos(k)), vscale(az, Math.sin(k)))); phase = 'pitchover';
      } else {
        // gravity turn: pitch follows the air-relative flight-path angle, heading held at the launch azimuth (yaw steering)
        const gam = Math.asin(clamp(vdot(vunit(vrel), lf.up), -1, 1));
        const az = vadd(vscale(lf.north, Math.cos(azR)), vscale(lf.east, Math.sin(azR)));
        dir = vunit(vadd(vscale(lf.up, Math.sin(gam)), vscale(az, Math.cos(gam)))); phase = 'gravity turn';
      }
      if (opt.closedLoopAt != null && tf >= opt.closedLoopAt) closedLoop = true;
    }
    if (closedLoop) {
      phase = 'closed-loop guidance';
      const up = vunit(r);
      let ed = vcross(nT, up); ed = vunit(vsub(ed, vscale(up, vdot(ed, up))));
      const vr = vdot(v, up), vd = vdot(v, ed), vn = vdot(v, nT), npos = vdot(r, nT);
      const vt = Math.sqrt(mu * (2 / rpT - 1 / aT));
      const dvNeed = Math.sqrt((vt - vd) ** 2 + vr * vr + vn * vn);
      let tgo = Math.max(1, burnTimeFor(dvNeed));
      const aTh = m > 0 ? Ttot / m / 1000 : 0; // km/s^2
      if (tgo > 6 && aTh > 0) {
        const geff = mu / (rn * rn) - (vd * vd + vn * vn) / rn;
        const tg = Math.max(tgo, 8);
        let ar = 6 * (rpT - rn - vr * tg) / (tg * tg) + 2 * vr / tg;
        ar = ar + geff;
        let an = 6 * (-npos - vn * tg) / (tg * tg) + 2 * vn / tg;
        ar = clamp(ar, -0.7 * aTh, 0.95 * aTh);
        an = clamp(an, -0.3 * aTh, 0.3 * aTh);
        const ad = Math.sqrt(Math.max(0, aTh * aTh - ar * ar - an * an));
        dir = vunit(vadd(vadd(vscale(up, ar), vscale(nT, an)), vscale(ed, ad)));
        lastDir = dir;
      } else dir = lastDir;
    } else lastDir = dir || lastDir;
    thrDir = dir;
    // --- record
    if (q > maxQ) { maxQ = q; maxQt = t; } else if (!maxQlogged && maxQ > 1000 && q < 0.9 * maxQ && body === 'earth') { maxQlogged = true; events.push({ t: maxQt, name: 'Max-Q', desc: `Maximum dynamic pressure ≈ ${(maxQ / 1000).toFixed(1)} kPa — peak aerodynamic stress on the vehicle.`, kind: 'maxq' }); }
    const aProper = (Ttot + Dmag) / m;
    if (aProper > maxG) maxG = aProper;
    if (record && (samples.length === 0 || t - samples[samples.length - 1].t >= 0.999 * (opt.sampleDt || 1))) {
      const up = lf.up; const down = vsub(r, vscale(up, 0));
      samples.push({ t, r: vcopy(r), v: vcopy(v), m, T: Ttot, thrDir: vcopy(dir), D: Dvec, q, mach: M, alt, stage: (act.find(s => !s.parallel) || act[0] || {}).id || '—', phase, throttle: core ? core._thr : 1 });
    }
    // --- cutoff test
    const eps = vdot(v, v) / 2 - mu / rn;
    let rpNow = 0; if (eps >= epsT) { const hv = vnorm(vcross(r, v)), ee = Math.sqrt(Math.max(0, 1 + 2 * eps * hv * hv / (mu * mu))); rpNow = hv * hv / mu / (1 + ee); }
    if (eps >= epsT && alt > hp * 0.5 && (rpNow >= surfaceRadius(body) + 0.6 * hp || eps >= epsT + 0.25 * Math.abs(epsT))) {
      ev('Orbit insertion', `Engine cutoff. Target orbit ${hp.toFixed(0)} × ${ha.toFixed(0)} km reached.`, { kind: 'insertion' });
      result = { ok: true }; break;
    }
    if (Ttot === 0 && coastUntil < t && act.length === 0 && !st.some(s => s.pendingIgnition)) {
      if (!st.some(s => s.attached && s.propLeft > 0)) { ev('Insufficient performance', 'All stages are exhausted before reaching orbit.'); result = { ok: false, reason: 'propellant' }; break; }
    }
    // --- integrate (RK4, thrust direction & magnitude held over the step)
    const Tk = Ttot / m / 1000;  // km/s^2 initial
    const f = (rr, vv, mm) => {
      const rn2 = vdot(rr, rr), rn1 = Math.sqrt(rn2);
      const g = vscale(rr, -mu / (rn2 * rn1));
      const at = mm > 0 ? Ttot / mm / 1000 : 0;
      const ad = mm > 0 ? vscale(Dvec, 1 / mm / 1000) : [0, 0, 0];
      return vadd(vadd(g, vscale(dir, at)), ad);
    };
    const m1 = m, mdt = mdot * dt;
    const k1v = f(r, v, m1), k1r = v;
    const k2v = f(vaddScaled(r, k1r, dt / 2), vaddScaled(v, k1v, dt / 2), m1 - mdt / 2), k2r = vaddScaled(v, k1v, dt / 2);
    const k3v = f(vaddScaled(r, k2r, dt / 2), vaddScaled(v, k2v, dt / 2), m1 - mdt / 2), k3r = vaddScaled(v, k2v, dt / 2);
    const k4v = f(vaddScaled(r, k3r, dt), vaddScaled(v, k3v, dt), m1 - mdt), k4r = vaddScaled(v, k3v, dt);
    r = vadd(r, vscale(vadd(vadd(k1r, vscale(k2r, 2)), vadd(vscale(k3r, 2), k4r)), dt / 6));
    v = vadd(v, vscale(vadd(vadd(k1v, vscale(k2v, 2)), vadd(vscale(k3v, 2), k4v)), dt / 6));
    for (const s of act) s.propLeft = Math.max(0, s.propLeft - s._mdot * dt);
    t += dt;
  }
  const rn = vnorm(r);
  const el = rv2coe(r, v, mu);
  const upper = st.find(s => s.attached && !s.parallel) || null;
  return { ...result, t, r, v, m: stackMass(stack), samples, events, el, hpAch: el.rp - surfaceRadius(body), haAch: el.ra - surfaceRadius(body), upper, upperProp: upper ? upper.propLeft : 0, maxG: maxG / g0, maxQ, azI: azI * RAD, azR: azR * RAD, stack };
}
// optimise pitch-kick for maximum remaining propellant
function optimizeAscent(base) {
  const run = (k, rec) => {
    const stack = cloneStack(base.stack);
    return simulateAscent({ ...base, stack, kick: k, record: rec, dt: rec ? (base.dt || 0.2) : 0.4 });
  };
  const qLim = base.qLimit || 36000;
  const score = res => (res.ok ? res.upperProp + 1e5 : -1e6 + (res.el && isFinite(res.el.rp) ? res.el.rp : 0)) - Math.max(0, res.maxQ - qLim) * 3;
  let a = 0.2, b = base.kickMax || 14, gr = (Math.sqrt(5) - 1) / 2;
  // coarse scan first
  let best = { k: base.kickGuess || 2, s: -Infinity };
  for (let k = 0.3; k <= b; k += (b - 0.3) / 13) { const s = score(run(k, false)); if (s > best.s) best = { k, s }; }
  a = Math.max(0.1, best.k - (b - 0.3) / 13); b = best.k + (b - 0.3) / 13;
  let c = b - gr * (b - a), d = a + gr * (b - a), fc = score(run(c, false)), fd = score(run(d, false));
  for (let i = 0; i < 12; i++) {
    if (fc > fd) { b = d; d = c; fd = fc; c = b - gr * (b - a); fc = score(run(c, false)); }
    else { a = c; c = d; fc = fd; d = a + gr * (b - a); fd = score(run(d, false)); }
  }
  const kOpt = fc > fd ? c : d;
  const res = run(kOpt, true); res.kick = kOpt;
  return res;
}
function cloneStack(s) { return { ...s, stages: s.stages.map(x => ({ ...x })), jettison: s.jettison.map(j => ({ ...j })) }; }

// ---------------------------------------------------------------------------
// POWERED DESCENT (Moon / Mars final phase).  Frame: body-centred ECL.
// ---------------------------------------------------------------------------
function simulateDescent(opt) {
  const body = opt.body, mu = BODIES[body].mu, R = surfaceRadius(body);
  let t = opt.t0, r = vcopy(opt.r0), v = vcopy(opt.v0), m = opt.m0;
  const Tmax = opt.Tmax, ve = opt.isp * G0, minThr = opt.minThr ?? 0.1;
  const tgo0 = opt.tgo, tEnd = opt.t0 + tgo0;
  const omega = bodyOmegaEcl(body, opt.t0);
  const hover = opt.hoverAlt ?? 0.15, elev = opt.elev || 0;
  const samples = [], events = [];
  let mode = 'braking', dt = 0.25, propUsed = 0, saturated = 0, steps = 0, landed = false;
  const site = (tt) => sitePosEcl(body, opt.lat, opt.lon, elev, tt);
  const rT0 = site(tEnd), upT = vunit(rT0);
  const rT = vadd(rT0, vscale(upT, hover)), vT = vadd(vcross(omega, rT), vscale(upT, -0.0012));
  while (steps++ < 20000) {
    const rn = vnorm(r), up = vunit(r);
    const ground = site(t), alt = vdot(vsub(r, ground), up) ;
    const g = vscale(r, -mu / (rn * rn * rn));
    const vrel = vsub(v, vcross(omega, r));
    let acmd;
    const tgo = tEnd - t;
    if (mode !== 'terminal' && (tgo < 4 || alt < hover * 0.9)) { mode = 'terminal'; events.push({ t, name: opt.terminalName || 'Terminal descent', desc: 'Vertical descent at ~1 m/s to touchdown.', kind: 'terminal' }); }
    if (mode !== 'terminal') {
      const zem = vsub(rT, vadd(vadd(r, vscale(v, tgo)), vscale(g, 0.5 * tgo * tgo)));
      const zev = vsub(vT, vadd(v, vscale(g, tgo)));
      acmd = vsub(vscale(zem, 6 / (tgo * tgo)), vscale(zev, 2 / tgo));
      if (mode === 'braking' && alt < 2.5) { mode = 'approach'; events.push({ t, name: opt.approachName || 'Approach phase', desc: 'Pitching upright — the landing site comes into view.', kind: 'approach' }); }
    } else {
      const vdes = vadd(vscale(up, -(alt > 0.03 ? 0.0012 : 0.0009)), [0, 0, 0]);
      const hz = vsub(vrel, vscale(up, vdot(vrel, up)));
      const err = vsub(vsub(vdes, vscale(up, vdot(vrel, up))), hz);
      acmd = vadd(vscale(g, -1), vscale(err, 0.6));
    }
    let amag = vnorm(acmd);
    const amax = Tmax / m / 1000, amin = minThr * amax;
    let dir = amag > 1e-12 ? vscale(acmd, 1 / amag) : up;
    if (amag > amax) { amag = amax; saturated += dt; }
    if (amag < amin) amag = amin;
    const T = amag * m * 1000, mdot = T / ve;
    if (samples.length === 0 || t - samples[samples.length - 1].t >= 0.999) samples.push({ t, r: vcopy(r), v: vcopy(v), m, T, thrDir: dir, alt, phase: mode, D: [0, 0, 0] });
    if (alt <= 0.0005 && t > opt.t0 + 5) { landed = true; break; }
    if (m - mdot * dt < opt.dryLimit) { events.push({ t, name: 'Propellant depleted', desc: 'Descent propellant exhausted before touchdown.', kind: 'fail' }); break; }
    // integrate (semi-implicit RK2)
    const a1 = vadd(g, vscale(dir, amag));
    const rm = vaddScaled(r, v, dt / 2), vm = vaddScaled(v, a1, dt / 2);
    const rmn = vnorm(rm), gm = vscale(rm, -mu / (rmn * rmn * rmn));
    const a2 = vadd(gm, vscale(dir, amag * m / (m - mdot * dt / 2)));
    r = vaddScaled(r, vm, dt); v = vaddScaled(v, a2, dt);
    m -= mdot * dt; propUsed += mdot * dt; t += dt;
  }
  const ll = subPointLL(body, r, t);
  const miss = vnorm(vsub(r, site(t))) - 0;
  events.push({ t, name: landed ? 'Touchdown' : 'Descent ended', desc: landed ? `Touchdown at ${ll[0].toFixed(3)}°, ${ll[1].toFixed(3)}° — ${(miss).toFixed(2)} km from the planned site.` : 'Descent did not complete.', kind: 'touchdown' });
  samples.push({ t, r: vcopy(r), v: vcopy(v), m, T: 0, thrDir: vunit(r), alt: 0, phase: 'landed', D: [0, 0, 0] });
  return { landed, t, r, v, m, propUsed, samples, events, miss, saturated, ll };
}

// ---------------------------------------------------------------------------
// ATMOSPHERIC ENTRY.  opt: body, t0, r0, v0 (body-centred ECL), m0, diam, cd, LD, rn, bank (deg),
// skip (bool), chutes ('apollo'|'orion'|'probe'|'none'), edl (Mars descent config), siteElev, landing {Tmax, isp...}
// ---------------------------------------------------------------------------
function simulateEntry(opt) {
  const body = opt.body, mu = BODIES[body].mu, R = surfaceRadius(body), elev = opt.siteElev || 0;
  const omega = bodyOmegaEcl(body, opt.t0);
  const kSG = body === 'earth' ? 1.7415e-4 : 1.9027e-4;
  let t = opt.t0, r = vcopy(opt.r0), v = vcopy(opt.v0), m = opt.m0;
  const A0 = Math.PI * (opt.diam / 2) ** 2;
  let CdA = opt.cd * A0, LD = opt.LD || 0, bank = (opt.bank ?? 0) * DEG;
  const samples = [], events = [];
  let phase = 'entry', maxG = 0, maxHeat = 0, maxQ = 0, tPeakG = t, tPeakHeat = t, skipPhase = opt.skip ? 1 : 0, dt = 0.25;
  let blackout = false, chuteState = 0, tChute = 0, landed = false, thrust = 0, thrDir = null, propUsed = 0;
  const edl = opt.edl || null, land = opt.land || null;
  let poweredT0 = 0, powered = false, sky = false;
  const evt = (name, desc, kind) => events.push({ t, name, desc, kind });
  for (let step = 0; step < 200000; step++) {
    const rn = vnorm(r), up = vunit(r), alt = rn - R - elev;
    const atm = atmosOf(body, rn - R);
    const vrel = vsub(v, vcross(omega, r)), vrn = vnorm(vrel);
    const vms = vrn * 1000, q = 0.5 * atm.rho * vms * vms, mach = vms / (atm.a || 250);
    // --- phase logic
    if (skipPhase === 1 && vdot(vrel, up) > 0 && alt > 50) { skipPhase = 2; evt('Skip-out', 'The capsule bounces off the upper atmosphere, coasting for minutes before the final entry — spreading the heat load and extending range.', 'skip'); }
    if (skipPhase === 2 && vdot(vrel, up) < 0 && alt < 100) { skipPhase = 3; evt('Second entry', 'The returner dives back in for its final, lower-speed entry.', 'entry2'); }
    let bankNow = bank;
    if (skipPhase === 1) bankNow = 0;
    if (skipPhase >= 2) bankNow = (opt.bank2 ?? 60) * DEG;
    if (opt.chutes && opt.chutes !== 'none' && body === 'earth') {
      const drogueAlt = opt.chutes === 'apollo' ? 7.3 : (opt.chutes === 'orion' ? 7.6 : 10.0);
      const mainAlt = opt.chutes === 'apollo' ? 3.0 : (opt.chutes === 'orion' ? 2.9 : 5.0);
      if (chuteState === 0 && alt < drogueAlt && vrn < 0.4) { chuteState = 1; tChute = t; evt(opt.chutes === 'probe' ? 'Parachute deploy' : 'Drogue parachutes', opt.chutes === 'probe' ? 'Main parachute opens.' : 'Drogue chutes stabilise and slow the capsule to ~80 m/s.', 'chute'); }
      if (chuteState === 1 && alt < mainAlt && opt.chutes !== 'probe') { chuteState = 2; tChute = t; evt('Main parachutes', 'Main chutes open — descent rate falls to ~8 m/s for splashdown.', 'chute'); }
    }
    if (edl && body === 'mars') {
      if (chuteState === 0 && mach < edl.chute.mach && alt > 3) { chuteState = 1; tChute = t; evt('Supersonic parachute', `${edl.chute.diam} m parachute deploys at Mach ${mach.toFixed(1)}.`, 'chute'); }
      if (chuteState === 1 && !opt._hsSep && mach < edl.heatshieldSepMach) { opt._hsSep = true; m -= opt.heatshieldMass || 0; evt('Heat shield separation', 'The heat shield drops away; radar and cameras see the ground (terrain-relative navigation).', 'jettison'); }
      if (chuteState === 1 && alt < edl.backshellSepAlt) { chuteState = 3; m -= opt.backshellMass || 0; powered = true; poweredT0 = t; evt('Backshell separation · powered descent', 'The descent stage drops free of the backshell and parachute and lights its engines.', 'powered'); }
    }
    if (opt.propulsiveLanding && !powered && alt < opt.propulsiveLanding.ignAlt) { powered = true; poweredT0 = t; evt('Landing burn', 'Engines relight; the vehicle flips upright and decelerates for touchdown.', 'powered'); }
    // chute drag area
    let CdAnow = CdA;
    if (chuteState === 1) {
      const inf = clamp((t - tChute) / 3, 0, 1);
      if (body === 'earth') CdAnow = CdA + inf * (opt.chutes === 'probe' ? 180 : (opt.chutes === 'orion' ? 60 : 28));
      else CdAnow = CdA + inf * Math.PI * (edl.chute.diam / 2) ** 2 * edl.chute.cd;
    } else if (chuteState === 2) {
      const inf = clamp((t - tChute) / 5, 0, 1);
      CdAnow = CdA + 28 + inf * (opt.chutes === 'orion' ? 1900 : 1200);
    } else if (chuteState === 3) CdAnow = 0.8 * Math.PI * 1.5 * 1.5;
    if (opt.propulsiveLanding && chuteState === 0) CdAnow = opt.propulsiveLanding.bellyCdA || CdA;
    // --- forces (closure so RK4 re-evaluates aero at intermediate states)
    const bankUse = bankNow, cdaUse = CdAnow, liftOn = LD > 0 && chuteState === 0 && !powered;
    const aeroAt = (rr, vv) => {
      const rr_n = vnorm(rr), at = atmosOf(body, rr_n - R);
      const vr_ = vsub(vv, vcross(omega, rr)), vrn_ = vnorm(vr_);
      if (vrn_ < 1e-9 || at.rho <= 0) return [0, 0, 0];
      const qq = 0.5 * at.rho * (vrn_ * 1000) ** 2, DD = qq * cdaUse;
      const vh = vscale(vr_, 1 / vrn_);
      let aa = vscale(vh, -DD / m / 1000);
      if (liftOn) {
        const u = vscale(rr, 1 / rr_n);
        let lu = vsub(u, vscale(vh, vdot(u, vh))); const lun = vnorm(lu);
        if (lun > 1e-9) { lu = vscale(lu, 1 / lun); const side = vcross(vh, lu); const ldir = vadd(vscale(lu, Math.cos(bankUse)), vscale(side, Math.sin(bankUse))); aa = vadd(aa, vscale(ldir, LD * DD / m / 1000)); }
      }
      return aa;
    };
    const aAero = aeroAt(r, v);
    const g = vscale(r, -mu / (rn * rn * rn));
    let aT = [0, 0, 0]; thrust = 0;
    if (powered && land) {
      const vr = vdot(vrel, up), hz = vsub(vrel, vscale(up, vr));
      const vdesTarget = alt > 0.06 ? -Math.max(0.002, Math.min(0.09, Math.sqrt(2 * 0.0018 * Math.max(alt - 0.02, 0)))) : -0.00075;
      const gmag = mu / (rn * rn);
      const aUp = gmag + (vdesTarget - vr) / 2.0;
      const aHz = vscale(hz, -1 / 3.0);
      let ac = vadd(vscale(up, aUp), aHz);
      ac = vsub(ac, aAero);
      let am = vnorm(ac); const amax = land.Tmax / m / 1000;
      if (am > amax) { am = amax; }
      if (am < (land.minThr || 0.05) * amax) am = (land.minThr || 0.05) * amax;
      thrDir = vunit(ac); aT = vscale(thrDir, am); thrust = am * m * 1000;
      if (edl && edl.skycrane && !sky && alt < 0.022) { sky = true; evt('Sky crane', 'The descent stage hovers and lowers the rover on 7.6 m bridles.', 'skycrane'); }
    }
    const aProper = vnorm(vadd(aAero, aT)) * 1000 / G0;
    const heat = kSG * Math.sqrt(atm.rho / (opt.rn || 1)) * Math.pow(vms, 3) / 1e4; // W/cm^2
    if (aProper > maxG) { maxG = aProper; tPeakG = t; }
    if (heat > maxHeat) { maxHeat = heat; tPeakHeat = t; }
    if (q > maxQ) maxQ = q;
    const bo = body === 'earth' ? (vrn > 6.5 && alt < 95 && alt > 38) : (vrn > 3.5 && alt < 75 && alt > 25);
    if (bo && !blackout) { blackout = true; evt(body === 'earth' ? 'Plasma blackout begins' : 'Plasma sheath', 'Ionised gas around the vehicle blocks radio signals.', 'blackout'); }
    if (!bo && blackout) { blackout = false; evt(body === 'earth' ? 'Blackout ends' : 'Plasma sheath clears', 'Radio contact is restored.', 'blackout'); }
    if (samples.length === 0 || t - samples[samples.length - 1].t >= 0.999) samples.push({ t, r: vcopy(r), v: vcopy(v), m, T: thrust, thrDir: thrDir ? vcopy(thrDir) : null, D: vscale(aAero, m * 1000), alt, q, mach, heat, gload: aProper, phase: skipPhase === 2 ? 'skip coast' : (powered ? 'powered descent' : (chuteState ? 'parachute' : 'entry')), chute: chuteState, blackout: bo, bank: bankNow * RAD });
    if (alt <= 0) { landed = true; break; }
    if (t - opt.t0 > (opt.maxTime || 4000)) break;
    // integrate RK4 (thrust held)
    const h = alt < 15 ? 0.1 : (alt > 130 ? 2.0 : dt);
    const acc = (rr, vv) => { const n = vnorm(rr); return vadd(vadd(vscale(rr, -mu / (n * n * n)), aeroAt(rr, vv)), aT); };
    const k1v = acc(r, v), k1r = v;
    const k2r = vaddScaled(v, k1v, h / 2), k2v = acc(vaddScaled(r, k1r, h / 2), k2r);
    const k3r = vaddScaled(v, k2v, h / 2), k3v = acc(vaddScaled(r, k2r, h / 2), k3r);
    const k4r = vaddScaled(v, k3v, h), k4v = acc(vaddScaled(r, k3r, h), k4r);
    r = vadd(r, vscale(vadd(vadd(k1r, vscale(k2r, 2)), vadd(vscale(k3r, 2), k4r)), h / 6));
    v = vadd(v, vscale(vadd(vadd(k1v, vscale(k2v, 2)), vadd(vscale(k3v, 2), k4v)), h / 6));
    if (thrust > 0 && land) { const dm = thrust / (land.isp * G0) * h; m -= dm; propUsed += dm; }
    t += h;
  }
  const ll = subPointLL(body, r, t);
  return { landed, t, r, v, m, samples, events, maxG, maxHeat, maxQ, tPeakG, tPeakHeat, ll, propUsed };
}
// great-circle angular distance between lat/lon (deg) → rad
function gcAngle(lat1, lon1, lat2, lon2) {
  const a = llToBF(lat1, lon1), b = llToBF(lat2, lon2); return vangle(a, b);
}
// ---------------------------------------------------------------------------
// Two-burn ascent for short, high-thrust vehicles (e.g. Mars Ascent Vehicle):
// gravity turn until apoapsis = target, coast to apoapsis, circularise.
// ---------------------------------------------------------------------------
function simulateTwoBurnAscent(opt) {
  const body = opt.body, mu = BODIES[body].mu, R = surfaceRadius(body);
  const run = (kickDeg, record) => {
    const st = { ...opt.stack.stages[0] }; let prop = st.propMass;
    const mass = () => st.dry + prop + (opt.stack.payload || 0);
    const t0 = opt.t0, Rb = R + (opt.siteElev || 0), omega = bodyOmegaEcl(body, t0);
    let r = vscale(vunit(sitePosEcl(body, opt.lat, opt.lon, 0, t0)), Rb), v = vcross(omega, r), t = t0;
    const lf0 = localFrame(body, r, t0), nT = vunit(opt.target.normal);
    let dIn = vunit(vsub(vcross(nT, lf0.up), vscale(lf0.up, vdot(vcross(nT, lf0.up), lf0.up))));
    const azI = Math.atan2(vdot(dIn, lf0.east), vdot(dIn, lf0.north));
    const vOrb = Math.sqrt(mu / (R + opt.target.hp)), vEq = vdot(v, lf0.east);
    const azR = Math.atan2(vOrb * Math.sin(azI) - vEq, vOrb * Math.cos(azI));
    const raT = R + opt.target.ha, rpT = R + opt.target.hp;
    const ve = st.ispVac * G0, mdot = st.thrustVac / ve, dt = 0.1;
    const samples = []; const events = []; let phase = 'vertical', ok = false;
    const push = (T, dir) => { if (record && (!samples.length || t - samples[samples.length - 1].t >= 0.999)) samples.push({ t, r: vcopy(r), v: vcopy(v), m: mass(), T, thrDir: dir ? vcopy(dir) : null, alt: vnorm(r) - R, phase }); };
    const step = (dir, thrust) => {
      const acc = (rr, vv, mm) => { const n = vnorm(rr); let a = vscale(rr, -mu / (n * n * n)); if (thrust) a = vadd(a, vscale(dir, st.thrustVac / mm / 1000)); return a; };
      const m0 = mass(), m1 = thrust ? m0 - mdot * dt : m0;
      const k1v = acc(r, v, m0), k1r = v;
      const k2v = acc(vaddScaled(r, k1r, dt / 2), vaddScaled(v, k1v, dt / 2), (m0 + m1) / 2), k2r = vaddScaled(v, k1v, dt / 2);
      const k3v = acc(vaddScaled(r, k2r, dt / 2), vaddScaled(v, k2v, dt / 2), (m0 + m1) / 2), k3r = vaddScaled(v, k2v, dt / 2);
      const k4v = acc(vaddScaled(r, k3r, dt), vaddScaled(v, k3v, dt), m1), k4r = vaddScaled(v, k3v, dt);
      r = vadd(r, vscale(vadd(vadd(k1r, vscale(k2r, 2)), vadd(vscale(k3r, 2), k4r)), dt / 6));
      v = vadd(v, vscale(vadd(vadd(k1v, vscale(k2v, 2)), vadd(vscale(k3v, 2), k4v)), dt / 6));
      if (thrust) prop -= mdot * dt; t += dt;
    };
    // burn 1
    for (let i = 0; i < 20000 && prop > 0; i++) {
      const lf = localFrame(body, r, t), tf = t - t0;
      const vrel = vsub(v, vcross(omega, r));
      let dir;
      const az = vadd(vscale(lf.north, Math.cos(azR)), vscale(lf.east, Math.sin(azR)));
      if (tf < (opt.vert ?? 3)) { dir = lf.up; phase = 'vertical'; }
      else if (tf < (opt.vert ?? 3) + 4) { const k = kickDeg * DEG * (tf - (opt.vert ?? 3)) / 4; dir = vunit(vadd(vscale(lf.up, Math.cos(k)), vscale(az, Math.sin(k)))); phase = 'pitchover'; }
      else { const g = Math.asin(clamp(vdot(vunit(vrel), lf.up), -1, 1)); dir = vunit(vadd(vscale(lf.up, Math.sin(g)), vscale(az, Math.cos(g)))); phase = 'gravity turn'; }
      push(st.thrustVac, dir);
      const el = rv2coe(r, v, mu); if (el.e < 1 && el.ra >= raT) break;
      step(dir, true);
      if (vnorm(r) < Rb - 0.05) return { ok: false, prop, samples, events };
    }
    events.push({ t, name: 'First burn cutoff', desc: 'Apoapsis now at the target altitude; coasting up.', kind: 'staging' });
    // coast to apoapsis
    phase = 'coast to apoapsis';
    const dtA = timeToPeri(r, v, mu) + Math.PI * Math.sqrt(Math.pow(rv2coe(r, v, mu).a, 3) / mu);
    let dtc = dtA; if (dtc < 0) dtc += 2 * Math.PI * Math.sqrt(Math.pow(rv2coe(r, v, mu).a, 3) / mu);
    const tc0 = t, rc0 = r, vc0 = v;
    for (let tt = 0; tt < dtc; tt += 5) { const s = kepProp(rc0, vc0, tt, mu); r = s.r; v = s.v; t = tc0 + tt; push(0, null); }
    { const s = kepProp(rc0, vc0, dtc, mu); r = s.r; v = s.v; t = tc0 + dtc; }
    // burn 2: circularise (horizontal, in-plane)
    phase = 'circularisation';
    events.push({ t, name: 'Circularisation burn', desc: 'At apoapsis the second burn raises the periapsis out of the atmosphere.', kind: 'ignition' });
    for (let i = 0; i < 20000 && prop > 0; i++) {
      const el = rv2coe(r, v, mu); if (el.rp >= rpT) { ok = true; break; }
      const hd = vunit(vcross(vunit(vcross(r, v)), vunit(r)));
      push(st.thrustVac, hd); step(hd, true);
    }
    const el = rv2coe(r, v, mu);
    if (el.rp >= rpT - 5) ok = true;
    events.push({ t, name: ok ? 'Orbit insertion' : 'Insufficient performance', desc: ok ? `Orbit ${(el.rp - R).toFixed(0)} × ${(el.ra - R).toFixed(0)} km.` : 'Propellant exhausted before reaching orbit.', kind: ok ? 'insertion' : 'fail' });
    return { ok, prop, samples, events, t, r, v, m: mass(), hpAch: el.rp - R, haAch: el.ra - R, el };
  };
  let best = null;
  for (let k = 5; k <= 80; k += 5) { const o = run(k, false); const sc = (o.ok ? 1e4 : 0) + o.prop; if (!best || sc > best.sc) best = { k, sc }; }
  const g = goldenMin(k => { const o = run(k, false); return -((o.ok ? 1e4 : 0) + o.prop); }, Math.max(1, best.k - 5), Math.min(85, best.k + 5), 14);
  const res = run(g.x, true); res.kick = g.x;
  res.stack = { stages: [{ propLeft: res.prop }] };
  return res;
}
