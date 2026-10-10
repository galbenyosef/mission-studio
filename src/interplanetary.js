// ============================================================================
// interplanetary.js — Mars & gravity-assist missions (patched conics, B-plane targeting)
// Profiles: mars-flyby, mars-orbit, mars-landing (direct entry), mars-orbit-landing,
//           mars-landing-return, mars-orbit-return, mars-flyby-return, multi-flyby
// Trajectory is continuous: planet-centred hyperbola ⇄ heliocentric conic at the sphere of influence.
// ============================================================================
const MU_SUN = BODIES.sun.mu;
function soiOf(b) { return BODIES[b].soi || 1e6; }
// time (s) after the current state until |r| reaches R (outbound, hyperbolic or elliptic), Kepler
function timeToRadius(r, v, mu, R, outbound = true) {
  const el = rv2coe(r, v, mu);
  const e = el.e, a = el.a;
  if (e > 1) {
    const cF = (1 - R / a) / e; if (cF < 1) return null;
    const F1 = Math.acosh(cF) * (outbound ? 1 : -1);
    const nu0 = el.nu > Math.PI ? el.nu - TAU : el.nu;
    const F0 = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu0 / 2));
    const n = Math.sqrt(mu / (-a * a * a));
    const M0 = e * Math.sinh(F0) - F0, M1 = e * Math.sinh(F1) - F1;
    return (M1 - M0) / n;
  }
  // ellipse: first crossing of radius R (in either direction) within one period
  const P = el.period, rad = tt => vnorm(kepProp(r, v, tt, mu).r) - R;
  const s0 = Math.sign(rad(1e-3)); const N = 720;
  let prev = 1e-3, fp = rad(prev);
  for (let i = 1; i <= N; i++) {
    const tt = P * i / N, f = rad(tt);
    if (Math.sign(f) !== Math.sign(fp)) { let lo = prev, hi = tt; for (let k = 0; k < 80; k++) { const m = 0.5 * (lo + hi); if (Math.sign(rad(m)) === Math.sign(fp)) lo = m; else hi = m; } return 0.5 * (lo + hi); }
    prev = tt; fp = f;
  }
  return null;
}
function timeToPeri(r, v, mu) { // time from state to periapsis (negative if periapsis is behind)
  const el = rv2coe(r, v, mu);
  let nu = el.nu > Math.PI ? el.nu - TAU : el.nu;
  return -timeSincePeri(el.e, el.a, nu, mu);
}
// heliocentric coast: find time of entry into target SOI after tStart, within [tStart, tMax]
function findSOIEntry(t0, rH, vH, target, tGuess, tMax) {
  const R = soiOf(target);
  const d = t => { const s = kepProp(rH, vH, t - t0, MU_SUN); return vnorm(vsub(s.r, bodyPos(target, t))) - R; };
  // coarse scan around guess
  const step = 3 * 3600;
  let a = Math.max(t0 + 60, tGuess - 40 * 86400), fa = d(a);
  for (let t = a + step; t <= Math.min(tMax, tGuess + 40 * 86400); t += step) {
    const ft = d(t);
    if (fa > 0 && ft <= 0) { let lo = t - step, hi = t; for (let k = 0; k < 60; k++) { const m = 0.5 * (lo + hi); if (d(m) > 0) lo = m; else hi = m; } return 0.5 * (lo + hi); }
    fa = ft; a = t;
  }
  return null;
}
// minimum distance to target in a window (for diagnostics / misses)
function closestApproachHelio(t0, rH, vH, target, ta, tb) {
  const f = t => { const s = kepProp(rH, vH, t - t0, MU_SUN); return vnorm(vsub(s.r, bodyPos(target, t))); };
  let best = { t: ta, d: f(ta) }; const st = (tb - ta) / 400;
  for (let t = ta; t <= tb; t += st) { const dd = f(t); if (dd < best.d) best = { t, d: dd }; }
  const g = goldenMin(f, best.t - st, best.t + st, 40); return { t: g.x, d: g.f };
}
// position miss vector (km) at time tArr of the heliocentric conic after SOI exit, w.r.t. target centre
function centreMiss(tB, rRel, vRel, depBody, target, tArr) {
  const muD = BODIES[depBody].mu, dtx = timeToRadius(rRel, vRel, muD, soiOf(depBody));
  if (dtx == null) return [1e9, 1e9, 1e9];
  const sX = kepProp(rRel, vRel, dtx, muD), pD = planetHelio(depBody, tB + dtx);
  const s = kepProp(vadd(pD.r, sX.r), vadd(pD.v, sX.v), tArr - (tB + dtx), MU_SUN);
  return vsub(s.r, bodyPos(target, tArr));
}
// propagate from planet-relative departure state (after burn) through SOI exit → heliocentric → target SOI entry
function patchedLeg(tB, rRel, vRel, depBody, target, tArrGuess) {
  const muD = BODIES[depBody].mu;
  const dtx = timeToRadius(rRel, vRel, muD, soiOf(depBody));
  if (dtx == null) return null;
  const tX = tB + dtx, sX = kepProp(rRel, vRel, dtx, muD);
  const pD = planetHelio(depBody, tX);
  const rH = vadd(pD.r, sX.r), vH = vadd(pD.v, sX.v);
  const tE = findSOIEntry(tX, rH, vH, target, tArrGuess, tArrGuess + 120 * 86400);
  if (tE == null) return { tX, rH, vH, miss: true };
  const sE = kepProp(rH, vH, tE - tX, MU_SUN), pT = planetHelio(target, tE);
  const rT = vsub(sE.r, pT.r), vT = vsub(sE.v, pT.v);
  const muT = BODIES[target].mu;
  const bv = bVector(rT, vT, muT);
  const tp = tE + timeToPeri(rT, vT, muT);
  const elT = rv2coe(rT, vT, muT);
  return { tX, rH, vH, tE, rT, vT, bv, tp, rp: elT.rp, el: elT };
}
// same but starting heliocentric (after a flyby or TCM)
function patchedHelio(t0, rH, vH, target, tArrGuess) {
  const tE = findSOIEntry(t0, rH, vH, target, tArrGuess, tArrGuess + 120 * 86400);
  if (tE == null) return { miss: true };
  const sE = kepProp(rH, vH, tE - t0, MU_SUN), pT = planetHelio(target, tE);
  const rT = vsub(sE.r, pT.r), vT = vsub(sE.v, pT.v), muT = BODIES[target].mu;
  return { tE, rT, vT, bv: bVector(rT, vT, muT), tp: tE + timeToPeri(rT, vT, muT), rp: rv2coe(rT, vT, muT).rp };
}
function bPlaneAxes(S) { const k = [0, 0, 1]; const T = vunit(vcross(S, k)); return { T, R: vcross(S, T) }; }
// arrival design for direct entry / landing at a surface site
function entryGeometry(body, vinfVec, rEI, fpaDeg_, thetaRange, Tentry, site, tLandGuess, win = 0.55 * 86400) {
  const mu = BODIES[body].mu, vinf = vnorm(vinfVec), S = vunit(vinfVec);
  const vEI = Math.sqrt(vinf * vinf + 2 * mu / rEI), g = fpaDeg_ * DEG;
  const h = rEI * vEI * Math.cos(g), e = Math.sqrt(1 + vinf * vinf * h * h / (mu * mu)), p = h * h / mu;
  const rp = p / (1 + e), nuInf = Math.acos(-1 / e);
  const nuEI = -Math.acos(clamp((p / rEI - 1) / e, -1, 1));
  const beta = nuInf + nuEI + thetaRange; // angle from incoming position direction (-S) to landing point
  const sDir = t => vunit(sitePosEcl(body, site.lat, site.lon, site.elev || 0, t));
  const f = t => vdot(sDir(t), vscale(S, -1)) - Math.cos(beta);
  let best = null; const st = 300;
  for (let t = tLandGuess - win; t < tLandGuess + win; t += st) {
    const a = f(t), b = f(t + st);
    if (a * b <= 0) { const r = bisectRoot(f, t, t + st, 50); if (r != null && (!best || Math.abs(r - tLandGuess) < Math.abs(best - tLandGuess))) best = r; }
  }
  let tLand = best, approx = false;
  if (tLand == null) { // latitude not reachable: take the closest approach
    const gm = goldenMin(t => Math.abs(f(t)), tLandGuess - win, tLandGuess + win, 60); tLand = gm.x; approx = true;
  }
  const sd = sDir(tLand);
  let hh = vunit(vcross(vscale(S, -1), sd)); if (vnorm(hh) < 1e-9) hh = vperp(S);
  // time from EI to periapsis on hyperbola
  const a = -mu / (vinf * vinf);
  const F = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nuEI / 2));
  const tEItoP = -(e * Math.sinh(F) - F) / Math.sqrt(mu / (-a * a * a));
  const tEI = tLand - Tentry;
  return { tLand, tEI, tp: tEI + tEItoP, hhat: hh, rp, e, B: vscale(vunit(vcross(S, hh)), bFromRp(rp, vinf, mu)), approx, beta };
}
// reference EDL to get entry range & duration
function marsEntryRef(SC, P, vEI, fpa, bank) {
  const edl = SC.edl, R = surfaceRadius('mars');
  const r0 = [R + 125, 0, 0], v0 = [vEI * Math.sin(fpa * DEG), vEI * Math.cos(fpa * DEG), 0];
  const res = runMarsEDL(SC, P, 0, r0, v0, bank, { lat: 0, lon: 0, elev: 0 }, true);
  return { range: vangle(r0, res.r), dur: res.t, res };
}
function entryMassOf(SC, P) { return P.massOf(SC.entry || SC.orbiter); }
function runMarsEDL(SC, P, t0, r0, v0, bank, site, refOnly) {
  const edl = SC.edl, mE = SC.entry ? P.massOf(SC.entry) : P.massOf(SC.orbiter) + (P.upper && P.upper.attached ? P.upper.dry + P.upper.propLeft : 0);
  const landId = SC.prop.lander;
  const eng = landId ? P.engineOf(landId) : (SC.usesUpperStage ? { thrust: 3 * 2.3e6, isp: 330, minThr: 0.4 } : null);
  const opt = { body: 'mars', t0, r0, v0, m0: mE, diam: edl.diam, cd: edl.cd, LD: edl.LD, rn: edl.rn, bank, siteElev: site.elev || 0, maxTime: 2400 };
  if (edl.propulsive) { opt.propulsiveLanding = { ignAlt: 9, bellyCdA: 1.0 * 9 * 50 }; opt.land = { Tmax: eng.thrust, isp: eng.isp, minThr: 0.08 }; }
  else {
    opt.edl = edl; opt.heatshieldMass = edl.heatshieldMass ?? (SC.modules.AEROSHELL ? 440 : (SC.modules.CAPS ? SC.modules.CAPS.dry * 0.45 : 300));
    opt.backshellMass = edl.backshellMass ?? (SC.modules.AEROSHELL ? SC.modules.AEROSHELL.dry - 440 : (SC.modules.CAPS ? SC.modules.CAPS.dry * 0.55 : 300));
    opt.land = { Tmax: eng.thrust, isp: eng.isp, minThr: eng.minThr || 0.1 };
  }
  return simulateEntry(opt);
}
function earthEntryGeneric(SC, P, t0, r0, v0, m, bank) {
  if (SC.usesUpperStage) {
    const e = SC.edl, mm = m ?? (P.massOf(SC.orbiter) + P.upper.dry + P.upper.propLeft);
    return simulateEntry({ body: 'earth', t0, r0, v0, m0: mm, diam: e.diam, cd: e.cd, LD: e.LD, rn: e.rn, bank, maxTime: 4000, propulsiveLanding: { ignAlt: 2.5, bellyCdA: 1.0 * 9 * 50 }, land: { Tmax: 3 * 2.3e6, isp: 327, minThr: 0.08 } });
  }
  const cap = SC.modules[SC.capsule];
  return earthEntryRun(cap, t0, r0, v0, m ?? P.massOf([SC.capsule]), bank);
}
function earthEntryRun(cap, t0, r0, v0, m, bank, chutes) {
  return simulateEntry({ body: 'earth', t0, r0, v0, m0: m, diam: cap.heat.diam, cd: cap.heat.cd, LD: cap.heat.LD, rn: cap.heat.rn, bank, chutes: chutes ?? cap.heat.chutes, maxTime: 4000 });
}
// --------------------------------------------------------------------------
function planInterplanetary(cfg, progress = () => { }) {
  const M = new Mission(cfg);
  const H = 3600, D = 86400;
  const L = LAUNCHERS[cfg.launcher], SC = JSON.parse(JSON.stringify(SPACECRAFT[cfg.spacecraft]));
  if (cfg.scOverride) for (const k in cfg.scOverride) Object.assign(SC.modules[k], cfg.scOverride[k]);
  if (cfg.payloadMass && SC.modules.CARGO) SC.modules.CARGO.dry = cfg.payloadMass;
  const P = new Propulsion(SC);
  const S = LAUNCH_SITES[cfg.site];
  const t0 = M.t0, crew = cfg.crew || 0;
  const ship = M.addObj(new MObject('ship', cfg.shipName || SC.name, { primary: true, crew, model: SC.model, color: '#ffd166' }));
  const legs = cfg.legs; // [{body:'mars', t:'ISO', type:'flyby'|'arrive'}, ...]
  // ---------------- heliocentric design (Lambert legs) ----------------
  progress('Interplanetary trajectory design (Lambert)…');
  const tDep = t0 + (cfg.refill ? cfg.refill.days * D : 0) + (cfg.tmiDelay ?? 1.0) * H;
  const nodes = [{ body: 'earth', t: tDep }, ...legs.map(l => ({ ...l, t: isoToT(l.t) }))];
  const lam = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = planetHelio(nodes[i].body, nodes[i].t), b = planetHelio(nodes[i + 1].body, nodes[i + 1].t);
    const sol = lambert(a.r, b.r, nodes[i + 1].t - nodes[i].t, MU_SUN, [0, 0, 1]);
    lam.push({ v1: sol.v1, v2: sol.v2, vinfOut: vsub(sol.v1, a.v), vinfIn: vsub(sol.v2, b.v) });
  }
  for (let i = 1; i < nodes.length - 1; i++) if (nodes[i].type === 'flyby') nodes[i].vinfNext = lam[i].vinfOut;
  const vinfDep = lam[0].vinfOut, C3 = vdot(vinfDep, vinfDep);
  M.summary.design = { C3, vinfDep: vnorm(vinfDep), legs: lam.map((l, i) => ({ to: nodes[i + 1].body, vinfIn: vnorm(l.vinfIn), vinfOut: vnorm(l.vinfOut) })) };
  // ---------------- launch plane contains departure asymptote ----------------
  const pl = cfg.launchAz != null ? { n: planeNormalFromAzRel('earth', S.lat, S.lon, t0, cfg.launchAz).n, az: cfg.launchAz } : planeThroughSite('earth', S.lat, S.lon, t0, vunit(vinfDep));
  M.notes.push(`Launch azimuth ${pl.az.toFixed(1)}° — the parking orbit plane contains the outgoing asymptote (declination ${(Math.asin(eclToEq(vunit(vinfDep))[2]) * RAD).toFixed(1)}°), so the departure burn needs no plane change.`);
  progress('Launch & ascent…');
  const scMass0 = scTotalMass(SC);
  const LP = launchPhase(M, cfg, L, scMass0, pl.n, { ship });
  if (!LP.ok) { M.warnings.push('The launch vehicle cannot reach orbit with this payload.'); M.failed = 'ascent'; M.finalize(); return M; }
  const asc = LP.asc;
  P.attachUpper(asc.upper, asc.upperProp);
  let mass = asc.m;
  ship.setConfig(asc.t, 'stack', { key: 'stack', parts: ['upper', 'sc-stowed'], launcher: cfg.launcher, stage: L.stages.length - 1, sc: SC.model });
  let t = asc.t, r = asc.r, v = asc.v;
  // optional: orbital refilling (Starship)
  if (cfg.refill) {
    const tR = t + cfg.refill.days * D;
    ship.add(new ConicSeg('earth', t, tR, r, v, mass, { extra: { phase: 'low Earth orbit — propellant transfer' } }));
    const s2 = kepProp(r, v, tR - t, MU_E); r = s2.r; v = s2.v;
    const add = cfg.refill.to - P.upper.propLeft; P.upper.propLeft = cfg.refill.to; mass += add;
    M.ev(t + 0.5 * D, 'ship', 'Orbital refilling begins', `Tanker Starships dock one by one and transfer liquid methane and oxygen. ${cfg.refill.tankers} tanker flights deliver ≈${(add / 1000).toFixed(0)} t of propellant.`, 'refill');
    M.ev(tR - 0.2 * D, 'ship', 'Tanks full', `The Ship now carries ${(cfg.refill.to / 1000).toFixed(0)} t of propellant — enough for the trans-Mars injection.`, 'refill');
    M.phase(t, tR, 'Propellant transfer in LEO', '#4ea8de');
    t = tR;
  }
  // ---------------- TMI geometry: periapsis of departure hyperbola ----------------
  progress('Trans-Mars injection targeting…');
  const hP = vunit(vcross(r, v));
  const rPark = vnorm(r);
  const depH = departureHyperbola(vinfDep, hP, rPark, MU_E);
  // first passage of parking orbit through periapsis direction after a short coast
  const ang = (rr) => Math.atan2(vdot(vcross(vunit(rr), depH.phat), hP), vdot(vunit(rr), depH.phat));
  const periodPark = 2 * Math.PI * Math.sqrt(Math.pow(rPark, 3) / MU_E);
  let dth = ang(r); if (dth < 0) dth += TAU; if (dth < 0.25) dth += TAU;
  const tTMI = t + dth / TAU * periodPark;
  const sT = kepProp(r, v, tTMI - t, MU_E);
  const vpNeeded = vscale(vunit(vcross(hP, vunit(sT.r))), Math.sqrt(vdot(vinfDep, vinfDep) + 2 * MU_E / vnorm(sT.r)));
  let dvTMI = vsub(vpNeeded, sT.v);
  // ---------------- arrival target (B-plane) for the first leg ----------------
  const first = nodes[1];
  const tArr1 = nodes[1].t;
  const target = first.body;
  let tgt = arrivalTarget(cfg, first, lam[0].vinfIn, tArr1, SC, P, M);
  // Newton on TMI Δv → [B·T, B·R, t_periapsis]
  const FT = x => {
    const vv = vadd(sT.v, vadd(dvTMI, x));
    const o = patchedLeg(tTMI, sT.r, vv, 'earth', target, tArr1);
    if (!o || o.miss || !o.bv) return [1e3, 1e3, 1e3];
    const ax = bPlaneAxes(o.bv.S);
    return [(vdot(o.bv.B, ax.T) - vdot(tgt.B, ax.T)) / 1000, (vdot(o.bv.B, ax.R) - vdot(tgt.B, ax.R)) / 1000, (o.tp - tgt.tp) / H / 2];
  };
  // stage 1: aim at the planet centre (smooth even when the SOI is missed), stage 2: B-plane
  const s1 = newtonSolve(x => vscale(centreMiss(tTMI, sT.r, vadd(sT.v, vadd(dvTMI, x)), 'earth', target, tgt.tp), 1e-4), [0, 0, 0], { h: 1e-7, tol: 1e-3, maxIt: 30, maxStep: 0.1 });
  let sol = newtonSolve(FT, s1.x, { h: 1e-7, tol: 1e-3, maxIt: 30, maxStep: 0.05 });
  // refine target with actual v_inf (landing geometry depends on it) and re-solve
  for (let k = 0; k < 2; k++) {
    const o = patchedLeg(tTMI, sT.r, vadd(sT.v, vadd(dvTMI, sol.x)), 'earth', target, tArr1);
    if (!o || o.miss) break;
    const vin = vsub(kepProp(o.rT, o.vT, 0, BODIES[target].mu).v, [0, 0, 0]);
    const vinfVec = vscale(o.bv.S, o.bv.vinf);
    tgt = arrivalTarget(cfg, first, vinfVec, o.tp, SC, P, M);
    sol = newtonSolve(FT, sol.x, { h: 1e-7, tol: 1e-3, maxIt: 30, maxStep: 0.05 });
  }
  if (!sol.ok) M.warnings.push(`Arrival targeting converged only approximately (residual ${sol.norm.toFixed(2)}).`);
  dvTMI = vadd(dvTMI, sol.x);
  // ---------------- execute TMI ----------------
  const tmiEng = SC.usesUpperStage || cfg.tmiBy !== 'sc' ? 'upper' : SC.prop.orbiter;
  const eng = P.engineOf(tmiEng);
  const pb = P.burn(tmiEng, mass, vnorm(dvTMI));
  const vPost = vadd(sT.v, vscale(dvTMI, pb.dvAch / vnorm(dvTMI)));
  ship.add(new ConicSeg('earth', t, tTMI - pb.dur / 2, r, v, mass, { extra: { phase: 'parking orbit' } }));
  ship.add(new BurnSeg('earth', tTMI, pb.dur, sT.r, sT.v, vPost, mass, mass - pb.prop, pb.thrust, { extra: { phase: cfg.depBurnName || 'trans-Mars injection', stage: tmiEng } }));
  M.burn({ name: cfg.depBurnName || 'TMI — trans-Mars injection', t: tTMI - pb.dur / 2, dur: pb.dur, dv: pb.dvAch * 1000, engine: pb.engine, isp: pb.isp, prop: pb.prop, m0: mass, obj: 'ship', propType: pb.propType });
  M.ev(tTMI - pb.dur / 2, 'ship', cfg.depBurnName || 'Trans-Mars injection', `${EXPLAIN.tmi} C3 = ${C3.toFixed(1)} km²/s², v∞ = ${Math.sqrt(C3).toFixed(2)} km/s. Burn ${fmtDur(pb.dur)}, Δv ${(pb.dvAch * 1000).toFixed(0)} m/s.`, 'burn');
  M.phase(asc.t, tTMI - pb.dur / 2, cfg.refill ? 'Earth orbit (refilling)' : 'Parking orbit', '#4ea8de');
  mass -= pb.prop;
  // separation from upper stage
  const tPost = tTMI + pb.dur / 2;
  const sPost = kepProp(sT.r, vPost, pb.dur / 2, MU_E);
  if (!pb.ok) {
    M.failed = 'tmi';
    const dvNeed = vnorm(dvTMI) * 1000, dvGot = pb.dvAch * 1000;
    M.warnings.push(`Insufficient propellant for the departure burn: Δv ${dvGot.toFixed(0)} of ${dvNeed.toFixed(0)} m/s. The craft cannot reach ${BODIES[target].name}. Choose a more capable launch vehicle${SC.usesUpperStage ? ', orbital refilling' : ''} or a lighter payload.`);
    const el = rv2coe(sPost.r, sPost.v, MU_E);
    M.ev(tPost, 'ship', 'Departure burn shortfall', el.e < 1 ? `Propellant ran out ${(dvNeed - dvGot).toFixed(0)} m/s short. The craft is left in an elliptical Earth orbit with apogee ${Math.round(el.ra - BODIES.earth.R).toLocaleString()} km.` : `Propellant ran out ${(dvNeed - dvGot).toFixed(0)} m/s short. The craft escapes Earth but on a solar orbit that never reaches ${BODIES[target].name}.`, 'fail');
    if (el.e < 1) {
      const tEnd = tPost + Math.min(Math.max(2 * el.period, 6 * H), 20 * D);
      ship.add(new ConicSeg('earth', tPost, tEnd, sPost.r, sPost.v, mass, { extra: { phase: 'stranded in Earth orbit' } }));
      M.phase(tTMI - pb.dur / 2, tEnd, 'Stranded in Earth orbit', '#ff5d5d');
    } else {
      const tOut = timeToRadius(sPost.r, sPost.v, MU_E, BODIES.earth.soi, true);
      const tSoi = tPost + (tOut && tOut > 0 ? tOut : 5 * D);
      ship.add(new ConicSeg('earth', tPost, tSoi, sPost.r, sPost.v, mass, { extra: { phase: 'departure hyperbola' } }));
      const sE = kepProp(sPost.r, sPost.v, tSoi - tPost, MU_E), pE = planetHelio('earth', tSoi);
      const rH = vadd(pE.r, sE.r), vH = vadd(pE.v, sE.v);
      ship.add(new ConicSeg('sun', tSoi, tSoi + 300 * D, rH, vH, mass, { extra: { phase: 'heliocentric drift (target missed)' } }));
      M.phase(tTMI - pb.dur / 2, tSoi + 300 * D, 'Off-course solar orbit', '#ff5d5d');
    }
    M.finalize(); return M;
  }
  let tCur = tPost, rCur = sPost.r, vCur = sPost.v;
  if (!SC.usesUpperStage && tmiEng === 'upper') {
    const tSep = tPost + (cfg.sepAfter ?? 0.6) * H;
    ship.add(new ConicSeg('earth', tPost, tSep, rCur, vCur, mass, { extra: { phase: 'departure hyperbola' } }));
    const s3 = kepProp(rCur, vCur, tSep - tPost, MU_E); rCur = s3.r; vCur = s3.v; tCur = tSep;
    const up = M.addObj(new MObject('upper', P.upper.name, { kind: 'stage', model: 'stage', color: '#aaa' }));
    up.setConfig(tSep, 'stage', { key: 'stage', launcher: cfg.launcher, stage: L.stages.length - 1 });
    const mUp = P.upper.dry + P.upper.propLeft;
    up.add(new ConicSeg('earth', tSep, tSep + 3 * D, rCur, vadd(vCur, vscale(vunit(vCur), -0.01)), mUp, { extra: { phase: 'spent upper stage (escapes Earth into solar orbit)' } }));
    mass -= mUp; P.upper.attached = false;
    ship.setConfig(tSep, 'sc', { key: 'sc', sc: SC.model, parts: ['cruise'] });
    M.ev(tSep, 'ship', 'Spacecraft separation', `${SC.name} separates from the spent ${P.upper.name}. Solar arrays deploy and the craft begins its ${Math.round((tArr1 - tSep) / D)}-day cruise.`, 'sep');
  }
  // ---------------- cruise legs ----------------
  return cruiseAndArrive(M, cfg, SC, P, ship, nodes, lam, 0, tCur, rCur, vCur, 'earth', mass, tgt, progress);
}
// gravity-assist design: hyperbola that turns v∞in into the direction of v∞out (powered if |v∞| differ)
function flybyDesign(vIn, vOut, mu, rMin) {
  const a = vnorm(vIn), b = vnorm(vOut), delta = vangle(vIn, vOut);
  let hh = vunit(vcross(vIn, vOut)); if (vnorm(vcross(vIn, vOut)) < 1e-9) hh = vperp(vIn);
  const f = rp => Math.asin(1 / (1 + rp * a * a / mu)) + Math.asin(1 / (1 + rp * b * b / mu)) - delta;
  let rp = bisectRoot(f, rMin * 0.05, rMin * 2000);
  const feasible = rp != null && rp >= rMin;
  if (rp == null || rp < rMin) rp = rMin;
  const dvP = Math.abs(Math.sqrt(b * b + 2 * mu / rp) - Math.sqrt(a * a + 2 * mu / rp));
  return { hhat: hh, rp, dvP, feasible, delta };
}
// arrival design for leg end
function arrivalTarget(cfg, leg, vinfVec, tArr, SC, P, M) {
  const body = leg.body, mu = BODIES[body].mu, S = vunit(vinfVec), vinf = vnorm(vinfVec);
  const R = surfaceRadius(body);
  if (leg.type === 'entry') {
    // direct entry to a surface site
    const eCfg = leg.entry || {};
    const rEI = R + (eCfg.alt ?? (body === 'earth' ? 125 : 125));
    let ref;
    if (body === 'mars') { const vEI = Math.sqrt(vinf * vinf + 2 * mu / rEI); ref = marsEntryRef(SC, P, vEI, eCfg.fpa ?? -15.5, eCfg.bank ?? 45); }
    else { const vEI = Math.sqrt(vinf * vinf + 2 * mu / rEI); const rr = [rEI, 0, 0], vv = [vEI * Math.sin((eCfg.fpa ?? -9) * DEG), vEI * Math.cos((eCfg.fpa ?? -9) * DEG), 0]; const e = earthEntryGeneric(SC, P, 0, rr, vv, null, eCfg.bank ?? 55); ref = { range: vangle(rr, e.r), dur: e.t }; }
    const g = entryGeometry(body, vinfVec, rEI, eCfg.fpa ?? (body === 'mars' ? -15.5 : -9), ref.range, ref.dur, leg.site, leg.tLand ? isoToT(leg.tLand) : tArr + 600);
    if (g.approx && M) M.notes.push(`${BODIES[body].name}: the approach geometry cannot reach latitude ${leg.site.lat.toFixed(1)}° exactly; landing at the nearest reachable point.`);
    return { B: g.B, tp: g.tp, entry: g, ref };
  }
  if (leg.type === 'flyby' && leg.vinfNext) {
    const fd = flybyDesign(vinfVec, leg.vinfNext, mu, R + (leg.minAlt ?? 200));
    const rpF = leg.alt != null && leg.forceAlt ? R + leg.alt : fd.rp;
    leg.design = fd;
    return { B: vscale(vunit(vcross(S, fd.hhat)), bFromRp(rpF, vinf, mu)), tp: tArr, hhat: fd.hhat, rp: rpF };
  }
  // orbit insertion / flyby: plane from requested inclination (to planet equator) or natural
  const rp = R + (leg.alt ?? 400);
  let hh;
  if (leg.incl != null) {
    const pole = bodyPoleEcl(body, tArr);
    // h ⊥ S with h·pole = cos(i)
    const u = vperp(S), w = vcross(S, u);
    const ci = Math.cos(leg.incl * DEG);
    const A = vdot(u, pole), Bc = vdot(w, pole), Rr = Math.hypot(A, Bc);
    let phi0 = Math.atan2(Bc, A), c = clamp(ci / (Rr || 1e-9), -1, 1);
    const ang = phi0 + (leg.inclSide === 'b' ? -1 : 1) * Math.acos(c);
    hh = vunit(vadd(vscale(u, Math.cos(ang)), vscale(w, Math.sin(ang))));
  } else if (leg.hhat) hh = leg.hhat;
  else { const k = leg.retro ? [0, 0, -1] : [0, 0, 1]; hh = vunit(vsub(k, vscale(S, vdot(k, S)))); }
  if (leg.bSide === 'flip') hh = vscale(hh, -1);
  return { B: vscale(vunit(vcross(S, hh)), bFromRp(rp, vinf, mu)), tp: tArr, hhat: hh, rp };
}
// --------------------------------------------------------------------------
function cruiseAndArrive(M, cfg, SC, P, ship, nodes, lam, iLeg, t, rRel, vRel, fromBody, mass, tgt, progress) {
  const H = 3600, D = 86400;
  const leg = nodes[iLeg + 1], target = leg.body;
  const muF = BODIES[fromBody].mu, muT = BODIES[target].mu;
  progress(`Cruise to ${BODIES[target].name}…`);
  // departure hyperbola to SOI exit
  const dtx = timeToRadius(rRel, vRel, muF, soiOf(fromBody));
  let tX = t + dtx;
  ship.add(new ConicSeg(fromBody, t, tX, rRel, vRel, mass, { extra: { phase: `leaving ${BODIES[fromBody].name}’s sphere of influence` } }));
  const sX = kepProp(rRel, vRel, dtx, muF), pX = planetHelio(fromBody, tX);
  let rH = vadd(pX.r, sX.r), vH = vadd(pX.v, sX.v);
  M.ev(tX, 'ship', `Leaving ${BODIES[fromBody].name}’s sphere of influence`, `${(soiOf(fromBody) / 1000).toFixed(0)},000 km out, the Sun’s gravity now dominates. ${EXPLAIN.cruise}`, 'soi');
  // TCM events from config (historical, informational) & optional correction burn after flybys
  let tE = findSOIEntry(tX, rH, vH, target, leg.t, leg.t + 120 * D);
  let tCM = null;
  if (iLeg > 0 || (tE == null)) {
    // post-flyby trajectory correction: retarget next B-plane
    tCM = tX + (cfg.tcmAfterFlyby ?? 12) * D;
    const sC = kepProp(rH, vH, tCM - tX, MU_SUN);
    const FT = x => { const o = patchedHelio(tCM, sC.r, vadd(sC.v, x), target, leg.t); if (o.miss || !o.bv) return [1e3, 1e3, 1e3]; const ax = bPlaneAxes(o.bv.S); return [(vdot(o.bv.B, ax.T) - vdot(tgt.B, ax.T)) / 1000, (vdot(o.bv.B, ax.R) - vdot(tgt.B, ax.R)) / 1000, (o.tp - tgt.tp) / H / 2]; };
    // initial guess from Lambert to target centre
    const pTa = planetHelio(target, leg.t);
    const Lb = lambert(sC.r, pTa.r, leg.t - tCM, MU_SUN, [0, 0, 1]);
    const x0 = Lb ? vsub(Lb.v1, sC.v) : [0, 0, 0];
    let sol = newtonSolve(FT, x0, { h: 1e-7, tol: 1e-3, maxIt: 30, maxStep: 0.1 });
    for (let k = 0; k < 2 && tgt.entry; k++) { const o = patchedHelio(tCM, sC.r, vadd(sC.v, sol.x), target, leg.t); if (o.miss) break; tgt = arrivalTarget(cfg, leg, vscale(o.bv.S, o.bv.vinf), o.tp, SC, P, M); sol = newtonSolve(FT, sol.x, { h: 1e-7, tol: 1e-3, maxIt: 30, maxStep: 0.1 }); }
    const dv = vnorm(sol.x);
    const engId = SC.usesUpperStage ? 'upper' : SC.prop.orbiter;
    const pm = P.burn(engId, mass, dv);
    ship.add(new ConicSeg('sun', tX, tCM, rH, vH, mass, { extra: { phase: 'heliocentric cruise' } }));
    M.burn({ name: `Deep-space manoeuvre (to ${BODIES[target].name})`, t: tCM, dur: pm.dur, dv: dv * 1000, engine: pm.engine, isp: pm.isp, prop: pm.prop, m0: mass, obj: 'ship', propType: pm.propType });
    M.ev(tCM, 'ship', 'Trajectory correction', `A ${(dv * 1000).toFixed(1)} m/s burn re-aims the trajectory at the ${BODIES[target].name} aim point (B-plane targeting). In this patched-conic model it also absorbs small mismatches of the idealised flyby.`, 'burn', { dv: dv * 1000 });
    mass -= pm.prop; rH = sC.r; vH = vadd(sC.v, sol.x); tX = tCM;
    tE = findSOIEntry(tX, rH, vH, target, leg.t, leg.t + 120 * D);
  }
  for (const e of (cfg.tcms || []).filter(e => e.leg === iLeg)) M.ev(isoToT(e.t), 'ship', e.name, e.desc || 'Trajectory correction manoeuvre (historical).', 'info');
  if (tE == null) {
    const ca = closestApproachHelio(tX, rH, vH, target, leg.t - 30 * D, leg.t + 30 * D);
    ship.add(new ConicSeg('sun', tX, leg.t + 60 * D, rH, vH, mass, { extra: { phase: 'heliocentric cruise' } }));
    M.warnings.push(`The trajectory misses ${BODIES[target].name} by ${Math.round(ca.d).toLocaleString()} km.`); M.finalize(); return M;
  }
  ship.add(new ConicSeg('sun', tX, tE, rH, vH, mass, { extra: { phase: 'heliocentric cruise' } }));
  M.phase(tX - 2 * D, tE, `Cruise to ${BODIES[target].name}`, '#9b5de5');
  // cruise events: midpoint facts
  const midT = 0.5 * (tX + tE), sM = kepProp(rH, vH, midT - tX, MU_SUN);
  M.ev(midT, 'ship', 'Mid-cruise', `${(vnorm(sM.r) / AU).toFixed(2)} AU from the Sun, heliocentric speed ${vnorm(sM.v).toFixed(1)} km/s. One-way radio delay to Earth: ${(vnorm(vsub(sM.r, bodyPos('earth', midT))) / C_KMS / 60).toFixed(1)} min.`, 'info');
  const sE = kepProp(rH, vH, tE - tX, MU_SUN), pT = planetHelio(target, tE);
  let rT = vsub(sE.r, pT.r), vT = vsub(sE.v, pT.v);
  M.ev(tE, 'ship', `${BODIES[target].name} sphere of influence`, `${BODIES[target].name}’s gravity now dominates (sphere of influence radius ${Math.round(soiOf(target)).toLocaleString()} km). Approach speed v∞ = ${vnorm(vT).toFixed(2)} km/s.`, 'soi');
  return arrive(M, cfg, SC, P, ship, nodes, lam, iLeg, tE, rT, vT, target, mass, tgt, progress);
}
// --------------------------------------------------------------------------
function arrive(M, cfg, SC, P, ship, nodes, lam, iLeg, tE, rT, vT, target, mass, tgt, progress) {
  const H = 3600, D = 86400, leg = nodes[iLeg + 1], mu = BODIES[target].mu, R = surfaceRadius(target);
  const elA = rv2coe(rT, vT, mu);
  const tP = tE + timeToPeri(rT, vT, mu);
  const sP = kepProp(rT, vT, tP - tE, mu);
  if (leg.type === 'flyby') {
    // ---------------- flyby / gravity assist ----------------
    const dtx = timeToRadius(sP.r, sP.v, mu, soiOf(target));
    const tX = tP + dtx;
    ship.add(new ConicSeg(target, tE, tP, rT, vT, mass, { extra: { phase: `${BODIES[target].name} flyby` } }));
    const vinf = Math.sqrt(2 * elA.energy), turn = 2 * Math.asin(1 / elA.e) * RAD;
    const pIn = planetHelio(target, tE), sx = kepProp(rT, vT, tX - tE, mu), pOut = planetHelio(target, tX);
    const vHin = vnorm(vadd(pIn.v, vT)), vHout = vnorm(vadd(pOut.v, sx.v));
    M.ev(tP, 'ship', leg.name || `${BODIES[target].name} flyby (gravity assist)`, `${EXPLAIN.flyby} Closest approach ${Math.round(elA.rp - R).toLocaleString()} km altitude at ${Math.sqrt(vinf * vinf + 2 * mu / elA.rp).toFixed(2)} km/s. Trajectory bent by ${turn.toFixed(1)}°; heliocentric speed ${vHin.toFixed(2)} → ${vHout.toFixed(2)} km/s (${vHout >= vHin ? '+' : ''}${(vHout - vHin).toFixed(2)} km/s).`, 'flyby');
    for (const e of (leg.events || [])) M.ev(tP + (e.dt || 0) * H, 'ship', e.name, e.desc, e.kind || 'photo');
    M.summary.flybys = M.summary.flybys || []; M.summary.flybys.push({ body: target, alt: elA.rp - R, dvHelio: vHout - vHin, turn });
    M.phase(tE, tX, `${BODIES[target].name} flyby`, '#43aa8b');
    if (iLeg + 2 < nodes.length && nodes[iLeg + 2].type !== 'design') {
      // next leg
      const nl = nodes[iLeg + 2];
      const tgt2 = arrivalTarget(cfg, nl, lam[iLeg + 1].vinfIn, nl.t, SC, P, M);
      return cruiseAndArrive(M, cfg, SC, P, ship, nodes, lam, iLeg + 1, tP, sP.r, sP.v, target, mass, tgt2, progress);
    }
    // final: coast on after flyby
    const pX = planetHelio(target, tX);
    const tEnd = tX + (cfg.coastAfter ?? 60) * D;
    ship.add(new ConicSeg(target, tP, tX, sP.r, sP.v, mass, { extra: { phase: `leaving ${BODIES[target].name}` } }));
    ship.add(new ConicSeg('sun', tX, tEnd, vadd(pX.r, sx.r), vadd(pX.v, sx.v), mass, { extra: { phase: cfg.afterPhase || 'heliocentric orbit' } }));
    if (cfg.endNote) M.ev(tEnd - 1, 'ship', cfg.endNote.name, cfg.endNote.desc, 'info');
    M.phase(tX, tEnd, cfg.afterPhase || 'Heliocentric orbit', '#9b5de5');
    M.finalize(); return M;
  }
  if (leg.type === 'entry') return doDirectEntry(M, cfg, SC, P, ship, nodes, lam, iLeg, tE, rT, vT, target, mass, tgt, progress);
  if (leg.type === 'orbit') return doOrbitInsertion(M, cfg, SC, P, ship, nodes, lam, iLeg, tE, rT, vT, target, mass, tgt, progress);
  M.finalize(); return M;
}
// --------------------------------------------------------------------------
function doDirectEntry(M, cfg, SC, P, ship, nodes, lam, iLeg, tE, rT, vT, body, mass, tgt, progress) {
  const H = 3600, D = 86400, leg = nodes[iLeg + 1], mu = BODIES[body].mu, R = surfaceRadius(body);
  const rEI = R + (leg.entry?.alt ?? 125);
  const dtEI = timeToRadius(rT, vT, mu, rEI, false);
  if (dtEI == null) { M.warnings.push(`The approach misses ${BODIES[body].name}’s atmosphere.`); M.finalize(); return M; }
  const tEI = tE + dtEI;
  // cruise stage separation 10 min before EI (Mars) / capsule separation (Earth return)
  const tSep = tEI - (leg.sepBefore ?? 10) * 60;
  ship.add(new ConicSeg(body, tE, tSep, rT, vT, mass, { extra: { phase: `approach to ${BODIES[body].name}` } }));
  const sS = kepProp(rT, vT, tSep - tE, mu);
  let mEntry;
  if (body === 'mars' && SC.orbiterStays) {
    M.msrOrbiter = msrOrbiterBranch(M, cfg, SC, P, tE, rT, vT, mass, tEI, leg);
    mEntry = P.massOf(SC.entry);
    ship.setConfig(tSep, 'sc', { key: 'sc', sc: SC.model, parts: ['aeroshell'] });
  } else if (body === 'mars') {
    if (SC.entry) {
      const cruiseIds = SC.orbiter.filter(id => !SC.entry.includes(id));
      const cs = M.addObj(new MObject('cruise', cfg.cruiseName || 'Cruise stage', { kind: 'stage', model: SC.model, color: '#aaa' }));
      cs.setConfig(tSep, 'sc', { key: 'sc', sc: SC.model, parts: ['cruisestage'] });
      cs.add(new ConicSeg(body, tSep, tEI + 900, sS.r, vadd(sS.v, vscale(vunit(sS.v), -0.0005)), P.massOf(cruiseIds), { extra: { phase: 'cruise stage (burns up)' } }));
      for (const id of cruiseIds) P.mods[id].attached = false;
      M.ev(tSep, 'ship', 'Cruise stage separation', 'The entry vehicle (aeroshell with rover inside) separates and turns heat-shield forward.', 'sep');
      ship.setConfig(tSep, 'sc', { key: 'sc', sc: SC.model, parts: ['aeroshell'] });
    }
    mEntry = SC.entry ? P.massOf(SC.entry) : mass;
  }
  if (body !== 'mars') {
    // Earth return capsule
    const capM = SC.usesUpperStage ? mass : P.massOf([SC.capsule]);
    if (!SC.usesUpperStage) {
      const sm = M.addObj(new MObject('sm', cfg.smName || 'Carrier spacecraft', { kind: 'stage', model: SC.model, color: '#aaa' }));
      sm.setConfig(tSep, 'sc', { key: 'sc', sc: SC.model, parts: ['service'] });
      sm.add(new ConicSeg(body, tSep, tEI + 1200, sS.r, vadd(sS.v, vscale(vunit(sS.v), -0.0008)), mass - capM, { extra: { phase: 'carrier (divert / burns up)' } }));
      ship.setConfig(tSep, 'capsule', { key: 'capsule', sc: SC.model });
      M.ev(tSep, 'ship', leg.sepName || 'Capsule separation', 'Only the heat-shielded capsule continues to atmospheric entry.', 'sep');
      mEntry = capM;
    } else mEntry = mass;
  }
  ship.add(new ConicSeg(body, tSep, tEI, sS.r, sS.v, mEntry, { extra: { phase: 'final approach' } }));
  const sE = kepProp(rT, vT, dtEI, mu);
  const vrel = vsub(sE.v, vcross(bodyOmegaEcl(body, tEI), sE.r));
  M.ev(tEI, 'ship', `Entry interface (${(rEI - R).toFixed(0)} km)`, `${body === 'mars' ? EXPLAIN.edl : EXPLAIN.entry} Speed ${vnorm(sE.v).toFixed(2)} km/s (${vnorm(vrel).toFixed(2)} km/s relative to the rotating atmosphere), flight-path angle ${fpaDeg(sE.r, sE.v).toFixed(1)}°.`, 'entry');
  progress(`${BODIES[body].name} entry, descent & landing…`);
  const site = leg.site;
  let run;
  if (body === 'mars') run = b => runMarsEDL(SC, P, tEI, sE.r, sE.v, b, site);
  else run = b => earthEntryGeneric(SC, P, tEI, sE.r, sE.v, mEntry, b);
  const missF = e => gcAngle(e.ll[0], e.ll[1], site.lat, site.lon) * R;
  const gLim = (cfg.crew || 0) > 0 ? 8 : 25;
  const cost = e => missF(e) + Math.max(0, e.maxG - gLim) * 300 + (e.landed ? 0 : 5000);
  let best = null; for (let b = 0; b <= 135; b += 9) { const e = run(b); const c = cost(e); if (!best || c < best.c) best = { b, c, e }; }
  const g = goldenMin(b => cost(run(b)), Math.max(0, best.b - 9), Math.min(150, best.b + 9), 16);
  const ent = run(g.x);
  ship.add(new SampleSeg(body, ent.samples, { phase: 'entry' }));
  for (const e of ent.events) M.ev(e.t, 'ship', e.name, e.desc, e.kind);
  M.ev(ent.tPeakHeat, 'ship', 'Peak heating', `Heat flux ≈ ${ent.maxHeat.toFixed(0)} W/cm² at the heat shield stagnation point.`, 'heat');
  M.ev(ent.tPeakG, 'ship', 'Peak deceleration', `${ent.maxG.toFixed(1)} g.`, 'gload');
  const chuteT = ent.samples.find(s => s.chute >= 1)?.t; if (chuteT) ship.setConfig(chuteT, body === 'mars' ? 'sc' : 'capsule', body === 'mars' ? { key: 'sc', sc: SC.model, parts: ['aeroshell'], chute: 1 } : { key: 'capsule', sc: SC.model, chutes: 1 });
  const pdT = ent.samples.find(s => s.phase === 'powered descent')?.t; if (pdT && body === 'mars') ship.setConfig(pdT, 'sc', { key: 'sc', sc: SC.model, parts: ['lander'], powered: true });
  if (body === 'mars' && SC.prop.lander) P.tankOf(SC.prop.lander).propLeft -= ent.propUsed;
  const miss = missF(ent);
  const landName = body === 'mars' ? (cfg.landName || 'Touchdown') : (leg.landName || 'Landing');
  M.ev(ent.t, 'ship', landName, `${body === 'mars' ? 'Touchdown on Mars' : 'Landing on Earth'} at ${ent.ll[0].toFixed(2)}°, ${ent.ll[1].toFixed(2)}° — ${miss.toFixed(1)} km from the target (${site.name}). ${body === 'mars' ? `One-way radio delay to Earth: ${(vnorm(vsub(bodyPos('mars', ent.t), bodyPos('earth', ent.t))) / C_KMS / 60).toFixed(1)} min — the landing was over before Earth heard about entry.` : ''}`, 'landing');
  M.phase(tEI, ent.t, body === 'mars' ? 'Entry, descent & landing' : 'Earth entry', '#ff5d5d');
  M.summary.entries = M.summary.entries || []; M.summary.entries.push({ body, vEI: vnorm(vrel), maxG: ent.maxG, maxHeat: ent.maxHeat, miss, ll: ent.ll, bank: g.x });
  const mLanded = ent.m;
  if (body === 'mars') {
    ship.setConfig(ent.t, 'sc', { key: 'sc', sc: SC.model, parts: ['lander'], landed: true });
    if (leg.next === 'return') return surfaceStayAndReturn(M, cfg, SC, P, ship, nodes, lam, iLeg, ent, mLanded, progress);
    for (const e of (cfg.surfaceEvents || [])) M.ev(ent.t + e.afterLanding * D, 'ship', e.name, e.desc, e.kind || 'info');
    const tEnd = ent.t + (cfg.surfaceDays ?? 3) * D;
    ship.add(new SurfaceSeg('mars', ent.t, tEnd, ent.ll[0], ent.ll[1], site.elev || 0, mLanded, { extra: { phase: 'surface operations' } }));
    M.phase(ent.t, tEnd, 'Surface operations', '#ffd166');
  } else {
    ship.add(new SurfaceSeg('earth', ent.t, ent.t + 2 * H, ent.ll[0], ent.ll[1], 0, mLanded, { extra: { phase: 'recovery' } }));
  }
  M.finalize(); return M;
}
// --------------------------------------------------------------------------
function doOrbitInsertion(M, cfg, SC, P, ship, nodes, lam, iLeg, tE, rT, vT, body, mass, tgt, progress) {
  const H = 3600, D = 86400, leg = nodes[iLeg + 1], mu = BODIES[body].mu, R = surfaceRadius(body);
  const tP = tE + timeToPeri(rT, vT, mu), sP = kepProp(rT, vT, tP - tE, mu);
  const rp = vnorm(sP.r), ra = R + leg.apo;
  const vpT = Math.sqrt(mu * (2 / rp - 2 / (rp + ra)));
  const dv = vnorm(sP.v) - vpT;
  const engId = SC.usesUpperStage ? 'upper' : SC.prop.orbiter;
  const pm = P.burn(engId, mass, dv);
  const vPost = vscale(vunit(sP.v), vnorm(sP.v) - pm.dvAch);
  ship.add(new ConicSeg(body, tE, tP - pm.dur / 2, rT, vT, mass, { extra: { phase: `approach to ${BODIES[body].name}` } }));
  ship.add(new BurnSeg(body, tP, pm.dur, sP.r, sP.v, vPost, mass, mass - pm.prop, pm.thrust, { extra: { phase: 'orbit insertion burn', stage: engId } }));
  M.burn({ name: `${body === 'mars' ? 'MOI' : 'Orbit insertion'} — capture burn`, t: tP - pm.dur / 2, dur: pm.dur, dv: pm.dvAch * 1000, engine: pm.engine, isp: pm.isp, prop: pm.prop, m0: mass, obj: 'ship', propType: pm.propType });
  M.ev(tP - pm.dur / 2, 'ship', leg.moiName || 'Mars orbit insertion', `${EXPLAIN.moi} ${fmtDur(pm.dur)} burn, Δv ${(pm.dvAch * 1000).toFixed(0)} m/s → orbit ${Math.round(rp - R)} × ${Math.round(leg.apo).toLocaleString()} km.`, 'burn');
  if (!pm.ok) M.warnings.push('Insufficient propellant for orbit insertion — the craft flies past.');
  mass -= pm.prop;
  let t = tP + pm.dur / 2; let st = kepProp(sP.r, vPost, pm.dur / 2, mu); let r = st.r, v = st.v;
  const el0 = rv2coe(r, v, mu);
  M.summary.orbit = { rp: el0.rp - R, ra: el0.ra - R, i: Math.acos(vdot(vunit(el0.h), bodyPoleEcl(body, t))) * RAD, period: el0.period };
  for (const e of (leg.events || [])) M.ev(tP + (e.dt || 0) * D, 'ship', e.name, e.desc, e.kind || 'photo');
  // optional orbit lowering (period change)
  if (leg.trim) {
    const tT = t + leg.trim.after * D;
    const n = Math.round((tT - t) / el0.period); const tA = t + (n + 0.5) * el0.period; // at an apoapsis
    ship.add(new ConicSeg(body, t, tA, r, v, mass, { extra: { phase: 'capture orbit' } }));
    const sA = kepProp(r, v, tA - t, mu);
    // at apoapsis: change periapsis (and plane) to target
    const rA = vnorm(sA.r);
    const newRp = R + leg.trim.peri, aN = (rA + newRp) / 2;
    let hN = vunit(vcross(sA.r, sA.v));
    if (leg.trim.incl != null) {
      const pole = bodyPoleEcl(body, tA), rh = vunit(sA.r);
      // rotate plane about radius vector to reach inclination
      const f = th => Math.acos(clamp(vdot(vrot(hN, rh, th), pole), -1, 1)) * RAD - leg.trim.incl;
      const g2 = goldenMin(th => Math.abs(f(th)), -Math.PI, Math.PI, 60); hN = vrot(hN, rh, g2.x);
    }
    const vA = Math.sqrt(mu * (2 / rA - 1 / aN));
    const vNew = vscale(vunit(vcross(hN, vunit(sA.r))), vA);
    const dvv = vsub(vNew, sA.v), pmt = P.burn(engId, mass, vnorm(dvv));
    ship.add(new BurnSeg(body, tA, Math.max(pmt.dur, 1), sA.r, sA.v, vNew, mass, mass - pmt.prop, pmt.thrust, { extra: { phase: 'orbit trim' } }));
    M.burn({ name: 'Orbit change at apoapsis', t: tA, dur: pmt.dur, dv: vnorm(dvv) * 1000, engine: pmt.engine, isp: pmt.isp, prop: pmt.prop, m0: mass, obj: 'ship', propType: pmt.propType });
    M.ev(tA, 'ship', leg.trim.name || 'Orbit change at apoapsis', `${leg.trim.desc || 'Plane and periapsis changes are cheapest far from the planet, where the craft moves slowly.'} Δv ${(vnorm(dvv) * 1000).toFixed(0)} m/s.`, 'burn');
    mass -= pmt.prop; t = tA + Math.max(pmt.dur, 1) / 2; st = kepProp(sA.r, vNew, Math.max(pmt.dur, 1) / 2, mu); r = st.r; v = st.v;
  }
  if (leg.next === 'land') return orbitThenLand(M, cfg, SC, P, ship, nodes, lam, iLeg, t, r, v, body, mass, progress);
  if (leg.next === 'return') return orbitStayAndReturn(M, cfg, SC, P, ship, nodes, lam, iLeg, t, r, v, body, mass, progress);
  const tEnd = t + (cfg.orbitDays ?? 30) * D;
  ship.add(new ConicSeg(body, t, tEnd, r, v, mass, { extra: { phase: `${BODIES[body].name} orbit` } }));
  M.phase(t, tEnd, `${BODIES[body].name} orbit`, '#43aa8b');
  M.finalize(); return M;
}
// --------------------------------------------------------------------------
// Orbit → deorbit → EDL (Tianwen-1 style): parking orbit designed backward from the landing
function orbitThenLand(M, cfg, SC, P, ship, nodes, lam, iLeg, t, r, v, body, mass, progress) {
  const H = 3600, D = 86400, leg = nodes[iLeg + 1], mu = BODIES[body].mu, R = surfaceRadius(body);
  const site = leg.site, tLand = isoToT(leg.tLand);
  progress('Designing the descent from orbit…');
  // reference EDL from a typical orbital entry (4.8 km/s, -11°) for range/duration
  const ref = marsEntryRef(SC, P, 4.8, leg.entryFpa ?? -11.5, 30);
  // deorbit orbit: periapsis below the surface so that entry happens at fpa; apoapsis = current apoapsis
  const el = rv2coe(r, v, mu); const ra = leg.parkApo ? R + leg.parkApo : el.ra;
  const rEI = R + 125, g = (leg.entryFpa ?? -11.5) * DEG;
  // choose periapsis radius so fpa at EI = g on an ellipse with apoapsis ra
  const fpaAt = rpx => { const a = (ra + rpx) / 2, e = (ra - rpx) / (ra + rpx), p = a * (1 - e * e); const vE = Math.sqrt(mu * (2 / rEI - 1 / a)); const h = Math.sqrt(mu * p); return -Math.acos(clamp(h / (rEI * vE), -1, 1)); };
  const rpD = bisectRoot(rpx => fpaAt(rpx) - g, 0.2 * R, rEI - 1) ?? R * 0.9;
  // landing geometry in inertial space: plane containing site at landing; EI point = site rotated back by range
  const sL = vunit(sitePosEcl(body, site.lat, site.lon, site.elev || 0, tLand));
  let hO = vunit(el.h);
  // plane: rotate current plane minimally so that it contains the site at landing
  let hD = vunit(vsub(hO, vscale(sL, vdot(hO, sL))));
  const eiDir = vrot(sL, hD, -ref.range);
  const aD = (ra + rpD) / 2, eD = (ra - rpD) / (ra + rpD), pD = aD * (1 - eD * eD);
  const nuEI = -Math.acos(clamp((pD / rEI - 1) / eD, -1, 1));
  const periDir = vrot(eiDir, hD, -nuEI);
  const apoDir = vscale(periDir, -1);
  const tEI = tLand - ref.dur;
  const Fq = 2 * Math.atan(Math.sqrt((1 - eD) / (1 + eD)) * Math.tan(nuEI / 2)); const Mq = Fq - eD * Math.sin(Fq);
  const nD = Math.sqrt(mu / (aD * aD * aD)), tPeriD = tEI - Mq / nD; // Mq negative
  const tApoD = tPeriD - Math.PI / nD;
  // state at deorbit point (apoapsis of deorbit orbit)
  const vApoD = Math.sqrt(mu * (2 / ra - 1 / aD));
  const rDeo = vscale(apoDir, ra), vDeoAfter = vscale(vunit(vcross(hD, apoDir)), vApoD);
  // parking orbit = same apoapsis point, periapsis R+parkPeri, same plane hD, reached by a Lambert transfer from current orbit
  const rpPark = R + (leg.parkPeri ?? 280);
  const aP = (ra + rpPark) / 2, vApoP = Math.sqrt(mu * (2 / ra - 1 / aP));
  const vDeoBefore = vscale(vunit(vcross(hD, apoDir)), vApoP);
  const perP = 2 * Math.PI * Math.sqrt(aP * aP * aP / mu);
  const nRev = Math.max(1, Math.floor((tApoD - t - 3 * D) / perP));
  const tJoin = tApoD - nRev * perP; // parking orbit apoapsis time (state rDeo, vDeoBefore)
  // Lambert from current orbit (depart at an apoapsis passage) to the parking orbit state at tJoin + half period (its periapsis) — choose min Δv
  let best = null;
  const per0 = el.period;
  // depart near capture-orbit apoapsis passages, arrive at parking-orbit apoapsis passages (slow → cheap)
  const tApo0 = t + timeToPeri(r, v, mu) + per0 / 2;
  const deps = [t + 600]; for (let j = -1; j < 4; j++) { const td = tApo0 + j * per0; if (td > t + 600) deps.push(td); }
  for (const tDepT of deps) {
    if (tDepT > tApoD - 2 * D) continue;
    const s0 = kepProp(r, v, tDepT - t, mu);
    for (let k = 0; k < 200; k++) {
      const tArrT = tApoD - k * perP; if (tArrT < tDepT + 1 * D) break; if (tArrT > tDepT + 30 * D) continue;
      for (const off of [-0.2, 0, 0.2]) {
        const ta = tArrT + off * perP;
        const sJ = kepProp(rDeo, vDeoBefore, ta - tApoD, mu);
        const Lb = lambert(s0.r, sJ.r, ta - tDepT, mu, vunit(vcross(s0.r, s0.v))); if (!Lb) continue;
        const tot = vnorm(vsub(Lb.v1, s0.v)) + vnorm(vsub(sJ.v, Lb.v2));
        if (!best || tot < best.tot) best = { tot, tDepT, tArrT: ta, s0, sJ, Lb };
      }
    }
  }
  if (best) { best.tJoinRef = tApoD; }
  const engO = SC.prop.orbiter;
  if (best) {
    ship.add(new ConicSeg(body, t, best.tDepT, r, v, mass, { extra: { phase: 'capture orbit' } }));
    const dv1 = vsub(best.Lb.v1, best.s0.v), p1 = P.burn(engO, mass, vnorm(dv1));
    ship.add(new BurnSeg(body, best.tDepT, Math.max(p1.dur, 1), best.s0.r, best.s0.v, best.Lb.v1, mass, mass - p1.prop, p1.thrust, { extra: { phase: 'orbit change' } }));
    M.burn({ name: 'Orbit change 1 (toward parking orbit)', t: best.tDepT, dur: p1.dur, dv: vnorm(dv1) * 1000, engine: p1.engine, isp: p1.isp, prop: p1.prop, m0: mass, obj: 'ship', propType: p1.propType });
    M.ev(best.tDepT, 'ship', 'Orbit change toward the parking orbit', `Two-impulse transfer into a parking orbit whose ground track passes over the landing site on landing day. Δv ${(vnorm(dv1) * 1000).toFixed(0)} m/s.`, 'burn');
    mass -= p1.prop;
    const tb = best.tDepT + Math.max(p1.dur, 1) / 2; const sb = kepProp(best.s0.r, best.Lb.v1, Math.max(p1.dur, 1) / 2, mu);
    ship.add(new ConicSeg(body, tb, best.tArrT, sb.r, sb.v, mass, { extra: { phase: 'transfer orbit' } }));
    const sA2 = kepProp(best.s0.r, best.Lb.v1, best.tArrT - best.tDepT, mu);
    const dv2 = vsub(best.sJ.v, sA2.v), p2 = P.burn(engO, mass, vnorm(dv2));
    ship.add(new BurnSeg(body, best.tArrT, Math.max(p2.dur, 1), sA2.r, sA2.v, best.sJ.v, mass, mass - p2.prop, p2.thrust, { extra: { phase: 'orbit change' } }));
    M.burn({ name: 'Orbit change 2 (parking orbit)', t: best.tArrT, dur: p2.dur, dv: vnorm(dv2) * 1000, engine: p2.engine, isp: p2.isp, prop: p2.prop, m0: mass, obj: 'ship', propType: p2.propType });
    M.ev(best.tArrT, 'ship', 'Parking orbit', `Orbit ${Math.round(rpPark - R)} × ${Math.round(ra - R).toLocaleString()} km. The lander will be released from here. Δv ${(vnorm(dv2) * 1000).toFixed(0)} m/s.`, 'burn');
    mass -= p2.prop;
    const tc = best.tArrT + Math.max(p2.dur, 1) / 2, sc2 = kepProp(best.sJ.r, best.sJ.v, Math.max(p2.dur, 1) / 2, mu);
    ship.add(new ConicSeg(body, tc, tApoD, sc2.r, sc2.v, mass, { extra: { phase: 'parking orbit (reconnaissance of landing site)' } }));
    M.phase(t, tApoD, `${BODIES[body].name} orbit`, '#43aa8b');
  } else { ship.add(new ConicSeg(body, t, tApoD, rDeo, vDeoBefore, mass, { extra: { phase: 'parking orbit' } })); M.warnings.push('Could not find an orbit-change sequence; showing the parking orbit directly.'); }
  for (const e of (leg.orbitEvents || [])) M.ev(isoToT(e.t), 'ship', e.name, e.desc, e.kind || 'photo');
  // deorbit at apoapsis: lower periapsis into atmosphere, then capsule separates; orbiter raises periapsis again
  const dvD = vsub(vDeoAfter, vDeoBefore), pD2 = P.burn(engO, mass, vnorm(dvD));
  ship.add(new BurnSeg(body, tApoD, Math.max(pD2.dur, 1), rDeo, vDeoBefore, vDeoAfter, mass, mass - pD2.prop, pD2.thrust, { extra: { phase: 'deorbit burn' } }));
  M.burn({ name: 'Deorbit burn', t: tApoD, dur: pD2.dur, dv: vnorm(dvD) * 1000, engine: pD2.engine, isp: pD2.isp, prop: pD2.prop, m0: mass, obj: 'ship', propType: pD2.propType });
  M.ev(tApoD, 'ship', 'Deorbit manoeuvre', `At apoapsis the stack lowers its periapsis into the atmosphere (Δv ${(vnorm(dvD) * 1000).toFixed(0)} m/s).`, 'burn');
  mass -= pD2.prop;
  const tRel = tEI - 3 * H;
  const t1 = tApoD + Math.max(pD2.dur, 1) / 2, s1 = kepProp(rDeo, vDeoAfter, Math.max(pD2.dur, 1) / 2, mu);
  ship.add(new ConicSeg(body, t1, tRel, s1.r, s1.v, mass, { extra: { phase: 'descent orbit' } }));
  const sR = kepProp(rDeo, vDeoAfter, tRel - tApoD, mu);
  // orbiter separates and raises periapsis
  const orb = M.addObj(new MObject('orbiter', cfg.orbiterName || 'Orbiter', { model: SC.model, color: '#7fd1ff' }));
  orb.setConfig(tRel, 'sc', { key: 'sc', sc: SC.model, parts: ['orbiter'] });
  const mOrb = P.massOf(SC.orbiter);
  const vUp = vadd(sR.v, vscale(vunit(sR.v), 0.03));
  orb.add(new ConicSeg(body, tRel, tLand + 5 * D, sR.r, vUp, mOrb, { extra: { phase: 'orbiter (relay)' } }));
  M.ev(tRel, 'orbiter', 'Lander separation', 'The entry capsule separates; the orbiter raises its periapsis back to stay in orbit as a radio relay.', 'sep');
  const mEntry = P.massOf(SC.entry);
  ship.setConfig(tRel, 'sc', { key: 'sc', sc: SC.model, parts: ['aeroshell'] });
  const dtE = timeToRadius(sR.r, sR.v, mu, rEI, false);
  const tEIa = tRel + dtE, sEI = kepProp(sR.r, sR.v, dtE, mu);
  ship.add(new ConicSeg(body, tRel, tEIa, sR.r, sR.v, mEntry, { extra: { phase: 'entry capsule coast' } }));
  M.ev(tEIa, 'ship', 'Entry interface (125 km)', `${EXPLAIN.edl} Speed ${vnorm(sEI.v).toFixed(2)} km/s, flight-path angle ${fpaDeg(sEI.r, sEI.v).toFixed(1)}°.`, 'entry');
  progress('Entry, descent & landing…');
  const run = b => runMarsEDL(SC, P, tEIa, sEI.r, sEI.v, b, site);
  const missF = e => gcAngle(e.ll[0], e.ll[1], site.lat, site.lon) * R;
  let bb = null; for (let b = 0; b <= 135; b += 9) { const e = run(b); const c = missF(e) + (e.landed ? 0 : 5000); if (!bb || c < bb.c) bb = { b, c }; }
  const gg = goldenMin(b => { const e = run(b); return missF(e) + (e.landed ? 0 : 5000); }, Math.max(0, bb.b - 9), Math.min(150, bb.b + 9), 14);
  const ent = run(gg.x);
  ship.add(new SampleSeg(body, ent.samples, { phase: 'entry' }));
  for (const e of ent.events) M.ev(e.t, 'ship', e.name, e.desc, e.kind);
  M.ev(ent.tPeakHeat, 'ship', 'Peak heating', `Heat flux ≈ ${ent.maxHeat.toFixed(0)} W/cm².`, 'heat');
  const pdT = ent.samples.find(s => s.phase === 'powered descent')?.t; if (pdT) ship.setConfig(pdT, 'sc', { key: 'sc', sc: SC.model, parts: ['lander'], powered: true });
  const chT = ent.samples.find(s => s.chute >= 1)?.t; if (chT) ship.setConfig(chT, 'sc', { key: 'sc', sc: SC.model, parts: ['aeroshell'], chute: 1 });
  const miss = missF(ent);
  M.ev(ent.t, 'ship', cfg.landName || 'Touchdown', `Touchdown at ${ent.ll[0].toFixed(2)}°, ${ent.ll[1].toFixed(2)}° — ${miss.toFixed(1)} km from the target (${site.name}).`, 'landing');
  ship.setConfig(ent.t, 'sc', { key: 'sc', sc: SC.model, parts: ['lander'], landed: true });
  const tEnd = ent.t + (cfg.surfaceDays ?? 5) * D;
  ship.add(new SurfaceSeg('mars', ent.t, tEnd, ent.ll[0], ent.ll[1], site.elev || 0, ent.m, { extra: { phase: 'surface operations' } }));
  for (const e of (cfg.surfaceEvents || [])) M.ev(ent.t + e.afterLanding * D, 'ship', e.name, e.desc, e.kind || 'info');
  M.phase(tEIa, ent.t, 'Entry, descent & landing', '#ff5d5d');
  M.phase(ent.t, tEnd, 'Surface operations', '#ffd166');
  M.summary.entries = [{ body, vEI: vnorm(sEI.v), maxG: ent.maxG, maxHeat: ent.maxHeat, miss, ll: ent.ll }];
  M.finalize(); return M;
}
// --------------------------------------------------------------------------
// Surface stay → ascent → (rendezvous) → Earth return
function surfaceStayAndReturn(M, cfg, SC, P, ship, nodes, lam, iLeg, ent, mLanded, progress) {
  const H = 3600, D = 86400, body = 'mars', mu = BODIES.mars.mu, R = surfaceRadius('mars');
  const leg = nodes[iLeg + 1], ret = nodes[iLeg + 2];
  const site = { lat: ent.ll[0], lon: ent.ll[1], elev: leg.site.elev || 0 };
  const tDepM = ret.departMars ? isoToT(ret.departMars) : ent.t + (cfg.surfaceDays ?? 450) * D;
  // heliocentric return Lambert
  const pa = planetHelio('mars', tDepM), pb = planetHelio('earth', ret.t);
  const Lr = lambert(pa.r, pb.r, ret.t - tDepM, MU_SUN, [0, 0, 1]);
  const vinfOut = vsub(Lr.v1, pa.v);
  // ascent target: low Mars orbit in plane containing v∞ and the site at liftoff
  const hLMO = cfg.lmoAlt ?? 300;
  // liftoff time: plane through site containing v∞; departure periapsis reachable after short coast
  let tLiftNom = tDepM - (cfg.ascentLead ?? 6) * H;
  let plane = planeThroughSite('mars', site.lat, site.lon, tLiftNom, vunit(vinfOut));
  if (M.msrOrbiter) { // launch when the site passes under the orbiter's orbit plane
    const o = M.msrOrbiter, hO = vunit(vcross(o.r, o.v));
    tLiftNom = isoToT(ret.mavLaunch || fmtUTC(ent.t + (cfg.surfaceDays ?? 300) * D).replace(' ', 'T') + 'Z');
    const f = tt => vdot(vunit(sitePosEcl('mars', site.lat, site.lon, 0, tt)), hO);
    let tl = null; for (let tt = tLiftNom; tt < tLiftNom + 2 * D; tt += 600) { if (f(tt) * f(tt + 600) <= 0) { tl = bisectRoot(f, tt, tt + 600, 50); break; } }
    if (tl) tLiftNom = tl; plane = { n: hO, az: 0 };
  }
  // surface stay segment (ISRU for Starship)
  const mProd = cfg.isru ? cfg.isru.to : 0;
  if (cfg.isru) { M.ev(ent.t + 3 * D, 'ship', 'ISRU propellant plant starts', `Solar-powered Sabatier reactors turn Martian CO₂ and water ice into methane and oxygen: CO₂ + 4H₂ → CH₄ + 2H₂O. Target: ${(cfg.isru.to / 1000).toFixed(0)} t of propellant before the return window.`, 'isru'); }
  const surf = new SurfaceSeg('mars', ent.t, tLiftNom, site.lat, site.lon, site.elev, mLanded, { extra: { phase: cfg.isru ? 'surface stay — making propellant' : 'surface operations' } });
  if (cfg.isru) { surf.m0 = mLanded; surf.m1 = mLanded + mProd; }
  ship.add(surf);
  M.phase(ent.t, tLiftNom, 'Surface stay', '#ffd166');
  for (const e of (cfg.surfaceEvents || [])) M.ev(ent.t + e.afterLanding * D, 'ship', e.name, e.desc, e.kind || 'info');
  // ascent vehicle
  let stack, ascName, stageId;
  if (SC.usesUpperStage) {
    P.upper.propLeft = cfg.isru.to; P.upper.attached = true;
    stageId = 'upper';
    stack = { name: 'Ship', payload: P.massOf(SC.orbiter), stages: [{ id: 'Ship', name: 'Ship', prop: 'methalox', engine: P.upper.engine, n: 6, thrustSL: P.upper.thrustSL, thrustVac: P.upper.thrustVac, ispSL: P.upper.ispSL, ispVac: P.upper.ispVac, dry: P.upper.dry, propMass: P.upper.propLeft, propLeft: P.upper.propLeft, attached: true, ignited: false, geom: [[50, 4.5, 4.5, '#bbb']] }], jettison: [] };
    ascName = 'Mars liftoff';
  } else {
    const asId = SC.prop.ascender, e = P.engineOf(asId), tk = P.tankOf(asId);
    stageId = asId;
    stack = { name: 'MAV', payload: cfg.samples || 1, stages: [{ id: 'MAV', name: tk.name, prop: 'solid', engine: e.name, n: 1, thrustSL: e.thrust * 0.9, thrustVac: e.thrust, ispSL: e.isp * 0.9, ispVac: e.isp, dry: tk.dry, propMass: tk.propLeft, propLeft: tk.propLeft, attached: true, ignited: false, geom: [[3, 0.3, 0.3, '#ddd']] }], jettison: [] };
    ascName = 'Mars Ascent Vehicle launch';
  }
  progress('Mars ascent…');
  const AS = SC.usesUpperStage ? simulateAscent({ body: 'mars', t0: tLiftNom, lat: site.lat, lon: site.lon, siteElev: site.elev, stack, target: { normal: plane.n, hp: Math.min(110, hLMO), ha: hLMO }, vert: 6, kick: 10, closedLoopAt: 25, dt: 0.2, maxTime: 1500, sampleDt: 1 })
    : simulateTwoBurnAscent({ body: 'mars', t0: tLiftNom, lat: site.lat, lon: site.lon, siteElev: site.elev, stack, target: { normal: plane.n, hp: hLMO, ha: hLMO }, vert: 3 });
  const used = stack.stages[0].propMass - AS.stack.stages[0].propLeft;
  P.tankOf(stageId).propLeft -= used;
  ship.setConfig(tLiftNom, 'sc', { key: 'sc', sc: SC.model, parts: SC.usesUpperStage ? ['ship'] : ['mav'] });
  ship.add(new SampleSeg('mars', AS.samples.map(s => ({ ...s, phase: 'Mars ascent' })), { phase: 'Mars ascent' }));
  const dvAsc = dvForProp(stack.stages[0].dry + stack.stages[0].propMass + stack.payload, used, stack.stages[0].ispVac) * 1000;
  M.burn({ name: ascName, t: tLiftNom, dur: AS.t - tLiftNom, dv: dvAsc, engine: stack.stages[0].engine, isp: stack.stages[0].ispVac, prop: used, m0: stack.stages[0].dry + stack.stages[0].propMass + stack.payload, obj: 'ship', propType: SC.usesUpperStage ? 'methalox' : 'solid' });
  M.ev(tLiftNom, 'ship', ascName, `Liftoff from Mars: gravity 3.71 m/s², low-orbit speed only ≈3.4 km/s (vs 7.8 km/s at Earth). Δv ≈ ${dvAsc.toFixed(0)} m/s into a ${Math.min(110, hLMO)} × ${hLMO} km orbit.`, 'launch');
  if (!AS.ok) M.warnings.push('Mars ascent did not reach orbit.');
  for (const e of AS.events) if (e.kind === 'insertion') M.ev(e.t, 'ship', 'Mars orbit insertion (ascent)', e.desc, 'insertion');
  let t = AS.t, r = AS.r, v = AS.v, mass = AS.m;
  M.phase(tLiftNom, AS.t, 'Mars ascent', '#06d6a0');
  if (!SC.usesUpperStage && M.msrOrbiter) {
    ship.setConfig(AS.t, 'sc', { key: 'sc', sc: SC.model, parts: ['os'] });
    return msrRendezvousAndReturn(M, cfg, SC, P, M.msrOrbiter, ship, AS, site, nodes, iLeg, ret, vinfOut, tDepM, progress);
  }
  // TEI from LMO
  return departPlanet(M, cfg, SC, P, ship, t, r, v, 'mars', mass, vinfOut, tDepM, ret, progress);
}
function orbitStayAndReturn(M, cfg, SC, P, ship, nodes, lam, iLeg, t, r, v, body, mass, progress) {
  const H = 3600, D = 86400, leg = nodes[iLeg + 1], ret = nodes[iLeg + 2];
  const tDepM = ret.departMars ? isoToT(ret.departMars) : t + (cfg.orbitDays ?? 30) * D;
  const pa = planetHelio(body, tDepM), pb = planetHelio('earth', ret.t);
  const Lr = lambert(pa.r, pb.r, ret.t - tDepM, MU_SUN, [0, 0, 1]);
  const vinfOut = vsub(Lr.v1, pa.v);
  for (const e of (leg.orbitEvents || [])) M.ev(t + e.afterArrival * D, 'ship', e.name, e.desc, e.kind || 'photo');
  return departPlanet(M, cfg, SC, P, ship, t, r, v, body, mass, vinfOut, tDepM, ret, progress, true);
}
// departure from planetary orbit toward Earth, with patched-conic targeting of the Earth entry
function departPlanet(M, cfg, SC, P, ship, t, r, v, body, mass, vinfOut, tDepNom, ret, progress, fromHighOrbit) {
  const H = 3600, D = 86400, mu = BODIES[body].mu, R = surfaceRadius(body);
  progress('Trans-Earth injection targeting…');
  const el = rv2coe(r, v, mu);
  // find TEI point: minimise impulsive Δv to reach the outgoing asymptote, over the orbit before nominal departure
  const per = el.period;
  const dvAt = (tb) => {
    const s = kepProp(r, v, tb - t, mu), rn = vnorm(s.r);
    const hh = vunit(vcross(s.r, s.v));
    // hyperbola through s.r with asymptote along vinfOut (projected into a plane containing r and v∞)
    const Sx = vunit(vinfOut); let hq = vunit(vcross(s.r, Sx)); if (vdot(hq, hh) < 0) hq = vscale(hq, -1);
    const thr = Math.atan2(vdot(vcross(vunit(s.r), Sx), hq), vdot(vunit(s.r), Sx)); // angle from r to asymptote
    const vi = vnorm(vinfOut);
    const f = e => { const nuI = Math.acos(-1 / e); const nuR = nuI - thr; const p = (e * e - 1) * mu / (vi * vi); return rn * (1 + e * Math.cos(nuR)) - p; };
    const e = bisectRoot(f, 1.0001, 50) ?? 1.5; const nuI = Math.acos(-1 / e), nuR = nuI - thr, p = (e * e - 1) * mu / (vi * vi);
    const vr = Math.sqrt(mu / p) * e * Math.sin(nuR), vt = Math.sqrt(mu / p) * (1 + e * Math.cos(nuR));
    const vNeed = vadd(vscale(vunit(s.r), vr), vscale(vunit(vcross(hq, s.r)), vt));
    return { tb, s, vNeed, dv: vnorm(vsub(vNeed, s.v)) };
  };
  let best = null;
  const tStart = Math.max(t + 0.3 * H, tDepNom - per * 1.5);
  for (let tb = tStart; tb < tStart + per * 2; tb += per / 90) { const o = dvAt(tb); if (!best || o.dv < best.dv) best = o; }
  const gm = goldenMin(tb => dvAt(tb).dv, best.tb - per / 90, best.tb + per / 90, 30); best = dvAt(gm.x);
  const tTEI = best.tb, sTEI = best.s;
  // Earth arrival target (entry)
  const retLeg = { ...ret, type: 'entry', body: 'earth' };
  const Lret = lambert(bodyPos(body, tTEI), bodyPos('earth', ret.t), ret.t - tTEI, MU_SUN, [0, 0, 1]) || lambert(bodyPos(body, tDepNom), bodyPos('earth', ret.t), ret.t - tDepNom, MU_SUN, [0, 0, 1]);
  let tgt = arrivalTarget(cfg, retLeg, vsub(Lret.v2, planetHelio('earth', ret.t).v), ret.t, SC, P, M);
  const F = x => { const o = patchedLeg(tTEI, sTEI.r, vadd(best.vNeed, x), body, 'earth', ret.t); if (!o || o.miss || !o.bv) return [1e3, 1e3, 1e3]; const ax = bPlaneAxes(o.bv.S); return [(vdot(o.bv.B, ax.T) - vdot(tgt.B, ax.T)) / 1000, (vdot(o.bv.B, ax.R) - vdot(tgt.B, ax.R)) / 1000, (o.tp - tgt.tp) / H / 2]; };
  const s1 = newtonSolve(x => vscale(centreMiss(tTEI, sTEI.r, vadd(best.vNeed, x), body, 'earth', tgt.tp), 1e-4), [0, 0, 0], { h: 1e-7, tol: 1e-3, maxIt: 30, maxStep: 0.1 });
  let sol = newtonSolve(F, s1.x, { h: 1e-7, tol: 1e-3, maxIt: 30, maxStep: 0.05 });
  for (let k = 0; k < 2; k++) { const o = patchedLeg(tTEI, sTEI.r, vadd(best.vNeed, sol.x), body, 'earth', ret.t); if (!o || o.miss) break; tgt = arrivalTarget(cfg, retLeg, vscale(o.bv.S, o.bv.vinf), o.tp, SC, P, M); sol = newtonSolve(F, sol.x, { h: 1e-7, tol: 1e-3, maxIt: 30, maxStep: 0.05 }); }
  if (!sol.ok) M.warnings.push(`Earth-return targeting converged approximately (residual ${sol.norm.toFixed(2)}).`);
  const vPost = vadd(best.vNeed, sol.x), dvv = vsub(vPost, sTEI.v);
  const engId = SC.usesUpperStage ? 'upper' : SC.prop.orbiter;
  const pm = P.burn(engId, mass, vnorm(dvv));
  ship.add(new ConicSeg(body, t, tTEI - pm.dur / 2, r, v, mass, { extra: { phase: `${BODIES[body].name} orbit` } }));
  ship.add(new BurnSeg(body, tTEI, pm.dur, sTEI.r, sTEI.v, vadd(sTEI.v, vscale(dvv, pm.dvAch / vnorm(dvv))), mass, mass - pm.prop, pm.thrust, { extra: { phase: 'trans-Earth injection', stage: engId } }));
  M.burn({ name: 'TEI — trans-Earth injection', t: tTEI - pm.dur / 2, dur: pm.dur, dv: pm.dvAch * 1000, engine: pm.engine, isp: pm.isp, prop: pm.prop, m0: mass, obj: 'ship', propType: pm.propType });
  M.ev(tTEI - pm.dur / 2, 'ship', 'Trans-Earth injection', `Escape burn toward Earth: v∞ = ${vnorm(vinfOut).toFixed(2)} km/s. Δv ${(pm.dvAch * 1000).toFixed(0)} m/s.`, 'burn');
  if (!pm.ok) M.warnings.push('Insufficient propellant for trans-Earth injection.');
  M.phase(t - 2 * H, tTEI, `${BODIES[body].name} orbit`, '#43aa8b');
  mass -= pm.prop;
  const tPost = tTEI + pm.dur / 2, sP = kepProp(sTEI.r, vadd(sTEI.v, vscale(dvv, pm.dvAch / vnorm(dvv))), pm.dur / 2, mu);
  const nodes2 = [{ body, t: tTEI }, retLeg];
  return cruiseAndArrive(M, cfg, SC, P, ship, nodes2, [{}], 0, tPost, sP.r, sP.v, body, mass, tgt, progress);
}
// --------------------------------------------------------------------------
// porkchop: departure/arrival grid → C3 (km²/s²) and arrival v∞ (km/s)
function porkchop(from, to, tDep0, tDep1, tof0, tof1, nx = 60, ny = 60) {
  const out = { nx, ny, tDep0, tDep1, tof0, tof1, c3: new Float32Array(nx * ny), vinf: new Float32Array(nx * ny) };
  for (let i = 0; i < nx; i++) {
    const td = tDep0 + (tDep1 - tDep0) * i / (nx - 1), a = planetHelio(from, td);
    for (let j = 0; j < ny; j++) {
      const tof = tof0 + (tof1 - tof0) * j / (ny - 1), b = planetHelio(to, td + tof);
      const L = lambert(a.r, b.r, tof, MU_SUN, [0, 0, 1]);
      if (!L) { out.c3[j * nx + i] = NaN; out.vinf[j * nx + i] = NaN; continue; }
      const d = vsub(L.v1, a.v), e = vsub(L.v2, b.v);
      out.c3[j * nx + i] = vdot(d, d); out.vinf[j * nx + i] = vnorm(e);
    }
  }
  return out;
}
function bestTransfer(from, to, tDep0, tDep1, tof0, tof1, wArr = 1) {
  const f = x => { const td = x[0], tof = x[1]; if (tof < tof0 || tof > tof1 || td < tDep0 || td > tDep1) return 1e9; const a = planetHelio(from, td), b = planetHelio(to, td + tof); const L = lambert(a.r, b.r, tof, MU_SUN, [0, 0, 1]); if (!L) return 1e9; const d = vsub(L.v1, a.v), e = vsub(L.v2, b.v); return vdot(d, d) + wArr * vdot(e, e); };
  let best = null;
  for (let i = 0; i <= 30; i++) for (let j = 0; j <= 30; j++) { const x = [tDep0 + (tDep1 - tDep0) * i / 30, tof0 + (tof1 - tof0) * j / 30]; const v = f(x); if (!best || v < best.v) best = { x, v }; }
  const nm = nelderMead(f, best.x, [(tDep1 - tDep0) / 30, (tof1 - tof0) / 30], { maxIt: 200, tol: 1e-10 });
  const td = nm.x[0], tof = nm.x[1], a = planetHelio(from, td), b = planetHelio(to, td + tof); const L = lambert(a.r, b.r, tof, MU_SUN, [0, 0, 1]);
  return { tDep: td, tArr: td + tof, tof, c3: vdot(vsub(L.v1, a.v), vsub(L.v1, a.v)), vinfArr: vnorm(vsub(L.v2, b.v)) };
}

// ---------------------------------------------------------------------------
// Sample-return orbiter: separates on approach, diverts, captures, aerobrakes to a low orbit and waits
function msrOrbiterBranch(M, cfg, SC, P, tE, rT, vT, massStack, tEI, leg) {
  const H = 3600, D = 86400, mu = BODIES.mars.mu, R = surfaceRadius('mars');
  const tSep = tEI - (cfg.orbiterSepDays ?? 2) * D;
  const tSepAbs = Math.max(tSep, tE + 600);
  const sS = kepProp(rT, vT, tSepAbs - tE, mu);
  const orb = M.addObj(new MObject('orbiter', cfg.orbiterName || 'Earth-return orbiter', { model: SC.model, color: '#7fd1ff', primary: false }));
  orb.setConfig(tSepAbs, 'sc', { key: 'sc', sc: SC.model, parts: ['orbiter'] });
  const engId = SC.prop.orbiter; let m = P.massOf(SC.orbiter);
  // divert: raise periapsis to R + capPeri while keeping plane
  const rpT = R + (cfg.capPeri ?? 400);
  const elA = rv2coe(sS.r, sS.v, mu); const S = vunit(bVector(sS.r, sS.v, mu).S), hh = vunit(elA.h);
  const Bt = vscale(vunit(vcross(S, hh)), bFromRp(rpT, Math.sqrt(2 * elA.energy), mu));
  const F = x => { const v2 = vadd(sS.v, x); const bv = bVector(sS.r, v2, mu); if (!bv) return [1e3, 1e3]; const ax = bPlaneAxes(bv.S); return [(vdot(bv.B, ax.T) - vdot(Bt, ax.T)) / 100, (vdot(bv.B, ax.R) - vdot(Bt, ax.R)) / 100]; };
  const so = newtonSolve(F, [0, 0, 0], { h: 1e-7, tol: 1e-4, maxIt: 30 });
  const pd = P.burn(engId, m, vnorm(so.x)); m -= pd.prop;
  M.burn({ name: 'Orbiter divert manoeuvre', t: tSepAbs, dur: pd.dur, dv: vnorm(so.x) * 1000, engine: pd.engine, isp: pd.isp, prop: pd.prop, m0: m + pd.prop, obj: 'orbiter', propType: pd.propType });
  M.ev(tSepAbs, 'orbiter', 'Lander / orbiter separation', `The entry capsule continues toward the atmosphere; the orbiter diverts (Δv ${(vnorm(so.x) * 1000).toFixed(1)} m/s) to pass ${cfg.capPeri ?? 400} km above Mars instead.`, 'sep');
  const v1 = vadd(sS.v, so.x);
  const tP = tSepAbs + timeToPeri(sS.r, v1, mu), sP = kepProp(sS.r, v1, tP - tSepAbs, mu);
  const ra = R + (cfg.capApo ?? 40000), rp = vnorm(sP.r);
  const vp = Math.sqrt(mu * (2 / rp - 2 / (rp + ra))), dvM = vnorm(sP.v) - vp;
  const pm = P.burn(engId, m, dvM);
  const vPost = vscale(vunit(sP.v), vnorm(sP.v) - pm.dvAch);
  orb.add(new ConicSeg('mars', tSepAbs, tP - pm.dur / 2, sS.r, v1, m, { extra: { phase: 'orbiter approach' } }));
  orb.add(new BurnSeg('mars', tP, pm.dur, sP.r, sP.v, vPost, m, m - pm.prop, pm.thrust, { extra: { phase: 'orbit insertion burn' } }));
  M.burn({ name: 'Orbiter MOI — capture', t: tP - pm.dur / 2, dur: pm.dur, dv: pm.dvAch * 1000, engine: pm.engine, isp: pm.isp, prop: pm.prop, m0: m, obj: 'orbiter', propType: pm.propType });
  M.ev(tP - pm.dur / 2, 'orbiter', 'Orbiter: Mars orbit insertion', `${EXPLAIN.moi} Capture into ${cfg.capPeri ?? 400} × ${Math.round((ra - R) / 1000)},000 km. Δv ${(pm.dvAch * 1000).toFixed(0)} m/s.`, 'burn');
  m -= pm.prop;
  // aerobraking (simplified): apoapsis lowered in steps by atmospheric drag passes — no propellant
  let t = tP + pm.dur / 2, st = kepProp(sP.r, vPost, pm.dur / 2, mu), r = st.r, v = st.v;
  const steps = cfg.aerobrakeSteps ?? 8, tAB = (cfg.aerobrakeDays ?? 150) * D;
  const rLow = R + (cfg.lmoOrbiter ?? 400);
  M.ev(t + 2 * D, 'orbiter', 'Aerobraking campaign begins', `Hundreds of shallow passes through the upper atmosphere (≈110 km) gradually shrink the orbit without propellant. (Simplified here as ${steps} steps.)`, 'info');
  for (let k = 1; k <= steps; k++) {
    const tk = t + tAB / steps;
    orb.add(new ConicSeg('mars', t, tk, r, v, m, { extra: { phase: 'aerobraking' } }));
    const s2 = kepProp(r, v, tk - t, mu);
    const el = rv2coe(s2.r, s2.v, mu); const raN = el.ra + (rLow - el.ra) * (k / steps);
    // at current point, set new orbit with same periapsis direction & radius rp0, new apoapsis
    const rp0 = el.rp, aN = (rp0 + raN) / 2, eN = (raN - rp0) / (raN + rp0), pN = aN * (1 - eN * eN);
    const nu = el.nu; const vN = coe2rv(pN, eN, el.i, el.Om, el.w, nu, mu);
    r = vN.r; v = vN.v; t = tk;
  }
  // final circularisation near periapsis (small burn)
  M.ev(t, 'orbiter', 'Aerobraking complete', `Orbit lowered to about ${cfg.lmoOrbiter ?? 400} km. The orbiter waits for the orbiting sample container.`, 'info');
  return { obj: orb, t, r, v, m, engId };
}
function msrRendezvousAndReturn(M, cfg, SC, P, orbInfo, mavObj, AS, site, nodes, iLeg, ret, vinfOut, tDepM, progress) {
  const H = 3600, D = 86400, mu = BODIES.mars.mu;
  const orb = orbInfo.obj;
  // MAV orbit (sample container) propagates; orbiter intercepts via Lambert
  const tI = AS.t, osR = AS.r, osV = AS.v;
  if (globalThis.DEBUG) { const hO = vunit(vcross(orbInfo.r, orbInfo.v)), hS = vunit(vcross(osR, osV)); console.log('MSR plane diff deg', vangle(hO, hS) * RAD, 'OS orbit', rv2coe(osR, osV, mu).rp - surfaceRadius('mars'), rv2coe(osR, osV, mu).ra - surfaceRadius('mars'), 'orb', rv2coe(orbInfo.r, orbInfo.v, mu).rp - surfaceRadius('mars'), rv2coe(orbInfo.r, orbInfo.v, mu).ra - surfaceRadius('mars')); }
  let best = null;
  for (let tt = tI + 0.5 * H; tt < tI + 96 * H; tt += 300) {
    const so = kepProp(orbInfo.r, orbInfo.v, tt - orbInfo.t, mu);
    const Pp = 2 * Math.PI * Math.sqrt(Math.pow(vnorm(so.r), 3) / mu);
    for (const fr of [0.42, 0.48, 0.54]) {
      const tof = fr * Pp, sc = kepProp(osR, osV, tt + tof - tI, mu);
      const Lb = lambert(so.r, sc.r, tof, mu, vunit(vcross(so.r, so.v))); if (!Lb) continue;
      const tot = vnorm(vsub(Lb.v1, so.v)) + vnorm(vsub(sc.v, Lb.v2));
      if (!best || tot < best.tot) best = { tt, tof, tot, so, sc, Lb };
    }
  }
  orb.add(new ConicSeg('mars', orbInfo.t, best.tt, orbInfo.r, orbInfo.v, orbInfo.m, { extra: { phase: 'low Mars orbit — waiting' } }));
  const p1 = P.burn(orbInfo.engId, orbInfo.m, vnorm(vsub(best.Lb.v1, best.so.v))); let m = orbInfo.m - p1.prop;
  orb.add(new ConicSeg('mars', best.tt, best.tt + best.tof, best.so.r, best.Lb.v1, m, { extra: { phase: 'rendezvous transfer' } }));
  const p2 = P.burn(orbInfo.engId, m, vnorm(vsub(best.sc.v, best.Lb.v2))); m -= p2.prop;
  M.burn({ name: 'Orbiter rendezvous (intercept + braking)', t: best.tt, dur: p1.dur + p2.dur, dv: best.tot * 1000, engine: p1.engine, isp: p1.isp, prop: p1.prop + p2.prop, m0: orbInfo.m, obj: 'orbiter', propType: p1.propType });
  M.ev(best.tt, 'orbiter', 'Rendezvous with the sample container', `The orbiter tracks the basketball-sized container with its cameras and closes in. Δv ${(best.tot * 1000).toFixed(0)} m/s.`, 'burn');
  const tCap = best.tt + best.tof;
  mavObj.add(new ConicSeg('mars', tI, tCap, osR, osV, cfg.samples || 1, { extra: { phase: 'orbiting sample container' } }));
  M.ev(tCap, 'orbiter', 'Sample capture', 'The container is captured, sealed in a biocontainment system and transferred into the Earth entry capsule.', 'dock');
  M.phase(tI, tCap, 'Rendezvous in Mars orbit', '#06d6a0');
  return departPlanet(M, cfg, SC, P, orb, tCap, best.sc.r, best.sc.v, 'mars', m + (cfg.samples || 1), vinfOut, tDepM, ret, progress, false);
}
