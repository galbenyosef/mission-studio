// ============================================================================
// leo.js — Earth-orbit missions flown by the Space Shuttle: ascent to main engine cutoff, External Tank
// separation, OMS burns, payload deploy or rendezvous and docking with the ISS, deorbit, winged entry,
// terminal area energy management (TAEM) around the heading alignment cone, and the runway landing.
// Orbits are integrated with Earth's J2 oblateness (the plane of a low orbit swings several degrees a day).
// ============================================================================
const J2_E = 1.08262668e-3, POLE_E = eqToEcl([0, 0, 1]);
function leoAccel(r) { // point-mass Earth + J2 (geocentric ECL, km/s²)
  const rn2 = r[0] * r[0] + r[1] * r[1] + r[2] * r[2], rn = Math.sqrt(rn2), k = -MU_E / (rn2 * rn);
  const z = r[0] * POLE_E[0] + r[1] * POLE_E[1] + r[2] * POLE_E[2];
  const f = -1.5 * J2_E * MU_E * R_E * R_E / (rn2 * rn2 * rn), q = 1 - 5 * z * z / rn2;
  return [k * r[0] + f * (q * r[0] + 2 * z * POLE_E[0]), k * r[1] + f * (q * r[1] + 2 * z * POLE_E[1]), k * r[2] + f * (q * r[2] + 2 * z * POLE_E[2])];
}
function makeLeoODE(thrust) {
  return (t, y, out) => {
    const a = leoAccel([y[0], y[1], y[2]]);
    out[0] = y[3]; out[1] = y[4]; out[2] = y[5];
    if (thrust && y[6] > 1) { const u = thrust.dir(t, [y[0], y[1], y[2]], [y[3], y[4], y[5]]); const at = thrust.T / y[6] / 1000; out[3] = a[0] + at * u[0]; out[4] = a[1] + at * u[1]; out[5] = a[2] + at * u[2]; out[6] = -thrust.mdot; }
    else { out[3] = a[0]; out[4] = a[1]; out[5] = a[2]; out[6] = 0; }
  };
}
function leoInt(t0, y0, t1, opt = {}) {
  return integrate(makeLeoODE(opt.thrust || null), t0, Float64Array.from(y0), t1, { rtol: opt.rtol ?? 1e-10, atol: opt.atol ?? 1e-7, hmax: opt.hmax ?? 60, events: opt.events || [], h0: opt.h0 ?? 5, maxSteps: opt.maxSteps ?? 800000 });
}
// states of an integration on a regular time grid (Hermite interpolation with the stored derivatives)
function resGrid(res, ta, tb, dt) {
  const out = [];
  for (let tt = ta; tt <= tb + 1e-6; tt += dt) { const s = resState(res, Math.min(tt, tb)); out.push({ t: Math.min(tt, tb), r: [s[0], s[1], s[2]], v: [s[3], s[4], s[5]], m: s[6] }); if (tt >= tb) break; }
  if (out.length && out[out.length - 1].t < tb - 1e-6) { const s = resState(res, tb); out.push({ t: tb, r: [s[0], s[1], s[2]], v: [s[3], s[4], s[5]], m: s[6] }); }
  return out;
}
// local orbital frame (LVLH): x along track, y orbit normal, z radial up
function lvlh(r, v) { const z = vunit(r), y = vunit(vcross(r, v)), x = vcross(y, z); return { x, y, z }; }
const fromLvlh = (F, p) => vadd(vadd(vscale(F.x, p[0]), vscale(F.y, p[1])), vscale(F.z, p[2]));
const toLvlh = (F, d) => [vdot(d, F.x), vdot(d, F.y), vdot(d, F.z)];
// time of the next apoapsis (or periapsis) after t for a geocentric state
function nextApsis(t, r, v, apo) {
  const el = rv2coe(r, v, MU_E); if (!(el.e < 1) || !isFinite(el.period)) return t;
  const tp = timeSincePeri(el.e, el.a, el.nu, MU_E); const P = el.period;
  let dt = (apo ? P / 2 : 0) - tp; dt = ((dt % P) + P) % P; if (dt < 60) dt += P;
  return t + dt;
}
function oceanName(lat, lon) { // rough name for where something falls
  if (lat < -55) return 'Southern Ocean';
  if (lon > 20 && lon < 120 && lat < 25) return 'Indian Ocean';
  if (lon >= 120 || lon < -70) return 'Pacific Ocean';
  if (lon >= -70 && lon < 20 && lat > -60) return 'Atlantic Ocean';
  return 'ocean';
}
// launcher for a Shuttle flight: per-flight main-engine power level and throttle bucket, tank variant
function shuttleLauncher(cfg) {
  const L = JSON.parse(JSON.stringify(LAUNCHERS[cfg.launcher])); L.ign = LAUNCHERS[cfg.launcher].ign;
  const core = L.stages.find(s => !s.parallel);
  if (cfg.ssme) { if (cfg.ssme.sched) core.sched = cfg.ssme.sched; }
  if (cfg.etDry) core.dry = cfg.etDry;
  return L;
}
// payload bay contents per flight (renderer reads these flags from the ship configuration)
function orbiterCfg(cfg, extra = {}) { return { key: 'sc', sc: 'shuttle', parts: ['orbiter'], orbiter: cfg.orbiterId || 'OV-104', pay: cfg.bayPayload || null, bay: 'closed', ...extra }; }
const fLatLon = ll => `${Math.abs(ll[0]).toFixed(1)}°${ll[0] >= 0 ? 'N' : 'S'} ${Math.abs(ll[1]).toFixed(1)}°${ll[1] >= 0 ? 'E' : 'W'}`;
const fmtNmi = km => `${Math.round(km)} km (${Math.round(km / 1.852)} nmi)`;

function planLEO(cfg, progress = () => { }) {
  const M = new Mission(cfg), H = 3600;
  const L = shuttleLauncher(cfg);
  const SC = JSON.parse(JSON.stringify(SPACECRAFT[cfg.spacecraft]));
  if (cfg.scOverride) for (const k in cfg.scOverride) Object.assign(SC.modules[k], cfg.scOverride[k]);
  if (cfg.payloadMass != null && SC.modules.PAY) SC.modules.PAY.dry = cfg.payloadMass;
  const P = new Propulsion(SC);
  const S = LAUNCH_SITES[cfg.site], t0 = M.t0, rwy = RUNWAYS[cfg.runway] || RUNWAYS.KSC15;
  const ship = M.addObj(new MObject('ship', cfg.shipName || SC.name, { primary: true, crew: cfg.crew || 0, model: SC.model, color: '#ffd166' }));
  const OMS = 'OMS', eng = P.engineOf(OMS), mdotOMS = eng.thrust / (eng.isp * G0);
  // ---------------- launch ----------------
  const incl = cfg.incl ?? 51.6;
  const azI = Math.asin(clamp(Math.cos(incl * DEG) / Math.cos(S.lat * DEG), -1, 1)) * RAD;
  const normal = planeNormalFromAz('earth', S.lat, S.lon, t0, azI);
  progress('Solving the ascent: boosters, main engines, MECO…');
  const LP = launchPhase(M, cfg, L, scTotalMass(SC), normal, { ship });
  M.notes.push(`Launch azimuth ${azI.toFixed(1)}° (inertial, north-east) for an orbit inclined ${incl.toFixed(2)}° to the equator.`);
  if (!LP.ok) { M.warnings.push('The Shuttle cannot reach orbit with this payload.'); M.failed = 'ascent'; M.finalize(); return M; }
  const asc = LP.asc;
  shuttleAscentEvents(M, cfg, L, asc, ship);
  let t = asc.t, y = [...asc.r, ...asc.v, asc.m];
  const st = () => ({ r: [y[0], y[1], y[2]], v: [y[3], y[4], y[5]] });
  const coast = (tEnd, phase, extra) => { if (tEnd <= t + 1e-6) return null; const res = leoInt(t, y, tEnd); ship.add(resToSeg(res, phase, extra)); t = res.tEnd; y = Array.from(res.y[res.y.length - 1]); return res; };
  // finite OMS burn centred on tc; dvAt(state at tc) gives the impulsive Δv vector it replaces
  const omsBurn = (tc, dvAt, name, describe, phase) => {
    const pre = leoInt(t, y, tc); const sC = Array.from(pre.y[pre.y.length - 1]);
    const dv = dvAt([sC[0], sC[1], sC[2]], [sC[3], sC[4], sC[5]]), dvm = vnorm(dv);
    if (!(dvm > 1e-6)) return null;
    const D = propForDv(sC[6], dvm, eng.isp) / mdotOMS, tIgn = tc - D / 2;
    coast(tIgn, phase);
    const law = localDirLaw(st().r, st().v, vunit(dv));
    const tank = P.tankOf(OMS); const Dmax = tank.propLeft / mdotOMS, Duse = Math.min(D, Dmax);
    const res = leoInt(tIgn, y, tIgn + Duse, { thrust: { T: eng.thrust, mdot: mdotOMS, dir: law }, hmax: 2, h0: 0.5 });
    ship.add(resToSeg(res, name, { stage: OMS }, { T: eng.thrust, law }));
    const used = res.y[0][6] - res.y[res.y.length - 1][6]; tank.propLeft -= used;
    const dvA = dvForProp(res.y[0][6], used, eng.isp) * 1000;
    M.burn({ name, t: tIgn, dur: Duse, dv: dvA, engine: eng.name, isp: eng.isp, prop: used, m0: res.y[0][6], obj: 'ship', propType: eng.prop });
    t = res.tEnd; y = Array.from(res.y[res.y.length - 1]);
    const el = rv2coe(st().r, st().v, MU_E);
    M.ev(tIgn, 'ship', name.split(' — ')[0], describe({ dv: dvA, dur: Duse, hp: el.rp - R_E, ha: el.ra - R_E }), 'burn', { dv: dvA });
    if (Duse < D - 0.5) M.warnings.push(`The OMS ran dry during ${name.split(' — ')[0]}.`);
    return { tIgn, dur: Duse, dv: dvA };
  };
  // tangential Δv at a point that puts the opposite side of the orbit at radius rT
  const dvToApsis = (r, v, rT) => { const rn = vnorm(r), vt = vnorm(vsub(v, vscale(vunit(r), vdot(v, vunit(r))))); const vNeed = Math.sqrt(2 * MU_E * rT / (rn * (rn + rT))); return vscale(vunit(v), vNeed - vt); };
  // ---------------- MECO → External Tank separation ----------------
  const tMECO = asc.t, tETsep = tMECO + 18;
  coast(tETsep, 'MECO — coasting with the tank');
  {
    const et = M.addObj(new MObject('et', 'External Tank', { kind: 'stage', model: 'stage', color: '#d98b4a' }));
    et.setConfig(tETsep, 'stage', { key: 'stage', launcher: cfg.launcher, stage: 1, variant: cfg.lvVariant });
    // The stack's attitude after MECO (as the viewer draws it): nose along the velocity, the tank's −Z side (where the
    // orbiter rides) facing down — or up after the roll to heads-up. The trajectory so far is the stack's reference point
    // on the tank's axis; the orbiter's own reference point sits 7.4 m aft of it and 8.55 m off the axis.
    const sv = st(), n = vunit(sv.v), upS = vunit(sv.r), hN = vunit(vcross(asc.r, asc.v)), A = vunit(vcross(hN, upS)), ref = vsub(upS, A);
    let Zs = vunit(vsub(ref, vscale(n, vdot(ref, n)))); if (cfg.headsUpMET) Zs = vscale(Zs, -1);
    const offOrb = vadd(vscale(n, -0.007405), vscale(Zs, -0.00855)), mET = (asc.upper ? asc.upper.dry + asc.upper.propLeft : L.stages[1].dry);
    const rET = leoInt(tETsep, [...sv.r, ...vadd(sv.v, vscale(Zs, 0.0006)), mET], tETsep + 3 * H, { events: [{ name: 'breakup', dir: -1, terminal: true, g: (tt, yy) => Math.hypot(yy[0], yy[1], yy[2]) - (R_E + 75) }] });
    et.add(resToSeg(rET, 'External Tank — falling back'));
    if (rET.stopEvent) { const ll = subPointLL('earth', [rET.stopEvent.y[0], rET.stopEvent.y[1], rET.stopEvent.y[2]], rET.stopEvent.t); M.ev(rET.stopEvent.t, 'et', 'External Tank breaks up', `The empty tank, ${Math.round(mET / 1000)} t, comes back into the atmosphere half an orbit after separation and breaks up around 75 km over the ${oceanName(ll[0], ll[1])}. It was the only part of the Shuttle that was not reused.`, 'info'); }
    y[6] = P.massOf(SC.orbiter); for (let k = 0; k < 3; k++) { y[k] += offOrb[k]; y[3 + k] -= Zs[k] * 0.0012; } // the −Z translation, away from the tank
    ship.setConfig(tETsep, 'sc', orbiterCfg(cfg));
    M.ev(tETsep, 'ship', 'External Tank separation', `Eighteen seconds after MECO the tank is released and the orbiter fires its reaction-control jets to move clear (a 4 ft/s "−Z translation"). MECO left the orbit's low point inside the atmosphere on purpose, so the tank falls back on its own; the orbiter will raise its perigee with the OMS.`, 'sep');
  }
  // ---------------- OMS-1 (standard insertion only) and OMS-2 ----------------
  progress('OMS burns: raising the orbit…');
  if (cfg.oms1) omsBurn(t0 + cfg.oms1.met, (r, v) => dvToApsis(r, v, R_E + cfg.oms1.ha), 'OMS-1 — orbit insertion', b => `Both OMS engines fire for ${fmtDur(b.dur)} (Δv ${Math.round(b.dv)} m/s), raising the far side of the orbit to ${fmtNmi(b.ha)}. Early flights flew this "standard insertion"; from 1984 a higher MECO made OMS-1 unnecessary.`, 'MECO — coasting');
  { const s = st(); const tA = nextApsis(t, s.r, s.v, true); const hp = cfg.oms2.hp;
    omsBurn(tA, (r, v) => dvToApsis(r, v, R_E + hp), 'OMS-2 — circularisation', b => `At the high point of the orbit both OMS engines fire for ${fmtDur(b.dur)} (Δv ${Math.round(b.dv)} m/s): the perigee rises out of the atmosphere. Orbit now ${Math.round(b.hp)} × ${Math.round(b.ha)} km.`, 'climbing to apogee'); }
  M.phase(tMECO, t, 'Orbit insertion', '#4ea8de');
  const tIns = t;
  // payload bay doors open about 1½ hours after launch: the radiators on their inner faces must dump the orbiter's heat
  const tBay = t0 + (cfg.bayOpenMET ?? 1.5) * H;
  ship.setConfig(tBay, 'sc', { ...orbiterCfg(cfg), bay: 'open' });
  M.ev(tBay, 'ship', 'Payload bay doors open', 'The two 18-m doors swing open. Their inner faces are the radiators that carry the orbiter’s heat away — without opening them the crew would have to come home within hours.', 'info');
  // ---------------- orbit operations ----------------
  const ops = { M, cfg, SC, P, ship, L, t0, H, omsBurn, coast, dvToApsis, get t() { return t; }, set t(v) { t = v; }, get y() { return y; }, set y(v) { y = v; }, st, tBay, rwy, progress };
  for (const b of cfg.orbitBurns || []) { let tc = t0 + b.met * H; if (b.at) { const pre = leoInt(t, y, tc); const yy = pre.y[pre.y.length - 1]; tc = nextApsis(tc, [yy[0], yy[1], yy[2]], [yy[3], yy[4], yy[5]], b.at === 'apo'); } omsBurn(tc, (r, v) => b.ha != null ? dvToApsis(r, v, R_E + b.ha) : dvToApsis(r, v, R_E + b.hp), b.name, x => `${b.desc || 'Orbit adjustment.'} Δv ${Math.round(x.dv)} m/s. Orbit now ${Math.round(x.hp)} × ${Math.round(x.ha)} km.`, 'in orbit'); }
  for (const e of cfg.scripted || []) M.ev(t0 + e.met * H, 'ship', e.name, e.desc, e.kind || 'info');
  if (cfg.iss) issRendezvous(ops);
  if (cfg.deploy) payloadDeploy(ops);
  return shuttleReturn(ops, tIns);
}
// rename and add the Shuttle's ascent milestones
function shuttleAscentEvents(M, cfg, L, asc, ship) {
  const t0 = M.t0, ev = M.events, H = 3600;
  const find = f => ev.find(f);
  const po = find(e => e.name === 'Pitch-over'); if (po) { po.name = 'Roll program'; po.t = t0 + 10; po.desc = `Clear of the tower, the Shuttle rolls onto its launch azimuth (${asc.azI.toFixed(0)}° inertial) and pitches over, ending up “heads-down”: the orbiter rides beneath the tank with the crew facing the ground. The attitude spreads the aerodynamic loads on the wings and keeps the antennas pointed at the ground stations.`; }
  const lo = find(e => e.name === 'Liftoff'); if (lo) lo.desc = `The boosters ignite at T−0 and the hold-down bolts fire: ${(liftoffStages(L).reduce((a, s) => a + s.thrustSL, 0) / 1e6).toFixed(1)} MN of thrust, about 85 % of it from the two solid rocket boosters, lifts ${(stackMass(buildAscentStack(L, asc.stack.payload)) / 1000).toFixed(0)} t off the pad.`;
  const sch = L.stages[1].sched;
  if (sch) { const iD = sch.findIndex((p, i) => i > 0 && p[1] < sch[i - 1][1]), iU = sch.findIndex((p, i) => i > iD && iD > 0 && p[1] > sch[i - 1][1]);
    if (iD > 0) M.ev(t0 + sch[iD - 1][0], 'ship', 'Throttle down', `The main engines throttle back to about ${Math.round(sch[iD][1] * 104.5)} % for the thickest air, so the dynamic pressure stays within limits through Max-Q. The boosters’ shaped propellant grain cuts their thrust at the same time.`, 'ascent');
    if (iU > 0) M.ev(t0 + sch[iU][0], 'ship', 'Throttle up', '“Go at throttle up.” Past Max-Q the main engines return to full power (104.5 %).', 'ascent'); }
  const mq = find(e => e.kind === 'maxq'); if (mq) mq.desc = `Maximum dynamic pressure, ${(asc.maxQ / 1000).toFixed(1)} kPa (about ${Math.round(asc.maxQ / 47.88)} lb/ft²): the moment of greatest aerodynamic stress.`;
  const sb = find(e => e.kind === 'staging' && /Booster/.test(e.name)); if (sb) { sb.name = 'SRB separation'; sb.desc = `The two boosters burn out and are pushed clear by sixteen small separation motors. They coast up to about 65 km, then parachute into the Atlantic, where ships recover them for refurbishment. ${EXPLAIN.staging}`; }
  M.ev(t0 + (cfg.negReturn ?? 240), 'ship', 'Negative return', 'Too far and too fast to turn around: a return-to-launch-site abort is no longer possible. An engine failure from here on means an abort across the Atlantic or to orbit.', 'ascent');
  M.ev(t0 + (cfg.pressToMeco ?? 375), 'ship', 'Press to MECO', 'Even if one main engine failed now, the other two could still reach orbit.', 'ascent');
  if (cfg.headsUpMET) { M.ev(t0 + cfg.headsUpMET, 'ship', 'Roll to heads-up', 'The stack rolls over so the orbiter rides on top of the tank. Its antennas now face up, toward the TDRS relay satellites, instead of the ground stations along the coast.', 'ascent');
    const c = ship.configAt(t0 + cfg.headsUpMET); if (c) ship.setConfig(t0 + cfg.headsUpMET, 'launch', { ...c.label, headsUp: true }); }
  const s3 = (asc.samples || []).find(s => s.t > t0 + 300 && s.throttle < (sch ? curveAt(sch, s.t - t0) : 1) - 0.015); if (s3) M.ev(s3.t, 'ship', '3-g throttling', 'The stack keeps getting lighter as the tank empties, so the main engines throttle back to hold the acceleration at 3 g.', 'ascent');
  const ins = find(e => e.kind === 'insertion'); if (ins) { ins.name = 'MECO'; const el = asc.el; ins.desc = `Main engine cutoff, ${Math.round(asc.t - t0 - 0)} s after liftoff: ${(vnorm(asc.v)).toFixed(2)} km/s at ${Math.round(vnorm(asc.r) - R_E)} km. The orbit is ${Math.round(el.rp - R_E)} × ${Math.round(el.ra - R_E)} km — still dipping into the atmosphere, which is where the tank will fall.`; }
}

// ---------------------------------------------------------------------------
// ISS rendezvous and docking (STS-135 style): phasing burns, terminal initiation, an R-bar approach from below,
// the R-bar pitch maneuver, a swing up to the V-bar and the final approach to the docking port; undocking,
// flyaround and separation. The station's orbit is built so the meeting happens at the historical docking time:
// its altitude and plane are right; its position along the orbit is set where the orbiter arrives.
// ---------------------------------------------------------------------------
function issRendezvous(o) {
  const { M, cfg, ship, H } = o, c = cfg.iss;
  const tDock = isoToT(c.dock), tUndock = isoToT(c.undock), tArr = tDock - (c.arriveBefore ?? 1.45) * H;
  const rISS = R_E + (c.hp + c.ha) / 2;
  o.progress('Rendezvous: phasing burns toward the station…');
  const hLow = (c.hp + c.ha) / 2 - (c.below ?? 14);
  const Pl = 2 * Math.PI * Math.sqrt(Math.pow(R_E + hLow, 3) / MU_E);
  const aTr = (R_E + hLow + rISS) / 2, Ttr = Math.PI * Math.sqrt(aTr * aTr * aTr / MU_E);
  const tTI = tArr - Ttr, tNC1 = o.t0 + (c.nc1MET ?? 3.3) * H, tNC2 = tTI - 1.5 * Pl;
  // Where the docking happens along the orbit decides when the landing opportunities come days later. The station's
  // real position is matched indirectly: the phasing orbit (NC-1 apogee) is chosen so that, after undocking, the
  // orbit passes the landing runway at the historical landing time — as it did for the real, phased rendezvous.
  const tStar = isoToT(cfg.landing) - 12.5 * 60, rw = o.rwy;
  const dryArrive = ha1 => {
    let t = o.t, y = o.y.slice();
    const prop = t1 => { const r = leoInt(t, y, t1, { rtol: 1e-9, atol: 1e-6, hmax: 120 }); t = r.tEnd; y = Array.from(r.y[r.y.length - 1]); };
    const kick = rT => { const dv = o.dvToApsis([y[0], y[1], y[2]], [y[3], y[4], y[5]], rT); y[3] += dv[0]; y[4] += dv[1]; y[5] += dv[2]; };
    prop(tNC1); kick(R_E + ha1); prop(tNC2); kick(R_E + hLow);
    prop(nextApsis(t, [y[0], y[1], y[2]], [y[3], y[4], y[5]], true)); kick(R_E + hLow - 2); prop(tTI); kick(rISS - 0.6); prop(tArr);
    return y;
  };
  const issFrom = y => { const r = [y[0], y[1], y[2]], up = vunit(r), hh = vunit(vcross(r, [y[3], y[4], y[5]])); const rI = vscale(up, vnorm(r) + 0.6); return [...rI, ...vscale(vunit(vcross(hh, up)), Math.sqrt(MU_E / vnorm(rI))), c.mass]; };
  const phaseErr = ha1 => { const yI = issFrom(dryArrive(ha1)); const rr = leoInt(tArr, yI, tStar, { rtol: 1e-9, atol: 1e-6, hmax: 120 }); const s = rr.y[rr.y.length - 1];
    const r = [s[0], s[1], s[2]], h = vunit(vcross(r, [s[3], s[4], s[5]])), k = vunit(sitePosEcl('earth', rw.lat, rw.lon, 0, tStar)), kp = vunit(vsub(k, vscale(h, vdot(k, h))));
    return Math.atan2(vdot(vcross(vunit(r), kp), h), vdot(vunit(r), kp)); };
  let ha1 = c.nc1Ha ?? 270;
  if (cfg.landing && !c.nc1Ha) {
    // The station takes the altitude the orbiter arrives at, and over the days to the landing a few hundred metres of
    // altitude add up to a large shift along the orbit, so the error swings through whole turns across the range of
    // apogees. Scan it, then refine the zero crossing nearest the nominal apogee (Illinois-modified false position).
    const lo = 175, hi = 375, step = 5, wrap = e => e - 2 * Math.PI * Math.round(e / (2 * Math.PI));
    const xs = [], es = []; for (let x = lo; x <= hi + 1e-9; x += step) { xs.push(x); es.push(wrap(phaseErr(x))); }
    const brackets = []; for (let i = 0; i + 1 < xs.length; i++) if (es[i] * es[i + 1] <= 0 && Math.abs(es[i] - es[i + 1]) < Math.PI) brackets.push(i);
    brackets.sort((i, j) => Math.abs(xs[i] + step / 2 - 270) - Math.abs(xs[j] + step / 2 - 270));
    if (brackets.length) {
      const i = brackets[0]; let a = xs[i], b = xs[i + 1], ea = es[i], eb = es[i + 1], x = a, side = 0;
      for (let it = 0; it < 16; it++) {
        x = eb !== ea ? b - eb * (b - a) / (eb - ea) : (a + b) / 2; const e = wrap(phaseErr(x)); if (Math.abs(e) < 0.002) break;
        if ((e < 0) === (eb < 0)) { b = x; eb = e; if (side === -1) ea /= 2; side = -1; } else { a = x; ea = e; if (side === 1) eb /= 2; side = 1; }
      }
      ha1 = x;
    } else M.notes.push('The phasing orbit could not be adjusted to match the historical landing time.');
  }
  // NC-1 raises the apogee early on; NC-2/NC-3 lift the orbit to ~14 km under the station before terminal initiation
  o.omsBurn(tNC1, (r, v) => o.dvToApsis(r, v, R_E + ha1), 'NC-1 — phasing burn', b => `The first of the phasing burns that set how fast the orbiter catches up with the station, ${Math.round(c.hp)} km up and thousands of kilometres ahead: the lower the orbit, the faster it goes around. Δv ${Math.round(b.dv)} m/s; orbit ${Math.round(b.hp)} × ${Math.round(b.ha)} km.`, 'in orbit — catching up');
  o.omsBurn(tNC2, (r, v) => o.dvToApsis(r, v, R_E + hLow), 'NC-2 — height adjust', b => `Raises the far side of the orbit to ${Math.round(hLow)} km, just under the station. Δv ${Math.round(b.dv)} m/s.`, 'in orbit — catching up');
  { const s = o.st(); const tA = nextApsis(o.t, s.r, s.v, true); o.omsBurn(tA, (r, v) => o.dvToApsis(r, v, R_E + hLow - 2), 'NC-3 — coelliptic burn', b => `At apogee, a burn makes the orbit nearly circular ${Math.round(b.hp)} × ${Math.round(b.ha)} km, a steady ${Math.round(rISS - R_E - hLow)} km below the station. The orbiter now creeps up on it from behind.`, 'in orbit — closing in'); }
  // TI: a Hohmann-like hop up to the station's altitude, arriving half an orbit later 600 m below it
  o.coast(tTI - 30, 'in orbit — closing in');
  o.omsBurn(tTI, (r, v) => o.dvToApsis(r, v, rISS - 0.6), 'TI — terminal initiation', b => `The burn that commits to the rendezvous: it raises the far side of the orbit to the station’s altitude, half an orbit ahead. From here the crew flies by radar, star trackers and the docking camera. Δv ${Math.round(b.dv)} m/s.`, 'rendezvous');
  o.coast(tArr, 'rendezvous — closing on the station');
  // the station, defined from where the orbiter arrives: 600 m above it, moving on a circular orbit in the same plane
  const sA = o.st(); const upA = vunit(sA.r), hA = vunit(vcross(sA.r, sA.v));
  const rI = vscale(upA, vnorm(sA.r) + 0.6), vI = vscale(vunit(vcross(hA, upA)), Math.sqrt(MU_E / vnorm(rI)));
  const tEndISS = isoToT(cfg.landing) + 6 * H;
  const resB = leoInt(tArr, [...rI, ...vI, c.mass], M.t0 - 2 * H, { hmax: 60 }), resF = leoInt(tArr, [...rI, ...vI, c.mass], tEndISS, { hmax: 60 });
  // resState expects increasing times: put the backward leg in forward order
  const rev = { t: resB.t.slice().reverse(), y: resB.y.slice().reverse(), f: resB.f.slice().reverse() };
  const issAt2 = tt => { const s = resState(tt < tArr ? rev : resF, tt); return { r: [s[0], s[1], s[2]], v: [s[3], s[4], s[5]] }; };
  const iss = M.addObj(new MObject('iss', 'International Space Station', { kind: 'craft', model: 'iss', color: '#9fd3ff', crew: c.crew || 6, labelPriority: 2 }));
  iss.add(new SampleSeg('earth', integToSamples(rev, () => ({ phase: 'ISS orbit' })), { phase: 'ISS orbit' }));
  iss.add(new SampleSeg('earth', integToSamples(resF, () => ({ phase: 'ISS orbit' })), { phase: 'ISS orbit' }));
  iss.setConfig(M.t0 - 2 * H, 'sc', { key: 'sc', sc: 'iss', parts: ['iss'] });
  // relative-motion legs (LVLH metres → absolute samples): R-bar approach, R-bar pitch maneuver, swing to the V-bar, docking
  const rel0 = toLvlh(lvlh(rI, vI), vsub(sA.r, rI));
  const dock = c.dockOffset || [0.0231, 0, -0.0068]; // orbiter reference point from the station's, LVLH km: docking ports touching (renderer models)
  const tR0 = isoToT(c.rpm), tR1 = tR0 + 9 * 60, tV = tDock - 28 * 60, tV2 = tDock - 7 * 60;
  const ease = x => smoothstep(clamp(x, 0, 1));
  const relAt = tt => {
    if (tt <= tR0) { const f = ease((tt - tArr) / (tR0 - tArr)); return vlerp(rel0, [0, 0, -0.183], f); }
    if (tt <= tR1) return [0, 0, -0.183];
    if (tt <= tV) { const f = ease((tt - tR1) / (tV - tR1)), ph = -Math.PI / 2 * (1 - f), rr = 0.183 + (0.095 - 0.183) * f; return [rr * Math.cos(ph), 0, rr * Math.sin(ph)]; }
    if (tt <= tV2) { const f = ease((tt - tV) / (tV2 - tV)); return vlerp([0.095, 0, 0], [dock[0] + 0.009, 0, dock[2]], f); }
    const f = ease((tt - tV2) / (tDock - tV2)); return vlerp([dock[0] + 0.009, 0, dock[2]], dock, f);
  };
  const relSamples = (ta, tb, dt, fn, phase) => {
    const out = []; const mass = o.y[6];
    const abs = tt => { const I = issAt2(tt); return vadd(I.r, fromLvlh(lvlh(I.r, I.v), fn(tt))); };
    for (let tt = ta; ; tt = Math.min(tt + dt, tb)) { const p = abs(tt), vv = vscale(vsub(abs(tt + 0.5), abs(tt - 0.5)), 1); out.push({ t: tt, r: p, v: vv, m: mass, phase: typeof phase === 'function' ? phase(tt) : phase }); if (tt >= tb) break; }
    return out;
  };
  o.progress('Proximity operations and docking…');
  ship.add(new SampleSeg('earth', relSamples(tArr, tDock, 2, relAt, tt => tt < tR0 ? 'R-bar approach' : tt < tR1 ? 'R-bar pitch maneuver' : tt < tV ? 'moving to the V-bar' : 'V-bar approach — docking'), { phase: 'proximity operations' }));
  const dv0 = vnorm(vsub(sA.v, vI)) * 1000;
  M.burn({ name: 'Braking — rendezvous', t: tArr, dur: 60, dv: dv0, engine: 'RCS (primary jets)', isp: 280, prop: o.y[6] * (1 - Math.exp(-dv0 / (280 * G0))), m0: o.y[6], obj: 'ship', propType: 'mmh' });
  M.ev(tArr - 25 * 60, 'ship', 'Mid-course corrections', 'Small reaction-control burns trim the intercept as the radar locks on to the station.', 'info');
  M.ev(tArr, 'ship', 'Station 600 m above', `The orbiter arrives directly below the station (on the "R-bar", the line to Earth’s centre) and brakes, ${dv0.toFixed(1)} m/s. The commander takes manual control at the aft flight-deck windows.`, 'burn');
  M.ev(tR0, 'ship', 'R-bar pitch maneuver', 'Six hundred feet (183 m) below the station the orbiter does a slow back-flip, 360° in nine minutes, so the station crew can photograph every heat-shield tile with 400 and 800 mm lenses. The images are checked on the ground for damage before entry.', 'photo');
  M.ev(tR1 + 60, 'ship', 'Swing to the V-bar', 'The orbiter flies a quarter circle up and around to a point 95 m (310 ft) in front of the station, on its direction of travel (the "V-bar"), now nose up with the payload bay facing the docking port.', 'info');
  M.ev(tV2, 'ship', '30 ft — final approach', 'The orbiter holds 9 m (30 ft) from the docking port to line up, then closes at about 3 cm/s.', 'info');
  { const I = issAt2(tDock);
    M.ev(tDock, 'ship', 'Docking', `“Capture confirmed.” The orbiter’s docking system latches on to Pressurized Mating Adapter 2 on the front of the station, ${Math.round(vnorm(I.r) - R_E)} km up, at ${fmtUTC(tDock)} UTC.`, 'dock'); }
  M.phase(o.t0 + (c.nc1MET ?? 3.3) * H, tArr, 'Rendezvous', '#4cc9f0');
  // docked
  ship.setConfig(tArr - 20 * 60, 'sc', { ...orbiterCfg(cfg), bay: 'open', att: 'rbar' });
  ship.setConfig(tR0, 'sc', { ...orbiterCfg(cfg), bay: 'open', att: 'rpm', rpm0: tR0, rpm1: tR1 });
  ship.setConfig(tR1, 'sc', { ...orbiterCfg(cfg), bay: 'open', att: 'vbar', sw0: tR1, sw1: tV }); // pitch up while swinging to the V-bar
  const mplmOut = c.mplmOut ? isoToT(c.mplmOut) : null, mplmIn = c.mplmIn ? isoToT(c.mplmIn) : null;
  const dockedRel = () => dock;
  const docked = relSamples(tDock, tUndock, 30, dockedRel, 'docked to the ISS');
  ship.add(new SampleSeg('earth', docked, { phase: 'docked to the ISS' }));
  ship.setConfig(tDock, 'sc', { ...orbiterCfg(cfg), bay: 'open', att: 'vbar', docked: true });
  M.ev(tDock + 1.7 * H, 'ship', 'Hatches open', 'The two crews meet. For the next week the orbiter and the station fly as one 520-tonne spacecraft.', 'info');
  if (mplmOut) { ship.setConfig(mplmOut, 'sc', { ...orbiterCfg(cfg), pay: null, bay: 'open', att: 'vbar', docked: true }); iss.setConfig(mplmOut, 'sc', { key: 'sc', sc: 'iss', parts: ['iss'], mplm: true });
    M.ev(mplmOut, 'ship', `${c.mplmName || 'Logistics module'} moved to the station`, 'The station’s robot arm lifts the cargo module out of the payload bay and berths it to the Harmony node. The crews unload about 4 t of supplies — food and spares to keep the station going after the Shuttle retires.', 'info'); }
  if (mplmIn) { ship.setConfig(mplmIn, 'sc', { ...orbiterCfg(cfg), bay: 'open', att: 'vbar', docked: true }); iss.setConfig(mplmIn, 'sc', { key: 'sc', sc: 'iss', parts: ['iss'] });
    M.ev(mplmIn, 'ship', `${c.mplmName || 'Logistics module'} back in the bay`, 'Refilled with station trash and equipment for return, the module goes back into the payload bay.', 'info'); }
  M.phase(tDock, tUndock, 'Docked to the ISS', '#43aa8b');
  // undocking, flyaround, separation
  const tBack = tUndock + 20 * 60, tFly = tBack + 75 * 60;
  const relAfter = tt => {
    if (tt <= tBack) { const f = ease((tt - tUndock) / (tBack - tUndock)); return vlerp(dock, [0.183, 0, 0], f); }
    const f = clamp((tt - tBack) / (tFly - tBack), 0, 1), ph = 2 * Math.PI * smoothstep(f); return [0.183 * Math.cos(ph), 0, 0.183 * Math.sin(ph)];
  };
  ship.add(new SampleSeg('earth', relSamples(tUndock, tFly, 2, relAfter, tt => tt < tBack ? 'undocking — backing away' : 'flyaround'), { phase: 'flyaround' }));
  ship.setConfig(tUndock, 'sc', { ...orbiterCfg(cfg), bay: 'open', att: 'vbar' });
  ship.setConfig(tBack, 'sc', { ...orbiterCfg(cfg), bay: 'open', att: 'fly' });
  M.ev(tUndock, 'ship', 'Undocking', 'Springs push the orbiter gently away from the station; it backs out along the V-bar to about 180 m.', 'sep');
  M.ev(tBack + 60, 'ship', 'Flyaround', 'A last lap around the station at about 180 m, over the top, behind and underneath, while the crew photographs it from every side.', 'photo');
  // free flight again: set the state at the end of the flyaround and fire the separation burn
  const end = relSamples(tFly - 0.5, tFly + 0.5, 0.5, relAfter, '');
  const sE = end[1]; o.t = tFly; o.y = [...sE.r, ...sE.v, o.y[6]];
  const F = lvlh(sE.r, sE.v), dvSep = vadd(vscale(F.x, -0.0006), vscale(F.z, -0.0003));
  o.y[3] += dvSep[0]; o.y[4] += dvSep[1]; o.y[5] += dvSep[2];
  M.burn({ name: 'Separation burn', t: tFly, dur: 10, dv: vnorm(dvSep) * 1000, engine: 'RCS (primary jets)', isp: 280, prop: o.y[6] * (1 - Math.exp(-vnorm(dvSep) * 1000 / (280 * G0))), m0: o.y[6], obj: 'ship', propType: 'mmh' });
  M.ev(tFly, 'ship', 'Final separation', 'A small burn takes the orbiter below and ahead of the station; on the lower, faster orbit it pulls away a few kilometres every lap.', 'burn');
  ship.setConfig(tFly + 120, 'sc', { ...orbiterCfg(cfg), bay: 'open' });
  M.phase(tUndock, tFly, 'Undocking & flyaround', '#4cc9f0');
}
// ---------------------------------------------------------------------------
// Payload deploy with the robot arm (STS-31: the Hubble Space Telescope)
// ---------------------------------------------------------------------------
function payloadDeploy(o) {
  const { M, cfg, ship, H } = o, d = cfg.deploy;
  const tRel = isoToT(d.t), tGr = tRel - (d.grapple ?? 8) * H, tUn = tRel - (d.unberth ?? 6.4) * H, tArr = tRel - (d.arrays ?? 2.6) * H;
  o.progress('Payload deploy…');
  o.coast(tGr - 0.5 * H, 'in orbit');
  ship.setConfig(tGr - 0.5 * H, 'sc', { ...orbiterCfg(cfg), bay: 'open', att: 'deploy' });
  ship.setConfig(tGr, 'sc', { ...orbiterCfg(cfg), bay: 'open', att: 'deploy', rms: 'grapple' });
  ship.setConfig(tUn, 'sc', { ...orbiterCfg(cfg), pay: null, payArm: d.model, bay: 'open', att: 'deploy', rms: 'raised' });
  ship.setConfig(tArr, 'sc', { ...orbiterCfg(cfg), pay: null, payArm: d.model, payArrays: true, bay: 'open', att: 'deploy', rms: 'raised' });
  ship.setConfig(tRel, 'sc', { ...orbiterCfg(cfg), pay: null, bay: 'open', att: 'deploy', rms: 'raised' });
  ship.setConfig(tRel + 1.2 * H, 'sc', { ...orbiterCfg(cfg), pay: null, bay: 'open' });
  M.ev(tGr, 'ship', `Robot arm grapples ${d.short || d.name}`, `The 15-m Canadarm, flown from the aft flight deck, latches on to the telescope’s grapple fixture. ${d.name} has been running on the orbiter’s power; now it switches to its own batteries.`, 'info');
  M.ev(tUn, 'ship', `${d.short || d.name} lifted out of the bay`, 'Slowly, a few centimetres per second, the arm lifts the 11-tonne telescope clear of the payload bay — clearances along the bay sill were only a few centimetres.', 'info');
  M.ev(tArr, 'ship', 'Solar arrays and antennas unfurl', 'The two 12-m solar array wings roll out from their storage drums and the two high-gain antennas swing out on their booms. One wing stuck partway, and two spacewalkers suited up in the airlock before ground controllers freed it with a software fix.', 'photo');
  // release: the payload becomes its own spacecraft; the orbiter backs away
  o.coast(tRel, 'in orbit — deploy');
  const s = o.st(); const F = lvlh(s.r, s.v), off = fromLvlh(F, d.armOffset || [0.0016, -0.0004, 0.0146]); // where the arm holds it, upright over the bay
  const pay = M.addObj(new MObject(d.id || 'payload', d.name, { kind: 'craft', model: d.model, color: '#bfe3ff' }));
  pay.setConfig(tRel, 'sc', { key: 'sc', sc: d.model, parts: ['deployed'] });
  if (d.doorOpen) { const td = isoToT(d.doorOpen); pay.setConfig(td, 'sc', { key: 'sc', sc: d.model, parts: ['deployed'], door: true }); M.ev(td, d.id || 'payload', 'Aperture door opens', 'Two days after the deploy, the telescope’s aperture door swings open; first light follows a month later — and with it the discovery that the main mirror had been ground to the wrong shape.', 'photo'); }
  const tPayEnd = isoToT(cfg.landing) + 8 * H;
  const rP = leoInt(tRel, [...vadd(s.r, off), ...s.v, d.mass], tPayEnd, { hmax: 60 });
  pay.add(resToSeg(rP, `${d.short || d.name} in orbit`));
  M.ev(tRel, 'ship', `${d.short || d.name} released`, `The arm lets go at ${fmtUTC(tRel)} UTC, ${Math.round(vnorm(s.r) - R_E)} km up — the highest orbit a Shuttle had flown. The telescope is on its own.`, 'sep');
  const dvS = vscale(F.x, 0.0004);
  o.y[3] += dvS[0]; o.y[4] += dvS[1]; o.y[5] += dvS[2];
  o.y[6] -= d.mass; if (o.P.mods.PAY) o.P.mods.PAY.attached = false;
  M.burn({ name: 'Separation burn', t: tRel + 1, dur: 8, dv: 0.4, engine: 'RCS (primary jets)', isp: 280, prop: o.y[6] * (1 - Math.exp(-0.4 / (280 * G0))), m0: o.y[6], obj: 'ship', propType: 'mmh' });
  M.ev(tRel + 0.4 * H, 'ship', 'Standing by', 'The orbiter backs away and stays within reach for two days, in case a spacewalk is needed to fix the telescope.', 'info');
  M.phase(tGr, tRel + 0.5 * H, `${d.short || d.name} deploy`, '#43aa8b');
}

// ---------------------------------------------------------------------------
// Coming home: pick the landing opportunity, close the payload bay, deorbit burn, entry, TAEM, landing, rollout
// ---------------------------------------------------------------------------
const EI_SH = 121.92; // entry interface, 400,000 ft
function shuttleReturn(o, tIns) {
  const { M, cfg, ship, H, rwy } = o;
  const tLandNom = isoToT(cfg.landing);
  o.progress('Deorbit planning: finding the landing opportunity…');
  const pr = leoInt(o.t, o.y, tLandNom + 2 * H, { hmax: 60 });
  const rwyDir = tt => vunit(sitePosEcl('earth', rwy.lat, rwy.lon, 0, tt));
  // passes: local minima of the ground track's distance from the runway
  const passes = []; let prev = null, prev2 = null;
  for (let tt = Math.max(o.t + 600, tLandNom - 5 * H); tt <= tLandNom + 1.5 * H; tt += 20) {
    const s = resState(pr, tt), d = vangle([s[0], s[1], s[2]], rwyDir(tt)) * R_E;
    if (prev && prev2 && prev.d < prev2.d && prev.d <= d) passes.push({ t: prev.t, d: prev.d });
    prev2 = prev; prev = { t: tt, d };
  }
  const pick = passes.map(p => ({ ...p, cost: Math.abs(p.t + 13 * 60 - tLandNom) / 60 + (p.d > 1250 ? 1e6 : p.d / 100) })).sort((a, b) => a.cost - b.cost)[0];
  if (!pick) { M.warnings.push('No landing opportunity found near the planned landing time.'); M.failed = 'deorbit'; o.coast(tLandNom, 'in orbit'); M.finalize(); return M; }
  if (pick.d > 1250) M.warnings.push(`The landing pass is ${Math.round(pick.d)} km off the runway — more than the orbiter's usual cross-range.`);
  // deorbit Δv: retrograde, sized for a −1.2° flight-path angle at entry interface (two-body estimate)
  const fpaT = (cfg.entryFpa ?? -1.2) * DEG, rEI = R_E + EI_SH;
  const dvFor = (r, v) => { let lo = 0.02, hi = 0.45; for (let k = 0; k < 50; k++) { const dv = (lo + hi) / 2, v1 = vadd(v, vscale(vunit(v), -dv)); const el = rv2coe(r, v1, MU_E); if (el.rp > rEI) { lo = dv; continue; } const hh = el.hn, vE = Math.sqrt(2 * (el.energy + MU_E / rEI)), g = -Math.acos(clamp(hh / (rEI * vE), -1, 1)); if (g > fpaT) lo = dv; else hi = dv; } return (lo + hi) / 2; };
  const evEIsh = { name: 'EI', dir: -1, terminal: true, g: (tt, yy) => Math.hypot(yy[0], yy[1], yy[2]) - rEI };
  const target = { lat: rwy.lat, lon: rwy.lon, elev: rwy.elev };
  const trial = td => {
    const s = resState(pr, td), r = [s[0], s[1], s[2]], v = [s[3], s[4], s[5]], dv = dvFor(r, v);
    const rr = leoInt(td, [...r, ...vadd(v, vscale(vunit(v), -dv)), s[6]], td + 2.5 * H, { events: [evEIsh] }); if (!rr.stopEvent) return null;
    const ye = rr.stopEvent.y, te = rr.stopEvent.t;
    const ent = simulateWingedEntry({ t0: te, r0: [ye[0], ye[1], ye[2]], v0: [ye[3], ye[4], ye[5]], m0: s[6], target, rTaem: 96, fixedBank: (cfg.refBank ?? 55) * DEG, noSamples: true, coarse: true });
    const rE = [ye[0], ye[1], ye[2]], err = vangle(rE, ent.r) * R_E - (vangle(rE, rwyDir(ent.t)) * R_E - 96);
    return { dv, err, te };
  };
  let td = pick.t + 13 * 60 - 65 * 60, tr = trial(td);
  for (let k = 0; k < 6 && tr && Math.abs(tr.err) > 15; k++) { td -= tr.err / 7.3; tr = trial(td); }
  if (!tr) { M.warnings.push('Deorbit targeting failed.'); M.failed = 'deorbit'; M.finalize(); return M; }
  // payload bay doors close a few hours before the burn
  const tDoors = td - (cfg.doorsCloseBefore ?? 2.8) * H;
  M.ev(tDoors, 'ship', 'Payload bay doors closed', 'The crew stows the cabin, closes the payload bay doors and puts on launch and entry suits.', 'info');
  ship.setConfig(tDoors, 'sc', { ...orbiterCfg(cfg), pay: cfg.bayPayloadReturn !== undefined ? cfg.bayPayloadReturn : cfg.bayPayload || null, bay: 'closed' });
  M.phase(tIns, td - 1800, cfg.orbitPhaseName || 'In orbit', '#4ea8de');
  // deorbit burn
  o.progress('Deorbit burn and entry…');
  o.coast(Math.min(tDoors, td - 1800), 'in orbit');
  const b = o.omsBurn(td, (r, v) => vscale(vunit(v), -tr.dv), 'Deorbit burn', x => `Flying tail-first and upside down, half a world away from ${rwy.short}, both OMS engines fire for ${fmtDur(x.dur)}: Δv ${Math.round(x.dv)} m/s, enough to drop the far side of the orbit into the atmosphere. There is no turning back after this burn.`, 'in orbit — deorbit preparations');
  ship.setConfig(o.t + 150, 'sc', { ...orbiterCfg(cfg), pay: cfg.bayPayloadReturn !== undefined ? cfg.bayPayloadReturn : cfg.bayPayload || null, bay: 'closed', att: 'entry' });
  M.ev(o.t + 150, 'ship', 'Pitch around to entry attitude', 'The orbiter turns nose-forward and raises its nose 40° above the direction of flight, so the black heat-shield tiles on its belly will meet the air first.', 'info');
  const rEIres = leoInt(o.t, o.y, o.t + 2.5 * H, { events: [evEIsh] });
  ship.add(resToSeg(rEIres, 'falling toward the atmosphere')); const yE = Array.from(rEIres.y[rEIres.y.length - 1]); const tEI = rEIres.tEnd;
  const vEIrel = vnorm(vsub([yE[3], yE[4], yE[5]], vcross(bodyOmegaEcl('earth', tEI), [yE[0], yE[1], yE[2]])));
  const rngEI = vangle([yE[0], yE[1], yE[2]], rwyDir(tEI + 1900)) * R_E;
  M.ev(tEI, 'ship', 'Entry interface (400,000 ft)', `${(vnorm([yE[3], yE[4], yE[5]])).toFixed(2)} km/s at 122 km, about ${Math.round(rngEI / 10) * 10} km from the runway, flight-path angle ${fpaDeg([yE[0], yE[1], yE[2]], [yE[3], yE[4], yE[5]]).toFixed(2)}°. The orbiter enters at a 40° angle of attack: the belly takes the heat and the air brakes it. ${cfg.blackout ? '' : 'Unlike a capsule it can steer — by banking.'}`, 'entry');
  const ent = simulateWingedEntry({ t0: tEI, r0: [yE[0], yE[1], yE[2]], v0: [yE[3], yE[4], yE[5]], m0: yE[6], target, rTaem: 96, vTaem: 0.76, blackout: !!cfg.blackout });
  ship.add(new SampleSeg('earth', ent.samples, { phase: 'entry' }));
  for (const e of ent.events) M.ev(e.t, 'ship', e.name, e.desc, e.kind);
  M.ev(ent.tPeakHeat, 'ship', 'Peak heating', `Stagnation heat flux about ${Math.round(ent.maxHeat)} W/cm² (Sutton–Graves estimate): the wing leading edges and nose cap of reinforced carbon-carbon glow at up to 1,500 °C, and the shock layer ahead of the orbiter is hotter still.`, 'heat');
  M.ev(ent.tPeakG, 'ship', 'Peak deceleration', `${ent.maxG.toFixed(2)} g — gentle by capsule standards: the orbiter’s lift spreads the braking over half an hour.`, 'gload');
  if (Math.abs(ent.rangeErr) > 60) M.warnings.push(`Entry guidance ended ${Math.round(ent.rangeErr)} km off its target energy point.`);
  // terminal area energy management, approach & landing, rollout
  o.progress('Approach and landing…');
  const AP = shuttleApproach({ t: ent.t, r: ent.r, v: ent.v }, rwy, { m: yE[6], chute: !!cfg.dragChute, ogs: cfg.ogs || 19, rollout: cfg.rollout });
  ship.add(new SampleSeg('earth', AP.samples, { phase: 'approach & landing' }));
  for (const e of AP.events) M.ev(e.t, 'ship', e.name, e.desc, e.kind);
  const cBase = { ...orbiterCfg(cfg), pay: cfg.bayPayloadReturn !== undefined ? cfg.bayPayloadReturn : cfg.bayPayload || null, bay: 'closed', att: 'entry' };
  ship.setConfig(AP.tGear, 'sc', { ...cBase, gear: true });
  if (AP.tChute) { ship.setConfig(AP.tChute, 'sc', { ...cBase, gear: true, dragChute: 1 }); ship.setConfig(AP.tChuteJet, 'sc', { ...cBase, gear: true }); }
  const mStop = yE[6];
  ship.add(new SurfaceSeg('earth', AP.tStop, AP.tStop + 1.5 * H, AP.stopLL[0], AP.stopLL[1], rwy.elev, mStop, { extra: { phase: 'wheel stop — on the runway', hdg: rwy.hdg } }));
  M.phase(td - 1800, ent.t, 'Deorbit & entry', '#ff5d5d');
  M.phase(ent.t, AP.tStop, 'Approach & landing', '#f15bb5');
  M.phase(AP.tStop, AP.tStop + 1.5 * H, 'On the runway', '#ffd166');
  M.summary.entries = [{ body: 'earth', vEI: vEIrel, maxG: ent.maxG, maxHeat: ent.maxHeat, miss: 0, ll: AP.stopLL, reversals: ent.reversals }];
  M.summary.landing = { t: AP.tTD, ll: AP.tdLL, miss: 0, runway: rwy.short };
  M.notes.push(`Deorbit burn ${fmtUTC(b ? b.tIgn : td)} UTC, Δv ${Math.round(tr.dv * 1000)} m/s; entry flown with ${ent.reversals} roll reversal${ent.reversals === 1 ? '' : 's'}; TAEM reached ${Math.round(ent.rangeErr)} km from its target point.`);
  M.finalize();
  return M;
}
// TAEM, heading alignment cone, outer and inner glideslopes, flare, touchdown and rollout, flown as a guided path
// (the orbiter is a glider: speed comes from trading altitude). Returns ECL samples and events.
function shuttleApproach(start, rwy, opt) {
  const g = 9.80665, t0 = start.t, Rb = R_E + rwy.elev, gearH = 0.0056, ogs = (opt.ogs || 19) * DEG; // gearH: orbiter reference plane above the wheels
  const omega = bodyOmegaEcl('earth', t0), Mb = bodyFixedToEcl('earth', t0), toBF = v => mvec(mT(Mb), v);
  const rB = toBF(start.r), vB = toBF(vsub(start.v, vcross(omega, start.r)));
  const U = llToBF(rwy.lat, rwy.lon), Tp = vscale(U, Rb), E = vunit(vcross([0, 0, 1], U)), N = vcross(U, E);
  const f = vadd(vscale(N, Math.cos(rwy.hdg * DEG)), vscale(E, Math.sin(rwy.hdg * DEG))), lf = vcross(U, f);
  const toXY = p => { const d = vsub(p, Tp); return [vdot(d, f), vdot(d, lf)]; };
  const P0 = toXY(rB), h0 = vnorm(rB) - Rb, upL = vunit(rB);
  const vh = vsub(vB, vscale(upL, vdot(vB, upL))); const dir0 = (() => { const d = [vdot(vh, f), vdot(vh, lf)], n = Math.hypot(d[0], d[1]); return [d[0] / n, d[1] / n]; })();
  const gam0 = Math.asin(clamp(vdot(vB, upL) / vnorm(vB), -1, 1));
  const XA = -2.29, XE = -12.0, rH = 5.5, hE = (XA - XE) * Math.tan(ogs), XTD = 0.762;
  // heading alignment cone: pick the side whose tangent line asks for the least turn at the start
  const opts = [1, -1].map(s => {
    const C = [XE, s * rH], d = Math.hypot(P0[0] - C[0], P0[1] - C[1]); if (d < rH * 1.3) return null;
    const be = Math.atan2(P0[1] - C[1], P0[0] - C[0]), thQ = s > 0 ? be + Math.acos(rH / d) : be - Math.acos(rH / d);
    const Q = [C[0] + rH * Math.cos(thQ), C[1] + rH * Math.sin(thQ)], dQ = s > 0 ? [-Math.sin(thQ), Math.cos(thQ)] : [Math.sin(thQ), -Math.cos(thQ)];
    const thE = s > 0 ? -Math.PI / 2 : Math.PI / 2; let dth = s > 0 ? thE - thQ : thQ - thE; dth = ((dth % TAU) + TAU) % TAU;
    const lq = Math.hypot(Q[0] - P0[0], Q[1] - P0[1]), dirPQ = [(Q[0] - P0[0]) / lq, (Q[1] - P0[1]) / lq];
    const hd = Math.acos(clamp(dirPQ[0] * dir0[0] + dirPQ[1] * dir0[1], -1, 1));
    return { s, C, thQ, Q, dQ, dth, cost: hd + (dth < 100 * DEG ? 0.6 : 0) + (dth > 320 * DEG ? 0.6 : 0) };
  }).filter(Boolean).sort((a, b) => a.cost - b.cost);
  const hac = opts[0];
  // ground path: Bézier to the cone, arc around it, straight in along the centreline
  const pts = [];
  { const lq = Math.hypot(hac.Q[0] - P0[0], hac.Q[1] - P0[1]), a = 0.42 * lq;
    const B1 = [P0[0] + a * dir0[0], P0[1] + a * dir0[1]], B2 = [hac.Q[0] - a * hac.dQ[0], hac.Q[1] - a * hac.dQ[1]];
    const n = Math.max(60, Math.ceil(lq / 0.4));
    for (let i = 0; i < n; i++) { const u = i / n, w = 1 - u; pts.push({ x: w * w * w * P0[0] + 3 * w * w * u * B1[0] + 3 * w * u * u * B2[0] + u * u * u * hac.Q[0], y: w * w * w * P0[1] + 3 * w * w * u * B1[1] + 3 * w * u * u * B2[1] + u * u * u * hac.Q[1], seg: 'taem' }); } }
  const nA = Math.max(30, Math.ceil(hac.dth / (1 * DEG)));
  for (let i = 0; i < nA; i++) { const th = hac.thQ + hac.s * hac.dth * i / nA; pts.push({ x: hac.C[0] + rH * Math.cos(th), y: hac.C[1] + rH * Math.sin(th), seg: 'hac' }); }
  const xEnd = XTD + rwy.len * 0.95;
  for (let x = XE; x <= xEnd; x += (x < XTD - 1 ? 0.1 : 0.01)) pts.push({ x, y: 0, seg: x < XTD ? 'final' : 'roll' });
  let L = 0; pts[0].l = 0; for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); pts[i].l = L; }
  const iE = pts.findIndex(p => p.seg === 'final'), lE = pts[iE].l;
  // altitude: monotone cubic from the TAEM state down to the cone exit, then the glideslopes
  const dH = hE - h0; let m0 = Math.tan(gam0) * lE, m1 = -Math.tan(ogs) * lE;
  { const a = m0 / dH, b = m1 / dH; if (a < 0) m0 = 0; if (b < 0) m1 = 0; const rr = Math.hypot(m0 / dH, m1 / dH); if (rr > 3) { m0 *= 3 / rr; m1 *= 3 / rr; } }
  const hAt = p => {
    if (p.seg === 'taem' || p.seg === 'hac') { const u = p.l / lE, u2 = u * u, u3 = u2 * u; return (2 * u3 - 3 * u2 + 1) * h0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * hE + (u3 - u2) * m1; }
    if (p.seg === 'roll') return gearH;
    const hPf = 0.533, xPf = XA - hPf / Math.tan(ogs);
    if (p.x <= xPf) return (XA - p.x) * Math.tan(ogs);
    const u = (p.x - xPf) / (XTD - xPf), u2 = u * u, u3 = u2 * u, Dx = XTD - xPf, s0 = -Math.tan(ogs) * Dx, s1 = -0.012 * Dx;
    return (2 * u3 - 3 * u2 + 1) * hPf + (u3 - 2 * u2 + u) * s0 + (-2 * u3 + 3 * u2) * gearH + (u3 - u2) * s1;
  };
  for (const p of pts) p.h = hAt(p);
  // speed: equivalent airspeed held near 290 knots (150 m/s), true airspeed follows the air density
  const rho0 = 1.225, sig = hh => earthAtmos(hh + rwy.elev).rho / rho0;
  const eas0 = vnorm(vB) * 1000 * Math.sqrt(sig(h0)), xPf = XA - 0.533 / Math.tan(ogs);
  const vTD = 100 / Math.sqrt(sig(0));
  for (const p of pts) {
    if (p.seg === 'taem' || p.seg === 'hac') { const u = clamp(p.l / lE, 0, 1); p.v = (eas0 + (150 - eas0) * smoothstep(u)) / Math.sqrt(sig(p.h)); }
    else if (p.seg === 'final') { const eas = p.x <= xPf ? 150 : 150 + (100 - 150) * (p.x - xPf) / (XTD - xPf); p.v = eas / Math.sqrt(sig(p.h)); }
  }
  // rollout: decelerate on the runway (aero drag and rolling, then brakes, plus the drag chute when fitted)
  const iTD = pts.findIndex(p => p.seg === 'roll'); let tt = 0;
  for (let i = 1; i < iTD; i++) { const p = pts[i], q = pts[i - 1], ds = (p.l - q.l) * 1000, dh = (p.h - q.h) * 1000, vg = Math.max(0.5 * (p.v + q.v), 1) * Math.cos(Math.atan2(dh, ds)); tt += ds / vg; p.t = tt; }
  pts[0].t = 0;
  const tTD = pts[iTD - 1].t + 0.2, chuteT = opt.chute ? tTD + 5.6 : null, noseT = tTD + 10;
  // rollout: aerodynamic drag and rolling friction, the drag chute, then the brakes below 140 knots; the braking is
  // scaled to the flight's recorded rollout distance
  const rollRun = k => { let v = vTD, x = pts[iTD].x, tR = tTD, chuteJet = null; const roll = [];
    while (v > 0.05 && roll.length < 6000) {
      let a = 1.0; if (tR > noseT && v < 74) a += 1.6 * k; if (chuteT && tR > chuteT + 2 && !chuteJet) a += 0.7;
      if (chuteT && !chuteJet && v < 31) chuteJet = tR;
      if (v < 3) a = Math.min(a, v / 0.8 + 0.3);
      const dt = 0.1; x += (v - 0.5 * a * dt) * dt / 1000; v = Math.max(0, v - a * dt); tR += dt; roll.push({ t: tR, x, v });
    }
    return { roll, chuteJet, tStop: tR, dist: x - pts[iTD].x }; };
  let kb = 1, RR = rollRun(kb); for (let it = 0; it < 12 && Math.abs(RR.dist - (opt.rollout || 2.7)) > 0.02; it++) { kb = clamp(kb * Math.pow(RR.dist / (opt.rollout || 2.7), 1.6), 0.3, 4); RR = rollRun(kb); }
  const roll = RR.roll, chuteJet = RR.chuteJet, tStop = RR.tStop;
  // samples on a regular clock, converted to ECL
  const P = pts.slice(0, iTD);
  const posBF = (px, py, hh) => vscale(vunit(vadd(Tp, vadd(vscale(f, px), vscale(lf, py)))), Rb + hh);
  const curv = i => { const a = P[Math.max(0, i - 3)], b = P[i], c = P[Math.min(P.length - 1, i + 3)]; const ax = b.x - a.x, ay = b.y - a.y, bx = c.x - b.x, by = c.y - b.y; const cr = ax * by - ay * bx, la = Math.hypot(ax, ay), lb = Math.hypot(bx, by), lc = Math.hypot(c.x - a.x, c.y - a.y); return la * lb * lc > 1e-9 ? 2 * cr / (la * lb * lc) : 0; };
  const samples = [], events = [];
  const at = tq => { // state on the path at time tq (s after TAEM)
    if (tq >= tTD) { let k = roll.findIndex(r => r.t >= tq); if (k < 0) k = roll.length - 1; const r = roll[k], x0 = r.x; return { x: x0, y: 0, h: gearH, v: r.v, seg: 'roll', dir: [1, 0], vh: 0, kap: 0 }; }
    let j = P.findIndex(p => p.t >= tq); if (j < 0) j = P.length - 1; if (j < 1) j = 1; // past the last approach point (touchdown is 0.2 s later): hold it, not the start of TAEM
    const a = P[j - 1], b = P[j], w = clamp((tq - a.t) / Math.max(b.t - a.t, 1e-6), 0, 1);
    const dl = Math.hypot(b.x - a.x, b.y - a.y) || 1e-9;
    return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w, h: a.h + (b.h - a.h) * w, v: a.v + (b.v - a.v) * w, seg: w < 0.5 ? a.seg : b.seg, dir: [(b.x - a.x) / dl, (b.y - a.y) / dl], vh: (b.h - a.h) * 1000 / Math.max(b.t - a.t, 1e-6), kap: curv(j) };
  };
  let bankS = 0, lastT = 0, machOne = false, hacEv = false, alEv = false, pfEv = false, gearT = null;
  const tEnd = tStop;
  for (let tq = 0; tq <= tEnd + 1e-6; tq += (tq < tTD - 40 ? 1 : 0.5)) {
    const s = at(tq), tAbs = t0 + tq;
    const hAbs = s.h + rwy.elev, atm = earthAtmos(hAbs), vms = s.v, mach = vms / atm.a, q = 0.5 * atm.rho * vms * vms;
    const bankT = s.seg === 'roll' ? 0 : -Math.atan(vms * vms * s.kap / 1000 / g) * RAD;
    bankS += (bankT - bankS) * clamp((tq - lastT) / 2.5, 0, 1); lastT = tq;
    let alpha = mach > 1 ? 9 + 5 * clamp((mach - 1) / 1.5, 0, 1) : s.seg === 'final' ? (s.x > xPf ? 6 + 4 * clamp((s.x - xPf) / (XTD - xPf), 0, 1) : 6) : 8;
    if (s.seg === 'roll') alpha = 10 * (1 - smoothstep((tq - tTD - 4) / 6));
    const pB = posBF(s.x, s.y, s.h); const dB = vadd(vscale(f, s.dir[0]), vscale(lf, s.dir[1]));
    const upB = vunit(pB), dBh = vunit(vsub(dB, vscale(upB, vdot(dB, upB))));
    const vBv = vadd(vscale(dBh, Math.sqrt(Math.max(vms * vms - s.vh * s.vh, 0)) / 1000), vscale(upB, s.vh / 1000));
    const M_ = bodyFixedToEcl('earth', tAbs), w = bodyOmegaEcl('earth', tAbs), r = mvec(M_, pB), vv = vadd(mvec(M_, vBv), vcross(w, r));
    const phase = s.seg === 'taem' ? (mach > 1 ? 'TAEM — supersonic glide' : 'TAEM — subsonic glide') : s.seg === 'hac' ? 'heading alignment cone' : s.seg === 'final' ? (s.x > xPf ? 'flare — inner glideslope' : 'final approach — outer glideslope') : (tq < tStop - 0.01 ? 'rollout' : 'wheel stop');
    samples.push({ t: tAbs, r, v: vv, m: opt.m, T: 0, thrDir: null, D: [0, 0, 0], alt: hAbs, q, mach, heat: 0, gload: 1 / Math.cos(bankS * DEG), phase, bank: bankS, alpha, _va: mvec(M_, vBv), _vs: vms, _vh: s.vh });
    if (!machOne && mach < 1) { machOne = true; events.push({ t: tAbs, name: 'Sonic booms', desc: `The orbiter slows below the speed of sound ${Math.round(hAbs)} km up. A moment later the twin “ba-boom” of its bow and tail shock waves rolls across ${rwy.short.split(' Runway')[0]}: the signal for spectators that the orbiter is coming in.`, kind: 'info' }); }
    if (!hacEv && s.seg === 'hac') { hacEv = true; events.push({ t: tAbs, name: 'Heading alignment cone', desc: `The orbiter banks into a ${Math.round(hac.dth * RAD)}° turn around an imaginary cone ${(rH).toFixed(1)} km in radius, spiralling down to line up with ${rwy.short}. The radius of the turn is the energy control: wider to fly a longer path, tighter to cut it short.`, kind: 'info' }); }
    if (!alEv && s.seg === 'final') { alEv = true; events.push({ t: tAbs, name: 'Approach and landing', desc: `On the centreline, ${(hAbs * 1000 / 0.3048 / 1000).toFixed(0)},000 ft up at 290 knots: the orbiter dives down the ${(ogs * RAD).toFixed(0)}° outer glideslope, about seven times steeper than an airliner’s, with the speed brake (the split rudder) holding the airspeed.`, kind: 'approach' }); }
    if (!pfEv && s.seg === 'final' && s.x > xPf) { pfEv = true; events.push({ t: tAbs, name: 'Preflare', desc: 'At 1,750 ft the commander pulls the nose up, flattening the dive onto the 1.5° inner glideslope.', kind: 'approach' }); }
    if (gearT == null && s.seg === 'final' && s.h < 0.09) { gearT = tAbs; events.push({ t: tAbs, name: 'Landing gear down', desc: 'The pilot arms and deploys the landing gear at about 300 ft — late, because the gear doors are part of the heat shield and the extended gear adds drag. Gravity and springs lower it in seconds.', kind: 'info' }); }
  }
  // drag (and on the runway, braking) from the along-path balance: dV/dt = −D/m − g·sin γ
  const Dacc = samples.map((s, i) => {
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
    const dVdt = b.t > a.t ? (b._vs - a._vs) / (b.t - a.t) : 0, sg = s._vs > 1 ? clamp(s._vh / s._vs, -1, 1) : 0;
    return Math.max(0, -dVdt - g * sg);
  });
  samples.forEach((s, i) => { if (vnorm(s._va) > 1e-9) s.D = vscale(vunit(s._va), -opt.m * Dacc[i]); delete s._va; delete s._vs; delete s._vh; });
  const roll0 = roll[0], tdV = vTD;
  events.push({ t: t0 + tTD, name: 'Main gear touchdown', desc: `${Math.round(tdV / 0.5144)} knots (${Math.round(tdV * 3.6)} km/h), ${Math.round(XTD * 1000 / 0.3048)} ft past the threshold of ${rwy.short}.`, kind: 'touchdown' });
  if (chuteT) events.push({ t: t0 + chuteT, name: 'Drag chute', desc: 'The 40-ft drag chute deploys from the base of the tail, cutting the rollout by about 2,000 ft and saving the brakes (used from 1992).', kind: 'chute' });
  events.push({ t: t0 + noseT, name: 'Nose gear touchdown', desc: 'The commander lowers the nose (derotation); the brakes come on below 140 knots.', kind: 'info' });
  if (chuteJet) events.push({ t: t0 + chuteJet, name: 'Drag chute jettisoned', desc: 'Released at about 60 knots so it cannot drag the orbiter off the centreline.', kind: 'jettison' });
  const rollDist = (roll[roll.length - 1].x - (roll0 ? roll0.x : XTD)) * 1000;
  events.push({ t: t0 + tStop, name: '“Wheel stop”', desc: `The orbiter rolls to a stop ${Math.round(rollDist)} m (${Math.round(rollDist / 0.3048)} ft) down the runway. Ground crews in protective suits check for toxic propellant vapour before the crew can leave, about an hour later.`, kind: 'landing' });
  const llOf = (px, py) => bfToLL(posBF(px, py, 0));
  return { samples, events, tTD: t0 + tTD, tStop: t0 + tStop, tGear: gearT || t0 + tTD - 15, tChute: chuteT ? t0 + chuteT : null, tChuteJet: chuteJet ? t0 + chuteJet : null, stopLL: llOf(roll[roll.length - 1].x, 0), tdLL: llOf(XTD, 0), hacTurn: hac.dth * RAD };
}
