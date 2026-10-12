// ============================================================================
// lunar.js — Earth–Moon missions, numerically integrated (Earth + Moon + Sun)
// Profiles: lunar-orbit (orbit & return), lunar-landing (land & return),
//           lunar-flyby (free return), lunar-landing-oneway
// ============================================================================
const R_E = BODIES.earth.R, R_MOON = BODIES.moon.R, EI_ALT = 121.92;
function cisInt(t0, y0, t1, opt = {}) {
  return integrate(makeCislunarODE(opt.thrust || null), t0, Float64Array.from(y0), t1, { rtol: opt.rtol ?? 1e-10, atol: opt.atol ?? 1e-7, hmax: opt.hmax ?? 1200, events: opt.events || [], h0: opt.h0 ?? 5, maxSteps: opt.maxSteps ?? 400000 });
}
const evPerilune = (maxD = 150000, tWin = null) => ({ name: 'perilune', dir: 1, terminal: true, g: (t, y) => { if (tWin && (t < tWin[0] || t > tWin[1])) return -1; const m = moonGeo(t); const rx = y[0] - m.r[0], ry = y[1] - m.r[1], rz = y[2] - m.r[2]; if (rx * rx + ry * ry + rz * rz > maxD * maxD) return -1; return rx * (y[3] - m.v[0]) + ry * (y[4] - m.v[1]) + rz * (y[5] - m.v[2]); } });
const evPerigee = (maxD = 120000) => ({ name: 'perigee', dir: 1, terminal: true, g: (t, y) => { if (y[0] * y[0] + y[1] * y[1] + y[2] * y[2] > maxD * maxD) return -1; return y[0] * y[3] + y[1] * y[4] + y[2] * y[5]; } });
const evPerigeeAfter = (tStart, delay = 600, maxD = 120000) => ({ name: 'perigee', dir: 1, terminal: true, g: (t, y) => { if (t - tStart < delay) return -1; if (y[0] * y[0] + y[1] * y[1] + y[2] * y[2] > maxD * maxD) return -1; return y[0] * y[3] + y[1] * y[4] + y[2] * y[5]; } });
function cisIntDelayed(t0, y0, tDelay, t1, events, opt = {}) { // events enabled only after tDelay
  if (tDelay <= t0) return cisInt(t0, y0, t1, { ...opt, events });
  const a = cisInt(t0, y0, Math.min(tDelay, t1), opt);
  if (tDelay >= t1) return a;
  const b = cisInt(tDelay, a.y[a.y.length - 1], t1, { ...opt, events });
  return { t: a.t.concat(b.t.slice(1)), y: a.y.concat(b.y.slice(1)), f: a.f.concat(b.f.slice(1)), events: b.events, tEnd: b.tEnd, stopped: b.stopped, stopEvent: b.stopEvent };
}
const evEI = () => ({ name: 'EI', dir: -1, terminal: true, g: (t, y) => Math.hypot(y[0], y[1], y[2]) - (R_E + EI_ALT) });
const evLunarImpact = () => ({ name: 'impact', dir: -1, terminal: true, g: (t, y) => { const m = moonGeo(t).r; return Math.hypot(y[0] - m[0], y[1] - m[1], y[2] - m[2]) - R_MOON; } });
const yToRV = y => ({ r: [y[0], y[1], y[2]], v: [y[3], y[4], y[5]], m: y[6] });
function resState(res, t) { // Hermite state from integrator result at time t
  const T = res.t; let i = bsearch(T, t); if (i >= T.length - 1) i = T.length - 2; if (i < 0) i = 0;
  return hermiteState(T[i], res.y[i], res.f[i], T[i + 1], res.y[i + 1], res.f[i + 1], clamp(t, T[i], T[i + 1]), 7);
}
// an integrator result up to t, ending at t itself (where the next segment starts) rather than at its last step before it
function resUntil(res, t) {
  let k = res.t.findIndex(x => x > t); if (k < 0) k = res.t.length;
  const out = { t: res.t.slice(0, k), y: res.y.slice(0, k) };
  if (!out.t.length || out.t[out.t.length - 1] < t) { out.t.push(t); out.y.push(resState(res, t)); }
  return out;
}
function seleno(t, y) { const m = moonGeo(t); return { r: [y[0] - m.r[0], y[1] - m.r[1], y[2] - m.r[2]], v: [y[3] - m.v[0], y[4] - m.v[1], y[5] - m.v[2]] }; }
function geoFromSeleno(t, r, v) { const m = moonGeo(t); return { r: vadd(r, m.r), v: vadd(v, m.v) }; }
// samples for a geocentric result
function resToSeg(res, phase, extra = {}, burn = null) {
  const S = integToSamples(res, (t, y) => burn ? { phase, ...extra, T: burn.T, thrDir: burn.law(t, [y[0], y[1], y[2]], [y[3], y[4], y[5]]) } : { phase, ...extra });
  return new SampleSeg('earth', S, { phase });
}
// local thrust-direction law: keep the angle relative to (v, r⊥, h) frame fixed (as in a guided burn)
function localDirLaw(r, v, dirAtStart, center = 'earth') {
  const fr = (rr, vv) => { const e1 = vunit(vv); let e2 = vsub(vunit(rr), vscale(e1, vdot(vunit(rr), e1))); e2 = vunit(e2); const e3 = vcross(e1, e2); return [e1, e2, e3]; };
  const [a, b, c] = fr(r, v); const comp = [vdot(dirAtStart, a), vdot(dirAtStart, b), vdot(dirAtStart, c)];
  return (t, rr, vv) => {
    let R = rr, V = vv;
    if (center === 'moon') { const m = moonGeo(t); R = vsub(rr, m.r); V = vsub(vv, m.v); }
    const [e1, e2, e3] = fr(R, V); return vunit(vadd(vadd(vscale(e1, comp[0]), vscale(e2, comp[1])), vscale(e3, comp[2])));
  };
}
// finite burn with secant search on duration so that `metric(yEnd)` hits 0. startState(tIgn) -> y
function finiteBurn({ tCenter, startState, engine, dirLaw, D0, metric, maxProp, maxIt = 8, fixedStart = null }) {
  const mdot = engine.thrust / (engine.isp * G0);
  const run = D => {
    const tIgn = fixedStart ?? (tCenter - D / 2);
    const y0 = startState(tIgn);
    const law = dirLaw(tIgn, y0);
    const res = cisInt(tIgn, y0, tIgn + D, { thrust: { T: engine.thrust, mdot, dir: law }, hmax: 20, h0: 1 });
    return { res, tIgn, err: metric(res.y[res.y.length - 1], tIgn + D), burn: { T: engine.thrust, law } };
  };
  const Dmax = maxProp / mdot;
  let D1 = Math.min(D0, Dmax), r1 = run(D1);
  let D2 = Math.min(D1 * 1.03 + 1, Dmax), r2 = run(D2);
  for (let i = 0; i < maxIt && Math.abs(r2.err) > 1e-7; i++) {
    const dd = (r2.err - r1.err); if (Math.abs(dd) < 1e-15) break;
    let D3 = D2 - r2.err * (D2 - D1) / dd; D3 = clamp(D3, 0.2 * D2, Math.min(3 * D2 + 5, Dmax));
    D1 = D2; r1 = r2; D2 = D3; r2 = run(D2);
    if (D2 >= Dmax - 1e-6 && r2.err < 0) break;
  }
  return { D: D2, ...r2, short: D2 >= Dmax - 1e-6 && Math.abs(r2.err) > 1e-4 };
}
const energyGeo = y => (y[3] * y[3] + y[4] * y[4] + y[5] * y[5]) / 2 - MU_E / Math.hypot(y[0], y[1], y[2]);
function energySel(t, y) { const s = seleno(t, y); return vdot(s.v, s.v) / 2 - MU_M / vnorm(s.r); }
function vacPerigee(r, v) { const el = rv2coe(r, v, MU_E); return el.rp; }
function fpaDeg(r, v) { return Math.asin(clamp(vdot(vunit(r), vunit(v)), -1, 1)) * RAD; }

// entry reference (range & duration) for a capsule
function entryReference(capsule, vEI = 11.0, fpa = -6.5, bank = 55, mass) {
  const r0 = [R_E + EI_ALT, 0, 0];
  const v0 = [vEI * Math.sin(fpa * DEG), vEI * Math.cos(fpa * DEG), 0];
  // simple: equatorial; rotation small effect for reference purposes
  const res = simulateEntry({ body: 'earth', t0: 0, r0, v0, m0: mass, diam: capsule.heat.diam, cd: capsule.heat.cd, LD: capsule.heat.LD, rn: capsule.heat.rn, bank, chutes: capsule.heat.chutes, maxTime: 3000 });
  const ang = vangle(r0, res.r);
  return { range: ang, dur: res.t, res };
}
// generic arrival residuals for targeting (n-body).
// mode.type: 'bplane' (B-plane target from desired plane/far side), 'plane' (rp + site plane), 'freeReturn' (rp + return perigee), 'natural' (rp)
function moonOrbitNormal(t) { const m = moonGeo(t); return vunit(vcross(m.r, m.v)); }
function bTarget(S, hStar, rp, vinf) { const b = bFromRp(rp, Math.max(vinf, 0.2), MU_M); return vscale(vunit(vcross(S, hStar)), b); }
function makeArrivalF(tS, yS, mode) {
  const H = 3600;
  return (dv, wantDetail) => {
    const y0 = [...yS]; y0[3] += dv[0]; y0[4] += dv[1]; y0[5] += dv[2];
    const r1 = cisIntDelayed(tS, y0, mode.tWin ? mode.tWin[0] : tS, mode.tWin ? mode.tWin[1] + 3600 : tS + 9 * 24 * H, [evPerilune(mode.maxD || 200000)], { rtol: 1e-9, atol: 1e-6, hmax: 3600 });
    if (!r1.stopEvent) return wantDetail ? { fail: true } : mode.fallback;
    const tp = r1.stopEvent.t, ye = r1.stopEvent.y, sel = seleno(tp, ye);
    const rp = vnorm(sel.r), h = vunit(vcross(sel.r, sel.v));
    let F;
    if (mode.type === 'bplane') {
      const bv = bVector(sel.r, sel.v, MU_M);
      if (!bv) return wantDetail ? { fail: true } : mode.fallback;
      const k = mode.inPlaneOnly || moonOrbitNormal(tp), T = vunit(vcross(bv.S, k)), R = vcross(bv.S, T);
      const hStar = mode.hStar(tp, bv.S);
      const Bs = bTarget(bv.S, hStar, mode.rp, bv.vinf);
      F = mode.inPlaneOnly ? [(vdot(bv.B, T) - vdot(Bs, T)) / 1000] : [(vdot(bv.B, T) - vdot(Bs, T)) / 1000, (vdot(bv.B, R) - vdot(Bs, R)) / 1000];
    } else {
      F = [(rp - mode.rp) / 50];
      if (mode.type === 'plane') F.push(Math.asin(clamp(vdot(h, mode.planeDir(tp)), -1, 1)) * RAD * 2);
    }
    let rvp = null;
    if (mode.type === 'freeReturn' || mode.withReturn) {
      const r2 = cisInt(tp, ye, tp + 8 * 24 * H, { events: [evPerigee(), evEI()], rtol: 1e-9, atol: 1e-6, hmax: 3600 });
      const yl = r2.y[r2.y.length - 1]; rvp = vacPerigee([yl[0], yl[1], yl[2]], [yl[3], yl[4], yl[5]]);
      if (mode.type === 'freeReturn') F.push((rvp - mode.rvp) / 50);
    }
    if (mode.tPeri) F.push((tp - mode.tPeri) / H * (mode.timeWeight ?? 1));
    return wantDetail ? { F, tp, rp, h, ye, rvp } : F;
  };
}
// desired lunar-orbit normal: plane containing site direction (if any), retrograde sense (far-side arrival)
function hStarFor(cfg, t0) {
  const H = 3600;
  const site = cfg.hybrid ? { lat: cfg.hybrid.lat, lon: cfg.hybrid.lon, met: cfg.hybrid.landMET } : (cfg.landing ? { lat: cfg.landing.lat, lon: cfg.landing.lon, met: cfg.landMET ?? 100 } : null);
  return (tp, S) => {
    const kRetro = vscale(moonOrbitNormal(tp), -1);
    if (!site) { const hN = vsub(kRetro, vscale(S, vdot(kRetro, S))); return vunit(hN); }
    const sd = vunit(sitePosEcl('moon', site.lat, site.lon, 0, t0 + site.met * H));
    let h = vunit(vcross(S, sd)); if (vdot(h, kRetro) < 0) h = vscale(h, -1);
    return h;
  };
}
function arrivalMode(cfg, t0, rp, tA) {
  const H = 3600;
  if (cfg.hybrid) { const hs = cfg.hybrid; return { type: 'plane', rp, planeDir: () => vunit(sitePosEcl('moon', hs.lat, hs.lon, 0, t0 + hs.landMET * H)), fallback: [1e3, 1e3] }; }
  if (cfg.profile === 'lunar-flyby') { return { type: 'freeReturn', rp, rvp: rvpFor(cfg.entry?.fpa ?? -6.5), fallback: [1e3, 1e3] }; }
  if (cfg.landing) { const st = cfg.landing, tL = t0 + (cfg.landMET ?? 100) * H; return { type: 'plane', rp, planeDir: () => vunit(sitePosEcl('moon', st.lat, st.lon, 0, tL)), fallback: [1e3, 1e3] }; }
  return { type: 'natural', rp, fallback: [1e3] };
}
function rvpFor(fpaDegV) { const r = R_E + EI_ALT, v = 11.0, g = fpaDegV * DEG; const h = r * v * Math.cos(g), eps = v * v / 2 - MU_E / r; const e = Math.sqrt(1 + 2 * eps * h * h / (MU_E * MU_E)); return h * h / MU_E / (1 + e); }
// --------------------------------------------------------------------------
function planLunar(cfg, progress = () => { }) {
  const M = new Mission(cfg);
  const L = LAUNCHERS[cfg.launcher], SC = JSON.parse(JSON.stringify(SPACECRAFT[cfg.spacecraft]));
  if (cfg.scOverride) for (const k in cfg.scOverride) Object.assign(SC.modules[k], cfg.scOverride[k]);
  const P = new Propulsion(SC);
  const S = LAUNCH_SITES[cfg.site];
  const t0 = M.t0, H = 3600;
  const crew = cfg.crew || 0;
  const ship = M.addObj(new MObject('ship', cfg.shipName || SC.name, { primary: true, crew, model: SC.model, color: '#ffd166' }));
  const scMass0 = scTotalMass(SC);
  const tofOut = (cfg.tof || 72) * H;
  // ---------------- launch window / plane ----------------
  progress('Solving launch window & ascent…');
  let normal, launchInfo;
  const tliGuess = t0 + (cfg.tliMET ?? (cfg.heo ? 25.6 : 2.7)) * H;
  if (cfg.launchAz != null) { const pa = planeNormalFromAzRel('earth', S.lat, S.lon, t0, cfg.launchAz); normal = pa.n; launchInfo = `Flight azimuth ${cfg.launchAz.toFixed(2)}° (historical, Earth-fixed) → inertial ${pa.azI.toFixed(2)}°, parking-orbit inclination ${(Math.acos(clamp(eclToEq(normal)[2], -1, 1)) * RAD).toFixed(2)}°.`; }
  else { const pl = planeThroughSite('earth', S.lat, S.lon, t0, vunit(moonGeo(tliGuess + tofOut).r)); normal = pl.n; launchInfo = `Launch azimuth ${pl.az.toFixed(1)}° chosen so the parking orbit plane contains the Moon’s position at arrival.`; }
  const LP = launchPhase(M, cfg, L, scMass0, normal, { ship });
  M.notes.push(launchInfo);
  if (!LP.ok) { M.warnings.push('The launch vehicle cannot reach orbit with this payload.'); M.failed = 'ascent'; M.finalize(); return M; }
  const asc = LP.asc;
  P.attachUpper(asc.upper, asc.upperProp);
  const upperMass = () => P.upper.attached ? P.upper.dry + P.upper.propLeft : 0;
  let t = asc.t, y = [...asc.r, ...asc.v, asc.m];
  ship.setConfig(t, 'stack', { key: 'stack', parts: ['upper', 'sc-stowed'], launcher: cfg.launcher, stage: L.stages.length - 1, sc: SC.model });
  // ---------------- Earth orbit phase (optional HEO raise) ----------------
  const coast = (tEnd, phase, objRef = ship, extra) => { const res = cisInt(t, y, tEnd, {}); objRef.add(resToSeg(res, phase, extra)); const yl = res.y[res.y.length - 1]; t = res.t[res.t.length - 1]; y = Array.from(yl); return res; };
  if (cfg.heo) {
    // apogee raise at a perigee by the upper stage (Artemis II style)
    progress('Earth orbit: apogee raise to high Earth orbit…');
    const res = cisInt(t, y, t + 5 * H, {});
    const resP = cisIntDelayed(t, y, t + 1200, t + 4 * H, [evPerigee(20000)]);
    const tPer0 = resP.stopEvent ? resP.stopEvent.t : t + 1.8 * H;
    const per0 = resState(res, tPer0), pHat0 = vunit([per0[0], per0[1], per0[2]]);
    const h0 = vunit(vcross(y.slice(0, 3), y.slice(3, 6)));
    const raTarget = R_E + cfg.heo.ha;
    // 2-body design: rotate the high-orbit perigee so a TLI at the following perigee meets the Moon after `tof`
    const rpPark = (() => { const el = rv2coe(y.slice(0, 3), y.slice(3, 6), MU_E); return el; })();
    const rAt = phi => rpPark.p / (1 + rpPark.e * Math.cos(phi));
    const nPark = 2 * Math.PI / rpPark.period;
    const Fdir = x => {
      const phi = x[0], dv = x[1], rp = rAt(phi), aH = (rp + raTarget) / 2, PH = 2 * Math.PI * Math.sqrt(aH * aH * aH / MU_E);
      const pdir = vrot(pHat0, h0, phi), tTLI = tPer0 + phi / nPark + PH;
      const vp = Math.sqrt(MU_E * (2 / rp - 1 / aH)) + dv;
      const kp = kepProp(vscale(pdir, rp), vscale(vunit(vcross(h0, pdir)), vp), tofOut, MU_E);
      const m = moonGeo(tTLI + tofOut).r, mp = vsub(m, vscale(h0, vdot(m, h0)));
      return [(vnorm(kp.r) - vnorm(mp)) / 1000, Math.atan2(vdot(vcross(kp.r, mp), h0), vdot(kp.r, mp)) * vnorm(mp) / 1000];
    };
    const sd = newtonSolve(Fdir, [0, 0.4], { h: 1e-6, tol: 1e-4, maxIt: 40, maxStep: 0.3 });
    let phiB = clamp(sd.x[0], -1.2, 1.2);
    if (!sd.ok) phiB = 0;
    const eng = P.engineOf('upper');
    const startState = tt => Array.from(resState(res, tt));
    const runARB = (phiCmd) => {
      const tPer = tPer0 + phiCmd / nPark, peri = resState(res, tPer);
      const rp = Math.hypot(peri[0], peri[1], peri[2]);
      const epsT = -MU_E / (rp + raTarget);
      const vNew = vscale(vunit(vcross(h0, vunit([peri[0], peri[1], peri[2]]))), Math.sqrt(MU_E * (2 / rp - 2 / (rp + raTarget))));
      const dvVec = vsub(vNew, [peri[3], peri[4], peri[5]]);
      const law = (tI, y0) => localDirLaw([peri[0], peri[1], peri[2]], [peri[3], peri[4], peri[5]], vunit(dvVec));
      const fb = finiteBurn({ tCenter: tPer, startState, engine: eng, dirLaw: law, D0: propForDv(peri[6], vnorm(dvVec), eng.isp) / (eng.thrust / (eng.isp * G0)), metric: (ye) => energyGeo(ye) - epsT, maxProp: P.upper.propLeft });
      const ye = fb.res.y[fb.res.y.length - 1], el = rv2coe([ye[0], ye[1], ye[2]], [ye[3], ye[4], ye[5]], MU_E);
      const ehat = vunit(el.evec), phiAch = Math.atan2(vdot(vcross(pHat0, ehat), h0), vdot(pHat0, ehat));
      return { fb, phiAch };
    };
    let phiCmd = phiB, arb = runARB(phiCmd);
    for (let k = 0; k < 3 && Math.abs(arb.phiAch - phiB) > 0.2 * DEG; k++) { phiCmd += wrapPi(phiB - arb.phiAch); arb = runARB(phiCmd); }
    if (globalThis.DEBUG) console.log('ARB phi target', phiB * RAD, 'achieved', arb.phiAch * RAD, 'cmd', phiCmd * RAD);
    const fb = arb.fb;
    // add coast to ignition
    const resC = cisInt(t, y, fb.tIgn, {}); ship.add(resToSeg(resC, 'Earth orbit'));
    ship.add(resToSeg(fb.res, 'apogee raise burn', { stage: P.upper.id }, fb.burn));
    const used = fb.res.y[0][6] - fb.res.y[fb.res.y.length - 1][6]; P.upper.propLeft -= used;
    const ye = fb.res.y[fb.res.y.length - 1];
    M.burn({ name: cfg.heo.name || 'Apogee raise (upper stage)', t: fb.tIgn, dur: fb.D, dv: dvForProp(fb.res.y[0][6], used, eng.isp) * 1000, engine: eng.name, isp: eng.isp, prop: used, m0: fb.res.y[0][6], obj: 'ship', propType: eng.prop });
    M.ev(fb.tIgn, 'ship', cfg.heo.name || 'Apogee raise burn', `${P.upper.name} burns ${fmtDur(fb.D)} near perigee, raising apogee to ${Math.round(cfg.heo.ha).toLocaleString()} km — a high Earth orbit for checkout before committing to the Moon.`, 'burn');
    t = fb.res.tEnd; y = Array.from(ye);
    // separation of spacecraft from upper stage
    const tSep = t + (cfg.heo.sepAfter || 1.4) * H;
    coast(tSep, 'high Earth orbit');
    const up = M.addObj(new MObject('upper', P.upper.name, { kind: 'stage', model: 'stage', color: '#aaa' }));
    up.setConfig(t, 'stage', { key: 'stage', launcher: cfg.launcher, stage: L.stages.length - 1 });
    const resU = cisInt(t, [...y.slice(0, 3), ...vadd(y.slice(3, 6), vscale(vunit(y.slice(3, 6)), -0.0005)), P.upper.dry + P.upper.propLeft], t + 30 * H, {});
    up.add(resToSeg(resU, 'spent stage'));
    y[6] -= upperMass(); P.upper.attached = false;
    ship.setConfig(t, 'sc', { key: 'sc', sc: SC.model, parts: ['orbiter'] });
    M.ev(t, 'ship', cfg.heo.sepName || 'Spacecraft separation', cfg.heo.sepDesc || 'The spacecraft separates from the spent upper stage.', 'sep');
    if (cfg.heo.proxOps) M.ev(t + 0.2 * H, 'ship', 'Proximity operations demo', 'The crew manually flies the spacecraft around the spent upper stage, using it as a docking target to test handling qualities.', 'info');
  }
  // ---------------- TLI ----------------
  progress('Targeting trans-lunar injection…');
  const tliEngineId = cfg.tliBy === 'sc' ? SC.prop.orbiter : 'upper';
  const eng = P.engineOf(tliEngineId);
  // parking orbit propagation (long enough)
  const parkRes = cisInt(t, y, t + 30 * H, {});
  const parkNormal = vunit(vcross(y.slice(0, 3), y.slice(3, 6)));
  let tIgn;
  const mdotT = eng.thrust / (eng.isp * G0);
  const s0park = resState(parkRes, t);
  // TLI design in the two-body model: tangential impulse at t1 with magnitude dv; craft must reach the Moon
  // (radius + small far-side aim offset, and in-plane angle) at tArr.  Then MCC fixes n-body / out-of-plane errors.
  const aimOff = cfg.flybySide === 'near' ? -1500 : 2500;
  const tliF = (t1, dv, tArr) => {
    const s = resState(parkRes, t1), r = [s[0], s[1], s[2]], v = [s[3], s[4], s[5]];
    const v1 = vadd(v, vscale(vunit(v), dv));
    const kp = kepProp(r, v1, tArr - t1, MU_E);
    const h = vunit(vcross(r, v1));
    let m = moonGeo(tArr).r; const mp = vsub(m, vscale(h, vdot(m, h)));
    const ang = Math.atan2(vdot(vcross(kp.r, mp), h), vdot(kp.r, mp));
    return [(vnorm(kp.r) - (vnorm(mp) + aimOff)) / 1000, ang * vnorm(mp) / 1000];
  };
  let t1, dv1, tA;
  const dvHoh = (s) => { const r = Math.hypot(s[0], s[1], s[2]); return Math.sqrt(MU_E * (2 / r - 2 / (r + 384000))) - Math.hypot(s[3], s[4], s[5]); };
  if (cfg.tliMET != null || cfg.heo) {
    if (cfg.tliMET != null) tIgn = t0 + cfg.tliMET * H;
    else { const rp = cisIntDelayed(t, y, t + 3 * H, t + 30 * H, [evPerigee(30000)]); tIgn = (rp.stopEvent ? rp.stopEvent.t : t + 23 * H) - 175; }
    let D = propForDv(s0park[6], dvHoh(resState(parkRes, tIgn)), eng.isp) / mdotT;
    if (globalThis.DEBUG) { const sp = resState(parkRes, tIgn); const pr = [sp[0], sp[1], sp[2]]; const hh = vunit(vcross(pr, [sp[3], sp[4], sp[5]]));
      for (const dh of [70, 90, 100, 110, 120]) { const mm = moonGeo(tIgn + dh * H).r; const mp = vsub(mm, vscale(hh, vdot(mm, hh))); console.log('HEO geom: Moon at TLI+' + dh + 'h: in-plane angle', (Math.atan2(vdot(vcross(pr, mp), hh), vdot(pr, mp)) * RAD).toFixed(1), 'out-of-plane deg', (Math.asin(vdot(vunit(mm), hh)) * RAD).toFixed(2)); }
      console.log('TLI ign', fmtUTC(tIgn), 'perigee alt', vnorm(pr) - R_E, 'dvHoh', dvHoh(sp)); }
    dv1 = dvHoh(resState(parkRes, tIgn + D / 2)); tA = tIgn + D / 2 + tofOut;
    for (let k = 0; k < 3; k++) {
      t1 = tIgn + D / 2;
      const sol = newtonSolve(x => tliF(t1, x[0], x[1]), [dv1, tA], { h: 1e-4, tol: 1e-6, maxIt: 30 });
      dv1 = sol.x[0]; tA = sol.x[1];
      D = propForDv(s0park[6], dv1, eng.isp) / mdotT;
    }
  } else {
    // free TLI epoch: craft must depart roughly opposite the Moon's arrival position
    const P0 = 2 * Math.PI * Math.sqrt(Math.pow(vnorm(y.slice(0, 3)), 3) / MU_E);
    const mArr = vunit(moonGeo(t + 1.5 * H + tofOut).r);
    let tBest = t + 0.9 * H, best = -2;
    for (let tt = t + 0.9 * H; tt < t + 0.9 * H + P0; tt += 30) { const s = resState(parkRes, tt); const c = -vdot(vunit([s[0], s[1], s[2]]), mArr); if (c > best) { best = c; tBest = tt; } }
    t1 = tBest - 0.035 * P0; dv1 = dvHoh(resState(parkRes, t1)); tA = t1 + tofOut;
    const sol = newtonSolve(x => tliF(x[0], x[1], t1 + tofOut + (x[0] - t1) * 0), [t1, dv1], { h: 1e-4, tol: 1e-6, maxIt: 30 });
    // keep TOF fixed relative to t1: solve (t1, dv) with tArr = t1 + tof
    const sol2 = newtonSolve(x => tliF(x[0], x[1], x[0] + tofOut), [sol.x[0], sol.x[1]], { h: 1e-3, tol: 1e-6, maxIt: 30 });
    t1 = sol2.x[0]; dv1 = sol2.x[1]; tA = t1 + tofOut;
    const D = propForDv(resState(parkRes, t1)[6], dv1, eng.isp) / mdotT;
    tIgn = t1 - D / 2;
  }
  let tArrA = null;
  // --- stage A (n-body, in-plane): tangential burn; adjust Δv and burn epoch to minimise lunar miss distance
  {
    const tTarget = (tt) => tt + tofOut;
    const rpAim = R_MOON + (cfg.hybrid ? cfg.hybrid.perilune : (cfg.perilune || 110));
    const missAt = (tt, dv) => { const s = resState(parkRes, tt); const y0 = Array.from(s); const vv = vunit([y0[3], y0[4], y0[5]]); y0[3] += vv[0] * dv; y0[4] += vv[1] * dv; y0[5] += vv[2] * dv;
      const win = [tt + 0.55 * tofOut, tt + 1.6 * tofOut];
      const r = cisIntDelayed(tt, y0, win[0], win[1] + 3600, [evPerilune(450000)], { rtol: 1e-8, atol: 1e-5, hmax: 3600 });
      if (!r.stopEvent) return 1e6; const sl = seleno(r.stopEvent.t, r.stopEvent.y); const tw = cfg.tliMET != null ? Math.abs(tt - t1) / 60 : 0;
      const dtH = Math.abs(r.stopEvent.t - tTarget(tt)) / 3600; missAt.tp = r.stopEvent.t;
      return Math.abs(vnorm(sl.r) - rpAim) + tw * 50 + Math.max(0, dtH - 3) * 400; };
    const t1base = t1, dvBase = dv1, tSpan = cfg.heo ? 4 : 9;
    if (globalThis.DEBUG && cfg.heo) { for (const dvx of [0.36, 0.44]) { const s0 = resState(parkRes, t1base); const y0 = Array.from(s0); const vv = vunit([y0[3], y0[4], y0[5]]); y0[3] += vv[0] * dvx; y0[4] += vv[1] * dvx; y0[5] += vv[2] * dvx;
      const el = rv2coe([y0[0], y0[1], y0[2]], [y0[3], y0[4], y0[5]], MU_E); console.log('dv', dvx, 'rp', el.rp.toFixed(0), 'ra', el.ra.toFixed(0), 'flight path deg', fpaDeg([s0[0], s0[1], s0[2]], [s0[3], s0[4], s0[5]]).toFixed(2), '|r|', Math.hypot(s0[0], s0[1], s0[2]).toFixed(0));
      const rr = cisInt(t1base, y0, t1base + 150 * H, {}); for (const hh of [24, 48, 72, 90, 100, 120]) { const st = resState(rr, t1base + hh * H); const m = moonGeo(t1base + hh * H).r; console.log('   +' + hh + 'h dEarth', Math.round(Math.hypot(st[0], st[1], st[2])), 'dMoon', Math.round(vnorm(vsub([st[0], st[1], st[2]], m))), 'moonDist', Math.round(vnorm(m))); } } } // ±400 s at a HEO perigee, ±900 s otherwise
    // 1-D scan on Δv first (robust starting point), then bounded simplex on (Δv, epoch)
    { let best = { f: Infinity, dv: dv1 }; for (let dv = dvBase - 0.08; dv <= dvBase + 0.16; dv += 0.01) { const f = missAt(t1base, dv); if (globalThis.DEBUG) console.log('scanA', dv.toFixed(3), Math.round(f), ((missAt.tp - t1base) / 3600).toFixed(1)); if (f < best.f) best = { f, dv }; } dv1 = best.dv; }
    const bounded = x => (Math.abs(x[1]) > tSpan || Math.abs(x[0] - dvBase) > 0.25) ? 1e7 : missAt(t1base + x[1] * 100, x[0]);
    const nm = nelderMead(bounded, [dv1, 0], [0.01, 2], { maxIt: 90, tol: 1e-7 });
    dv1 = nm.x[0]; t1 = t1base + nm.x[1] * 100; missAt(t1, dv1); tArrA = missAt.tp;
    if (globalThis.DEBUG) console.log('stage A', nm.f, dv1, (t1 - t1base), 'arrival GET h', (tArrA - t0) / 3600);
    const D = propForDv(resState(parkRes, t1)[6], dv1, eng.isp) / mdotT; tIgn = t1 - D / 2;
  }
  const sT1 = resState(parkRes, t1);
  const imp = { r: [sT1[0], sT1[1], sT1[2]], v: [sT1[3], sT1[4], sT1[5]] };
  // --- n-body refinement of the impulsive TLI (3-D B-plane targeting): x = Δv components in (v, r⊥, h) frame
  const rpMoon0 = R_MOON + (cfg.hybrid ? cfg.hybrid.perilune : (cfg.perilune || 110));
  const fr = (() => { const e1 = vunit(imp.v); let e2 = vunit(vsub(vunit(imp.r), vscale(e1, vdot(vunit(imp.r), e1)))); return [e1, e2, vcross(e1, e2)]; })();
  const xToDv = x => vadd(vadd(vscale(fr[0], x[0]), vscale(fr[1], x[1])), vscale(fr[2], x[2]));
  const isFR = cfg.profile === 'lunar-flyby' && !cfg.hybrid;
  const tWinT = tArrA ? [tArrA - 40 * H, tArrA + 40 * H] : null;
  const modeT = { type: 'bplane', rp: rpMoon0, hStar: hStarFor(cfg, t0), fallback: [1e3, 1e3], tWin: tWinT, inPlaneOnly: isFR ? null : vunit(vcross(imp.r, imp.v)), tPeri: t1 + tofOut, timeWeight: 0.6 };
  const FT0 = makeArrivalF(t1, Array.from(sT1), modeT);
  let solTLI = newtonSolve(x => FT0(xToDv(x)), [dv1, 0, 0], { h: 1e-6, tol: 1e-3, maxIt: 25, maxStep: 0.15 });
  let FT = FT0;
  if (isFR) { // second stage: true free-return conditions (perilune radius, return perigee) + arrival time
    const modeF = { type: 'freeReturn', rp: rpMoon0, rvp: rvpFor(cfg.entry?.fpa ?? -6.5), fallback: [1e3, 1e3, 1e3], tWin: tWinT, tPeri: t1 + tofOut, timeWeight: 0.3 };
    const FTf = makeArrivalF(t1, Array.from(sT1), modeF);
    const s2 = newtonSolve(x => FTf(xToDv(x)), solTLI.x, { h: 1e-6, tol: 1e-3, maxIt: 25, maxStep: 0.05 });
    if (globalThis.DEBUG) console.log('TLI free-return stage', s2.norm, s2.hist.map(v => +v.toFixed(3)));
    if (s2.norm < 5) { solTLI = s2; FT = FTf; }
  }
  if (globalThis.DEBUG) { const d = FT(xToDv(solTLI.x), true); console.log('TLI nbody', solTLI.norm, solTLI.hist.map(v => +v.toFixed(3)), solTLI.x, (d.tp - t0) / 3600, d.rp); }
  if (!solTLI.ok) M.notes.push('TLI targeting converged approximately; mid-course corrections absorb the residual.');
  dv1 = vnorm(xToDv(solTLI.x));
  imp.L1 = { v1: vadd(imp.v, xToDv(solTLI.x)) };
  const dvImp = vsub(imp.L1.v1, imp.v);
  const Dest = propForDv(sT1[6], dv1, eng.isp) / mdotT;
  const tc = t1;
  const epsTLI = vdot(imp.L1.v1, imp.L1.v1) / 2 - MU_E / vnorm(imp.r);
  const tank = P.tankOf(tliEngineId);
  const fbT = finiteBurn({ tCenter: tc, fixedStart: tIgn, startState: tt => Array.from(resState(parkRes, tt)), engine: eng, dirLaw: (tI, y0) => localDirLaw(imp.r, imp.v, vunit(dvImp)), D0: Dest, metric: ye => energyGeo(ye) - epsTLI, maxProp: tank.propLeft });
  { const resC = cisInt(t, y, tIgn, {}); ship.add(resToSeg(resC, cfg.heo ? 'high Earth orbit' : 'parking orbit')); }
  ship.add(resToSeg(fbT.res, 'trans-lunar injection', { stage: tliEngineId === 'upper' ? P.upper.id : tliEngineId }, fbT.burn));
  const usedT = fbT.res.y[0][6] - fbT.res.y[fbT.res.y.length - 1][6]; tank.propLeft -= usedT;
  const dvT = dvForProp(fbT.res.y[0][6], usedT, eng.isp) * 1000;
  M.burn({ name: 'TLI — trans-lunar injection', t: tIgn, dur: fbT.D, dv: dvT, engine: eng.name, isp: eng.isp, prop: usedT, m0: fbT.res.y[0][6], obj: 'ship', propType: eng.prop });
  M.ev(tIgn, 'ship', 'Trans-lunar injection', `${EXPLAIN.tli} Burn ${fmtDur(fbT.D)}, Δv ≈ ${dvT.toFixed(0)} m/s using ${(usedT / 1000).toFixed(1)} t of propellant.`, 'burn');
  M.phase(asc.t, tIgn, cfg.heo ? 'Earth orbits' : 'Parking orbit', '#4ea8de');
  t = fbT.res.tEnd; y = Array.from(fbT.res.y[fbT.res.y.length - 1]);
  if (fbT.short) {
    M.warnings.push(`Not enough propellant for the full trans-lunar injection (Δv achieved ${dvT.toFixed(0)} m/s) — the vehicle stays in an elliptical Earth orbit. Choose a more capable launch vehicle or a lighter spacecraft.`);
    M.failed = 'tli';
    const el = rv2coe(y.slice(0, 3), y.slice(3, 6), MU_E);
    const tEndF = t + Math.min(Math.max(el.period || 6 * H, 6 * H) * 2, 10 * 24 * H);
    coast(tEndF, 'stranded in Earth orbit');
    M.phase(tIgn, tEndF, 'Stranded in Earth orbit', '#ff5d5d');
    M.ev(tIgn + fbT.D, 'ship', 'TLI shortfall', `The upper stage ran dry before reaching escape energy. Apogee ${Math.round(el.ra - R_E).toLocaleString()} km — the Moon (≈384,000 km) is out of reach.`, 'fail');
    M.finalize(); return M;
  }
  if (globalThis.DEBUG) {
    const el = rv2coe(y.slice(0,3), y.slice(3,6), MU_E); console.log('post-TLI', { D: fbT.D, short: fbT.short, err: fbT.err, rp: el.rp, ra: el.ra, e: el.e, dvImp: vnorm(dvImp), tIgn: fmtUTC(tIgn), tc: fmtUTC(tc) });
    const elImp = rv2coe(imp.r, imp.L1.v1, MU_E); console.log('impulsive', { rp: elImp.rp, ra: elImp.ra, i: elImp.i*RAD });
    const rr = cisInt(t, y, t + 5*86400, {}); let mn = 1e12, tm = 0; for (let i=0;i<rr.t.length;i++){ const d = vnorm(vsub(rr.y[i].slice(0,3), moonGeo(rr.t[i]).r)); if (d<mn){mn=d;tm=rr.t[i];} } console.log('closest Moon', mn, fmtUTC(tm));
    const kp = kepProp(imp.r, imp.L1.v1, tofOut, MU_E); console.log('kepler arrival miss vs moon', vnorm(vsub(kp.r, moonGeo(tc+tofOut).r)));
  }
  // ---------------- upper-stage separation (TD&E) ----------------
  if (tliEngineId === 'upper' && P.upper.attached) {
    const tSep = t + (cfg.sepAfterTLI ?? 0.5) * H;
    coast(tSep, 'translunar coast');
    const up = M.addObj(new MObject('upper', P.upper.name, { kind: 'stage', model: 'stage', color: '#aaa' }));
    up.setConfig(t, 'stage', { key: 'stage', launcher: cfg.launcher, stage: L.stages.length - 1, withAdapter: true });
    const mUp = upperMass() + P.massOf(SC.adapter || []);
    const resU = cisInt(t, [...y.slice(0, 3), ...vadd(y.slice(3, 6), vscale(vunit(y.slice(3, 6)), -0.004)), mUp], t + (cfg.upperDays || 5) * 24 * H, { events: [evLunarImpact()] });
    up.add(resToSeg(resU, 'spent stage'));
    y[6] -= mUp; P.upper.attached = false; for (const a of SC.adapter || []) P.mods[a].attached = false;
    ship.setConfig(t, 'sc', { key: 'sc', sc: SC.model, parts: SC.lander ? ['orbiter', 'lander'] : ['orbiter'], deployT: t }); // (a spacecraft that unfolds after it leaves the stage does so from deployT)
    M.ev(t, 'ship', cfg.sepName || 'Spacecraft separation', cfg.sepDesc || 'The spacecraft separates from the spent upper stage, which is sent onto a different trajectory.', 'sep');
  }
  // ---------------- outbound mid-course correction (targeting) ----------------
  progress('Mid-course correction: targeting the Moon…');
  const profile = cfg.profile;
  const rpMoonT = R_MOON + (cfg.perilune || 110);
  const site = cfg.landing;
  const capsuleId = SC.capsule;
  const entryCfg = cfg.entry || {};
  const capMass = () => P.massOf([capsuleId]);
  const ref = SC.capsule ? entryReference(SC.modules[capsuleId], 11.0, entryCfg.fpa ?? -6.5, entryCfg.bank ?? 55, P.mods[capsuleId].dry) : null;
  const tMcc = cfg.mccMET != null ? t0 + cfg.mccMET * H : t + (cfg.mccAfterTLI ?? 20) * H;
  coast(tMcc, 'translunar coast');
  const tLandEst = site ? t0 + (cfg.landMET ?? ((cfg.tliMET ?? 2.7) + (cfg.tof || 72) + 26)) * H : 0;
  const siteDirAt = (tt) => vunit(sitePosEcl('moon', site.lat, site.lon, 0, tt));
  const rvpT = (() => { // vacuum perigee radius for target entry FPA (approx, v_EI 11 km/s)
    const r = R_E + EI_ALT, v = 11.0, g = (entryCfg.fpa ?? -6.5) * DEG; const h = r * v * Math.cos(g), eps = v * v / 2 - MU_E / r;
    const e = Math.sqrt(1 + 2 * eps * h * h / (MU_E * MU_E)); return h * h / MU_E / (1 + e);
  })();
  const mccRun = (dv, full) => {
    const y0 = [...y]; y0[3] += dv[0]; y0[4] += dv[1]; y0[5] += dv[2];
    const r1 = cisInt(tMcc, y0, tMcc + 9 * 24 * H, { events: [evPerilune()], rtol: 1e-9, atol: 1e-6, hmax: 3600 });
    if (!r1.stopEvent) return { fail: true };
    const ye = r1.stopEvent.y, tp = r1.stopEvent.t, sel = seleno(tp, ye);
    const out = { tp, rp: vnorm(sel.r), h: vunit(vcross(sel.r, sel.v)), ye, res1: r1 };
    if (full) { const r2 = cisInt(tp, ye, tp + 8 * 24 * H, { events: [evPerigee(), evEI()], rtol: 1e-9, atol: 1e-6, hmax: 3600 }); const yl = r2.y[r2.y.length - 1]; out.rvp = vacPerigee([yl[0], yl[1], yl[2]], [yl[3], yl[4], yl[5]]); out.res2 = r2; }
    return out;
  };
  let modeM;
  if (profile === 'lunar-flyby' && !cfg.hybrid) modeM = { type: 'freeReturn', rp: rpMoonT, rvp: rvpT, fallback: [1e3, 1e3] };
  else modeM = { type: 'bplane', rp: cfg.hybrid ? R_MOON + cfg.hybrid.perilune : rpMoonT, hStar: hStarFor(cfg, t0), fallback: [1e3, 1e3] };
  if (tArrA) modeM.tWin = [tArrA - 30 * H, tArrA + 30 * H];
  const FM = makeArrivalF(tMcc, y, modeM);
  const F = dv => FM(dv);
  const sol = newtonSolve(F, [0, 0, 0], { h: 1e-6, tol: 1e-3, maxIt: 20, maxStep: 0.25 });
  const dvM = sol.x, dvMag = vnorm(dvM) * 1000;
  if (globalThis.DEBUG) { const o = FM(dvM, true); console.log('MCC sol', sol.norm, sol.hist.map(v=>+v.toFixed(4)), dvM.map(v=>v*1000), o.fail ? 'FAIL' : { rp: o.rp, tp: fmtUTC(o.tp) }); }
  if (!sol.ok) M.warnings.push(`Outbound targeting converged only approximately (residual ${sol.norm.toFixed(2)}).`);
  const mccEngId = SC.prop.orbiter;
  const pm = P.burn(mccEngId, y[6], dvMag / 1000);
  M.burn({ name: 'MCC — outbound mid-course correction', t: tMcc, dur: pm.dur, dv: dvMag, engine: pm.engine, isp: pm.isp, prop: pm.prop, m0: y[6], obj: 'ship', propType: pm.propType });
  M.ev(tMcc, 'ship', 'Mid-course correction', `${EXPLAIN.mcc} Δv ${dvMag.toFixed(1)} m/s (${fmtDur(pm.dur)} burn).`, 'burn', { dv: dvMag });
  y[3] += dvM[0]; y[4] += dvM[1]; y[5] += dvM[2]; y[6] -= pm.prop;
  // ---------------- Apollo-13 style mid-course re-targeting events ----------------
  const scripted = cfg.scripted || [];
  // ---------------- integrate to perilune ----------------
  progress('Coasting to the Moon…');
  if (profile === 'lunar-flyby') return finishFlyby(M, cfg, SC, P, ship, t0, tMcc, y, rpMoonT, rvpT, ref, scripted, progress);
  let res = cisInt(tMcc, y, tMcc + 9 * 24 * H, { events: [evPerilune()] });
  const tSOI = (() => { for (let i = 0; i < res.t.length; i++) { const m = moonGeo(res.t[i]).r; if (vnorm(vsub([res.y[i][0], res.y[i][1], res.y[i][2]], m)) < BODIES.moon.soi) return res.t[i]; } return null; })();
  if (tSOI) M.ev(tSOI, 'ship', 'Lunar sphere of influence', EXPLAIN.soiMoon, 'soi');
  if (!res.stopEvent) { ship.add(resToSeg(res, 'translunar coast')); M.warnings.push('The trajectory does not reach the Moon — targeting failed for these inputs.'); M.failed = 'arrival'; M.finalize(); return M; }
  const tPeri = res.stopEvent.t;
  // ---------------- LOI-1 ----------------
  progress('Lunar orbit insertion…');
  const orbEngId = SC.prop.orbiter, orbEng = P.engineOf(orbEngId);
  const loi = cfg.loi || { apo: 314 };
  const raLOI = R_MOON + loi.apo;
  const peri = res.stopEvent.y, selP = seleno(tPeri, peri);
  const epsLOI = -MU_M / (vnorm(selP.r) + raLOI);
  const vpTarget = Math.sqrt(2 * (epsLOI + MU_M / vnorm(selP.r)));
  const dvLOIest = vnorm(selP.v) - vpTarget;
  const DLOI = propForDv(peri[6], dvLOIest, orbEng.isp) / (orbEng.thrust / (orbEng.isp * G0));
  const retro = (tI, y0) => (tt, rr, vv) => { const m = moonGeo(tt); return vunit(vsub(m.v, vv)); };
  const fbL = finiteBurn({ tCenter: tPeri, startState: tt => Array.from(resState(res, tt)), engine: orbEng, dirLaw: retro, D0: DLOI, metric: (ye, te) => energySel(te, ye) - epsLOI, maxProp: P.tankOf(orbEngId).propLeft });
  { const resC = cisInt(tMcc, y, fbL.tIgn, {}); ship.add(resToSeg(resC, 'translunar coast')); }
  ship.add(resToSeg(fbL.res, 'lunar orbit insertion', { stage: orbEngId }, fbL.burn));
  const usedL = fbL.res.y[0][6] - fbL.res.y[fbL.res.y.length - 1][6]; P.tankOf(orbEngId).propLeft -= usedL;
  const dvL = dvForProp(fbL.res.y[0][6], usedL, orbEng.isp) * 1000;
  M.burn({ name: 'LOI-1 — lunar orbit insertion', t: fbL.tIgn, dur: fbL.D, dv: dvL, engine: orbEng.name, isp: orbEng.isp, prop: usedL, m0: fbL.res.y[0][6], obj: 'ship', propType: orbEng.prop });
  M.ev(fbL.tIgn, 'ship', 'Lunar orbit insertion', `${EXPLAIN.loi} ${fmtDur(fbL.D)} burn, Δv ${dvL.toFixed(0)} m/s → orbit ${(cfg.perilune || 110).toFixed(0)} × ${loi.apo} km.`, 'burn');
  M.phase(tIgn, fbL.tIgn, 'Translunar coast', '#9b5de5');
  // LOS behind the Moon
  M.ev(fbL.tIgn - 600, 'ship', 'Loss of signal', 'The spacecraft passes behind the Moon — no radio contact with Earth until it re-emerges ~45 minutes later.', 'los');
  if (fbL.short) { M.warnings.push('Insufficient propellant for lunar orbit insertion.'); }
  t = fbL.res.tEnd; y = Array.from(fbL.res.y[fbL.res.y.length - 1]);
  // ---------------- LOI-2 circularisation ----------------
  if (loi.circ) {
    const after = loi.circAfter ?? 4.4;
    let r2 = cisInt(t, y, t + after * H + 4 * H, {});
    let best = null;
    for (let i = 1; i < r2.t.length; i++) {
      const a = seleno(r2.t[i - 1], r2.y[i - 1]), b = seleno(r2.t[i], r2.y[i]);
      if (vdot(a.r, a.v) < 0 && vdot(b.r, b.v) >= 0) { const tc = r2.t[i]; if (!best || Math.abs(tc - (t + after * H)) < Math.abs(best - (t + after * H))) best = tc; }
    }
    const tc2 = best || t + after * H;
    const s2 = resState(r2, tc2), sel2 = seleno(tc2, s2), rp2 = vnorm(sel2.r);
    const ra2 = R_MOON + loi.circ;
    const eps2 = -MU_M / (rp2 + ra2);
    const dvE = vnorm(sel2.v) - Math.sqrt(2 * (eps2 + MU_M / rp2));
    const D2 = Math.max(2, propForDv(s2[6], Math.abs(dvE), orbEng.isp) / (orbEng.thrust / (orbEng.isp * G0)));
    const fb2 = finiteBurn({ tCenter: tc2, startState: tt => Array.from(resState(r2, tt)), engine: orbEng, dirLaw: retro, D0: D2, metric: (ye, te) => energySel(te, ye) - eps2, maxProp: P.tankOf(orbEngId).propLeft });
    { const resC = cisInt(t, y, fb2.tIgn, {}); ship.add(resToSeg(resC, 'lunar orbit')); }
    ship.add(resToSeg(fb2.res, 'LOI-2', { stage: orbEngId }, fb2.burn));
    const u2 = fb2.res.y[0][6] - fb2.res.y[fb2.res.y.length - 1][6]; P.tankOf(orbEngId).propLeft -= u2;
    const d2 = dvForProp(fb2.res.y[0][6], u2, orbEng.isp) * 1000;
    M.burn({ name: 'LOI-2 — circularisation', t: fb2.tIgn, dur: fb2.D, dv: d2, engine: orbEng.name, isp: orbEng.isp, prop: u2, m0: fb2.res.y[0][6], obj: 'ship', propType: orbEng.prop });
    M.ev(fb2.tIgn, 'ship', 'LOI-2 circularisation', `A ${fmtDur(fb2.D)} burn trims the orbit to ≈${(cfg.perilune || 110).toFixed(0)} × ${loi.circ} km. Lunar orbital speed ≈ 1.6 km/s, period ≈ 2 hours.`, 'burn');
    t = fb2.res.tEnd; y = Array.from(fb2.res.y[fb2.res.y.length - 1]);
  }
  const tLOIend = t;
  // lunar orbit events (Earthrise etc.)
  for (const e of scripted) if (e.when === 'lunarOrbit') M.ev(t0 + e.met * H, 'ship', e.name, e.desc, e.kind || 'info');
  // ---------------- landing ----------------
  let tDepart;
  if (profile === 'lunar-landing' || profile === 'lunar-landing-oneway') {
    const ok = doLanding(M, cfg, SC, P, ship, t0, () => ({ t, y }), (nt, ny) => { t = nt; y = ny; }, progress);
    if (!ok) { M.finalize(); return M; }
    if (profile === 'lunar-landing-oneway') { M.finalize(); return M; }
  }
  // ---------------- lunar orbit stay → TEI ----------------
  progress('Trans-Earth injection targeting…');
  const tTEInom = cfg.teiMET != null ? t0 + cfg.teiMET * H : t + (cfg.orbitStay ?? 20) * H;
  const tReturn = (cfg.returnTof ?? 62) * H;
  const splash = cfg.splash;
  const tEntryDur = ref ? ref.dur : 800;
  const thetaRange = ref ? ref.range : 0.35;
  const siteE = (tt) => vunit(sitePosEcl('earth', splash.lat, splash.lon, 0, tt));
  // orbit propagation through TEI window
  const orbRes = cisInt(t, y, tTEInom + 3 * H, {});
  const per = 2 * Math.PI * Math.sqrt(Math.pow(vnorm(seleno(t, y).r), 3) / MU_M);
  const teiTrial = (tb, dv, full) => {
    const s = resState(orbRes, tb), sel = seleno(tb, s);
    const vdir = vunit(sel.v);
    const y0 = Array.from(s); y0[3] += vdir[0] * dv[0] + dv[1]; y0[4] += vdir[1] * dv[0] + dv[2]; y0[5] += vdir[2] * dv[0] + dv[3];
    const r = cisInt(tb, y0, tb + 6 * 24 * H, { events: [evEI(), evPerigee(80000)], rtol: 1e-9, atol: 1e-6, hmax: 3600 });
    const yl = r.y[r.y.length - 1];
    return { tEnd: r.tEnd, y: yl, ei: r.stopEvent && r.stopEvent.name === 'EI', rvp: vacPerigee([yl[0], yl[1], yl[2]], [yl[3], yl[4], yl[5]]), res: r };
  };
  // --- TEI targeting: (1) epoch that points the return at Earth, (2) Δv magnitude giving the right
  // landing longitude (Earth rotation), (3) Newton on [dv_t, dv_r, dv_n, epoch] for [γ_EI, cross-range, along-track]
  const dv0 = (() => { const s = resState(orbRes, tTEInom), sel = seleno(tTEInom, s); const rr = vnorm(sel.r); return Math.sqrt(0.82 + 2 * MU_M / rr) - vnorm(sel.v); })();
  const kRefTEI = moonOrbitNormal(tTEInom);
  const hTgtTEI = Math.sqrt(MU_E * rvpT * 1.98);
  const evalTEI = (tb, x) => { // x = [dv_t, dv_r, dv_n] in selenocentric local frame
    const s = resState(orbRes, tb), sel = seleno(tb, s);
    const e1 = vunit(sel.v); const e2 = vunit(vsub(vunit(sel.r), vscale(e1, vdot(vunit(sel.r), e1)))); const e3 = vcross(e1, e2);
    const dvv = vadd(vadd(vscale(e1, x[0]), vscale(e2, x[1])), vscale(e3, x[2]));
    const y0 = Array.from(s); y0[3] += dvv[0]; y0[4] += dvv[1]; y0[5] += dvv[2];
    const r = cisInt(tb, y0, tb + 6 * 24 * H, { events: [evEI(), evPerigee(80000)], rtol: 1e-9, atol: 1e-6, hmax: 3600 });
    const yl = r.y[r.y.length - 1], rr = [yl[0], yl[1], yl[2]], vv = [yl[3], yl[4], yl[5]];
    const ei = !!(r.stopEvent && r.stopEvent.name === 'EI');
    const out = { ei, tEnd: r.tEnd, rvp: vacPerigee(rr, vv), dvv, rEI: rr, vEI: vv, hk: (Math.sign(vdot(vcross(rr, vv), kRefTEI)) || 1) * vnorm(vcross(rr, vv)) };
    if (ei) { const tl = r.tEnd + tEntryDur, sd = siteE(tl), h = vunit(vcross(rr, vv));
      out.fpa = fpaDeg(rr, vv); out.cross = Math.asin(clamp(vdot(h, sd), -1, 1)) * RAD;
      out.along = (Math.atan2(vdot(vcross(vunit(rr), sd), h), vdot(vunit(rr), sd)) - thetaRange) * RAD; }
    return out;
  };
  // geographic landing error helper: landing point = EI point carried downrange by the entry range
  const geoErr = (o) => { // returns {cross, along} in degrees using RA/Dec of the landing point
    const tl = o.tEnd + tEntryDur;
    const L = vrot(vunit(o.rEI), vunit(vcross(o.rEI, o.vEI)), thetaRange);
    const Le = eclToEq(L), dec = Math.asin(clamp(Le[2], -1, 1)) * RAD, ra = Math.atan2(Le[1], Le[0]) * RAD;
    const raSite = (gmst(tl) * RAD + splash.lon);
    return { cross: dec - splash.lat, along: wrapPi((raSite - ra) * DEG) * RAD };
  };
  const evalTEI2 = (tb, x) => { const o = evalTEI(tb, x); if (o.ei) { Object.assign(o, geoErr(o)); } return o; };
  let bestT = null;
  for (let tb = tTEInom - per * 0.5; tb <= tTEInom + per * 0.5; tb += 150) {
    const o = evalTEI(tb, [dv0, 0, 0]); const back = o.ei || (o.tEnd - tb < 6 * 24 * H - 60);
    const sc = Math.abs(o.rvp - rvpT) + (back ? 0 : 1e6) + Math.abs((o.tEnd - tb) - tReturn) / H * 10;
    if (!bestT || sc < bestT.sc) bestT = { tb, sc, o };
  }
  let tTEI = bestT.tb;
  { const g = goldenMin(tb => { const o = evalTEI(tb, [dv0, 0, 0]); return Math.abs(o.rvp - rvpT) + ((o.ei || (o.tEnd - tb < 6 * 24 * H - 60)) ? 0 : 1e6); }, tTEI - 150, tTEI + 150, 14); tTEI = g.x; }
  // tangential TEI; the burn epoch controls the entry corridor (vacuum perigee), the magnitude controls return time
  const hSign = Math.sign(evalTEI(tTEI, [dv0, 0, 0]).hk) || 1;
  // g(tb) = signed |h| of the return conic minus its target; only trajectories that come back count
  const gTb = (tb, dvt) => { const o = evalTEI(tb, [dvt, 0, 0]); const back = o.ei || (o.tEnd - tb < 6 * 24 * H - 60); return back ? o.hk - hSign * hTgtTEI : NaN; };
  const tbSolve = (dvt, tbG) => { // bracket the root near tbG on a 100-s grid, then Illinois regula falsi
    const xs = [], gs = [];
    for (let k = -6; k <= 6; k++) { xs.push(tbG + k * 100); gs.push(gTb(tbG + k * 100, dvt)); }
    let best = null;
    for (let i = 0; i < xs.length - 1; i++) {
      if (!isFinite(gs[i]) || !isFinite(gs[i + 1]) || Math.sign(gs[i]) === Math.sign(gs[i + 1])) continue;
      if (Math.abs(gs[i] - gs[i + 1]) > 3 * hTgtTEI) continue; // discontinuity, not a root
      const d = Math.abs(xs[i] + 50 - tbG); if (!best || d < best.d) best = { d, a: xs[i], b: xs[i + 1], ga: gs[i], gb: gs[i + 1] };
    }
    if (!best) return null;
    let { a, b, ga, gb } = best, side = 0, x = a;
    for (let k = 0; k < 14; k++) {
      x = b - gb * (b - a) / (gb - ga); const gx = gTb(x, dvt);
      if (!isFinite(gx)) return null;
      if (Math.abs(gx) < 40 || Math.abs(b - a) < 0.5) return x;
      if (Math.sign(gx) === Math.sign(gb)) { b = x; gb = gx; if (side === -1) ga /= 2; side = -1; } else { a = x; ga = gx; if (side === 1) gb /= 2; side = 1; }
    }
    return x;
  };
  let dvBest = dv0, roots = [];
  { // continuation in Δv from dv0, upward then downward, following the root tb(dv)
    const seq = [];
    const walk = (dir, n) => { let tbg = tTEI; for (let k = 0; k <= n; k++) { const dv = dv0 + dir * k * 0.02; if (dir < 0 && k === 0) continue; const tb = tbSolve(dv, tbg);
      if (globalThis.DEBUG) { const oo = tb == null ? null : evalTEI2(tb, [dv, 0, 0]); console.log('TEIscan', dv.toFixed(3), tb == null ? 'tb-fail' : ((tb - tTEI).toFixed(0) + 's'), oo && oo.ei, oo && oo.along && oo.along.toFixed(1), oo && ((oo.tEnd - tb) / 3600).toFixed(1), oo && oo.rvp.toFixed(0)); }
      if (tb == null) break; tbg = tb; const o = evalTEI2(tb, [dv, 0, 0]); if (!o.ei) break; seq.push({ dv, tb, o }); } };
    walk(1, 20); walk(-1, 4);
    seq.sort((p, q) => p.dv - q.dv);
    for (let i = 0; i + 1 < seq.length; i++) {
      const p = seq[i], q = seq[i + 1]; if (q.dv - p.dv > 0.021) continue;
      if (Math.sign(p.o.along) !== Math.sign(q.o.along) && Math.abs(p.o.along - q.o.along) < 90) {
        const f = p.o.along / (p.o.along - q.o.along); roots.push({ dv: p.dv + f * (q.dv - p.dv), tb: p.tb + f * (q.tb - p.tb), tof: p.o.tEnd + f * (q.o.tEnd - p.o.tEnd) - (p.tb + f * (q.tb - p.tb)) });
      }
    }
  }
  let tb0 = tTEI;
  if (roots.length) { roots.sort((a, b) => Math.abs(a.tof - tReturn) - Math.abs(b.tof - tReturn)); dvBest = roots[0].dv; tb0 = roots[0].tb; }
  const Ftei = x => { const o = evalTEI2(tb0 + x[1] * 100, [x[0], 0, 0]); if (!o.ei) return [(o.rvp - rvpT) / 30, 0]; return [(o.fpa - (entryCfg.fpa ?? -6.5)) * 2, o.along]; };
  let solT = newtonSolve(Ftei, [dvBest, 0], { h: 1e-5, tol: 0.01, maxIt: 20, maxStep: 0.5 });
  let dvnT = 0;
  { // optional: also null the cross-range (landing latitude) with an out-of-plane component, if affordable
    const F3 = x => { const o = evalTEI2(tb0 + x[1] * 100, [x[0], 0, x[2]]); if (!o.ei) return [(o.rvp - rvpT) / 30, 0, 0]; return [(o.fpa - (entryCfg.fpa ?? -6.5)) * 2, o.along, o.cross]; };
    const s3 = newtonSolve(F3, [solT.x[0], solT.x[1], 0], { h: 1e-5, tol: 0.02, maxIt: 20, maxStep: 0.25 });
    const dvA = Math.hypot(s3.x[0], s3.x[2]);
    if (globalThis.DEBUG) console.log('TEI cross', s3.norm, s3.x, dvA, solT.x[0]);
    if (s3.ok && dvA < solT.x[0] * 1.3) { solT = { ...solT, x: [s3.x[0], s3.x[1]], ok: true }; dvnT = s3.x[2]; }
  }
  tTEI = tb0 + solT.x[1] * 100;
  solT.x = [solT.x[0], 0, dvnT, 0];
  if (globalThis.DEBUG) console.log('TEI', { dv0, dvBest, roots: roots.map(r => [r.dv.toFixed(4), (r.tof / 3600).toFixed(1)]), norm: solT.norm, hist: solT.hist.map(v => +v.toFixed(3)), x: solT.x });
  if (!solT.ok) M.notes.push('TEI targeting converged approximately; the return correction trims the remainder.');
  tTEI += solT.x[3] * 100;
  const xT3 = [solT.x[0], solT.x[1], solT.x[2]];
  const sT = resState(orbRes, tTEI), selT = seleno(tTEI, sT);
  const dvTEIvec = evalTEI(tTEI, xT3).dvv;
  const epsTEI = (() => { const vv = vadd(selT.v, dvTEIvec); return vdot(vv, vv) / 2 - MU_M / vnorm(selT.r); })();
  const DT = propForDv(sT[6], vnorm(dvTEIvec), orbEng.isp) / (orbEng.thrust / (orbEng.isp * G0));
  const fbE = finiteBurn({ tCenter: tTEI, startState: tt => Array.from(resState(orbRes, tt)), engine: orbEng, dirLaw: (tI, y0) => localDirLaw(selT.r, selT.v, vunit(dvTEIvec), 'moon'), D0: DT, metric: (ye, te) => energySel(te, ye) - epsTEI, maxProp: P.tankOf(orbEngId).propLeft });
  { const resC = cisInt(t, y, fbE.tIgn, {}); ship.add(resToSeg(resC, 'lunar orbit')); }
  M.phase(tLOIend - (cfg.loi?.circ ? 4 * H : 0), fbE.tIgn, 'Lunar orbit', '#43aa8b');
  ship.add(resToSeg(fbE.res, 'trans-Earth injection', { stage: orbEngId }, fbE.burn));
  const uE = fbE.res.y[0][6] - fbE.res.y[fbE.res.y.length - 1][6]; P.tankOf(orbEngId).propLeft -= uE;
  const dE = dvForProp(fbE.res.y[0][6], uE, orbEng.isp) * 1000;
  M.burn({ name: 'TEI — trans-Earth injection', t: fbE.tIgn, dur: fbE.D, dv: dE, engine: orbEng.name, isp: orbEng.isp, prop: uE, m0: fbE.res.y[0][6], obj: 'ship', propType: orbEng.prop });
  M.ev(fbE.tIgn, 'ship', 'Trans-Earth injection', `${EXPLAIN.tei} ${fmtDur(fbE.D)} burn, Δv ${dE.toFixed(0)} m/s.`, 'burn');
  if (fbE.short) M.warnings.push('Insufficient propellant for trans-Earth injection — the crew would be stranded in lunar orbit.');
  t = fbE.res.tEnd; y = Array.from(fbE.res.y[fbE.res.y.length - 1]);
  return finishReturn(M, cfg, SC, P, ship, t0, t, y, ref, rvpT, progress, fbE.tIgn);
}
// --------------------------------------------------------------------------
// return coast → MCC → CM/SM sep → entry → splashdown
const crewOf = cfg => (cfg.crew || 0) > 0;
function finishReturn(M, cfg, SC, P, ship, t0, t, y, ref, rvpT, progress, tDepart) {
  const H = 3600, entryCfg = cfg.entry || {}, splash = cfg.splash;
  const capsuleId = SC.capsule;
  const tEntryDur = ref ? ref.dur : 800, thetaRange = ref ? ref.range : 0.35;
  const siteE = (tt) => vunit(sitePosEcl('earth', splash.lat, splash.lon, 0, tt));
  progress('Return coast & entry targeting…');
  const tMcc = t + (cfg.returnMccAfter ?? 15) * H;
  const r0 = cisInt(t, y, tMcc, {}); ship.add(resToSeg(r0, 'transearth coast')); t = r0.tEnd; y = Array.from(r0.y[r0.y.length - 1]);
  const run = (dv) => { const y0 = [...y]; y0[3] += dv[0]; y0[4] += dv[1]; y0[5] += dv[2]; return cisInt(tMcc, y0, tMcc + 8 * 24 * H, { events: [evEI(), evPerigee(80000)], rtol: 1e-9, atol: 1e-6, hmax: 3600 }); };
  const geoE = (rr, vv, tEI) => { const tl = tEI + tEntryDur; const Lp = vrot(vunit(rr), vunit(vcross(rr, vv)), thetaRange); const Le = eclToEq(Lp);
    const ra = Math.atan2(Le[1], Le[0]) * RAD, dec = Math.asin(clamp(Le[2], -1, 1)) * RAD; return { along: wrapPi((gmst(tl) * RAD + splash.lon - ra) * DEG) * RAD, cross: dec - splash.lat }; };
  const F = dv => {
    const r = run(dv); const yl = r.y[r.y.length - 1], rr = [yl[0], yl[1], yl[2]], vv = [yl[3], yl[4], yl[5]];
    if (!(r.stopEvent && r.stopEvent.name === 'EI')) return [(vacPerigee(rr, vv) - rvpT) / 30, 0];
    const g = geoE(rr, vv, r.tEnd);
    return [(fpaDeg(rr, vv) - (entryCfg.fpa ?? -6.5)) * 2, g.along];
  };
  let sol = newtonSolve(F, [0, 0, 0], { h: 2e-6, tol: 0.01, maxIt: 16, maxStep: 0.03 });
  if (!sol.ok || vnorm(sol.x) > 0.05) {
    const F1 = dv => [F(dv)[0]];
    sol = newtonSolve(F1, [0, 0, 0], { h: 2e-6, tol: 0.01, maxIt: 16, maxStep: 0.03 });
    M.notes.push('Return correction trims only the entry angle; the splashdown point follows from the return trajectory.');
  }
  const dvm = sol.x, mag = vnorm(dvm) * 1000;
  const engId = cfg.lifeboat || SC.prop.orbiter;
  let pm = { prop: 0, dur: 0, engine: '—', isp: 0 };
  if (P.mods[engId] && P.mods[engId].attached) pm = P.burn(engId, y[6], mag / 1000);
  M.burn({ name: 'MCC — return correction', t: tMcc, dur: pm.dur, dv: mag, engine: pm.engine, isp: pm.isp, prop: pm.prop, m0: y[6], obj: 'ship', propType: pm.propType });
  M.ev(tMcc, 'ship', 'Return mid-course correction', `Fine-tunes the entry corridor: the flight-path angle at entry must be ≈ ${(entryCfg.fpa ?? -6.5).toFixed(1)}° (too steep → excessive g and heating; too shallow → skip back out). Δv ${mag.toFixed(1)} m/s.`, 'burn', { dv: mag });
  y[3] += dvm[0]; y[4] += dvm[1]; y[5] += dvm[2]; y[6] -= pm.prop;
  const rEI = cisInt(tMcc, y, tMcc + 8 * 24 * H, { events: [evEI()] });
  if (!rEI.stopEvent) { ship.add(resToSeg(rEI, 'transearth coast')); M.warnings.push('The return trajectory misses the atmosphere.'); M.finalize(); return M; }
  const tEI = rEI.stopEvent.t;
  // CM/SM separation 15 min before EI
  const tSep = tEI - (cfg.smSepBeforeEI ?? 15) * 60;
  ship.add(new SampleSeg('earth', integToSamples(resUntil(rEI, tSep), () => ({ phase: 'transearth coast' }))));
  const yS = resState(rEI, tSep);
  const capM = P.massOf([capsuleId]);
  if (SC.orbiter && SC.orbiter.length > 1) {
    const sm = M.addObj(new MObject('sm', cfg.smName || 'Service module', { kind: 'stage', model: SC.model, color: '#aaa' }));
    sm.setConfig(tSep, 'sc', { key: 'sc', sc: SC.model, parts: ['service'] });
    const rs = cisInt(tSep, [yS[0], yS[1], yS[2], yS[3] - 0.0015 * yS[3] / Math.hypot(yS[3], yS[4], yS[5]), yS[4] - 0.0015 * yS[4] / Math.hypot(yS[3], yS[4], yS[5]), yS[5] - 0.0015 * yS[5] / Math.hypot(yS[3], yS[4], yS[5]), yS[6] - capM], tSep + 3 * H, { events: [{ name: 'burnup', dir: -1, terminal: true, g: (tt, yy) => Math.hypot(yy[0], yy[1], yy[2]) - (R_E + 70) }] });
    sm.add(resToSeg(rs, 'service module (burns up on entry)'));
    sm.setConfig(tSep, 'sc', { key: 'sc', sc: SC.model, parts: ['service'], damaged: !!cfg.lifeboat });
  }
  M.ev(tSep, 'ship', cfg.smSepName || 'Crew module / service module separation', cfg.smSepDesc || 'Only the capsule with its heat shield will enter the atmosphere; the service module burns up.', 'sep');
  if (cfg.lifeboat) {
    ship.setConfig(tSep, 'sc', { key: 'sc', sc: SC.model, parts: ['capsule', 'lander'] });
    const tLm = tEI - (cfg.lifeboatJettisonBeforeEI ?? 1.18) * H;
    const yLm = resState(rEI, tLm);
    const lm = M.addObj(new MObject('lifeboat', cfg.lifeboatName || 'Lunar Module (lifeboat)', { kind: 'stage', model: SC.model, color: '#b9a3ff' }));
    lm.setConfig(tLm, 'sc', { key: 'sc', sc: SC.model, parts: ['lander'] });
    const rl = cisInt(tLm, [yLm[0], yLm[1], yLm[2], yLm[3] * 0.99995, yLm[4] * 0.99995, yLm[5] * 0.99995, P.massOf(SC.lander)], tLm + 3 * H, { events: [{ name: 'burnup', dir: -1, terminal: true, g: (tt, yy) => Math.hypot(yy[0], yy[1], yy[2]) - (R_E + 70) }] });
    lm.add(resToSeg(rl, 'LM jettisoned — burns up over the Pacific'));
    M.ev(tLm, 'ship', cfg.lifeboatJettisonName || 'Lifeboat jettison', cfg.lifeboatJettisonDesc || 'The crew climbs back into the command module and releases the lunar module.', 'sep');
    ship.setConfig(tLm, 'capsule', { key: 'capsule', sc: SC.model });
  } else ship.setConfig(tSep, 'capsule', { key: 'capsule', sc: SC.model });
  const rC = cisInt(tSep, [yS[0], yS[1], yS[2], yS[3], yS[4], yS[5], capM], tEI + 60, { events: [evEI()] });
  ship.add(resToSeg(rC, 'final approach'));
  const yE = rC.stopEvent ? rC.stopEvent.y : rC.y[rC.y.length - 1];
  const tE = rC.stopEvent ? rC.stopEvent.t : rC.tEnd;
  const vEI = vnorm(vsub([yE[3], yE[4], yE[5]], vcross(bodyOmegaEcl('earth', tE), [yE[0], yE[1], yE[2]])));
  M.ev(tE, 'ship', 'Entry interface (122 km)', `${EXPLAIN.entry} Speed ${Math.hypot(yE[3], yE[4], yE[5]).toFixed(2)} km/s, flight-path angle ${fpaDeg([yE[0], yE[1], yE[2]], [yE[3], yE[4], yE[5]]).toFixed(2)}°.`, 'entry');
  // ---------------- entry with bank-angle targeting ----------------
  progress('Atmospheric entry…');
  const cap = SC.modules[capsuleId];
  const entryRun = (bank, bank2) => simulateEntry({ body: 'earth', t0: tE, r0: [yE[0], yE[1], yE[2]], v0: [yE[3], yE[4], yE[5]], m0: capM, diam: cap.heat.diam, cd: cap.heat.cd, LD: cap.heat.LD, rn: cap.heat.rn, bank, bank2, skip: !!entryCfg.skip, chutes: cap.heat.chutes, maxTime: entryCfg.skip ? 6000 : 3000 });
  const missF = (e) => gcAngle(e.ll[0], e.ll[1], splash.lat, splash.lon) * R_E;
  let best = null;
  const gLim = crewOf(cfg) ? 7.0 : 12;
  const cost = e => missF(e) + Math.max(0, e.maxG - gLim) * 400 + (e.landed ? 0 : 5000);
  for (let b = 0; b <= 120; b += 7.5) { const e = entryRun(b, b + 20); const d = cost(e); if (!best || d < best.d) best = { b, d, e }; }
  const g = goldenMin(b => cost(entryRun(b, b + 20)), Math.max(0, best.b - 7.5), Math.min(140, best.b + 7.5), 18);
  const ent = entryRun(g.x, g.x + 20);
  ship.add(new SampleSeg('earth', ent.samples, { phase: 'entry' }));
  for (const e of ent.events) M.ev(e.t, 'ship', e.name, e.desc, e.kind);
  M.ev(ent.tPeakHeat, 'ship', 'Peak heating', `Stagnation heat flux ≈ ${ent.maxHeat.toFixed(0)} W/cm² (Sutton–Graves estimate). The ablative heat shield chars and erodes, carrying the heat away.`, 'heat');
  M.ev(ent.tPeakG, 'ship', 'Peak deceleration', `${ent.maxG.toFixed(1)} g — the crew is pressed into their couches.`, 'gload');
  ship.setConfig(ent.samples.find(s => s.chute >= 1)?.t ?? ent.t, 'capsule', { key: 'capsule', sc: SC.model, chutes: 1 });
  const tMain = ent.samples.find(s => s.chute >= 2)?.t; if (tMain) ship.setConfig(tMain, 'capsule', { key: 'capsule', sc: SC.model, chutes: 2 });
  const miss = missF(ent);
  M.ev(ent.t, 'ship', cfg.splashName || 'Splashdown', `${cfg.splashDesc || EXPLAIN.splash} Landing point ${ent.ll[0].toFixed(2)}°, ${ent.ll[1].toFixed(2)}° — ${miss.toFixed(0)} km from the planned recovery area (${splash.name || 'recovery zone'}).`, 'landing');
  ship.add(new SurfaceSeg('earth', ent.t, ent.t + 2 * H, ent.ll[0], ent.ll[1], 0, capM, { extra: { phase: 'recovery' } }));
  M.phase(tDepart, tE, 'Return to Earth', '#f15bb5');
  M.phase(tE, ent.t, 'Entry & splashdown', '#ff5d5d');
  M.summary.entry = { vEI, maxG: ent.maxG, maxHeat: ent.maxHeat, miss, ll: ent.ll, bank: g.x };
  M.finalize();
  return M;
}
// --------------------------------------------------------------------------
function finishFlyby(M, cfg, SC, P, ship, t0, tMcc, y, rpMoonT, rvpT, ref, scripted, progress) {
  const H = 3600; let t = tMcc;
  // integrate to perilune
  let res = cisInt(t, y, t + 8 * 24 * H, { events: [evPerilune()] });
  const tPeri = res.stopEvent ? res.stopEvent.t : res.tEnd;
  const sel = seleno(tPeri, res.stopEvent.y);
  for (let i = 0; i < res.t.length; i++) { const m = moonGeo(res.t[i]).r; if (vnorm(vsub([res.y[i][0], res.y[i][1], res.y[i][2]], m)) < BODIES.moon.soi) { M.ev(res.t[i], 'ship', 'Lunar sphere of influence', EXPLAIN.soiMoon, 'soi'); break; } }
  M.phase(M.burns.find(b => b.name.startsWith('TLI'))?.t ?? tMcc, tPeri - 4 * H, 'Translunar coast', '#9b5de5');
  // scripted events (Apollo 13) before perilune: explosion / DPS burn
  let yCur = y;
  for (const e of scripted.filter(e => e.met && t0 + e.met * H < tPeri)) {
    if (e.kind === 'emergency') M.ev(t0 + e.met * H, 'ship', e.name, e.desc, 'emergency', { fx: 'venting' });
  }
  const dpsBurn = scripted.find(e => e.type === 'freeReturnBurn');
  if (dpsBurn) {
    const tb = t0 + dpsBurn.met * H;
    const rr = cisInt(t, y, tb, {}); ship.add(resToSeg(rr, 'translunar coast (hybrid trajectory)')); t = rr.tEnd; yCur = Array.from(rr.y[rr.y.length - 1]);
    const runFR = dv => { const y0 = [...yCur]; y0[3] += dv[0]; y0[4] += dv[1]; y0[5] += dv[2];
      const r1 = cisInt(t, y0, t + 6 * 24 * H, { events: [evPerilune()], rtol: 1e-9, atol: 1e-6, hmax: 3600 }); if (!r1.stopEvent) return [1e3, 1e3];
      const sp = seleno(r1.stopEvent.t, r1.stopEvent.y);
      const r2 = cisInt(r1.stopEvent.t, r1.stopEvent.y, r1.stopEvent.t + 7 * 24 * H, { events: [evPerigee(), evEI()], rtol: 1e-9, atol: 1e-6, hmax: 3600 });
      const yl = r2.y[r2.y.length - 1];
      return [(vnorm(sp.r) - rpMoonT) / 50, (vacPerigee([yl[0], yl[1], yl[2]], [yl[3], yl[4], yl[5]]) - rvpT) / 50]; };
    const so = newtonSolve(runFR, [0, 0, 0], { h: 2e-6, tol: 2e-3, maxIt: 20, maxStep: 0.1 });
    const mag = vnorm(so.x) * 1000, engId = dpsBurn.engine || SC.prop.lander;
    const pm = P.burn(engId, yCur[6], mag / 1000);
    M.burn({ name: dpsBurn.name, t, dur: pm.dur, dv: mag, engine: pm.engine, isp: pm.isp, prop: pm.prop, m0: yCur[6], obj: 'ship', propType: pm.propType });
    M.ev(t, 'ship', dpsBurn.name, `${dpsBurn.desc} Δv ${mag.toFixed(1)} m/s.`, 'burn');
    yCur[3] += so.x[0]; yCur[4] += so.x[1]; yCur[5] += so.x[2]; yCur[6] -= pm.prop;
  }
  const segStart = t;
  res = cisInt(t, yCur, t + 8 * 24 * H, { events: [evPerilune()] });
  const tP = res.stopEvent.t, yP = res.stopEvent.y, sP = seleno(tP, yP);
  const altP = vnorm(sP.r) - R_MOON;
  const dEarthMax = (() => { let m = 0, tm = tP; const r2 = cisInt(tP - 6 * H, Array.from(resState(res, tP - 6 * H)), tP + 6 * H, {}); for (let i = 0; i < r2.t.length; i++) { const d = Math.hypot(r2.y[i][0], r2.y[i][1], r2.y[i][2]); if (d > m) { m = d; tm = r2.t[i]; } } return { m, tm }; })();
  ship.add(resToSeg(res, 'lunar flyby approach'));
  t = tP; yCur = Array.from(yP);
  M.ev(tP - 0.6 * H, 'ship', 'Loss of signal (behind the Moon)', 'The Moon blocks the radio path to Earth.', 'los');
  M.ev(tP, 'ship', 'Closest approach to the Moon', `${EXPLAIN.freeReturn} Altitude ${altP.toFixed(0)} km above the far side, speed relative to the Moon ${vnorm(sP.v).toFixed(2)} km/s.`, 'flyby');
  M.ev(dEarthMax.tm, 'ship', 'Maximum distance from Earth', `${Math.round(dEarthMax.m).toLocaleString()} km from Earth’s centre (${Math.round(dEarthMax.m - R_E).toLocaleString()} km above the surface).`, 'record');
  for (const e of scripted.filter(e => e.when === 'flyby')) M.ev(tP + (e.dt || 0) * H, 'ship', e.name, e.desc, e.kind || 'info');
  M.summary.flyby = { alt: altP, maxDist: dEarthMax.m };
  // optional post-perilune burn (Apollo 13 PC+2): targets return
  const pc2 = scripted.find(e => e.type === 'pc2');
  let tDepart = tP;
  if (pc2) {
    const tb = tP + pc2.dt * H;
    const rr = cisInt(t, yCur, tb, {}); ship.add(resToSeg(rr, 'leaving the Moon')); t = rr.tEnd; yCur = Array.from(rr.y[rr.y.length - 1]);
    // solve prograde-ish burn targeting splashdown at given time
    const splash = cfg.splash, entryCfg = cfg.entry || {};
    const tEntryDur = ref.dur, thetaRange = ref.range;
    const siteE = (tt) => vunit(sitePosEcl('earth', splash.lat, splash.lon, 0, tt));
    const tEIgoal = t0 + pc2.eiMET * H;
    const run = (dv) => { const y0 = [...yCur]; y0[3] += dv[0]; y0[4] += dv[1]; y0[5] += dv[2]; return cisInt(t, y0, t + 6 * 24 * H, { events: [evEI(), evPerigee(80000)], rtol: 1e-9, atol: 1e-6, hmax: 3600 }); };
    const Fp = dv => { const r = run(dv); const yl = r.y[r.y.length - 1], rr2 = [yl[0], yl[1], yl[2]], vv = [yl[3], yl[4], yl[5]];
      if (!(r.stopEvent && r.stopEvent.name === 'EI')) return [(vacPerigee(rr2, vv) - rvpT) / 30, (r.tEnd - tEIgoal) / 3600, 0];
      return [(fpaDeg(rr2, vv) - (entryCfg.fpa ?? -6.5)) * 2, (r.tEnd - tEIgoal) / 3600, Math.asin(clamp(vdot(vunit(vcross(rr2, vv)), siteE(r.tEnd + tEntryDur)), -1, 1)) * RAD]; };
    const vdir = vunit(vsub(yCur.slice(3, 6), moonGeo(t).v));
    const x0 = vscale(vdir, pc2.dvGuess / 1000);
    const sol = newtonSolve(Fp, x0, { h: 2e-6, tol: 0.02, maxIt: 18, maxStep: 0.1 });
    const dvv = sol.x, mag = vnorm(dvv) * 1000;
    const engId = pc2.engine || SC.prop.lander;
    const pm = P.burn(engId, yCur[6], mag / 1000);
    M.burn({ name: pc2.name, t, dur: pm.dur, dv: mag, engine: pm.engine, isp: pm.isp, prop: pm.prop, m0: yCur[6], obj: 'ship', propType: pm.propType });
    M.ev(t, 'ship', pc2.name, `${pc2.desc} Δv ${mag.toFixed(0)} m/s, ${fmtDur(pm.dur)} burn.`, 'burn');
    yCur[3] += dvv[0]; yCur[4] += dvv[1]; yCur[5] += dvv[2]; yCur[6] -= pm.prop;
    tDepart = t;
  }
  // continue home
  M.phase(tP - 4 * H, tP + 4 * H, 'Lunar flyby', '#43aa8b');
  return finishReturn(M, cfg, SC, P, ship, t0, t, yCur, ref, rvpT, progress, tP + 4 * H);
}
// --------------------------------------------------------------------------
// LANDING: undock, DOI, powered descent, surface stay, ascent, rendezvous
function doLanding(M, cfg, SC, P, ship, t0, getState, setState, progress) {
  const H = 3600; let { t, y } = getState();
  const site = cfg.landing, mu = MU_M;
  const landerIds = SC.lander, ascIds = SC.ascender || [], orbIds = SC.orbiter;
  const dsId = SC.prop.lander, asId = SC.prop.ascender;
  const tUndock = cfg.undockMET != null ? t0 + cfg.undockMET * H : t + (cfg.orbitsBeforeDescent ?? 10) * 2 * H;
  const tPDInom = cfg.pdiMET != null ? t0 + cfg.pdiMET * H : tUndock + 2.3 * H;
  progress('Lunar orbit: planning descent…');
  // orbit propagation through landing window
  const oRes = cisInt(t, y, tPDInom + 6 * H, {});
  const per = 2 * Math.PI * Math.sqrt(Math.pow(vnorm(seleno(t, y).r), 3) / mu);
  // range angle of the powered descent (estimate from lander T/W)
  const mLander = P.massOf(landerIds), eng = P.engineOf(dsId);
  const aAvg = eng.thrust / (mLander * 0.8) / 1000;
  const vPDI = Math.sqrt(mu / (R_MOON + 15)) * 1.005;
  const thetaPDI = clamp((vPDI * vPDI / (2 * aAvg * 0.72)) / R_MOON, 0.12, 0.6);
  const tDescEst = vPDI / (aAvg * 0.72) + 60;
  // find PDI time: orbiter angle to site (in-plane) equals thetaPDI
  const phi = (tt) => { const s = resState(oRes, tt), sel = seleno(tt, s); const u = vunit(sel.r), h = vunit(vcross(sel.r, sel.v)); let sp = vunit(sitePosEcl('moon', site.lat, site.lon, 0, tt + tDescEst)); sp = vunit(vsub(sp, vscale(h, vdot(sp, h)))); return Math.atan2(vdot(vcross(u, sp), h), vdot(u, sp)); };
  let tPDI = null, bestD = Infinity;
  for (let tt = tPDInom - per * 1.1; tt < tPDInom + per * 1.1; tt += 15) {
    const a = phi(tt) - thetaPDI, b = phi(tt + 15) - thetaPDI;
    if (a > 0 && b <= 0 && Math.abs(a - b) < 1) { const tr = tt + 15 * a / (a - b); if (Math.abs(tr - tPDInom) < bestD) { bestD = Math.abs(tr - tPDInom); tPDI = tr; } }
  }
  if (!tPDI) tPDI = tPDInom;
  // DOI half an orbit earlier (Hohmann to 15 km perilune)
  const tDOI = tPDI - per / 2 * 0.985;
  const tUnd = Math.min(tUndock, tDOI - 0.6 * H);
  // coast to undock (whole stack)
  { const r = cisInt(t, y, tUnd, {}); ship.add(resToSeg(r, 'lunar orbit')); t = r.tEnd; y = Array.from(r.y[r.y.length - 1]); }
  const mL = P.massOf(landerIds);
  const lander = M.addObj(new MObject('lander', cfg.landerName || 'Lander', { crew: cfg.landerCrew || 0, model: SC.model, color: '#b9a3ff', primary: false }));
  lander.setConfig(tUnd, 'sc', { key: 'sc', sc: SC.model, parts: ['lander'] });
  ship.setConfig(tUnd, 'sc', { key: 'sc', sc: SC.model, parts: ['orbiter'] });
  M.ev(tUnd, 'lander', cfg.undockName || 'Undocking', cfg.undockDesc || 'The lander separates from the orbiter. One crew member (or the orbiter) stays in lunar orbit.', 'sep');
  let yL = [...y]; yL[6] = mL; y[6] -= mL;
  // lander: coast to DOI, burn
  { const r = cisInt(t, yL, tDOI, {}); lander.add(resToSeg(r, 'lunar orbit (separated)')); yL = Array.from(r.y[r.y.length - 1]); }
  const sD = seleno(tDOI, yL), rD = vnorm(sD.r), aN = (rD + R_MOON + (cfg.pdiAlt ?? 15)) / 2;
  const vN = Math.sqrt(mu * (2 / rD - 1 / aN));
  const vt = vunit(vsub(sD.v, vscale(vunit(sD.r), vdot(sD.v, vunit(sD.r)))));
  const dvDOIvec = vsub(vscale(vt, vN), sD.v);
  const pD = P.burn(dsId, yL[6], vnorm(dvDOIvec));
  M.burn({ name: 'DOI — descent orbit insertion', t: tDOI, dur: pD.dur, dv: vnorm(dvDOIvec) * 1000, engine: pD.engine, isp: pD.isp, prop: pD.prop, m0: yL[6], obj: 'lander', propType: pD.propType });
  M.ev(tDOI, 'lander', 'Descent orbit insertion', `A ${(vnorm(dvDOIvec) * 1000).toFixed(0)} m/s retro burn lowers the perilune to ~${cfg.pdiAlt ?? 15} km, half an orbit ahead, where powered descent will begin.`, 'burn');
  yL[3] += dvDOIvec[0]; yL[4] += dvDOIvec[1]; yL[5] += dvDOIvec[2]; yL[6] -= pD.prop;
  const rP = cisInt(tDOI, yL, tDOI + per, { events: [evPerilune(5000)] });
  lander.add(resToSeg(rP, 'descent orbit'));
  const tP = rP.stopEvent ? rP.stopEvent.t : tPDI;
  const yP = rP.stopEvent ? rP.stopEvent.y : rP.y[rP.y.length - 1];
  const sP = seleno(tP, yP);
  // powered descent: search tgo
  progress('Powered descent & landing…');
  const engD = P.engineOf(dsId), dryLimit = yP[6] - P.tankOf(dsId).propLeft;
  const sDir = vunit(sitePosEcl('moon', site.lat, site.lon, 0, tP + tDescEst));
  const rangeKm = vangle(sP.r, sDir) * R_MOON;
  let bestD2 = null;
  for (const k of [0.95, 1.05, 1.15, 1.25, 1.35, 1.5]) {
    const tgo = 2 * rangeKm / vnorm(sP.v) * k;
    const d = simulateDescent({ body: 'moon', t0: tP, r0: sP.r, v0: sP.v, m0: yP[6], Tmax: engD.thrust, isp: engD.isp, minThr: engD.minThr ?? 0.1, lat: site.lat, lon: site.lon, elev: site.elev || 0, tgo, dryLimit });
    const sc = (d.landed ? 0 : 1e6) + d.miss * 50 + d.propUsed;
    if (!bestD2 || sc < bestD2.sc) bestD2 = { sc, d, tgo };
  }
  const D = bestD2.d;
  P.tankOf(dsId).propLeft -= D.propUsed;
  const dvPD = dvForProp(yP[6], D.propUsed, engD.isp) * 1000;
  M.burn({ name: 'Powered descent', t: tP, dur: D.t - tP, dv: dvPD, engine: engD.name, isp: engD.isp, prop: D.propUsed, m0: yP[6], obj: 'lander', propType: engD.prop });
  // convert seleno samples to SampleSeg with ref 'moon'
  lander.add(new SampleSeg('moon', D.samples.map(s => ({ ...s, phase: s.phase === 'landed' ? 'touchdown' : 'powered descent' })), { phase: 'powered descent' }));
  M.ev(tP, 'lander', 'Powered descent initiation', `${EXPLAIN.pdi} Starting ${Math.round(rangeKm)} km uprange at ${(vnorm(sP.r) - R_MOON).toFixed(1)} km altitude.`, 'burn');
  for (const e of D.events) M.ev(e.t, 'lander', e.name, e.desc, e.kind);
  if (!D.landed) { M.warnings.push('Powered descent failed to land.'); M.failed = 'landing'; return false; }
  const tLand = D.t;
  const ll = D.ll;
  M.summary.landing = { t: tLand, ll, miss: D.miss, dv: dvPD };
  M.phase(tUnd, tLand, 'Descent', '#ffb703');
  // surface stay
  const stay = (cfg.surfaceStay ?? 21.6) * H;
  const tLiftNom = cfg.ascentMET != null ? t0 + cfg.ascentMET * H : tLand + stay;
  const mOnSurf = yP[6] - D.propUsed;
  for (const e of (cfg.scripted || []).filter(e => e.when === 'surface')) M.ev(e.afterLanding != null ? tLand + e.afterLanding * H : t0 + e.met * H, 'lander', e.name, e.desc, e.kind || 'info');
  if (cfg.profile === 'lunar-landing-oneway') {
    lander.add(new SurfaceSeg('moon', tLand, tLand + 3 * 24 * H, ll[0], ll[1], site.elev || 0, mOnSurf));
    lander.setConfig(tLand, 'sc', { key: 'sc', sc: SC.model, parts: ['lander'], landed: true });
    const r = cisInt(t, y, tLand + 3 * 24 * H, {}); ship.add(resToSeg(r, 'lunar orbit'));
    M.phase(tLand, tLand + 3 * 24 * H, 'Surface operations', '#ffd166');
    setState(r.tEnd, Array.from(r.y[r.y.length - 1]));
    return true;
  }
  // orbiter coasts; check plane for ascent (lunar orbit plane change if needed)
  progress('Surface stay, ascent & rendezvous…');
  let oR = cisInt(t, y, tLiftNom + 8 * H, {});
  const asDesc = SC.modules[SC.prop.ascender] || {};
  // choose liftoff time: orbiter phase lead ~ 15–25° at insertion
  const perO = per;
  const leadAt = (tt) => {
    const s = resState(oR, tt + 430), sel = seleno(tt + 430, s), h = vunit(vcross(sel.r, sel.v));
    let site0 = vunit(sitePosEcl('moon', site.lat, site.lon, 0, tt)); site0 = vunit(vsub(site0, vscale(h, vdot(site0, h))));
    const ins = vrot(site0, h, 9 * DEG);
    return Math.atan2(vdot(vcross(ins, vunit(sel.r)), h), vdot(ins, vunit(sel.r)));
  };
  let tLift = tLiftNom, bL = Infinity;
  for (let tt = tLiftNom - perO * 1.2; tt < tLiftNom + perO * 1.2; tt += 20) {
    const a = leadAt(tt) - 18 * DEG, b = leadAt(tt + 20) - 18 * DEG;
    if (a < 0 && b >= 0 && Math.abs(a - b) < 1) { const tr = tt + 20 * (-a) / (b - a); if (Math.abs(tr - tLiftNom) < bL) { bL = Math.abs(tr - tLiftNom); tLift = tr; } }
  }
  // plane change of orbiter if site is out of plane at liftoff
  const sAtLift = seleno(tLift, resState(oR, tLift));
  const hO = vunit(vcross(sAtLift.r, sAtLift.v)), sDirL = vunit(sitePosEcl('moon', site.lat, site.lon, 0, tLift));
  const outAng = Math.asin(clamp(vdot(hO, sDirL), -1, 1));
  if (Math.abs(outAng) > 0.25 * DEG) {
    const hN = vunit(vsub(hO, vscale(sDirL, vdot(hO, sDirL))));
    const node = vunit(vcross(hO, hN));
    // find node crossing ~ half to one orbit before liftoff
    let tNode = null;
    for (let tt = tLift - 1.6 * perO; tt < tLift - 0.3 * perO; tt += 20) {
      const a = vdot(vunit(seleno(tt, resState(oR, tt)).r), vcross(hO, node)), b = vdot(vunit(seleno(tt + 20, resState(oR, tt + 20)).r), vcross(hO, node));
      if (a * b <= 0) { tNode = tt + 20 * a / (a - b); }
    }
    if (tNode) {
      const r = cisInt(t, y, tNode, {}); ship.add(resToSeg(r, 'lunar orbit')); t = r.tEnd; y = Array.from(r.y[r.y.length - 1]);
      const sN = seleno(t, y); const ang = Math.acos(clamp(vdot(hO, hN), -1, 1));
      const sgn = vdot(vcross(hO, hN), vunit(sN.r)) > 0 ? 1 : -1;
      const vNew = vrot(sN.v, vunit(sN.r), sgn * ang);
      const dvp = vsub(vNew, sN.v);
      const pmp = P.burn(SC.prop.orbiter, y[6], vnorm(dvp));
      M.burn({ name: 'Orbit plane change (orbiter)', t, dur: pmp.dur, dv: vnorm(dvp) * 1000, engine: pmp.engine, isp: pmp.isp, prop: pmp.prop, m0: y[6], obj: 'ship', propType: pmp.propType });
      M.ev(t, 'ship', 'Orbiter plane change', `The Moon rotated under the orbit during the surface stay. A ${(vnorm(dvp) * 1000).toFixed(0)} m/s burn swings the orbit plane by ${(ang * RAD).toFixed(2)}° so it passes over the landing site at liftoff.`, 'burn');
      y[3] += dvp[0]; y[4] += dvp[1]; y[5] += dvp[2]; y[6] -= pmp.prop;
      oR = cisInt(t, y, tLiftNom + 30 * H, {});
    }
  }
  const sL2 = seleno(tLift, resState(oR, tLift)); const hTarget = vunit(vcross(sL2.r, sL2.v));
  // lander: on surface
  lander.add(new SurfaceSeg('moon', tLand, tLift, ll[0], ll[1], site.elev || 0, mOnSurf));
  lander.setConfig(tLand, 'sc', { key: 'sc', sc: SC.model, parts: ['lander'], landed: true, tLand }); // (a lander that works on the surface times it from tLand)
  M.phase(tLand, tLift, 'Surface operations', '#ffd166');
  // descent stage stays forever
  const dsObj = M.addObj(new MObject('descent-stage', cfg.dsName || 'Descent stage (left on surface)', { kind: 'stage', model: SC.model, color: '#d4a017', trail: false }));
  dsObj.setConfig(tLift, 'sc', { key: 'sc', sc: SC.model, parts: ['descent'], landed: true });
  dsObj.add(new SurfaceSeg('moon', tLift, tLift + 60 * 24 * H, ll[0], ll[1], site.elev || 0, P.massOf([dsId])));
  // ascent
  const engA = P.engineOf(asId), tankA = P.tankOf(asId);
  const ascStack = { name: 'Ascent', payload: 0, stages: [{ id: 'AS', name: P.mods[asId].name, prop: 'hypergolic', engine: engA.name, n: 1, thrustSL: engA.thrust, thrustVac: engA.thrust, ispSL: engA.isp, ispVac: engA.isp, dry: P.massOf(ascIds) - tankA.propLeft + (cfg.samples || 0), propMass: tankA.propLeft, propLeft: tankA.propLeft, attached: true, ignited: false, geom: [[3, 2, 2, '#888']] }], jettison: [] };
  const hp = cfg.ascentOrbit?.hp ?? 17, ha = cfg.ascentOrbit?.ha ?? 83;
  const AS = simulateAscent({ body: 'moon', t0: tLift, lat: ll[0], lon: ll[1], stack: ascStack, target: { normal: hTarget, hp, ha }, vert: 10, kick: 5, closedLoopAt: 12, dt: 0.2, maxTime: 1200, sampleDt: 1 });
  if (!AS.ok) { M.warnings.push('Lunar ascent failed to reach orbit.'); }
  const usedA = tankA.propLeft - AS.stack.stages[0].propLeft; tankA.propLeft -= usedA;
  const dvA = dvForProp(ascStack.stages[0].dry + ascStack.stages[0].propMass, usedA, engA.isp) * 1000;
  M.burn({ name: 'Lunar ascent', t: tLift, dur: AS.t - tLift, dv: dvA, engine: engA.name, isp: engA.isp, prop: usedA, m0: ascStack.stages[0].dry + ascStack.stages[0].propMass, obj: 'lander', propType: engA.prop });
  const ascObj = lander; // continue same object
  ascObj.setConfig(tLift, 'sc', { key: 'sc', sc: SC.model, parts: ['ascent'] });
  ascObj.add(new SampleSeg('moon', AS.samples.map(s => ({ ...s, phase: 'lunar ascent' })), { phase: 'ascent' }));
  M.ev(tLift, 'lander', cfg.liftoffName || 'Lunar liftoff', `${EXPLAIN.ascent} Δv ≈ ${dvA.toFixed(0)} m/s to reach orbit; ascent lasts ${fmtDur(AS.t - tLift)}.`, 'launch');
  M.ev(AS.t, 'lander', 'Lunar orbit insertion (ascent)', `Orbit ${AS.hpAch.toFixed(0)} × ${AS.haAch.toFixed(0)} km — below and behind the orbiter.`, 'insertion');
  // rendezvous: lander geocentric state
  const tI = AS.t; const gI = geoFromSeleno(tI, AS.r, AS.v);
  let yA = [...gI.r, ...gI.v, AS.m];
  const minDelay = (cfg.rendezvousMinDelay ?? 0.6) * H;
  const oR2 = cisInt(t, y, tI + minDelay + 30 * H, {});
  const lR = cisInt(tI, yA, tI + minDelay + 30 * H, {});
  let best = null;
  const perA = 2 * Math.PI * Math.sqrt(Math.pow(R_MOON + (hp + ha) / 2, 3) / mu);
  for (let tt = tI + minDelay; tt < tI + minDelay + 26 * H; tt += 60) {
    const a = seleno(tt, resState(lR, tt)); const tof = 0.37 * perA; const b = seleno(tt + tof, resState(oR2, tt + tof));
    const Lb = lambert(a.r, b.r, tof, mu, vunit(vcross(a.r, a.v))); if (!Lb) continue;
    const tot = vnorm(vsub(Lb.v1, a.v)) + vnorm(vsub(b.v, Lb.v2));
    if (!best || tot < best.tot) best = { tt, tof, tot, Lb, a, b };
    if (best && tt > best.tt + 1.2 * perA && best.tot < 0.08) break;
  }
  const tTPI = best.tt, tDock = best.tt + best.tof;
  ascObj.add(resToSeg(resUntil(lR, tTPI), 'catch-up orbit'));
  const dv1 = vsub(best.Lb.v1, best.a.v);
  const yT = Array.from(resState(lR, tTPI)); yT[3] += dv1[0]; yT[4] += dv1[1]; yT[5] += dv1[2];
  const pT = P.burn(asId, yT[6], vnorm(dv1)); yT[6] -= pT.prop;
  M.burn({ name: 'Terminal phase initiation (rendezvous)', t: tTPI, dur: pT.dur, dv: vnorm(dv1) * 1000, engine: pT.engine, isp: pT.isp, prop: pT.prop, m0: yT[6] + pT.prop, obj: 'lander', propType: pT.propType });
  M.ev(tTPI, 'lander', 'Terminal phase initiation', `${EXPLAIN.rendezvous} Intercept burn ${(vnorm(dv1) * 1000).toFixed(1)} m/s; arrival in ${fmtDur(best.tof)}.`, 'burn');
  const rT = cisInt(tTPI, yT, tDock, {});
  ascObj.add(resToSeg(rT, 'rendezvous transfer'));
  const dv2 = vnorm(vsub(best.b.v, best.Lb.v2));
  const pB = P.burn(asId, rT.y[rT.y.length - 1][6], dv2);
  M.burn({ name: 'Braking & docking', t: tDock, dur: pB.dur, dv: dv2 * 1000, engine: pB.engine, isp: pB.isp, prop: pB.prop, m0: rT.y[rT.y.length - 1][6], obj: 'lander', propType: pB.propType });
  M.ev(tDock, 'ship', cfg.dockName || 'Docking', cfg.dockDesc || 'The ascent vehicle docks with the orbiter; crew and samples transfer.', 'dock');
  // orbiter coasts up to docking
  { const r = cisInt(t, y, tDock, {}); ship.add(resToSeg(r, 'lunar orbit')); t = r.tEnd; y = Array.from(r.y[r.y.length - 1]); }
  ship.setConfig(tDock, 'sc', { key: 'sc', sc: SC.model, parts: ['orbiter', 'ascent'] });
  // jettison ascent stage after crew transfer
  const tJet = tDock + (cfg.ascJettisonAfter ?? 2.1) * H;
  { const r = cisInt(t, y, tJet, {}); ship.add(resToSeg(r, 'lunar orbit')); t = r.tEnd; y = Array.from(r.y[r.y.length - 1]); }
  const mAsc = rT.y[rT.y.length - 1][6] - pB.prop;
  const jet = M.addObj(new MObject('ascent-stage', cfg.ascStageName || 'Ascent stage (jettisoned)', { kind: 'stage', model: SC.model, color: '#999' }));
  jet.setConfig(tJet, 'sc', { key: 'sc', sc: SC.model, parts: ['ascent'], dock: true }); // (Chang'e 5 releases its docking and support modules with the ascender)
  { const yJ = [...y]; yJ[3] += 0.0006 * vunit(y.slice(3, 6))[0]; yJ[6] = mAsc; const r = cisInt(tJet, yJ, tJet + 30 * H, { events: [evLunarImpact()] }); jet.add(resToSeg(r, 'jettisoned')); }
  ship.setConfig(tJet, 'sc', { key: 'sc', sc: SC.model, parts: ['orbiter'], dock: false });
  M.ev(tJet, 'ship', cfg.ascJettisonName || 'Ascent stage jettison', 'The empty ascent vehicle is released.', 'sep');
  y[6] = P.massOf(orbIds) + (cfg.samples || 0);
  setState(t, y);
  M.phase(tLift, tDock, 'Ascent & rendezvous', '#06d6a0');
  return true;
}
